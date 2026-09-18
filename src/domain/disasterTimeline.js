const SOURCES = Object.freeze({
  cabinetLessons: {
    label: "内閣府 災害教訓の継承",
    url: "https://www.bousai.go.jp/kyoiku/kyokun/saikyoushiryo.htm"
  },
  jmaNamedEvents: {
    label: "気象庁 災害をもたらした気象事例",
    url: "https://www.jma.go.jp/jma/kishou/know/meishou/meishou_ichiran.html"
  },
  jmaEarthquakeDamage: {
    label: "気象庁 日本付近で発生した主な被害地震",
    url: "https://www.data.jma.go.jp/eqev/data/higai/higai1996-new.html"
  },
  jmaHistoricalEarthquakeDamage: {
    label: "気象庁 過去の地震津波災害",
    url: "https://www.data.jma.go.jp/eqev/data/higai/higai-1995.html"
  },
  mlitFloodReports: {
    label: "国土交通省 水害レポート",
    url: "https://www.mlit.go.jp/river/pamphlet_jirei/suigai_report/index.html"
  },
  jmaNaturalHazardReport2026: {
    label: "気象庁 令和8年度災害時自然現象報告書",
    url: "https://www.jma.go.jp/jma/kishou/books/saigaiji/saigaiji_2026.html"
  },
  jmaShinmoedake2025: {
    label: "気象庁 霧島山（新燃岳）の火山活動",
    url: "https://www.jma.go.jp/jma/kishou/books/hakusho/2026/index8.html"
  },
  jmaChibaRain2026: {
    label: "気象庁 令和8年8月千葉豪雨",
    url: "https://www.data.jma.go.jp/stats/data/bosai/report/2026/20260916/20260916.html"
  }
});

function event(id, occurredOn, category, title, region, summary, source, dateLabel = "") {
  return Object.freeze({
    id,
    occurredOn,
    year: Number.parseInt(occurredOn.slice(0, 4), 10),
    category,
    title,
    region,
    summary,
    source,
    dateLabel
  });
}

/**
 * Public-source-backed selection of major disasters in Japan.
 * This is a learning-oriented chronology, not a complete disaster database.
 */
