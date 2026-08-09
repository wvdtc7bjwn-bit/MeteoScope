import { TIDE_STATION_NAME_TRANSLATIONS } from "./tideStationNamesEn.js";

const LANGUAGE_STORAGE_KEY = "meteoscope-language";
const LANGUAGE_VALUES = new Set(["ja", "en"]);
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "title", "placeholder", "alt"];
const SKIPPED_ELEMENTS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);
const PLACE_NAME_DATA_URL = "/data/gsi-place-names-romaji.json";
const AMEDAS_STATION_DATA_URL = "https://www.jma.go.jp/bosai/amedas/const/amedastable.json";
const WEATHER_TERMS = new Map([
  ["晴", "Sunny"],
  ["晴れ", "Sunny"],
  ["曇", "Cloudy"],
  ["曇り", "Cloudy"],
  ["くもり", "Cloudy"],
  ["雨", "Rain"],
  ["雪", "Snow"],
  ["霧", "Fog"],
  ["みぞれ", "Sleet"],
  ["大雨", "Heavy rain"],
  ["大雪", "Heavy snow"],
  ["暴風", "storm"],
  ["雷", "thunder"],
  ["雷雨", "Thunderstorms"],
  ["霧雨", "Drizzle"],
  ["風雪強い", "Heavy snow and wind"],
  ["止む", "ending"],
  ["強く降る", "heavy precipitation"]
]);
// JMA official English names for all 111 active volcanoes shown on the volcano map.
const VOLCANO_NAME_TRANSLATIONS = new Map(Object.entries({
  "知床硫黄山": "Shiretoko-Iozan",
  "羅臼岳": "Rausudake",
  "天頂山": "Tenchozan",
  "摩周": "Mashu",
  "アトサヌプリ": "Atosanupuri",
  "雄阿寒岳": "Oakandake",
  "雌阿寒岳": "Meakandake",
  "丸山": "Maruyama",
  "大雪山": "Taisetsuzan",
  "十勝岳": "Tokachidake",
  "利尻山": "Rishirizan",
  "樽前山": "Tarumaesan",
  "恵庭岳": "Eniwadake",
  "倶多楽": "Kuttara",
  "有珠山": "Usuzan",
  "羊蹄山": "Yoteizan",
  "ニセコ": "Niseko",
  "北海道駒ヶ岳": "Hokkaido-Komagatake",
  "恵山": "Esan",
  "渡島大島": "Oshima-Oshima",
  "恐山": "Osorezan",
  "岩木山": "Iwakisan",
  "八甲田山": "Hakkodasan",
  "十和田": "Towada",
  "秋田焼山": "Akita-Yakeyama",
  "八幡平": "Hachimantai",
  "岩手山": "Iwatesan",
  "秋田駒ヶ岳": "Akita-Komagatake",
  "鳥海山": "Chokaisan",
  "栗駒山": "Kurikomayama",
  "鳴子": "Naruko",
  "肘折": "Hijiori",
  "蔵王山": "Zaozan (Zaosan)",
  "吾妻山": "Azumayama",
  "安達太良山": "Adatarayama",
  "磐梯山": "Bandaisan",
  "沼沢": "Numazawa",
  "燧ヶ岳": "Hiuchigatake",
  "那須岳": "Nasudake",
  "高原山": "Takaharayama",
  "男体山": "Nantaisan",
  "日光白根山": "Nikko-Shiranesan",
  "赤城山": "Akagisan",
  "榛名山": "Harunasan",
  "草津白根山": "Kusatsu-Shiranesan",
  "浅間山": "Asamayama",
  "横岳": "Yokodake",
  "新潟焼山": "Niigata-Yakeyama",
  "妙高山": "Myokosan",
  "弥陀ヶ原": "Midagahara",
  "焼岳": "Yakedake",
  "アカンダナ山": "Akandanayama",
  "乗鞍岳": "Norikuradake",
  "御嶽山": "Ontakesan",
  "白山": "Hakusan",
  "富士山": "Fujisan",
  "箱根山": "Hakoneyama",
  "伊豆東部火山群": "Izu-Tobu Volcanoes",
  "伊豆大島": "Izu-Oshima",
  "利島": "Toshima",
  "新島": "Niijima",
  "神津島": "Kozushima",
  "三宅島": "Miyakejima",
  "御蔵島": "Mikurajima",
  "八丈島": "Hachijojima",
  "青ヶ島": "Aogashima",
  "ベヨネース列岩": "Beyonesu (Bayonnaise) Rocks",
  "須美寿島": "Sumisujima (Smith Rocks)",
  "伊豆鳥島": "Izu-Torishima",
  "孀婦岩": "Sofugan",
  "西之島": "Nishinoshima",
  "海形海山": "Kaikata Seamount",
  "海徳海山": "Kaitoku Seamount",
  "噴火浅根": "Funka Asane",
  "硫黄島": "Ioto",
  "北福徳堆": "Kita-Fukutokutai",
  "福徳岡ノ場": "Fukutoku-Oka-no-Ba",
  "南日吉海山": "Minami-Hiyoshi Seamount",
  "日光海山": "Nikko Seamount",
  "三瓶山": "Sanbesan",
  "阿武火山群": "Abu Volcanoes",
  "鶴見岳・伽藍岳": "Tsurumidake and Garandake",
  "由布岳": "Yufudake",
  "九重山": "Kujusan",
  "阿蘇山": "Asosan",
  "雲仙岳": "Unzendake",
  "福江火山群": "Fukue Volcanoes",
  "霧島山": "Kirishimayama",
  "霧島山（新燃岳）": "Kirishimayama (Shinmoedake)",
  "米丸・住吉池": "Yonemaru and Sumiyoshiike",
  "若尊": "Wakamiko",
  "桜島": "Sakurajima",
  "池田・山川": "Ikeda and Yamagawa",
  "開聞岳": "Kaimondake",
  "薩摩硫黄島": "Satsuma-Iojima",
  "口永良部島": "Kuchinoerabujima",
  "口之島": "Kuchinoshima",
  "中之島": "Nakanoshima",
  "諏訪之瀬島": "Suwanosejima",
  "硫黄鳥島": "Io-Torishima",
  "西表島北北東海底火山": "Submarine Volcano NNE of Iriomotejima",
  "茂世路岳": "Moyorodake",
  "散布山": "Chirippusan",
  "指臼岳": "Sashiusudake",
  "小田萌山": "Odamoisan",
  "択捉焼山": "Etorofu-Yakeyama",
  "択捉阿登佐岳": "Etorofu-Atosanupuri",
  "ベルタルベ山": "Berutarubesan",
  "ルルイ岳": "Ruruidake",
  "爺爺岳": "Chachadake",
  "羅臼山": "Raususan",
  "泊山": "Tomariyama"
}));
const ADMIN_TRANSLATIONS = new Map(Object.entries({
  "・ 期限なし": " · No expiration",
  "100MB注意・200MB警戒・350MB危険": "100 MB notice · 200 MB warning · 350 MB critical",
  "Cloudflare の環境変数 ADMIN_PASSWORD を設定してください。": "Set the ADMIN_PASSWORD environment variable in Cloudflare.",
  "Cloudflare内部": "Cloudflare internal",
  "Cloudflare無料枠の使用量を更新しました。": "Cloudflare free-tier usage updated.",
  "Cloudflare無料枠の使用量を取得できませんでした。": "Could not load Cloudflare free-tier usage.",
  "CPU・上限超過": "CPU or limit exceeded",
  "D1 migration 0007までの適用が必要です": "D1 migrations through 0007 are required",
  "D1 migration 0009の適用が必要": "D1 migration 0009 is required",
  "D1書込行数": "D1 rows written",
  "D1読取行数": "D1 rows read",
  "D1保存容量": "D1 storage",
  "DAU（UTC当日）": "DAU (current UTC day)",
  "Discordテスト投稿に失敗しました。": "Discord test post failed.",
  "DiscordへTEST表記の地震情報を1件投稿しますか？": "Post one earthquake message marked TEST to Discord?",
  "Discordへ送信中...": "Sending to Discord...",
  "DOリクエスト": "DO requests",
  "DO実行時間": "DO execution time",
  "Workersリクエスト": "Worker requests",
  "アカウントと関連データを削除中...": "Deleting account and related data...",
  "アカウントを削除できませんでした。": "Could not delete the account.",
  "アカウントを読み込み中...": "Loading accounts...",
  "アカウント一覧を更新しました。": "Account list updated.",
  "アカウント一覧を取得できませんでした。": "Could not load the account list.",
  "アカウント数": "Accounts",
  "エラー 0件": "0 errors",
  "お知らせはありません。": "No notices.",
  "お知らせを保存しました。": "Notices saved.",
  "お知らせを保存中...": "Saving notices...",
  "お知らせ本文を入力してください。": "Enter the notice text.",
  "キャッシュ削除": "Clear cache",
  "キャッシュ削除APIを実行中...": "Running the cache-clear API...",
  "クイズ完了（24時間）": "Quiz completions (24 hours)",
  "クライアント切断": "Client disconnected",
  "このコードを使用中の全端末を解除し、利用数を0台に戻しますか？各端末ではシリアルコードの再入力が必要です。": "Release every device using this code and reset usage to zero? Each device will need to enter the serial code again.",
  "このコードを失効しますか？認証済み端末でも利用できなくなります。": "Revoke this code? Authenticated devices will no longer be able to use it.",
  "シリアルコードが返されませんでした。": "No serial code was returned.",
  "シリアルコードを失効しました。": "Serial code revoked.",
  "シリアルコードを発行しました。": "Serial code issued.",
  "シリアルコードを発行できませんでした。": "Could not issue the serial code.",
  "シリアルコードを発行中...": "Issuing serial code...",
  "スクリプト例外": "Script exception",
  "テロップ表示": "Ticker display",
  "プッシュ通知を配信中...": "Sending push notification...",
  "プッシュ通知を予約できませんでした。": "Could not schedule the push notification.",
  "ログインできませんでした。": "Could not sign in.",
  "一部取得不可": "Partially unavailable",
  "完了": "Completed",
  "完了しました。": "Completed.",
  "現在時刻": "Current time",
  "更新中": "Updating",
  "最終自動整理": "Last automatic cleanup",
  "取得不可": "Unavailable",
  "詳細挑戦履歴": "Detailed attempt history",
  "上限接近": "Near limit",
  "設定を保存しました。": "Settings saved.",
  "設定を保存中...": "Saving settings...",
  "設定更新": "Settings update",
  "設定済み": "Configured",
  "地震D1保存容量": "Earthquake D1 storage",
  "地図に有効な投稿": "Map-visible reports",
  "挑戦履歴の保持": "Attempt history retention",
  "通常カード表示": "Standard card display",
  "通知": "Notification",
  "通知タイトルと本文を入力してください。": "Enter the notification title and body.",
  "通知履歴と関連するD1データを削除しました。": "Notification history and related D1 data deleted.",
  "通知履歴を削除できませんでした。": "Could not delete notification history.",
  "通知履歴を削除中...": "Deleting notification history...",
  "登録済みアカウントはありません。": "No registered accounts.",
  "投稿アカウント（UTC当日）": "Contributing accounts (current UTC day)",
  "読み込みました。": "Loaded.",
  "読み込み中...": "Loading...",
  "配信対象の通知購読端末はありませんでした。": "No subscribed devices matched this notification.",
  "配信待ち": "Queued",
  "配信中": "Sending",
  "配信履歴はありません。": "No delivery history.",
  "発行済みコードはありません。": "No issued codes.",
  "秘密情報は管理画面へ返さず、Cloudflare Pagesの環境変数内だけで使用します。": "Secrets are never returned to the admin page and are used only from Cloudflare Pages environment variables.",
  "分類不明": "Unknown category",
  "本日のランキング記録": "Today's ranking records",
  "本文。テロップ表示ではこの文章が横に流れます。": "Message body. In ticker mode, this text scrolls horizontally.",
  "未設定": "Not configured",
  "名称未設定": "Unnamed",
  "有効期限を正しく入力してください。": "Enter a valid expiration date.",
  "余裕あり": "Within limits",
  "利用可能": "Available",
  "利用者意見はまだありません。": "No user feedback yet.",
  "利用者意見を更新しました。": "User feedback updated.",
  "利用者意見を読み込み中...": "Loading user feedback...",
  "履歴を削除": "Delete history"
}));

