# LTspice Model Package Generator

データシートから得たSPICEパラメータと特性曲線メタデータを入力し、LTspiceですぐ開けるモデルパッケージをブラウザ内だけで生成します。

## 起動

ES Modulesを使うため、任意の静的HTTPサーバーでこのディレクトリを公開し `index.html` を開いてください。

```powershell
python -m http.server 8000
```

`http://localhost:8000` で入力後、`Generate LTspice Model Package` を押します。ZIP処理を含め外部CDNやサーバー通信は使いません。

## 単一HTMLリリース版

次のコマンドで、ローカルサーバー不要の単一HTMLを生成できます。

```powershell
npm run build
```

生成された `dist/LTspiceModelGenerator.html` は、ブラウザで直接開いてオフライン利用できます。

デバイスを選ぶと必要な特性データ欄が切り替わります。各行をCSV形式で入力し、`Fit model parameters` で推定値とRMSEを確認できます。ZIP生成時にも再フィッティングされ、推定したSPICEパラメータ、入力点、誤差が `.lib` と `model.json` に保存されます。

- Diode: `VF, IF` から `IS`, `N`, `RS`
- BJT: `VBE, IC, IB` から `IS`, `N`, `BF`
- MOSFET: `VGS, ID` から `VTO`, `KP`
- PhotoCoupler: `IF, IC` とLEDの `VF, IF` から `CTR`, `IS`, `N`
- Thyristor / Triac: データシートのIGT・VGT・IL・IH・オン電圧・漏れ電流から校正した動作モデルと過渡解析回路。三角形は既存ダイオードと同じ底辺32・高さ24です。
- PhotoMOS-Relay: MOSFET接点出力の4端子リレー（A / K / T1 / T2）。
- PhotoCoupler-CMOS: 電源を持つ5端子ロジック出力フォトカプラ（A / K / VCC / GND / OUT）。

各系列の単位は入力欄の下で選択します。電圧はV/mV、電流はA/mA/uAに対応し、容量・時間・比率なども選択できます。数値を選択した単位として解釈し、フィッティング前に基本単位へ換算します。温度系列のX/Yにも適用します。X/Y入れ替え時の単位は、入れ替え後の特性表示順で指定してください。選択単位を含む入力データは `model.json` の `characteristicInputs`、換算後の点は `characteristicCurves` に保存します。

コメント欄には用途や測定条件を自由に記入できます。コメントは `model.json`、`.lib` のコメント行、`README.txt` に保存されます。

### メーカーの光結合モデルを参照する

PhotoMOS-Relay、またはPhotoCoupler-CMOSで「既存ライブラリを参照」を選んだ場合、取得済みライブラリへの参照を生成します。メーカーのモデル本体は同梱せず、変更・再フィッティングもしません。

