export function getEarthquakeHistoryStatus(snapshot, status = "idle") {
  const result = (kind, label, hint) => ({ kind, label, hint });
  if (["idle", "loading", "refreshing"].includes(status)) return result("searching", "検索中", "地震データを検索しています");
  if (status === "error") return result("error", "取得失敗", "検索データを取得できませんでした");
  if (snapshot?.cancelled) return result("cancelled", "検索中断", "条件変更のため検索を中断しました");
  if (status === "partial-error") return result("incomplete", "一部取得", "一部のデータの取得に失敗しました。再試行できます");
  if (snapshot?.complete) {
    const count = snapshot.totalMatched ?? snapshot.matchedCount ?? snapshot.items?.length ?? 0;
    return result("complete", "検索結果", !count ? "条件に一致する地震はありません"
      : snapshot.rangeAdjusted && snapshot.availableThrough
        ? `公開済みの最新日 ${snapshot.availableThrough.replaceAll("-", "/")} までの1週間を表示`
        : "地図の震央を選ぶと詳細を表示");
  }
  const missing = snapshot?.unavailableRanges ?? [];
  if (missing.some(range => range.reason !== "jma_not_yet_available")) return result("incomplete", "一部取得", "一部の期間の取得に失敗しました。再試行できます");
  if (snapshot?.invalidRecordCount) return result("invalid", "一部取得", "一部の地震データを表示できません。再試行できます");
  if (snapshot?.unsearchedRanges?.length || snapshot?.limitExceeded) return result("limited", "件数上限", "取得上限に達しました。期間や条件を絞って検索できます");
  const unpublished = missing.filter(range => range.reason === "jma_not_yet_available");
  if (unpublished.length) {
    const through = snapshot.availableThrough ?? unpublished[0].availableThrough;
    return result("unpublished", "公開待ち", through
      ? `気象庁のデータは ${through.replaceAll("-", "/")} まで公開されています`
      : "指定した期間の一部は、気象庁でまだ公開されていません");
  }
  return result("incomplete", "一部取得", "検索は全件取得まで完了していません");
}