const EXACT_TRANSLATIONS = new Map(Object.entries({
  "設定": "Settings",
  "閉じる": "Close",
  "開く": "Open",
  "戻る": "Back",
  "次へ": "Next",
  "前へ": "Previous",
  "保存": "Save",
  "削除": "Delete",
  "解除": "Clear",
  "再試行": "Try again",
  "読み込み中": "Loading",
  "取得中...": "Loading...",
  "更新を取得中...": "Loading update time...",
  "取得中": "Loading",
  "処理中": "Processing",
  "確認中": "Checking",
  "認証": "Authenticate",
  "認証済み": "Authenticated",
  "有効にする": "Enable",
  "無効にする": "Disable",
  "オン": "On",
  "オフ": "Off",
  "あり": "Available",
  "なし": "None",
  "不明": "Unknown",
  "すべて": "All",
  "最新": "Latest",
  "現在": "Current",
  "今日": "Today",
  "明日": "Tomorrow",
  "前日": "Previous day",
  "翌日": "Next day",
  "日付": "Date",
  "更新": "Updated",
  "更新時刻": "Updated",
  "発表": "Issued",
  "発表中": "In effect",
  "継続": "Continued",
  "状態": "Status",
  "警報から注意報": "Downgraded to advisory",
  "切替": "Changed",
  "発表中の警報・注意報": "Active warnings and advisories",
  "現在発表中の情報はありません": "There are no active bulletins.",
  "発表中の警報・注意報はありません": "There are no active warnings or advisories.",
  "選択": "Select",
  "選択中": "Selecting",
  "検索": "Search",
  "詳細": "Details",
  "情報": "Information",
  "気象情報": "Weather information",
  "表示切替": "Navigation",
  "詳細情報を開く": "Open details",
  "情報シートを開閉": "Toggle information panel",
  "機能メニューを開く": "Open tools menu",
  "凡例": "Legend",
  "凡例を開く": "Open legend",
  "出典": "Source",
  "使い方": "How to use",
  "利用規約": "Terms of Use",
  "プライバシーポリシー": "Privacy Policy",
  "情報出典・加工": "Sources and processing",
  "外観": "Appearance",
  "アプリと地図の配色を選択します。": "Choose the color scheme for the app and map.",
  "端末設定": "Device setting",
  "ダーク": "Dark",
  "ライト": "Light",
  "言語": "Language",
  "日本語": "Japanese",
  "英語": "English",
  "アプリの表示言語を選択します。Discordの地震通知文は日本語で送信します。": "Choose the app display language. Discord earthquake notifications remain in Japanese.",
  "MeteoScopeアカウント": "MeteoScope account",
  "アーリーアクセス": "Early access",
  "管理者": "Administrator",
  "マイエリア": "My areas",
  "お知らせ通知": "Notifications",
  "防災マップ": "Disaster map",
  "表示切替ボタン": "Navigation tabs",
  "地震情報": "Earthquake information",
  "地震情報要約": "Earthquake summary",
  "地震・津波情報要約": "Earthquake and tsunami summary",
  "地震情報の表示": "Earthquake view",
  "地震地図の表示項目": "Earthquake map layers",
  "要約表示の切り替え": "Summary pages",
  "地震情報へ切り替え": "Show earthquake summary",
  "津波情報へ切り替え": "Show tsunami summary",
  "潮位観測へ切り替え": "Show tide observations",
  "地震情報を画像で共有": "Share earthquake image",
  "地震履歴をさらに読み込む": "Load more earthquake history",
  "アメダスランキングを画像で共有": "Share AMeDAS ranking as an image",
  "アメダスランキングを読み込み中": "Loading AMeDAS ranking",
  "現在地付近の発表状況を画像で共有": "Share nearby warnings as an image",
  "現在地付近の発表状況を読み込み中": "Loading nearby warnings",
  "AMeDAS観測値を読み込み中": "Loading AMeDAS observations",
  "現在地を読み込み中": "Loading current location",
  "警報・注意報を読み込み中": "Loading warnings and advisories",
  "早期注意情報を読み込み中": "Loading early warning information",
  "キキクルを読み込み中": "Loading Risk Map",
  "指定河川洪水予報を読み込み中": "Loading designated river flood forecasts",
  "台風情報を読み込み中": "Loading typhoon information",
  "各国予想を読み込み中": "Loading global forecasts",
  "各国予想を取得できません": "Global forecasts could not be loaded",
  "予報時刻はありません": "No forecast times available",
  "地震情報を読み込み中": "Loading earthquake information",
  "火山情報を読み込み中": "Loading volcano information",
  "地図を読み込み中": "Loading map",
  "地図を読み込めませんでした。再読み込みしてください。": "The map could not be loaded. Please reload the page.",
  "利用者意見": "Feedback",
  "雨雲": "Radar",
  "雨雲レーダー": "Rain radar",
  "雨雲レーダーを読み込み中": "Loading rain radar",
  "気象庁の降水ナウキャストを地図上に重ねています。": "JMA precipitation nowcast is overlaid on the map.",
  "天気図": "Weather chart",
  "天気図を読み込み中": "Loading weather charts",
  "雷": "Lightning",
  "雷情報を読み込み中": "Loading lightning information",
  "アメダス": "AMeDAS",
  "警報": "Warnings",
  "台風": "Typhoon",
  "地震": "Earthquakes",
  "火山": "Volcanoes",
  "週間天気": "Weekly forecast",
  "週間天気予報": "Weekly forecast",
  "3時間予報": "3-hour forecast",
  "3時間ごとの予報": "Three-hourly forecast",
  "日別予報": "Daily forecast",
  "最近の地震": "Recent earthquakes",
  "震央分布": "Epicenter distribution",
  "主要活断層": "Major active faults",
  "活断層": "Active faults",
  "境界": "Boundaries",
  "等深線": "Depth contours",
  "プレート境界": "Plate boundaries",
  "プレート等深線": "Depth contours",
  "表示期間": "Display period",
  "最大30日": "Up to 30 days",
  "1日": "1 day",
  "7日": "7 days",
  "15日": "15 days",
  "30日": "30 days",
  "期間指定": "Custom range",
  "開始日": "Start date",
  "終了日": "End date",
  "この期間で検索": "Search this period",
  "囲って検索": "Select area on map",
  "範囲解除": "Clear area",
  "選択を中止": "Cancel area selection",
  "地図上の囲み範囲だけを表示しています。": "Only earthquakes inside the selected map area are shown.",
  "囲って検索すると、地図上で指定した範囲だけに絞れます。": "Select an area on the map to filter the results.",
  "絞り込み": "Filters",
  "規模・深さ": "Magnitude and depth",
  "規模": "Magnitude",
  "深さ": "Depth",
  "地下の立体表示": "3D underground view",
  "震源・等深線の深さ方向を強調": "Emphasize hypocenter and contour depth",
  "平面": "2D",
  "立体": "3D",
  "表示対象日": "Displayed date",
  "表示対象": "Displayed period",
  "震源の深さ": "Hypocenter depth",
  "日別の総地震回数": "Daily earthquake count",
  "古い日": "Older",
  "最新日": "Newer",
  "最大震度": "Max.",
  "震源地": "Epicenter",
  "震央": "Epicenter",
  "発生時刻": "Time",
  "各地の震度": "Observed intensities",
  "震度観測点": "Observation sites",
  "推計震度": "Estimated intensity",
  "推計震度分布": "Estimated intensity map",
  "津波": "Tsunami",
  "津波情報": "Tsunami information",
  "津波情報要約": "Tsunami summary",
  "警報・注意報なし": "No warnings or advisories",
  "潮位観測": "Tide observations",
  "観測点を選択": "Select a station",
  "地図上の潮位観測点をタップしてください": "Tap a tide observation station on the map.",
  "気象庁 潮位観測": "JMA tide observations",
  "実測潮位": "Observed tide",
  "天文潮位": "Predicted tide",
  "実測": "Observed",
  "天文": "Predicted",
  "レベル4基準": "Level 4 threshold",
  "レベル5基準": "Level 5 threshold",
  "レベル4危険警報基準": "Level 4 danger-warning threshold",
  "レベル5特別警報基準": "Level 5 emergency-warning threshold",
  "潮位偏差": "Tide anomaly",
  "実測潮位 − 天文潮位": "Observed tide − predicted tide",
  "港湾局": "Port authority",
  "気象庁の潮位観測情報を開く": "Open JMA tide observations",
  "プラスは実測潮位が天文潮位より高く、マイナスは低いことを示します。": "Positive values are above the predicted tide; negative values are below it.",
  "観測値は速報値です。機器や通信の状態により異常値を含む場合があります。": "Observations are preliminary and may include anomalies caused by equipment or communication conditions.",
  "新潟西港": "Niigata West Port",
  "さらに読み込む": "Load more",
  "津波の心配なし": "No tsunami threat",
  "津波の心配はありません": "No tsunami threat",
  "この地震による津波の心配はありません": "There is no tsunami threat from this earthquake.",
  "津波警報等発表中": "Tsunami warning/advisory in effect",
  "津波注意報を解除しました。": "The tsunami advisory has been lifted.",
  "ごく浅い": "Very shallow",
  "未入電": "Data pending",
  "気温ランキング": "Temperature ranking",
  "かつらぎ": "Katsuragi",
  "熊本県熊本地方": "Kumamoto Region",
  "上位 100地点": "Top 100 stations",
  "今日ここまで": "Today so far",
  "高い順": "Highest first",
  "低い順": "Lowest first",
  "実況": "Current",
  "今日これまで": "Today",
  "観測": "Obs.",
  "気温": "Temperature",
  "雨雲レーダー時刻": "Select radar time",
  "天気図時刻": "Select weather-chart time",
  "雷時刻": "Select lightning time",
  "降水量": "Precipitation",
  "風速": "Wind speed",
  "風": "Wind",
  "湿度": "Humidity",
  "気圧": "Pressure",
  "海面気圧": "Sea-level pressure",
  "積雪量": "Snow depth",
  "日照時間": "Sunshine duration",
  "積雪深": "Snow depth",
  "現在地未取得": "Location unavailable",
  "発表状況": "Current warnings",
  "早期注意情報": "Early warning information",
  "早期注意情報（警報級の可能性）": "Early warning information (potential for warning-level conditions)",
  "早期": "Early",
  "キキクル": "Risk map",
  "河川": "Rivers",
  "表示レイヤー": "Layer",
  "土砂": "Landslide",
  "浸水": "Flooding",
  "警報・注意報": "Warnings and advisories",
  "現在地付近": "Near current location",
  "現在地": "Current location",
  "現在地へ移動。長押しで現在地マーカーを非表示": "Move to current location. Press and hold to hide the location marker",
  "現在地へ移動。長押しで現在地マーカーを表示": "Move to current location. Press and hold to show the location marker",
  "現在地の発表状況": "Local warnings",
  "発表なし": "No warnings",
  "現在地・警報注意報": "Current location · Warnings and advisories",
  "位置情報の利用が許可されていません。": "Location access is not allowed.",
  "市区町村ごとの警報・注意報を取得中です。": "Loading warnings and advisories by municipality.",
  "都道府県ごとに、市区町村の注意報・警報・危険警報・特別警報を表示しています。": "Warnings, danger warnings, emergency warnings, and advisories are grouped by prefecture and municipality.",
  "続きを表示": "Show more",
  "注意報": "Advisory",
  "特別警報": "Emergency warning",
  "暴風雪警報": "Snowstorm Warning",
  "大雨警報": "Heavy Rain Warning",
  "洪水警報": "Flood Warning",
  "暴風警報": "Storm Warning",
  "大雪警報": "Heavy Snow Warning",
  "波浪警報": "High Waves Warning",
  "高潮警報": "Storm Surge Warning",
  "種別": "Type",
  "大雨": "Heavy rain",
  "土砂災害": "Landslide",
  "河川氾濫": "River flooding",
  "洪水": "Flooding",
  "暴風(雪)": "Storm / snowstorm",
  "暴風雪": "Snowstorm",
  "暴風": "Storm",
  "強風": "Strong winds",
  "大雪": "Heavy snow",
  "波浪": "High waves",
  "高潮": "Storm surge",
  "濃霧": "Dense fog",
  "乾燥": "Dry air",
  "瀬戸内側": "Seto Inland Sea side",
  "太平洋側": "Pacific side",
  "日本海側": "Sea of Japan side",
  "山地": "Mountain areas",
  "平地": "Lowland areas",
  "土砂災害警報": "Landslide Warning",
  "大雨注意報": "Heavy Rain Advisory",
  "大雪注意報": "Heavy Snow Advisory",
  "風雪注意報": "Snow and Wind Advisory",
  "雷注意報": "Thunderstorm Advisory",
  "強風注意報": "Strong Wind Advisory",
  "波浪注意報": "High Waves Advisory",
  "融雪注意報": "Snowmelt Advisory",
  "洪水注意報": "Flood Advisory",
  "高潮注意報": "Storm Surge Advisory",
  "濃霧注意報": "Dense Fog Advisory",
  "乾燥注意報": "Dry Air Advisory",
  "なだれ注意報": "Avalanche Advisory",
  "低温注意報": "Low Temperature Advisory",
  "霜注意報": "Frost Advisory",
  "着氷注意報": "Icing Advisory",
  "着雪注意報": "Snow Accretion Advisory",
  "土砂災害注意報": "Landslide Advisory",
  "暴風雪危険警報": "Snowstorm Danger Warning",
  "大雨危険警報": "Heavy Rain Danger Warning",
  "洪水危険警報": "Flood Danger Warning",
  "暴風危険警報": "Storm Danger Warning",
  "大雪危険警報": "Heavy Snow Danger Warning",
  "波浪危険警報": "High Waves Danger Warning",
  "高潮危険警報": "Storm Surge Danger Warning",
  "土砂災害危険警報": "Landslide Danger Warning",
  "暴風雪特別警報": "Emergency Snowstorm Warning",
  "大雨特別警報": "Emergency Heavy Rain Warning",
  "暴風特別警報": "Emergency Storm Warning",
  "大雪特別警報": "Emergency Heavy Snow Warning",
  "波浪特別警報": "Emergency High Waves Warning",
  "高潮特別警報": "Emergency Storm Surge Warning",
  "土砂災害特別警報": "Emergency Landslide Warning",
  "氾濫注意報": "Flood advisory",
  "氾濫警報": "Flood warning",
  "氾濫危険警報": "Flood danger warning",
  "氾濫特別警報": "Flood emergency warning",
  "氾濫特別警報・発生情報": "Flood emergency warning / occurrence information",
  "各国予想": "Global models",
  "気象庁": "JMA",
  "予報時刻の位置": "Position at forecast time",
  "熱帯擾乱の発達候補": "Potential tropical development",
  "解析位置": "Analysis position",
  "進路・風域": "Track and wind areas",
  "強風域": "Strong-wind area",
  "暴風域": "Storm-wind area",
  "予報円": "Forecast circle",
  "中心気圧": "Central pressure",
  "最大風速": "Maximum wind",
  "最大瞬間風速": "Maximum gust",
  "最大瞬間": "Maximum gust",
  "大きさ": "Size",
  "強さ": "Intensity",
  "猛烈な": "Violent",
  "台風の解析値を表示しています。": "Showing the latest typhoon analysis.",
  "移動": "Movement",
  "台風情報": "Typhoon information",
  "噴火警戒レベル": "Volcanic Alert Level",
  "火山防災情報": "Volcano safety information",
  "噴火警戒レベルと、必要な行動を確認できます。": "Check the Volcanic Alert Level and recommended actions.",
  "火山活動の状況と、防災上警戒すべき範囲を5段階で示します。": "Five levels show the state of volcanic activity and the area requiring precautions.",
  "警戒範囲の目安": "Approximate precaution area",
  "活動に応じて範囲が広がります": "The area expands as activity increases",
  "居住地域近く": "Near residential areas",
  "レベル別の行動": "Actions by alert level",
  "対象範囲は火山ごとに異なります": "The affected area differs by volcano",
  "地図上の▲を選択すると、その火山の発表内容を表示します。噴火警戒レベルを運用していない火山では、警報・予報の表現が異なります。実際の規制や避難対象は、気象庁・自治体等の最新発表に従ってください。": "Select a triangle on the map to view bulletins for that volcano. Volcanoes without the five-level system use different warning terms. Follow the latest JMA and local-authority instructions for restrictions and evacuations.",
  "← 火山情報の見方": "← About volcano information",
  "出典：": "Source: ",
  "気象庁「火山情報」": "JMA Volcano Information",
  "。MeteoScopeは気象庁の公式アプリではありません。避難や規制は自治体等の公式発表も確認してください。": ". MeteoScope is not an official JMA app. Also check official local-authority information for evacuations and restrictions.",
  "現在の噴火警報・予報": "Current volcanic warnings and forecasts",
  "現在の警戒事項等": "Current precautions",
  "火山活動の状況": "Volcanic activity",
  "噴火警報・予報の対象市町村": "Municipalities covered by the warning or forecast",
  "噴火警報・予報（対象火山）": "Volcanic warning or forecast (target volcano)",
  "次回の情報": "Next bulletin",
  "関連する発表": "Related bulletins",
  "発表内容": "Bulletin details",
  "選択した発表": "Selected bulletin",
  "気象庁発表原文を確認": "View the original JMA bulletin",
  "降灰予報": "Ashfall forecast",
  "火口周辺規制": "Do not approach the crater",
  "火口周辺警報": "Crater-area warning",
  "火口周辺危険": "Danger around the crater",
  "降灰予報（定時）": "Scheduled ashfall forecast",
  "噴火警報・予報": "Volcanic warnings and forecasts",
  "入山規制": "Do not approach the volcano",
  "周辺海域警戒": "Marine warning near the volcano",
  "活火山であることに留意": "Potential for increased activity",
  "地域": "Area",
  "予報地域": "Forecast area",
  "地域を選択": "Select an area",
  "最新発表": "Latest bulletin",
  "最高": "High",
  "最低": "Low",
  "最高気温": "High",
  "最低気温": "Low",
  "降水確率": "Precipitation",
  "気温未発表": "Temperature unavailable",
  "信頼度": "Confidence",
  "晴れ": "Sunny",
  "くもり": "Cloudy",
  "曇り": "Cloudy",
  "雨": "Rain",
  "雪": "Snow",
  "みぞれ": "Sleet",
  "霙": "Sleet",
  "暴風雨": "Stormy rain",
  "暴風雪": "Blizzard",
  "一時": "Occasionally",
  "時々": "Occasionally",
  "のち": "Then",
  "気象・防災情報": "Weather and disaster information",
  "画像サイズ": "Image size",
  "縦長": "Portrait",
  "正方形": "Square",
  "横長": "Landscape",
  "配色": "Color theme",
  "PNGを保存": "Save PNG",
  "共有する": "Share",
  "画像を共有": "Share image",
  "SNS投稿用PNG": "Social media PNG",
  "アメダスランキングを画像にする": "Create an AMeDAS ranking image",
  "地震情報を画像にする": "Create an earthquake information image",
  "台風情報を画像にする": "Create a typhoon information image",
  "現在地付近の発表状況を画像にする": "Create a local warning status image",
  "現在のランキング上位を、見やすいSNS投稿用PNGにまとめます。": "Create a clear social media PNG from the current ranking.",
  "現在表示している地震情報からSNS投稿用PNGを作成します。": "Create a social media PNG from the displayed earthquake information.",
  "現在表示している気象庁の台風情報からSNS投稿用PNGを作成します。": "Create a social media PNG from the displayed JMA typhoon information.",
  "現在地の市区町村に発表中の警報・注意報をSNS投稿用PNGにまとめます。": "Create a social media PNG of warnings and advisories for the current municipality.",
  "画像を作成しています…": "Creating image…",
  "PNGを保存しました。": "PNG saved.",
  "共有画面を開きました。": "Share sheet opened.",
  "共有できませんでした。": "Could not share.",
  "MeteoScopeの気象・防災情報": "Weather and disaster information from MeteoScope",
  "出典：気象庁": "Source: JMA",
  "気象庁発表": "Issued by JMA",
  "管理画面": "Admin",
  "ログイン": "Sign in",
  "ログアウト": "Sign out",
  "再読み込み": "Refresh",
  "メンテナンス": "Maintenance",
  "お知らせ": "Notices",
  "アカウント": "Accounts",
  "テスト投稿": "Send test post"
}));

