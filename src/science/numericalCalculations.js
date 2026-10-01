import { calculateDewPoint, calculateLcl, temperatureAlongDryAdiabat } from "../jma/upperAir.js";

export const CONSTANTS = Object.freeze({ rd: 287.05, cp: 1004, epsilon: 0.622, g: 9.80665 });
export const SAMPLE_PROFILE = `pressure_hpa,height_m,temp_c,rh_percent,u_ms,v_ms
1000,100,25,70,2,1
925,760,20,65,4,2
850,1500,15,60,7,3
700,3100,5,50,12,5
500,5600,-12,40,20,8
300,9200,-38,30,30,10
200,11800,-55,20,35,12`;

function value(input, key, min, max, integer = false) {
  const raw = input[key];
  if (raw === null || raw === undefined || String(raw).trim() === "") throw new Error(`${key}: 値を入力してください。`);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new Error(`${key}: ${min}〜${max}${integer ? "の整数" : ""}を入力してください。`);
  }
  return n;
}

function theta(temperature, pressure) {
  return (temperature + 273.15) * (1000 / pressure) ** (CONSTANTS.rd / CONSTANTS.cp);
}

function liquidVaporPressure(temperature) {
  return 6.1094 * Math.exp(17.625 * temperature / (243.04 + temperature));
}
function moisture(temperature, pressure, humidity) {
  const vaporPressure = liquidVaporPressure(temperature) * humidity / 100;
  if (vaporPressure >= pressure) throw new Error("水蒸気圧が全気圧以上です。入力条件を確認してください。");
  const mixingRatio = CONSTANTS.epsilon * vaporPressure / (pressure - vaporPressure);
  return { vaporPressure, mixingRatio, specificHumidity: mixingRatio / (1 + mixingRatio) };
}

export function calculateThermodynamics(input) {
  const temperature = value(input, "temperature", -80, 50);
  const pressure = value(input, "pressure", 100, 1100);
  const humidity = value(input, "humidity", 1, 100);
  // Magnus over liquid water; RH and dew point use the same phase convention.
  const { mixingRatio, specificHumidity } = moisture(temperature, pressure, humidity);
  const virtualTemperature = (temperature + 273.15) * (1 + mixingRatio / CONSTANTS.epsilon) / (1 + mixingRatio);
  const potentialTemperature = theta(temperature, pressure);
  const dewPoint = calculateDewPoint(temperature, humidity);
  const density = pressure * 100 / (CONSTANTS.rd * virtualTemperature);
  const rows = Array.from({ length: 91 }, (_, i) => {
    const p = 1000 - i * 10;
    return { pressure: p, temperature: temperatureAlongDryAdiabat(potentialTemperature - 273.15, p) };
  });
  return {
    type: "thermal", input: { temperature, pressure, humidity }, rows,
    summary: { potentialTemperature, dewPoint, mixingRatio: mixingRatio * 1000, specificHumidity: specificHumidity * 1000, virtualTemperature, density },
    charts: [{ title: "入力気塊の乾燥断熱線", xLabel: "気温 (°C)", yLabel: "気圧 (hPa)", invertY: true,
      series: [{ name: "乾燥断熱線（未飽和の仮定）", points: rows.map(r => [r.temperature, r.pressure]) }] }],
    method: "θ = T(1000/p)^(Rd/cp)。露点・水蒸気圧はMagnus式（液水基準）、r = εe/(p−e)、q = r/(1+r)、ρ = p/(Rd Tv)。TはK、pは式に応じhPa/Paへ変換。乾燥断熱線は凝結・潜熱を無視した仮想経路です。低温では氷面基準と異なり、Magnus近似の誤差が増えます。",
  };
}

export function parseProfileCsv(text) {
  if (typeof text !== "string" || text.length > 100000) throw new Error("CSVは100 KB以内で入力してください。");
  const lines = text.trim().split(/\r?\n/).filter(line => line.trim());
  if (lines[0]?.trim().replace(/^\uFEFF/, "") === "pressure_hpa,height_m,temp_c,rh_percent,u_ms,v_ms") lines.shift();
  if (lines.length < 3 || lines.length > 300) throw new Error("鉛直データは3〜300層、6列で入力してください。");
  const keys = ["pressure", "height", "temperature", "humidity", "u", "v"];
  const ranges = [[10,1100],[-500,30000],[-100,60],[1,100],[-150,150],[-150,150]];
  const rows = lines.map((line, index) => {
    const cells = line.split(",");
    if (cells.length !== 6) throw new Error(`${index + 1}行目: 気圧,高度,気温,相対湿度,u,vの6列が必要です。`);
    const row = Object.fromEntries(keys.map((key, i) => [key, value({ [key]: cells[i] }, key, ...ranges[i])]));
    return row;
  });
  rows.forEach((row, i) => {
    if (i && (row.height <= rows[i-1].height || row.pressure >= rows[i-1].pressure)) {
      throw new Error(`${i + 1}行目: 高度は増加、気圧は減少する順にしてください（重複不可）。`);
    }
  });
  return rows;
}

