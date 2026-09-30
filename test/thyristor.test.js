import test from "node:test";
import assert from "node:assert/strict";
import { fitThyristor } from "../src/model/thyristorFitter.js";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { variationName } from "../src/model/modelSettings.js";
import { buildPackage } from "../src/ltspice/packageWriter.js";

test("one-point on-state calibration passes through the supplied point with an explicit intercept", () => {
  const fit = fitThyristor({ onMode: "point", VTO: 0.7, VTM: 1.3, ITM: 6 });
  assert.ok(Math.abs(fit.parameters.RD - 0.1) < 1e-12);
  assert.equal(fit.error, null);
  assert.ok(fit.warnings.some(message => message.includes("VTOを仮定")));
});

test("two on-state points recover intercept and slope", () => {
  const { parameters: p, curves } = fitThyristor({ onMode: "two", VTM: 1.1, ITM: 2, VTM2: 1.7, ITM2: 6 });
  assert.ok(Math.abs(p.VTO - 0.8) < 1e-12);
  assert.ok(Math.abs(p.RD - 0.15) < 1e-12);
  assert.equal(curves[0].points.length, 2);
});

test("direct on-state parameters do not depend on inactive measurement fields", () => {
  const { parameters: p, curves } = fitThyristor({ onMode: "direct", VTO: 0.9, RD: 0.025, VTM: "", ITM: "" });
  assert.equal(p.VTO, 0.9);
  assert.equal(p.RD, 0.025);
  assert.equal(curves.length, 0);
});

test("invalid currents, nonphysical fits, and unknown modes are rejected", () => {
  for (const input of [{ IGT: 0 }, { VGT: "" }, { IH: 0.03 }, { IDRM: 0.01 }, { IL: NaN }, { VTO: 1.3 }, { onMode: "two", ITM2: 2 }, { onMode: "two", VTM2: 4 }, { onMode: "direct", RD: -1 }, { onMode: "other" }]) assert.throws(() => fitThyristor(input));
});

test("triac quadrant currents fall back explicitly and QIV can be excluded", () => {
  const off = fitThyristor({ IGT_Q2: 0.025, IGT_Q3: "", IGT_Q4: "", q4Enabled: false }, "Triac").parameters;
  assert.equal(off.IGT_Q2, 0.025);
  assert.equal(off.IGT_Q3, off.IGT);
  assert.equal(off.IGT_Q4, null);
  const on = fitThyristor({ q4Enabled: true, IGT_Q4: 0.04 }, "Triac").parameters;
  assert.equal(on.IGT_Q4, 0.04);
});

test("package preserves electrical settings and applies holding-current variation to both IL and IH", () => {
  const model = createDeviceModel({ deviceName: "SCR", variant: "Thyristor", thyristorParameters: { IL: 0.03, IH: 0.015 }, variation: { target: "HOLDING", min: 0.8, max: 1.2 } });
  const { files } = buildPackage(model);
  const lib = files["SCR_LTspice/SCR.lib"];
  assert.ok(lib.includes(`I(VPOWER)>(0.03*${variationName(model)})`));
  assert.ok(lib.includes(`I(VPOWER)>(0.015*${variationName(model)})`));
  assert.equal(JSON.parse(files["SCR_LTspice/model.json"]).thyristorParameters.IH, 0.015);
  assert.match(files["SCR_LTspice/SCR_test.asc"], /BG 0 GATE I=V\(CMD\)/);
  assert.match(files["SCR_LTspice/README.txt"], /ラッチ/);
});
