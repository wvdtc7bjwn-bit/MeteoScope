const n = value => value === 0 ? "0" : Number(value.toPrecision(6)).toString();
const step = (title, formula, substitution, answer, detail) => ({ title, formula, substitution, answer, detail });

export function explainNumericalCalculation(result) {
  const p = result.input, s = result.summary;
  const fSteps = () => [step("緯度からコリオリ係数を求める", "f = 2Ω sinφ", `2 × 7.292115×10⁻⁵ × sin(${n(p.latitude)}°)`, `${n(s.coriolisParameter)} s⁻¹`, "緯度をラジアンへ変換して計算します。南半球ではfの符号が負になります。")];
  switch (result.type) {
    case "lcl":
    case "moist": {
      const tk=p.temperature+273.15,td=s.dewPoint+273.15,tl=s.lclTemperature+273.15;
      const steps=[step("露点からLCL温度へ", "TL=1/[1/(Td−56)+ln(T/Td)/800]+56（K）", `T=${n(tk)} K、Td=${n(td)} K`, `${n(tl)} K = ${n(s.lclTemperature)} °C`, "既存の高層解析と同じBolton近似。RH・露点は液水基準で、氷相を含みません。"),
        step("乾燥断熱関係からLCL気圧へ", "pL=p(TL/T)^(cp/Rd)", `${n(p.pressure)} × (${n(tl)}/${n(tk)})^(1004/287.05)`, `${n(s.lclPressure)} hPa`, "気圧と高度を取り違えないでください。LCLは持ち上げた気塊が飽和する状態で、雲の発生や実際の雲底を保証しません。")];
      if(result.type==="lcl") return [...steps,step("出発点からの理想化した高度差", "Δz=cp(T−TL)/g", `1004×(${n(tk)}−${n(tl)})/9.80665`, `${n(s.lclHeight)} m`, "乾燥断熱気塊・一定重力での近似。海抜高度ではありません。")];
      const m=result.intermediate;
      return [...steps,
        step("LCLでの乾燥温位から相当温位へ", "θDL=T[1000/(p−e)]^(Rd/cp)(T/TL)^(0.28r)、θe=θDL exp[(3036/TL−1.78)r(1+0.448r)]", `e=${n(m.vaporPressure)} hPa、r=${n(m.mixingRatio)} kg/kg、θDL=${n(m.thetaDl)} K`, `${n(s.equivalentPotentialTemperature)} K`, "rは混合比で、g/kgではなくkg/kgで代入します。Boltonの近似式です。"),
        step("飽和経路を数値積分する", "dT/dp = T/p · (Rd+Lv rs/T)/(cp+Lv²rs ε/(Rd T²))", `TL=${n(tl)} K、pL=${n(s.lclPressure)} hPa、Lv=2500000 J/kg、ε=0.622`, `湿球温度=${n(s.wetBulbTemperature)} °C`, "RK4・最大1 hPa刻み。湿球温度はLCLから元の気圧への擬似断熱下降（Normand法）。グラフは逆に上端まで上昇させます。液水のみ・Lv一定の近似で、MetPyの数値と完全一致するとは限りません。")];
    }
    case "waterColumn": {
      const a=result.rows[0],b=result.rows[1],layer=result.layers[0];
      return [step("各層の比湿を求める", "e=es RH/100、r=εe/(p−e)、q=r/(1+r)", `第1層：t=${n(a.temperature)} °C、p=${n(a.pressure)} hPa、RH=${n(a.humidity)} %`, `q=${n(a.specificHumidity)} kg/kg`, "混合比ではなく比湿で静力学の圧力積分を行います。Magnus式・液水基準。"),
        step("隣接層の水蒸気量を台形積分", "ΔPW=(q下+q上)/2 × Δp/g", `(${n(a.specificHumidity)}+${n(b.specificHumidity)})/2 × ${n(layer.deltaPressure)} / 9.80665`, `${n(layer.water)} mm`, "ΔpはhPaからPaへ100倍。水密度1000 kg/m³なら1 kg/m²が1 mmです。"),
        step("入力範囲だけを合計する", "PW=ΣΔPW", `${n(s.bottomPressure)}〜${n(s.topPressure)} hPaの${result.layers.length}層間を合計`, `${n(s.precipitableWater)} mm`, "範囲外の水蒸気は未計算です。全気柱の値や実際に降る雨の量と同一ではありません。"),
        step("湿潤静的エネルギー", "h=cp T+g z+Lv q", `1004×${n(a.temperature+273.15)}+9.80665×${n(a.height)}+2500000×${n(a.specificHumidity)}`, `${n(a.moistStaticEnergy)} J/kg`, "第1層の例。高度の基準が変わると位置エネルギーの基準も変わります。")];
    }
    case "richardson": {
      const layer=result.layers.find(r=>r.richardson!==null);
      return [step("浮力成層とシアを隣接層で差分", "N²=g/θ̄ · Δθ/Δz、S²=(Δu/Δz)²+(Δv/Δz)²", `${result.layers.length}層間を計算、${s.undefinedLayers}層間はシアがゼロ（または極小）`, layer?`例：N²=${n(layer.n2)} s⁻²、S²=${n(layer.shear**2)} s⁻²`:"全層間でRiは未定義", "各層の高さ・温位・風は層別CSVで確認できます。分母ゼロを0や有限値に置き換えません。"),
        step("勾配Richardson数と適用条件", "Ri=N²/S²", layer?`${n(layer.n2)}/${n(layer.shear**2)}`:"S²≈0のため割り算しない", layer?`例：Ri=${n(layer.richardson)}`:"Ri=未定義（JSON null・CSV空欄）", "乾燥温位・有限層差分の診断です。参照値0.25だけで乱流の有無を断定できません。未定義層をまたいでグラフの線をつなぎません。")];
    }
    case "thermal": {
      const tk = p.temperature+273.15, es = 6.1094*Math.exp(17.625*p.temperature/(243.04+p.temperature)), e = es*p.humidity/100;
      const gamma = Math.log(p.humidity/100)+17.625*p.temperature/(243.04+p.temperature);
      return [
        step("絶対温度と温位", "T = t + 273.15、θ = T(1000/p)^(Rd/cp)", `(${n(p.temperature)} + 273.15) × (1000/${n(p.pressure)})^(287.05/1004)`, `${n(s.potentialTemperature)} K`, "温位は気塊を乾燥断熱的に1000 hPaへ移したときの温度です。"),
        step("飽和水蒸気圧から実際の水蒸気圧へ", "es = 6.1094 exp[17.625t/(243.04+t)]、e = es RH/100", `es = ${n(es)} hPa、e = ${n(es)} × ${n(p.humidity)}/100`, `${n(e)} hPa`, "Magnus近似・液水基準です。RHは0〜1へ換算します。"),
        step("露点を求める", "γ = ln(RH/100)+17.625t/(243.04+t)、Td = 243.04γ/(17.625−γ)", `γ = ${n(gamma)} → 243.04 × ${n(gamma)} / (17.625 − ${n(gamma)})`, `${n(s.dewPoint)} °C`, "水蒸気量を保ったまま冷却して飽和する温度の近似です。"),
        step("混合比と比湿", "r = εe/(p−e)、q = r/(1+r)", `r = 0.622 × ${n(e)} / (${n(p.pressure)} − ${n(e)})、q = r/(1+r)`, `r = ${n(s.mixingRatio)} g/kg、q = ${n(s.specificHumidity)} g/kg`, "内部ではkg/kg、表示時に1000倍しています。rは乾燥空気質量、qは湿潤空気全体の質量を分母に使います。"),
        step("仮温度と密度", "Tv = T(1+r/ε)/(1+r)、ρ = p/(Rd Tv)", `T = ${n(tk)} K、p = ${n(p.pressure*100)} Pa、Tv = ${n(s.virtualTemperature)} K`, `${n(s.density)} kg/m³`, "湿潤空気を同じ密度の乾燥空気として扱う温度が仮温度です。圧力をPaへ換算します。"),
      ];
    }
    case "profile": {
      const a = result.rows[0], b = result.rows[1], layer = result.layers[0];
      return [step("各層の温位と露点", "θ = (t+273.15)(1000/p)^(Rd/cp)、TdはMagnus式", `第1層：t = ${n(a.temperature)} °C、p = ${n(a.pressure)} hPa、RH = ${n(a.humidity)} %`, `θ = ${n(a.theta)} K、Td = ${n(a.dewPoint)} °C`, "すべての入力層に同じ式を適用します。"),
        step("隣接する2層の温位勾配", "Δθ/Δz = (θ上−θ下)/(z上−z下)", `(${n(b.theta)} − ${n(a.theta)}) / (${n(b.height)} − ${n(a.height)})`, `${n((b.theta-a.theta)/(b.height-a.height))} K/m`, "ここでは最下層とその上の層を例示しています。高度や気圧の順序が不正なデータは計算しません。"),
        step("乾燥静的安定度", "N² = g/θ̄ × Δθ/Δz、θ̄ = (θ上+θ下)/2", `9.80665 / ${n((a.theta+b.theta)/2)} × ${n((b.theta-a.theta)/(b.height-a.height))}`, `${n(layer.n2)} s⁻²`, "正は乾燥静的安定、負は乾燥静的不安定。凝結や潜熱を含む湿潤安定度ではありません。"),
        step("風の鉛直変化", "シア = √[(Δu)²+(Δv)²]/Δz", `√[(${n(b.u-a.u)})²+(${n(b.v-a.v)})²] / ${n(b.height-a.height)}`, `${n(layer.shear)} s⁻¹`, "全層の風差は最上層−最下層のベクトル差です。N²とシアの層別値はCSVから確認できます。")];
    }
    case "thickness": return [step("気圧比を対数へ", "ln(p下/p上)", `ln(${n(p.lowerPressure)}/${n(p.upperPressure)})`, n(Math.log(p.lowerPressure/p.upperPressure)), "自然対数を使います。気圧の単位は上下で同じなら比で打ち消されます。"),
      step("静力学平衡から層厚へ", "Δz = Rd T̄v/g × ln(p下/p上)", `287.05 × ${n(p.meanVirtualTemperature)} / 9.80665 × ln(${n(p.lowerPressure)}/${n(p.upperPressure)})`, `${n(s.layerThickness)} m`, "平均仮温度は気温そのものではありません。湿度を含む仮温度のln(p)平均を与えます。")];
    case "geostrophic": return [...fSteps(), step("高度勾配の単位を変換", "m/100 km → m/m", `東：${n(p.gradientX)}/100000、北：${n(p.gradientY)}/100000`, `∂Z/∂x=${n(p.gradientX/100000)}、∂Z/∂y=${n(p.gradientY/100000)}`, "xは東、yは北。入力は気圧勾配ではなく等圧面の高度勾配です。"),
      step("地衡風の成分と速さ", "ug = −g/f · ∂Z/∂y、vg = g/f · ∂Z/∂x、速さ = √(ug²+vg²)", `ug = −9.80665/${n(s.coriolisParameter)} × ${n(p.gradientY/100000)}、vg = 9.80665/${n(s.coriolisParameter)} × ${n(p.gradientX/100000)}`, `u=${n(s.u)}、v=${n(s.v)}、速さ=${n(s.windSpeed)} m/s`, "実際の風には非地衡風成分、摩擦、曲率の効果があります。")];
    case "thermalWind": return [...fSteps(), step("気圧座標で温度風関係を積分", "Δu = Rd/f · Ty · ln(p上/p下)、Δv = −Rd/f · Tx · ln(p上/p下)", `Rd/f = 287.05/${n(s.coriolisParameter)}、Ty=${n(p.temperatureGradientY/100000)} K/m、Tx=${n(p.temperatureGradientX/100000)} K/m、ln比=${n(Math.log(p.upperPressure/p.lowerPressure))}`, `Δu=${n(s.deltaU)}、Δv=${n(s.deltaV)} m/s`, "高度が上がるとln(p上/p下)は負になります。温度勾配の符号に注意してください。"),
      step("下層地衡風へ差を加える", "u上=u下+Δu、v上=v下+Δv", `${n(p.lowerU)} + (${n(s.deltaU)})、${n(p.lowerV)} + (${n(s.deltaV)})`, `u上=${n(s.upperU)}、v上=${n(s.upperV)} m/s`, "温度風は単独の実際の風ではなく、上下の地衡風の差です。")];
    case "coriolis": return [...fSteps(), step("慣性周期と半径", "周期=2π/|f|、半径=U/|f|", `2π/|${n(s.coriolisParameter)}|、${n(p.velocity)}/|${n(s.coriolisParameter)}|`, `${n(s.inertialPeriodHours)} h、${n(s.inertialRadius)} m`, "周期は秒から時間へ換算しています。グラフはu=Ucos(ft)、v=−Usin(ft)です。"),
      step("移流と回転の比を求める", "Ro = U/(|f|L)", `${n(p.velocity)} / (|${n(s.coriolisParameter)}| × ${n(p.length)})`, n(s.rossbyNumber), "Rossby数は無次元です。小さいほど、代表スケールで回転の影響が相対的に強くなります。")];
    case "radiation": return [step("全波長の放射を積分した発散度", "F = εσT⁴", `${n(p.emissivity)} × 5.670374419×10⁻⁸ × ${n(p.temperatureK)}⁴`, `${n(s.emittedFlux)} W/m²`, "Planck分布を全波長・半球に積分した値です。グラフの縦軸の放射輝度とは単位も意味も異なります。"),
      step("波長領域でのピーク", "λmax = 2897.771955/T", `2897.771955/${n(p.temperatureK)}`, `${n(s.peakWavelength)} µm`, "一定放射率での波長別Planck分布のピーク。放射率0の場合は黒体の参照値です。"),
      step("正味の放射収支", "正味 = 吸収済み流入 − 放出", `${n(p.incomingFlux)} − ${n(s.emittedFlux)}`, `${n(s.netRadiativeFlux)} W/m²`, "正は加熱側、負は冷却側。流入値には反射前の入射放射ではなく、吸収済みの値を入力します。")];
    case "transport": {
      const first = result.firstStep;
      return [step("格子と無次元数", "Δx=L/N、C=|u|Δt/Δx、D=κΔt/Δx²", `Δx=${n(p.length)}/${p.cells}=${n(p.dx)} m、C=${n(s.courant)}、D=${n(s.diffusionNumber)}`, `C+2D=${n(s.stabilityNumber)}`, "C+2D≤1で非負の更新係数を保ちます。最後のステップは終了時刻に合わせて短縮します。"),
        step("風上差分と中心差分で更新", "φ次 = φ − C(φ−φ風上) + D(φ左−2φ+φ右)", `格子${first.index}：${n(first.center)} − ${n(first.courant)}×(${n(first.center)}−${n(p.velocity>=0?first.left:first.right)}) + ${n(first.diffusionNumber)}×(${n(first.left)}−2×${n(first.center)}+${n(first.right)})`, n(first.next), "実際の最初のステップを例示しています。風が負なら右隣が風上。領域端は反対端につながる周期境界です。"),
        step("参照解と誤差を比較", "RMSE = √[Σ(数値解−参照解)²/N]", `終了時刻${n(p.duration)} s、${p.cells}格子で評価`, n(s.rmse), "参照解では各Fourierモードをexp(−κk²t)で減衰、位相をutだけ移動させます。1次風上差分による数値粘性は物理拡散とは別です。")];
    }
    case "oscillator": {
      const k = result.firstStep;
      return [step("2階方程式を1階の連立系にする", "z'=v、v'=−2ζωv−ω²z", `ω=${n(p.frequency)}、ζ=${n(p.damping)}、z₀=${n(p.displacement)}、v₀=${n(p.initialVelocity)}`, `初期加速度=${n(k.a1)} m/s²`, "ωは角振動数。周期は2π/ωで、周波数Hzそのものではありません。"),
        step("RK4の4段階", "k1=F(y)、k2=F(y+h k1/2)、k3=F(y+h k2/2)、k4=F(y+h k3)", `h=${n(k.h)} s。k1=(${n(k.v)}, ${n(k.a1)})、k2=(${n(k.v2)}, ${n(k.a2)})、k3=(${n(k.v3)}, ${n(k.a3)})、k4=(${n(k.v4)}, ${n(k.a4)})`, "各組の第1成分はm/s、第2成分はm/s²", "中間時刻・中間状態で傾きを再評価しています。実際に計算した最初の1ステップの値です。"),
        step("重み付き平均で次の状態へ", "y次 = y + h(k1+2k2+2k3+k4)/6", `初期状態(${n(k.z)}, ${n(k.v)})に4つの傾きの加重和を加える`, `z=${n(k.zNext)} m、v=${n(k.vNext)} m/s`, `全${s.steps}ステップで解析解と比較。最大変位誤差=${n(s.maxDisplacementError)} m。計算刻みを小さくした収束確認も必要です。`)];
    }
    default: throw new Error("解説が未定義の計算です。");
  }
}
