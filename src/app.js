import { createDeviceModel, deviceOptions } from "./model/deviceModel.js";
import {
  fitCharacteristics,
  characteristicInputs,
  swapSeriesXY, inputUnits, unitChoices
} from "./model/characteristicFitter.js";
import { buildPackage } from "./ltspice/packageWriter.js";
import { symbolGeometry, symbolPinLocations } from "./ltspice/symbolWriter.js";
import { cmosFields, validateCmos, variationTargets } from "./model/modelSettings.js";
import { thyristorFields, fitThyristor } from "./model/thyristorFitter.js";

const byId = id => document.getElementById(id);
const variantSelect = byId("variant");
for (const [key, name, unit, value, modes] of thyristorFields) {
  const label = document.createElement("label");
  label.textContent = `${name} [${unit}]`;
  label.dataset.thyristorModes = modes;
  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.value = value;
  input.dataset.thyristor = key;
  label.append(input);
  byId("thyristor-parameter-fields").append(label);
}

function updateThyristorFields() {
  const active = ["Thyristor", "Triac"].includes(variantSelect.value);
  const triac = variantSelect.value === "Triac";
  byId("thyristor-settings").hidden = !active;
  const normal = byId("thyristor-level").value === "normal";
  if (normal) byId("thyristor-mode").value = "direct";
  byId("thyristor-mode").disabled = normal;
  byId("thyristor-q4-label").hidden = !triac;
  for (const label of document.querySelectorAll("[data-thyristor-modes]")) {
    const modes = label.dataset.thyristorModes.split(",");
    const visible = active && !(normal && ["VDRM", "IDRM"].includes(label.querySelector("input").dataset.thyristor)) && (modes.includes("all") || modes.includes(byId("thyristor-mode").value) || (triac && modes.includes("triac")) || (triac && byId("thyristor-q4").checked && modes.includes("triac4")));
    label.hidden = !visible;
    const input = label.querySelector("input");
    input.disabled = !visible;
    input.required = visible && !input.dataset.thyristor.startsWith("IGT_Q");
  }
}

function collectThyristor() {
  const input = { modelLevel: byId("thyristor-level").value, onMode: byId("thyristor-mode").value, q4Enabled: byId("thyristor-q4").checked };
  for (const [key, , unit] of thyristorFields) {
    const element = document.querySelector(`[data-thyristor="${key}"]`);
    if (!element.disabled) input[key] = element.value === "" ? "" : Number(element.value) * ({ mA: 1e-3, uA: 1e-6 }[unit] || 1);
  }
  return fitThyristor(input, variantSelect.value);
}
for (const [key, name, unit, value] of cmosFields) {
  const label = document.createElement("label");
  label.textContent = `${name} [${unit}]`;
  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.value = value;
  input.dataset.cmos = key;
  label.append(input);
  byId("cmos-parameter-fields").append(label);
}

function collectCmos() {
  return validateCmos({
    ...Object.fromEntries(cmosFields.map(([key, , unit]) => {
      const input = document.querySelector(`[data-cmos="${key}"]`);
      return [key, input.value === "" ? "" : Number(input.value) * ({ mA: 1e-3, ns: 1e-9 }[unit] || 1)];
    })),
    inverting: byId("cmos-polarity").value === "inverting"
  });
}

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
  if (variant.startsWith("Diode")) return variant;
  if (variant.startsWith("BJT")) return "BJT";
  if (variant.startsWith("MOSFET")) return "MOSFET";
  return variant;
}

