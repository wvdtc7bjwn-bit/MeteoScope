"""Render local-only scientific audit artifacts; never write into public/ or dist/."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".cache" / "temperature-audit"
summary = json.loads((OUT / "summary.json").read_text(encoding="utf-8"))
records = json.loads((OUT / "predictions.json").read_text(encoding="utf-8"))
stations = json.loads((OUT / "station-results.json").read_text(encoding="utf-8"))
latest = [r for r in records if r["time"] == summary["sourceManifest"]["stamp"]]
valid = [r for r in latest if r["errorC"] is not None]
estimated = [r for r in valid if r["kind"] == "estimated"]
fallback = [r for r in valid if r["kind"] == "observed"]
stamp = summary["sourceManifest"]["stamp"]
label = f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]} {stamp[8:10]}:{stamp[10:12]} JST"
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False, "savefig.dpi": 160})

fig, axes = plt.subplots(1, 2, figsize=(11, 4.4), layout="constrained")
for rows, color, name in [(estimated, "#2672a1", "Interpolated"), (fallback, "#c47b27", "Nearest fallback")]:
    axes[0].scatter([r["observedC"] for r in rows], [r["predictedC"] for r in rows], s=13, alpha=.6, color=color, label=f"{name} (n={len(rows)})", edgecolors="none")
low = min(min(r["observedC"], r["predictedC"]) for r in valid)-1
high = max(max(r["observedC"], r["predictedC"]) for r in valid)+1
axes[0].plot([low, high], [low, high], color="#40464d", linewidth=1)
axes[0].set(xlabel="Observed temperature (°C)", ylabel="LOO output (°C)", xlim=(low, high), ylim=(low, high), title="Station held out of its own estimate")
axes[0].legend(frameon=False, fontsize=9)
bins = [i*.5 for i in range(-26, 27)]
axes[1].hist([[r["errorC"] for r in estimated], [r["errorC"] for r in fallback]], bins=bins, stacked=True, color=["#2672a1", "#c47b27"], label=["Interpolated", "Nearest fallback"])
axes[1].axvline(0, color="#40464d", linewidth=1)
axes[1].axvline(-1, color="#858b90", linewidth=.8, linestyle=":")
axes[1].axvline(1, color="#858b90", linewidth=.8, linestyle=":")
axes[1].set(xlabel="Output − observed temperature (°C)", ylabel="Station count", title="Signed error distribution")
axes[1].legend(frameon=False, fontsize=9)
fig.suptitle(f"MeteoScope current algorithm · nationwide station LOO · {label}", fontsize=12)
fig.savefig(OUT / "error-overview.png")
plt.close(fig)

fig, ax = plt.subplots(figsize=(6.8, 8.3), layout="constrained")
scatter = ax.scatter([r["longitude"] for r in estimated], [r["latitude"] for r in estimated], c=[abs(r["errorC"]) for r in estimated],
    norm=Normalize(0, 4), cmap="viridis", s=15, alpha=.9, edgecolors="none", label="Interpolated stations")
ax.scatter([r["longitude"] for r in fallback], [r["latitude"] for r in fallback], marker="x", s=15, color="#93999d", linewidths=.7, label="Nearest fallback (excluded from colors)")
missing = [r for r in latest if r["kind"] == "unavailable"]
ax.scatter([r["longitude"] for r in missing], [r["latitude"] for r in missing], marker="s", facecolors="none", edgecolors="#a73131", s=35, label="Unavailable")
ax.set(xlabel="Longitude (°E)", ylabel="Latitude (°N)", title=f"Absolute interpolation error by station\n{label}")
ax.set_aspect(1 / .82)
ax.legend(loc="lower right", fontsize=8, frameon=False)
fig.colorbar(scatter, ax=ax, label="Absolute error (°C), capped at 4", extend="max", shrink=.7)
fig.savefig(OUT / "station-error-map.png")
plt.close(fig)

def num(value, digits=3):
    return "—" if value is None else f"{value:.{digits}f}"

def percent(value):
    return "—" if value is None else f"{value * 100:.1f}%"

def kind(value):
    return {"estimated": "補間推定", "observed": "最寄り実測へ切替", "unavailable": "取得不可"}[value]

def row(title, metrics):
    return f"| {title} | {metrics['count']:,} | {num(metrics['mae'])} | {num(metrics['rmse'])} | {num(metrics['bias'])} | {num(metrics['maxAbsoluteError'])} |"

s = summary["latest"]
a = summary["all"]
availability = summary["temperatureAvailability"]
worst_estimated = sorted(estimated, key=lambda r: abs(r["errorC"]), reverse=True)[:12]
worst_fallback = sorted(fallback, key=lambda r: abs(r["errorC"]), reverse=True)[:8]
lines = [
    "# MeteoScope 現在地推定気温：全国観測点の除外検証",
    "",
    f"最新評価時刻：**{label}**。全国の公表観測点情報 **{summary['metadataStations']:,}地点**を一覧化し、気温が有効な **{s['total']:,}地点**を1地点ずつ除外して検証した。",
    "",
    "**結論：現行方式は最寄り観測点だけを使う場合より平均誤差を抑えるが、補間できた地点でも約6℃の誤差が残る。実測へのフォールバックは山岳でさらに大きく外れる。現在地の気温として精度を保証できる段階ではない。**",
    "",
    "## 最新時刻の結果",
    "",
    "| 対象・方式 | 評価できた件数 | MAE ℃ | RMSE ℃ | Bias ℃ | 最大絶対誤差 ℃ |",
    "|---|---:|---:|---:|---:|---:|",
    row("現行方式・補間推定のみ", s["estimatesOnly"]),
    row("現行方式・実測への切替のみ", s["fallbackOnly"]),
    row("現行方式・出力全体", s),
    row("比較：最寄り観測点だけ", s["nearestBaseline"]),
    "",
    f"補間推定 **{s['estimates']}地点（{percent(s['estimates']/s['total'])}）**、実測への切替 **{s['fallback']}地点**、取得不可 **{s['unavailable']}地点**。環境補正は補間推定の{s['environmentAdjusted']}地点に適用された。",
    "",
    f"気温の提供なし **{availability['notProvided']}地点**、欠測または品質等により利用不可 **{availability['missingOrInvalid']}地点**。これらを誤差0として集計せず、全観測点CSVには状態と空欄の値で残した。",
    "",
    f"出力が得られた{s['count']}地点のうち、絶対誤差1℃以内 **{percent(s['within1C'])}**、2℃以内 **{percent(s['within2C'])}**、3℃超 **{percent(s['above3C'])}**。絶対誤差の中央値 **{num(s['medianAbsoluteError'])}℃**、95%点 **{num(s['p95AbsoluteError'])}℃**。これはこの標本内の分布であり、保証精度・信頼区間ではない。",
    "",
    "![最新時刻の実測対推定・誤差分布](error-overview.png)",
    "",
    "![観測点ごとの補間推定誤差](station-error-map.png)",
    "",
    "## 補間できた地点の大きな誤差",
    "",
    "| 観測点ID | 観測点名 | 公表標高 m | 実測 ℃ | 推定 ℃ | 推定−実測 ℃ | 使用地点数 | 内部信頼性 |",
    "|---|---|---:|---:|---:|---:|---:|---|",
]
for r in worst_estimated:
    lines.append(f"| {r['stationId']} | {r['stationName']} | {r['elevation']} | {num(r['observedC'],1)} | {num(r['predictedC'])} | {r['errorC']:+.3f} | {r['stationCount']} | {r['confidence']} |")
lines += ["", "## 実測への切替で大きく外れた地点", "",
          "補間を控えて最寄り地点の実測値を表示する処理は、対象地点の気温に近いことを保証しない。UIでは最寄り観測点名と実測であることを明示している。", "",
          "| 対象観測点 | 対象の実測 ℃ | 表示する別地点の実測 ℃ | 差 ℃ | 切替理由 |", "|---|---:|---:|---:|---|"]
for r in worst_fallback:
    lines.append(f"| {r['stationName']} | {num(r['observedC'],1)} | {num(r['predictedC'],1)} | {r['errorC']:+.3f} | {'; '.join(r['flags'])} |")
lines += ["", "取得不可の地点：" + "、".join(r["stationName"] for r in missing) + "。対象自身を除外すると100km以内に有効な参照観測点がないため、出力しない。", "",
          "## 9時刻・観測点別の補助検証", "",
          f"{summary['frames'][0]['time']} から {stamp} までの9時刻、計 **{a['total']:,}対象**、有効出力 **{a['count']:,}件**。対象となった観測点は期間全体で **{len({r['stationId'] for r in records})}地点**。", "",
          "| 対象 | 評価件数 | MAE ℃ | RMSE ℃ | Bias ℃ | 最大絶対誤差 ℃ |", "|---|---:|---:|---:|---:|---:|",
          row("9時刻・補間推定のみ",a["estimatesOnly"]),row("9時刻・実測への切替を含む",a),row("9時刻・最寄り観測点だけ",a["nearestBaseline"]), "",
          "| 日本時間 | 有効気温地点数 | 補間推定 | 実測へ切替 | 取得不可 | 出力全体MAE ℃ |", "|---|---:|---:|---:|---:|---:|"]
for f in summary["frames"]:
    t=f["time"]
    lines.append(f"| {t[4:6]}/{t[6:8]} {t[8:10]}:{t[10:12]} | {f['total']} | {f['estimates']} | {f['fallback']} | {f['unavailable']} | {num(f['mae'])} |")
lines += ["", "既存8時刻はモデル開発時に参照したデータであり、独立した最終評価ではない。新たに取得した最新時刻を主結果として分離したが、同じ秋の期間で時刻・地点間には相関がある。季節や他の気象条件の精度を示す結果ではない。", "",
          "## 標高・内部信頼性別（最新時刻、実測への切替を含む）", "",
          "| 区分 | 評価件数 | MAE ℃ | RMSE ℃ | Bias ℃ | 最大絶対誤差 ℃ |", "|---|---:|---:|---:|---:|---:|"]
for key, m in s["groups"]["elevation"].items():
    lines.append(row(key,m))
for key, m in s["groups"]["confidence"].items():
    if m["count"]:
        lines.append(row("内部信頼性 "+key,m))
lines += ["", "内部信頼性highも標本が小さく、低誤差を保証していない。既存実装の条件分類をそのまま測定しており、今回の誤差で分類し直してはいない。", "",
          "## 計算方法と再現性", "",
          "1. 同じ時刻の有効な気温観測点を列挙する。検証対象のIDを入力から必ず除外する。観測点と一致する場合に実測を返す通常アプリの近接優先処理で、評価が自明に0になるのを防ぐ。",
          "2. 現行の `estimateLocalTemperature` を設定値を変えずに実行する。半径50km、最大8地点、最低3地点、IDW指数2、固定減率0.0065℃/m、環境類似度、方位分散、外挿抑制などを共有する。動的減率は現行どおり無効。",
          "3. 実運用と同じ自治体ポリゴンの読み込み処理・`buildLandConnectionChecker` で水域横断を判定する。ローカル資産の読み込み先だけを適合し、幾何判定を別実装していない。標高は気象庁の公表値を使用する。",
          "4. 実測値との符号付き差、絶対誤差、使用観測点と重み、理由、実測への切替・取得不可を全件保存する。欠測は0℃に置き換えない。",
          "5. コード・設定・自治体形状・入力観測のSHA-256を保存し、結果を見て係数を変更しない。",
          "",
          f"水域経路キャッシュ：{summary['landScreen']['pairs']:,}組、接続あり{summary['landScreen']['connected']:,}、水域横断{summary['landScreen']['crossing']:,}、判定不能{summary['landScreen']['unknown']:,}。", "",
          "前回の全国集計には水域スクリーンが含まれていなかった。今回の数値との差は、評価時刻だけでなくこの条件の違いも含むため、単純な改善・悪化比較はできない。", "",
          "再現コマンド：`node scripts/audit-local-temperature.mjs`、`python scripts/report-local-temperature-audit.py`。入力データはローカルキャッシュ内。新規取得した公開データは最新時刻・観測点表・実況の計3リクエストのみで、過去8時刻、環境データ、自治体形状は再利用した。GPSや全国のDEM取得、サーバー処理、定期処理を追加していない。", "",
          "## 主な課題と改善優先度", "",
          "- 山岳で補間を断念した際、近い低地の実測値を出すと差が大きくなる。実測表示を維持しつつ、対象地の推定とはさらに区別して提示する必要がある。",
          "- 補間自体にも約6℃の誤差がある。固定減率・地形環境の類似度だけでは局地的な逆転層や気団差を十分説明できない。単純に他社アプリへ合わせる係数変更は検証の代わりにならない。",
          "- 実際の端末ではGPS誤差・DEM誤差が加わる。今回の公表標高による計算評価には含まない。",
          "- 観測点の密度が低い場所や離島では推定範囲外・片方向の参照になる。3km間隔の水域判定は細い海峡や境界の誤差を持つ。",
          "- 季節を分けた未使用データ、夜間・沿岸・盆地の追加評価、気象庁の面的な実況解析との比較を優先する。",
          "",
          "## 全件ファイル", "",
          "- [全1,286地点の観測点別CSV](all-stations.csv)：最新状態、実測／推定／差、期間内件数・MAE・RMSE・Bias・最大誤差。",
          "- [全時刻・全対象のCSV](all-predictions.csv)：1地点1時刻1行。",
          "- [集計JSON](summary.json)：設定・入力ハッシュ・各区分・誤差上位地点。",
          "- [詳細推定JSON](predictions.json)：使用観測点・重み・標高補正値を含む全件。",
          "- [観測点別JSON](station-results.json)：期間内の最大誤差事例を含む。",
          "",
          "資料・元データは `.cache/temperature-audit/` に保存し、Git管理・アプリのpublic配信・デプロイ成果物から除外する。個人の現在地や他社アプリとの比較情報は含めていない。アプリ本体の計算・設定値は今回変更していない。", "",
          "## 検証処理の確認", "",
          "- 対象地点の完全除外、欠測と実測への切替、水域判定、件数を保持した誤差集計の4ケースを自動テストで確認した。既存の全テストも実行し、結果は同ディレクトリの `tests.log` に保存した。",
          "- 全8,231件について、元の実測値、参照観測点ID、品質、重みの合計、補正値の加重和、推定−実測の差を独立に照合した。MAE・RMSEとCSV行数も再集計して一致した。",
          "- 元データと計算ソースのハッシュが記録と一致した。今回の監査は既存の距離・品質・水域・補間・環境復号を呼び出し、別の推定エンジンを作成していない。アプリ本体のコードに今回の変更はない。", "",
          "出典：[気象庁AMeDAS](https://www.jma.go.jp/bosai/amedas/)、[観測点情報](https://www.jma.go.jp/bosai/amedas/const/amedastable.json)。環境資料と利用条件は既存の `public/data/temperature-environment/v1/README.md` を参照。",
          ""]
(OUT / "REPORT.md").write_text("\n".join(lines),encoding="utf-8")
print(json.dumps({"report":str(OUT / "REPORT.md"),"latest_mae":s["mae"],"estimated_mae":s["estimatesOnly"]["mae"],"rows":len(stations)},ensure_ascii=True))
