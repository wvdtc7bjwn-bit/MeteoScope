# 数値計算ワークスペース

左上の機能メニュー → 「数値計算」。処理はブラウザの専用Worker内で実行し、外部APIへの送信・Pythonのサーバー実行はしない。

## 計算項目

| 項目 | 出力 |
| --- | --- |
| 熱力学 | 温位、露点、混合比、比湿、仮温度、密度、乾燥断熱線 |
| 鉛直解析 | 温度・露点、温位、乾燥N²、風成分・鉛直シア |
| 湿潤熱力学 | 相当温位、湿球温度、LCL前後の乾燥・液水擬似断熱線 |
| 雲底高度の目安（LCL） | LCL温度・気圧、出発点からの理想化高度差 |
| 可降水量・湿潤静的エネルギー | 入力範囲の比湿圧力積分、層別・累積水蒸気量、cp T+gz+Lv q |
| 勾配Richardson数 | 隣接層差分の乾燥Ri、シアがゼロの未定義層 |
| 気圧と層厚 | 平均仮温度による測高公式 |
| 移流・拡散 | 周期境界の1次元差分計算とFourier参照解・RMSE |
| 減衰・浮力振動 | RK4、解析解、誤差（不足・臨界・過減衰） |
| 地衡風 | 等圧面の高度勾配から風成分・速さ |
| 温度風 | 温度勾配から上下の地衡風差 |
| コリオリ・慣性振動 | f、周期、慣性半径、Rossby数、風成分 |
| 黒体・灰色体の放射 | 発散度、正味放射、Wien波長、Planck分布 |

結果の「計算過程」を開くと式、実際の入力値の代入、中間値、単位換算、近似の注意点を表示する。鉛直解析は最下層の隣接2層、数値実験は最初の1ステップを具体例として解説し、全結果はCSVに保存できる。

## 入力・適用範囲

- 鉛直CSV列は `pressure_hpa,height_m,temp_c,rh_percent,u_ms,v_ms`。高度は昇順、気圧は降順、3〜300層・100KB以内。付属サンプルは架空のデータ。
- Magnus式は液水基準の近似で、低温の氷面飽和を扱わない。既存の熱力学の乾燥経路は凝結による潜熱を含まない。N²も乾燥静的安定度で、CAPEなどの湿潤診断ではない。
- 湿潤熱力学はBolton相当温位と、Normand法の湿球温度を計算する。液水Magnus式・一定Lv=2.5×10⁶ J/kgの擬似断熱微分方程式をRK4・最大1 hPa刻みで積分。氷相・凝結物の保持を含まず、MetPyと定数・飽和式が異なる。積分温度150〜340 K、上端はLCL気圧より低くする。
- LCLの高度差は乾燥断熱気塊の `cp(T−TL)/g` 近似。海抜高度や実際に観測される雲底ではなく、雲の発生も保証しない。LCL式は既存高層解析と共用し、その動作は変更しない。
- 可降水量は比湿qを `∫q dp/g` で台形積分し、入力した上下端だけを対象とする。外挿せず、全気柱・実降水量とは区別する。MetPyの混合比rによる近似式とは異なる。200 hPa超の粗い層は精度注意を表示。静的エネルギーの高度基準も統一する。
- Riは `N²/シア²`、隣接層差分・平均乾燥温位で評価する。シア≤10⁻¹² s⁻¹はJSON null・CSV空欄・画面「未定義」とし、その層をまたぐ線を描かない。0.25の参照線は乱流の有無を断定するものではない。
- 地衡風・温度風は摩擦・曲率等を含まない。赤道付近の特異性を避ける入力制限がある。
- 移流拡散は一定係数、周期ガウス初期値。風上差分の数値粘性は物理拡散と異なる。`C+2D≤1`、最大20,000ステップ、格子による初期分布の解像制限を検証する。
- RK4は最大20,000ステップ、`ωΔt≤0.2`。本機能の振動モデルは簡略化した線形系であり、大気全体の予報計算ではない。
- 放射は一定放射率の黒体・灰色体で、大気吸収帯や顕熱・潜熱は含まない。放射発散度と分光放射輝度を区別する。
- 研究利用時は観測値、既知解、独立実装との照合が必要。説明表示のみ丸め、内部計算・書き出しは丸めない。

## 書き出し

入力と結果・単位・計算過程をJSON、結果と層別診断をCSVに保存できる。Pythonコードは入力条件を含み、コピーまたは `.py` 保存に対応する。

Python 3.10以上。計算は標準ライブラリ、作図のみmatplotlibが必要。通常実行で作業フォルダーにCSV・PNGを保存する。`--no-plot --no-save` で数値結果のみJSON標準出力。ユーザーの自由文を実行コードへ埋め込まない。

条件・計算項目の変更や閉じる操作でWorkerを終了し、古い結果の表示を防ぐ。

## 検証

`npm run test:numerical-calculation` で固定値、単位・符号、安定条件、保存則、収束、入力検証、解説の完全性、21ケースのJavaScript/Python数値一致を確認する。追加項目は飽和LCL、断熱積分の刻み半減と逆積分、定比湿の既知積分、ゼロシアと乾燥不安定Riも検証する。PythonがPATHにない場合は `METEOSCOPE_TEST_PYTHON` に実行ファイルを指定する。既存の高層観測・雲分類・起動・レスポンシブテストも併用する。

## 参考資料

- [MetPy計算資料](https://unidata.github.io/MetPy/latest/api/generated/metpy.calc.html)
- [Bolton相当温位](https://unidata.github.io/MetPy/latest/api/generated/metpy.calc.equivalent_potential_temperature.html)、[Normand湿球温度](https://unidata.github.io/MetPy/latest/api/generated/metpy.calc.wet_bulb_temperature.html)
- [Richardson数の式](https://unidata.github.io/MetPy/latest/api/generated/metpy.calc.gradient_richardson_number.html)
- [MIT 移流差分法](https://ocw.mit.edu/courses/18-086-mathematical-methods-for-engineers-ii-spring-2006/resources/am52/)
- [NASA 黒体放射](https://lhea.gsfc.nasa.gov/archive/mwmw/mmw_bbody.html)
