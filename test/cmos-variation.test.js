import test from "node:test";
import assert from "node:assert/strict";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { validateCmos, validateVariation, variationName } from "../src/model/modelSettings.js";
import { buildPackage } from "../src/ltspice/packageWriter.js";

const generate = input => {
  const model = createDeviceModel({ deviceName: "DUT", variant: "PhotoCoupler-CMOS", ...input });
  const pkg = buildPackage(model);
  return { model, lib: pkg.files["DUT_LTspice/DUT.lib"], asc: pkg.files["DUT_LTspice/DUT_test.asc"], files: pkg.files };
};

test("CMOS datasheet mode is self-contained and preserves settings", () => {
  const { model, lib, asc, files } = generate({ cmosParameters: { VCC: 3.3, VOH: 3, IF_ON: 0.002 } });
  assert.equal(model.variation.k, 1);
  assert.equal(model.cmosParameters.IF_ON, 0.002);
  assert.match(lib, /SCHMITT/);
  assert.match(lib, /BHI VCC OUT/);
  assert.match(lib, /LOGIC GND GND SCHMITT/);
  assert.doesNotMatch(lib, /\.include/);
  assert.doesNotMatch(asc, /\.step/);
  assert.match(asc, /VCC VCC 0 3.3/);
  assert.equal(JSON.parse(files["DUT_LTspice/model.json"]).cmosParameters.VCC, 3.3);
});

test("CMOS polarity and timing variation configure the behavioral gate", () => {
  const { model, lib, asc } = generate({ cmosParameters: { inverting: false }, variation: { target: "TIMING", min: 0.8, max: 1.2 } });
  assert.match(lib, /GND LOGIC GND SCHMITT/);
  assert.ok(lib.includes(`Td={(${model.cmosParameters.TD}*${variationName(model)})}`));
  assert.ok(asc.includes(`.step param ${variationName(model)} list 0.8 1 1.2`));
});

test("invalid CMOS electrical settings are rejected", () => {
  for (const parameters of [{ IF_OFF: 0.002 }, { VOH: 5.1 }, { VOL: 4.6 }, { IOH: 0 }, { TD: -1 }, { TR: 0 }, { VF: "" }, { VCC: Infinity }]) {
    assert.throws(() => validateCmos(parameters));
  }
});

test("variation supports optional bounds, deduplicates corners, and rejects invalid ranges", () => {
  assert.deepEqual(validateVariation({}, "Diode"), { k: 1, min: null, max: null, target: "IS" });
  assert.equal(validateVariation({ min: "", max: "1.5" }, "Diode").max, 1.5);
  const { asc } = generate({ variation: { min: 1, max: 1 } });
  assert.doesNotMatch(asc, /\.step/);
  for (const variation of [{ k: 0 }, { min: 1.1 }, { max: 0.9 }, { k: "no" }, { target: "BF" }]) assert.throws(() => validateVariation(variation, "PhotoCoupler-CMOS"));
  assert.throws(() => validateVariation({ min: 0.8 }, "PhotoMOS-Relay", true), /外部/);
});

test("discrete models scale only the selected coefficient", () => {
  const { model, lib } = generate({ variant: "BJT-NPN", spiceParameters: { BF: 120, IS: "1e-14" }, variation: { k: 1.2 } });
  assert.ok(lib.includes(`BF={(120)*${variationName(model)}}`));
  assert.match(lib, /IS=1e-14/);
  assert.ok(lib.includes(`.param ${variationName(model)}=1.2`));
});

test("CTR table is scaled as well as constant CTR", () => {
  const { model, lib } = generate({ variant: "PhotoCoupler", variation: { min: 0.5 }, characteristicCurves: [{ name: "IF-CTR", points: [{ IF: 0.001, CTR: 0.5 }, { IF: 0.01, CTR: 1 }] }] });
  assert.ok(lib.includes(`))*${variationName(model)}`));
  assert.match(lib, /0.001,0.5, 0.01,1/);
});
