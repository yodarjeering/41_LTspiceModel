import { createDeviceModel, deviceOptions } from "./model/deviceModel.js";
import {
  fitCharacteristics,
  characteristicInputs,
  swapSeriesXY
} from "./model/characteristicFitter.js";
import { buildPackage } from "./ltspice/packageWriter.js";
import { symbolGeometry, symbolPinLocations } from "./ltspice/symbolWriter.js";

const byId = id => document.getElementById(id);
const variantSelect = byId("variant");

for (const value of deviceOptions) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  variantSelect.append(option);
}
variantSelect.value = "PhotoCoupler";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function renderSymbolPreview(variant) {
  const preview = byId("model-preview");
  const model = createDeviceModel({ deviceName: "DEVICE", variant, generatedAt: "preview" });
  const commands = symbolGeometry[model.symbolBase];
  const pins = symbolPinLocations[model.symbolBase];
  const coordinates = pins.flat();

  for (const command of commands) {
    const parts = command.split(/\s+/);
    if (parts[0] === "LINE") coordinates.push(...parts.slice(2, 6).map(Number));
    if (parts[0] === "RECTANGLE") coordinates.push(...parts.slice(2, 6).map(Number));
  }
  const xs = coordinates.filter((_, index) => index % 2 === 0);
  const ys = coordinates.filter((_, index) => index % 2 === 1);
  const minX = Math.min(...xs) - 34;
  const minY = Math.min(...ys) - 26;
  const width = Math.max(...xs) - minX + 34;
  const height = Math.max(...ys) - minY + 26;
  const svg = svgElement("svg", {
    viewBox: `${minX} ${minY} ${width} ${height}`,
    role: "img",
    "aria-label": `${variant} LTspice symbol`
  });

  for (const command of commands) {
    const parts = command.split(/\s+/);
    if (parts[0] === "LINE") {
      const [x1, y1, x2, y2] = parts.slice(2, 6);
      svg.append(svgElement("line", { x1, y1, x2, y2 }));
    } else if (parts[0] === "RECTANGLE") {
      const [x1, y1, x2, y2] = parts.slice(2, 6).map(Number);
      svg.append(svgElement("rect", {
        x: Math.min(x1, x2), y: Math.min(y1, y2),
        width: Math.abs(x2 - x1), height: Math.abs(y2 - y1)
      }));
    }
  }

  model.pins.forEach((pin, index) => {
    const [x, y] = pins[index];
    svg.append(svgElement("rect", { x: x - 2, y: y - 2, width: 4, height: 4, class: "pin-marker" }));
    const label = svgElement("text", {
      x: x < 0 ? x + 6 : x - 6,
      y: y - 6,
      "text-anchor": x < 0 ? "start" : "end"
    });
    label.textContent = `${pin.spiceOrder}:${pin.name}`;
    svg.append(label);
  });

  const title = document.createElement("strong");
  title.textContent = variant;
  const details = document.createElement("span");
  details.textContent = `${model.modelType === "MODEL" ? ".MODEL" : ".SUBCKT"} / Prefix ${model.symbolPrefix}`;
  const pinText = document.createElement("code");
  pinText.textContent = model.pins.map(pin => `${pin.spiceOrder}:${pin.name}`).join(" · ");
  preview.replaceChildren(svg, title, details, pinText);
}

