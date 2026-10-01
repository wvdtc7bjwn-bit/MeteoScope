import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { calculateThermodynamics, calculateProfile, parseProfileCsv, simulateTransport, validateTransport, SAMPLE_PROFILE, CONSTANTS,
  calculateThickness, calculateGeostrophicWind, calculateThermalWind, calculateCoriolis, calculateRadiation, simulateOscillator,
  calculateCloudBase, calculateMoistThermodynamics, calculateWaterColumn, calculateRichardson, integrateLiquidAdiabat, runCalculation } from "../src/science/numericalCalculations.js";
import { buildNumericalPython } from "../src/science/numericalPython.js";
import { explainNumericalCalculation } from "../src/science/numericalExplanation.js";

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const thermal = calculateThermodynamics({ temperature: 20, pressure: 1000, humidity: 50 });
near(thermal.summary.potentialTemperature, 293.15);
near(thermal.summary.dewPoint, 9.261106630534236, 1e-9);
assert.ok(thermal.summary.mixingRatio > 7 && thermal.summary.mixingRatio < 8);
assert.ok(thermal.summary.density > 1.18 && thermal.summary.density < 1.2);
assert.ok(thermal.summary.virtualTemperature > 293.15);
near(calculateThermodynamics({ temperature: -20, pressure: 800, humidity: 100 }).summary.dewPoint, -20);
near(thermal.rows[0].temperature, 20);
assert.ok(thermal.rows.at(-1).temperature < thermal.rows[0].temperature);
for (const input of [{ temperature: "", pressure: 1000, humidity: 50 }, { temperature: 20, pressure: 0, humidity: 50 }, { temperature: 20, pressure: 1000, humidity: 0 }, { temperature: Infinity, pressure: 1000, humidity: 50 }]) {
  assert.throws(() => calculateThermodynamics(input));
}
const profile = calculateProfile({ csv: SAMPLE_PROFILE });
const cloudBase = calculateCloudBase({temperature:25,pressure:1000,humidity:70});
assert.ok(cloudBase.summary.lclHeight > 650 && cloudBase.summary.lclHeight < 900);
assert.ok(cloudBase.summary.lclPressure < 1000);
near(cloudBase.rows.at(-1).height,cloudBase.summary.lclHeight,1e-9);
const saturatedCloud = calculateCloudBase({temperature:25,pressure:1000,humidity:100});
near(saturatedCloud.summary.lclHeight,0); near(saturatedCloud.summary.lclPressure,1000);
const moist = calculateMoistThermodynamics({temperature:25,pressure:1000,humidity:70,topPressure:300});
assert.ok(moist.summary.wetBulbTemperature > moist.summary.dewPoint && moist.summary.wetBulbTemperature < 25);
assert.ok(moist.summary.equivalentPotentialTemperature > thermal.summary.potentialTemperature);
near(moist.rows.at(-1).pressure,300);
const saturatedMoist = calculateMoistThermodynamics({temperature:25,pressure:1000,humidity:100,topPressure:300});
near(saturatedMoist.summary.wetBulbTemperature,25);
const es = t => 6.1094*Math.exp(17.625*t/(243.04+t));
// Independently published MetPy examples; our liquid Magnus / constant Lv
// approximations differ from MetPy, so do not assert artificial exact parity.
const thetaEReference = calculateMoistThermodynamics({temperature:20,pressure:850,humidity:100*es(18)/es(20),topPressure:500});
near(thetaEReference.summary.equivalentPotentialTemperature,353.898874,.25);
const wetReference = calculateMoistThermodynamics({temperature:32,pressure:993,humidity:100*es(15)/es(32),topPressure:500});
near(wetReference.summary.wetBulbTemperature,20.3937601,.25);
const moistCoarse=integrateLiquidAdiabat(20,900,500,1),moistFine=integrateLiquidAdiabat(20,900,500,.5);
near(moistCoarse.at(-1).temperature,moistFine.at(-1).temperature,1e-6);
near(integrateLiquidAdiabat(moistCoarse.at(-1).temperature,500,900).at(-1).temperature,20,1e-6);
assert.throws(()=>integrateLiquidAdiabat(20,900,500,0));
assert.throws(()=>integrateLiquidAdiabat(100,900,900));
assert.throws(()=>calculateMoistThermodynamics({temperature:25,pressure:1000,humidity:70,topPressure:950}));
for(const bad of [{temperature:"",pressure:1000,humidity:70},{temperature:20,pressure:500,humidity:70},{temperature:20,pressure:1000,humidity:0}]) assert.throws(()=>calculateCloudBase(bad));
const waterColumn = calculateWaterColumn({csv:SAMPLE_PROFILE});
assert.ok(waterColumn.summary.precipitableWater > 20 && waterColumn.summary.precipitableWater < 50);
near(waterColumn.layers.at(-1).cumulative,waterColumn.summary.precipitableWater);
const q=.01, ratio=q/(1-q);
const constantQ=[1000,800,600].map((pressure,i)=>[pressure,i*2000,20,100*(ratio*pressure/(.622+ratio))/es(20),i*5,0].join(',')).join('\n');
near(calculateWaterColumn({csv:constantQ}).summary.precipitableWater,q*40000/9.80665,1e-10);
const partialWater = calculateWaterColumn({csv:SAMPLE_PROFILE.split('\n').slice(0,4).join('\n')});
near(partialWater.summary.topPressure,850);
assert.ok(partialWater.summary.precipitableWater < waterColumn.summary.precipitableWater);
assert.throws(()=>calculateWaterColumn({csv:'1000,0,20,50,0,0\n500,2000,20,50,0,0\n10,4000,60,100,0,0'}));
const richardson = calculateRichardson({csv:SAMPLE_PROFILE});
richardson.layers.forEach(layer=>near(layer.richardson,layer.n2/layer.shear**2));
const noShear = calculateRichardson({csv:SAMPLE_PROFILE.split('\n').map((line,i)=>i?line.split(',').slice(0,4).concat([0,0]).join(','):line).join('\n')});
assert.equal(noShear.summary.minRichardson,null);
assert.equal(noShear.summary.undefinedLayers,6);
assert.ok(noShear.layers.every(layer=>layer.richardson===null));
for (const [kind,result] of [['lcl',cloudBase],['moist',moist],['waterColumn',waterColumn],['richardson',richardson]]) assert.deepEqual(runCalculation(kind,result.input),result);
assert.equal(profile.rows.length, 7);
assert.equal(profile.layers.length, 6);
assert.ok(profile.summary.minN2 > 0);
near(profile.summary.bulkWindDifference, Math.hypot(33, 11));
const profileText = (thetas) => [1000, 900, 800].map((pressure, i) => [pressure, i * 1000, thetas[i] * (pressure / 1000) ** (CONSTANTS.rd / CONSTANTS.cp) - 273.15, 50, i * 10, 0].join(",")).join("\n");
const neutral = calculateProfile({ csv: profileText([300, 300, 300]) });
neutral.layers.forEach(row => { near(row.n2, 0); near(row.shear, .01); });
assert.ok(calculateProfile({ csv: profileText([300, 290, 280]) }).layers.every(r => r.n2 < 0));
assert.ok(calculateRichardson({csv:profileText([300,290,280])}).layers.every(r=>r.richardson<0));
calculateRichardson({csv:profileText([300,300,300])}).layers.forEach(r=>near(r.richardson,0));
assert.equal(parseProfileCsv(SAMPLE_PROFILE.replaceAll("\n", "\r\n")).length, 7);
for (const csv of ["", "1000,0,20,50,0,0\n1000,100,10,50,0,0\n900,200,5,50,0,0", "1000,0,20,50,0,0\n900,0,10,50,0,0\n800,200,5,50,0,0", "1000,0,20,50,0\n900,100,10,50,0\n800,200,5,50,0", "x".repeat(100001), SAMPLE_PROFILE.replace("25,70", "25,0"), SAMPLE_PROFILE.replace("25,70", '25,__import__("os")')]) assert.throws(() => parseProfileCsv(csv));