const STATIC_UI_TRANSLATIONS = new Map(Object.entries({
  "5分前": "5 minutes earlier",
  "5分後": "5 minutes later",
  "再生": "Play",
  "投稿": "Report",
  "機能メニュー": "Tools",
  "週間天気予報を開く": "Open weekly forecast",
  "防災マップを開く": "Open disaster map",
  "防災クイズを開く": "Open disaster quiz",
  "設定を開く": "Open settings",
  "表示や通知、地域の設定をまとめて変更できます": "Manage appearance, notifications, and saved areas in one place.",
  "設定を検索": "Search settings",
  "項目名や機能で絞り込めます": "Search by setting or feature",
  "検索をクリア": "Clear search",
  "よく使う設定": "Frequently used settings",
  "一致する設定がありません": "No matching settings",
  "アカウントと表示": "Account and appearance",
  "地域と通知": "Areas and notifications",
  "地図と表示": "Map and display",
  "サポート・情報": "Support and information",
  "ログイン状態と登録情報": "Sign-in status and account details",
  "アカウントの作成、ログイン、管理をこの画面で行えます。": "Create, sign in to, and manage your account here.",
  "アプリと地図の配色": "App and map colors",
  "アプリの表示言語": "App display language",
  "開発中の機能": "Features in development",
  "よく見る地域を保存": "Save frequently viewed areas",
  "管理者からの重要なお知らせ": "Important administrator notices",
  "保存ファイルの管理": "Manage saved files",
  "ボタンの並び順": "Navigation button order",
  "震央分布の表示": "Epicenter map display",
  "改善要望・不具合を送信": "Send feedback or report an issue",
  "基本操作を確認": "Review basic controls",
  "データの出典と表示上の注意": "Data sources and display notes",
  "サービスの利用条件": "Service terms",
  "保存・通信する情報": "Stored and transmitted information",
  "現在の情報を画像で共有": "Share current information as an image",
  "このタブでは画像共有を利用できません": "Image sharing is unavailable on this tab",
  "雨雲レーダーの時刻を選択": "Select radar time",
  "気象庁データを使用して雨雲、アメダス、警報・注意報、台風情報を表示します。": "Displays radar, AMeDAS, warnings, advisories, and typhoon information using JMA data.",
  "防災クイズで確認・管理": "View and manage in Disaster Quiz",
  "MeteoScopeアカウントのログイン状態と登録情報を確認できます。対応機能は今後順次追加します。": "Check your MeteoScope sign-in status and account details. More supported features will be added over time.",
  "アカウント状態を確認しています。": "Checking account status.",
  "MeteoScope管理者からのお知らせを通知します。": "Receive notices from MeteoScope administrators.",
  "通知は無効です": "Notifications are off",
  "Web版では気象警報・注意報をプッシュ通知しません。気象情報はアプリ画面と気象庁などの公式情報で確認してください。": "The web app does not send push notifications for weather warnings or advisories. Check the app and official sources such as JMA.",
  "開発中の機能を先行して利用できます。動作や表示は今後変更される場合があります。": "Try features that are still in development. Their behavior and appearance may change.",
  "シリアルコード": "Serial code",
  "昨日グラフ・天気図7日履歴・活断層データ選択": "Yesterday chart, 7-day weather charts, and active-fault source selection",
  "活断層データ": "Active-fault data",
  "地震タブの「活断層」で表示する情報源を選択します。": "Choose the data source shown by Active faults on the Earthquakes tab.",
  "現在（J-SHIS）": "Current (J-SHIS)",
  "産総研（GSJ）": "GSJ",
  "産総研を選ぶと、認証済み端末だけが保護された活断層データを必要時に読み込みます。データの一般公開は行いません。": "When GSJ is selected, protected active-fault data is loaded only on authenticated devices when needed. The data is not made publicly available.",
  "保存した市区町村を、現在地と同じように警報・雨雲・台風情報の補助表示に使います。": "Use saved municipalities as additional areas for warnings, radar, and typhoon information.",
  "現在地をマイエリアに追加": "Add current location to My Areas",
  "市区町村を検索": "Search municipalities",
  "例: 京都市北区、長岡市": "e.g. Kita Ward, Kyoto or Nagaoka",
  "ボタンを選んでから移動先を押すと、横並びのまま順番を入れ替えます。": "Select a tab, then choose its destination to reorder the row.",
  "標準に戻す": "Restore default",
  "当日・前日の有感地震": "Felt earthquakes today and yesterday",
  "当日・前日の有感地震を表示": "Show felt earthquakes today and yesterday",
  "震央分布に気象庁防災情報XMLで発表された有感地震を表示します。": "Show felt earthquakes reported in JMA Disaster Information XML on the epicenter map.",
  "改善要望や気づいた不具合を送信できます。個人情報は入力しないでください。": "Send improvement requests or report issues. Do not enter personal information.",
  "意見を書く": "Send feedback",
  "地図、表示切替、要約バー、現在地と通知の基本操作を確認できます。": "Learn the basics of the map, views, summary bar, location, and notifications.",
  "使い方を見る": "View guide",
  "主な情報出典": "Primary data sources",
  "雷情報": "Lightning data",
  "地震・津波・火山情報の取得経路": "Earthquake, tsunami, and volcano data",
  "区域の形状": "Area boundaries",
  "背景地図": "Base map",
  "指定河川の形状": "Designated river geometry",
  "加工について": "Data processing",
  "警報・予報の扱い": "Warnings and forecasts",
  "利用時の注意": "Important notice",
  "利用条件": "Usage terms",
  "利用規約とプライバシー": "Terms and privacy",
  "ご利用前に、利用規約とプライバシーポリシーをご確認ください。本アプリは気象庁などの行政機関が提供する公式アプリではありません。": "Review the Terms of Use and Privacy Policy before continuing. This is not an official app provided by JMA or another government agency.",
  "利用規約を確認し、同意します": "I have read and agree to the Terms of Use",
  "プライバシーポリシーを確認し、同意します": "I have read and agree to the Privacy Policy",
  "同意しない場合はMeteoScopeを利用できません。同意状態はこの端末に保存されます。": "You must agree to use MeteoScope. Your consent is stored on this device.",
  "同意して利用を開始": "Agree and continue",
  "使い方ガイド": "Getting started",
  "スキップ": "Skip",
  "ページ": "Page",
  "種類": "Category",
  "改善要望": "Feature request",
  "不具合": "Issue",
  "デザイン": "Design",
  "その他": "Other",
  "内容": "Message",
  "例: スマホで警報タブを開いた時、表示をもう少し軽くしてほしい": "e.g. Please improve performance when opening Warnings on a phone",
  "送信内容はアプリ改善の確認にのみ使用します。個人情報や緊急連絡は入力しないでください。": "Your message is used only to improve the app. Do not include personal information or emergency reports.",
  "送信": "Send",
  "気象庁 防災情報": "JMA Disaster Information",
  "週間天気予報の地域": "Weekly forecast area",
  "現在地の週間天気を表示します": "Show the weekly forecast for your location",
  "現在地を取得して、対応する府県週間天気予報を読み込みます。": "Use your location to load the corresponding regional weekly forecast.",
  "PDF・画像を選択": "Select a PDF or image",
  "別タブで開く": "Open in a new tab",
  "PDFまたは画像を選択してください。": "Select a PDF or image.",
  "PDFまたは画像を選択するとここに表示されます。": "The selected PDF or image will appear here.",
  "防災マッププレビュー": "Disaster map preview",
  "目印追加": "Add marker",
  "一覧": "List",
  "防災メモ": "Disaster notes",
  "自宅": "Home",
  "避難所": "Shelter",
  "集合場所": "Meeting point",
  "危険箇所": "Hazard",
  "備蓄場所": "Supplies",
  "タイトル": "Title",
  "例: 家族の集合場所": "e.g. Family meeting point",
  "メモ": "Notes",
  "避難時の注意点や持ち物など": "Evacuation notes and items to bring",
  "キャンセル": "Cancel",
  "縮小": "Zoom out",
  "拡大": "Zoom in",
  "幅に合わせる": "Fit to width",
  "難易度": "Difficulty",
  "難易度を選んで10問に挑戦": "Choose a difficulty and answer 10 questions",
  "気象庁・内閣府・消防庁の公開情報をもとに、災害時の行動と気象の仕組みを確認できます。": "Learn disaster response and weather basics using public information from JMA, the Cabinet Office, and the Fire and Disaster Management Agency.",
  "ランキング参加": "Join ranking",
  "アカウント操作": "Account actions",
  "新規作成": "Create account",
  "アカウントID": "Account ID",
  "パスワード": "Password",
  "ランキング表示名": "Ranking name",
  "半角英数字と_、4〜24文字。公開されません。": "Use 4–24 ASCII letters, numbers, or underscores. This is not public.",
  "表示名と当日の合計得点・達成日はランキングで公開されます。": "Your display name, daily score, and completion date appear in the ranking.",
  "に同意する": "I agree",
  "アカウントを作成": "Create account",
  "アカウントと記録を削除": "Delete account and records",
  "確認用パスワード": "Password confirmation",
  "完全に削除": "Delete permanently",
  "初級・本日": "Beginner · Today",
  "合計得点ランキング": "Total score ranking",
  "ランキングを取得しています。": "Loading ranking.",
  "この難易度で始める": "Start this difficulty",
  "次の問題": "Next question",
  "結果": "Results",
  "もう一度挑戦": "Try again",
  "難易度を選び直す": "Choose another difficulty",
  "クイズはMeteoScopeが独自に作成した学習用問題です。気象予報士試験の過去問題・解答例は転載していません。実際の災害時は、気象庁・自治体などの最新の公式情報を確認してください。": "MeteoScope created these questions for learning. They do not reproduce past weather forecaster exam questions. During a disaster, check the latest official information from JMA and local authorities.",
  "選択してください": "Select",
  "画像を作成": "Create image",
  "現在の天気": "Current weather",
  "体感": "Feels like",
  "快適": "Comfortable",
  "涼しい": "Cool",
  "寒い": "Cold",
  "暑い": "Hot",
  "非常に暑い": "Very hot",
  "弱い雨": "Light rain",
  "強い雨": "Heavy rain",
  "強風": "Strong wind",
  "霧": "Fog",
  "視界不良": "Poor visibility",
  "道路冠水": "Flooded road",
  "路面凍結・滑りやすい": "Icy or slippery road",
  "周辺の危険（3つまで）": "Nearby hazards (up to 3)",
  "ひとこと（任意）": "Comment (optional)",
  "気温（任意）": "Temperature (optional)",
  "例：風が強く、傘が差しにくいです": "e.g. Strong winds make umbrellas difficult to use",
  "近くの利用者へ、現在の天気や危険を共有します。正確な位置は保存せず、投稿は1日12回までです。": "Share current weather and hazards with nearby users. Exact locations are not stored. Up to 12 reports per day.",
  "投稿は5時間後に地図から消え、D1からも順次削除されます。緊急通報には使用しないでください。": "Reports disappear from the map after 5 hours and are then removed from D1. Do not use this for emergency calls.",
  "投稿画像のプレビュー": "Report image preview",
  "例 24.5": "e.g. 24.5",
  "確認中...": "Checking...",
  "未選択": "Not selected",
  "保存済みファイル": "Saved file",
  "MeteoScopeアカウントへのログインが必要です。": "Sign in to your MeteoScope account.",
  "投稿するには現在地を取得してください。位置情報はサーバーで約2km単位に丸めます。": "Get your current location before posting. The server rounds the location to approximately 2 km.",
  "現在地を確認できません。地図の現在地ボタンを押してから再試行してください。": "Current location is unavailable. Use the location button on the map, then try again.",
  "現在地の投稿サーバーへ接続できませんでした。": "Could not connect to the local report server.",
  "現在地の投稿を処理できませんでした。": "Could not process the local report.",
  "アカウント設定を開く": "Open account settings",
  "クリア": "Clear",
  "/80文字・URLや個人情報は入力しないでください": "/80 characters · Do not enter URLs or personal information",
  "正解 0": "Correct 0",
  "プレート面・等深線": "Plate surfaces and depth contours",
  "プレート境界: USGS": "Plate boundaries: USGS",
  "プレート面・等深線: USGS Slab2": "Plate surfaces and depth contours: USGS Slab2",
  "地震・津波: 気象庁防災情報XML": "Earthquake and tsunami: JMA Disaster Information XML",
  "推計震度分布: 気象庁": "Estimated intensity map: JMA",
  "火山: 気象庁 火山情報": "Volcanoes: JMA Volcano Information",
  "背景地図: 国土地理院": "Base map: Geospatial Information Authority of Japan",
  "河川形状: ESRIジャパン株式会社・気象庁": "River geometry: ESRI Japan and JMA",
  "主要活断層帯: J-SHIS（防災科研）": "Major active fault zones: J-SHIS (NIED)",
  "活動セグメント: 産総研地質調査総合センター 活断層データベース（MeteoScope加工）": "Active fault segments: GSJ Active Fault Database (processed by MeteoScope)",
  "気象庁公開データをもとにMeteoScopeが加工・可視化": "Processed and visualized by MeteoScope using public JMA data",
  "気象庁ホームページ": "JMA website",
  "気象データ高度利用ポータルサイト": "JMA Weather Data Portal",
  "気象庁の雷ナウキャスト": "JMA Lightning Nowcast",
  "雷監視システム（LIDEN）": "Lightning Detection Network System (LIDEN)",
  "気象庁防災情報XML": "JMA Disaster Information XML",
  "気象庁の公開分布図": "JMA public distribution map",
  "気象庁の全国現況・火山一覧": "JMA national volcano status and list",
  "予報区等GISデータ": "JMA forecast-area GIS data",
  "国土地理院の地理院タイル（標準地図）": "GSI Tiles (Standard Map)",
  "J-SHIS主要活断層帯（2022年版・最大ケース）": "J-SHIS Major Active Fault Zones (2022, maximum case)",
  "産業技術総合研究所 地質調査総合センター「活断層データベース」": "GSJ Active Fault Database",
  "U.S. Geological Survey（USGS）のTectonic Plate Boundaries": "U.S. Geological Survey (USGS) Tectonic Plate Boundaries",
  "U.S. Geological Survey（USGS）のSlab2": "U.S. Geological Survey (USGS) Slab2",
  "ESRIジャパン「指定河川洪水予報河川および洪水予報河川」": "ESRI Japan Designated Flood Forecast Rivers",
  "公共データ利用規約（第1.0版）": "Public Data License (Version 1.0)",
  "気象庁ホームページの利用規約": "JMA website terms of use",
  "1. 本アプリの位置づけ": "1. About this app",
  "2. 安全に関する注意": "2. Safety notice",
  "3. 通知": "3. Notifications",
  "4. 防災マップと防災メモ": "4. Disaster maps and notes",
  "5. アーリーアクセス": "5. Early access",
  "6. 禁止事項": "6. Prohibited use",
  "7. 免責と変更": "7. Disclaimer and changes",
  "1. 取得・利用する情報": "1. Information collected and used",
  "2. 位置情報": "2. Location information",
  "3. プッシュ通知": "3. Push notifications",
  "4. 利用者意見": "4. Feedback",
  "6. 端末内に保存する情報": "6. Information stored on your device",
  "7. 外部サービスへの通信": "7. External services",
  "8. 管理と変更": "8. Management and changes",
  "本アプリは、気象庁などが公開する防災・気象情報を閲覧しやすく表示するための補助ツールです。行政機関による公式な防災情報ではありません。": "This app is an aid for viewing public weather and disaster information from JMA and other sources. It is not an official government disaster-information service.",
  "表示内容の正確性、完全性、即時性、継続的な提供を保証するものではありません。通信障害、提供元の更新、データ処理などにより、遅延、欠落、誤差または表示不具合が生じる場合があります。避難や安全確保の判断では、気象庁、自治体、報道機関などの公式情報を必ず確認してください。": "Accuracy, completeness, timeliness, and uninterrupted availability are not guaranteed. Communications, source updates, and processing may cause delays, omissions, errors, or display issues. Always check official information from JMA, local authorities, and trusted media when making safety decisions.",
  "プッシュ通知は補助機能であり、端末、ブラウザ、通信環境、配信サービスの状態によって遅延または不達となる場合があります。通知だけに依存して安全に関する判断をしないでください。": "Push notifications are supplementary and may be delayed or not delivered depending on your device, browser, network, or delivery service. Do not rely on notifications alone for safety decisions.",
  "利用者が読み込むPDF・画像および追加する目印・メモは、利用者自身の責任で管理してください。著作権その他の権利を侵害するデータを利用しないでください。端末やブラウザのデータを削除すると、保存内容が失われる場合があります。": "You are responsible for PDFs, images, markers, and notes you add. Do not use content that infringes copyright or other rights. Stored content may be lost if device or browser data is deleted.",
  "開発中の機能は、予告なく内容の変更、提供の中断または終了を行う場合があります。シリアルコードを第三者へ不正に譲渡、販売または共有しないでください。": "Features in development may change, be suspended, or end without notice. Do not transfer, sell, or improperly share serial codes.",
  "本アプリまたは提供元へ過度な負荷をかける行為、不正アクセス、機能の妨害、法令または第三者の権利を侵害する行為を禁止します。": "Do not overload the app or data providers, gain unauthorized access, disrupt operation, violate laws, or infringe third-party rights.",
  "法令上認められる範囲で、本アプリの利用または利用不能により生じた損害について、開発者は責任を負いません。本規約および本アプリの内容は、必要に応じて変更する場合があります。": "To the extent permitted by law, the developer is not liable for damage arising from use or inability to use this app. These terms and the app may be changed as necessary.",
  "本アプリは、選択した外観、表示切替ボタンの順序、マイエリア、使い方ガイドの確認状態、通知設定、アーリーアクセス認証情報などを、機能提供と設定保持のために利用します。": "The app uses your selected appearance, tab order, My Areas, guide status, notification settings, and early-access authentication to provide features and preserve settings.",
  "端末の位置情報は、現在地の表示、現在地に対応する市区町村・予報区域・防災情報の照合、周辺情報の表示に使用します。緯度・経度そのものは本アプリのサーバーへ保存しません。Web版のお知らせ通知では、現在地や通知対象区域をサーバーへ送信しません。": "Device location is used to show your position and match nearby municipalities, forecast areas, and disaster information. Coordinates are not stored on MeteoScope servers. Web notice subscriptions do not send your location or target area to the server.",
  "Web版のお知らせ通知を有効にした場合、ブラウザのPush購読情報を管理者からのお知らせ配信のために保存します。Web版では気象警報・注意報をプッシュ通知せず、通知対象区域、通知設定、警報状態を保存しません。通知解除または購読が無効になった場合に削除し、配信にはブラウザやOSが利用するPush配信サービスを経由します。": "When web notices are enabled, the browser push subscription is stored to deliver administrator notices. The web app does not send push weather warnings or store target areas, weather notification settings, or warning states. Subscriptions are removed when disabled or invalid and are delivered through browser or OS push services.",
  "利用者意見を送信した場合、入力本文、分類、閲覧ページおよび送信時刻を、改善内容の確認に使用してサーバーへ保存します。氏名、住所、連絡先などの個人情報や緊急情報は入力しないでください。": "When feedback is sent, its text, category, current page, and submission time are stored to review improvements. Do not enter personal information or emergency reports.",
  "シリアルコードの認証時には、コードを一方向変換した値、利用回数、認証日時、有効期限および発行された認証トークンに関する情報を保存します。入力したシリアルコードそのものを平文では保存しません。": "Serial-code authentication stores a one-way transformed value, usage count, authentication time, expiry, and issued-token information. The entered serial code is not stored as plain text.",
  "防災マップとして選択したPDF・画像、防災メモ、目印、マイエリア、外観や表示順などの設定は、原則としてブラウザのLocal StorageまたはIndexedDBへ保存されます。防災マップと防災メモは本アプリのサーバーへ送信しません。設定画面またはブラウザのサイトデータ削除により消去できます。": "Selected disaster-map PDFs and images, notes, markers, My Areas, appearance, and display-order settings are generally stored in browser Local Storage or IndexedDB. Disaster maps and notes are not sent to MeteoScope servers and can be removed in Settings or by clearing site data.",
  "気象・地震・地図などのデータ取得時には、気象庁、地図配信元その他の情報提供元へ通信します。また、アプリ配信、API、データ保存および通知処理にはCloudflareのサービスを利用します。通信時には、各提供元にIPアドレス、ブラウザ情報、アクセス日時などが送信される場合があります。": "The app contacts JMA, map providers, and other sources to retrieve weather, earthquake, and map data. Cloudflare services are used for app delivery, APIs, storage, and notification processing. Providers may receive your IP address, browser information, and access time.",
  "保存情報は、機能提供、セキュリティ確保、不具合調査および不正利用防止に必要な範囲で取り扱います。本ポリシーは、機能や法令の変更に応じて更新する場合があります。": "Stored information is handled only as needed to provide features, maintain security, investigate issues, and prevent abuse. This policy may be updated as features or laws change.",
  "最終更新日: 2026年7月13日": "Last updated: July 13, 2026",
  "最終更新日: 2026年7月15日": "Last updated: July 15, 2026",
  "防災クイズ": "Disaster Quiz",
  "気象庁防災情報": "JMA Disaster Information",
  "Web版が": "The web app retrieves",
  "および": "and",
  "と": "and",
  "気象庁の": "JMA",
  "気象庁コンテンツは、原則として": "JMA content is generally used under the",
  "に基づいて利用しています。": ".",
  "の公開データをMeteoScopeが加工・可視化 /": "public data, processed and visualized by MeteoScope /",
  "の公開データをもとに、MeteoScopeが雷活動度を地図へ重ね、対地放電（落雷）を「×」、雲放電を「○」に加工して表示しています。独自の雷予報・警報ではありません。LIDENには誤標定、位置誤差、未検知が生じる場合があります。": "public data is processed by MeteoScope to overlay lightning activity, showing cloud-to-ground lightning as × and cloud discharges as ○. This is not an independent lightning forecast or warning. LIDEN may include mislocations, position errors, or missed detections.",
  "の地震火山フィードと各電文を取得し、推計震度分布は": "earthquake and volcano feeds and bulletins. Estimated intensity maps are matched using the",
  "を対応する地震へ照合します。火山情報では": "and associated with the corresponding earthquake. Volcano information is also checked against the",
  "も照合して、MeteoScopeが正規化して表示しています。": "and normalized by MeteoScope for display.",
  "をGeoJSONへ変換し、区域コード・名称・表示用属性を付加して利用しています。原データには国土地理院の測量成果が使用されています。": "is converted to GeoJSON with area codes, names, and display attributes. The source data incorporates GSI survey results.",
  "を背景として利用し、その上に気象・防災情報を重ねています。": "is used as the base map with weather and disaster information overlaid.",
  "通常表示には防災科学技術研究所の": "The standard view uses",
  "を利用しています。アーリーアクセスでは、": ". Early access can switch to",
  "の活動セグメントをMeteoScopeがGeoJSONへ変換・表示用に加工したデータへ切り替えられます。": "active-fault segments converted to GeoJSON and prepared for display by MeteoScope.",
  "（境界モデル: Bird, 2003）から日本周辺を抽出し、収束境界・横ずれ境界・その他をMeteoScopeが配色して地震タブへ重ねています。境界線は科学モデルに基づく概略位置で、個別地点の危険度や断層位置を示すものではありません。": "(Bird, 2003 boundary model) is clipped to the Japan region and styled by MeteoScope as convergent, transform, and other boundaries. Lines are approximate scientific-model positions and do not indicate site-specific hazards or fault locations.",
  "から日本周辺の沈み込むプレート上面の深さを20km間隔で抽出し、浅い側を赤、深い側を青の連続色で地震タブへ重ねています。立体表示の面は、USGSの収束境界を0km側の端とし、隣接する等深線間をMeteoScopeが補間した概略表現です。距離が離れた箇所やデータの裏付けがない隙間には面を張りません。CC0の静的データを使用し、Web版で3D表示します。モデル値・補間表示であり、地下の境界位置や危険度を地点単位で確定するものではありません。": "provides subducting-plate depths around Japan sampled every 20 km and shown from red (shallow) to blue (deep). The 3D surface is an approximate MeteoScope interpolation between adjacent contours, starting from USGS convergent boundaries at 0 km. No surface is drawn across distant or unsupported gaps. Static CC0 data is used for the web 3D view. This is a model visualization and does not determine exact underground boundaries or site-specific risk.",
  "を利用しています。原典は気象業務支援センターが公開する流路データと河川名対応表、気象庁の個別コード表です。MeteoScopeが気象庁XMLの発表情報と照合し、地図上の配色と表示を加工しています。": "is used. Its sources are river geometry and name tables published by JMBSC and JMA code tables. MeteoScope matches these with JMA XML bulletins and prepares map colors and display.",
  "気象庁の公開データをもとに、MeteoScopeが地図への重ね合わせ、区域との照合、グラフ・ランキング化、表示用の配色・表記変換、通知状態の比較を行っています。表示内容は気象庁が作成した画面そのものではありません。": "MeteoScope uses public JMA data for map overlays, area matching, charts, rankings, display colors, wording conversion, and notification-state comparisons. The displayed screens are not created by JMA.",
  "本アプリは独自の気象予報・警報を発表するものではなく、気象庁が発表した情報を加工・可視化する非公式アプリです。通知の「発表・継続・切替・解除」は、気象庁発表データの変化をMeteoScopeが比較した表示です。": "This unofficial app does not issue its own forecasts or warnings; it processes and visualizes JMA information. Issued, continued, changed, and cancelled statuses are derived by comparing changes in JMA data.",
  "重要な防災判断では、発表時刻を確認し、": "For important safety decisions, check the issue time and also consult",
  "や自治体などの公式情報を併せて確認してください。データの停止、遅延、更新または仕様変更により、表示が最新でない場合があります。": "and official local-authority information. Service outages, delays, updates, or specification changes may cause stale displays.",
  "サポート・ご意見": "Support and feedback",
  "使い方・不具合・改善要望を送信": "Send a question, issue, or request",
  "操作の相談、不具合、改善要望を受け付けます。緊急時は気象庁・自治体へ連絡してください。": "Send questions, issue reports, or improvement requests. For emergencies, contact JMA or your local authority.",
  "サポートを開く": "Open support",
  "操作の相談、不具合、改善要望を受け付けます。緊急時の連絡窓口ではありません。": "Send questions, issue reports, or improvement requests. This is not an emergency contact channel.",
  "使い方・サポート": "How-to and support",
  "対象の機能": "Feature",
  "全般": "General",
  "雨雲・雷": "Radar and lightning",
  "地震・火山": "Earthquakes and volcanoes",
  "設定・表示": "Settings and display",
  "操作・見やすさ": "Usability and accessibility",
  "困っていること・起きたこと": "What happened",
  "期待する結果（任意）": "Expected result (optional)",
  "回答を希望するメールアドレス（任意）": "Email for a reply (optional)",
  "回答を希望する場合のみ入力": "Enter only if you would like a reply",
  "送信時に付ける情報": "Information included with your report",
  "表示中のタブ、配色、言語、表示サイズ。位置情報・氏名・端末識別情報は送信しません。メールアドレスは回答を希望して入力した場合のみ送信します。": "Current tab, appearance, language, and display size. Location, name, and device identifiers are not sent. Email is sent only when you enter it to request a reply.",
  "メールアドレスは回答を希望する場合だけ送信し、サポート対応以外には使いません。対応状況はこの端末で30日間確認できます。個人情報や緊急連絡は入力しないでください。": "Email is sent only when you request a reply and is used only for support. You can check the ticket status on this device for 30 days. Do not enter personal information or emergency reports.",
  "受付番号": "Ticket number",
  "この端末で30日間、対応状況を確認できます。": "You can check the ticket status on this device for 30 days.",
  "この端末から送信した内容": "Reports sent from this device",
  "送信状況を更新": "Refresh ticket status",
  "内容をもう一度入力してください。": "Please enter more detail.",
  "送信しました。受付状況はこの端末で確認できます。": "Sent. You can check the ticket status on this device.",
  "受付済み": "Received",
  "確認中": "Under review",
  "対応予定": "Planned",
  "対応済み": "Resolved",
  "対応を終了": "Closed",
  "利用者意見を送信した場合、入力本文、分類、閲覧ページおよび送信時刻を、改善内容の確認に使用してサーバーへ保存します。氏名、住所、連絡先などの個人情報や緊急情報は入力しないでください。": "When feedback is sent, its text, category, current page, and submission time are stored to review improvements. Location, name, address, and device identifiers are not sent. An email address is stored only when you choose to enter it for a support reply, and it is not included in the public ticket-status API. Do not enter emergency reports.",
  "サポート・ご意見を送信した場合、入力本文、分類、対象機能、期待する結果、表示中のタブ、配色、表示言語、表示サイズ、送信時刻および対応状況を、サポート対応と改善内容の確認に使用してサーバーへ保存します。位置情報、氏名、住所、端末識別情報は送信しません。回答を希望して任意入力されたメールアドレスは、サポート回答の連絡先としてのみ保存・使用します。氏名、住所、連絡先などの個人情報や緊急情報は入力しないでください。受付番号と対応状況はこの端末に最大8件、送信から30日間保存され、期限後の次回表示または状況更新時に消去できます。": "When you send support feedback, the message, category, feature, expected result, current tab, appearance, language, display size, submission time, and support status are stored for support and improvement. Location, name, address, and device identifiers are not sent. An email address is stored and used only when you optionally enter it for a reply. Do not enter emergency reports. This device stores up to eight ticket numbers and status updates for 30 days, then removes them when the support view is next opened or refreshed."
}));

