import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { buildPackage } from "../src/ltspice/packageWriter.js";

const folder = await mkdtemp(path.join(tmpdir(), "scr-validation-"));
const model = createDeviceModel({ deviceName: "SCR_NORMAL", variant: "Thyristor", thyristorParameters: {
  modelLevel: "normal", IGT: 0.01, VGT: 0.8, IL: 0.02, IH: 0.01, VT0: 0.8, Ron: 0.1
} });
for (const [name, content] of Object.entries(buildPackage(model).files)) await writeFile(path.join(folder, path.basename(name)), content);
console.log(folder);