function initializeModelPicker() {
  const picker = byId("model-picker");
  const button = byId("model-picker-button");
  const popover = byId("model-picker-popover");
  const options = byId("model-picker-options");

  const close = ({ restoreFocus = false } = {}) => {
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus();
  };
  const open = () => {
    popover.hidden = false;
    button.setAttribute("aria-expanded", "true");
    renderSymbolPreview(variantSelect.value);
    for (const option of options.querySelectorAll("[data-model-option]")) {
      option.setAttribute("aria-selected", String(option.dataset.modelOption === variantSelect.value));
    }
    options.querySelector(`[data-model-option="${variantSelect.value}"]`)?.focus();
  };
  const selectVariant = variant => {
    variantSelect.value = variant;
    button.textContent = variant;
    variantSelect.dispatchEvent(new Event("change"));
    close({ restoreFocus: true });
  };

  for (const variant of deviceOptions) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "model-picker-option";
    option.dataset.modelOption = variant;
    option.setAttribute("role", "option");
    option.textContent = variant;
    option.addEventListener("pointerenter", () => renderSymbolPreview(variant));
    option.addEventListener("focus", () => renderSymbolPreview(variant));
    option.addEventListener("click", () => selectVariant(variant));
    option.addEventListener("keydown", event => {
      const all = [...options.querySelectorAll("[data-model-option]")];
      const index = all.indexOf(option);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        all[(index + direction + all.length) % all.length].focus();
      } else if (event.key === "Escape") {
        close({ restoreFocus: true });
      }
    });
    options.append(option);
  }

  button.textContent = variantSelect.value;
  button.addEventListener("click", () => popover.hidden ? open() : close());
  button.addEventListener("keydown", event => {
    if (["ArrowDown", "Enter", " "].includes(event.key) && popover.hidden) {
      event.preventDefault();
      open();
    }
  });
  document.addEventListener("pointerdown", event => {
    if (!popover.hidden && !picker.contains(event.target)) close();
  });
}

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

  const fields = characteristicInputs[characteristicGroup(variantSelect.value)];
  const stageLabels = {
    basic: "Basic parameters",
    temperature: "Optional: 温度特性",
    capacitance: "Optional: 容量特性",
    switching: "Optional: スイッチング特性"
  };
  let currentStage;

  for (const field of fields) {
    if (field.stage !== currentStage) {
      currentStage = field.stage;
      const heading = document.createElement("h3");
      heading.className = "characteristic-stage";
      heading.textContent = stageLabels[currentStage];
      container.append(heading);
    }
    const label = document.createElement("label");
    const hint = document.createElement("small");
    const area = document.createElement("textarea");
    const swapLabel = document.createElement("label");
    const swap = document.createElement("input");

    hint.textContent = `${field.hint}（空白・タブで区切る。改行位置は任意）`;
    area.rows = 5;
    area.dataset.characteristic = field.key;
    area.dataset.columns = field.columns || 2;
    area.value = field.sample;
    swap.type = "checkbox";
    swap.dataset.swap = field.key;
    swapLabel.className = "swap-control";
    swapLabel.append(swap, " X/Yを入れ替える");

    label.append(field.label, hint, area);

    if (field.stage === "temperature") {
      const options = document.createElement("div");
      const temperatures = document.createElement("input");
      temperatures.type = "text";
      temperatures.placeholder = "Y1, Y2...の温度（例: 25, 65, 105）";
      temperatures.dataset.temperatureSeries = field.key;
      options.className = "temperature-options";
      options.append(temperatures);

      if (field.yQuantity !== "ratio") {
        const unit = document.createElement("select");
        unit.dataset.temperatureUnit = field.key;
        for (const value of ["A", "mA", "uA"]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = `Y軸: ${value}`;
          unit.append(option);
        }
        unit.value = "A";
        options.append(unit);
      }
      label.append(options);
    } else {
      label.append(swapLabel);
    }
    container.append(label);
  }
}

function collectData() {
  const fields = document.querySelectorAll("[data-characteristic]");
  const entries = [...fields].flatMap(element => {
    const key = element.dataset.characteristic;
    const swap = document.querySelector(`[data-swap="${key}"]`);
    const value = swap?.checked
      ? swapSeriesXY(element.value, Number(element.dataset.columns))
      : element.value;
    const temperatures = document.querySelector(`[data-temperature-series="${key}"]`);
    const unit = document.querySelector(`[data-temperature-unit="${key}"]`);
    return [
      [key, value],
      ...(temperatures ? [[`${key}Temperatures`, temperatures.value]] : []),
      ...(unit ? [[`${key}Unit`, unit.value]] : [])
    ];
  });
  return Object.fromEntries(entries);
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
initializeModelPicker();
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
