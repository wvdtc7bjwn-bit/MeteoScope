export const APP_NAME = "Weather Viewer";

export const DEFAULT_VIEW = {
  center: [37.6, 137.8],
  zoom: 5,
  minZoom: 4,
  maxZoom: 10
};

export const JMA_ENDPOINTS = {
  // NOTE: These are intentionally centralized so Codex can replace or extend them
  // after confirming current JMA data URLs and CORS behavior.
  radarTimeList: "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json",
  amedasTimeList: "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt",
  warnings: "https://www.jma.go.jp/bosai/warning/data/warning/map.json",
  typhoon: "https://www.jma.go.jp/bosai/typhoon/data/typhoon.json"
};

export const TABS = [
  {
    id: "radar",
    label: "雨雲レーダー",
    title: "最新の雨雲レーダー",
    primary: "Radar",
    description: "降水ナウキャスト・雨雲レーダーを地図上に重ねます。まずは最新時刻の取得とレイヤー切替を実装します。"
  },
  {
    id: "amedas",
    label: "アメダス",
    title: "アメダス観測値",
    primary: "AMeDAS",
    description: "気温・降水量・風向風速などを地点マーカーで表示します。初期実装では気温表示から始めます。"
  },
  {
    id: "warnings",
    label: "警報・注意報",
    title: "市区町村別 警報・注意報",
    primary: "Warnings",
    description: "注意報・警報・特別警報を市区町村ポリゴンに色分け表示します。"
  },
  {
    id: "typhoon",
    label: "台風情報",
    title: "台風情報",
    primary: "Typhoon",
    description: "台風の現在位置、進路、予報円、暴風警戒域を表示します。"
  }
];
