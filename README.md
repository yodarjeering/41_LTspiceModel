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

```powershell
npm test
```

共通モデル情報 `src/model/deviceModel.js` の `pins` が、モデル宣言、シンボルの `SpiceOrder`、テスト回路生成の唯一の端子順定義です。