export function calculateProfile(input) {
  const profile = parseProfileCsv(input.csv);
  const rows = profile.map(row => ({ ...row, theta: theta(row.temperature, row.pressure), dewPoint: calculateDewPoint(row.temperature, row.humidity) }));
  const layers = rows.slice(1).map((upper, i) => {
    const lower = rows[i];
    const dz = upper.height - lower.height;
    return { height: (upper.height + lower.height) / 2, n2: CONSTANTS.g / ((upper.theta + lower.theta) / 2) * (upper.theta - lower.theta) / dz,
      shear: Math.hypot(upper.u - lower.u, upper.v - lower.v) / dz };
  });
  const summary = { levels: rows.length, minN2: Math.min(...layers.map(r => r.n2)), maxN2: Math.max(...layers.map(r => r.n2)),
    bulkWindDifference: Math.hypot(rows.at(-1).u - rows[0].u, rows.at(-1).v - rows[0].v) };
  return { type: "profile", input: { csv: input.csv }, rows, layers, summary,
    charts: [
      { title: "気温・露点の鉛直分布", xLabel: "温度 (°C)", yLabel: "気圧 (hPa)", invertY: true,
        series: [{ name: "気温", points: rows.map(r => [r.temperature, r.pressure]) }, { name: "露点", points: rows.map(r => [r.dewPoint, r.pressure]) }] },
      { title: "温位と高度", xLabel: "温位 (K)", yLabel: "高度 (m)", series: [{ name: "温位", points: rows.map(r => [r.theta, r.height]) }] },
      { title: "乾燥静的安定度", xLabel: "N² (s⁻²)", yLabel: "層の中間高度 (m)", series: [{ name: "N²", points: layers.map(r => [r.n2, r.height]) }] },
      { title: "風の鉛直変化", xLabel: "風速成分 (m/s)", yLabel: "高度 (m)", series: [{ name: "u（東向き）", points: rows.map(r => [r.u, r.height]) }, { name: "v（北向き）", points: rows.map(r => [r.v, r.height]) }] },
    ],
    method: "θ = T(1000/p)^(Rd/cp)、N² = g/θ̄ · Δθ/Δz（隣接層の差分、算術平均θ）。N²<0は乾燥静的不安定、N²>0は乾燥静的安定。湿潤対流やCAPEとは別の診断です。シアは|Δ風ベクトル|/Δz、全層風差は最上層と最下層の差。入力高度の基準を統一してください。",
  };
}

export function validateTransport(input) {
  const length = value(input, "length", 1000, 1000000);
  const cells = value(input, "cells", 32, 256, true);
  const velocity = value(input, "velocity", -100, 100);
  const diffusivity = value(input, "diffusivity", 0, 1000000);
  const dt = value(input, "dt", 0.01, 3600);
  const duration = value(input, "duration", 0.01, 172800);
  const sigma = value(input, "sigma", length / 100, length / 8);
  const dx = length / cells;
  if (sigma < 2 * dx) throw new Error(`初期分布を解像するため、標準偏差を${(2 * dx).toPrecision(5)} m以上にしてください。`);
  const courant = Math.abs(velocity) * dt / dx;
  const diffusionNumber = diffusivity * dt / dx ** 2;
  if (courant + 2 * diffusionNumber > 1 + 1e-12) {
    const maxDt = 1 / (Math.abs(velocity) / dx + 2 * diffusivity / dx ** 2);
    throw new Error(`不安定な条件です。C + 2D ≤ 1が必要です。時間刻みを${maxDt.toPrecision(4)}秒以下にしてください。`);
  }
  if (Math.ceil(duration / dt) > 20000) throw new Error("計算は20,000ステップまでです。時間刻みまたは終了時刻を調整してください。");
  return { length, cells, velocity, diffusivity, dt, duration, sigma, dx, courant, diffusionNumber };
}

