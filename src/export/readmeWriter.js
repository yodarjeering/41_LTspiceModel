export function writeReadme(model) {
  const pins = model.pins.map(pin => `${pin.spiceOrder} : ${pin.name}`).join("\n");
  const curves = model.characteristicCurves.length
    ? model.characteristicCurves.map((curve, i) => `${i + 1}. ${curve.name || curve.type || "characteristic data"}`).join("\n")
    : "特性曲線データは登録されていません。";
  const sources=Object.keys(model.parameterSources||{}).length?Object.entries(model.parameterSources).map(([key,value])=>`${key}: ${value}`).join("\n"):"自動推定元なし（既定値または手動値）";
  const warnings=model.fittingWarnings?.length?model.fittingWarnings.map(value=>`- ${value}`).join("\n"):"なし";
  return `${model.deviceName} LTspice Model Package
========================================

1. LTspiceでの使い方
このフォルダ内の ${model.deviceName}_test.asc をLTspiceで開き、Runを実行してください。
新しい回路で使う場合は、.ascと同じフォルダに ${model.deviceName}.asy と ${model.deviceName}.lib を置き、Place ComponentのSchematic Directoryから ${model.deviceName} を配置します。
別フォルダへ恒久登録する場合は、LTspiceのSymbol Search PathsとSimulation Library Search Pathsを設定してください。

2. 各ファイルの説明
${model.deviceName}.lib : SPICEモデル本体
${model.deviceName}.asy : モデルに紐づいたLTspiceシンボル
${model.deviceName}_test.asc : 特性確認用テスト回路
model.json : 生成条件・元データ・精度情報
README.txt : この説明書

3. Pin Assign（SPICE端子順）
${pins}

4. 使用した特性データ
${curves}

5. モデルの精度
Fitting error: ${model.fittingError ?? "未評価"}
Temperature: ${model.temperature} degC
Parameter sources:
${sources}
Fitting warnings:
${warnings}

6. 注意事項
本モデルは入力された特性とパラメータに基づく近似です。実機の全動作領域、絶対最大定格、ばらつきを保証しません。
シンボルのSpiceOrderとモデル端子順はmodel.jsonのpinsから共通生成されています。端子順を個別に変更しないでください。
Generator version: ${model.generatorVersion}
Generated at: ${model.generatedAt}
`;
}