const DYNAMIC_UI_TRANSLATIONS = new Map(Object.entries({
  "表示できる観測値がありません": "No observations are available",
  "気象庁防災情報XMLから地震情報を取得中です。": "Loading earthquake information from JMA Disaster Information XML.",
  "気象庁防災情報XMLから地震情報を取得できませんでした。": "Could not load earthquake information from JMA Disaster Information XML.",
  "直近の地震情報はありません。": "No recent earthquakes.",
  "気象庁防災情報XMLから火山情報を取得中です。": "Loading volcano information from JMA Disaster Information XML.",
  "火山情報を取得できませんでした。最新性を確認できていません。": "Could not load volcano information. Its current status cannot be verified.",
  "直近の火山情報はありません。": "No recent volcano information.",
  "この発表の本文は取得できませんでした。気象庁XML原文を確認してください。": "The bulletin text could not be loaded. Check the original JMA XML.",
  "日別件数はデータ更新後に表示されます。": "Daily counts will appear after the data is updated.",
  "詳細パネルで期間・囲み範囲を変更": "Change the period or selected area in the details panel",
  "各地の震度情報はありません。": "No local intensity observations are available.",
  "線と点の色は各モデルボタンの色に対応します": "Line and point colors match the model buttons.",
  "天気図の凡例": "Weather chart legend",
  "等圧線": "Isobars",
  "高気圧": "High pressure",
  "低気圧・熱帯低気圧・温帯低気圧": "Low pressure, tropical depression, and extratropical low",
  "台風": "Typhoon",
  "寒冷前線": "Cold front",
  "温暖前線": "Warm front",
  "停滞前線": "Stationary front",
  "閉塞前線": "Occluded front",
  "雷の時刻を選択": "Select lightning time",
  "天気図の時刻を選択": "Select weather chart time",
  "火山情報": "Volcano information",
  "火山情報の見方": "About volcano information",
  "地図で選択中": "Selected on map",
  "警戒状況未確認": "Alert status unverified",
  "最新の火山情報を確認します。状況により、火口内への立ち入りが規制されます。": "Check the latest volcano information. Access inside the crater may be restricted.",
  "火口内など": "Inside the crater and nearby",
  "火口内": "Inside the crater",
  "火口周辺": "Around the crater",
  "居住地域": "Residential area",
  "レベル": "Level",
  "火口から居住地域近くまで": "From the crater to areas near residences",
  "活火山に留意": "Be aware of volcanic activity",
  "火口周辺への立ち入りが規制されます。規制範囲には入らないでください。": "Entry around the crater is restricted. Do not enter the restricted area.",
  "登山禁止や入山規制が行われます。状況により、高齢者などは避難の準備をします。": "Climbing or mountain entry is restricted. Depending on conditions, people needing extra time should prepare to evacuate.",
  "高齢者など避難に時間がかかる方は避難し、ほかの住民は避難の準備をします。": "People needing extra time should evacuate; other residents should prepare to evacuate.",
  "危険な居住地域から避難します。対象地域と避難方法は、自治体の指示を確認してください。": "Evacuate hazardous residential areas. Follow local-authority instructions for affected areas and evacuation methods.",
  "降灰予報の予測時間": "Ashfall forecast time",
  "発表内容は気象庁の原文で確認してください。": "Check the original JMA bulletin for full details.",
  "今後の見通しはありません。": "No outlook is available.",
  "今後の見通しを取得中です。": "Loading the outlook.",
  "今後の見通し": "Outlook",
  "対象地域": "Affected areas",
  "対象地域不明": "Unknown area",
  "火山名不明": "Unknown volcano",
  "避難": "Evacuation",
  "高齢者等避難": "Evacuation of older residents and others",
  "指定河川洪水予報": "Designated river flood forecast",
  "指定河川洪水予報の発表状況": "Designated river flood forecast status",
  "現在、指定河川洪水予報は発表されていません": "No designated river flood forecast is currently in effect.",
  "指定河川洪水予報を取得できませんでした": "Could not load designated river flood forecasts.",
  "指定河川洪水予報を取得中...": "Loading designated river flood forecasts...",
  "予報区域外": "Outside forecast area",
  "最寄りの指定河川": "Nearest designated river",
  "観測所の水位実況・予測": "Observed and forecast river levels",
  "流域雨量": "Basin rainfall",
  "期間別の可能性": "Potential by period",
  "早期注意情報は発表されていません": "No early warning information is currently in effect.",
  "現在地に発表中の早期注意情報はありません。": "No early warning information is currently in effect for your location.",
  "現在地直下の危険度を確認しています。": "Checking the risk level at your location.",
  "詳細な発表本文は気象庁の原文で確認してください。": "Check the original JMA bulletin for the full detailed text.",
  "取得中…": "Loading…",
  "取得失敗": "Failed",
  "取得待ち": "Waiting",
  "詳細確認中": "Checking details",
  "発表状況を確認中": "Checking current bulletins",
  "取得できません": "Unavailable",
  "未確認": "Unverified",
  "欠測": "Missing",
  "時刻不明": "Time unknown",
  "時刻未取得": "Time unavailable",
  "発表時刻不明": "Issue time unknown",
  "取得日不明": "Retrieval date unknown",
  "日付不明": "Date unknown",
  "地域名不明": "Unknown area",
  "高さ未発表": "Height not announced",
  "未公表": "Not published",
  "暫定値": "Preliminary",
  "観測中": "Observing",
  "観測点": "Station",
  "観測地点": "Observation site",
  "選択地点": "Selected station",
  "潮位観測要約": "Tide observation summary",
  "潮位観測点": "Tide station",
  "観測点を選択してください": "Select an observation station",
  "潮位を取得中": "Loading tide levels",
  "潮位観測値を取得中です": "Loading tide observations.",
  "潮位観測値を取得できませんでした": "Could not load tide observations.",
  "潮位グラフの表示期間": "Tide chart period",
  "潮位グラフを閉じる": "Close tide chart",
  "沿岸": "Coast",
  "沖合": "Offshore",
  "沿岸の津波観測": "Coastal tsunami observations",
  "沖合の津波観測": "Offshore tsunami observations",
  "過去最高潮位": "Historical maximum tide level",
  "若干の海面変動": "Minor sea-level changes",
  "大津波": "Major tsunami",
  "津波情報未確認": "Tsunami status unverified",
  "津波情報を確認できません": "Tsunami information unavailable",
  "津波情報を取得できませんでした。": "Could not load tsunami information.",
  "気象庁の津波情報を確認しています。": "Checking JMA tsunami information.",
  "訓練・テスト表示": "Drill / test display",
  "実際の津波情報ではありません": "This is not actual tsunami information.",
  "現在地と凡例を活用する": "Use your location and the map legend",
  "全体像": "Overview",
  "表示切替": "Navigation",
  "詳細パネル": "Detail panel",
  "地図操作": "Map controls",
  "設定": "Settings",
  "防災": "Alerts",
  "地震・火山": "Earthquakes and volcanoes",
  "最新情報": "Latest information",
  "タップ / スライド": "Tap / swipe",
  "左右へスライド": "Swipe left or right",
  "地図ツール": "Map tools",
  "位置と表示内容を確認": "Location and map display",
  "周辺へ移動": "Move nearby",
  "色と記号を確認": "Check colors and symbols",
  "降水ナウキャスト": "Precipitation nowcast",
  "現在地と凡例を": "Use your location",
  "地図で使う": "and the map legend",
  "現在地ボタンで": "Use the location button",
  "周辺へ移動できます。": "to move to your area.",
  "地図の色や記号は": "Check map colors and symbols",
  "凡例から確認できます。": "in the legend.",
  "現在地ボタンで周辺へ移動し、凡例で地図の色や記号の意味を確認できます。": "Use the location button to move nearby, then check the legend for map colors and symbols.",
  "設定から管理者のお知らせ通知、マイエリア、外観を変更できます。Web版は警報・注意報をプッシュ通知しないため、公式情報も確認してください。": "Settings lets you manage administrator notices, My Area, and appearance. The web app does not send push notifications for warnings or advisories, so also check official information.",
  "初級": "Beginner",
  "基本の備えと天気の基礎": "Basic preparedness and weather",
  "中級": "Intermediate",
  "現行の防災情報と気象の仕組み": "Current disaster information and weather systems",
  "上級": "Advanced",
  "気象予報士試験レベルの独自問題": "Original questions at weather forecaster exam level",
  "現在地の様子を投稿": "Report local conditions",
  "表示する日付": "Display date",
  "アンサンブル": "Ensemble",
  "単一予報": "Deterministic",
  "平均": "Mean",
  "解析": "Analysis",
  "予測": "Forecast",
  "予報": "Forecast",
  "各国予想の凡例": "Global model legend",
  "各国予想の予報時刻": "Global model forecast time",
  "各予想メンバーの進路": "Track for each forecast member",
  "基準メンバーの進路": "Control-member track",
  "台風に発達する可能性のある候補": "Potential tropical development",
  "台風の解析値": "Typhoon analysis",
  "台風進路の表示": "Typhoon track view",
  "予報開始時の解析位置": "Analysis position at forecast start",
  "選択時刻の予想位置": "Forecast position at selected time",
  "予想進路中心線": "Forecast track centerline",
  "強風域 (15m/s以上)": "Strong-wind area (15 m/s or more)",
  "暴風域 (25m/s以上)": "Storm-force wind area (25 m/s or more)",
  "暴風警戒域": "Storm warning area",
  "過去の経路": "Past track",
  "中心位置": "Center position",
  "瞬間": "Gust",
  "台風情報を画像で共有": "Share typhoon information as an image",
  "ランキングを画像で共有": "Share ranking as an image",
  "震央調査中": "Epicenter under investigation",
  "気象庁の震央分布を取得中です。": "Loading JMA epicenter distribution.",
  "指定期間の震央分布を取得中です。": "Loading the epicenter distribution for the selected period.",
  "指定期間を検索しています": "Searching the selected period",
  "震央分布を取得できませんでした": "Could not load the epicenter distribution",
  "日付を切り替えています": "Changing date",
  "震央分布の期間": "Epicenter distribution period",
  "震央分布の条件": "Epicenter distribution filters",
  "震央分布の日付を選択": "Select epicenter distribution date",
  "震央分布の集計グラフ": "Epicenter distribution charts",
  "前日の震央分布": "Previous day's epicenter distribution",
  "翌日の震央分布": "Next day's epicenter distribution",
  "期間のプリセット": "Period presets",
  "囲み範囲": "Selected area",
  "囲み直す": "Redraw area",
  "範囲選択を中止": "Cancel area selection",
  "指定範囲": "Selected area",
  "全域": "All areas",
  "有感地震・XML": "Felt earthquakes · XML",
  "推計震度分布（250mメッシュ）": "Estimated intensity map (250 m grid)",
  "震源": "Hypocenter",
  "深さの色分け": "Depth colors",
  "その他の境界": "Other boundaries",
  "収束境界": "Convergent boundary",
  "横ずれ境界": "Transform boundary",
  "プレート等深線（浅い → 深い）": "Plate depth contours (shallow → deep)",
  "プレート面・等深線（浅い → 深い）": "Plate surfaces and contours (shallow → deep)",
  "震源とプレート等深線の立体表示": "3D hypocenters and plate depth contours",
  "1日ごとに確認": "Daily",
  "1時間": "1 hour",
  "6時間": "6 hours",
  "12時間": "12 hours",
  "前": "Previous",
  "次": "Next",
  "高": "High",
  "中": "Medium",
  "低": "Low",
  "単一の決定論予報です。アンサンブルに基づく発生確率はありません。": "This is a single deterministic forecast and does not provide an ensemble-based development probability.",
  "NCEPのensemble trackerが示す発生確率20%以上の候補です。台風発生の確定情報ではありません。": "Candidates with at least 20% development probability in the NCEP ensemble tracker. This is not confirmation that a typhoon will form.",
  "20本以上のアンサンブルメンバーが支持する上位候補です。発生確率や台風発生の確定情報ではありません。": "Leading candidates supported by at least 20 ensemble members. This is not a development probability or confirmation that a typhoon will form.",
  "単一の数値予報による参考進路です。気象庁の公式な台風進路予報ではありません。": "Reference track from a single numerical forecast. This is not an official JMA typhoon track forecast.",
  "数値予報のばらつきを示す参考情報です。気象庁の公式な台風進路予報ではありません。": "Reference information showing the spread among numerical forecasts. This is not an official JMA typhoon track forecast.",
  "実況の全国一括データは提供されていません": "Nationwide current observations are not provided as a single dataset",
  "キキクルのタイルを取得中です。": "Loading Risk Map tiles.",
  "キキクルのタイルを取得できませんでした。": "Could not load Risk Map tiles.",
  "早期注意情報（警報級の可能性）を発表区域ごとに表示しています。": "Showing early warning information (potential for warning-level conditions) by forecast area.",
  "雷活動度と雷放電の観測データを取得中です。": "Loading lightning activity and discharge observations.",
  "雷活動度と雷放電の観測データを取得できませんでした。": "Could not load lightning activity and discharge observations.",
  "気象庁の雷活動度と、直前5分間の落雷・雲放電を地図上に重ねています。観測位置には誤差や未検知が生じる場合があります。": "Overlaying JMA lightning activity and cloud-to-ground and cloud discharges from the previous five minutes. Locations may contain errors and some discharges may not be detected.",
  "× 対地放電（落雷）": "× Cloud-to-ground lightning",
  "○ 雲放電": "○ Cloud discharge",
  "地図上の潮位観測点をタップすると、実測潮位と警報基準を表示します。": "Tap a tide station on the map to view observed tide levels and warning thresholds.",
  "警報・注意報の発表区域": "Warning and advisory areas",
  "2日前以前の震源要素は暫定値で、後日変更される場合があります。": "Hypocenter data from two or more days ago is preliminary and may be revised.",
  "カルーセル": "Carousel",
  "グラフの日付": "Chart date",
  "グラフの凡例": "Chart legend",
  "ランキングを表示できません": "Ranking unavailable",
  "ランキング取得中...": "Loading ranking...",
  "一覧を表示中...": "Loading list...",
  "下位": "Lowest",
  "火山活動の状況": "Volcanic activity",
  "火山情報を取得できませんでした。前回取得した情報の最新性を確認できていません。": "Could not load volcano information. The previous data may no longer be current.",
  "過去の地震履歴を読み込み中": "Loading earlier earthquakes",
  "各国予想を取得できません": "Global forecasts unavailable",
  "各国予想を取得中": "Loading global forecasts",
  "危険警報": "Danger warning",
  "気象庁 防災情報XML": "JMA Disaster Information XML",
  "気象庁「日々の震源リスト」": "JMA Daily Hypocenter List",
  "気象庁XML": "JMA XML",
  "気象庁の津波情報を開く": "Open JMA tsunami information",
  "気象庁の天気図を地図上に重ねています。": "Overlaying JMA weather charts on the map.",
  "気象庁公開待ち": "Awaiting JMA publication",
  "気象庁発表の噴火警報・予報、解説情報、観測報、降灰予報を表示しています。": "Showing JMA volcanic warnings, forecasts, commentary, observations, and ashfall forecasts.",
  "警戒事項等": "Precautions",
  "現在、発表中の指定河川洪水予報はありません。": "No designated river flood forecasts are currently in effect.",
  "更新を確認できません": "Update status unavailable",
  "頃": "approx.",
  "今日最低": "Today's low",
  "最寄り観測点なし": "No nearby station",
  "最小": "Minimum",
  "最大": "Maximum",
  "昨日": "Yesterday",
  "指定河川": "Designated river",
  "指定河川洪水予報を取得できませんでした。": "Could not load designated river flood forecasts.",
  "指定河川洪水予報を取得中です。": "Loading designated river flood forecasts.",
  "次回の情報": "Next bulletin",
  "主要活断層帯": "Major active fault zone",
  "出典：": "Source:",
  "詳細情報": "Detailed information",
  "上位": "Highest",
  "深さ不明": "Depth unknown",
  "震央分布要約": "Epicenter distribution summary",
  "震源調査中": "Hypocenter under investigation",
  "台風データを取得できませんでした。": "Could not load typhoon data.",
  "台風データを取得できませんでした。詳細項目は未取得として表示しています。": "Could not load typhoon data. Unavailable details are marked accordingly.",
  "台風データを取得中です。": "Loading typhoon data.",
  "台風データ取得中": "Loading typhoon data",
  "台風情報を取得中": "Loading typhoon information",
  "台風名 未取得": "Typhoon name unavailable",
  "地震・震央分布": "Earthquakes and epicenter distribution",
  "地震情報を取得できませんでした。": "Could not load earthquake information.",
  "長押しで地震へ": "Press and hold for earthquakes",
  "直近の地震情報はありません": "No recent earthquake information",
  "直近の発表はありません": "No recent bulletins",
  "津波情報の件数": "Number of tsunami bulletins",
  "停止": "Stopped",
  "提供された過去実電文の台風解析・予報情報を表示しています。": "Showing typhoon analysis and forecast information from archived operational bulletins.",
  "天気図データを取得できませんでした。": "Could not load weather-chart data.",
  "天気図データを取得中です。": "Loading weather-chart data.",
  "当日・前日は防災情報XMLで発表された有感地震のみを表示しています。同一発表座標の地震は件数付きで重ねて表示します。": "For today and yesterday, only felt earthquakes reported in Disaster Information XML are shown. Reports at the same coordinates are combined with a count.",
  "到達予想時刻なし": "No estimated arrival time",
  "読み込み中…": "Loading…",
  "日最高": "Daily high",
  "日最高・日最低ランキングを取得できません": "Could not load daily high and low rankings",
  "日最低": "Daily low",
  "日付を選択": "Select date",
  "発表中の指定河川洪水予報を河川区間ごとに表示しています。": "Showing active designated river flood forecasts by river section.",
  "氾濫により浸水が想定される地区": "Areas expected to flood",
  "表示する各国予想モデルを選択してください。": "Select the global forecast models to display.",
  "表示モデルを選択": "Select models",
  "偏差 --": "Anomaly --",
  "暴風": "Storm",
  "未取得": "Unavailable",
  "更新時刻: 未取得": "Updated: Unavailable",
  "更新時刻 未取得": "Updated: Unavailable",
  "未保存": "Not saved",
  "予想": "Forecast",
  "予測最大": "Forecast maximum",
  "MeteoScope アメダスランキング": "MeteoScope AMeDAS Ranking",
  "MeteoScope 台風情報": "MeteoScope Typhoon Information",
  "MeteoScope 地震情報": "MeteoScope Earthquake Information",
  "MeteoScopeアカウントでログイン中": "Signed in with a MeteoScope account",
  "MeteoScopeアカウントの状態を確認しています。": "Checking MeteoScope account status.",
  "MeteoScope管理者からのお知らせを受け取ります。": "Receive notices from MeteoScope administrators.",
  "PDFまたはPNG・JPEG画像を選択してください。": "Select a PDF, PNG, or JPEG image.",
  "PDFを表示できませんでした。": "Could not display the PDF.",
  "PDF保存処理が中断されました。": "PDF storage was interrupted.",
  "PDF保存領域が別のタブで使用中です。": "PDF storage is in use by another tab.",
  "PDF保存領域へアクセスできませんでした。": "Could not access PDF storage.",
  "PDF保存領域を開けませんでした。": "Could not open PDF storage.",
  "アーリーアクセスが有効です。Webアプリを削除する場合は、先に設定から解除してください。": "Early access is enabled. Disable it in Settings before removing the web app.",
  "アカウントサーバーへ接続できませんでした。": "Could not connect to the account server.",
  "アカウントとすべてのクイズ記録を完全に削除しますか？": "Permanently delete the account and all quiz records?",
  "アカウントと記録を削除しました。": "Account and records deleted.",
  "アカウントを確認・管理": "View and manage account",
  "アカウントを作成しました。": "Account created.",
  "アカウント機能は現在準備中です。": "Account features are not yet available.",
  "お知らせ通知は有効です": "Notice notifications are on",
  "このブラウザではPDF保存に対応していません。": "This browser does not support PDF storage.",
  "このブラウザではWeb通知を利用できません。": "Web notifications are unavailable in this browser.",
  "この端末のアーリーアクセスを解除しました。通信できなかった場合は次回起動時に再送します。Webアプリを削除する場合は先に解除してください。": "Early access was disabled on this device. If the request could not be sent, it will be retried on the next launch. Disable early access before removing the web app.",
  "シリアルコードを入力してください。": "Enter a serial code.",
  "シリアルコードを入力して認証してください。": "Enter a serial code to authenticate.",
  "シリアルコードを認証できませんでした。": "Could not authenticate the serial code.",
  "マイエリアはまだ登録されていません。": "No areas have been saved yet.",
  "まだ記録がありません。最初の挑戦者になりましょう。": "No scores yet. Be the first to take the quiz.",
  "メンテナンスなどの重要なお知らせを通知できます。": "Receive important notices such as maintenance updates.",
  "もう一度挑戦して、避難行動と情報の見方を確認しましょう。": "Try again to review evacuation actions and how to read information.",
  "よくできました。解説を思い出しながら備えを確認しましょう。": "Well done. Review your preparedness with the explanations in mind.",
  "ランキングへ記録しています…": "Saving to the ranking…",
  "ランキングへ記録するにはアカウントでログインしてください。": "Sign in to save your score to the ranking.",
  "ランキング基盤は現在準備中です。": "The ranking service is not yet available.",
  "ランキング基盤は現在準備中です。クイズはそのまま利用できます。": "The ranking service is not yet available. You can still use the quiz.",
  "ランキング基盤は準備中です": "Ranking service not yet available",
  "ログアウトしました。": "Signed out.",
  "ログイン・新規作成": "Sign in or create account",
  "ログインしました。": "Signed in.",
  "ログインするとWeb版の共有ランキングに参加できます。": "Sign in to join the shared web ranking.",
  "ログインまたは新規作成してアカウント機能を利用できます。": "Sign in or create an account to use account features.",
  "案内を閉じる": "Close guide",
  "位置をタップ": "Tap a location",
  "下部ボタンをタップするか、ボタン上を横にスライドして表示を切り替えます。": "Tap a bottom button or swipe across the buttons to change views.",
  "画像": "Image",
  "画像を作成できませんでした。": "Could not create the image.",
  "画像を読み込めませんでした。": "Could not load the image.",
  "画像を表示できませんでした。": "Could not display the image.",
  "機能メニューを閉じる": "Close tools menu",
  "気象庁の最新予報を読み込んでいます。": "Loading the latest JMA forecast.",
  "共有機能に対応していないため、PNGを保存しました。": "Sharing is unavailable, so the PNG was saved instead.",
  "結果を見る": "View results",
  "月": "Month",
  "検索できませんでした。": "Search failed.",
  "検索中...": "Searching...",
  "現在のJ-SHIS表示を使用します。": "Use the current J-SHIS display.",
  "今回はランキング対象外です。通信状態を確認して再挑戦してください。": "This attempt is not eligible for the ranking. Check your connection and try again.",
  "削除しています...": "Deleting...",
  "削除できませんでした": "Could not delete",
  "削除中": "Deleting",
  "産総研データは地震タブで活断層表示時に取得します。": "GSJ data is loaded when Active faults is enabled on the Earthquakes tab.",
  "産総研データを認証・取得中です。取得完了まではJ-SHISを表示します。": "Authenticating and loading GSJ data. J-SHIS remains visible until loading finishes.",
  "産総研活断層データの形式が正しくありません。": "The GSJ active-fault data format is invalid.",
  "産総研活断層データの取得がタイムアウトしました。": "Loading GSJ active-fault data timed out.",
  "産総研活断層データの取得にはアーリーアクセス認証が必要です。": "Early-access authentication is required to load GSJ active-fault data.",
  "産総研活断層データを取得できませんでした。": "Could not load GSJ active-fault data.",
  "使い始める": "Get started",
  "時間をおいてもう一度お試しください。": "Please try again later.",
  "自分に合った情報を受け取る": "Get information relevant to you",
  "表示と通知": "Display and notifications",
  "必要な情報を": "Make information",
  "自分向けに整える": "work for you",
  "設定では、お知らせ・": "In Settings, you can manage",
  "マイエリア・外観を": "notices, My Areas,",
  "まとめて変更できます。": "and appearance together.",
  "災害時は公式情報も": "During an emergency, also check",
  "あわせて確認してください。": "official sources.",
  "周辺の危険は3つまで選択できます。": "Select up to three nearby hazards.",
  "週間天気予報を取得中": "Loading weekly forecast",
  "週間天気予報を表示できません": "Weekly forecast unavailable",
  "状態を確認できません": "Status unavailable",
  "正解です": "Correct",
  "選択した予報区域を確認できません。": "Could not identify the selected forecast area.",
  "全問正解です。日頃の備えを続けましょう。": "All answers are correct. Keep up your everyday preparedness.",
  "送信しています...": "Sending...",
  "送信しました。ありがとうございます。": "Sent. Thank you.",
  "送信できませんでした。": "Could not send.",
  "送信できませんでした。時間をおいてもう一度お試しください。": "Could not send. Please try again later.",
  "地域未取得": "Area unavailable",
  "地震ボタンを長押しすると火山情報へ切り替えられます": "Press and hold the Earthquakes button to switch to volcano information",
  "地図下の要約バーはそのまま操作できます。上へ引き出すと詳細パネルが開きます。": "Use the summary bar below the map directly, or pull it up to open the details panel.",
  "通知サーバーの設定が未完了です。": "The notification server is not fully configured.",
  "天気未取得": "Weather unavailable",
  "投稿しています…": "Posting…",
  "投稿しました。雨雲レーダー上に反映しました。": "Posted and added to the radar map.",
  "投稿できませんでした。": "Could not post.",
  "投稿にはMeteoScopeアカウントへのログインが必要です。": "Sign in to a MeteoScope account to post.",
  "内容をもう少し入力してください。": "Enter a little more detail.",
  "日": "Day",
  "日付選択を閉じる": "Close date picker",
  "入れ替えたいボタンを選び、移動先のボタンをタップしてください。": "Select the button to move, then tap its destination.",
  "認証サーバーが応答しませんでした。": "The authentication server did not respond.",
  "認証サーバーへ接続できませんでした。": "Could not connect to the authentication server.",
  "認証の有効期限が切れています。": "Authentication has expired.",
  "認証状態を確認できませんでした。": "Could not verify authentication status.",
  "年": "Year",
  "年月日を選択": "Select year, month, and day",
  "表示したい情報を切り替える": "Switch the information shown",
  "表示したい情報へ": "Switch to the information",
  "すばやく切り替える": "you want",
  "下部ボタンをタップするか、": "Tap a navigation button,",
  "ボタン上を横へスライドします。": "or swipe across the buttons.",
  "表示切替ボタンの並び順": "Navigation button order",
  "表示切替ボタンを取得できませんでした。": "Could not load the navigation buttons.",
  "不正解です": "Incorrect",
  "保存されていません": "Not saved",
  "保存状態を確認できませんでした": "Could not verify saved status",
  "防災・気象情報をひとつの地図で": "Weather and disaster information on one map",
  "防災・気象情報を": "Weather and disaster information",
  "ひとつの地図で": "on one map",
  "雨雲・観測・警報・台風・地震を、": "View radar, observations, and warnings,",
  "下部の表示切替から確認できます。": "and access them from the navigation bar.",
  "防災クイズで確認": "Review with Disaster Quiz",
  "防災メモを編集": "Edit preparedness note",
  "防災メモを保存できませんでした。": "Could not save the preparedness note.",
  "凡例を閉じる": "Close legend",
  "未ログイン": "Signed out",
  "目印はまだありません。": "No markers yet.",
  "目印を追加": "Add marker",
  "予報区域": "Forecast area",
  "伊豆諸島": "Izu Islands",
  "伊豆諸島北部": "Northern Izu Islands",
  "伊豆諸島南部": "Southern Izu Islands",
  "小笠原諸島": "Ogasawara Islands",
  "東京地方": "Tokyo Region",
  "会津": "Aizu",
  "中通り": "Nakadori",
  "浜通り": "Hamadori",
  "内陸": "Inland",
  "沿岸北部": "Northern Coast",
  "沿岸南部": "Southern Coast",
  "南部平野部": "Southern Plains",
  "北部平野部": "Northern Plains",
  "南部山沿い": "Southern Mountains",
  "北部山沿い": "Northern Mountains",
  "置賜": "Okitama",
  "下越": "Kaetsu",
  "中越": "Chuetsu",
  "上越": "Joetsu",
  "佐渡": "Sado",
  "中・西部": "Central and Western Area",
  "東部・富士五湖": "Eastern Area and Fuji Five Lakes",
  "宗谷地方": "Soya Region",
  "天売焼尻": "Teuri and Yagishiri",
  "十勝地方": "Tokachi Region",
  "胆振地方": "Iburi Region",
  "空知地方": "Sorachi Region",
  "後志地方": "Shiribeshi Region",
  "渡島地方": "Oshima Region",
  "檜山地方": "Hiyama Region",
  "石狩地方": "Ishikari Region",
  "日高地方": "Hidaka Region",
  "釧路地方": "Kushiro Region",
  "根室地方": "Nemuro Region",
  "上川地方": "Kamikawa Region",
  "留萌地方": "Rumoi Region",
  "網走地方": "Abashiri Region",
  "北見地方": "Kitami Region",
  "紋別地方": "Monbetsu Region",
  "津軽": "Tsugaru",
  "下北": "Shimokita",
  "三八上北": "Sanpachi-Kamikita",
  "東部": "Eastern Area",
  "西部": "Western Area",
  "北部": "Northern Area",
  "南部": "Southern Area",
  "中部": "Central Area",
  "北中部": "North-Central Area",
  "北西部": "Northwestern Area",
  "北東部": "Northeastern Area",
  "嶺北": "Reihoku",
  "嶺南": "Reinan",
  "飛騨地方": "Hida Region",
  "能登": "Noto",
  "加賀": "Kaga",
  "丹後": "Tango",
  "丹波": "Tamba",
  "山城": "Yamashiro",
  "播磨": "Harima",
  "但馬": "Tajima",
  "淡路島": "Awaji Island",
  "紀北": "Kihoku",
  "紀中": "Kichu",
  "紀南": "Kinan",
  "隠岐": "Oki Islands",
  "中予": "Chuyo",
  "東予": "Toyo",
  "南予": "Nanyo",
  "北九州地方": "Kitakyushu Region",
  "筑豊地方": "Chikuho Region",
  "筑後地方": "Chikugo Region",
  "壱岐・対馬": "Iki and Tsushima",
  "五島": "Goto Islands",
  "薩摩地方": "Satsuma Region",
  "大隅地方": "Osumi Region",
  "種子島・屋久島地方": "Tanegashima and Yakushima Region",
  "奄美地方": "Amami Region",
  "本島北部": "Northern Okinawa Island",
  "本島中南部": "Central and Southern Okinawa Island",
  "久米島": "Kume Island",
  "大東島地方": "Daito Islands Region",
  "宮古島地方": "Miyako Islands Region",
  "八重山地方": "Yaeyama Islands Region",
  "鹿児島県（奄美地方除く）": "Kagoshima Prefecture (excluding Amami)",
  "胆振・日高地方": "Iburi and Hidaka Region",
  "石狩・空知・後志地方": "Ishikari, Sorachi and Shiribeshi Region",
  "渡島・檜山地方": "Oshima and Hiyama Region",
  "釧路・根室・十勝地方": "Kushiro, Nemuro and Tokachi Region",
  "網走・北見・紋別地方": "Abashiri, Kitami and Monbetsu Region",
  "上川・留萌地方": "Kamikawa and Rumoi Region",
  "現在地・早期注意情報": "Current location · Early warning information",
  "現在地・指定河川洪水予報": "Current location · Designated river flood forecast",
  "現在地周辺の指定河川情報はありません。": "No designated river flood information is available near your current location.",
  "予報区域を特定しています。": "Identifying forecast area.",
  "現在地を確認しています": "Checking current location",
  "現在地を取得できませんでした。": "Could not get your current location.",
  "要約から詳しい情報へ": "From summary to details",
  "要約から": "From the summary",
  "詳しい情報へ": "to the details",
  "要約バーを上へ引き出すと、": "Pull the summary bar upward",
  "詳しい情報が開きます。": "to open detailed information.",
  "要約バー内の切替も": "Controls inside the summary bar",
  "そのまま操作できます。": "remain available.",
  "利用条件を確認しています…": "Checking usage requirements…",
  "雨雲、観測、警報、台風、地震を下部の表示切替から確認できます。": "Use the bottom navigation to view radar, observations, warnings, typhoons, and earthquakes.",
  "避": "E",
  "集": "M",
  "備": "S",
  "-5未満": "Below -5",
  "10〜15（やや強い）": "10–15 (Moderately strong)",
  "10〜20（やや強い）": "10–20 (Moderately strong)",
  "1040hPa以上": "1040 hPa or higher",
  "15〜20（強い風）": "15–20 (Strong wind)",
  "20〜25（非常に強い）": "20–25 (Very strong)",
  "20〜30（強い雨）": "20–30 (Heavy rain)",
  "200cm以上": "200 cm or more",
  "25〜30（夏日）": "25–30 (Warm day)",
  "30〜35（真夏日）": "30–35 (Hot day)",
  "30〜50（激しい雨）": "30–50 (Very heavy rain)",
  "30%未満": "Below 30%",
  "30m/s以上（猛烈な風）": "30 m/s or more (Violent wind)",
  "35〜40（猛暑日）": "35–40 (Extremely hot day)",
  "40以上（酷暑日）": "40 or higher (Exceptional heat)",
  "50〜80（非常に激しい）": "50–80 (Extremely heavy rain)",
  "5m/s未満": "Below 5 m/s",
  "80以上（猛烈な雨）": "80 or more (Torrential rain)",
  "90%以上": "90% or higher",
  "980hPa未満": "Below 980 hPa",
  "Canvasを初期化できません": "Could not initialize the canvas",
  "GEFS平均": "GEFS Mean",
  "PNGプレビュー用Canvasが見つかりません": "PNG preview canvas not found",
  "アメダスランキング": "AMeDAS Ranking",
  "アンサンブル支持": "Ensemble support",
  "オフラインです。表示中の情報は最新ではない可能性があります。": "You are offline. The displayed information may not be current.",
  "お知らせがあります。": "A notice is available.",
  "お知らせテロップ": "Notice ticker",
  "このブラウザでは位置情報を利用できません。": "Location is unavailable in this browser.",
  "シリアルコードを確認中です。": "Checking serial code.",
  "位置情報の取得がタイムアウトしました。": "Location request timed out.",
  "雨雲時系列を表示できません。": "Could not display the radar timeline.",
  "沿岸津波観測": "Coastal tsunami observations",
  "沖合津波観測": "Offshore tsunami observations",
  "過去の地震履歴を取得できませんでした。": "Could not load earlier earthquake history.",
  "解析情報": "Analysis",
  "各国予想を取得できませんでした": "Could not load global forecasts",
  "観測地点不明": "Unknown observation site",
  "危険": "Danger",
  "気象庁防災情報XMLの地震・津波情報と、気象庁の推計震度分布を表示します。": "Displays earthquake and tsunami information from JMA Disaster Information XML and JMA estimated intensity maps.",
  "強": "Strong",
  "警戒": "Warning",
  "警戒レベル": "Alert level",
  "決定論": "Deterministic",
  "現在メンテナンス中です。": "Maintenance is currently in progress.",
  "降灰 やや多量": "Moderate ashfall",
  "降灰 少量": "Light ashfall",
  "降灰 多量": "Heavy ashfall",
  "降灰予報範囲": "Ashfall forecast area",
  "降水強度": "Precipitation intensity",
  "今後の情報等に留意": "Monitor further information",
  "災害切迫": "Imminent disaster",
  "弱": "Weak",
  "小さな噴石の落下予測範囲": "Forecast area for small volcanic projectiles",
  "浸水キキクル": "Flood Risk Map",
  "震度不明": "Intensity unknown",
  "台風の現在位置、進路、予報円、暴風警戒域を表示します。": "Displays the current typhoon position, track, forecast circles, and storm warning area.",
  "大津波警報": "Major Tsunami Warning",
  "地域を確認できません": "Area unavailable",
  "地図の読み込みに失敗しました": "Could not load the map",
  "注意": "Caution",
  "潮位観測値を取得できませんでした。": "Could not load tide observations.",
  "調査中": "Under investigation",
  "津波警報": "Tsunami Warning",
  "津波注意報": "Tsunami Advisory",
  "津波予報": "Tsunami Forecast",
  "土砂キキクル": "Landslide Risk Map",
  "認証状態を確認中です。": "Checking authentication status.",
  "配信元": "Source",
  "発生確率": "Development probability",
  "発表終了": "Ended",
  "本": "members"
}));