export function simulateTransport(input) {
  const p = validateTransport(input);
  const { length: L, cells: n, velocity: u, diffusivity: kappa, dt, duration, sigma, dx } = p;
  const x = Array.from({ length: n }, (_, i) => i * dx);
  // Periodic Gaussian's Fourier series: the reference solves the continuous PDE,
  // not the discrete upwind stencil. Smooth initial condition limits truncation.
  const referenceAt = (position, time) => {
    const mean = Math.sqrt(2 * Math.PI) * sigma / L;
    let total = mean;
    for (let mode = 1; mode <= Math.floor(n / 2); mode++) {
      const w = 2 * Math.PI * mode / L;
      total += 2 * mean * Math.exp(-0.5 * (sigma * w) ** 2 - kappa * w * w * time) * Math.cos(w * (position - L / 4 - u * time));
    }
    return total;
  };
  const initial = x.map(position => referenceAt(position, 0));
  const sampleIndex = Math.floor(n / 4), firstDt = Math.min(dt, duration);
  const firstC = Math.abs(u)*firstDt/dx, firstD = kappa*firstDt/dx**2;
  const firstStep = { index: sampleIndex, dt: firstDt, center: initial[sampleIndex], left: initial[(sampleIndex+n-1)%n], right: initial[(sampleIndex+1)%n], courant: firstC, diffusionNumber: firstD };
  firstStep.next = firstStep.center - firstC*(firstStep.center - (u >= 0 ? firstStep.left : firstStep.right)) + firstD*(firstStep.left-2*firstStep.center+firstStep.right);
  let field = [...initial];
  const steps = Math.ceil(duration / dt);
  for (let step = 0; step < steps; step++) {
    const h = Math.min(dt, duration - step * dt);
    const c = Math.abs(u) * h / dx;
    const d = kappa * h / dx ** 2;
    field = field.map((v, i) => {
      const left = field[(i + n - 1) % n], right = field[(i + 1) % n];
      return v - c * (v - (u >= 0 ? left : right)) + d * (left - 2 * v + right);
    });
  }
  const reference = x.map(position => referenceAt(position, duration));
  const mass = arr => arr.reduce((sum, v) => sum + v, 0) * dx;
  const rmse = Math.sqrt(field.reduce((sum, v, i) => sum + (v - reference[i]) ** 2, 0) / n);
  const rows = x.map((position, i) => ({ x: position, initial: initial[i], numerical: field[i], reference: reference[i] }));
  return { type: "transport", input: p, rows, firstStep,
    summary: { courant: p.courant, diffusionNumber: p.diffusionNumber, stabilityNumber: p.courant + 2 * p.diffusionNumber,
      steps, rmse, massChangePercent: (mass(field) - mass(initial)) / mass(initial) * 100 },
    charts: [{ title: `1次元移流拡散・t = ${duration} s`, xLabel: "位置 (m)", yLabel: "規格化トレーサー量", series: [
      { name: "初期値", points: x.map((v, i) => [v, initial[i]]) }, { name: "数値解", points: x.map((v, i) => [v, field[i]]) }, { name: "参照解", points: x.map((v, i) => [v, reference[i]]) },
    ] }],
    method: "∂φ/∂t + u ∂φ/∂x = κ ∂²φ/∂x²。一定u・κ、周期境界、周期ガウス初期値。時間は陽的Euler、移流は1次風上差分、拡散は2次中心差分。C = |u|Δt/Δx、D = κΔt/Δx²、安定条件C+2D≤1。参照解は周期ガウスのFourier級数（格子数/2まで）。数値粘性・格子解像度による誤差があります。実際の天気予報モデルではありません。",
  };
}

export function runCalculation(type, input) {
  if (type === "moist") return calculateMoistThermodynamics(input);
  if (type === "lcl") return calculateCloudBase(input);
  if (type === "waterColumn") return calculateWaterColumn(input);
  if (type === "richardson") return calculateRichardson(input);
  if (type === "thermal") return calculateThermodynamics(input);
  if (type === "profile") return calculateProfile(input);
  if (type === "transport") return simulateTransport(input);
  if (type === "thickness") return calculateThickness(input);
  if (type === "geostrophic") return calculateGeostrophicWind(input);
  if (type === "thermalWind") return calculateThermalWind(input);
  if (type === "coriolis") return calculateCoriolis(input);
  if (type === "radiation") return calculateRadiation(input);
  if (type === "oscillator") return simulateOscillator(input);
  throw new Error("計算の種類が不正です。");
}

