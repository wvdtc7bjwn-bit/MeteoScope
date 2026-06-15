import { createWeatherApp } from "./app.js";
import { applyEqStylePatch } from "./ui/eqStylePatch.js";

applyEqStylePatch();

const app = createWeatherApp();
app.start();
