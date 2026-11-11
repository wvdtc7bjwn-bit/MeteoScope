# 特殊EEWの解釈（2026-11-11）

## 配信仕様と制約

- Wolfx: https://wolfx.jp/docs/open-api/
- 気象庁: https://www.jma.go.jp/jma/kishou/know/jishin/eew/shikumi/shikumi.html
- PLUM: https://www.data.jma.go.jp/eew/data/nc/plum/
- 精度コード参考: https://dmdata.jp/docs/reference/conversion/json/schema/eew-information/
- 参考実装: https://github.com/YumNumm/EQMonitor/blob/main/app/lib/feature/eew/data/eew_alive_telegram.dart

WolfxのAccuracyは説明文字列であり、生コードの対応を保証する資料ではない。数字だけからIPFや観測点数を推定しない。WarnArea.Typeは予報／警報、Timeは警報発表時刻。地域別PLUM・到達予想時刻は取得できないためunknown/nullを保存する。

EQMonitorの現行mainでは依頼された旧モデルパスが存在せずeqapi_typesを使用している。有効速報の保持と低精度情報の描画除外を分離している点を参考にした。配信元の異なるisPlumなどをWolfxのフィールドとして移植していない。

## 判定

|情報|採用する根拠|波面|
|---|---|---|
|1点検知|原文の観測点数、または完全一致のIPF法(1点)説明|非表示|
|レベル法|精度説明のP波/S波レベル越え等の完全一致|非表示|
|IPF複数点|精度説明のIPF法(2〜4点)完全一致|震央と深さの両精度が利用可能な場合|
|PLUM|対象速報を明示する限定文型|単独では非表示|
|仮定震源|isAssumption|非表示|
|混合|通常方式/IPF法とPLUM法を併用との明示|通常震源の精度条件を満たす場合|
|判定不能|資料にない記述・欠損・コードのみ|非表示|

一般的なPLUM解説を検出する全文部分一致や未定義isPlumフラグは使用しない。原文の文型対応は限定的であり、全電文を解析する実装ではない。情報不足時は正常な速報自体を破棄しない。

## 表示とテスト

仮定震源は円形、通常震源は×印。仮定のM・深さは数値を表示しない。低精度は注意文を表示する。P/S波は概算表記。最終報・取消・EventID別管理・通信方式は既存処理を維持。

localhostには欠損ケース、レベル法、IPF複数点、混合と5秒後の方式遷移を追加。テスト表示は実配信ストアを更新しない。停止・別シナリオ選択時に遷移タイマーを解放する。

実際のWolfx配信原文全種類とiPhone実機での検証は未実施。実配信の説明文字列に未対応の表記がある場合は波面を抑制する。この制限は受信・区域予測震度の表示を停止しない。新規サーバー・通信・課金リソースは追加しない。