const LV = 2.5e6;
function parcelState(input) {
  const temperature = value(input, "temperature", -40, 40);
  const pressure = value(input, "pressure", 600, 1100);
  const humidity = value(input, "humidity", 5, 100);
  const dewPoint = calculateDewPoint(temperature, humidity);
  const lcl = humidity === 100 ? {temperature,pressure} : calculateLcl(temperature, dewPoint, pressure);
  return { temperature, pressure, humidity, dewPoint, lcl, ...moisture(temperature, pressure, humidity) };
}

// This experiment is liquid-water-only, unlike the existing upper-air plot's
// ice branch. Keep its convention and constant latent heat explicit.
export function integrateLiquidAdiabat(startTemperature, startPressure, endPressure, step = 1) {
  if (![startTemperature, startPressure, endPressure, step].every(Number.isFinite) || startTemperature+273.15 < 150 || startTemperature+273.15 > 340 || startPressure < 100 || endPressure < 100 || startPressure > 1100 || endPressure > 1100 || step < .1 || step > 10) throw new Error("湿潤断熱積分の範囲が不正です。");
  const derivative = (t, p) => {
    if (t < 150 || t > 340) throw new Error("湿潤断熱積分が適用温度範囲（150〜340 K）を超えました。");
    const r = moisture(t - 273.15, p, 100).mixingRatio;
    return t/p * (CONSTANTS.rd + LV*r/t) / (CONSTANTS.cp + LV**2*r*CONSTANTS.epsilon/(CONSTANTS.rd*t*t));
  };
  let t = startTemperature + 273.15, p = startPressure;
  const rows = [{ pressure: p, temperature: startTemperature }];
  const count = Math.ceil(Math.abs(endPressure - startPressure) / step);
  for (let i = 0; i < count; i++) {
    const h = Math.sign(endPressure-startPressure)*Math.min(step, Math.abs(endPressure-p));
    const k1 = derivative(t,p), k2 = derivative(t+h*k1/2,p+h/2), k3 = derivative(t+h*k2/2,p+h/2), k4 = derivative(t+h*k3,p+h);
    t += h*(k1+2*k2+2*k3+k4)/6;
    p = i === count-1 ? endPressure : p+h;
    if (!Number.isFinite(t) || t < 150 || t > 340) throw new Error("湿潤断熱積分の温度が適用範囲外です。");
    rows.push({ pressure: p, temperature: t-273.15 });
  }
  return rows;
}

export function calculateCloudBase(input) {
  const p = parcelState(input), tk = p.temperature+273.15, tl = p.lcl.temperature+273.15;
  const lclHeight = CONSTANTS.cp / CONSTANTS.g * (tk-tl);
  const rows = Array.from({length:81}, (_,i) => {
    const pressure = p.pressure*(p.lcl.pressure/p.pressure)**(i/80);
    const temperature = tk*(pressure/p.pressure)**(CONSTANTS.rd/CONSTANTS.cp)-273.15;
    return { pressure, temperature, height: CONSTANTS.cp/CONSTANTS.g*(p.temperature-temperature) };
  });
  return {type:"lcl", input:{temperature:p.temperature, pressure:p.pressure, humidity:p.humidity}, rows,
    summary:{dewPoint:p.dewPoint, lclTemperature:p.lcl.temperature, lclPressure:p.lcl.pressure, lclHeight},
    charts:[{title:"入力気塊からLCLまでの乾燥上昇", xLabel:"気温 (°C)", yLabel:"出発点からの高度 (m)", series:[{name:"乾燥気塊・LCLで終端", points:rows.map(r=>[r.temperature,r.height])}]}],
    method:"Bolton近似のLCL温度と乾燥Poisson式から気圧を求める。高度差はcp(T−TL)/g、乾燥断熱・一定重力・気塊温度を用いる理想化近似。高度は出発点基準で海抜高度ではなく、実際の雲底の観測値や雲発生の保証でもありません。RH・露点は液水基準。"};
}

