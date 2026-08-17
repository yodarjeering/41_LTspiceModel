import { createDeviceModel, deviceOptions } from "./model/deviceModel.js";
import {
  fitCharacteristics,
  characteristicInputs,
  swapSeriesXY
} from "./model/characteristicFitter.js";
import { buildPackage } from "./ltspice/packageWriter.js";

const byId = id => document.getElementById(id);
const variantSelect = byId("variant");

for (const value of deviceOptions) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  variantSelect.append(option);
}
variantSelect.value = "PhotoCoupler";

// Basic and advanced variants share the same characteristic input fields.
function characteristicGroup(variant) {
  if (variant.startsWith("BJT")) return "BJT";
  if (variant.startsWith("MOSFET")) return "MOSFET";
  return variant;
}

function renderFields() {
  byId("fit-output").textContent = "未フィッティング";
  const container = byId("characteristic-fields");
  container.replaceChildren();

  for (const field of characteristicInputs[characteristicGroup(variantSelect.value)]) {
    const label = document.createElement("label");
    const hint = document.createElement("small");
    const area = document.createElement("textarea");
    const swapLabel = document.createElement("label");
    const swap = document.createElement("input");

    hint.textContent = `${field.hint}（空白・タブで区切る。改行位置は任意）`;
    area.rows = 5;
    area.dataset.characteristic = field.key;
    area.value = field.sample;
    swap.type = "checkbox";
    swap.dataset.swap = field.key;
    swapLabel.className = "swap-control";
    swapLabel.append(swap, " X/Yを入れ替える");

    label.append(field.label, hint, area, swapLabel);
    container.append(label);
  }
}

function collectData() {
  const fields = document.querySelectorAll("[data-characteristic]");
  return Object.fromEntries([...fields].map(element => {
    const key = element.dataset.characteristic;
    const swap = document.querySelector(`[data-swap="${key}"]`);
    const value = swap?.checked ? swapSeriesXY(element.value) : element.value;
    return [key, value];
  }));
}

function runFit() {
  const fit = fitCharacteristics(
    variantSelect.value,
    collectData(),
    Number(byId("temperature").value)
  );
  const warning = fit.warnings?.length
    ? ` / 注意: ${fit.warnings.join(" ")}`
    : "";

  byId("fit-output").textContent =
    `推定値: ${JSON.stringify(fit.parameters)} / ` +
    `RMSE: ${fit.error.toPrecision(4)}${warning}`;
  return fit;
}

variantSelect.addEventListener("change", renderFields);
byId("fit-button").addEventListener("click", () => {
  try {
    runFit();
  } catch (error) {
    byId("fit-output").textContent = error.message;
  }
});
renderFields();

byId("model-form").addEventListener("submit", event => {
  event.preventDefault();
  const status = byId("status");

  try {
    const fit = runFit();
    const overrides = JSON.parse(byId("parameters").value || "{}");
    const model = createDeviceModel({
      deviceName: byId("device-name").value,
      variant: variantSelect.value,
      temperature: byId("temperature").value,
      fittingError: fit.error,
      fittingWarnings: fit.warnings,
      parameterSources: fit.parameterSources,
      spiceParameters: { ...fit.parameters, ...overrides },
      characteristicCurves: fit.curves
    });

    // Build the package in memory, then hand it to the browser as a download.
    const pkg = buildPackage(model);
    const blob = new Blob([pkg.bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = pkg.fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `${pkg.fileName} を生成しました`;
  } catch (error) {
    status.textContent = error.message;
  }
});