const config = { length: 100000, cells: 128, velocity: 10, diffusivity: 1000, dt: 60, duration: 3600, sigma: 10000 };
const transport = simulateTransport(config);
assert.equal(transport.summary.steps, 60);
assert.ok(transport.summary.stabilityNumber < 1);
near(transport.summary.massChangePercent, 0, 1e-10);
assert.ok(transport.rows.every(r => Number.isFinite(r.numerical) && r.numerical >= -1e-10));
const refined = simulateTransport({ ...config, cells: 256, dt: 15 });
const coarse = simulateTransport({ ...config, dt: 30 });
assert.ok(refined.summary.rmse < coarse.summary.rmse, "Courant数を固定した細分化で参照解との誤差が減る");
for (const velocity of [-10, 10]) {
  const exact = simulateTransport({ ...config, diffusivity: 0, velocity, dt: config.length / config.cells / 10, duration: 10000 });
  assert.ok(exact.summary.rmse < 1e-12, "C=1の純移流は1周期で初期値へ戻る");
}
const stationary = simulateTransport({ ...config, velocity: 0, diffusivity: 0, duration: 100 });
stationary.rows.forEach(r => near(r.initial, r.numerical));
assert.equal(stationary.summary.steps, 2, "最後の短いステップも実行する");
const diffusion = simulateTransport({ ...config, velocity: 0 });
assert.ok(Math.max(...diffusion.rows.map(r => r.numerical)) < Math.max(...diffusion.rows.map(r => r.initial)), "拡散でピークが下がる");
for (const invalid of [{ dt: 3600 }, { cells: 32, sigma: 1000 }, { cells: 32.5 }, { diffusivity: -1 }, { dt: .01, duration: 172800 }]) assert.throws(() => validateTransport({ ...config, ...invalid }));