export function calculateMoistThermodynamics(input) {
  const p = parcelState(input);
  const topPressure = value(input, "topPressure", 100, 1000);
  if (topPressure >= p.lcl.pressure) throw new Error(`上端気圧をLCL気圧（${p.lcl.pressure.toFixed(1)} hPa）より低くしてください。`);
  const tk = p.temperature+273.15, tl = p.lcl.temperature+273.15, r = p.mixingRatio;
  const thetaDl = tk*(1000/(p.pressure-p.vaporPressure))**(CONSTANTS.rd/CONSTANTS.cp)*(tk/tl)**(.28*r);
  const equivalentPotentialTemperature = thetaDl*Math.exp((3036/tl-1.78)*r*(1+.448*r));
  const wetBulbTemperature = integrateLiquidAdiabat(p.lcl.temperature, p.lcl.pressure, p.pressure).at(-1).temperature;
  const dryRows = Array.from({length:41},(_,i)=>({pressure:p.pressure*(p.lcl.pressure/p.pressure)**(i/40), phase:0})).map(row=>({...row,temperature:tk*(row.pressure/p.pressure)**(CONSTANTS.rd/CONSTANTS.cp)-273.15}));
  const moistRows = integrateLiquidAdiabat(p.lcl.temperature,p.lcl.pressure,topPressure);
  const rows = [...dryRows, ...moistRows.slice(1).map(row=>({...row,phase:1}))];
  return {type:"moist", input:{temperature:p.temperature,pressure:p.pressure,humidity:p.humidity,topPressure}, rows,
    intermediate:{vaporPressure:p.vaporPressure,mixingRatio:r,thetaDl},
    summary:{equivalentPotentialTemperature,wetBulbTemperature,dewPoint:p.dewPoint,lclTemperature:p.lcl.temperature,lclPressure:p.lcl.pressure},
    charts:[{title:"LCL前後の理想化した気塊上昇",xLabel:"気温 (°C)",yLabel:"気圧 (hPa)",invertY:true,series:[{name:"LCLまで乾燥断熱",points:dryRows.map(r=>[r.temperature,r.pressure])},{name:"LCL以上・液水擬似断熱",points:moistRows.map(r=>[r.temperature,r.pressure])}]}],
    method:"相当温位はBolton近似。湿球温度はNormand法（LCLへ乾燥上昇後、液水擬似断熱で元の気圧へ下降）。湿潤経路はdT/dp=T/p·(Rd+Lv rs/T)/(cp+Lv²rs ε/(Rd T²))をRK4・最大1 hPa刻みで積分。液水Magnus飽和式、一定Lv=2.5×10⁶ J/kg、凝結物は除去。氷相・混合・放射・降水負荷を含まず、低温は過冷却液水の理想化です。MetPyの定数・飽和式とは異なります。CSV phase:0=乾燥、1=飽和。"};
}

export function calculateWaterColumn(input) {
  let cumulative = 0;
  const rows = parseProfileCsv(input.csv).map(row=>{
    const {specificHumidity} = moisture(row.temperature,row.pressure,row.humidity);
    return {...row,specificHumidity,specificHumidityGKg:specificHumidity*1000,moistStaticEnergy:CONSTANTS.cp*(row.temperature+273.15)+CONSTANTS.g*row.height+LV*specificHumidity};
  });
  const layers = rows.slice(1).map((upper,i)=>{
    const lower=rows[i], deltaPressure=(lower.pressure-upper.pressure)*100;
    const water = (lower.specificHumidity+upper.specificHumidity)/2*deltaPressure/CONSTANTS.g;
    cumulative += water;
    return {pressure:upper.pressure,deltaPressure,water,cumulative};
  });
  return {type:"waterColumn",input:{csv:input.csv},rows,layers,
    summary:{levels:rows.length,precipitableWater:cumulative,bottomPressure:rows[0].pressure,topPressure:rows.at(-1).pressure},
    charts:[{title:"比湿の鉛直分布",xLabel:"比湿 (g/kg)",yLabel:"気圧 (hPa)",invertY:true,series:[{name:"液水基準の比湿",points:rows.map(r=>[r.specificHumidityGKg,r.pressure])}]},
      {title:"入力下端からの累積可降水量",xLabel:"累積可降水量 (mm)",yLabel:"気圧 (hPa)",invertY:true,series:[{name:"入力範囲のみ",points:[[0,rows[0].pressure],...layers.map(r=>[r.cumulative,r.pressure])]}]},
      {title:"湿潤静的エネルギー",xLabel:"h (kJ/kg)",yLabel:"高度 (m)",series:[{name:"cp T + g z + Lv q",points:rows.map(r=>[r.moistStaticEnergy/1000,r.height])}]}],
    method:`PW=∫q dp/gを隣接層の台形則で積分。qは比湿(kg/kg)、圧力差はPa。水密度1000 kg/m³として1 kg/m²=1 mm。${rows[0].pressure}〜${rows.at(-1).pressure} hPaの入力範囲だけで、範囲外は補間・外挿せず、全気柱や実際の降水量とは限りません。MetPyの混合比rによる近似積分とは区別します。h=cp T+gz+Lv q、TはK、Lv一定、高度基準を統一。${layers.some(r=>r.deltaPressure>20000)?" 200 hPa超の粗い層があり、積分精度に注意してください。":""}`};
}