const PREFECTURE_TRANSLATIONS = new Map(Object.entries({
  "北海道": "Hokkaido", "青森県": "Aomori", "岩手県": "Iwate", "宮城県": "Miyagi",
  "秋田県": "Akita", "山形県": "Yamagata", "福島県": "Fukushima", "茨城県": "Ibaraki",
  "栃木県": "Tochigi", "群馬県": "Gunma", "埼玉県": "Saitama", "千葉県": "Chiba",
  "東京都": "Tokyo", "神奈川県": "Kanagawa", "新潟県": "Niigata", "富山県": "Toyama",
  "石川県": "Ishikawa", "福井県": "Fukui", "山梨県": "Yamanashi", "長野県": "Nagano",
  "岐阜県": "Gifu", "静岡県": "Shizuoka", "愛知県": "Aichi", "三重県": "Mie",
  "滋賀県": "Shiga", "京都府": "Kyoto", "大阪府": "Osaka", "兵庫県": "Hyogo",
  "奈良県": "Nara", "和歌山県": "Wakayama", "鳥取県": "Tottori", "島根県": "Shimane",
  "岡山県": "Okayama", "広島県": "Hiroshima", "山口県": "Yamaguchi", "徳島県": "Tokushima",
  "香川県": "Kagawa", "愛媛県": "Ehime", "高知県": "Kochi", "福岡県": "Fukuoka",
  "佐賀県": "Saga", "長崎県": "Nagasaki", "熊本県": "Kumamoto", "大分県": "Oita",
  "宮崎県": "Miyazaki", "鹿児島県": "Kagoshima", "沖縄県": "Okinawa"
}));

