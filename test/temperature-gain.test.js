import test from "node:test";
import assert from "node:assert/strict";
import { fitCharacteristics, parseTemperaturePoints, temperatureColumnCount } from "../src/model/characteristicFitter.js";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { buildPackage } from "../src/ltspice/packageWriter.js";

test("Curve Data Copy retains missing leading, interior and trailing Y cells", () => {
  const text = "X\tY1\tY2\tY3\n0.0008\t\t260.745\t\n0.005\t351.517\t260.507\t\n0.01\t342.343\t253.941\t161.928\n0.09\t117.049\t\t100.93";
  assert.equal(temperatureColumnCount(text), 3);
  const points = parseTemperaturePoints(text, { xKey: "IC", yKey: "hFE", temperatures: "100,25,-40" });
  assert.equal(points.length, 8);
  assert.deepEqual(points[0], { TEMP: 25, IC: 0.0008, hFE: 260.745 });
  assert.deepEqual(points.at(-1), { TEMP: -40, IC: 0.09, hFE: 100.93 });
  assert.ok(!points.some(p => p.hFE === 0));
  assert.throws(() => parseTemperaturePoints(text, { xKey: "IC", yKey: "hFE", temperatures: "100,,25,-40" }));
  assert.throws(() => parseTemperaturePoints(text, { xKey: "IC", yKey: "hFE", temperatures: "100,25" }));
});

test("complete whitespace rows work, ambiguous missing whitespace columns fail", () => {
  const options = { xKey: "IC", yKey: "hFE", temperatures: "100,25,-40" };
  assert.equal(parseTemperaturePoints("X Y1 Y2 Y3\n0.01 350 260 160\n0.02 300 240 158", options).length, 6);
  assert.throws(() => parseTemperaturePoints("X Y1 Y2 Y3\n0.01     260\n0.02 300 240 158", options));
  for (const temperatures of ["100,25,25", "100,NaN,-40", "100,25,-300"]) assert.throws(() => parseTemperaturePoints("X Y1 Y2 Y3\n0.01 350 260 160\n0.02 300 240 158", { ...options, temperatures }));
});

test("multi-temperature gain data alone recovers BF, XTB and IKF and exports native model parameters", () => {
  const temps = [100, 25, -40], bf = 260, xtb = 1.7, ikf = 0.08;
  const text = ["X\tY1\tY2\tY3", ...[0.001, 0.005, 0.01, 0.03, 0.09].map(ic => [ic * 1000, ...temps.map(t => bf * ((t + 273.15) / 298.15) ** xtb / (1 + ic / ikf))].join("\t"))].join("\n");
  for (const variant of ["BJT-NPN", "BJT-PNP"]) {
    const fit = fitCharacteristics(variant, { temperatureHfe: text, temperatureHfeTemperatures: temps.join(","), temperatureHfeUnits: ["mA", "ratio"] }, 25);
    assert.ok(Math.abs(Number(fit.parameters.BF) - bf) < 0.01);
    assert.ok(Math.abs(Number(fit.parameters.XTB) - xtb) < 0.0001);
    assert.ok(Math.abs(Number(fit.parameters.IKF) - ikf) < 0.00001);
    assert.equal(Number(fit.parameters.TNOM), 25);
    const curve = fit.curves.find(c => c.name === "hFE-IC @ temperature");
    assert.equal(curve.points.length, 15);
    assert.ok(curve.relativeRmse < 1e-6);
    const model = createDeviceModel({ deviceName: "TEMPGAIN", variant, spiceParameters: fit.parameters, characteristicCurves: fit.curves });
    assert.match(buildPackage(model).files["TEMPGAIN_LTspice/TEMPGAIN.lib"], /XTB=1.7/);
  }
});

test("temperature gain data rejects nonphysical points and insufficient series", () => {
  for (const temperatureHfe of ["25 0.01 -100\n25 0.02 100\n100 0.01 200\n100 0.02 200", "25 0.01 100\n25 0.02 100", "25 0.01 100\n100 0.01 200\n100 0.02 200"]) {
    assert.throws(() => fitCharacteristics("BJT-NPN", { temperatureHfe }));
  }
});
