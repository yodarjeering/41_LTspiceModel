import test from "node:test";
import assert from "node:assert/strict";
import { fitCharacteristics, parseCsvPoints, swapSeriesXY } from "../src/model/characteristicFitter.js";

test("CSV characteristic points are normalized",()=>{
  assert.deepEqual(parseCsvPoints("# VF, IF\n0.6, 0.01\n0.7 0.1",["VF","IF"]),[{VF:0.6,IF:0.01},{VF:0.7,IF:0.1}]);
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
test("BJT Gummel data produces BF",()=>{const fit=fitCharacteristics("BJT-NPN",{gummel:"0.55,0.001,0.00001\n0.62,0.01,0.0001"},27);assert.equal(Number(fit.parameters.BF),100);});
test("MOSFET transfer data produces threshold and KP",()=>{const fit=fitCharacteristics("MOSFET-NMOS-Basic",{transfer:"3,0.5\n4,2\n5,4.5"},27);assert.ok(Math.abs(Number(fit.parameters.VTO)-2)<1e-6);assert.ok(Number(fit.parameters.KP)>0);});
test("photocoupler transfer produces CTR and LED junction",()=>{const fit=fitCharacteristics("PhotoCoupler",{transfer:"0.001,0.0008\n0.01,0.008",led:"1.0,0.001\n1.2,0.01"},27);assert.ok(Math.abs(Number(fit.parameters.CTR)-0.8)<1e-6);assert.ok(Number(fit.parameters.IS)>0);});
test("BJT can be fitted from hFE-IC without VBE-IC",()=>{const fit=fitCharacteristics("BJT-NPN",{hfeIc:"0.001 100\n0.01 180\n0.1 120"},27);assert.equal(Number(fit.parameters.BF),180);assert.equal(fit.parameters.IS,undefined);assert.ok(fit.warnings.some(value=>value.includes("IS/N")));});
test("photocoupler can be fitted from IF-CTR only",()=>{const fit=fitCharacteristics("PhotoCoupler",{ifCtr:"0.001 0.5\n0.01 0.9"},27);assert.equal(Number(fit.parameters.CTR),0.7);assert.equal(fit.curves[0].name,"IF-CTR");assert.ok(fit.warnings.length);});
