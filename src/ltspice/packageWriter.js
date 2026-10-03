import { assertDeviceModel } from "../model/deviceModel.js";
import { writeModel } from "./modelWriter.js";
import { writeSymbol } from "./symbolWriter.js";
import { writeTestSchematic } from "./ascWriter.js";
import { writeJson } from "../export/jsonWriter.js";
import { writeReadme } from "../export/readmeWriter.js";
import { createZip } from "../export/zipWriter.js";
import { writeThyristorTests } from "./thyristorTestWriter.js";
import { writeReverseDiodeTest } from "./diodeWriter.js";

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
  const tests = writeThyristorTests(model);
  const reverseTest = model.deviceType === "Diode" ? writeReverseDiodeTest(model) : null;
  if (reverseTest) tests.reverse = reverseTest;
  for (const [name, fixture] of Object.entries(tests)) files[`${root}${model.deviceName}_${name}.cir`] = fixture.circuit;
  if (Object.keys(tests).length) files[`${root}validation.json`] = JSON.stringify({ tests: Object.fromEntries(Object.entries(tests).map(([name, fixture]) => [`${model.deviceName}_${name}.cir`, fixture.checks])) }, null, 2) + "\n";
  return { fileName: `${model.deviceName}_LTspice.zip`, files, bytes: createZip(files, new Date(model.generatedAt)) };
}
