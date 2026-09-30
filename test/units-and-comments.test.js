import test from "node:test";
import assert from "node:assert/strict";
import { fitCharacteristics, normalizeInputUnits } from "../src/model/characteristicFitter.js";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { buildPackage } from "../src/ltspice/packageWriter.js";

test("mV/mA inputs fit the same diode as V/A", () => {
  const base = fitCharacteristics("Diode", { iv: "0.55 0.001\n0.62 0.01\n0.70 0.1" });
  const milli = fitCharacteristics("Diode", { iv: "550 1\n620 10\n700 100", ivUnits: ["mV", "mA"] });
  assert.deepEqual(milli.parameters, base.parameters);
});

test("wide temperature series scale both axes once and preserve missing cells", () => {
  const data = normalizeInputUnits("MOSFET-NMOS-Basic", {
    temperatureTransfer: "2500\t50\t40\n3000\t250\t\n4000\t1000\t800",
    temperatureTransferTemperatures: "25,85", temperatureTransferUnits: ["mV", "mA"]
  });
  assert.equal(data.temperatureTransfer, "25 2.5 0.05\n85 2.5 0.04\n25 3 0.25\n25 4 1\n85 4 0.8");
  assert.equal(data.temperatureTransferTemperatures, "");
  assert.equal(data.temperatureTransferUnit, "A");
});

test("current/current and percentage series use independent unit scales", () => {
  const fit = fitCharacteristics("PhotoCoupler", { transfer: "1 0.002\n2 0.004", transferUnits: ["mA", "A"] });
  assert.equal(Number(fit.parameters.CTR), 2);
  const percent = fitCharacteristics("PhotoCoupler", { ifCtr: "1 50\n2 70", ifCtrUnits: ["mA", "%"] });
  assert.equal(Number(percent.parameters.CTR), 0.6);
  assert.throws(() => fitCharacteristics("Diode", { iv: "1 2\n3 4", ivUnits: ["A", "A"] }), /単位/);
});

test("multiline comments survive export without becoming SPICE directives", () => {
  const comment = "測定条件\n.end\n温度 25℃";
  const model = createDeviceModel({ variant: "Diode", deviceName: "DUT", comment });
  const { files } = buildPackage(model);
  assert.equal(JSON.parse(files["DUT_LTspice/model.json"]).comment, comment);
  assert.ok(files["DUT_LTspice/README.txt"].includes(comment));
  assert.ok(files["DUT_LTspice/DUT.lib"].includes("* .end\n"));
  assert.doesNotMatch(files["DUT_LTspice/DUT.lib"], /^\.end$/m);
});

test("SCR and triac expose datasheet-calibrated state models without claiming measured accuracy", () => {
  for (const variant of ["Thyristor", "Triac"]) {
    assert.equal(fitCharacteristics(variant, {}).error, null);
    const { files } = buildPackage(createDeviceModel({ variant, deviceName: "DUT" }));
    const lib = files["DUT_LTspice/DUT.lib"];
    assert.match(lib, /VGATE G GI 0/);
    assert.match(lib, /CSTATEP STATEP REF 10n/);
    assert.match(lib, /BSTATEP REF STATEP/);
    assert.match(files["DUT_LTspice/DUT_test.asc"], /\.tran 0 60m/);
    if (variant === "Triac") assert.match(lib, /CSTATEN STATEN REF 10n/);
  }
});

test("external models preserve the supplied library and map vendor pin order", () => {
  const externalModel = { libraryPath: "C:\\Models\\vendor.lib", subcircuit: "VENDOR", pinOrder: ["T2", "T1", "K", "A"] };
  const make = external => buildPackage(createDeviceModel({ variant: "PhotoMOS-Relay", deviceName: "MY_RELAY", externalModel: external }));
  const pkg = make(externalModel);
  assert.match(pkg.files["MY_RELAY_LTspice/MY_RELAY.lib"], /XCORE T2 T1 K A VENDOR/);
  assert.ok(pkg.files["MY_RELAY_LTspice/MY_RELAY.lib"].includes('.include "C:\\Models\\vendor.lib"'));
  assert.equal(Object.keys(pkg.files).length, 5);
  assert.throws(() => make(null), /パス/);
  assert.throws(() => make({ ...externalModel, subcircuit: "MY_RELAY" }), /異なる名前/);
  assert.throws(() => make({ ...externalModel, pinOrder: ["A", "K", "T1", "T1"] }), /1回ずつ/);
  assert.throws(() => make({ ...externalModel, libraryPath: "bad\n.end" }), /パス/);
});
