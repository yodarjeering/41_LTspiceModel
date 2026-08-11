import { assertDeviceModel } from "../model/deviceModel.js";
import { writeModel } from "./modelWriter.js";
import { writeSymbol } from "./symbolWriter.js";
import { writeTestSchematic } from "./ascWriter.js";
import { writeJson } from "../export/jsonWriter.js";
import { writeReadme } from "../export/readmeWriter.js";
import { createZip } from "../export/zipWriter.js";

export function buildPackage(model) {
  assertDeviceModel(model);
  const root=`${model.deviceName}_LTspice/`;
  const files={
    [`${root}${model.deviceName}.lib`]: writeModel(model),
    [`${root}${model.deviceName}.asy`]: writeSymbol(model),
    [`${root}${model.deviceName}_test.asc`]: writeTestSchematic(model),
    [`${root}model.json`]: writeJson(model),
    [`${root}README.txt`]: writeReadme(model)
  };
  return { fileName: `${model.deviceName}_LTspice.zip`, files, bytes: createZip(files, new Date(model.generatedAt)) };
}
