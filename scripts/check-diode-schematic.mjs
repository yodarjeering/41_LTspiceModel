import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { buildPackage } from "../src/ltspice/packageWriter.js";
import { fitCharacteristics } from "../src/model/characteristicFitter.js";

const folder = await mkdtemp(path.join(tmpdir(), "diode-schematic-"));
for (const variant of ["Diode", "Diode-Zener", "Diode-Schottky"]) {
  const fit = fitCharacteristics(variant, { iv: "0.55 0.001\n0.62 0.01\n0.7 0.1", ...(variant === "Diode-Zener" ? { reverseIv: "1 1e-8\n5.1 0.001\n5.3 0.01" } : {}) });
  const model = createDeviceModel({ deviceName: variant.replaceAll("-", "_"), variant, spiceParameters: fit.parameters, characteristicCurves: fit.curves, variation: { k: 1, min: 0.8, max: 1.2 } });
  for (const [name, content] of Object.entries(buildPackage(model).files)) await writeFile(path.join(folder, path.basename(name)), content);
  const asc = path.join(folder, `${model.deviceName}_test.asc`);
  const netPath = asc.replace(/\.asc$/, ".net");
  for (const args of [["-netlist", asc], ["-b", netPath]]) await new Promise((resolve, reject) => {
    const child = spawn(process.argv[2] || "C:\\Program Files\\ADI\\LTspice\\LTspice.exe", args, { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => { child.kill(); reject(new Error("LTspice timeout")); }, 30000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`LTspice exit ${code}`)); });
  });
  const bytes = await readFile(asc.replace(/\.asc$/, ".log"));
  const log = bytes.includes(0) ? bytes.toString("utf16le") : bytes.toString("utf8");
  assert.doesNotMatch(log, /duplicate|error|failed/i);
  assert.match(log, /Measurement: if/i);
  assert.equal((log.match(/\.step k_/gi) || []).length, 3);
  const net = await readFile(asc.replace(/\.asc$/, ".net"), "utf8");
  assert.equal((net.match(new RegExp(`\\.include ${model.deviceName}\\.lib`, "gi")) || []).length, 1);
  assert.doesNotMatch(net, new RegExp(`^\\.lib .*${model.deviceName}\\.lib$`, "mi"));
  console.log(`PASS ${variant}: generated ASC, single library include, three variation corners`);
}
console.log(folder);