1. メーカーからモデルと依存ファイルを取得し、ローカルに配置します。[オムロンG3VMモデル](https://components.omron.com/jp-ja/technical-support/simulation-mosfet-relay)の取得には会員登録・使用許諾への同意が必要です。G3VMはMOSFET接点出力用で、CMOSロジック出力型とは異なります。
2. Device nameには元の `.SUBCKT` 名と異なる名前（例: `MY_RELAY`）を指定します。
3. ライブラリのパスと、メーカーが示す元の `.SUBCKT` 名を入力します。絶対パス、または生成したテスト回路から解決できる相対パスを指定してください。
4. 元モデルの宣言順に合わせて端子順を指定します。例えば出力2・出力1・LEDカソード・LEDアノードの順なら `T2 T1 K A` です。選択肢の各端子を1回ずつ使い、追加端子付きモデルは対象外です。
5. ZIP展開後、元ライブラリの参照先を確認します。検証回路のLED電流（既定5mA）、電源（5V）、負荷は対象部品の仕様に合わせて調整してください。

配布モデル本体は未取得のため、メーカー固有モデルでの解析は未検証です。外部モデルはファイルが存在しなくてもパッケージを生成できますが、LTspice実行時には元ファイルが必要です。

### CMOSロジック出力をデータシートから作成する

`PhotoCoupler-CMOS` の既定モードは「データシートの数値から作成」です。外部ライブラリなしで、次の数値から動作近似モデルを生成します。初期値は入力例なので、対象部品の値に置き換えてください。

- LED点灯／消灯判定電流（mA）、LED順方向電圧（V）とその測定電流（mA）
- 反転／非反転、電源電圧、VOH・VOLと対応するIOH・IOL（電流は絶対値）
- 共通伝搬遅延（ns）、内部ロジックの立上り／立下り時間（ns）、無負荷消費電流（mA）

判定電流の差をヒステリシスとして扱います。出力抵抗はHigh側 `(VCC−VOH)/IOH`、Low側 `VOL/IOL` で近似します。理想的な0Ωは避け、最小1mΩとします。LEDはVFの1点を通るN=2のダイオードで近似します。

立上り／立下り時間は内部ロジックの0–100%遷移時間です。10–90%の値は0.8で割って入力できますが、負荷を接続した実際のOUTの遷移時間を保証するものではありません。伝搬遅延は両エッジ共通で、温度依存・CMTI・電源範囲・出力保護はモデル化しません。電源電圧は出力抵抗算出時の測定条件と検証回路に使い、出力レベルは実際のVCC端子に追従します。

### ばらつき係数

既定は `k=1`、min/maxは空欄です。選んだ対象をk倍します。min/maxは片方だけでも指定でき、`0 < min ≤ k ≤ max` の関係を検証します（未指定側は制約なし）。範囲を指定すると検証回路に `.step param ... list ...` を追加し、min・代表値k・maxの重複しない指定値で解析します。未指定時は単一条件です。

| 部品 | 選択できる対象 |
| --- | --- |
| CMOSロジック出力 | LED判定電流（ON/OFF共通倍率）、遅延・遷移時間、High/Low出力抵抗 |
| ダイオード | IS |
| BJT | BF |
| サイリスタ・トライアック | IGT（全象限共通倍率）、IL/IH、VTO/RD |
| MOSFET | KPまたはVTO |
| トランジスタ出力フォトカプラ | CTR（入力したCTR曲線も同率で変更） |

例えばCMOSの判定電流を選び `k=1, min=0.8, max=1.2` とすると、しきい値が0.8倍・1倍・1.2倍の3条件を比較します。全パラメータを一律に変える方式や統計的Monte Carlo解析ではありません。同じモデル名の全インスタンスでkを共有します。異なる個体条件には別名のモデルを生成してください。外部ライブラリには任意の係数を注入できないため、このUIでのばらつき設定は対象外です。

設定は `model.json` と生成READMEにも保存します。回路で独自に掃引する場合は、`.lib`の`.param K_...`を確認して`.step param`で指定してください。

### サイリスタ／トライアックをデータシートから校正する

Thyristor / Triacを選ぶと、専用の数値入力欄を表示します。従来のBF/IS/RGK調整式モデルは、IGT・IL・IHを直接扱える動作モデルに置き換えています。初期値は入力例で、特定の実部品を示しません。

| 入力 | モデルへの反映 |
| --- | --- |
| IGT [mA] | ゲート電流がしきい値以上になると点弧 |
| VGT [V] | 共通IGT時のゲート電圧にN=2のダイオード特性を合わせる |
| IL [mA] | 点弧中に主電流がILを超えるとラッチ状態を保持 |
| IH [mA] | ゲートを外した後の主電流がIH未満になるとラッチ解除 |
| VDRM [V]・IDRM [µA] | オフ時の線形抵抗 `ROFF=VDRM/IDRM`（逆方向も同じ近似） |
| VTM [V]・ITM [A]など | オン特性 `VT=VTO+RD×IT` を校正 |

オン特性は次の3方式です。

1. **1点＋VTO指定**：`RD=(VTM−VTO)/ITM`。1点だけではVTOとRDを一意に決められないため、VTOはユーザーが曲線などから指定する仮定値です。
2. **2点直線フィット**：`RD=(VT2−VT1)/(IT2−IT1)`、`VTO=VT1−RD×IT1`。同じ温度のオン特性曲線から2点を読み取ってください。
3. **VTO/RD直接指定**：データシートに掲載されている切片と動抵抗をそのまま使います。

トライアックはQI（T2+/G+）の共通IGTに加え、QII（T2+/G−）、QIII（T2−/G−）、QIV（T2−/G+）のIGTを個別指定できます。空欄は共通IGTです。QIVは既定で無効なので、対象デバイスが対応する場合だけチェックしてください。IL・IH・VGT・オン特性は全象限共通です。IGTのばらつき係数はゲートしきい値に作用し、ゲートの電流電圧曲線自体は変えません。

同じ温度・測定条件の値を使用してください。最大保証値を入力した場合は、その値をしきい値とする条件の近似であり、典型的な個体へのフィットではありません。内部状態の時定数10nsは数値安定化用で、実部品のターンオン時間やtqを再現しません。温度依存・dv/dt点弧・di/dt限界・逆回復・破壊・ブレークオーバーは未対応です。VDRMはブレークオーバー電圧ではありません。測定した全曲線との誤差は未評価として保存します。

定義の参考：[ST AN2703 パラメータ一覧](https://www.st.com/resource/en/application_note/cd00183570-parameter-list-for-scrs-triacs-ac-switches-and-diacs-stmicroelectronics.pdf)、[ST AN303 ラッチ電流](https://www.st.com/resource/en/application_note/cd00003854-thyristors-and-triacs-latching-current-stmicroelectronics.pdf)。

フィッティングは基本パラメータを先に求め、その後、対応する入力欄にデータがある場合だけOptional Parameterを追加します。空欄のOptional Parameterは既定値で補わず、モデルにも出力しません。

温度特性は従来の縦持ち形式（`TEMP, X, Y`）に加え、グラフ抽出ツールで一般的な横持ち形式（`X, Y1, Y2...`）を受け付けます。横持ちの場合は、UIの温度系列欄へ`25, 65, 105`のようにY列の温度を指定し、必要に応じてY軸単位を選択してください。タブ区切り内の空セルは欠測点として無視されます。2温度のみの場合は`EG=1.11 eV`に固定して`XTI`を推定し、3温度以上では`EG`と`XTI`を同時推定します。

| Device | Optional特性 | 推定するSPICEパラメータ |
| --- | --- | --- |
| Diode | IF–VF温度特性 / Cj–VR / 逆回復 | `EG`, `XTI`, `TNOM` / `CJO`, `VJ`, `M` / `TT` |
| BJT | VBE–IC温度特性 / CJC–VCB / fT–IC | `EG`, `XTI`, `TNOM` / `CJC`, `VJC`, `MJC` / `TF` |
| MOSFET | VGS–ID温度特性 / CISS・COSS・CRSS / QG–VGS | `VTO`, `KP`, `TCV`, `BEX`, `TNOM` / `CGS`, `CGD`, `CBD` / `CGS` |
| PhotoCoupler | CTR温度特性 / CCE–VCE / tr・tf–RL | `CTRTC`, `TNOM` / `CCE` / `CCE` |

この対応情報の機械可読な定義は `src/model/characteristicFitter.js` の `parameterMappings` にあります。

生成シンボルはLTspice標準半導体シンボルと同じセル形式、標準形状、`PIN ... NONE 0` の端子方式を使います。

## テスト

### ツェナー・ショットキー・逆方向特性

Device / modelから `Diode-Zener` または `Diode-Schottky` を選択できます。専用シンボルはLTspice標準のzener.asy / schottky.asyと同じ形状・端子位置です。初期データは入力例で、対象部品のデータへ置き換えてください。

通常ダイオードを含む3種類に任意の「逆方向 IR–VR特性」欄を追加しました。列順は `VR, IR`、値は正の絶対値です。電流単位はA/mA/uAを選べ、X/Y入れ替えも利用できます。ツェナーは降伏領域まで含む同じ温度の点を入力してください。

逆方向データがあると、順方向IS/N/RSモデルに逆方向の区分線形近似を組み合わせた `.SUBCKT`（Prefix X）を生成します。逆方向データ未入力では従来の `.MODEL D`（Prefix D）を使用し、ツェナーの降伏特性は未校正として表示します。点の重複・負値・電流の減少はエラーです。原点を補い、最大電圧以降は最終区間の傾きで延長します。逆方向の温度依存とBV/IBVの最適化は対象外です。

入力点での補間誤差は0ですが、これは測定精度やシミュレーション誤差の保証ではありません。ZIPには逆方向DC掃引回路と各入力点の直接測定、期待値を同梱します。既存の `run-ltspice-validation.mjs` で評価できます。開発用の3種類の回路は `node scripts/create-diode-validation.mjs` で生成できます。

SCRのモデルレベルはNormalと従来の校正モデルを選択できます。NormalはIGT・VGT・IL・IH・VTO（VT0）・RD（Ron）を使用し、OFF抵抗は数値安定化用1TΩです。APIでは `thyristorParameters: { modelLevel: "normal", IGT, VGT, IL, IH, VT0, Ron }` を指定できます。レベル未指定のAPI入力は従来の校正モデルを維持します。Standardの曲線補間とAdvancedは未実装です。

SCRパッケージにはIGT・IL・IH・オン電圧の4つの独立した `.cir` と、期待値・絶対許容誤差を保存した `validation.json` を同梱します。検証は代表ばらつき係数kで実行します。展開したフォルダを次のCLIに渡すと、LTspiceを非表示で実行し `validation-results.json` を保存します。測定欠落・許容誤差超過は失敗になります。

```powershell
node scripts/create-scr-validation.mjs
node scripts/run-ltspice-validation.mjs "生成またはZIP展開したフォルダ"
```

LTspiceの実行ファイルを変更する場合は第2引数にパスを指定してください。ゲート消失後の保持、IL未満の非保持、IH未満の消弧、線形オン電圧、VGTを検証します。状態時定数10nsは数値設定であり、極短パルスや境界直上の条件は別途評価が必要です。

```powershell
npm test
```

CMOSのLTspice実機検証用ネットリストは `node scripts/create-cmos-smoke.mjs` で一時フォルダに生成できます。表示されたパスをLTspiceの `-b` モードで実行すると、反転／非反転、ヒステリシス、VOH/VOL、遅延、k=0.8/1/1.2の測定結果がログに出ます。

サイリスタ／トライアックは `node scripts/create-thyristor-smoke.mjs` で同様に検証できます。IGTのばらつき3条件、IL未満のゲート除去、IHによる保持・消弧、SCR逆阻止、オン電圧、トライアック全象限とQIV禁止を確認します。

共通モデル情報 `src/model/deviceModel.js` の `pins` が、モデル宣言、シンボルの `SpiceOrder`、テスト回路生成の唯一の端子順定義です。