export const DISASTER_TIMELINE_EVENTS = Object.freeze([
  event("chiba-rain-2026", "2026-08-13", "flood", "令和8年8月千葉豪雨", "千葉県を中心", "線状降水帯による記録的な大雨となり、浸水被害や土砂災害が発生した。", SOURCES.jmaChibaRain2026, "2026年8月13日〜14日"),
  event("kumamoto-2026", "2026-07-28", "earthquake", "令和8年熊本地震", "熊本県熊本地方", "マグニチュード7.1、最大震度7を観測し、建物被害や人的被害が発生した。", SOURCES.jmaEarthquakeDamage),
  event("sanriku-2026", "2026-04-20", "earthquake", "三陸沖の地震", "三陸沖", "マグニチュード7.7、最大震度5強を観測し、北海道から関東地方の太平洋沿岸で津波を観測した。", SOURCES.jmaEarthquakeDamage),
  event("aomori-offshore-2025", "2025-12-08", "earthquake", "青森県東方沖の地震", "青森県東方沖", "マグニチュード7.5、最大震度6強を観測し、北海道・東北地方の太平洋沿岸で津波を観測した。", SOURCES.jmaEarthquakeDamage, "2025年12月8日・12日"),
  event("august-rain-2025", "2025-08-06", "flood", "令和7年8月6日からの大雨", "九州・山口県を中心", "前線や低気圧の影響で記録的な大雨となり、河川氾濫、浸水、土砂災害が発生した。", SOURCES.jmaNaturalHazardReport2026, "2025年8月6日〜12日"),
  event("shinmoedake-2025", "2025-06-22", "volcano", "霧島山（新燃岳）噴火", "宮崎県・鹿児島県境", "7年ぶりに噴火し、その後も断続的な噴火活動と広い範囲での降灰が観測された。", SOURCES.jmaShinmoedake2025, "2025年6月22日〜"),
  event("hyuganada-2025", "2025-01-13", "earthquake", "日向灘の地震", "日向灘", "マグニチュード6.6、最大震度5弱を観測し、宮崎県と高知県で津波を観測した。", SOURCES.jmaEarthquakeDamage),
  event("noto-2024", "2024-01-01", "earthquake", "令和6年能登半島地震", "石川県能登地方を中心", "能登地方で最大震度7を観測し、津波や建物被害、土砂災害、火災が発生した。", SOURCES.jmaEarthquakeDamage),
  event("july-rain-2020", "2020-07-03", "flood", "令和2年7月豪雨", "九州から東北の広い範囲", "長期間の大雨により、河川の氾濫や浸水、土砂災害が各地で発生した。", SOURCES.mlitFloodReports, "2020年7月3日〜31日"),
  event("east-japan-typhoon-2019", "2019-10-10", "flood", "令和元年東日本台風", "東日本を中心", "台風第19号により記録的な大雨となり、多数の河川で氾濫や堤防決壊が発生した。", SOURCES.mlitFloodReports, "2019年10月10日〜13日"),
  event("iburi-2018", "2018-09-06", "earthquake", "平成30年北海道胆振東部地震", "北海道胆振地方", "最大震度7を観測し、広範囲の斜面崩壊と北海道全域の停電が発生した。", SOURCES.jmaEarthquakeDamage),
  event("west-japan-rain-2018", "2018-06-28", "flood", "平成30年7月豪雨", "西日本を中心", "広い範囲で長時間の大雨となり、洪水、浸水、土砂災害が相次いだ。", SOURCES.mlitFloodReports, "2018年6月28日〜7月8日"),
  event("northern-kyushu-rain-2017", "2017-07-05", "flood", "平成29年7月九州北部豪雨", "福岡県・大分県を中心", "線状降水帯による猛烈な雨で、河川の氾濫や大規模な土砂災害が発生した。", SOURCES.jmaNamedEvents, "2017年7月5日〜6日"),
  event("kumamoto-2016", "2016-04-14", "earthquake", "平成28年熊本地震", "熊本県を中心", "一連の地震活動で最大震度7を2度観測し、建物被害や土砂災害が発生した。", SOURCES.jmaEarthquakeDamage, "2016年4月14日〜"),
  event("kanto-tohoku-rain-2015", "2015-09-09", "flood", "平成27年9月関東・東北豪雨", "関東・東北地方", "記録的な大雨により鬼怒川などが氾濫し、広い範囲で浸水被害が発生した。", SOURCES.jmaNamedEvents, "2015年9月9日〜11日"),
  event("ontake-2014", "2014-09-27", "volcano", "御嶽山噴火", "長野県・岐阜県境", "登山者が多い時間帯に噴火し、噴石などにより大きな人的被害が生じた。", SOURCES.jmaNamedEvents),
  event("hiroshima-rain-2014", "2014-08-19", "flood", "平成26年8月豪雨", "広島県広島市を中心", "局地的な猛烈な雨により、多数の土石流とがけ崩れが発生した。", SOURCES.jmaNamedEvents, "2014年8月19日〜20日"),
  event("tohoku-2011", "2011-03-11", "earthquake", "平成23年東北地方太平洋沖地震", "東北地方太平洋沖", "最大震度7を観測し、巨大な津波により東北地方の太平洋沿岸を中心に甚大な被害が発生した。", SOURCES.jmaEarthquakeDamage),
  event("kii-rain-2011", "2011-08-30", "flood", "平成23年台風第12号", "紀伊半島を中心", "長時間の大雨により深層崩壊や河道閉塞、河川氾濫などが発生した。", SOURCES.jmaNamedEvents, "2011年8月30日〜9月5日"),
  event("chuetsu-2004", "2004-10-23", "earthquake", "平成16年新潟県中越地震", "新潟県中越地方", "最大震度7を観測し、山間地で斜面崩壊や集落の孤立が相次いだ。", SOURCES.jmaEarthquakeDamage),
  event("fukui-rain-2004", "2004-07-18", "flood", "平成16年7月福井豪雨", "福井県・岐阜県", "短時間の激しい雨により足羽川などが氾濫し、浸水や土砂災害が発生した。", SOURCES.jmaNamedEvents),
  event("tokai-rain-2000", "2000-09-11", "flood", "平成12年9月東海豪雨", "愛知県・岐阜県・三重県を中心", "停滞した前線と台風の影響で記録的な大雨となり、都市部で大規模な浸水が発生した。", SOURCES.jmaNamedEvents, "2000年9月11日〜12日"),
  event("miyakejima-2000", "2000-06-26", "volcano", "三宅島噴火", "東京都三宅島", "火山活動の活発化と大量の火山ガス放出により、全島避難が長期間続いた。", SOURCES.jmaNamedEvents, "2000年6月〜"),
  event("usu-2000", "2000-03-31", "volcano", "有珠山噴火", "北海道有珠山", "事前の避難が進められた中で噴火し、噴石や地殻変動などの被害が発生した。", SOURCES.jmaNamedEvents),
  event("hanshin-1995", "1995-01-17", "earthquake", "平成7年兵庫県南部地震", "兵庫県南部", "最大震度7を観測し、都市直下の強い揺れで建物倒壊や火災など甚大な被害が発生した。", SOURCES.cabinetLessons),
  event("hokkaido-nansei-1993", "1993-07-12", "earthquake", "平成5年北海道南西沖地震", "北海道南西沖", "強い揺れと大津波により、奥尻島を中心に大きな被害が発生した。", SOURCES.cabinetLessons),
  event("unzen-1990", "1990-11-17", "volcano", "雲仙岳噴火", "長崎県雲仙岳", "長期の噴火活動で溶岩ドームが成長し、火砕流や土石流による被害が続いた。", SOURCES.cabinetLessons, "1990年11月〜1995年2月"),
  event("nagasaki-rain-1982", "1982-07-23", "flood", "昭和57年7月豪雨（長崎大水害）", "長崎県を中心", "短時間の猛烈な雨により、河川氾濫や多数の土砂災害が発生した。", SOURCES.cabinetLessons),
  event("chile-tsunami-1960", "1960-05-24", "earthquake", "チリ地震津波", "北海道から沖縄の太平洋沿岸", "南米チリ沖の巨大地震による津波が日本へ到達し、太平洋沿岸に被害をもたらした。", SOURCES.cabinetLessons),
  event("isewan-1959", "1959-09-26", "flood", "伊勢湾台風", "東海地方を中心", "高潮、暴風、河川氾濫により伊勢湾沿岸を中心に甚大な被害が発生した。", SOURCES.cabinetLessons),
  event("fukui-1948", "1948-06-28", "earthquake", "福井地震", "福井平野を中心", "福井平野で強い揺れとなり、建物倒壊や火災など大きな被害が発生した。", SOURCES.cabinetLessons),
  event("kathleen-1947", "1947-09-14", "flood", "カスリーン台風", "関東・東北地方", "記録的な大雨で利根川や荒川などが氾濫し、関東平野で広範囲の浸水が発生した。", SOURCES.cabinetLessons, "1947年9月14日〜15日"),
  event("tonankai-1944", "1944-12-07", "earthquake", "昭和東南海地震", "紀伊半島東部沖", "東海地方を中心に強い揺れと津波による被害が発生した。", SOURCES.cabinetLessons),
  event("kanto-1923", "1923-09-01", "earthquake", "大正関東地震", "関東地方南部", "強い揺れに加えて大規模火災、津波、土砂災害が重なり、首都圏に甚大な被害が発生した。", SOURCES.cabinetLessons),
  event("tokachidake-1926", "1926-05-24", "volcano", "十勝岳噴火", "北海道十勝岳", "噴火に伴う融雪型火山泥流が発生し、山麓の集落に大きな被害をもたらした。", SOURCES.cabinetLessons),
  event("sakurajima-1914", "1914-01-12", "volcano", "桜島大正噴火", "鹿児島県桜島", "大規模噴火と溶岩流が発生し、桜島と大隅半島が陸続きになった。", SOURCES.cabinetLessons),
  event("meiji-sanriku-1896", "1896-06-15", "earthquake", "明治三陸地震津波", "三陸沿岸", "地震の揺れに比べて非常に大きな津波が来襲し、三陸沿岸に甚大な被害が発生した。", SOURCES.cabinetLessons),
  event("nobi-1891", "1891-10-28", "earthquake", "濃尾地震", "岐阜県・愛知県を中心", "内陸の活断層による巨大地震で、濃尾平野を中心に甚大な被害が発生した。", SOURCES.cabinetLessons),
  event("bandai-1888", "1888-07-15", "volcano", "磐梯山噴火", "福島県磐梯山", "山体崩壊に伴う岩屑なだれが山麓を覆い、河川をせき止めて多数の湖沼を形成した。", SOURCES.cabinetLessons),
  event("asama-1783", "1783-05-09", "volcano", "天明3年浅間山噴火", "群馬県・長野県境", "長期間の活動と大噴火により火砕流や泥流が発生し、広い範囲に被害をもたらした。", SOURCES.cabinetLessons, "1783年5月〜8月"),
  event("fuji-hoei-1707", "1707-12-16", "volcano", "富士山宝永噴火", "富士山南東斜面", "宝永火口から大量の火山灰などを噴出し、江戸を含む広い範囲に降灰した。", SOURCES.cabinetLessons, "1707年12月16日〜1708年1月1日"),

  // 気象庁が名称を定めた主な気象現象
  event("boso-typhoon-2019", "2019-09-08", "flood", "令和元年房総半島台風", "房総半島を中心", "非常に強い風により、住家や電柱、農業施設などに広範囲の被害が発生した。", SOURCES.jmaNamedEvents, "2019年9月8日〜9日"),
  event("northern-kyushu-rain-2012", "2012-07-11", "flood", "平成24年7月九州北部豪雨", "福岡県・熊本県・大分県を中心", "猛烈な雨により河川の氾濫、浸水、土砂災害が相次いだ。", SOURCES.jmaNamedEvents, "2012年7月11日〜14日"),
  event("niigata-fukushima-rain-2011", "2011-07-27", "flood", "平成23年7月新潟・福島豪雨", "新潟県・福島県", "記録的な大雨により五十嵐川や阿賀野川などが氾濫し、浸水や土砂災害が発生した。", SOURCES.jmaNamedEvents, "2011年7月27日〜30日"),
  event("chugoku-kyushu-rain-2009", "2009-07-19", "flood", "平成21年7月中国・九州北部豪雨", "中国地方・九州北部", "局地的な猛烈な雨により、山口県や福岡県を中心に土砂災害と浸水被害が発生した。", SOURCES.jmaNamedEvents, "2009年7月19日〜26日"),
  event("august-rain-2008", "2008-08-26", "flood", "平成20年8月末豪雨", "東海・関東地方を中心", "大気の状態が不安定となり、愛知県などで記録的な大雨と大規模な浸水が発生した。", SOURCES.jmaNamedEvents, "2008年8月26日〜31日"),
  event("july-rain-2006", "2006-07-15", "flood", "平成18年7月豪雨", "長野県・鹿児島県など", "長期間の大雨により天竜川の氾濫、浸水、土砂災害が各地で発生した。", SOURCES.jmaNamedEvents, "2006年7月15日〜24日"),
  event("heavy-snow-2006", "2006-01-01", "snow", "平成18年豪雪", "北陸地方など日本海側", "断続的な大雪により、除雪中の事故や落雪、住家被害、交通障害が相次いだ。", SOURCES.jmaNamedEvents, "2005年12月〜2006年3月"),
  event("niigata-fukushima-rain-2004", "2004-07-12", "flood", "平成16年7月新潟・福島豪雨", "新潟県・福島県", "短時間の激しい雨で河川の堤防決壊や氾濫が相次ぎ、広い範囲が浸水した。", SOURCES.jmaNamedEvents, "2004年7月12日〜13日"),
  event("august-rain-1993", "1993-07-31", "flood", "平成5年8月豪雨", "鹿児島県を中心", "長期間の大雨により鹿児島市などで土砂災害と洪水害が発生した。", SOURCES.jmaNamedEvents, "1993年7月31日〜8月7日"),
  event("july-rain-1983", "1983-07-20", "flood", "昭和58年7月豪雨", "島根県を中心", "浜田市などで記録的な大雨となり、土砂災害や洪水害が発生した。", SOURCES.jmaNamedEvents, "1983年7月20日〜23日"),
  event("okinoerabu-typhoon-1977", "1977-09-01", "flood", "沖永良部台風", "鹿児島県沖永良部島を中心", "猛烈な風により、沖永良部島で多数の住家が全半壊した。", SOURCES.jmaNamedEvents, "1977年9月"),
  event("july-rain-1972", "1972-07-03", "flood", "昭和47年7月豪雨", "西日本から東日本の広い範囲", "長期間の大雨により河川氾濫や土砂崩れが相次ぎ、各地に大きな被害が発生した。", SOURCES.jmaNamedEvents, "1972年7月3日〜13日"),
  event("low-pressure-1970", "1970-01-30", "flood", "昭和45年1月低気圧", "日本列島の太平洋側を中心", "急速に発達した低気圧により暴風、高波、大雪などの被害が発生した。", SOURCES.jmaNamedEvents, "1970年1月30日〜2月2日"),
  event("third-miyakojima-typhoon-1968", "1968-09-01", "flood", "第3宮古島台風", "沖縄県宮古島を中心", "猛烈な風により宮古島で多数の住家が損壊した。", SOURCES.jmaNamedEvents, "1968年9月"),
  event("july-rain-1967", "1967-07-07", "flood", "昭和42年7月豪雨", "九州北部・中国・近畿地方", "集中豪雨により土砂崩れや鉄砲水が発生し、佐世保、呉、神戸などで被害が拡大した。", SOURCES.jmaNamedEvents, "1967年7月7日〜10日"),
  event("second-miyakojima-typhoon-1966", "1966-09-01", "flood", "第2宮古島台風", "沖縄県宮古島を中心", "猛烈な風により宮古島で半数を超える住家が損壊した。", SOURCES.jmaNamedEvents, "1966年9月"),
  event("sanin-hokuriku-rain-1964", "1964-07-18", "flood", "昭和39年7月山陰北陸豪雨", "山陰・北陸地方", "大雨により出雲市などで山崩れやがけ崩れ、浸水被害が発生した。", SOURCES.jmaNamedEvents, "1964年7月18日〜19日"),
  event("heavy-snow-1963", "1963-01-01", "snow", "昭和38年1月豪雪", "北陸地方を中心", "長期間の大雪により住家倒壊、交通障害、雪崩などの被害が発生した。", SOURCES.jmaNamedEvents, "1963年1月"),
  event("second-muroto-typhoon-1961", "1961-09-16", "flood", "第2室戸台風", "近畿地方を中心", "非常に強い風と高潮により、大阪湾沿岸などで大きな被害が発生した。", SOURCES.jmaNamedEvents),
  event("baiu-rain-1961", "1961-06-24", "flood", "昭和36年梅雨前線豪雨", "長野県伊那谷など", "梅雨前線による大雨で河川氾濫や土砂災害が発生した。", SOURCES.jmaNamedEvents, "1961年6月24日〜7月10日"),
  event("miyakojima-typhoon-1959", "1959-09-01", "flood", "宮古島台風", "沖縄県宮古島を中心", "猛烈な風により宮古島の多数の住家が損壊した。", SOURCES.jmaNamedEvents, "1959年9月"),
  event("kanogawa-typhoon-1958", "1958-09-26", "flood", "狩野川台風", "伊豆半島・関東地方", "記録的な大雨により狩野川が氾濫し、伊豆半島を中心に甚大な被害が発生した。", SOURCES.jmaNamedEvents),
  event("toyamaru-typhoon-1954", "1954-09-26", "flood", "洞爺丸台風", "北海道・東北地方を中心", "暴風と高波により青函連絡船洞爺丸の遭難など大きな被害が発生した。", SOURCES.jmaNamedEvents),

  // 気象庁が名称を定めた主な地震現象
  event("iwate-miyagi-2008", "2008-06-14", "earthquake", "平成20年岩手・宮城内陸地震", "岩手県内陸南部", "強い揺れにより大規模な山崩れや河道閉塞、道路の寸断が発生した。", SOURCES.jmaNamedEvents),
  event("chuetsu-offshore-2007", "2007-07-16", "earthquake", "平成19年新潟県中越沖地震", "新潟県上中越沖", "最大震度6強を観測し、住家被害や山崩れ、ライフライン被害が発生した。", SOURCES.jmaNamedEvents),
  event("noto-2007", "2007-03-25", "earthquake", "平成19年能登半島地震", "能登半島沖", "最大震度6強を観測し、能登半島を中心に住家被害や山崩れが発生した。", SOURCES.jmaNamedEvents),
  event("tokachi-2003", "2003-09-26", "earthquake", "平成15年十勝沖地震", "十勝沖", "強い揺れと津波を観測し、石油タンクのスロッシングによる火災などが発生した。", SOURCES.jmaNamedEvents),
  event("geiyo-2001", "2001-03-24", "earthquake", "平成13年芸予地震", "安芸灘", "中国・四国地方で強い揺れを観測し、住家被害や液状化が発生した。", SOURCES.jmaNamedEvents),
  event("tottori-west-2000", "2000-10-06", "earthquake", "平成12年鳥取県西部地震", "鳥取県西部", "最大震度6強を観測し、住家被害、山崩れ、液状化が発生した。", SOURCES.jmaNamedEvents),
  event("sanriku-haruka-1994", "1994-12-28", "earthquake", "平成6年三陸はるか沖地震", "三陸沖", "青森県で震度6を観測し、住家や道路などに被害が発生した。", SOURCES.jmaNamedEvents),
  event("hokkaido-east-1994", "1994-10-04", "earthquake", "平成6年北海道東方沖地震", "北海道東方沖", "北海道東部と北方四島で強い揺れとなり、津波も観測された。", SOURCES.jmaNamedEvents),
  event("kushiro-offshore-1993", "1993-01-15", "earthquake", "平成5年釧路沖地震", "釧路沖", "深い震源の地震で釧路市などが強く揺れ、住家や構造物に被害が発生した。", SOURCES.jmaNamedEvents),
  event("nagano-west-1984", "1984-09-14", "earthquake", "昭和59年長野県西部地震", "長野県西部", "御嶽山で大規模な山崩れが発生し、王滝村を中心に大きな被害が発生した。", SOURCES.jmaNamedEvents),
  event("japan-sea-1983", "1983-05-26", "earthquake", "昭和58年日本海中部地震", "秋田県沖", "日本海沿岸を津波が襲い、液状化や港湾、船舶などにも大きな被害が発生した。", SOURCES.jmaNamedEvents),
  event("urakawa-offshore-1982", "1982-03-21", "earthquake", "昭和57年浦河沖地震", "浦河沖", "浦河町で震度6を観測し、道路や橋、建物などに被害が発生した。", SOURCES.jmaNamedEvents),
  event("miyagi-offshore-1978", "1978-06-12", "earthquake", "1978年宮城県沖地震", "宮城県沖", "都市部で強い揺れとなり、ブロック塀の倒壊やライフライン被害が相次いだ。", SOURCES.jmaNamedEvents),
  event("izu-oshima-1978", "1978-01-14", "earthquake", "1978年伊豆大島近海の地震", "伊豆大島近海", "伊豆半島で山崩れ、がけ崩れ、落石などの被害が発生した。", SOURCES.jmaNamedEvents),
  event("izu-peninsula-1974", "1974-05-09", "earthquake", "1974年伊豆半島沖地震", "伊豆半島沖", "伊豆半島南部で強い揺れとなり、地すべりにより住家が埋没する被害が発生した。", SOURCES.jmaNamedEvents),
  event("nemuro-offshore-1973", "1973-06-17", "earthquake", "1973年根室半島沖地震", "根室半島南東沖", "北海道東部で強い揺れと津波を観測し、住家や船舶などに被害が発生した。", SOURCES.jmaNamedEvents),
  event("hachijojima-1972", "1972-12-04", "earthquake", "1972年12月4日八丈島東方沖地震", "八丈島東方沖", "八丈島で震度6を観測し、断水や道路損壊などの被害が発生した。", SOURCES.jmaNamedEvents),
  event("tokachi-1968", "1968-05-16", "earthquake", "1968年十勝沖地震", "三陸沖北部", "青森県を中心に強い揺れとなり、建物被害や山崩れ、地すべりが発生した。", SOURCES.jmaNamedEvents),
  event("hyuganada-1968", "1968-04-01", "earthquake", "1968年日向灘地震", "日向灘", "四国・九州地方で強い揺れと津波を観測し、水産施設などに被害が発生した。", SOURCES.jmaNamedEvents),
  event("ebino-1968", "1968-02-21", "earthquake", "えびの地震", "宮崎県えびの地方", "活発な地震活動が続き、強い揺れにより住家や道路などに被害が発生した。", SOURCES.jmaNamedEvents),
  event("matsushiro-swarm-1965", "1965-08-03", "earthquake", "松代群発地震", "長野県松代町周辺", "約5年間にわたり活発な地震活動が継続し、地すべりや住家被害などが発生した。", SOURCES.jmaNamedEvents, "1965年8月〜約5年間"),
  event("niigata-1964", "1964-06-16", "earthquake", "新潟地震", "新潟県下越沖", "強い揺れと津波に加え、液状化や石油タンク火災、橋梁被害が発生した。", SOURCES.jmaNamedEvents),
  event("echizen-offshore-1963", "1963-03-27", "earthquake", "越前岬沖地震", "越前岬沖", "北陸地方で強い揺れとなり、山崩れや道路亀裂などの被害が発生した。", SOURCES.jmaNamedEvents),
  event("miyagi-north-1962", "1962-04-30", "earthquake", "宮城県北部地震", "宮城県北部", "宮城県で強い揺れとなり、鉄道、道路、橋梁などに被害が発生した。", SOURCES.jmaNamedEvents),
  event("kita-mino-1961", "1961-08-19", "earthquake", "北美濃地震", "石川・福井・岐阜県境", "山間部で強い揺れとなり、山崩れや道路損壊などの被害が発生した。", SOURCES.jmaNamedEvents),

  // 気象庁が名称を定めた主な火山現象
  event("kuchinoerabu-2015", "2015-05-29", "volcano", "平成27年口永良部島噴火", "鹿児島県口永良部島", "爆発的噴火で火砕流が海岸付近まで到達し、全島避難が行われた。", SOURCES.jmaNamedEvents),
  event("izu-oshima-eruption-1986", "1986-11-15", "volcano", "昭和61年伊豆大島噴火", "東京都伊豆大島", "山腹から溶岩が流出し、島民の全島避難が約1か月続いた。", SOURCES.jmaNamedEvents),
  event("miyakejima-eruption-1983", "1983-10-03", "volcano", "昭和58年三宅島噴火", "東京都三宅島", "山腹の割れ目から溶岩が流出し、住家の埋没や焼失などの被害が発生した。", SOURCES.jmaNamedEvents),
  event("usu-eruption-1977", "1977-08-07", "volcano", "1977年有珠山噴火", "北海道有珠山", "大規模な噴火と降灰が続き、農林業被害や火山泥流による被害が発生した。", SOURCES.jmaNamedEvents),

  // 1700年以降の主な歴史地震・津波
  event("nankai-1946", "1946-12-21", "earthquake", "昭和南海地震", "紀伊半島沖", "西日本の広い範囲で強い揺れと津波が発生し、太平洋沿岸に大きな被害をもたらした。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("mikawa-1945", "1945-01-13", "earthquake", "三河地震", "愛知県三河地方", "三河地方で強い揺れとなり、住家倒壊など大きな被害が発生した。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("tottori-1943", "1943-09-10", "earthquake", "鳥取地震", "鳥取県東部", "鳥取市を中心に強い揺れとなり、住家倒壊や火災など大きな被害が発生した。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("showa-sanriku-1933", "1933-03-03", "earthquake", "昭和三陸地震", "三陸沖", "強い津波が三陸沿岸を襲い、多数の集落で甚大な被害が発生した。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("kita-izu-1930", "1930-11-26", "earthquake", "北伊豆地震", "静岡県伊豆地方", "丹那断層などが活動し、伊豆地方で住家倒壊や山崩れが発生した。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("kita-tango-1927", "1927-03-07", "earthquake", "北丹後地震", "京都府北部", "丹後半島で強い揺れとなり、住家倒壊や火災、地割れが発生した。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("kita-tajima-1925", "1925-05-23", "earthquake", "北但馬地震", "兵庫県北部", "豊岡や城崎を中心に強い揺れと火災により大きな被害が発生した。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("rikuu-1896", "1896-08-31", "earthquake", "陸羽地震", "秋田県・岩手県境", "横手盆地周辺で強い揺れとなり、住家倒壊や山崩れが発生した。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("shonai-1894", "1894-10-22", "earthquake", "庄内地震", "山形県庄内地方", "庄内平野で強い揺れとなり、住家倒壊や大規模な火災が発生した。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("hamada-1872", "1872-03-14", "earthquake", "浜田地震", "島根県浜田市周辺", "石見地方で強い揺れと津波が発生し、住家倒壊や火災、山崩れをもたらした。", SOURCES.jmaHistoricalEarthquakeDamage),
  event("hietsu-1858", "1858-04-09", "earthquake", "飛越地震", "飛騨・越中地方", "跡津川断層が活動し、大規模な山崩れと河道閉塞が発生した。", SOURCES.cabinetLessons),
  event("ansei-edo-1855", "1855-11-11", "earthquake", "安政江戸地震", "江戸とその周辺", "江戸の市街地で強い揺れとなり、住家倒壊や火災など大きな被害が発生した。", SOURCES.cabinetLessons),
  event("ansei-tokai-nankai-1854", "1854-12-23", "earthquake", "安政東海地震・安政南海地震", "東海から四国の太平洋沿岸", "2日続けて巨大地震が発生し、強い揺れと津波が太平洋沿岸の広い範囲を襲った。", SOURCES.cabinetLessons, "1854年12月23日〜24日"),
  event("zenkoji-1847", "1847-05-08", "earthquake", "善光寺地震", "長野盆地周辺", "強い揺れと山崩れが発生し、犀川の河道閉塞と決壊による洪水も起きた。", SOURCES.cabinetLessons),
  event("hoei-earthquake-1707", "1707-10-28", "earthquake", "宝永地震", "東海・近畿・四国地方", "南海トラフ沿いの巨大地震で、広い範囲が強く揺れ、太平洋沿岸を津波が襲った。", SOURCES.cabinetLessons),
  event("genroku-1703", "1703-12-31", "earthquake", "元禄地震", "関東地方南部", "房総半島や相模湾沿岸で強い揺れと津波が発生し、大きな被害をもたらした。", SOURCES.cabinetLessons)
]);

export const DISASTER_TIMELINE_CATEGORIES = Object.freeze([
  Object.freeze({ id: "all", label: "すべて" }),
  Object.freeze({ id: "earthquake", label: "地震・津波" }),
  Object.freeze({ id: "volcano", label: "火山" }),
  Object.freeze({ id: "flood", label: "風水害" }),
  Object.freeze({ id: "snow", label: "雪害" })
]);

export function getDisasterTimelineEra(year) {
  if (year >= 2000) return "2000-present";
  if (year >= 1950) return "1950-1999";
  return "before-1950";
}

export function filterDisasterTimelineEvents(events = DISASTER_TIMELINE_EVENTS, filters = {}) {
  const category = filters.category || "all";
  const era = filters.era || "all";
  const query = String(filters.query || "").trim().toLocaleLowerCase("ja");
  const direction = filters.direction === "asc" ? 1 : -1;

  return events
    .filter((item) => category === "all" || item.category === category)
    .filter((item) => era === "all" || getDisasterTimelineEra(item.year) === era)
    .filter((item) => {
      if (!query) return true;
      return [item.title, item.region, item.summary, item.dateLabel, String(item.year)]
        .join(" ")
        .toLocaleLowerCase("ja")
        .includes(query);
    })
    .sort((a, b) => direction * a.occurredOn.localeCompare(b.occurredOn));
}

export function formatDisasterTimelineDate(item) {
  if (item.dateLabel) return item.dateLabel;
  const [year, month, day] = item.occurredOn.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}
