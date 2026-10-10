import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { fitCharacteristics } from "../src/model/characteristicFitter.js";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { writeModel } from "../src/ltspice/modelWriter.js";

const temps = [100, 25, -40];
const beta = (t, ic) => 260 * ((t + 273.15) / 298.15) ** 1.7 / (1 + ic / 0.08);
const data = ["X\tY1\tY2\tY3", ...[0.001, 0.005, 0.01, 0.03, 0.09].map(ic => [ic, ...temps.map(t => beta(t, ic))].join("\t"))].join("\n");
const folder = await mkdtemp(path.join(tmpdir(), "bjt-temperature-"));
for (const variant of ["BJT-NPN", "BJT-PNP"]) {
  const fitted = fitCharacteristics(variant, { temperatureHfe: data, temperatureHfeTemperatures: temps.join(",") }, 25);
  const model = createDeviceModel({ deviceName: "DUT", variant, temperature: 25, spiceParameters: { ...fitted.parameters, VAF: 0 } });
  const sign = variant === "BJT-PNP" ? -1 : 1;
  const file = path.join(folder, `${variant}.cir`);
  await writeFile(file, `BJT temperature gain validation
${writeModel(model)}
VCE C 0 ${sign * 5}
VB B 0 0
Q1 C B 0 DUT
BGAIN GAIN 0 V=abs(I(VCE))/max(abs(I(VB)),1e-20)
RGAIN GAIN 0 1G
.step temp list ${temps.join(" ")}
.dc VB ${sign * 0.2} ${sign} ${sign * 0.0001}
.meas DC beta FIND V(GAIN) WHEN I(VCE)=${-sign * 0.01}
.end
`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.argv[2] || "C:\\Program Files\\ADI\\LTspice\\LTspice.exe", ["-b", file], { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => { child.kill(); reject(new Error("LTspice timeout")); }, 30000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`LTspice exit ${code}`)); });
  });
  const bytes = await readFile(file.replace(/\.cir$/, ".log"));
  const log = bytes.includes(0) ? bytes.toString("utf16le") : bytes.toString("utf8");
  assert.doesNotMatch(log, /failed|error|duplicate/i);
  const table = log.split(/Measurement: beta/i)[1];
  const values = [...table.matchAll(/^\s*([123])\s+([\d.e+-]+)\s+/gm)].map(match => Number(match[2]));
  assert.equal(values.length, 3);
  const sortedTemps = [...temps].sort((a, b) => a - b); // LTspice sorts temperature steps.
  values.forEach((value, index) => assert.ok(Math.abs(value / beta(sortedTemps[index], 0.01) - 1) < 0.002, `${variant} @${sortedTemps[index]}C: ${value}, expected ${beta(sortedTemps[index], 0.01)}`));
  console.log(`PASS ${variant}: native LTspice beta at -40 / 25 / 100°C (${values.join(", ")})`);
}
console.log(folder);
