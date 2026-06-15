import { TABS } from "./config.js";
import { createWeatherMap } from "./map/weatherMap.js";
import { setupTabs } from "./ui/tabs.js";
import { updateLeftPanel } from "./ui/leftPanel.js";
import { startClock } from "./ui/time.js";
import { fetchRadarTimes } from "./jma/radar.js";
import { fetchAmedasLatestTime } from "./jma/amedas.js";
import { fetchWarningMap } from "./jma/warnings.js";
import { fetchTyphoonList } from "./jma/typhoon.js";

const loaders = {
  radar: fetchRadarTimes,
  amedas: fetchAmedasLatestTime,
  warnings: fetchWarningMap,
  typhoon: fetchTyphoonList
};

export function createWeatherApp() {
  let activeTab = "radar";
  let weatherMap = null;

  async function selectTab(tabId) {
    const tab = TABS.find((item) => item.id === tabId) ?? TABS[0];
    activeTab = tab.id;
    updateLeftPanel(tab, { status: "loading" });
    weatherMap?.setMode(tab.id);

    try {
      const data = await loaders[tab.id]?.();
      updateLeftPanel(tab, { status: "ok", data });
      weatherMap?.renderData(tab.id, data);
    } catch (error) {
      console.warn(`[Weather Viewer] ${tab.id} load failed`, error);
      updateLeftPanel(tab, { status: "error", error });
    }
  }

  function start() {
    weatherMap = createWeatherMap("map");
    weatherMap.initialize();
    setupTabs({ onChange: selectTab });
    startClock("clock");
    selectTab(activeTab);
  }

  return { start, selectTab };
}
