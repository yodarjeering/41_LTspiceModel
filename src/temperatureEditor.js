import { parseTemperaturePoints, temperatureColumnCount } from "./model/characteristicFitter.js";

export function createTemperatureEditor(field, area, units, temperatures) {
  const card = document.createElement("div");
  card.className = "temperature-card";
  const title = document.createElement("strong");
  title.textContent = field.label;
  const names = { temperatureIv: ["VF", "IF"], temperatureIc: ["VBE", "IC"], temperatureHfe: ["IC", "hFE"], temperatureTransfer: ["VGS", "ID"], temperatureCtr: ["IF", "CTR"] }[field.key];
  const hint = document.createElement("small");
  hint.textContent = `Curve Data CopyのX・Y1・Y2…をヘッダー・空欄ごと一括貼り付け。X = ${names[0]}、Y = ${names[1]}。各Y列に対応する温度を指定してください。`;
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "コピーしたデータの並び";
  const mode = document.createElement("select");
  for (const [value, label] of [["wide", "X / Y1 / Y2 / Y3…（曲線をまとめて貼付）"], ["long", "温度 / X / Y（従来形式）"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    mode.append(option);
  }
  modeLabel.append(mode);
  area.rows = 12;
  area.wrap = "off";
  area.className = "temperature-paste";
  area.placeholder = "X\tY1\tY2\tY3\n0.001\t\t260\t\n0.005\t350\t260\t\n0.010\t342\t254\t162";
  area.setAttribute("aria-label", `${field.label} 一括貼り付け`);
  temperatures.type = "hidden";
  const mapping = document.createElement("div");
  mapping.className = "temperature-series";
  const summary = document.createElement("small");
  summary.setAttribute("role", "status");
  const values = [];
  function refresh() {
    mapping.hidden = mode.value === "long";
    const count = mode.value === "wide" ? temperatureColumnCount(area.value) || 3 : 0;
    if (mapping.childElementCount !== count) {
      mapping.replaceChildren();
      for (let index = 0; index < count; index++) {
        const label = document.createElement("label");
        label.textContent = `Y${index + 1} · ${names[1]} の温度 [°C]`;
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.placeholder = "温度を指定";
        input.value = values[index] ?? "";
        input.setAttribute("aria-label", `Y${index + 1} の温度 °C`);
        input.addEventListener("input", () => { values[index] = input.value; refresh(); });
        label.append(input);
        mapping.append(label);
      }
    }
    temperatures.value = count ? Array.from({ length: count }, (_, index) => values[index] ?? "").join(",") : "";
    area.dataset.inputError = "";
    summary.className = "";
    if (!area.value.trim()) { summary.textContent = "データは未入力です（任意）。"; return; }
    try {
      if (count && Array.from({ length: count }, (_, index) => values[index]).some(value => value == null || value === "")) {
        throw new Error(`Y列を${count}系列検出しました。各Y列の温度を指定してください。`);
      }
      const points = parseTemperaturePoints(area.value, { xKey: "X", yKey: "Y", temperatures: temperatures.value });
      const series = [...new Set(points.map(point => point.TEMP))];
      summary.textContent = `${series.length}温度 / ${points.length}測定点を読込み。空欄は欠測点として除外します。`;
    } catch (problem) {
      area.dataset.inputError = `${field.label}: ${problem.message}`;
      summary.textContent = problem.message;
      summary.className = "temperature-error";
    }
  }
  mode.addEventListener("change", () => { area.placeholder = mode.value === "wide" ? "X\tY1\tY2\tY3" : "25\t0.55\t0.001\n100\t0.55\t0.004"; refresh(); });
  area.addEventListener("input", refresh);
  card.append(title, hint, modeLabel, units, area, mapping, temperatures, summary);
  refresh();
  return card;
}
