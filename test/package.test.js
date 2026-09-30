import test from "node:test";
import assert from "node:assert/strict";
import { createDeviceModel as createRawDeviceModel, deviceOptions } from "../src/model/deviceModel.js";
import { buildPackage } from "../src/ltspice/packageWriter.js";

const expected={
  "PhotoMOS-Relay":["SUBCKT","X",["A","K","T1","T2"]], "PhotoCoupler-CMOS":["SUBCKT","X",["A","K","VCC","GND","OUT"]],
  Thyristor:["SUBCKT","X",["A","G","K"]], Triac:["SUBCKT","X",["T2","G","T1"]],
  Diode:["MODEL","D",["A","K"]], "BJT-NPN":["MODEL","Q",["C","B","E"]], "BJT-PNP":["MODEL","Q",["C","B","E"]],
  "MOSFET-NMOS-Basic":["MODEL","M",["D","G","S"]], "MOSFET-PMOS-Basic":["MODEL","M",["D","G","S"]],
  "MOSFET-NMOS-Advanced":["SUBCKT","X",["D","G","S"]], "MOSFET-PMOS-Advanced":["SUBCKT","X",["D","G","S"]], PhotoCoupler:["SUBCKT","X",["A","K","C","E"]]
};
function createDeviceModel(input) {
  const model = createRawDeviceModel(input);
  if (["PhotoMOS-Relay", "PhotoCoupler-CMOS"].includes(input.variant)) {
    model.externalModel = { libraryPath: "vendor.lib", subcircuit: "VENDOR_DEVICE", pinOrder: model.pins.map(pin => pin.name) };
  }
  return model;
}
function zipNames(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), decoder=new TextDecoder(); let at=0; const names=[];
  while(at+30<=bytes.length && view.getUint32(at,true)===0x04034b50){const size=view.getUint32(at+18,true),nl=view.getUint16(at+26,true),el=view.getUint16(at+28,true);names.push(decoder.decode(bytes.slice(at+30,at+30+nl)));at+=30+nl+el+size;} return names;
}
for(const variant of deviceOptions)test(`${variant} creates a linked, ordered package`,()=>{
  const [type,prefix,pins]=expected[variant], model=createDeviceModel({deviceName:"TESTDEV",variant,generatedAt:"2026-08-11T00:00:00.000Z"}), pkg=buildPackage(model), root="TESTDEV_LTspice/";
  assert.equal(model.modelType,type); assert.deepEqual(model.pins.map(p=>p.name),pins);
  const lib=pkg.files[`${root}TESTDEV.lib`], asy=pkg.files[`${root}TESTDEV.asy`], asc=pkg.files[`${root}TESTDEV_test.asc`];
  assert.match(asy,new RegExp(`SYMATTR Prefix ${prefix}`)); assert.match(asy,/SYMATTR Value TESTDEV/); assert.match(asy,/SYMATTR ModelFile TESTDEV\.lib/);
  assert.match(asy,/PIN .* NONE 0/);
  pins.forEach((name,i)=>assert.match(asy,new RegExp(`PINATTR PinName ${name}\\nPINATTR SpiceOrder ${i+1}`)));
  if(type==="SUBCKT") assert.match(lib,new RegExp(`\\.SUBCKT TESTDEV ${pins.join(" ")}`)); else assert.match(lib,/\.model TESTDEV/);
  assert.match(asc,/SYMBOL TESTDEV/); assert.deepEqual(zipNames(pkg.bytes),[`${root}TESTDEV.lib`,`${root}TESTDEV.asy`,`${root}TESTDEV_test.asc`,`${root}model.json`,`${root}README.txt`]);
});

test("model metadata is preserved",()=>{
  const model=createDeviceModel({deviceName:"DUT",variant:"Diode",temperature:85,fittingError:0.012,spiceParameters:{IS:"2e-9"},characteristicCurves:[{name:"IF-VF",points:[[0.6,0.01]]}],generatedAt:"2026-08-11T00:00:00.000Z"});
  const json=JSON.parse(buildPackage(model).files["DUT_LTspice/model.json"]); assert.equal(json.temperature,85);assert.equal(json.spiceParameters.IS,"2e-9");assert.equal(json.characteristicCurves[0].name,"IF-VF");
});

test("diode test schematic wires land on source and generated symbol pins",()=>{
  const model=createDeviceModel({deviceName:"TEST",variant:"Diode",generatedAt:"2026-08-11T00:00:00.000Z"});
  const asc=buildPackage(model).files["TEST_LTspice/TEST_test.asc"];
  assert.match(asc,/SYMBOL voltage 160 160 R0/);
  assert.match(asc,/SYMBOL TEST 464 176 R0/);
  assert.match(asc,/TEXT 480 400 Left 2 !\.include TEST\.lib/);
  assert.match(asc,/SYMBOL res 384 112 R90/);
  assert.match(asc,/SYMATTR Value 10m/);
  assert.match(asc,/WIRE 288 128 160 128/); // source positive to resistor
  assert.match(asc,/WIRE 480 272 480 240/); // diode cathode to return
});

