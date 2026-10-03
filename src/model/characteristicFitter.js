import { fitThyristor } from "./thyristorFitter.js";

const VT_27 = 0.0256926;
const BOLTZMANN_EV = 8.617333262e-5;

// This is the single source of truth for datasheet-to-SPICE correspondence.
// `stage` controls whether a fit is always attempted or only when data exists.
export const parameterMappings = {
  Diode: [
    { key: "iv", stage: "basic", characteristic: "IF-VF", parameters: ["IS", "N", "RS"] },
    { key: "reverseIv", stage: "reverse", characteristic: "IR-VR", parameters: ["reverseCurve"] },
    { key: "cjVr", stage: "capacitance", characteristic: "Cj-VR", parameters: ["CJO", "VJ", "M"] },
    { key: "temperatureIv", stage: "temperature", characteristic: "IF-VF @ multiple temperatures", parameters: ["EG", "XTI", "TNOM"] },
    { key: "reverseRecovery", stage: "switching", characteristic: "Reverse recovery", parameters: ["TT"] }
  ],
  BJT: [
    { key: "vbeIc", stage: "basic", characteristic: "VBE-IC", parameters: ["IS", "N"] },
    { key: "gummel", stage: "basic", characteristic: "Gummel VBE-IC-IB", parameters: ["IS", "N", "BF"] },
    { key: "hfeIc", stage: "basic", characteristic: "hFE-IC", parameters: ["BF", "IKF"] },
    { key: "icIb", stage: "basic", characteristic: "IC-IB", parameters: ["BF"] },
    { key: "junctionCapacitance", stage: "capacitance", characteristic: "CJC-VCB", parameters: ["CJC", "VJC", "MJC"] },
    { key: "temperatureIc", stage: "temperature", characteristic: "VBE-IC @ multiple temperatures", parameters: ["EG", "XTI", "TNOM"] },
    { key: "transitionFrequency", stage: "switching", characteristic: "fT-IC", parameters: ["TF"] }
  ],
  MOSFET: [
    { key: "transfer", stage: "basic", characteristic: "VGS-ID", parameters: ["VTO", "KP"] },
    { key: "outputCapacitance", stage: "capacitance", characteristic: "CISS/COSS/CRSS-VDS", parameters: ["CGS", "CGD", "CBD"] },
    { key: "temperatureTransfer", stage: "temperature", characteristic: "VGS-ID @ multiple temperatures", parameters: ["VTO", "KP", "TCV", "BEX", "TNOM"] },
    { key: "gateCharge", stage: "switching", characteristic: "QG-VGS", parameters: ["CGS"] }
  ],
  PhotoCoupler: [
    { key: "ifCtr", stage: "basic", characteristic: "IF-CTR", parameters: ["CTR"] },
    { key: "transfer", stage: "basic", characteristic: "IF-IC", parameters: ["CTR"] },
    { key: "led", stage: "basic", characteristic: "LED IF-VF", parameters: ["IS", "N", "RS"] },
    { key: "couplingCapacitance", stage: "capacitance", characteristic: "CCE-VCE", parameters: ["CCE"] },
    { key: "temperatureCtr", stage: "temperature", characteristic: "IF-CTR @ multiple temperatures", parameters: ["CTRTC", "TNOM"] },
    { key: "responseTime", stage: "switching", characteristic: "tr/tf-RL", parameters: ["CCE"] }
  ]
};

