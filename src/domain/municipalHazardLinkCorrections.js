// Manually checked against the municipality's own pages on 2026-11-16.
// Match the exact municipality/category/old URL; never rewrite an entire host.
const fukuokaSource = "https://webmap.city.fukuoka.lg.jp/bousai/f_portal.html";
export const MUNICIPAL_HAZARD_LINK_CORRECTIONS = Object.freeze([
  {
    code: "26100", categories: ["flood"], kind: "page",
    from: "https://www.bousai.city.kyoto.lg.jp/category/1-1-0-0-0-0-0-0-0-0.html",
    to: "https://www.bousai.city.kyoto.lg.jp/0000000143.html",
    source: "https://www.bousai.city.kyoto.lg.jp/0000000812.html"
  },
  {
    code: "26100", categories: ["landslide"], kind: "page",
    from: "https://www.bousai.city.kyoto.lg.jp/category/1-2-0-0-0-0-0-0-0-0.html",
    to: "https://www.bousai.city.kyoto.lg.jp/0000000812.html",
    source: "https://www.bousai.city.kyoto.lg.jp/0000000812.html"
  },
  {
    code: "27100", categories: ["intensity", "liquefaction"], kind: "page",
    from: "https://www.mapnavi.city.osaka.lg.jp/osakacity/Portal",
    to: "https://www.city.osaka.lg.jp/kikikanrishitsu/page/0000011946.html",
    source: "https://www.city.osaka.lg.jp/kikikanrishitsu/page/0000011946.html"
  },
  {
    code: "28100", categories: ["reservoir"], kind: "page",
    from: "https://www.hazardmap.pref.hyogo.jp/hyogo/hazmapap/top/select.asp?dtp=13",
    to: "https://www.city.kobe.lg.jp/a99375/shise/kekaku/kezaikankokyoku/tameike/tameikebousai.html",
    source: "https://www.city.kobe.lg.jp/a99375/shise/kekaku/kezaikankokyoku/tameike/tameikebousai.html"
  },
  ...[
    ["flood", "shimin/b_suishin/bousai/kouzuihaza-domap.html", "11"],
    ["inland", "shimin/b_suishin/bousai/naisuihazardmap.html", "17&mpx=130.42047956031584&mpy=33.58954341159671&gprj=3"],
    ["landslide", "shimin/b_suishin/bousai/doshasaigaihazardmap.html", "12"],
    ["surge", "shimin/b_suishin/bousai/takashiohazardmap.html", "14"],
    ["intensity", "jutaku-toshi/bid_safe/life/map_2.html", "16"],
    ["tsunami", "shimin/b_suishin/bousai/tsunamihazardmap.html", "13"],
    ["reservoir", "nosui/n-shisetsu/life/tameikeshinsuisouteikuikizu_2.html", "18"]
  ].map(([category, path, map]) => ({
    code: "40130", categories: [category], kind: "webmap",
    from: `https://www.city.fukuoka.lg.jp/${path}`,
    to: `https://webmap.city.fukuoka.lg.jp/fukuoka/Map?mid=${map}`,
    source: fukuokaSource
  })),
  {
    code: "47201", categories: ["flood", "surge"], kind: "page",
    from: "https://www.sonicweb-asp.jp/naha/",
    to: "https://www.city.naha.okinawa.jp/safety/saigai/1001597/1001608.html",
    source: "https://www.city.naha.okinawa.jp/safety/saigai/1001597/1001608.html"
  },
  {
    code: "47201", categories: ["landslide", "tsunami"], kind: "webmap",
    from: "https://www.sonicweb-asp.jp/naha/",
    to: "https://www.sonicweb-asp.jp/naha/map?theme=th_19#pos=127.67911109953917%2C26.212374210869136&scale=30000",
    source: "https://www.city.naha.okinawa.jp/safety/saigai/1001597/1001612.html"
  },
  {
    code: "47201", categories: ["inland"], kind: "page",
    from: "https://www.city.naha.okinawa.jp/water/pax/gesui_kouhou.html",
    to: "https://www.city.naha.okinawa.jp/safety/saigai/1001597/1001608.html",
    source: "https://www.city.naha.okinawa.jp/safety/saigai/1001597/1001608.html"
  }
].map(correction => Object.freeze({ ...correction, checkedAt: "2026-11-16" })));
