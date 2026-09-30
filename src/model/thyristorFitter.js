export const thyristorFields = [
  ["IGT", "IGT ゲートトリガ電流（共通／QI）", "mA", 10, "all"],
  ["VGT", "VGT：IGT時のゲート電圧", "V", 0.8, "all"],
  ["IL", "IL ラッチ電流", "mA", 20, "all"],
  ["IH", "IH 保持電流", "mA", 10, "all"],
  ["VDRM", "VDRM 漏れ電流の測定電圧", "V", 600, "all"],
  ["IDRM", "IDRM オフ時漏れ電流", "uA", 5, "all"],
  ["VTO", "VTO オン特性の切片", "V", 0.8, "point,direct"],
  ["RD", "RD オン特性の傾き", "ohm", 0.1, "direct"],
  ["VTM", "VTM オン電圧（第1点）", "V", 1.2, "point,two"],
  ["ITM", "ITM：第1点の測定電流", "A", 4, "point,two"],
  ["VTM2", "オン電圧（第2点）", "V", 1.6, "two"],
  ["ITM2", "第2点の測定電流", "A", 8, "two"],
  ["IGT_Q2", "QIIのIGT（任意・空欄は共通値）", "mA", "", "triac"],
  ["IGT_Q3", "QIIIのIGT（任意・空欄は共通値）", "mA", "", "triac"],
  ["IGT_Q4", "QIVのIGT（任意・空欄は共通値）", "mA", "", "triac4"]
];

export function fitThyristor(input = {}, variant = "Thyristor") {
  const p = Object.fromEntries(thyristorFields.map(([key, , unit, value]) => [key, value === "" ? null : value * ({ mA: 1e-3, uA: 1e-6 }[unit] || 1)]));
  Object.assign(p, input);
  p.onMode = input.onMode || "point";
  p.q4Enabled = input.q4Enabled ?? false;
  if (!["point", "two", "direct"].includes(p.onMode)) throw new Error("オン特性の計算方法が不正です。");
  if (typeof p.q4Enabled !== "boolean") throw new Error("QIVの対応設定が不正です。");
  const positive = key => {
    if (p[key] === "" || p[key] == null || !Number.isFinite(Number(p[key])) || Number(p[key]) <= 0) throw new Error(`${key}には正の数を指定してください。`);
    p[key] = Number(p[key]);
  };
  for (const key of ["IGT", "VGT", "IL", "IH", "VDRM", "IDRM"]) positive(key);
  if (p.IL < p.IH) throw new Error("ILはIH以上にしてください。");
  if (p.IDRM >= p.IH) throw new Error("IDRMはIHより小さい値にしてください。");
  if (p.onMode === "two") {
    for (const key of ["VTM", "ITM", "VTM2", "ITM2"]) positive(key);
    if (p.ITM2 <= p.ITM || p.VTM2 <= p.VTM) throw new Error("第2点の電流・電圧は第1点より大きくしてください。");
    p.RD = (p.VTM2 - p.VTM) / (p.ITM2 - p.ITM);
    p.VTO = p.VTM - p.RD * p.ITM;
  } else if (p.onMode === "point") {
    for (const key of ["VTO", "VTM", "ITM"]) positive(key);
    p.RD = (p.VTM - p.VTO) / p.ITM;
  }
  for (const key of ["RD", "VTO"]) positive(key);
  if (p.onMode === "direct") { p.VTM = null; p.ITM = null; }
  if (p.onMode !== "two") { p.VTM2 = null; p.ITM2 = null; }
  if (p.VDRM <= p.VTO) throw new Error("VDRMはVTOより大きい値にしてください。");
  for (const key of ["IGT_Q2", "IGT_Q3", "IGT_Q4"]) {
    if (variant !== "Triac" || (key === "IGT_Q4" && !p.q4Enabled)) { p[key] = null; continue; }
    if (p[key] === "" || p[key] == null) p[key] = p.IGT;
    positive(key);
  }
  const warnings = ["入力値を単一温度・測定条件での動作値として使用します。最大定格を典型値と混同しないでください。", "温度依存・dv/dt誤点弧・di/dt制限・tq・破壊／ブレークオーバーは未モデル化。内部状態の時定数10nsは数値安定化用です。"];
  if (p.onMode === "point") warnings.push("VTOを仮定し、VTM/ITMの1点からRDを算出しました。VTOもデータシートまたは曲線から指定してください。");
  if (variant === "Triac") warnings.push("IL・IH・VGT・オン特性は全象限共通。象限差はIGTのみ設定できます。");
  return { parameters: p, error: null, warnings, parameterSources: {
    IGT: "データシートのゲートトリガ電流", IL: "データシートのラッチ電流", IH: "データシートの保持電流",
    VTO: p.onMode === "two" ? "オン特性の2点直線フィット" : "ユーザー指定",
    RD: p.onMode === "direct" ? "ユーザー指定" : "オン特性から算出", ROFF: "VDRM / IDRM"
  }, curves: p.onMode === "direct" ? [] : [{ name: "On-state VT-IT", columns: ["VT", "IT"], points: [
    { VT: p.VTM, IT: p.ITM }, ...(p.onMode === "two" ? [{ VT: p.VTM2, IT: p.ITM2 }] : [])
  ] }] };
}