const thickness = calculateThickness({ lowerPressure: 1000, upperPressure: 500, meanVirtualTemperature: 270 });
near(thickness.summary.layerThickness, CONSTANTS.rd*270/CONSTANTS.g*Math.log(2));
near(thickness.rows[0].height, 0);
near(thickness.rows.at(-1).height, thickness.summary.layerThickness);
assert.throws(() => calculateThickness({ lowerPressure: 500, upperPressure: 1000, meanVirtualTemperature: 270 }));
const wind = calculateGeostrophicWind({ latitude: 35, gradientX: 0, gradientY: -10 });
assert.ok(wind.summary.u > 0 && wind.summary.v === 0);
near(calculateGeostrophicWind({ latitude: -35, gradientX: 0, gradientY: -10 }).summary.u, -wind.summary.u);
assert.throws(() => calculateGeostrophicWind({ latitude: 0, gradientX: 0, gradientY: -10 }));
const thermalWind = calculateThermalWind({ latitude: 35, lowerPressure: 1000, upperPressure: 500, temperatureGradientX: 0, temperatureGradientY: -1, lowerU: 5, lowerV: 0 });
assert.ok(thermalWind.summary.deltaU > 0, "北ほど寒い場合、上層ほど西風が強い");
near(thermalWind.summary.deltaV, 0);
const inertial = calculateCoriolis({ latitude: 30, velocity: 10, length: 100000 });
near(inertial.summary.coriolisParameter, 7.292115e-5);
near(inertial.rows.at(-1).u, inertial.rows[0].u);
near(inertial.rows.at(-1).v, 0);
assert.ok(calculateCoriolis({ latitude: -30, velocity: 10, length: 100000 }).rows[30].v > 0);
assert.throws(() => calculateCoriolis({ latitude: 0, velocity: 10, length: 100000 }));
const radiation = calculateRadiation({ temperatureK: 288, emissivity: 1, incomingFlux: 350 });
assert.ok(radiation.summary.emittedFlux > 390 && radiation.summary.emittedFlux < 391);
assert.ok(radiation.summary.netRadiativeFlux < 0);
assert.ok(radiation.summary.peakWavelength > 10 && radiation.summary.peakWavelength < 10.1);
near(calculateRadiation({ temperatureK: 288, emissivity: 0, incomingFlux: 350 }).summary.emittedFlux, 0);
assert.ok(Math.abs(radiation.rows.reduce((closest,r) => r.radiance > closest.radiance ? r : closest).wavelength-radiation.summary.peakWavelength) < .5);
const oscillationConfig = { frequency: .01, damping: .1, displacement: 100, initialVelocity: 0, dt: 1, duration: 3600 };
const oscillator = simulateOscillator(oscillationConfig);
assert.ok(oscillator.summary.maxDisplacementError < .00001);
assert.ok(oscillator.rows.length <= 302);
for (const damping of [0, 1, 2]) assert.ok(simulateOscillator({ ...oscillationConfig, damping }).summary.maxDisplacementError < .0001);
const coarseOscillator = simulateOscillator({ ...oscillationConfig, dt: 10 });
assert.ok(oscillator.summary.maxDisplacementError < coarseOscillator.summary.maxDisplacementError);
assert.throws(() => simulateOscillator({ ...oscillationConfig, dt: 100 }));