const PHRASE_TRANSLATIONS = [
  ["火山の状況に関する解説情報", "Volcano activity commentary"],
  ["噴火警報・予報", "Volcanic warnings and forecasts"],
  ["火口周辺警報", "Crater-area warning"],
  ["火口周辺危険", "Danger around the crater"],
  ["火口周辺規制", "Do not approach the crater"],
  ["降灰予報（定時）", "Scheduled ashfall forecast"],
  ["降灰予報", "Ashfall forecast"],
  ["警戒事項等", "Precautions"],
  ["継続", "continued"],
  ["現在発表中の津波警報・注意報はありません", "There are no tsunami warnings or advisories in effect"],
  ["現在地に発表中の警報・注意報はありません", "There are no active warnings or advisories near your location"],
  ["現在地に発表中の警報・注意報があります", "Warnings or advisories are in effect near your location"],
  ["発表中の警報・注意報はありません", "There are no active warnings or advisories"],
  ["発表中の警報・注意報", "Active warnings and advisories"],
  ["警報から注意報", "Downgraded to advisory"],
  ["津波の心配はありません", "No tsunami threat"],
  ["津波の心配なし", "No tsunami threat"],
  ["最大瞬間風速", "Maximum gust"],
  ["早期注意情報", "Early warning information"],
  ["警報・注意報", "Warnings and advisories"],
  ["噴火警戒レベル", "Volcanic Alert Level"],
  ["最大震度", "Max. intensity"],
  ["震源地", "Epicenter"],
  ["発生時刻", "Time"],
  ["更新時刻", "Updated"],
  ["降水確率", "Precipitation"],
  ["最高気温", "High"],
  ["最低気温", "Low"],
  ["現在地未取得", "Location unavailable"],
  ["更新時刻", "Updated"],
  ["観測時刻", "Observed"],
  ["最大瞬間風速", "Maximum gust"],
  ["海面気圧", "Sea-level pressure"],
  ["積雪量", "Snow depth"],
  ["積雪深", "Snow depth"],
  ["日照時間", "Sunshine duration"],
  ["降水量", "Precipitation"],
  ["風速", "Wind speed"],
  ["湿度", "Humidity"],
  ["気圧", "Pressure"],
  ["気温", "Temperature"],
  ["現在地", "Current location"],
  ["地方", " Region"],
  ["近海", " offshore"],
  ["付近", " area"],
  ["市", " City"],
  ["町", " Town"],
  ["村", " Village"]
];

let preference = readLanguagePreference();
let initialized = false;
let observer = null;
const listeners = new Set();
let textStates = new WeakMap();
let attributeStates = new WeakMap();
let placeNames = new Map();
let placeNamesPromise = null;

export function setupLocale() {
  if (!initialized) {
    initialized = true;
    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES
    });
  }
  applyLocale();
  void loadOfficialPlaceNames();
  return {
    getPreference: () => preference,
    getResolvedLanguage: () => preference,
    setPreference: setLanguagePreference,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export function getCurrentLanguage() {
  return preference;
}

export function localizeText(value, language = preference) {
  if (value == null || language !== "en") return value == null ? "" : String(value);
  const text = String(value);
  const leading = text.match(/^\s*/u)?.[0] ?? "";
  const trailing = text.match(/\s*$/u)?.[0] ?? "";
  const core = text.slice(leading.length, text.length - trailing.length);
  if (!core) return text;
  return `${leading}${translateCore(core)}${trailing}`;
}

export function localizeVolcanoText(value, fallback = "", language = preference) {
  const source = value == null ? "" : String(value).trim();
  if (!source || language !== "en") return source;
  const normalizedSource = normalizeVolcanoSource(source);

  const localized = localizeText(source, language);
  if (!containsJapaneseText(localized)) return localized;

  const nextBulletinMatch = normalizedSource.match(
    /^次の(.+?)は、(\d{1,2})日(?:（.）)?(\d{1,2})時頃に発表の予定です。[。\s]*(?:なお、)?火山活動の状況に変化があった場合には、随時お知らせします。?$/u
  );
  if (nextBulletinMatch) {
    const bulletin = localizeText(nextBulletinMatch[1], language);
    return `The next ${bulletin.toLowerCase()} is scheduled for around ${nextBulletinMatch[3]}:00 on the ${ordinal(Number(nextBulletinMatch[2]))}. Updates may be issued sooner if volcanic activity changes.`;
  }

  const ashfallMatch = normalizedSource.match(
    /^現在、(.+?)は(.+?)です。.+?噴火が発生した場合には、(.+?)に降灰が予想されます。?$/u
  );
  if (ashfallMatch) {
    const volcano = localizeText(ashfallMatch[1], language);
    const status = localizeText(ashfallMatch[2], language);
    return `${volcano} is currently under ${status}. Ashfall is forecast in the indicated direction and time period if an eruption occurs.`;
  }

  const summary = buildVolcanoEnglishSummary(source);
  if (summary) return summary;

  return fallback || "See the original JMA bulletin for complete details.";
}

function buildVolcanoEnglishSummary(value) {
  const source = normalizeVolcanoSource(value);
  const sentences = source
    .split(/(?<=。)/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const facts = [];
  const add = (condition, sentence) => {
    if (condition && sentence && !facts.includes(sentence)) facts.push(sentence);
  };

  const alertLevel = source.match(/噴火警戒レベル\s*([1-5])/u)?.[1];
  add(alertLevel, `The bulletin states Volcanic Alert Level ${alertLevel}.`);
  add(
    /噴火警報[（(]周辺海域[）)]|周辺海域警戒/u.test(source),
    "The bulletin states that a volcanic warning applies to the surrounding waters."
  );
  add(
    /火口周辺警報/u.test(source) && !alertLevel,
    "The bulletin states that a crater-area warning applies."
  );
  add(
    /火山活動(?:の活発な状態|が高まった状態|が活発な状態).*継続|火山活動が高まって/u.test(source),
    "Volcanic activity remains elevated."
  );

  const eruptionReported = sentences.some((sentence) =>
    /(?:噴火を確認しました|噴火を観測しました|噴火が発生(?:しました|した(?:と推定されます)?|し[、て]|しています))/u.test(sentence)
      && !/(?:発生する可能性|発生するおそれ|発生した場合|発生が予想|警戒してください)/u.test(sentence)
  );
  add(eruptionReported, "The bulletin describes an eruption in the source text.");
  add(
    /活発な噴火活動が続/u.test(source),
    "Active eruptive activity is continuing."
  );
  add(
    /新たな噴火は発生していません|噴火の発生は認められていません|噴火は観測されていません/u.test(source),
    "The bulletin also states that no new eruption was observed for a period described in the source text."
  );
  add(
    /噴火及び火映は観測されていません/u.test(source),
    "At a monitored crater, the bulletin states that no eruption or crater glow was observed."
  );

  const plumeHeight = source.match(
    /噴煙[^。]*?火口縁上(?:の高さ)?(?:約)?\s*([0-9.]+)\s*(km|m)/u
  );
  if (plumeHeight) {
    facts.push(
      `The volcanic plume rose to about ${formatVolcanoMeasurement(plumeHeight[1], plumeHeight[2])} above the crater rim.`
    );
  }
  add(
    /噴煙活動[^。]*(?:活発|高まった)|活発な噴煙活動/u.test(source),
    "Active plume emissions are continuing."
  );
  add(
    /気象衛星[^。]*噴煙を観測/u.test(source),
    "Satellite observations detected an eruption plume."
  );
  const estimatedPlumeHeight = source.match(/噴煙の高さは(?:約)?\s*([0-9.]+)\s*(km|m)/u);
  if (!plumeHeight && estimatedPlumeHeight) {
    facts.push(
      `The plume height was estimated at about ${formatVolcanoMeasurement(estimatedPlumeHeight[1], estimatedPlumeHeight[2])}.`
    );
  }
  add(
    /発光現象/u.test(source),
    "Incandescence has also been observed at night."
  );
  add(
    /熱活動[^。]*(?:高まった|活発)/u.test(source),
    "Elevated thermal activity is continuing near the crater."
  );

  const gasAmounts = Array.from(
    source.matchAll(/1日あたり\s*([0-9,.]+)\s*トン/gu),
    (match) => match[1]
  ).filter((amount, index, values) => values.indexOf(amount) === index);
  if (gasAmounts.length) {
    facts.push(
      `Sulfur dioxide emission measurements cited in the bulletin include ${joinEnglishList(gasAmounts.map((amount) => `${amount} tons per day`))}.`
    );
  }

  add(
    /火山性地震[^。]*(?:概ね|おおむね)?少なく/u.test(source),
    "Volcanic earthquake activity has generally remained low."
  );
  add(
    /火山性地震[^。]*(?:増加|活発化)/u.test(source),
    "An increase in volcanic earthquake activity has been observed."
  );
  add(
    /火山性地震[^。]*観測されていません/u.test(source),
    "The bulletin states that some previously observed volcanic earthquakes have not been detected recently."
  );
  add(
    /火山性地震[^。]*継続して発生/u.test(source),
    "Low-level volcanic earthquake activity is continuing."
  );
  add(
    /火山性微動/u.test(source),
    "The bulletin also reports on volcanic tremor observations."
  );
  add(
    /火山性地震、爆発の回数/u.test(source),
    "The bulletin lists daily counts of volcanic earthquakes and explosions; the earthquake counts are preliminary and may be revised."
  );

  const dailyCounts = Array.from(
    source.matchAll(/(?:([0-9]+)月)?([0-9]+)日(?:[0-9]+時まで)?\s*([0-9]+)回\s*([0-9]+)回/gu),
    (match) => ({
      month: match[1],
      day: match[2],
      earthquakes: match[3],
      explosions: match[4]
    })
  );
  if (/火山性地震\s+爆発/u.test(source) && dailyCounts.length) {
    facts.push(
      dailyCounts.map((count) => {
        const date = count.month ? `${count.month}/${count.day}` : `day ${count.day}`;
        return `${date}: ${count.earthquakes} volcanic earthquakes and ${count.explosions} explosions`;
      }).join("; ") + "."
    );
  }

  const crustalInflationLeveledOff = /地殻変動[^。]*停滞/u.test(source);
  add(
    crustalInflationLeveledOff,
    "The previously observed crustal deformation has recently leveled off."
  );
  add(
    !crustalInflationLeveledOff
      && /(?:山体|火口付近|浅部)[^。]*膨張|膨張を示す[^。]*地殻変動/u.test(source),
    "The bulletin indicates crustal deformation consistent with inflation."
  );
  add(
    /傾斜変動/u.test(source),
    "Tilt observations continue to show changes around the crater."
  );
  const gnssChangeLeveledOff = /[ＧG][ＮN][ＳS][ＳS][^。]*停滞/iu.test(source);
  add(
    gnssChangeLeveledOff,
    "The previously observed GNSS baseline change has recently leveled off."
  );
  add(
    !gnssChangeLeveledOff
      && /[ＧG][ＮN][ＳS][ＳS][^。]*(?:マグマ[^。]*蓄積|膨張)[^。]*(?:伸び|変動)/iu.test(source),
    "The bulletin indicates GNSS baseline changes consistent with magma accumulation or inflation at depth."
  );
  add(
    /マグマ[^。]*蓄積した状態/u.test(source),
    "Magma remains accumulated at depth."
  );
  add(
    /火山ガス[^。]*(?:概ね|おおむね)?多い状態/u.test(source),
    "Volcanic gas emissions remain high."
  );

  const impactDistance = source.match(
    /(?:約|概ね|おおむね)?\s*([0-9.]+)\s*(km|m)の範囲に影響を及ぼす噴火/u
  );
  if (impactDistance) {
    facts.push(
      `An eruption could affect an area within about ${formatVolcanoMeasurement(impactDistance[1], impactDistance[2])} of the crater.`
    );
  }
  add(
    /今後も?噴火が発生する可能性|噴火の可能性/u.test(source),
    "Further eruptions remain possible."
  );
  add(
    /今後も?噴火活動が継続/u.test(source),
    "Eruptive activity is expected to continue."
  );
  add(
    /海底噴火が発生する可能性/u.test(source),
    "An underwater eruption remains possible."
  );
  add(
    /沿岸[^。]*海底噴火[^。]*注意/u.test(source),
    "Stay alert for small underwater eruptions near the coast."
  );
  add(
    /小規模な噴火[^。]*(?:警戒|注意)/u.test(source),
    "Remain alert in areas where small eruptions have previously occurred."
  );

  const discoloredWater = source.match(/直径(?:約)?\s*([0-9.]+)\s*(km|m)[^。]*変色水/u);
  if (discoloredWater) {
    facts.push(
      `Discolored water about ${formatVolcanoMeasurement(discoloredWater[1], discoloredWater[2])} across was observed near the volcano.`
    );
  } else {
    add(
      /変色水/u.test(source),
      "Discolored water has been observed near the volcano."
    );
  }

  const craterLakeShare = source.match(/湯だまり量は、?約\s*([0-9]+)割/u)?.[1];
  if (craterLakeShare) {
    facts.push(
      `A field survey found a crater lake covering about ${Number(craterLakeShare) * 10}% of the crater floor, similar to the previous survey.`
    );
  } else {
    add(
      /湯だまり/u.test(source),
      "A crater lake was observed during the field survey."
    );
  }
  add(
    /小規模な土砂噴出/u.test(source),
    "Small sediment ejections were also observed in the crater lake."
  );

  const hazardSentences = sentences.filter((sentence) =>
    /(?:警戒してください|注意してください|可能性があります|おそれがあります|危険)/u.test(sentence)
  ).join(" ");
  add(
    /大きな噴石/u.test(hazardSentences),
    "Beware of large ballistic rocks around the crater."
  );
  add(
    /危険な地域には立ち入らない/u.test(source),
    "Do not enter hazardous areas; follow instructions from local authorities."
  );
  add(
    /風下側[^。]*火山灰|火山灰[^。]*風下側/u.test(hazardSentences),
    "Downwind areas may be affected by volcanic ash and small rocks."
  );
  add(
    /火砕流/u.test(hazardSentences),
    "Stay alert for pyroclastic flows."
  );
  add(
    /ベースサージ/u.test(hazardSentences),
    "Stay alert for base surges."
  );
  const floatingMaterialObserved = sentences.some((sentence) =>
    /(?:浮遊物[（(]軽石等[）)]|軽石)/u.test(sentence)
      && /(?:確認されました|観測されました|認められました)/u.test(sentence)
  );
  add(floatingMaterialObserved, "The bulletin reports floating volcanic material, including pumice.");
  add(
    !floatingMaterialObserved && /(?:浮遊物[（(]軽石等[）)]|軽石)/u.test(hazardSentences),
    "Use caution around floating volcanic material, including pumice."
  );
  add(
    /融雪型火山泥流/u.test(source),
    "Stay alert for snowmelt-type volcanic mudflows."
  );
  add(
    /降雨時[^。]*土石流/u.test(source),
    "Rain may trigger debris flows in affected areas."
  );
  add(
    /空振/u.test(source),
    "Air shocks may break windows or cause other damage."
  );
  add(
    /火山活動の状況に変化があった場合には、随時お知らせします/u.test(source),
    "Updates will be issued as needed if volcanic activity changes."
  );

  return facts.join(" ");
}

function normalizeVolcanoSource(value) {
  return halfWidthDigits(value)
    .replace(/[．。]/gu, (character) => character === "．" ? "." : "。")
    .replace(/ｋｍ/giu, "km")
    .replace(/ｍ/gu, "m")
    .replace(/\s+/gu, " ")
    .trim();
}

function formatVolcanoMeasurement(amount, unit) {
  return `${String(amount).replace(/,/gu, ",")} ${String(unit).toLowerCase()}`;
}

function joinEnglishList(values) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function formatLocaleDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return new Intl.DateTimeFormat(preference === "en" ? "en-US" : "ja-JP", options).format(date);
}

function containsJapaneseText(value) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(String(value ?? ""));
}

function ordinal(value) {
  const number = Number(value);
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  if (number % 10 === 1) return `${number}st`;
  if (number % 10 === 2) return `${number}nd`;
  if (number % 10 === 3) return `${number}rd`;
  return `${number}th`;
}