function renderFields() {
  byId("fit-output").textContent = "未フィッティング";
  const container = byId("characteristic-fields");
  container.replaceChildren();

  const fields = characteristicInputs[characteristicGroup(variantSelect.value)];
  const thyristor = ["Thyristor", "Triac"].includes(variantSelect.value);
  updateThyristorFields();
  const cmos = variantSelect.value === "PhotoCoupler-CMOS";
  const external = variantSelect.value === "PhotoMOS-Relay" || (cmos && byId("cmos-mode").value === "external");
  const manualCmos = cmos && !external;
  byId("cmos-mode-field").hidden = !cmos;
  byId("cmos-settings").hidden = !manualCmos;
  for (const input of document.querySelectorAll("[data-cmos]")) {
    input.disabled = !manualCmos;
    input.required = manualCmos;
  }
  byId("variation-settings").hidden = external;
  for (const id of ["variation-k", "variation-min", "variation-max", "variation-target"]) byId(id).disabled = external;
  const targetSelect = byId("variation-target");
  const previous = targetSelect.value;
  targetSelect.replaceChildren();
  for (const [value, name] of variationTargets(variantSelect.value, external)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = name;
    targetSelect.append(option);
  }
  if ([...targetSelect.options].some(option => option.value === previous)) targetSelect.value = previous;
  byId("external-model-fields").hidden = !external;
  byId("parameters").disabled = external || manualCmos || thyristor;
  byId("fit-button").disabled = external;
  byId("external-library").required = external;
  byId("external-subcircuit").required = external;
  byId("external-pin-order").required = external;
  if (external) {
    const pins = variantSelect.value === "PhotoMOS-Relay" ? "A K T1 T2" : "A K VCC GND OUT";
    byId("external-pin-order").value = pins;
    byId("external-pin-help").textContent = `使用する端子: ${pins}。元モデルの.SUBCKT宣言の順番に並べ替えてください。各端子を1回ずつ指定します。追加端子を持つモデルは未対応です。`;
    byId("fit-output").textContent = "外部ライブラリを参照（未評価）";
  }
  const stageLabels = {
    basic: "Basic parameters",
    reverse: "Optional: 逆方向特性（区分線形フィット）",
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
    swapLabel.append(swap, " 入力データのX/Yを入れ替える（単位は上記の特性順）");

    label.append(field.label, hint, area);
    const unitRow = document.createElement("div");
    unitRow.className = "temperature-options";
    inputUnits(field).forEach((base, index) => {
      const unitLabel = document.createElement("label");
      unitLabel.textContent = `${index === 0 ? "X" : `Y${index}`} 単位`;
      const unit = document.createElement("select");
      unit.dataset.seriesUnit = field.key;
      for (const value of unitChoices(base)) {
        const option = document.createElement("option");
        option.value = option.textContent = value;
        unit.append(option);
      }
      unitLabel.append(unit);
      unitRow.append(unitLabel);
    });
    label.append(unitRow);

    if (field.stage === "temperature") {
      const options = document.createElement("div");
      const temperatures = document.createElement("input");
      temperatures.type = "text";
      temperatures.placeholder = "Y1, Y2...の温度（例: 25, 65, 105）";
      temperatures.dataset.temperatureSeries = field.key;
      options.className = "temperature-options";
      options.append(temperatures);

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
    return [
      [key, value],
      [`${key}Units`, [...document.querySelectorAll(`[data-series-unit="${key}"]`)].map(unit => unit.value)],
      ...(temperatures ? [[`${key}Temperatures`, temperatures.value]] : []),
    ];
  });
  return Object.fromEntries(entries);
}

function runFit() {
  if (["Thyristor", "Triac"].includes(variantSelect.value)) {
    const fit = collectThyristor();
    byId("fit-output").textContent = `算出値: VTO=${fit.parameters.VTO.toPrecision(5)} V / RD=${fit.parameters.RD.toPrecision(5)} Ω / ROFF=${(fit.parameters.VDRM / fit.parameters.IDRM).toPrecision(5)} Ω。IGT・IL・IHを動作しきい値に反映。精度は未評価。 ${fit.warnings.join(" ")}`;
    return { ...fit, parameters: {}, thyristorParameters: fit.parameters };
  }
  if (variantSelect.value === "PhotoCoupler-CMOS" && byId("cmos-mode").value === "datasheet") {
    collectCmos();
    byId("fit-output").textContent = "データシート設定を検証しました（特性誤差は未評価）。";
    return { parameters: {}, curves: [], error: null, warnings: ["データシート設定による動作近似。温度依存・CMTI・保護動作は未評価。"], parameterSources: { CMOS: "ユーザーのデータシート設定" } };
  }
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
    `RMSE: ${fit.error == null ? "未評価" : fit.error.toPrecision(4)}${warning}`;
  return fit;
}

variantSelect.addEventListener("change", renderFields);
byId("cmos-mode").addEventListener("change", renderFields);
for (const id of ["thyristor-level", "thyristor-mode", "thyristor-q4"]) byId(id).addEventListener("change", () => {
  updateThyristorFields();
  byId("fit-output").textContent = "未フィッティング";
});
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
    const external = !byId("external-model-fields").hidden;
    const overrides = byId("parameters").disabled ? {} : JSON.parse(byId("parameters").value || "{}");
    const model = createDeviceModel({
      deviceName: byId("device-name").value,
      comment: byId("model-comment").value,
      cmosParameters: variantSelect.value === "PhotoCoupler-CMOS" && !external ? collectCmos() : undefined,
      thyristorParameters: fit.thyristorParameters,
      variation: external ? {} : {
        k: byId("variation-k").value,
        min: byId("variation-min").value,
        max: byId("variation-max").value,
        target: byId("variation-target").value
      },
      externalModel: external ? {
        libraryPath: byId("external-library").value.trim(),
        subcircuit: byId("external-subcircuit").value.trim(),
        pinOrder: byId("external-pin-order").value.trim().split(/[\s,]+/)
      } : null,
      variant: variantSelect.value,
      temperature: byId("temperature").value,
      fittingError: fit.error,
      fittingWarnings: fit.warnings,
      parameterSources: fit.parameterSources,
      spiceParameters: { ...fit.parameters, ...overrides },
      characteristicCurves: fit.curves,
      characteristicInputs: collectData()
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
