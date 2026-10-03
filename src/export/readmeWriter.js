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
${model.characteristicCurves.some(curve => curve.name === "IR-VR") ? `${model.deviceName}_reverse.cir : 逆方向DC掃引と入力点の直接測定\nvalidation.json : IR–VR測定の期待値・許容誤差\n` : ""}
${model.variant === "Thyristor" ? `${model.deviceName}_{igt,il,ih,on_voltage}.cir : 独立したSCR検証回路\nvalidation.json : 各.measの期待値・絶対許容誤差（代表値kで検証）\n` : ""}

3. Pin Assign（SPICE端子順）
${pins}

ユーザーコメント:
${model.comment || "なし"}

ばらつき係数:
${model.variation?.target ? `対象: ${model.variation.target}\nk=${model.variation.k}, min=${model.variation.min ?? "未設定"}, max=${model.variation.max ?? "未設定"}\n対象値をk倍します。min/max指定時は検証回路の.stepで各指定値を比較します。同一モデルの全インスタンスに共通で、ランダム個体差ではありません。` : "外部モデルのため対象外"}

CMOSデータシート設定（基本単位: V/A/s）:
${model.cmosParameters ? `${JSON.stringify(model.cmosParameters, null, 2)}\n出力抵抗はVOH/IOH・VOL/IOLから算出。伝搬遅延は両エッジ共通。TR/TFは内部ロジックの0–100%遷移時間で、OUTの遷移は負荷にも依存します。温度依存・CMTI・保護動作は対象外。初期値は部品固有の保証値ではありません。` : "なし"}

サイリスタ／トライアックのデータシート設定（V/A/Ω）:
${model.thyristorParameters ? `モデルレベル: ${model.modelLevel}\nVT0=VTO、Ron=RD。NormalのOFF抵抗は数値安定化用1TΩです。ラッチ成立はIA>=IL、保持解除はIA<IH。ゲート条件が継続する場合はラッチ解除後もゲートによる導通が可能です。\n` : ""}
${model.thyristorParameters ? `${JSON.stringify(model.thyristorParameters, null, 2)}\nVT=VTO+RD*IT。onMode=pointはVTOを仮定した1点校正、twoは2点直線フィット、directは直接入力です。IGT、IL、IHを動作しきい値に使用。VGTは共通IGTにおけるゲート電圧。従来の校正モデルは漏れ抵抗=VDRM/IDRM（逆方向も共通）、Normalは数値安定化用1TΩ。トライアックのQII/QIII/QIVはIGTのみ個別設定でき、QIVはq4Enabledがtrueのときのみ点弧します。IL/IH/VGT/オン特性は全象限共通。内部状態の時定数10nsは数値安定化用で、tq等の実部品の時間特性ではありません。温度、dv/dt、di/dt、ブレークオーバー、絶対最大定格超過時の破壊は未モデル化です。` : "なし"}

外部モデル:
${model.externalModel ? `参照先: ${model.externalModel.libraryPath}\n.SUBCKT: ${model.externalModel.subcircuit}\n元モデルの端子順: ${model.externalModel.pinOrder.join(" ")}\nモデル本体は同梱されていません。メーカーから取得した元ファイルと依存ライブラリを参照先に配置してください。電源・LED電流・負荷は使用部品の定格に合わせて調整してください。` : "なし"}

4. 使用した特性データ
${curves}
${model.characteristicCurves.some(curve => curve.name === "IR-VR") ? "IR–VRはVR[V], IR[A]の正の絶対値です。区分線形補間をSUBCKT内で再現し、原点(0,0)を補います。最大入力電圧を超える領域は最終区間の傾きで延長します。逆方向の温度依存は未対応。元の順方向ダイオードと容量・逆回復パラメータは保持し、静的漏れのみ補正します。降伏部を入力した場合にその降伏特性を再現します。BV/IBVの物理パラメータ最適化ではありません。" : ""}

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