export function calculateRichardson(input) {
  const base = calculateProfile(input);
  const layers = base.layers.map(row=>({...row,richardson:row.shear<=1e-12?null:row.n2/row.shear**2}));
  const finite = layers.filter(r=>r.richardson!==null);
  return {type:"richardson",input:base.input,rows:base.rows,layers,
    summary:{levels:base.rows.length,minRichardson:finite.length?Math.min(...finite.map(r=>r.richardson)):null,undefinedLayers:layers.length-finite.length},
    charts:[{title:"隣接層差分の勾配Richardson数",xLabel:"Ri（無次元）",yLabel:"層の中間高度 (m)",series:[{name:"乾燥Ri・未定義層は欠測",points:layers.map(r=>[r.richardson,r.height])},{name:"参照線 0.25",points:layers.map(r=>[.25,r.height])}]},base.charts[2],base.charts[3]],
    method:"Ri=N²/[(Δu/Δz)²+(Δv/Δz)²]。隣接層差分・平均乾燥温位による有限層の勾配近似で、bulk Richardson数ではありません。シア≤10⁻¹² s⁻¹は未定義（CSV空欄・JSON null）とし、グラフの線を切ります。0.25は理想的な平行・安定成層流の参照値で、乱流の発生・不発生を断定する閾値ではありません。乾燥不安定層ではRiが負になり、湿潤対流・鉛直解像度の影響にも注意が必要です。"};
}

