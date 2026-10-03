import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fitCharacteristics, characteristicInputs } from "../src/model/characteristicFitter.js";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { buildPackage } from "../src/ltspice/packageWriter.js";

const folder = await mkdtemp(path.join(tmpdir(), "diode-validation-"));
for (const variant of ["Diode", "Diode-Zener", "Diode-Schottky"]) {
  const target = path.join(folder, variant);
  await mkdir(target);
  const data = { iv: characteristicInputs[variant].find(field => field.key === "iv").sample,
    reverseIv: variant === "Diode-Zener" ? "1 1e-8\n4 5e-8\n4.8 1e-4\n5.1 1e-3\n5.3 1e-2" : "1 1e-6\n10 5e-6\n20 1e-5" };
  const fit = fitCharacteristics(variant, data);
  const model = createDeviceModel({ deviceName: "DUT", variant, spiceParameters: fit.parameters, characteristicCurves: fit.curves });
  for (const [name, content] of Object.entries(buildPackage(model).files)) await writeFile(path.join(target, path.basename(name)), content);
  console.log(target);
}
