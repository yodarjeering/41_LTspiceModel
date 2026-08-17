import test from "node:test";
import assert from "node:assert/strict";
import {
  fitCharacteristics,
  parameterMappings,
  parseCsvPoints,
  parseTemperaturePoints,
  swapSeriesXY
} from "../src/model/characteristicFitter.js";

test("CSV characteristic points are normalized",()=>{
  assert.deepEqual(parseCsvPoints("# VF, IF\n0.6, 0.01\n0.7 0.1",["VF","IF"]),[{VF:0.6,IF:0.01},{VF:0.7,IF:0.1}]);
});
test("non-numeric header and annotation lines are ignored",()=>{
  const text="X Y1\nVF[V] IF[A]\nCurve 1\n0.6 0.01\ninvalid data\n0.7 0.1";
  assert.deepEqual(parseCsvPoints(text,["VF","IF"]),[{VF:0.6,IF:0.01},{VF:0.7,IF:0.1}]);
});
test("one or more spaces and tabs delimit series data",()=>{
  assert.deepEqual(parseCsvPoints("0.6  0.01\n0.7\t0.1",["VF","IF"]),[{VF:0.6,IF:0.01},{VF:0.7,IF:0.1}]);
});
test("indented tab-separated pasted graph data is accepted",()=>{
  const text="      0.903005\t      1.082136\n      0.906421\t      1.098647\n      0.909836\t      1.115770";
  assert.deepEqual(parseCsvPoints(text,["X","Y"]),[{X:0.903005,Y:1.082136},{X:0.906421,Y:1.098647},{X:0.909836,Y:1.11577}]);
});
test("a flattened numeric stream is regrouped by the expected column count",()=>{
  assert.deepEqual(parseCsvPoints("0.1 1.0 0.2 2.0 0.3 3.0",["X","Y"]),[{X:0.1,Y:1},{X:0.2,Y:2},{X:0.3,Y:3}]);
});
test("full-width spaces and Fortran D exponents are accepted",()=>{
  assert.deepEqual(parseCsvPoints("1.0D-3　2.0D+0\n2.0D-3　3.0D+0",["X","Y"]),[{X:0.001,Y:2},{X:0.002,Y:3}]);
});
test("series X and Y can be swapped without changing a third column",()=>{
  assert.equal(swapSeriesXY("0.001 0.55 0.00001\n0.01 0.62 0.0001",3),"0.55 0.001 0.00001\n0.62 0.01 0.0001");
});
test("flattened two-column data can also be swapped",()=>{assert.equal(swapSeriesXY("1 10 2 20 3 30"),"10 1\n20 2\n30 3");});
test("diode IF-VF produces IS and N",()=>{const fit=fitCharacteristics("Diode",{iv:"0.55,0.001\n0.62,0.01\n0.69,0.1"},27);assert.ok(Number(fit.parameters.IS)>0);assert.ok(Number(fit.parameters.N)>0);assert.equal(fit.curves[0].points.length,3);});
test("diode fitting separates exponential behavior and series resistance",()=>{
  const is=1e-9,n=1.5,rs=0.02,vt=0.0256926;
  const currents=[1e-4,1e-3,1e-2,0.1,1,5];
  const data=currents.map(current=>`${n*vt*Math.log(current/is)+current*rs} ${current}`).join("\n");
  const fit=fitCharacteristics("Diode",{iv:data},27);
  assert.ok(Math.abs(Number(fit.parameters.N)-n)<1e-5);
  assert.ok(Math.abs(Number(fit.parameters.RS)-rs)<1e-5);
  assert.ok(Math.abs(Math.log(Number(fit.parameters.IS)/is))<1e-5);
});
test("BJT Gummel data produces BF",()=>{const fit=fitCharacteristics("BJT-NPN",{gummel:"0.55,0.001,0.00001\n0.62,0.01,0.0001"},27);assert.equal(Number(fit.parameters.BF),100);});
test("MOSFET transfer data produces threshold and KP",()=>{const fit=fitCharacteristics("MOSFET-NMOS-Basic",{transfer:"3,0.5\n4,2\n5,4.5"},27);assert.ok(Math.abs(Number(fit.parameters.VTO)-2)<1e-6);assert.ok(Number(fit.parameters.KP)>0);});
test("photocoupler transfer produces CTR and LED junction",()=>{const fit=fitCharacteristics("PhotoCoupler",{transfer:"0.001,0.0008\n0.01,0.008",led:"1.0,0.001\n1.2,0.01"},27);assert.ok(Math.abs(Number(fit.parameters.CTR)-0.8)<1e-6);assert.ok(Number(fit.parameters.IS)>0);});
test("BJT can be fitted from hFE-IC without VBE-IC",()=>{const fit=fitCharacteristics("BJT-NPN",{hfeIc:"0.001 100\n0.01 180\n0.1 120"},27);assert.equal(Number(fit.parameters.BF),180);assert.equal(fit.parameters.IS,undefined);assert.ok(fit.warnings.some(value=>value.includes("IS/N")));});
test("photocoupler can be fitted from IF-CTR only",()=>{const fit=fitCharacteristics("PhotoCoupler",{ifCtr:"0.001 0.5\n0.01 0.9"},27);assert.equal(Number(fit.parameters.CTR),0.7);assert.equal(fit.curves[0].name,"IF-CTR");assert.ok(fit.warnings.length);});