test("N-type and P-type fixtures share geometry and reverse sweep polarity",()=>{
  const fixture = variant => {
    const model=createDeviceModel({deviceName:"DUT",variant,generatedAt:"2026-08-11T00:00:00.000Z"});
    return buildPackage(model).files["DUT_LTspice/DUT_test.asc"];
  };

  const npn=fixture("BJT-NPN"),pnp=fixture("BJT-PNP");
  assert.match(npn,/WIRE 416 64 160 64/);
  assert.match(pnp,/WIRE 416 64 160 64/);
  assert.match(npn,/\.dc VCE 0 10 0\.1 VB 0 1 0\.05/);
  assert.match(pnp,/\.dc VCE 0 -10 -0\.1 VB 0 -1 -0\.05/);
  assert.match(pnp,/;Plot I\(VCE\) for Ic-Vce curves/);

  const nmos=fixture("MOSFET-NMOS-Basic"),pmos=fixture("MOSFET-PMOS-Basic");
  assert.match(nmos,/WIRE 400 64 160 64/);
  assert.match(pmos,/WIRE 400 64 160 64/);
  assert.match(nmos,/\.dc VDS 0 10 0\.1 VGS 0 10 1/);
  assert.match(pmos,/\.dc VDS 0 -10 -0\.1 VGS 0 -10 -1/);
  assert.match(pmos,/;Plot I\(VDS\) for Id-Vds curves/);
});

test("generated geometry matches the selected LTspice generic symbol",()=>{
  const cases={Diode:["LINE Normal 0 44 32 44","PIN 16 0 NONE 0"],"BJT-NPN":["LINE Normal 44 76 36 84","PIN 64 0 NONE 0"],"BJT-PNP":["LINE Normal 16 64 44 76","PIN 64 96 NONE 0"],"MOSFET-NMOS-Basic":["LINE Normal 40 48 48 48","PIN 48 0 NONE 0"],"MOSFET-PMOS-Basic":["LINE Normal 16 48 24 48","PIN 0 80 NONE 0"],PhotoCoupler:["RECTANGLE Normal -96 -64 96 64","PIN -96 -48 NONE 0"]};
  for(const [variant,needles] of Object.entries(cases)){const model=createDeviceModel({deviceName:"DUT",variant,generatedAt:"2026-08-11T00:00:00.000Z"}),asy=buildPackage(model).files["DUT_LTspice/DUT.asy"];needles.forEach(needle=>assert.ok(asy.includes(needle),`${variant}: ${needle}`));}
});

test("IF-CTR curve is emitted as an LTspice behavioral table",()=>{
  const model=createDeviceModel({deviceName:"PCX",variant:"PhotoCoupler",spiceParameters:{CTR:"0.7"},characteristicCurves:[{name:"IF-CTR",points:[{IF:0.001,CTR:0.5},{IF:0.01,CTR:0.9}]}],generatedAt:"2026-08-11T00:00:00.000Z"});
  const lib=buildPackage(model).files["PCX_LTspice/PCX.lib"];
  assert.match(lib,/table\(max\(I\(DLED\),0\), 0\.001,0\.5, 0\.01,0\.9\)/);
});

test("optional model parameters are not emitted without source data",()=>{
  const cases=[
    ["Diode",/\b(CJO|VJ|M|TT|EG|XTI|TNOM)=/],
    ["BJT-NPN",/\b(CJE|CJC|TF|TR|EG|XTI|TNOM)=/],
    ["MOSFET-NMOS-Basic",/\b(CGS|CGD|CBD|TNOM)=/]
  ];
  for(const [variant,optionalPattern] of cases){
    const model=createDeviceModel({deviceName:"DUT",variant,generatedAt:"2026-08-11T00:00:00.000Z"});
    const lib=buildPackage(model).files["DUT_LTspice/DUT.lib"];
    assert.doesNotMatch(lib,optionalPattern,variant);
  }
});

test("every test schematic explicitly includes its generated model library",()=>{
  for(const variant of deviceOptions){
    const model=createDeviceModel({deviceName:"RB1LAM",variant,generatedAt:"2026-08-11T00:00:00.000Z"});
    const asc=buildPackage(model).files["RB1LAM_LTspice/RB1LAM_test.asc"];
    assert.match(asc,/!\.include RB1LAM\.lib/,variant);
  }
});
