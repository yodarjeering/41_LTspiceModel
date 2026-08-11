# LTspice Model Package Generator

データシートから得たSPICEパラメータと特性曲線メタデータを入力し、LTspiceですぐ開けるモデルパッケージをブラウザ内だけで生成します。

## 起動

ES Modulesを使うため、任意の静的HTTPサーバーでこのディレクトリを公開し `index.html` を開いてください。

```powershell
python -m http.server 8000
```

`http://localhost:8000` で入力後、`Generate LTspice Model Package` を押します。ZIP処理を含め外部CDNやサーバー通信は使いません。

デバイスを選ぶと必要な特性データ欄が切り替わります。各行をCSV形式で入力し、`Fit model parameters` で推定値とRMSEを確認できます。ZIP生成時にも再フィッティングされ、推定したSPICEパラメータ、入力点、誤差が `.lib` と `model.json` に保存されます。

- Diode: `VF, IF` から `IS`, `N`
- BJT: `VBE, IC, IB` から `IS`, `N`, `BF`
- MOSFET: `VGS, ID` から `VTO`, `KP`
- PhotoCoupler: `IF, IC` とLEDの `VF, IF` から `CTR`, `IS`, `N`

生成シンボルはLTspice標準半導体シンボルと同じセル形式、標準形状、`PIN ... NONE 0` の端子方式を使います。

## テスト

```powershell
npm test
```

共通モデル情報 `src/model/deviceModel.js` の `pins` が、モデル宣言、シンボルの `SpiceOrder`、テスト回路生成の唯一の端子順定義です。