test("datasheet-to-SPICE mapping separates basic and optional stages",()=>{
  assert.deepEqual(parameterMappings.Diode.find(item=>item.key==="iv").parameters,["IS","N","RS"]);
  assert.deepEqual(parameterMappings.Diode.find(item=>item.key==="cjVr").parameters,["CJO","VJ","M"]);
  assert.deepEqual(parameterMappings.Diode.find(item=>item.key==="temperatureIv").parameters,["EG","XTI","TNOM"]);
  assert.equal(parameterMappings.Diode.find(item=>item.key==="reverseRecovery").stage,"switching");
});

test("optional parameters are absent when optional data is empty",()=>{
  const fit=fitCharacteristics("Diode",{iv:"0.55 0.001\n0.62 0.01\n0.69 0.1",cjVr:"",temperatureIv:"",reverseRecovery:""},27);
  for(const key of ["CJO","VJ","M","EG","XTI","TNOM","TT"])assert.equal(fit.parameters[key],undefined);
});

test("diode optional capacitance and switching data add parameters",()=>{
  const fit=fitCharacteristics("Diode",{
    iv:"0.55 0.001\n0.62 0.01\n0.69 0.1",
    cjVr:"0 100e-12\n5 50e-12\n10 35e-12",
    reverseRecovery:"0.1 20e-9\n0.2 30e-9"
  },27);
  assert.ok(Number(fit.parameters.CJO)>0);
  assert.ok(Number(fit.parameters.VJ)>0);
  assert.ok(Number(fit.parameters.M)>0);
  assert.equal(Number(fit.parameters.TT),25e-9);
  assert.equal(fit.parameterSources.CJO,"Cj-VR");
});

test("MOSFET capacitance data is converted to terminal capacitances",()=>{
  const fit=fitCharacteristics("MOSFET-NMOS-Basic",{
    transfer:"3 0.5\n4 2\n5 4.5",
    outputCapacitance:"1 1000e-12 500e-12 100e-12\n10 800e-12 400e-12 80e-12"
  },27);
  assert.ok(Number(fit.parameters.CGS)>0);
  assert.ok(Number(fit.parameters.CGD)>0);
  assert.ok(Number(fit.parameters.CBD)>0);
});

test("MOSFET temperature curves add temperature coefficients",()=>{
  const fit=fitCharacteristics("MOSFET-NMOS-Basic",{
    transfer:"3 0.5\n4 2\n5 4.5",
    temperatureTransfer:[
      "25 3 0.5","25 4 2","25 5 4.5",
      "100 2.8 0.4","100 3.8 1.6","100 4.8 3.6"
    ].join("\n")
  },25);
  assert.ok(Number.isFinite(Number(fit.parameters.TCV)));
  assert.ok(Number.isFinite(Number(fit.parameters.BEX)));
  assert.equal(Number(fit.parameters.TNOM),25);
});

test("wide temperature data preserves blank tab-separated cells and applies units",()=>{
  const points=parseTemperaturePoints([
    "X\tY1\tY2\tY3",
    "0.55\t0.1\t\t4.8",
    "0.60\t0.25\t2.0\t6.3"
  ].join("\n"),{xKey:"VF",yKey:"IF",temperatures:"25, 65, 105",yUnit:"mA"});
  assert.deepEqual(points,[
    {TEMP:25,VF:0.55,IF:0.0001},
    {TEMP:105,VF:0.55,IF:0.0048},
    {TEMP:25,VF:0.6,IF:0.00025},
    {TEMP:65,VF:0.6,IF:0.002},
    {TEMP:105,VF:0.6,IF:0.0063}
  ]);
});

test("temperatures can be read from descriptive wide headers",()=>{
  const points=parseTemperaturePoints([
    "VF[V]\tIF@25C[mA]\tIF@105C[mA]",
    "0.55\t0.1\t4.8",
    "0.60\t0.25\t6.3"
  ].join("\n"),{xKey:"VF",yKey:"IF",yUnit:"mA"});
  assert.deepEqual([...new Set(points.map(point=>point.TEMP))],[25,105]);
});

test("two diode temperature curves constrain EG and fit XTI",()=>{
  const fit=fitCharacteristics("Diode",{
    iv:"0.55 0.001\n0.62 0.01\n0.69 0.1",
    temperatureIv:[
      "X\tY1\tY2",
      "0.55\t1\t4",
      "0.62\t10\t40",
      "0.69\t100\t400"
    ].join("\n"),
    temperatureIvTemperatures:"25, 105",
    temperatureIvUnit:"mA"
  },25);
  assert.equal(Number(fit.parameters.EG),1.11);
  assert.ok(Number.isFinite(Number(fit.parameters.XTI)));
  assert.ok(fit.warnings.some(value=>value.includes("EG=1.11")));
});
