export const cmosFields = [
  ["VCC", "電源電圧（測定条件）", "V", 5],
  ["IF_ON", "LED点灯判定電流", "mA", 1.6],
  ["IF_OFF", "LED消灯判定電流", "mA", 1.2],
  ["VF", "LED順方向電圧", "V", 1.4],
  ["IF_REF", "VFの測定電流", "mA", 5],
  ["VOH", "High出力電圧（IOH時）", "V", 4.5],
  ["IOH", "High出力電流の絶対値", "mA", 4],
  ["VOL", "Low出力電圧（IOL時）", "V", 0.2],
  ["IOL", "Low出力電流", "mA", 4],
  ["TD", "伝搬遅延（立上り・立下り共通）", "ns", 100],
  ["TR", "内部ロジック立上り時間（0–100%）", "ns", 20],
  ["TF", "内部ロジック立下り時間（100–0%）", "ns", 20],
  ["ICC", "無負荷消費電流", "mA", 1]
];

export function validateCmos(input = {}) {
  const defaults = Object.fromEntries(cmosFields.map(([key, , unit, value]) => [key, value * ({ mA: 1e-3, ns: 1e-9 }[unit] || 1)]));
  const p = { ...defaults, ...input };
  for (const [key] of cmosFields) {
    if (p[key] === "" || p[key] == null || !Number.isFinite(Number(p[key])) || Number(p[key]) < 0) throw new Error(`CMOS ${key}: 0以上の数値を指定してください。`);
    p[key] = Number(p[key]);
  }
  for (const key of ["VCC", "IF_ON", "IF_OFF", "VF", "IF_REF", "IOH", "IOL", "TR", "TF"]) {
    if (p[key] <= 0) throw new Error(`CMOS ${key}: 正の値を指定してください。`);
  }
  if (p.IF_OFF >= p.IF_ON) throw new Error("LED消灯判定電流は点灯判定電流より小さくしてください。");
  if (!(p.VOL < p.VOH && p.VOH < p.VCC)) throw new Error("出力電圧は 0 ≤ VOL < VOH < VCC としてください。");
  p.inverting = input.inverting ?? true;
  if (typeof p.inverting !== "boolean") throw new Error("CMOS出力極性が不正です。");
  return p;
}

export function variationTargets(variant, external = false) {
  if (external || variant === "PhotoMOS-Relay") return [];
  if (variant === "PhotoCoupler-CMOS") return [["IF_THRESHOLD", "LED判定電流（ON/OFFを同率で変更）"], ["TIMING", "遅延・立上り・立下り時間"], ["ROUT", "High/Low出力抵抗"]];
  if (variant.startsWith("MOSFET")) return [["KP", "KP：電流係数"], ["VTO", "VTO：しきい値電圧"]];
  if (["Thyristor", "Triac"].includes(variant)) return [["IGT", "IGT：ゲートトリガ電流（全象限）"], ["HOLDING", "IL・IH：ラッチ／保持電流"], ["ON_VOLTAGE", "VTO・RD：オン電圧"]];
  if (variant.startsWith("BJT")) return [["BF", "BF：電流増幅率"]];
  if (variant === "PhotoCoupler") return [["CTR", "CTR：電流伝達率"]];
  return [["IS", "IS：飽和電流"]];
}

export function validateVariation(input = {}, variant, external = false) {
  const targets = variationTargets(variant, external);
  const parse = (value, fallback) => value === "" || value == null ? fallback : Number(value);
  const k = parse(input.k, 1), min = parse(input.min, null), max = parse(input.max, null);
  if (![k, min, max].filter(v => v !== null).every(v => Number.isFinite(v) && v > 0)) throw new Error("ばらつき係数は正の数で指定してください。");
  if ((min !== null && min > k) || (max !== null && max < k)) throw new Error("ばらつき係数は min ≤ k ≤ max としてください。");
  if (!targets.length && (k !== 1 || min !== null || max !== null)) throw new Error("外部ライブラリのばらつき設定には対応していません。");
  const target = input.target || targets[0]?.[0] || null;
  if (targets.length && !targets.some(([key]) => key === target)) throw new Error("この部品で選択できないばらつき対象です。");
  return { k, min, max, target: targets.length ? target : null };
}

export function variationName(model) {
  // A name-specific global parameter avoids collisions between different devices.
  return `K_${[...model.deviceName].map(c => c.charCodeAt(0).toString(16)).join("_")}`;
}

export function variationValues(model) {
  return [...new Set([model.variation?.min, model.variation?.k ?? 1, model.variation?.max].filter(v => v != null))];
}
