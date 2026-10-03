import { readFile, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const folder = path.resolve(process.argv[2] || ".");
const executable = process.argv[3] || "C:\\Program Files\\ADI\\LTspice\\LTspice.exe";
const manifest = JSON.parse(await readFile(path.join(folder, "validation.json"), "utf8"));
const results = [];
for (const [file, checks] of Object.entries(manifest.tests)) {
  if (path.basename(file) !== file || !file.endsWith(".cir")) throw new Error("Invalid fixture filename");
  await rm(path.join(folder, file.replace(/\.cir$/, ".log")), { force: true });
  await new Promise((resolve, reject) => {
    const child = spawn(executable, ["-b", path.join(folder, file)], { windowsHide: true, stdio: "ignore" });
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${file}: simulation timeout`)); }, 30000);
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("exit", code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`${file}: exit ${code}`)); });
  });
  const bytes = await readFile(path.join(folder, file.replace(/\.cir$/, ".log")));
  const log = bytes.includes(0) ? bytes.toString("utf16le").replace(/^\uFEFF/, "") : bytes.toString("utf8");
  for (const check of checks) {
    const line = log.split(/\r?\n/).find(line => line.trim().toLowerCase().startsWith(`${check.name.toLowerCase()}:`));
    const value = Number(line?.match(/=\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i)?.[1]);
    const passed = Number.isFinite(value) && Math.abs(value - check.expected) <= check.absoluteTolerance;
    results.push({ file, ...check, value: Number.isFinite(value) ? value : null, passed });
    console.log(`${passed ? "PASS" : "FAIL"} ${file} ${check.name}: ${value} (expected ${check.expected})`);
  }
}
await writeFile(path.join(folder, "validation-results.json"), JSON.stringify(results, null, 2) + "\n");
if (results.some(result => !result.passed)) process.exitCode = 1;