// Execute exported Python independently and compare every numeric output, not just syntax.
const python = process.env.METEOSCOPE_TEST_PYTHON || "python";
const version = spawnSync(python, ["--version"], { encoding: "utf8" });
if (version.status !== 0) throw new Error("Python検証にPython 3が必要です。METEOSCOPE_TEST_PYTHONで実行ファイルを指定できます。");
for (const result of [thermal, profile, cloudBase, saturatedCloud, moist, saturatedMoist, waterColumn, partialWater, richardson, noShear, transport, stationary, simulateTransport({ ...config, velocity: -10 }), thickness, wind, thermalWind, inertial, radiation, oscillator,
  simulateOscillator({ ...oscillationConfig, damping: 1 }), simulateOscillator({ ...oscillationConfig, damping: 2 })]) {
  const code = buildNumericalPython(result);
  const steps = explainNumericalCalculation(result);
  assert.ok(steps.length >= 2);
  assert.ok(steps.every(step => step.title && step.formula && step.substitution && step.answer && step.detail));
  assert.ok(!code.includes("eval("));
  const execution = spawnSync(python, ["-", "--no-plot", "--no-save"], { input: code, encoding: "utf8", maxBuffer: 2000000 });
  assert.equal(execution.status, 0, execution.stderr);
  const exported = JSON.parse(execution.stdout);
  for (const [key, value] of Object.entries(result.summary)) value===null?assert.equal(exported.summary[key],null):near(exported.summary[key], value, 1e-8);
  for (const field of ["rows", "layers"]) {
    if (!result[field]) continue;
    assert.equal(exported[field].length, result[field].length);
    result[field].forEach((row, i) => Object.entries(row).forEach(([key, value]) => value===null?assert.equal(exported[field][i][key],null):near(exported[field][i][key], value, 1e-8)));
  }
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const source = await readFile(new URL("../src/ui/numericalCalculationModal.js", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../src/ui/numericalCalculation.css", import.meta.url), "utf8");
const sharedCss = await readFile(new URL("../src/style.css", import.meta.url), "utf8");
const workspaceStack = Number(css.match(/#numerical-calculation-modal\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
const tickerStack = Number(sharedCss.match(/\.remote-notice-ticker\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
assert.ok(workspaceStack > tickerStack, "お知らせテロップが計算画面の見出しや閉じる操作を覆わない");
assert.match(html, /id="map-utility-actions"[\s\S]*id="numerical-calculation-button"/);
assert.match(html, /id="numerical-calculation-modal"[\s\S]*role="dialog"[\s\S]*aria-labelledby="numerical-calculation-title"/);
assert.match(app, /setupNumericalCalculationModal\(\)/);
assert.match(source, /worker\?\.terminate\(\)/);
assert.match(source, /id !== generation/);
assert.match(source, /event.key === "Escape"/);
assert.match(source, /navigator.clipboard.writeText/);
assert.match(source, /code.select\(\)/);
assert.match(css, /@media \(max-width: 600px\)/);
assert.doesNotMatch(source, /innerHTML\s*=|\beval\(/);
console.log("Numerical calculation tests passed: physics, stability, convergence, validation, Python parity, integration");
