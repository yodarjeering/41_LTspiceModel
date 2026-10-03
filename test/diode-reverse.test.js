import test from "node:test";
import assert from "node:assert/strict";
import { fitCharacteristics } from "../src/model/characteristicFitter.js";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { buildPackage } from "../src/ltspice/packageWriter.js";
const iv = "0.55 0.001\n0.62 0.01\n0.7 0.1";

test("reverse curves normalize units, sort points, and preserve independent forward fitting", () => {
  const basic = fitCharacteristics("Diode", { iv });
  const fit = fitCharacteristics("Diode-Schottky", { iv, reverseIv: "20000 20\n10000 10", reverseIvUnits: ["mV", "uA"] });
  assert.deepEqual(fit.parameters, basic.parameters);
  const curve = fit.curves.find(curve => curve.name === "IR-VR");
  assert.deepEqual(curve.points.map(point => point.VR), [10, 20]);
  curve.points.forEach((point, index) => assert.ok(Math.abs(point.IR - (index + 1) * 1e-5) < 1e-15));
});

test("reverse curve rejects ambiguous, negative, nonmonotonic and nonzero origin data", () => {
  for (const reverseIv of ["1 -1\n2 3", "1 1\n1 2", "1 2\n2 1", "0 1\n1 2"]) assert.throws(() => fitCharacteristics("Diode-Zener", { iv, reverseIv }));
});

test("reverse macro retains diode dynamic parameters, uses X pins, and exports DC comparisons", () => {
  const fit = fitCharacteristics("Diode-Zener", { iv, reverseIv: "1 1e-8\n5.1 0.001\n5.3 0.01", cjVr: "0 1e-10\n5 5e-11" });
  const model = createDeviceModel({ deviceName: "ZENER", variant: "Diode-Zener", spiceParameters: fit.parameters, characteristicCurves: fit.curves });
  const files = buildPackage(model).files;
  assert.equal(model.modelType, "SUBCKT");
  assert.equal(model.symbolBase, "zener");
  assert.match(files["ZENER_LTspice/ZENER.asy"], /SYMATTR Prefix X/);
  assert.match(files["ZENER_LTspice/ZENER_test.asc"], /SYMATTR InstName X1/);
  assert.match(files["ZENER_LTspice/ZENER.lib"], /DCORE J K/);
  assert.match(files["ZENER_LTspice/ZENER.lib"], /CJO=/);
  assert.match(files["ZENER_LTspice/ZENER_reverse.cir"], /\.meas DC/);
  assert.equal(Object.keys(JSON.parse(files["ZENER_LTspice/validation.json"]).tests).length, 1);
});

test("zener without reverse data reports missing breakdown calibration", () => {
  assert.ok(fitCharacteristics("Diode-Zener", { iv }).warnings.some(warning => warning.includes("降伏")));
});