function halfWidthDigits(value) {
  return String(value ?? "").replace(/[０-９]/gu, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0xfee0)
  );
}

function setLanguagePreference(value) {
  preference = normalizeLanguagePreference(value);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch {
    // Keep the selection for the current session when storage is unavailable.
  }
  applyLocale();
  notifyLanguageChange();
  return preference;
}

function applyLocale() {
  document.documentElement.lang = preference;
  document.documentElement.dataset.language = preference;
  translateSubtree(document.documentElement);
}

function translateCore(core) {
  const exact = VOLCANO_NAME_TRANSLATIONS.get(core)
    ?? TIDE_STATION_NAME_TRANSLATIONS.get(core)
    ?? EXACT_TRANSLATIONS.get(core)
    ?? STATIC_UI_TRANSLATIONS.get(core)
    ?? DYNAMIC_UI_TRANSLATIONS.get(core)
    ?? ADMIN_TRANSLATIONS.get(core);
  if (exact) return exact;

  // Translate JMA office names as a unit so the generic place-name pass cannot
  // leave mixed labels such as "Nara Region気象台".
  const localMeteorologicalOfficeMatch = core.match(/^(.+?)地方気象台$/u);
  if (localMeteorologicalOfficeMatch) {
    return `${translateMeteorologicalOfficeLocation(localMeteorologicalOfficeMatch[1])} Local Meteorological Office`;
  }
  const meteorologicalObservatoryMatch = core.match(/^(.+?)気象台$/u);
  if (meteorologicalObservatoryMatch) {
    return `${translateMeteorologicalOfficeLocation(meteorologicalObservatoryMatch[1])} Meteorological Observatory`;
  }

  const tideCriterionMatch = core.match(
    /^(レベル4危険警報基準|レベル5特別警報基準|過去最高潮位)(?:\s+(.+))?$/u
  );
  if (tideCriterionMatch) {
    const label = EXACT_TRANSLATIONS.get(tideCriterionMatch[1])
      ?? STATIC_UI_TRANSLATIONS.get(tideCriterionMatch[1])
      ?? DYNAMIC_UI_TRANSLATIONS.get(tideCriterionMatch[1]);
    return [label, tideCriterionMatch[2]].filter(Boolean).join(" ");
  }

  const volcanicAlertLevelMatch = core.match(/^噴火警戒レベル\s*([1-5])(?:\s*[（(](.+)[）)])?$/u);
  if (volcanicAlertLevelMatch) {
    const restriction = volcanicAlertLevelMatch[2]
      ? ` (${translateCore(volcanicAlertLevelMatch[2])})`
      : "";
    return `Volcanic Alert Level ${volcanicAlertLevelMatch[1]}${restriction}`;
  }

  const numberedBulletinMatch = core.match(/^(.+?)[（(]第([０-９\d]+)号[）)]$/u);
  if (numberedBulletinMatch) {
    return `${translateCore(numberedBulletinMatch[1])} (No. ${halfWidthDigits(numberedBulletinMatch[2])})`;
  }

  const weatherDescription = translateWeatherDescription(core);
  if (weatherDescription) return weatherDescription;

  const warningOutlookTimeMatch = core.match(/^(\d{2})時-(\d{2})時$/u);
  if (warningOutlookTimeMatch) {
    return `${warningOutlookTimeMatch[1]}:00–${warningOutlookTimeMatch[2]}:00`;
  }

  const tideThresholdMatch = core.match(/^(.+)の潮位と警報基準$/u);
  if (tideThresholdMatch) {
    return `${translateCore(tideThresholdMatch[1])} tide levels and warning thresholds`;
  }

  const tideAnomalyMatch = core.match(/^(.+)の潮位偏差グラフ$/u);
  if (tideAnomalyMatch) return `${translateCore(tideAnomalyMatch[1])} tide anomaly chart`;

  const tideGraphMatch = core.match(/^(.+)の潮位グラフ$/u);
  if (tideGraphMatch) return `${translateCore(tideGraphMatch[1])} tide-level chart`;

  const areaWarningsMatch = core.match(/^(.+)の警報・注意報$/u);
  if (areaWarningsMatch) {
    return `${translateCore(areaWarningsMatch[1])} warnings and advisories`;
  }

  const tideDeviationValueMatch = core.match(/^偏差\s+(.+)$/u);
  if (tideDeviationValueMatch) return `Anomaly ${tideDeviationValueMatch[1]}`;

  const tideAgencyTimeMatch = core.match(/^(.+?)\s*\/\s*(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})$/u);
  if (tideAgencyTimeMatch) {
    return `${translateCore(tideAgencyTimeMatch[1])} / ${tideAgencyTimeMatch[2]}`;
  }

  const nextTyphoonMatch = core.match(/^次の台風\s+(.+)\s+に切り替え$/u);
  if (nextTyphoonMatch) return `Show next typhoon: ${translateOfficialPlaceNames(nextTyphoonMatch[1])}`;

  const showItemMatch = core.match(/^(.+)\s+を表示$/u);
  if (showItemMatch) return `Show ${translateCore(showItemMatch[1])}`;

  const switchItemMatch = core.match(/^(.+)\s*へ切り替え$/u);
  if (switchItemMatch) return `Switch to ${translateCore(switchItemMatch[1])}`;

  const rankingOrderMatch = core.match(/^(.+)ランキング順序$/u);
  if (rankingOrderMatch) return `${translateCore(rankingOrderMatch[1])} ranking order`;

  const rankingPeriodMatch = core.match(/^(.+)ランキング集計期間$/u);
  if (rankingPeriodMatch) return `${translateCore(rankingPeriodMatch[1])} ranking period`;

  const rankingTitleMatch = core.match(/^(.+)ランキング$/u);
  if (rankingTitleMatch) return `${translateCore(rankingTitleMatch[1])} ranking`;

  const globalModelsMatch = core.match(/^各国予想・(\d+)モデル・発達候補(\d+)件$/u);
  if (globalModelsMatch) {
    return `Global forecasts · ${globalModelsMatch[1]} models · ${globalModelsMatch[2]} development candidates`;
  }

  const issueAreaMatch = core.match(/^発表区域\s+(.+)$/u);
  if (issueAreaMatch) return `Forecast areas: ${translateOfficialPlaceNames(issueAreaMatch[1])}`;

  const displayPeriodMatch = core.match(/^表示期間\s+(.+?)。タップで(.+?)に変更$/u);
  if (displayPeriodMatch) {
    return `Display period: ${translateCore(displayPeriodMatch[1])}. Tap to change to ${translateCore(displayPeriodMatch[2])}.`;
  }

  const recordedDaysMatch = core.match(/^収録(\d+)日間の日別総地震回数$/u);
  if (recordedDaysMatch) return `Daily earthquake count for ${recordedDaysMatch[1]} recorded days`;

  const lightningLevelMatch = core.match(/^活動度([1-4])$/u);
  if (lightningLevelMatch) return `Activity level ${lightningLevelMatch[1]}`;

  const progressCountMatch = core.match(/^(\d[\d,]*)\s*\/\s*(\d[\d,]*)件$/u);
  if (progressCountMatch) return `${progressCountMatch[1]} / ${progressCountMatch[2]}`;

  const countMatch = core.match(/^(\d[\d,]*)件(?:発表中)?$/u);
  if (countMatch) return `${countMatch[1]} ${Number(countMatch[1].replaceAll(",", "")) === 1 ? "item" : "items"}`;

  const stationCountMatch = core.match(/^表示地点:\s*(\d[\d,]*)地点$/u);
  if (stationCountMatch) return `Stations shown: ${stationCountMatch[1]}`;

  const labelTimeMatch = core.match(/^(更新|観測)\s+(.+)$/u);
  if (labelTimeMatch) return `${labelTimeMatch[1] === "更新" ? "Updated" : "Observed"} ${labelTimeMatch[2]}`;

  const occurredAtMatch = core.match(/^(\d{4}\/\d{2}\/\d{2})\s+(\d{1,2}:\d{2})頃発生$/u);
  if (occurredAtMatch) return `Approx. ${occurredAtMatch[1]} ${occurredAtMatch[2]}`;

  const latestTimeMatch = core.match(/^最新\s+(.+)$/u);
  if (latestTimeMatch) return `Latest ${latestTimeMatch[1]}`;

  const issuedTimeMatch = core.match(/^発表\s+(.+)$/u);
  if (issuedTimeMatch) return `Issued ${issuedTimeMatch[1]}`;

  const magnitudeDepthMatch = core.match(/^M\s*([0-9.]+)\s*\/\s*深さ\s*(.+)$/u);
  if (magnitudeDepthMatch) return `M${magnitudeDepthMatch[1]} / Depth: ${translateCore(magnitudeDepthMatch[2])}`;

  const reiwaEarthquakeMatch = core.match(/^令和(\d+)年(.+)地震$/u);
  if (reiwaEarthquakeMatch) {
    const year = 2018 + Number(reiwaEarthquakeMatch[1]);
    return `${year} ${translateOfficialPlaceNames(reiwaEarthquakeMatch[2])} Earthquake`;
  }

  const activityNoticeMatch = core.match(/^(\d{1,2}\/\d{1,2})の地震の後、地震活動が活発な状態が続いています。今後の地震活動に十分警戒してください。$/u);
  if (activityNoticeMatch) {
    return `Earthquake activity has remained elevated since the earthquake on ${activityNoticeMatch[1]}. Stay alert for further activity.`;
  }

  const typhoonNameMatch = core.match(/^台風第(\d+)号\s*[（(](.+?)[）)]$/u);
  if (typhoonNameMatch) return `Typhoon No. ${typhoonNameMatch[1]} (${romanizeKatakana(typhoonNameMatch[2])})`;

  const movementMatch = core.match(/^(北|北北東|北東|東北東|東|東南東|南東|南南東|南|南南西|南西|西南西|西|西北西|北西|北北西)\s+(.+)$/u);
  if (movementMatch) {
    const compass = {
      北: "N", 北北東: "NNE", 北東: "NE", 東北東: "ENE",
      東: "E", 東南東: "ESE", 南東: "SE", 南南東: "SSE",
      南: "S", 南南西: "SSW", 南西: "SW", 西南西: "WSW",
      西: "W", 西北西: "WNW", 北西: "NW", 北北西: "NNW"
    };
    return `${compass[movementMatch[1]]} ${movementMatch[2]}`;
  }

  const pointCountMatch = core.match(/^(\d[\d,]*)地点$/u);
  if (pointCountMatch) return `${pointCountMatch[1]} ${Number(pointCountMatch[1].replaceAll(",", "")) === 1 ? "station" : "stations"}`;

  const amedasMapStatusMatch = core.match(/^アメダス観測地点の(.+)を表示しています。\s*表示地点:\s*(\d[\d,]*)地点$/u);
  if (amedasMapStatusMatch) {
    return `Showing ${translateCore(amedasMapStatusMatch[1])} at AMeDAS stations. ${amedasMapStatusMatch[2]} stations shown.`;
  }

  const amedasTapMatch = core.match(/^地図上の観測点をタップすると、今日の(.+)を表示します。$/u);
  if (amedasTapMatch) return `Tap a station on the map to view today's ${translateCore(amedasTapMatch[1]).toLowerCase()}.`;

  const intensityMatch = core.match(/^震度\s*([0-7](?:弱|強|[-+])?)$/u);
  if (intensityMatch) return `Intensity ${normalizeIntensity(intensityMatch[1])}`;

  const levelMatch = core.match(/^レベル\s*(\d+)\s*(.*)$/u);
  if (levelMatch) {
    const label = levelMatch[2] ? ` ${translateCore(levelMatch[2])}` : "";
    return `Level ${levelMatch[1]}${label}`;
  }

  const depthWithinMatch = core.match(/^(\d+)\s*km以内$/iu);
  if (depthWithinMatch) return `Within ${depthWithinMatch[1]} km`;
  const magnitudeMatch = core.match(/^M(\d+(?:\.\d+)?)以上$/iu);
  if (magnitudeMatch) return `M${magnitudeMatch[1]}+`;

  const dateTimeMatch = core.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}:\d{2})(?:頃|ごろ)?)?$/u);
  if (dateTimeMatch) {
    const [, year, month, day, time] = dateTimeMatch;
    return `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}${time ? ` ${time}` : ""}`;
  }
  const shortDateMatch = core.match(/^(\d{1,2})月(\d{1,2})日(?:\((.)\))?$/u);
  if (shortDateMatch) return `${shortDateMatch[1]}/${shortDateMatch[2]}${shortDateMatch[3] ? ` (${translateWeekday(shortDateMatch[3])})` : ""}`;

  let translated = translateOfficialPlaceNames(core);
  for (const [japanese, english] of PREFECTURE_TRANSLATIONS) {
    translated = translated.replaceAll(japanese, english);
  }
  for (const [japanese, english] of PHRASE_TRANSLATIONS) {
    translated = translated.replaceAll(japanese, english);
  }
  return translated;
}