export function parseCsvPoints(text, columns) {
  const numericTokens = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(line => line.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .flatMap(line => {
      const rawTokens = line.replace(/[\u3000,;]+/g, " ").trim().split(/\s+/).filter(Boolean);
      const values = rawTokens.map(token => Number(token.replace(/[dD]([+-]?\d+)$/, "e$1")));
      // Ignore complete header, unit and annotation lines instead of allowing
      // their text to shift the following numeric column alignment.
      return values.every(Number.isFinite) ? values : [];
    });

  if (numericTokens.length % columns.length !== 0) {
    throw new Error(`特性データは${columns.length}列単位で入力してください（数値${numericTokens.length}個を検出）。`);
  }

  const points = [];
  for (let index = 0; index < numericTokens.length; index += columns.length) {
    points.push(Object.fromEntries(columns.map((column, offset) => [column, numericTokens[index + offset]])));
  }
  if (points.length < 2) throw new Error("フィッティングには2点以上の特性データが必要です。");
  return points;
}

function parseTemperatureList(value) {
  return String(value || "")
    .replace(/[℃°Cc]/g, " ")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
}

function unitScale(unit) {
  return { A: 1, mA: 1e-3, uA: 1e-6, "µA": 1e-6, "μA": 1e-6 }[unit] ?? 1;
}

// Accept either long rows (TEMP, X, Y) or graph-tool-style wide rows
// (X, Y1, Y2...). Tabs are significant because blank Y cells are missing data.
export function parseTemperaturePoints(text, options) {
  const {
    xKey,
    yKey,
    temperatures: temperatureInput,
    yUnit = "A"
  } = options;
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(line => line.replace(/#.*$/, ""))
    .filter(line => line.trim());
  const firstLine = lines[0] || "";
  const headerTemperatures = [...firstLine.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:°\s*C|℃|C)\b/gi)]
    .map(match => Number(match[1]));
  const suppliedTemperatures = parseTemperatureList(temperatureInput);
  const hasWideHeader = /(^|\s)X(?:\s|$)/i.test(firstLine) || /Y\d+/i.test(firstLine);
  const isWide = suppliedTemperatures.length > 0 || headerTemperatures.length > 0 || hasWideHeader;
  const scale = unitScale(yUnit);

  if (!isWide) {
    return parseCsvPoints(text, ["TEMP", xKey, yKey]).map(point => ({
      ...point,
      [yKey]: point[yKey] * scale
    }));
  }

  const temperatures = suppliedTemperatures.length ? suppliedTemperatures : headerTemperatures;
  if (temperatures.length < 2) {
    throw new Error("横持ち温度データには、Y1以降に対応する温度を2つ以上指定してください。");
  }

  const points = [];
  for (const line of lines) {
    const cells = line.includes("\t")
      ? line.split("\t").map(cell => cell.trim())
      : line.split(",").map(cell => cell.trim());
    const x = Number(cells[0]);
    if (!Number.isFinite(x)) continue; // Header row.

    temperatures.forEach((temperature, index) => {
      const rawY = cells[index + 1];
      if (rawY == null || rawY === "") return;
      const y = Number(rawY.replace(/[dD]([+-]?\d+)$/, "e$1"));
      if (!Number.isFinite(y)) return;
      points.push({ TEMP: temperature, [xKey]: x, [yKey]: y * scale });
    });
  }
  if (points.length < 4) throw new Error("温度フィッティングには有効な測定点が不足しています。");
  return points;
}

export function swapSeriesXY(text, columnCount = 2) {
  const values = String(text || "").replace(/[\u3000,;]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (values.length % columnCount !== 0) return text;

  const rows = [];
  for (let index = 0; index < values.length; index += columnCount) {
    const row = values.slice(index, index + columnCount);
    [row[0], row[1]] = [row[1], row[0]];
    rows.push(row.join(" "));
  }
  return rows.join("\n");
}

const hasData = value => String(value || "")
  .split(/\r?\n/)
  .some(line => line.trim() && !line.trim().startsWith("#"));

function format(value) {
  if (!Number.isFinite(value)) throw new Error("有効なパラメータを求められませんでした。");
  return Number(value.toPrecision(7)).toString();
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) throw new Error("有効なOptional Parameterを求められませんでした。");
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function groupBy(points, key) {
  const groups = new Map();
  for (const point of points) {
    const value = point[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(point);
  }
  return groups;
}

function linearFit(points) {
  const n = points.length;
  const sx = points.reduce((sum, point) => sum + point.x, 0);
  const sy = points.reduce((sum, point) => sum + point.y, 0);
  const sxx = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const sxy = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const denominator = n * sxx - sx * sx;
  if (Math.abs(denominator) < 1e-20) throw new Error("同じX値だけではフィッティングできません。");

  const slope = (n * sxy - sx * sy) / denominator;
  const intercept = (sy - slope * sx) / n;
  const rmse = Math.sqrt(points.reduce((sum, point) => {
    return sum + (point.y - (slope * point.x + intercept)) ** 2;
  }, 0) / n);
  return { slope, intercept, rmse };
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    if (Math.abs(augmented[column][column]) < 1e-20) {
      throw new Error("特性点の組み合わせからパラメータを分離できません。");
    }

    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map(row => row[size]);
}

function multipleLinearFit(rows) {
  const width = rows[0].x.length;
  const matrix = Array.from({ length: width }, () => Array(width).fill(0));
  const vector = Array(width).fill(0);
  for (const row of rows) {
    for (let left = 0; left < width; left += 1) {
      vector[left] += row.x[left] * row.y;
      for (let right = 0; right < width; right += 1) {
        matrix[left][right] += row.x[left] * row.x[right];
      }
    }
  }
  const coefficients = solveLinearSystem(matrix, vector);
  const rmse = Math.sqrt(rows.reduce((sum, row) => {
    const predicted = row.x.reduce((value, input, index) => value + input * coefficients[index], 0);
    return sum + (row.y - predicted) ** 2;
  }, 0) / rows.length);
  return { coefficients, rmse };
}

function fitJunction(points, voltageKey, currentKey, temperature) {
  const valid = points
    .filter(point => point[currentKey] > 0)
    .map(point => ({ x: Math.abs(point[voltageKey]), y: Math.log(Math.abs(point[currentKey])) }));
  if (valid.length < 2) throw new Error("接合特性には正の電流値が2点以上必要です。");

  const fit = linearFit(valid);
  const vt = VT_27 * (Number(temperature) + 273.15) / 300.15;
  const ideality = 1 / (fit.slope * vt);
  const saturationCurrent = Math.exp(fit.intercept);

  // High-current deviation from the exponential line estimates series resistance.
  const resistanceCandidates = points
    .filter(point => point[currentKey] > 0)
    .map(point => {
      const idealVoltage = ideality * vt * Math.log(point[currentKey] / saturationCurrent);
      return (Math.abs(point[voltageKey]) - idealVoltage) / point[currentKey];
    })
    .filter(value => value > 0);

  const parameters = { IS: format(saturationCurrent), N: format(ideality) };
  if (resistanceCandidates.length) parameters.RS = format(median(resistanceCandidates));
  return { parameters, error: fit.rmse };
}

function fitDiodeJunction(points, voltageKey, currentKey, temperature) {
  const valid = points.filter(point => point[currentKey] > 0 && Number.isFinite(point[voltageKey]));
  if (valid.length < 3) return fitJunction(points, voltageKey, currentKey, temperature);

  // V = N*VT*ln(I) - N*VT*ln(IS) + I*RS
  const fit = multipleLinearFit(valid.map(point => ({
    x: [Math.log(point[currentKey]), 1, point[currentKey]],
    y: Math.abs(point[voltageKey])
  })));
  const [slope, intercept, resistance] = fit.coefficients;
  const vt = VT_27 * (Number(temperature) + 273.15) / 300.15;
  const ideality = slope / vt;
  const saturationCurrent = Math.exp(-intercept / slope);

  if (ideality <= 0 || saturationCurrent <= 0 || resistance < 0) {
    throw new Error("IF-VFデータから物理的に有効なIS/N/RSを推定できませんでした。単位とデータ範囲を確認してください。");
  }
  return {
    parameters: {
      IS: format(saturationCurrent),
      N: format(ideality),
      RS: format(resistance)
    },
    error: fit.rmse
  };
}

function fitDepletionCapacitance(points, voltageKey, capacitanceKey, names) {
  const valid = points.filter(point => point[capacitanceKey] > 0 && point[voltageKey] >= 0);
  if (valid.length < 2) throw new Error("容量特性には正の容量値が2点以上必要です。");

  let best;
  for (let vj = 0.1; vj <= 2.0; vj += 0.02) {
    for (let grading = 0.1; grading <= 0.9; grading += 0.02) {
      const logCjo = valid.reduce((sum, point) => {
        return sum + Math.log(point[capacitanceKey]) + grading * Math.log(1 + point[voltageKey] / vj);
      }, 0) / valid.length;
      const error = Math.sqrt(valid.reduce((sum, point) => {
        const predicted = logCjo - grading * Math.log(1 + point[voltageKey] / vj);
        return sum + (Math.log(point[capacitanceKey]) - predicted) ** 2;
      }, 0) / valid.length);
      if (!best || error < best.error) best = { cjo: Math.exp(logCjo), vj, grading, error };
    }
  }

  return {
    parameters: {
      [names.capacitance]: format(best.cjo),
      [names.potential]: format(best.vj),
      [names.grading]: format(best.grading)
    },
    error: best.error
  };
}

function fitTemperatureJunction(points, voltageKey, currentKey, nominalTemperature) {
  const groups = groupBy(points, "TEMP");
  if (groups.size < 2) throw new Error("温度特性は2温度以上のデータを入力してください。");

  const samples = [...groups].map(([temperature, group]) => {
    const junction = fitJunction(group, voltageKey, currentKey, temperature);
    return { temperature, is: Number(junction.parameters.IS), n: Number(junction.parameters.N) };
  });
  const reference = samples.reduce((best, sample) => (
    Math.abs(sample.temperature - nominalTemperature) < Math.abs(best.temperature - nominalTemperature) ? sample : best
  ));
  const nominalK = reference.temperature + 273.15;
  const rows = samples.filter(sample => sample !== reference).map(sample => ({
    x1: Math.log((sample.temperature + 273.15) / nominalK),
    x2: 1 / (sample.temperature + 273.15) - 1 / nominalK,
    y: Math.log(sample.is / reference.is)
  }));
  const ideality = median(samples.map(sample => sample.n));

  // Two curves cannot independently identify EG and XTI. Constrain EG to the
  // common silicon value and solve only XTI; three or more curves fit both.
  if (groups.size === 2) {
    const eg = 1.11;
    const xtiValues = rows
      .filter(row => Math.abs(row.x1) > 1e-20)
      .map(row => ideality * (row.y + eg * row.x2 / (ideality * BOLTZMANN_EV)) / row.x1);
    return {
      parameters: { EG: format(eg), XTI: format(median(xtiValues)), TNOM: format(reference.temperature) },
      warning: "2温度のためEG=1.11 eVに固定してXTIを推定しました。"
    };
  }

  const a11 = rows.reduce((sum, row) => sum + row.x1 ** 2, 0);
  const a12 = rows.reduce((sum, row) => sum + row.x1 * row.x2, 0);
  const a22 = rows.reduce((sum, row) => sum + row.x2 ** 2, 0);
  const b1 = rows.reduce((sum, row) => sum + row.x1 * row.y, 0);
  const b2 = rows.reduce((sum, row) => sum + row.x2 * row.y, 0);
  const determinant = a11 * a22 - a12 * a12;
  if (Math.abs(determinant) < 1e-20) throw new Error("温度点の組み合わせから温度係数を推定できません。");

  const coefficient1 = (b1 * a22 - b2 * a12) / determinant;
  const coefficient2 = (a11 * b2 - a12 * b1) / determinant;
  return {
    parameters: {
      EG: format(-coefficient2 * ideality * BOLTZMANN_EV),
      XTI: format(coefficient1 * ideality),
      TNOM: format(reference.temperature)
    }
  };
}

function result(parameters = {}, curves = [], errors = [], warnings = [], parameterSources = {}) {
  const error = errors.length
    ? Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length)
    : 0;
  return { parameters, curves, error, warnings, parameterSources };
}

function mergeOptional(target, fitted, curve, source) {
  Object.assign(target.parameters, fitted.parameters);
  target.curves.push(curve);
  if (fitted.error != null) target.errors.push(fitted.error);
  for (const parameter of Object.keys(fitted.parameters)) target.parameterSources[parameter] = source;
}

function fitDiode(data, temperature) {
  const points = parseCsvPoints(data.iv, ["VF", "IF"]);
  const basic = fitDiodeJunction(points, "VF", "IF", temperature);
  const state = {
    parameters: basic.parameters,
    curves: [{ name: "IF-VF", columns: ["VF", "IF"], points }],
    errors: [basic.error], warnings: [], parameterSources: {}
  };
  for (const parameter of Object.keys(basic.parameters)) state.parameterSources[parameter] = "IF-VF";
  if (hasData(data.reverseIv)) {
    const reversePoints = parseCsvPoints(data.reverseIv, ["VR", "IR"]).sort((a, b) => a.VR - b.VR);
    reversePoints.forEach((point, index) => {
      if (point.VR < 0 || point.IR < 0) throw new Error("IR–VRは逆電圧・逆電流の絶対値（0以上）を入力してください。");
      if (point.VR === 0 && point.IR !== 0) throw new Error("VR=0のIRは0にしてください。");
      if (index && (point.VR === reversePoints[index - 1].VR || point.IR < reversePoints[index - 1].IR)) throw new Error("IR–VRは電圧の重複がなく、電流が単調増加するデータにしてください。");
    });
    if (reversePoints.at(-1).VR <= 0) throw new Error("IR–VRには正の逆電圧が必要です。");
    state.curves.push({ name: "IR-VR", columns: ["VR", "IR"], points: reversePoints, approximation: "piecewise-linear", knotRmseA: 0, extrapolation: "last-segment-linear", zeroAnchor: true });
    state.parameterSources.reverseCurve = "IR-VR：読み取り点の区分線形補間（パラメータ最適化ではない）";
    state.warnings.push("IR–VRは単一温度の区分線形近似です。原点を補い、最大電圧の外側は最終区間の傾きで延長します。逆特性の温度依存は未対応。補間点での誤差0は測定精度やLTspice実測誤差を意味しません。");
  }

  if (hasData(data.cjVr)) {
    const optionalPoints = parseCsvPoints(data.cjVr, ["VR", "CJ"]);
    mergeOptional(state, fitDepletionCapacitance(optionalPoints, "VR", "CJ", {
      capacitance: "CJO", potential: "VJ", grading: "M"
    }), { name: "Cj-VR", columns: ["VR", "CJ"], points: optionalPoints }, "Cj-VR");
  }
  if (hasData(data.temperatureIv)) {
    const optionalPoints = parseTemperaturePoints(data.temperatureIv, {
      xKey: "VF", yKey: "IF", temperatures: data.temperatureIvTemperatures, yUnit: data.temperatureIvUnit
    });
    const temperatureFit = fitTemperatureJunction(optionalPoints, "VF", "IF", temperature);
    mergeOptional(state, temperatureFit, {
      name: "IF-VF @ temperature", columns: ["TEMP", "VF", "IF"], points: optionalPoints
    }, "IF-VF @ multiple temperatures");
    if (temperatureFit.warning) state.warnings.push(temperatureFit.warning);
  }
  if (hasData(data.reverseRecovery)) {
    const optionalPoints = parseCsvPoints(data.reverseRecovery, ["IR", "TRR"]);
    mergeOptional(state, { parameters: { TT: format(median(optionalPoints.map(point => point.TRR))) } }, {
      name: "Reverse recovery", columns: ["IR", "TRR"], points: optionalPoints
    }, "Reverse recovery");
  }
  return result(state.parameters, state.curves, state.errors, state.warnings, state.parameterSources);
}

function fitBjt(data, temperature) {
  const state = { parameters: {}, curves: [], errors: [], warnings: [], parameterSources: {} };
  const gains = [];

  if (hasData(data.vbeIc)) {
    const points = parseCsvPoints(data.vbeIc, ["VBE", "IC"]);
    const fit = fitJunction(points, "VBE", "IC", temperature);
    mergeOptional(state, fit, { name: "VBE-IC", columns: ["VBE", "IC"], points }, "VBE-IC");
  }
  if (hasData(data.gummel)) {
    const points = parseCsvPoints(data.gummel, ["VBE", "IC", "IB"]);
    const fit = fitJunction(points, "VBE", "IC", temperature);
    mergeOptional(state, fit, { name: "Gummel VBE-IC-IB", columns: ["VBE", "IC", "IB"], points }, "Gummel");
    gains.push(...points.filter(point => point.IB > 0 && point.IC > 0).map(point => ({ IC: point.IC, hFE: point.IC / point.IB })));
  }
  if (hasData(data.hfeIc)) {
    const points = parseCsvPoints(data.hfeIc, ["IC", "hFE"]);
    gains.push(...points.filter(point => point.IC > 0 && point.hFE > 0));
    state.curves.push({ name: "hFE-IC", columns: ["IC", "hFE"], points });
  }
  if (hasData(data.icIb)) {
    const points = parseCsvPoints(data.icIb, ["IB", "IC"]);
    gains.push(...points.filter(point => point.IB > 0 && point.IC > 0).map(point => ({ IC: point.IC, hFE: point.IC / point.IB })));
    state.curves.push({ name: "IC-IB", columns: ["IB", "IC"], points });
  }
  if (gains.length) {
    const bf = Math.max(...gains.map(point => point.hFE));
    state.parameters.BF = format(bf);
    state.parameterSources.BF = state.curves.some(curve => curve.name === "hFE-IC") ? "hFE-IC" : "IC-IB/Gummel";
    const candidates = gains
      .filter(point => point.hFE < bf * 0.95)
      .map(point => point.IC / (bf / point.hFE - 1))
      .filter(value => value > 0 && Number.isFinite(value));
    if (candidates.length) {
      state.parameters.IKF = format(median(candidates));
      state.parameterSources.IKF = "high-current hFE roll-off";
    }
  }

  if (!state.parameters.IS) state.warnings.push("VBE-ICデータがないためIS/Nは設定しません。");
  if (!state.parameters.BF) state.warnings.push("hFE-ICまたはIC-IBデータがないためBFは設定しません。");
  if (!state.curves.length) throw new Error("BJTはVBE-IC、hFE-IC、IC-IBのいずれかを入力してください。");

  if (hasData(data.junctionCapacitance)) {
    const points = parseCsvPoints(data.junctionCapacitance, ["VCB", "CJC"]);
    mergeOptional(state, fitDepletionCapacitance(points, "VCB", "CJC", {
      capacitance: "CJC", potential: "VJC", grading: "MJC"
    }), { name: "CJC-VCB", columns: ["VCB", "CJC"], points }, "CJC-VCB");
  }
  if (hasData(data.temperatureIc)) {
    const points = parseTemperaturePoints(data.temperatureIc, {
      xKey: "VBE", yKey: "IC", temperatures: data.temperatureIcTemperatures, yUnit: data.temperatureIcUnit
    });
    const temperatureFit = fitTemperatureJunction(points, "VBE", "IC", temperature);
    mergeOptional(state, temperatureFit, {
      name: "VBE-IC @ temperature", columns: ["TEMP", "VBE", "IC"], points
    }, "VBE-IC @ multiple temperatures");
    if (temperatureFit.warning) state.warnings.push(temperatureFit.warning);
  }
  if (hasData(data.transitionFrequency)) {
    const points = parseCsvPoints(data.transitionFrequency, ["IC", "FT"]);
    const tf = median(points.filter(point => point.FT > 0).map(point => 1 / (2 * Math.PI * point.FT)));
    mergeOptional(state, { parameters: { TF: format(tf) } }, {
      name: "fT-IC", columns: ["IC", "FT"], points
    }, "fT-IC");
  }
  return result(state.parameters, state.curves, state.errors, state.warnings, state.parameterSources);
}

function fitMosfetTransfer(points) {
  const valid = points
    .filter(point => Math.abs(point.ID) > 0)
    .map(point => ({ x: Math.abs(point.VGS), y: Math.sqrt(Math.abs(point.ID)) }));
  const fit = linearFit(valid);
  return { parameters: { VTO: format(-fit.intercept / fit.slope), KP: format(2 * fit.slope ** 2) }, error: fit.rmse };
}

function fitMosfet(data, temperature) {
  const points = parseCsvPoints(data.transfer, ["VGS", "ID"]);
  const basic = fitMosfetTransfer(points);
  const state = {
    parameters: basic.parameters,
    curves: [{ name: "Transfer VGS-ID", columns: ["VGS", "ID"], points }],
    errors: [basic.error], warnings: [],
    parameterSources: { VTO: "VGS-ID", KP: "VGS-ID" }
  };

  if (hasData(data.outputCapacitance)) {
    const optionalPoints = parseCsvPoints(data.outputCapacitance, ["VDS", "CISS", "COSS", "CRSS"]);
    const cgd = median(optionalPoints.map(point => point.CRSS));
    const cgs = median(optionalPoints.map(point => point.CISS - point.CRSS).filter(value => value > 0));
    const cbd = median(optionalPoints.map(point => point.COSS - point.CRSS).filter(value => value > 0));
    mergeOptional(state, { parameters: { CGS: format(cgs), CGD: format(cgd), CBD: format(cbd) } }, {
      name: "CISS/COSS/CRSS-VDS", columns: ["VDS", "CISS", "COSS", "CRSS"], points: optionalPoints
    }, "CISS/COSS/CRSS-VDS");
  }
  if (hasData(data.temperatureTransfer)) {
    const optionalPoints = parseTemperaturePoints(data.temperatureTransfer, {
      xKey: "VGS", yKey: "ID", temperatures: data.temperatureTransferTemperatures, yUnit: data.temperatureTransferUnit
    });
    const groups = groupBy(optionalPoints, "TEMP");
    if (groups.size < 2) throw new Error("MOSFET温度特性は2温度以上のデータを入力してください。");
    const samples = [...groups].map(([sampleTemperature, samplePoints]) => ({
      temperature: sampleTemperature,
      ...fitMosfetTransfer(samplePoints).parameters
    }));
    const nominal = samples.reduce((best, sample) => (
      Math.abs(sample.temperature - temperature) < Math.abs(best.temperature - temperature) ? sample : best
    ));
    const thresholdFit = linearFit(samples.map(sample => ({
      x: sample.temperature - nominal.temperature,
      y: Number(sample.VTO)
    })));
    const mobilityFit = linearFit(samples.map(sample => ({
      x: Math.log((sample.temperature + 273.15) / (nominal.temperature + 273.15)),
      y: Math.log(Number(sample.KP))
    })));
    mergeOptional(state, { parameters: {
      VTO: nominal.VTO,
      KP: nominal.KP,
      TCV: format(thresholdFit.slope),
      BEX: format(mobilityFit.slope),
      TNOM: format(nominal.temperature)
    } }, {
      name: "VGS-ID @ temperature", columns: ["TEMP", "VGS", "ID"], points: optionalPoints
    }, "VGS-ID @ multiple temperatures");
  }
  if (hasData(data.gateCharge)) {
    const optionalPoints = parseCsvPoints(data.gateCharge, ["VGS", "QG"]);
    const chargeFit = linearFit(optionalPoints.map(point => ({ x: point.VGS, y: point.QG })));
    mergeOptional(state, { parameters: { CGS: format(Math.abs(chargeFit.slope)) }, error: chargeFit.rmse }, {
      name: "QG-VGS", columns: ["VGS", "QG"], points: optionalPoints
    }, "QG-VGS");
  }
  return result(state.parameters, state.curves, state.errors, state.warnings, state.parameterSources);
}

function fitPhoto(data, temperature) {
  const state = { parameters: {}, curves: [], errors: [], warnings: [], parameterSources: {} };
  if (hasData(data.transfer)) {
    const points = parseCsvPoints(data.transfer, ["IF", "IC"]);
    const ratios = points.filter(point => point.IF > 0).map(point => point.IC / point.IF);
    state.parameters.CTR = format(ratios.reduce((a, b) => a + b, 0) / ratios.length);
    state.parameterSources.CTR = "IF-IC";
    state.curves.push({ name: "IF-IC", columns: ["IF", "IC"], points });
  }
  if (hasData(data.ifCtr)) {
    const points = parseCsvPoints(data.ifCtr, ["IF", "CTR"]);
    state.parameters.CTR = format(points.reduce((sum, point) => sum + point.CTR, 0) / points.length);
    state.parameterSources.CTR = "IF-CTR table";
    state.curves.push({ name: "IF-CTR", columns: ["IF", "CTR"], points });
  }
  if (hasData(data.led)) {
    const points = parseCsvPoints(data.led, ["VF", "IF"]);
    mergeOptional(state, fitDiodeJunction(points, "VF", "IF", temperature), {
      name: "LED IF-VF", columns: ["VF", "IF"], points
    }, "LED IF-VF");
  } else {
    state.warnings.push("LED IF-VFデータがないため入力LEDのIS/N/RSは設定しません。");
  }
  if (!state.parameters.CTR) throw new Error("PhotoCouplerはIF-CTRまたはIF-ICを入力してください。");

  if (hasData(data.couplingCapacitance)) {
    const points = parseCsvPoints(data.couplingCapacitance, ["VCE", "CCE"]);
    mergeOptional(state, { parameters: { CCE: format(median(points.map(point => point.CCE))) } }, {
      name: "CCE-VCE", columns: ["VCE", "CCE"], points
    }, "CCE-VCE");
  }
  if (hasData(data.temperatureCtr)) {
    const points = parseTemperaturePoints(data.temperatureCtr, {
      xKey: "IF", yKey: "CTR", temperatures: data.temperatureCtrTemperatures, yUnit: "ratio"
    });
    const fit = linearFit(points.map(point => ({ x: point.TEMP - temperature, y: point.CTR })));
    mergeOptional(state, { parameters: { CTRTC: format(fit.slope), TNOM: format(temperature) }, error: fit.rmse }, {
      name: "IF-CTR @ temperature", columns: ["TEMP", "IF", "CTR"], points
    }, "IF-CTR @ multiple temperatures");
  }
  if (hasData(data.responseTime)) {
    const points = parseCsvPoints(data.responseTime, ["RL", "TR", "TF"]);
    const cce = median(points.filter(point => point.RL > 0).map(point => (point.TR + point.TF) / (4.4 * point.RL)));
    mergeOptional(state, { parameters: { CCE: format(cce) } }, {
      name: "tr/tf-RL", columns: ["RL", "TR", "TF"], points
    }, "tr/tf-RL");
  }
  return result(state.parameters, state.curves, state.errors, state.warnings, state.parameterSources);
}

export function fitCharacteristics(variant, data, temperature = 27) {
  data = normalizeInputUnits(variant, data);
  if (variant === "PhotoCoupler-CMOS") return { parameters: {}, curves: [], error: null, warnings: ["CMOSはデータシート設定または外部ライブラリを使用します。曲線フィッティングの対象外です。"], parameterSources: {} };
  if (variant === "PhotoMOS-Relay") return { parameters: {}, curves: [], error: null, warnings: ["メーカーの既存ライブラリを参照します。特性の再フィッティングは行いません。"], parameterSources: {} };
  if (["Thyristor", "Triac"].includes(variant)) return fitThyristor(data.thyristorParameters, variant);
  if (variant.startsWith("Diode")) {
    const fit = fitDiode(data, temperature);
    if (variant === "Diode-Zener" && !hasData(data.reverseIv)) fit.warnings.push("ツェナー降伏を再現するには、降伏領域を含むIR–VRデータを入力してください。未入力では順方向モデルのみ生成します。");
    return fit;
  }
  if (variant.startsWith("BJT")) return fitBjt(data, temperature);
  if (variant.startsWith("MOSFET")) return fitMosfet(data, temperature);
  return fitPhoto(data, temperature);
}

const optional = (stage, key, label, hint, columns = 2) => ({
  stage, key, label: `${label}（任意）`, hint, sample: "", columns
});

export const characteristicInputs = {
  "PhotoMOS-Relay": [],
  "PhotoCoupler-CMOS": [],
  Thyristor: [],
  Triac: [],
  Diode: [
    { stage: "basic", key: "iv", label: "IF–VF特性", hint: "VF [V]  IF [A]", sample: "0.55 0.001\n0.62 0.01\n0.70 0.1" },
    optional("reverse", "reverseIv", "逆方向 IR–VR特性", "VR [V]  IR [A]（正の絶対値・同じ温度。ツェナーは降伏領域も入力）"),
    optional("temperature", "temperatureIv", "IF–VF温度特性", "縦: TEMP, VF, IF / 横: VF, Y1, Y2...（温度系列とY軸単位を下で指定）", 3),
    optional("capacitance", "cjVr", "接合容量特性", "VR [V]  CJ [F]"),
    optional("switching", "reverseRecovery", "逆回復特性", "IR [A]  TRR [s]")
  ],
  BJT: [
    { stage: "basic", key: "vbeIc", label: "VBE–IC特性（基本・任意）", hint: "VBE [V]  IC [A]", sample: "0.55 0.001\n0.62 0.01\n0.69 0.1" },
    { stage: "basic", key: "hfeIc", label: "hFE–IC特性（基本・任意）", hint: "IC [A]  hFE", sample: "0.001 120\n0.01 180\n0.1 150" },
    { stage: "basic", key: "icIb", label: "IC–IB特性（基本・任意）", hint: "IB [A]  IC [A]", sample: "" },
    optional("temperature", "temperatureIc", "VBE–IC温度特性", "縦: TEMP, VBE, IC / 横: VBE, Y1, Y2...（温度系列とY軸単位を下で指定）", 3),
    optional("capacitance", "junctionCapacitance", "コレクタ接合容量", "VCB [V]  CJC [F]"),
    optional("switching", "transitionFrequency", "遷移周波数特性", "IC [A]  FT [Hz]")
  ],
  MOSFET: [
    { stage: "basic", key: "transfer", label: "伝達特性（十分大きいVDS）", hint: "VGS [V]  ID [A]", sample: "2.5 0.05\n3 0.25\n4 1.0\n5 2.25" },
    optional("temperature", "temperatureTransfer", "伝達温度特性", "縦: TEMP, VGS, ID / 横: VGS, Y1, Y2...（温度系列とY軸単位を下で指定）", 3),
    optional("capacitance", "outputCapacitance", "端子間容量特性", "VDS [V]  CISS [F]  COSS [F]  CRSS [F]", 4),
    optional("switching", "gateCharge", "ゲート電荷特性", "VGS [V]  QG [C]")
  ],
  PhotoCoupler: [
    { stage: "basic", key: "ifCtr", label: "IF–CTR特性（IF–ICの代わりに可）", hint: "IF [A]  CTR [ratio]", sample: "0.001 0.7\n0.005 0.9\n0.01 0.8" },
    { stage: "basic", key: "transfer", label: "IF–IC特性（任意）", hint: "IF [A]  IC [A]", sample: "" },
    { stage: "basic", key: "led", label: "入力LED IF–VF特性（任意）", hint: "VF [V]  IF [A]", sample: "" },
    { ...optional("temperature", "temperatureCtr", "CTR温度特性", "縦: TEMP, IF, CTR / 横: IF, Y1, Y2...（温度系列を下で指定）", 3), yQuantity: "ratio" },
    optional("capacitance", "couplingCapacitance", "出力容量特性", "VCE [V]  CCE [F]"),
    optional("switching", "responseTime", "応答時間特性", "RL [ohm]  TR [s]  TF [s]", 3)
  ]
};

characteristicInputs["Diode-Zener"] = characteristicInputs.Diode.map(field => field.key === "reverseIv" ? { ...field, sample: "1 0.00000001\n4 0.00000005\n4.8 0.0001\n5.1 0.001\n5.3 0.01" } : { ...field });
characteristicInputs["Diode-Schottky"] = characteristicInputs.Diode.map(field => field.key === "iv" ? { ...field, sample: "0.20 0.001\n0.28 0.01\n0.38 0.1" } : { ...field });
parameterMappings["Diode-Zener"] = parameterMappings.Diode;
parameterMappings["Diode-Schottky"] = parameterMappings.Diode;

export function inputUnits(field) {
  if (field.stage === "temperature") return field.yQuantity === "ratio" ? ["A", "ratio"] : ["V", "A"];
  const units = [...field.hint.matchAll(/\[([^\]]+)\]/g)].map(match => match[1]);
  while (units.length < (field.columns || 2)) units.push("ratio");
  return units;
}

export function normalizeInputUnits(variant, input) {
  const group = variant.startsWith("BJT") ? "BJT" : variant.startsWith("MOSFET") ? "MOSFET" : variant;
  const data = { ...input };
  const scales = { V: 1, mV: 1e-3, A: 1, mA: 1e-3, uA: 1e-6, F: 1, pF: 1e-12, nF: 1e-9, s: 1, us: 1e-6, ns: 1e-9, Hz: 1, MHz: 1e6, C: 1, nC: 1e-9, ohm: 1, ratio: 1, "%": 0.01 };
  for (const field of characteristicInputs[group] || []) {
    if (!hasData(data[field.key]) || !data[`${field.key}Units`]) continue;
    const bases = inputUnits(field);
    const units = data[`${field.key}Units`];
    const factors = bases.map((base, i) => {
      const unit = units[i] || base;
      const choices = unitChoices(base);
      if (!choices.includes(unit)) throw new Error(`${field.label}: 単位 ${unit} は使用できません。`);
      return scales[unit];
    });
    if (field.stage === "temperature") {
      const points = parseTemperaturePoints(data[field.key], { xKey: "X", yKey: "Y", temperatures: data[`${field.key}Temperatures`], yUnit: "A" });
      data[field.key] = points.map(p => `${p.TEMP} ${p.X * factors[0]} ${p.Y * factors[1]}`).join("\n");
      data[`${field.key}Temperatures`] = "";
      data[`${field.key}Unit`] = "A";
    } else {
      const columns = bases.map((_, i) => `c${i}`);
      data[field.key] = parseCsvPoints(data[field.key], columns).map(p => columns.map((column, i) => p[column] * factors[i]).join(" ")).join("\n");
    }
  }
  return data;
}

export function unitChoices(base) {
  return ({ V: ["V", "mV"], A: ["A", "mA", "uA"], F: ["F", "nF", "pF"], s: ["s", "us", "ns"], Hz: ["Hz", "MHz"], C: ["C", "nC"], ratio: ["ratio", "%"] })[base] || [base];
}