const OMEGA = 7.292115e-5;
function coriolis(latitude, minimum = 5) {
  if (Math.abs(latitude) < minimum) throw new Error(`赤道付近では適用できません。緯度の絶対値を${minimum}°以上にしてください。`);
  return 2 * OMEGA * Math.sin(latitude * Math.PI / 180);
}
function pressures(input) {
  const lowerPressure = value(input, "lowerPressure", 100, 1100);
  const upperPressure = value(input, "upperPressure", 10, 1000);
  if (upperPressure >= lowerPressure) throw new Error("上層気圧は下層気圧より小さくしてください。");
  return { lowerPressure, upperPressure };
}
export function calculateThickness(input) {
  const { lowerPressure, upperPressure } = pressures(input);
  const meanVirtualTemperature = value(input, "meanVirtualTemperature", 180, 340);
  const layerThickness = CONSTANTS.rd * meanVirtualTemperature / CONSTANTS.g * Math.log(lowerPressure / upperPressure);
  const rows = Array.from({ length: 81 }, (_, i) => {
    const pressure = lowerPressure * (upperPressure / lowerPressure) ** (i / 80);
    return { pressure, height: CONSTANTS.rd * meanVirtualTemperature / CONSTANTS.g * Math.log(lowerPressure / pressure) };
  });
  return { type: "thickness", input: { lowerPressure, upperPressure, meanVirtualTemperature }, rows, summary: { layerThickness },
    charts: [{ title: "気圧と下層からの相対高度", xLabel: "気圧 (hPa)", yLabel: "相対高度 (m)", series: [{ name: "層平均仮温度を一定とした静力学解", points: rows.map(r => [r.pressure, r.height]) }] }],
    method: "測高公式 Δz = Rd T̄v/g · ln(p下/p上)。T̄vはln(p)について平均した仮温度（K）。一定重力・静力学平衡を仮定。グラフは仮温度一定の仮想鉛直分布で、実際の気温プロファイルではありません。" };
}
export function calculateGeostrophicWind(input) {
  const latitude = value(input, "latitude", -85, 85);
  const gradientX = value(input, "gradientX", -1000, 1000);
  const gradientY = value(input, "gradientY", -1000, 1000);
  const f = coriolis(latitude);
  const u = -CONSTANTS.g / f * gradientY / 100000;
  const v = CONSTANTS.g / f * gradientX / 100000;
  const rows = Array.from({ length: 41 }, (_, i) => ({ distance: (i - 20) * 10000, heightX: gradientX * (i - 20) / 10, heightY: gradientY * (i - 20) / 10 }));
  return { type: "geostrophic", input: { latitude, gradientX, gradientY }, rows, summary: { coriolisParameter: f, u, v, windSpeed: Math.hypot(u, v) },
    charts: [{ title: "入力した等圧面高度勾配（原点からの差）", xLabel: "距離 (m)", yLabel: "高度差 (m)", series: [{ name: "東西断面", points: rows.map(r => [r.distance, r.heightX]) }, { name: "南北断面", points: rows.map(r => [r.distance, r.heightY]) }] }],
    method: "f = 2Ω sinφ、ug = −g/f · ∂Z/∂y、vg = g/f · ∂Z/∂x。入力は等圧面のジオポテンシャル高度Zの勾配（m/100 km）。xは東、yは北。一定f・摩擦なし・地衡風平衡を仮定し、曲率は無視。赤道付近（|緯度|<5°）は対象外。" };
}
export function calculateThermalWind(input) {
  const latitude = value(input, "latitude", -85, 85);
  const { lowerPressure, upperPressure } = pressures(input);
  const temperatureGradientX = value(input, "temperatureGradientX", -20, 20);
  const temperatureGradientY = value(input, "temperatureGradientY", -20, 20);
  const lowerU = value(input, "lowerU", -150, 150), lowerV = value(input, "lowerV", -150, 150);
  const f = coriolis(latitude);
  const rows = Array.from({ length: 81 }, (_, i) => {
    const pressure = lowerPressure * (upperPressure / lowerPressure) ** (i / 80);
    const scale = CONSTANTS.rd / f * Math.log(pressure / lowerPressure) / 100000;
    return { pressure, u: lowerU + scale * temperatureGradientY, v: lowerV - scale * temperatureGradientX };
  });
  const last = rows.at(-1);
  return { type: "thermalWind", input: { latitude, lowerPressure, upperPressure, temperatureGradientX, temperatureGradientY, lowerU, lowerV }, rows,
    summary: { coriolisParameter: f, deltaU: last.u - lowerU, deltaV: last.v - lowerV, upperU: last.u, upperV: last.v },
    charts: [{ title: "温度風関係からの地衡風変化", xLabel: "風速成分 (m/s)", yLabel: "気圧 (hPa)", invertY: true, series: [{ name: "u（東向き）", points: rows.map(r => [r.u, r.pressure]) }, { name: "v（北向き）", points: rows.map(r => [r.v, r.pressure]) }] }],
    method: "Δug = Rd/f · ∂T/∂y · ln(p上/p下)、Δvg = −Rd/f · ∂T/∂x · ln(p上/p下)。温度勾配（K/100 km）とfを層内で一定とする静力学・地衡風近似。下層の入力は地衡風成分。湿度・摩擦・曲率は無視。|緯度|≥5°。" };
}
export function calculateCoriolis(input) {
  const latitude = value(input, "latitude", -90, 90);
  const velocity = value(input, "velocity", 0, 100), length = value(input, "length", 1000, 1000000);
  const f = coriolis(latitude, 1);
  const period = 2 * Math.PI / Math.abs(f);
  const rows = Array.from({ length: 121 }, (_, i) => ({ timeHours: period * i / 120 / 3600, u: velocity * Math.cos(f * period * i / 120), v: -velocity * Math.sin(f * period * i / 120) }));
  return { type: "coriolis", input: { latitude, velocity, length }, rows,
    summary: { coriolisParameter: f, inertialPeriodHours: period / 3600, inertialRadius: velocity / Math.abs(f), rossbyNumber: velocity / (Math.abs(f) * length) },
    charts: [{ title: "自由な慣性振動・1周期", xLabel: "時間 (h)", yLabel: "風速成分 (m/s)", series: [{ name: "u", points: rows.map(r => [r.timeHours, r.u]) }, { name: "v", points: rows.map(r => [r.timeHours, r.v]) }] }],
    method: "f = 2Ω sinφ、慣性周期 = 2π/|f|、慣性半径 = U/|f|、Ro = U/(|f|L)。du/dt=fv、dv/dt=−fu、初期(u,v)=(U,0)の解。f平面・気圧傾度なし・摩擦なしを仮定。赤道付近（|緯度|<1°）では周期が発散するため対象外。" };
}
export function calculateRadiation(input) {
  const temperatureK = value(input, "temperatureK", 150, 400), emissivity = value(input, "emissivity", 0, 1), incomingFlux = value(input, "incomingFlux", 0, 1500);
  const emittedFlux = emissivity * 5.670374419e-8 * temperatureK ** 4;
  const peakWavelength = 2897.771955 / temperatureK;
  const rows = Array.from({ length: 197 }, (_, i) => {
    const wavelength = 2 + i * .5, lambda = wavelength * 1e-6;
    const radiance = emissivity * 2 * 6.62607015e-34 * 299792458 ** 2 / (lambda ** 5 * Math.expm1(6.62607015e-34 * 299792458 / (lambda * 1.380649e-23 * temperatureK))) * 1e-6;
    return { wavelength, radiance };
  });
  return { type: "radiation", input: { temperatureK, emissivity, incomingFlux }, rows,
    summary: { emittedFlux, netRadiativeFlux: incomingFlux - emittedFlux, peakWavelength },
    charts: [{ title: "Planck分布・灰色体の放射輝度", xLabel: "波長 (µm)", yLabel: "放射輝度 (W m⁻² sr⁻¹ µm⁻¹)", series: [{ name: "ελ一定", points: rows.map(r => [r.wavelength, r.radiance]) }] }],
    method: "放射発散度 F = εσT⁴（全波長・半球積分）、Wien則 λmax = 2897.77/T µm。グラフはPlanckの分光放射輝度に一定放射率εを掛けた灰色体（ε=1なら黒体）。放射収支は吸収済み流入−放出で、正は加熱側。大気の吸収帯・雲・顕熱・潜熱は含みません。ε=0ではスペクトルピークを定義できないため、Wien値は黒体の参照値です。" };
}
export function simulateOscillator(input) {
  const frequency = value(input, "frequency", .001, .1), damping = value(input, "damping", 0, 2);
  const displacement = value(input, "displacement", -1000, 1000), initialVelocity = value(input, "initialVelocity", -100, 100);
  const dt = value(input, "dt", .01, 100), duration = value(input, "duration", .01, 86400);
  if (frequency * dt > .2 || Math.ceil(duration / dt) > 20000) throw new Error("精度・計算量の制限：ωΔt≤0.2、20,000ステップ以内にしてください。");
  const referenceAt = t => {
    if (Math.abs(damping - 1) < 1e-10) return Math.exp(-frequency*t) * (displacement + (initialVelocity + frequency*displacement)*t);
    if (damping < 1) {
      const w = frequency * Math.sqrt(1 - damping ** 2);
      return Math.exp(-damping*frequency*t) * (displacement*Math.cos(w*t) + (initialVelocity+damping*frequency*displacement)/w*Math.sin(w*t));
    }
    const a = frequency * (-damping + Math.sqrt(damping*damping-1)), b = frequency * (-damping - Math.sqrt(damping*damping-1));
    const c = (initialVelocity - b*displacement)/(a-b);
    return c*Math.exp(a*t) + (displacement-c)*Math.exp(b*t);
  };
  let z = displacement, v = initialVelocity, squareError = 0, maxError = 0, firstStep = null;
  const steps = Math.ceil(duration/dt), rows = [{ time: 0, numerical: z, reference: z, velocity: v }];
  const acceleration = (position, speed) => -2*damping*frequency*speed - frequency*frequency*position;
  for (let i = 0; i < steps; i++) {
    const h = Math.min(dt, duration - i*dt);
    const a1 = acceleration(z,v), v2 = v+h*a1/2, a2 = acceleration(z+h*v/2,v2);
    const v3 = v+h*a2/2, a3 = acceleration(z+h*v2/2,v3), v4 = v+h*a3, a4 = acceleration(z+h*v3,v4);
    if (i === 0) firstStep = { h, z, v, a1, v2, a2, v3, a3, v4, a4 };
    z += h/6*(v+2*v2+2*v3+v4); v += h/6*(a1+2*a2+2*a3+a4);
    if (i === 0) Object.assign(firstStep, { zNext: z, vNext: v });
    const time = Math.min((i+1)*dt,duration), reference = referenceAt(time), error = Math.abs(z-reference);
    squareError += error*error; maxError = Math.max(maxError,error);
    if ((i+1) % Math.max(1,Math.ceil(steps/300)) === 0 || i+1 === steps) rows.push({ time, numerical: z, reference, velocity: v });
  }
  return { type: "oscillator", input: { frequency, damping, displacement, initialVelocity, dt, duration }, rows, firstStep,
    summary: { naturalPeriodSeconds: 2*Math.PI/frequency, steps, displacementRmse: Math.sqrt(squareError/steps), maxDisplacementError: maxError },
    charts: [{ title: "減衰振動：RK4と解析解", xLabel: "時間 (s)", yLabel: "変位 (m)", series: [{ name: "RK4数値解", points: rows.map(r=>[r.time,r.numerical]) }, { name: "解析解", points: rows.map(r=>[r.time,r.reference]) }] }],
    method: "z''+2ζωz'+ω²z=0を古典的4次Runge–Kuttaで解く。ωは角振動数(rad/s)、ζは減衰比。ωΔt≤0.2を精度目安として制限。解析解は不足減衰・臨界減衰・過減衰に対応。ω=Nと置けば乾燥安定成層の小振幅浮力振動の理想化例（一定N）。出力は最大約300時刻、誤差は全ステップで評価。" };
}