function translateWeatherDescription(value) {
  if (!/^(?:晴|曇|くもり|雨|雪|霧|みぞれ|大雨|大雪|暴風|雷|風雪|朝の内)/u.test(value)) return "";

  if (WEATHER_TERMS.has(value)) return WEATHER_TERMS.get(value);

  const contextualPatterns = [
    [/^朝の内(.+)後(.+)$/u, (first, second) => `${translateWeatherDescription(first)} in the morning, then ${lowerWeather(second)}`],
    [/^(.+)朝晩一時(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, briefly ${lowerWeather(change)} morning and evening`],
    [/^(.+)朝夕一時(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, briefly ${lowerWeather(change)} morning and evening`],
    [/^(.+)朝夕(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, ${lowerWeather(change)} morning and evening`],
    [/^(.+)朝の内一時(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, briefly ${lowerWeather(change)} in the morning`],
    [/^(.+)昼頃から(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, ${lowerWeather(change)} from around noon`],
    [/^(.+)夕方から(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, ${lowerWeather(change)} from evening`],
    [/^(.+)夕方一時(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, briefly ${lowerWeather(change)} in the evening`],
    [/^(.+)午後は(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, ${lowerWeather(change)} in the afternoon`],
    [/^(.+)夜は(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, ${lowerWeather(change)} at night`],
    [/^(.+)明け方(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, ${lowerWeather(change)} around dawn`],
    [/^(.+)山沿い(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, ${lowerWeather(change)} in mountain areas`],
    [/^(.+)海上海岸は(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, ${lowerWeather(change)} over the sea and along the coast`],
    [/^(.+)日中時々(.+)$/u, (base, change) => `${translateWeatherDescription(base)}, occasionally ${lowerWeather(change)} during the day`]
  ];
  for (const [pattern, formatter] of contextualPatterns) {
    const match = value.match(pattern);
    if (match) return formatter(match[1], match[2]);
  }

  const relationPatterns = [
    [/^(.+)後時々(.+)$/u, (first, second) => `${translateWeatherDescription(first)}, then occasionally ${lowerWeather(second)}`],
    [/^(.+)後一時(.+)$/u, (first, second) => `${translateWeatherDescription(first)}, then briefly ${lowerWeather(second)}`],
    [/^(.+)後(.+)$/u, (first, second) => `${translateWeatherDescription(first)}, then ${lowerWeather(second)}`],
    [/^(.+)時々(.+)$/u, (first, second) => `${translateWeatherDescription(first)}, occasionally ${lowerWeather(second)}`],
    [/^(.+)一時(.+)$/u, (first, second) => `${translateWeatherDescription(first)}, briefly ${lowerWeather(second)}`],
    [/^(.+)か(.+)$/u, (first, second) => `${translateWeatherDescription(first)} or ${lowerWeather(second)}`],
    [/^(.+)で(.+)を伴う$/u, (first, second) => `${translateWeatherDescription(first)} with ${lowerWeather(second)}`]
  ];
  for (const [pattern, formatter] of relationPatterns) {
    const match = value.match(pattern);
    if (match) return formatter(match[1], match[2]);
  }
  return "";
}

function lowerWeather(value) {
  const translated = translateWeatherDescription(value);
  if (!translated) return value;
  return translated.charAt(0).toLowerCase() + translated.slice(1);
}

async function loadOfficialPlaceNames() {
  if (placeNamesPromise || typeof fetch !== "function") return placeNamesPromise;
  placeNamesPromise = Promise.allSettled([
    fetch(PLACE_NAME_DATA_URL, { cache: "force-cache" }).then((response) => {
      if (!response.ok) throw new Error(`Place-name data request failed: ${response.status}`);
      return response.json();
    }),
    fetch(AMEDAS_STATION_DATA_URL, { cache: "force-cache" }).then((response) => {
      if (!response.ok) throw new Error(`AMeDAS station request failed: ${response.status}`);
      return response.json();
    })
  ]).then(([gazetteerResult, amedasResult]) => {
    const merged = new Map();
    if (gazetteerResult.status === "fulfilled") {
      Object.entries(gazetteerResult.value?.names ?? {}).forEach(([japanese, romaji]) => {
        if (!japanese || !romaji) return;
        merged.set(japanese, romaji);
        const stem = japanese.replace(/(?:都|道|府|県|市|区|町|村|島|山)$/u, "");
        if (stem.length >= 2 && stem !== japanese && !merged.has(stem)) {
          merged.set(stem, String(romaji).replace(/\s+(?:To|Do|Fu|Ken|Shi|Ku|Cho|Machi|Mura|Son|Jima|Shima|To|San|Yama)$/u, ""));
        }
      });
    }
    if (amedasResult.status === "fulfilled") {
      Object.values(amedasResult.value ?? {}).forEach((station) => {
        const japanese = String(station?.kjName ?? "").trim();
        const english = String(station?.enName ?? "").trim();
        if (japanese && english) merged.set(japanese, english);
      });
    }
    merged.set("さいたま", "Saitama");
    placeNames = merged;
    rebuildTranslationStates();
    return placeNames;
  }).catch(() => placeNames);
  return placeNamesPromise;
}

function rebuildTranslationStates() {
  const selectedLanguage = preference;
  if (selectedLanguage === "en") {
    preference = "ja";
    translateSubtree(document.documentElement);
    preference = selectedLanguage;
  }
  textStates = new WeakMap();
  attributeStates = new WeakMap();
  applyLocale();
}

const DESIGNATED_CITY_TRANSLATIONS = new Map(Object.entries({
  "札幌": "Sapporo",
  "仙台": "Sendai",
  "さいたま": "Saitama",
  "千葉": "Chiba",
  "東京": "Tokyo",
  "横浜": "Yokohama",
  "川崎": "Kawasaki",
  "相模原": "Sagamihara",
  "新潟": "Niigata",
  "静岡": "Shizuoka",
  "浜松": "Hamamatsu",
  "名古屋": "Nagoya",
  "京都": "Kyoto",
  "大阪": "Osaka",
  "堺": "Sakai",
  "神戸": "Kobe",
  "岡山": "Okayama",
  "広島": "Hiroshima",
  "北九州": "Kitakyushu",
  "福岡": "Fukuoka",
  "熊本": "Kumamoto"
}));
const DESIGNATED_CITY_TRANSLATION_ENTRIES = [...DESIGNATED_CITY_TRANSLATIONS.entries()]
  .sort(([left], [right]) => right.length - left.length);

const DESIGNATED_WARD_TRANSLATIONS = new Map(Object.entries({
  "中央": "Chuo", "北": "Kita", "東": "Higashi", "南": "Minami", "西": "Nishi", "緑": "Midori",
  "白石": "Shiroishi", "豊平": "Toyohira", "厚別": "Atsubetsu", "手稲": "Teine", "清田": "Kiyota",
  "青葉": "Aoba", "宮城野": "Miyagino", "若林": "Wakabayashi", "太白": "Taihaku", "泉": "Izumi",
  "大宮": "Omiya", "見沼": "Minuma", "桜": "Sakura", "浦和": "Urawa", "岩槻": "Iwatsuki",
  "花見川": "Hanamigawa", "稲毛": "Inage", "若葉": "Wakaba", "美浜": "Mihama",
  "千代田": "Chiyoda", "港": "Minato", "新宿": "Shinjuku", "文京": "Bunkyo", "台東": "Taito",
  "墨田": "Sumida", "江東": "Koto", "品川": "Shinagawa", "目黒": "Meguro", "大田": "Ota",
  "世田谷": "Setagaya", "渋谷": "Shibuya", "中野": "Nakano", "杉並": "Suginami", "豊島": "Toshima",
  "荒川": "Arakawa", "板橋": "Itabashi", "練馬": "Nerima", "足立": "Adachi", "葛飾": "Katsushika",
  "江戸川": "Edogawa", "鶴見": "Tsurumi", "神奈川": "Kanagawa", "保土ケ谷": "Hodogaya",
  "磯子": "Isogo", "金沢": "Kanazawa", "港北": "Kohoku", "戸塚": "Totsuka", "港南": "Konan",
  "旭": "Asahi", "瀬谷": "Seya", "栄": "Sakae", "都筑": "Tsuzuki", "川崎": "Kawasaki",
  "幸": "Saiwai", "中原": "Nakahara", "高津": "Takatsu", "多摩": "Tama", "宮前": "Miyamae",
  "麻生": "Asao", "江南": "Konan", "秋葉": "Akiha", "西蒲": "Nishikan", "葵": "Aoi",
  "駿河": "Suruga", "清水": "Shimizu", "浜名": "Hamana", "天竜": "Tenryu", "千種": "Chikusa",
  "昭和": "Showa", "瑞穂": "Mizuho", "熱田": "Atsuta", "中川": "Nakagawa", "守山": "Moriyama",
  "名東": "Meito", "天白": "Tempaku", "上京": "Kamigyo", "左京": "Sakyo", "中京": "Nakagyo",
  "東山": "Higashiyama", "下京": "Shimogyo", "伏見": "Fushimi", "山科": "Yamashina", "西京": "Nishikyo",
  "都島": "Miyakojima", "福島": "Fukushima", "此花": "Konohana", "大正": "Taisho",
  "天王寺": "Tennoji", "浪速": "Naniwa", "西淀川": "Nishiyodogawa", "東淀川": "Higashiyodogawa",
  "東成": "Higashinari", "生野": "Ikuno", "城東": "Joto", "阿倍野": "Abeno", "住吉": "Sumiyoshi",
  "東住吉": "Higashisumiyoshi", "西成": "Nishinari", "淀川": "Yodogawa", "住之江": "Suminoe",
  "平野": "Hirano", "堺": "Sakai", "美原": "Mihara", "東灘": "Higashinada", "灘": "Nada",
  "兵庫": "Hyogo", "長田": "Nagata", "須磨": "Suma", "垂水": "Tarumi", "安佐南": "Asaminami",
  "安佐北": "Asakita", "安芸": "Aki", "佐伯": "Saeki", "門司": "Moji", "若松": "Wakamatsu",
  "戸畑": "Tobata", "小倉北": "Kokurakita", "小倉南": "Kokuraminami", "八幡東": "Yahatahigashi",
  "八幡西": "Yahatanishi", "博多": "Hakata", "城南": "Jonan", "早良": "Sawara"
}));

const OBSERVATION_LOCALITY_TRANSLATIONS = new Map(Object.entries({
  "田浦": "Tanoura",
  "平山新町": "Hirayama-shinmachi"
}));

const OBSERVATION_STATION_TRANSLATIONS = new Map(Object.entries({
  "芦北町芦北": "Ashikita",
  "芦北町田浦町": "Ashikita",
  "八代市平山新町": "Yatsushiro City Hirayama-shinmachi",
  "鹿児島空港": "Kagoshima Airport",
  "薩摩川内市": "Satsumasendai City",
  "鹿児島県薩摩地方": "Satsuma Region, Kagoshima Prefecture"
}));

function findDesignatedCityWardPrefix(value) {
  const cityEntry = DESIGNATED_CITY_TRANSLATION_ENTRIES
    .find(([japanese]) => value.startsWith(japanese));
  if (cityEntry) {
    const remainder = value.slice(cityEntry[0].length);
    const wardMatch = remainder.match(/^(.+?)区/u);
    const ward = wardMatch ? DESIGNATED_WARD_TRANSLATIONS.get(wardMatch[1]) : "";
    if (ward) {
      return {
        japanese: `${cityEntry[0]}${wardMatch[1]}区`,
        romaji: `${cityEntry[1]} ${ward}-ku`
      };
    }
  }

  for (const [japaneseCity, englishCity] of DESIGNATED_CITY_TRANSLATION_ENTRIES) {
    const cityStem = japaneseCity.replace(/市$/u, "");
    if (!value.startsWith(cityStem)) continue;
    const wardMatch = value.slice(cityStem.length).match(/^(.+?)区/u);
    const ward = wardMatch ? DESIGNATED_WARD_TRANSLATIONS.get(wardMatch[1]) : "";
    if (!ward) continue;
    return {
      japanese: `${cityStem}${wardMatch[1]}区`,
      romaji: `${englishCity} ${ward}-ku`
    };
  }
  return null;
}

function translateOfficialPlaceNames(value) {
  if (!/[\u3400-\u9fff]/u.test(value)) return value;

  const observationStation = OBSERVATION_STATION_TRANSLATIONS.get(
    String(value || "").replace(/[＊*]/gu, "")
  );
  if (observationStation) return observationStation;

  const designatedCityWard = findDesignatedCityWardPrefix(value);
  if (designatedCityWard && value.length === designatedCityWard.japanese.length) {
    return designatedCityWard.romaji;
  }
  if (designatedCityWard && value.length > designatedCityWard.japanese.length) {
    const locality = translateObservationLocality(value.slice(designatedCityWard.japanese.length));
    return joinMunicipalityAndLocality(designatedCityWard.romaji, locality);
  }

  const exactAdministrativeArea = PREFECTURE_TRANSLATIONS.get(value);
  if (exactAdministrativeArea) {
    if (value.endsWith("都") || value.endsWith("道")) return exactAdministrativeArea;
    return `${exactAdministrativeArea} Prefecture`;
  }
  if (!placeNames.size) return value;
  const exact = placeNames.get(value);
  if (exact) return formatOfficialPlaceName(value, exact);

  const prefecturePrefix = [...PREFECTURE_TRANSLATIONS.entries()]
    .find(([japanese]) => value.startsWith(japanese));
  if (prefecturePrefix && value.length > prefecturePrefix[0].length) {
    const remainder = value.slice(prefecturePrefix[0].length);
    if (remainder === "沖") return `off ${prefecturePrefix[1]}`;
    return joinPrefectureAndPlace(prefecturePrefix[1], translatePlaceExpression(remainder));
  }

  const municipality = findMunicipalityPrefix(value);
  if (municipality && value.length > municipality.japanese.length) {
    const municipalityName = formatMunicipalityName(municipality.romaji);
    const locality = translateObservationLocality(value.slice(municipality.japanese.length));
    return joinMunicipalityAndLocality(municipalityName, locality);
  }

  if (!/(?:地方|近海|付近|沖|県|府|都|道|市|区|町|村|島|山|湾|海峡)$/u.test(value)
      && !/(?:都|道|府|県|市|区|町|村).+$/u.test(value)) {
    return value;
  }
  const characters = [...value];
  let output = "";
  let cursor = 0;

  while (cursor < characters.length) {
    let replacement = "";
    let consumed = 0;
    for (let end = characters.length; end > cursor; end -= 1) {
      const candidate = characters.slice(cursor, end).join("");
      const romaji = placeNames.get(candidate);
      if (!romaji) continue;
      replacement = formatOfficialPlaceName(candidate, romaji);
      consumed = end - cursor;
      break;
    }
    if (consumed) {
      output += replacement;
      cursor += consumed;
    } else {
      output += characters[cursor];
      cursor += 1;
    }
  }
  return output;
}

function translateMeteorologicalOfficeLocation(value) {
  const translated = translateOfficialPlaceNames(value);
  if (!/[\u3400-\u9fff]/u.test(translated)) return translated;

  for (const suffix of ["県", "府", "都", "道"]) {
    const prefectureName = PREFECTURE_TRANSLATIONS.get(`${value}${suffix}`);
    if (prefectureName) return prefectureName;
  }
  return translated;
}

function translatePlaceExpression(value) {
  const suffixes = [
    ["地方", "Region"],
    ["近海", "offshore"],
    ["付近", "area"],
    ["海峡", "Strait"],
    ["湾", "Bay"],
    ["沖", "offshore"]
  ];
  const suffix = suffixes.find(([japanese]) => value.endsWith(japanese));
  const stem = suffix ? value.slice(0, -suffix[0].length) : value;
  const parts = stem.split(/[・･]/u).filter(Boolean).map((part) => {
    const exact = placeNames.get(part);
    if (exact) return formatOfficialPlaceName(part, exact);
    const translated = translateOfficialPlaceNames(part);
    if (!/[\u3400-\u9fff]/u.test(translated)) return translated;
    const municipality = findMunicipalityPrefix(part);
    if (municipality) {
      return `${formatMunicipalityName(municipality.romaji)} station`;
    }
    return translated;
  });
  const joined = parts.join(" and ");
  return [joined, suffix?.[1]].filter(Boolean).join(" ");
}

function findMunicipalityPrefix(value) {
  let match = null;
  for (const [japanese, romaji] of placeNames) {
    if (!/(?:市|区|町|村)$/u.test(japanese) || !value.startsWith(japanese)) continue;
    if (!match || japanese.length > match.japanese.length) match = { japanese, romaji };
  }
  return match;
}

function translateObservationLocality(value) {
  const cleaned = String(value || "")
    .replace(/[＊*]/gu, "")
    .replace(/(?:町|村)$/u, "")
    .trim();
  if (!cleaned) return "";

  const observationLocality = OBSERVATION_LOCALITY_TRANSLATIONS.get(cleaned);
  if (observationLocality) return observationLocality;
  const designatedWard = DESIGNATED_WARD_TRANSLATIONS.get(cleaned);
  if (designatedWard) return designatedWard;
  const exact = placeNames.get(cleaned);
  if (exact) return formatOfficialPlaceName(cleaned, exact);

  const characters = [...cleaned];
  const translated = [];
  let cursor = 0;
  while (cursor < characters.length) {
    let replacement = "";
    let consumed = 0;
    for (let end = characters.length; end > cursor; end -= 1) {
      const candidate = characters.slice(cursor, end).join("");
      const romaji = placeNames.get(candidate);
      if (!romaji) continue;
      replacement = formatOfficialPlaceName(candidate, romaji);
      consumed = end - cursor;
      break;
    }
    if (!consumed) return "";
    translated.push(replacement);
    cursor += consumed;
  }
  return translated.join(" ");
}

function joinMunicipalityAndLocality(municipality, locality) {
  const normalizedMunicipality = String(municipality || "").trim();
  const normalizedLocality = String(locality || "").trim();
  if (!normalizedLocality) return `${normalizedMunicipality} station`;

  const municipalityStem = normalizedMunicipality
    .replace(/\s+City$/u, "")
    .replace(/-ku$/u, "")
    .trim()
    .toLocaleLowerCase("en");
  if (normalizedLocality.toLocaleLowerCase("en") === municipalityStem
      || normalizedLocality.toLocaleLowerCase("en") === normalizedMunicipality.toLocaleLowerCase("en")) {
    return normalizedMunicipality;
  }
  return `${normalizedMunicipality} ${normalizedLocality}`;
}

function formatMunicipalityName(value) {
  return normalizeOfficialRomaji(value)
    .replace(/\s+Shi$/u, " City")
    .replace(/\s+Ku$/u, "-ku")
    .replace(/\s+(?:Cho|Machi|Mura|Son)$/u, "");
}

function formatOfficialPlaceName(japanese, romaji) {
  if (/(?:市|区|町|村)$/u.test(japanese)) return formatMunicipalityName(romaji);
  if (/(?:県|府|都|道)$/u.test(japanese)) return formatAdministrativeAreaName(japanese, romaji);
  return normalizeOfficialRomaji(romaji);
}

function formatAdministrativeAreaName(japanese, value) {
  const normalized = normalizeOfficialRomaji(value);
  if (japanese.endsWith("県")) return normalized.replace(/\s+Ken$/u, " Prefecture");
  if (japanese.endsWith("府")) return normalized.replace(/\s+Fu$/u, " Prefecture");
  if (japanese.endsWith("都")) return normalized.replace(/\s+To$/u, "");
  return normalized.replace(/\s+Do$/u, "");
}

function joinPrefectureAndPlace(prefecture, place) {
  const normalizedPlace = String(place || "").trim();
  if (!normalizedPlace) return prefecture;
  if (normalizedPlace === prefecture || normalizedPlace.startsWith(`${prefecture} `)) {
    return normalizedPlace;
  }
  return `${prefecture}, ${normalizedPlace}`;
}

function normalizeOfficialRomaji(value) {
  return String(value)
    .replace(/\s+(Shi|Ku|Cho|Machi|Mura|Son)$/u, " $1")
    .trim();
}

function romanizeKatakana(value) {
  const digraphs = {
    キャ: "kya", キュ: "kyu", キョ: "kyo", シャ: "sha", シュ: "shu", ショ: "sho",
    チャ: "cha", チュ: "chu", チョ: "cho", ニャ: "nya", ニュ: "nyu", ニョ: "nyo",
    ヒャ: "hya", ヒュ: "hyu", ヒョ: "hyo", ミャ: "mya", ミュ: "myu", ミョ: "myo",
    リャ: "rya", リュ: "ryu", リョ: "ryo", ギャ: "gya", ギュ: "gyu", ギョ: "gyo",
    ジャ: "ja", ジュ: "ju", ジョ: "jo", ビャ: "bya", ビュ: "byu", ビョ: "byo",
    ピャ: "pya", ピュ: "pyu", ピョ: "pyo", ティ: "ti", ディ: "di", ファ: "fa",
    フィ: "fi", フェ: "fe", フォ: "fo", ウィ: "wi", ウェ: "we", ウォ: "wo"
  };
  const singles = {
    ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o", カ: "ka", キ: "ki", ク: "ku", ケ: "ke", コ: "ko",
    サ: "sa", シ: "shi", ス: "su", セ: "se", ソ: "so", タ: "ta", チ: "chi", ツ: "tsu", テ: "te", ト: "to",
    ナ: "na", ニ: "ni", ヌ: "nu", ネ: "ne", ノ: "no", ハ: "ha", ヒ: "hi", フ: "fu", ヘ: "he", ホ: "ho",
    マ: "ma", ミ: "mi", ム: "mu", メ: "me", モ: "mo", ヤ: "ya", ユ: "yu", ヨ: "yo",
    ラ: "ra", リ: "ri", ル: "ru", レ: "re", ロ: "ro", ワ: "wa", ヲ: "o", ン: "n",
    ガ: "ga", ギ: "gi", グ: "gu", ゲ: "ge", ゴ: "go", ザ: "za", ジ: "ji", ズ: "zu", ゼ: "ze", ゾ: "zo",
    ダ: "da", ヂ: "ji", ヅ: "zu", デ: "de", ド: "do", バ: "ba", ビ: "bi", ブ: "bu", ベ: "be", ボ: "bo",
    パ: "pa", ピ: "pi", プ: "pu", ペ: "pe", ポ: "po", ヴ: "vu"
  };
  const chars = [...String(value)];
  let output = "";
  let geminate = false;
  for (let index = 0; index < chars.length; index += 1) {
    const pair = `${chars[index]}${chars[index + 1] ?? ""}`;
    if (chars[index] === "ッ") {
      geminate = true;
      continue;
    }
    if (chars[index] === "ー") {
      const vowel = output.match(/[aeiou](?!.*[aeiou])/u)?.[0];
      if (vowel) output += vowel;
      continue;
    }
    const syllable = digraphs[pair] ?? singles[chars[index]] ?? chars[index];
    if (digraphs[pair]) index += 1;
    output += geminate ? `${syllable[0]}${syllable}` : syllable;
    geminate = false;
  }
  return output ? `${output[0].toUpperCase()}${output.slice(1)}` : String(value);
}

function normalizeIntensity(value) {
  return String(value).replace("弱", "−").replace("強", "+");
}

function translateWeekday(value) {
  return ({ 日: "Sun", 月: "Mon", 火: "Tue", 水: "Wed", 木: "Thu", 金: "Fri", 土: "Sat" })[value] ?? value;
}

function handleMutations(mutations) {
  observer?.disconnect();
  try {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        translateTextNode(mutation.target);
      } else if (mutation.type === "attributes") {
        translateAttribute(mutation.target, mutation.attributeName);
      } else {
        mutation.addedNodes.forEach(translateSubtree);
      }
    }
  } finally {
    observer?.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES
    });
  }
}

function translateSubtree(root) {
  if (!root) return;
  observer?.disconnect();
  try {
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (!(root instanceof Element)) return;
    translateElementAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else translateElementAttributes(node);
      node = walker.nextNode();
    }
  } finally {
    if (initialized) {
      observer?.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: TRANSLATABLE_ATTRIBUTES
      });
    }
  }
}

function translateTextNode(node) {
  const parent = node.parentElement;
  if (!parent || shouldSkip(parent)) return;
  const current = node.nodeValue ?? "";
  let state = textStates.get(node);
  if (!state || (current !== state.source && current !== state.translated)) {
    state = { source: current, translated: localizeText(current, "en") };
    textStates.set(node, state);
  }
  const next = preference === "en" ? state.translated : state.source;
  if (current !== next) node.nodeValue = next;
}

function translateElementAttributes(element) {
  if (shouldSkip(element)) return;
  for (const attribute of TRANSLATABLE_ATTRIBUTES) translateAttribute(element, attribute);
}

function translateAttribute(element, attribute) {
  if (!(element instanceof Element) || shouldSkip(element) || !element.hasAttribute(attribute)) return;
  const current = element.getAttribute(attribute) ?? "";
  let states = attributeStates.get(element);
  if (!states) {
    states = new Map();
    attributeStates.set(element, states);
  }
  let state = states.get(attribute);
  if (!state || (current !== state.source && current !== state.translated)) {
    state = { source: current, translated: localizeText(current, "en") };
    states.set(attribute, state);
  }
  const next = preference === "en" ? state.translated : state.source;
  if (current !== next) element.setAttribute(attribute, next);
}

function shouldSkip(element) {
  return SKIPPED_ELEMENTS.has(element.tagName)
    || element.isContentEditable
    || Boolean(element.closest("[data-i18n-ignore]"));
}

function notifyLanguageChange() {
  const state = { preference, language: preference };
  listeners.forEach((listener) => listener(state));
  window.dispatchEvent(new CustomEvent("meteoscope-language-change", { detail: state }));
}

function readLanguagePreference() {
  if (typeof window === "undefined") return "ja";
  try {
    return normalizeLanguagePreference(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return "ja";
  }
}

function normalizeLanguagePreference(value) {
  return LANGUAGE_VALUES.has(value) ? value : "ja";
}
