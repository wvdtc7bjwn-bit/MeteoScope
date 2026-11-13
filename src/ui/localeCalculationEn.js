export const CALCULATION_EN_ENTRIES = `
θ = T(1000/p)^(Rd/cp)。露点・水蒸気圧はMagnus式（液水基準）、r = εe/(p−e)、q = r/(1+r)、ρ = p/(Rd Tv)。TはK、pは式に応じhPa/Paへ変換。乾燥断熱線は凝結・潜熱を無視した仮想経路です。低温では氷面基準と異なり、Magnus近似の誤差が増えます。¦θ = T(1000/p)^(Rd/cp). Dew point and vapor pressure use the Magnus formula over liquid water: r = εe/(p−e), q = r/(1+r), ρ = p/(Rd Tv). T is in K; convert p to hPa or Pa as required. The dry adiabat is an idealized path without condensation or latent heat. At low temperatures it differs from ice saturation, and Magnus approximation errors increase.
入力気塊の乾燥断熱線¦Dry adiabat of input parcel
乾燥断熱線（未飽和の仮定）¦Dry adiabat (assumed unsaturated)
∂φ/∂t + u ∂φ/∂x = κ ∂²φ/∂x²。一定u・κ、周期境界、周期ガウス初期値。時間は陽的Euler、移流は1次風上差分、拡散は2次中心差分。C = |u|Δt/Δx、D = κΔt/Δx²、安定条件C+2D≤1。参照解は周期ガウスのFourier級数（格子数/2まで）。数値粘性・格子解像度による誤差があります。実際の天気予報モデルではありません。¦∂φ/∂t + u ∂φ/∂x = κ ∂²φ/∂x² with constant u and κ, periodic boundaries and a periodic Gaussian initial profile. Explicit Euler in time, first-order upwind advection and second-order centered diffusion. C = |u|Δt/Δx, D = κΔt/Δx²; stability condition C+2D≤1. The reference uses a Fourier series up to half the grid count. Numerical diffusion and grid resolution introduce errors. This is not an operational weather model.
Bolton近似のLCL温度と乾燥Poisson式から気圧を求める。高度差はcp(T−TL)/g、乾燥断熱・一定重力・気塊温度を用いる理想化近似。高度は出発点基準で海抜高度ではなく、実際の雲底の観測値や雲発生の保証でもありません。RH・露点は液水基準。¦Pressure uses the Bolton LCL-temperature approximation and dry Poisson equation. Height difference cp(T−TL)/g assumes dry adiabatic ascent, constant gravity and parcel temperature. Height is relative to the starting point, not sea level, and is neither an observed cloud base nor a guarantee of cloud formation. RH and dew point refer to liquid water.
Ri=N²/[(Δu/Δz)²+(Δv/Δz)²]。隣接層差分・平均乾燥温位による有限層の勾配近似で、bulk Richardson数ではありません。シア≤10⁻¹² s⁻¹は未定義（CSV空欄・JSON null）とし、グラフの線を切ります。0.25は理想的な平行・安定成層流の参照値で、乱流の発生・不発生を断定する閾値ではありません。乾燥不安定層ではRiが負になり、湿潤対流・鉛直解像度の影響にも注意が必要です。¦Ri=N²/[(Δu/Δz)²+(Δv/Δz)²]. A finite-layer gradient approximation using adjacent levels and mean dry potential temperature, not bulk Richardson number. Shear ≤10⁻¹² s⁻¹ is undefined (blank CSV / JSON null) and breaks the plotted line. The reference 0.25 applies to idealized parallel, stably stratified flow; it does not determine whether turbulence occurs. Ri can be negative in dry-unstable layers; moist convection and vertical resolution also affect interpretation.
z''+2ζωz'+ω²z=0を古典的4次Runge–Kuttaで解く。ωは角振動数(rad/s)、ζは減衰比。ωΔt≤0.2を精度目安として制限。解析解は不足減衰・臨界減衰・過減衰に対応。ω=Nと置けば乾燥安定成層の小振幅浮力振動の理想化例（一定N）。出力は最大約300時刻、誤差は全ステップで評価。¦Solve z''+2ζωz'+ω²z=0 using classical fourth-order Runge–Kutta. ω is angular frequency (rad/s), ζ the damping ratio. Enforce ωΔt≤0.2 as an accuracy guideline. Analytical solutions cover underdamped, critically damped and overdamped cases. Setting ω=N gives an idealized small-amplitude buoyancy oscillation in dry stable stratification with constant N. Output is limited to about 300 times; errors use every step.
相当温位はBolton近似。湿球温度はNormand法（LCLへ乾燥上昇後、液水擬似断熱で元の気圧へ下降）。湿潤経路はdT/dp=T/p·(Rd+Lv rs/T)/(cp+Lv²rs ε/(Rd T²))をRK4・最大1 hPa刻みで積分。液水Magnus飽和式、一定Lv=2.5×10⁶ J/kg、凝結物は除去。氷相・混合・放射・降水負荷を含まず、低温は過冷却液水の理想化です。MetPyの定数・飽和式とは異なります。CSV phase:0=乾燥、1=飽和。¦Equivalent potential temperature uses Bolton's approximation. Wet-bulb temperature uses Normand's method: dry ascent to the LCL, then liquid-water pseudoadiabatic descent to the original pressure. Integrate dT/dp=T/p·(Rd+Lv rs/T)/(cp+Lv²rs ε/(Rd T²)) with RK4 and steps ≤1 hPa. Uses liquid-water Magnus saturation, constant Lv=2.5×10⁶ J/kg and condensate removal. Excludes ice, mixing, radiation and precipitation loading; cold conditions idealize supercooled water. Constants and saturation formulas differ from MetPy. CSV phase: 0=dry, 1=saturated.
測高公式 Δz = Rd T̄v/g · ln(p下/p上)。T̄vはln(p)について平均した仮温度（K）。一定重力・静力学平衡を仮定。グラフは仮温度一定の仮想鉛直分布で、実際の気温プロファイルではありません。¦Hypsometric equation: Δz = Rd T̄v/g · ln(p_lower/p_upper). T̄v is virtual temperature (K) averaged over ln(p). Assumes constant gravity and hydrostatic balance. The graph is an idealized constant-virtual-temperature profile, not an observed temperature profile.
Δug = Rd/f · ∂T/∂y · ln(p上/p下)、Δvg = −Rd/f · ∂T/∂x · ln(p上/p下)。温度勾配（K/100 km）とfを層内で一定とする静力学・地衡風近似。下層の入力は地衡風成分。湿度・摩擦・曲率は無視。|緯度|≥5°。¦Δug = Rd/f · ∂T/∂y · ln(p_upper/p_lower), Δvg = −Rd/f · ∂T/∂x · ln(p_upper/p_lower). Hydrostatic/geostrophic approximation with constant layer temperature gradients (K/100 km) and f. Lower-level inputs are geostrophic components. Humidity, friction and curvature are ignored. |latitude|≥5°.
放射発散度 F = εσT⁴（全波長・半球積分）、Wien則 λmax = 2897.77/T µm。グラフはPlanckの分光放射輝度に一定放射率εを掛けた灰色体（ε=1なら黒体）。放射収支は吸収済み流入−放出で、正は加熱側。大気の吸収帯・雲・顕熱・潜熱は含みません。ε=0ではスペクトルピークを定義できないため、Wien値は黒体の参照値です。¦Radiant exitance F = εσT⁴ (integrated over all wavelengths and a hemisphere); Wien's law λmax = 2897.77/T µm. The plot multiplies Planck spectral radiance by constant emissivity ε (ε=1 is a blackbody). Net radiation is absorbed incoming minus emitted, positive for heating. Atmospheric absorption bands, clouds, sensible and latent heat are excluded. For ε=0 no spectral peak is defined, so the Wien value is a blackbody reference.
2階方程式を1階の連立系にする¦Convert the second-order equation into a first-order system
C+2D≤1で非負の更新係数を保ちます。最後のステップは終了時刻に合わせて短縮します。¦C+2D≤1 keeps update coefficients nonnegative. The last step is shortened to end at the specified time.
CSVは100 KB以内で入力してください。¦CSV input must be 100 KB or less.
LCLでの乾燥温位から相当温位へ¦From dry potential temperature at LCL to equivalent potential temperature
LCLまで乾燥断熱¦Dry adiabatic up to LCL
LCL以上・液水擬似断熱¦Liquid-water pseudoadiabatic above LCL
LCL前後の理想化した気塊上昇¦Idealized parcel ascent below and above LCL
ln(p下/p上)¦ln(p_lower/p_upper)
Magnus近似・液水基準です。RHは0〜1へ換算します。¦Magnus approximation over liquid water. Convert RH to the range 0–1.
N² = g/θ̄ × Δθ/Δz、θ̄ = (θ上+θ下)/2¦N² = g/θ̄ × Δθ/Δz, θ̄ = (θ_upper+θ_lower)/2
Planck分布・灰色体の放射輝度¦Planck spectrum and greybody radiance
Planck分布を全波長・半球に積分した値です。グラフの縦軸の放射輝度とは単位も意味も異なります。¦Integrated over all wavelengths and a hemisphere. Its units and meaning differ from the radiance on the graph's vertical axis.
Ri（無次元）¦Ri (dimensionless)
Ri=未定義（JSON null・CSV空欄）¦Ri=undefined (JSON null / blank CSV)
RK4・最大1 hPa刻み。湿球温度はLCLから元の気圧への擬似断熱下降（Normand法）。グラフは逆に上端まで上昇させます。液水のみ・Lv一定の近似で、MetPyの数値と完全一致するとは限りません。¦RK4 with steps ≤1 hPa. Wet-bulb temperature uses pseudoadiabatic descent from LCL to the starting pressure (Normand method); the graph instead ascends to the top. Liquid water only, constant Lv; results need not exactly match MetPy.
RK4の4段階¦Four RK4 stages
RK4数値解¦RK4 numerical solution
RMSE = √[Σ(数値解−参照解)²/N]¦RMSE = √[Σ(numerical−reference)²/N]
Rossby数は無次元です。小さいほど、代表スケールで回転の影響が相対的に強くなります。¦Rossby number is dimensionless. Smaller values indicate relatively stronger rotational effects at the chosen scale.
rは混合比で、g/kgではなくkg/kgで代入します。Boltonの近似式です。¦r is mixing ratio; substitute kg/kg, not g/kg. Uses Bolton's approximation.
S²≈0のため割り算しない¦Do not divide because S²≈0
u（東向き）¦u (eastward)
v（北向き）¦v (northward)
ug = −g/f · ∂Z/∂y、vg = g/f · ∂Z/∂x、速さ = √(ug²+vg²)¦ug = −g/f · ∂Z/∂y, vg = g/f · ∂Z/∂x, speed = √(ug²+vg²)
u上=u下+Δu、v上=v下+Δv¦u_upper=u_lower+Δu, v_upper=v_lower+Δv
xは東、yは北。入力は気圧勾配ではなく等圧面の高度勾配です。¦x is east and y is north. Inputs are height gradients on a pressure surface, not pressure gradients.
y次 = y + h(k1+2k2+2k3+k4)/6¦y_next = y + h(k1+2k2+2k3+k4)/6
ここでは最下層とその上の層を例示しています。高度や気圧の順序が不正なデータは計算しません。¦This example uses the lowest two levels. Data with invalid height or pressure ordering is not calculated.
シア = √[(Δu)²+(Δv)²]/Δz¦Shear = √[(Δu)²+(Δv)²]/Δz
すべての入力層に同じ式を適用します。¦Apply the same equation to every input level.
位置 (m)¦Position (m)
位置 m / トレーサー量 無次元 / C,D,RMSE 無次元 / 総量変化 %¦Position m / tracer dimensionless / C,D,RMSE dimensionless / total mass change %
移流と回転の比を求める¦Calculate the ratio of advection to rotation
緯度からコリオリ係数を求める¦Calculate the Coriolis parameter from latitude
緯度をラジアンへ変換して計算します。南半球ではfの符号が負になります。¦Convert latitude to radians. f is negative in the Southern Hemisphere.
一定放射率での波長別Planck分布のピーク。放射率0の場合は黒体の参照値です。¦Peak of the wavelength-based Planck spectrum at constant emissivity. At zero emissivity, a blackbody reference is shown.
液水基準の比湿¦Specific humidity over liquid water
鉛直データは3〜300層、6列で入力してください。¦Enter a vertical profile with 3–300 levels and six columns.
温位 (K)¦Potential temperature (K)
温位と高度¦Potential temperature and height
温位は気塊を乾燥断熱的に1000 hPaへ移したときの温度です。¦Potential temperature is a parcel's temperature after dry adiabatic displacement to 1000 hPa.
温度 (°C)¦Temperature (°C)
温度風は単独の実際の風ではなく、上下の地衡風の差です。¦Thermal wind is the difference between upper and lower geostrophic winds, not a separate actual wind.
温度風関係からの地衡風変化¦Geostrophic wind change from the thermal-wind relation
下層地衡風へ差を加える¦Add the difference to the lower geostrophic wind
仮温度と密度¦Virtual temperature and density
解析解¦Analytical solution
解説が未定義の計算です。¦No explanation is defined for this calculation.
各組の第1成分はm/s、第2成分はm/s²¦First component of each pair: m/s; second: m/s²
各層の温位と露点¦Potential temperature and dew point at each level
各層の高さ・温位・風は層別CSVで確認できます。分母ゼロを0や有限値に置き換えません。¦Inspect level heights, potential temperature and wind in the layer CSV. Zero denominators are not replaced with zero or finite values.
各層の比湿を求める¦Calculate specific humidity at each level
格子と無次元数¦Grid and dimensionless numbers
乾燥Ri・未定義層は欠測¦Dry Ri; undefined layers shown as missing
乾燥温位・有限層差分の診断です。参照値0.25だけで乱流の有無を断定できません。未定義層をまたいでグラフの線をつなぎません。¦A diagnosis using dry potential temperature and finite-layer differences. The reference 0.25 alone does not determine turbulence. Lines do not bridge undefined layers.
乾燥気塊・LCLで終端¦Dry parcel; ends at LCL
乾燥静的安定度¦Dry static stability
乾燥断熱関係からLCL気圧へ¦LCL pressure from the dry adiabatic relation
乾燥断熱気塊・一定重力での近似。海抜高度ではありません。¦Dry adiabatic parcel and constant-gravity approximation. Not height above sea level.
慣性周期と半径¦Inertial period and radius
既存の高層解析と同じBolton近似。RH・露点は液水基準で、氷相を含みません。¦The same Bolton approximation as the upper-air analysis. RH and dew point refer to liquid water; ice is excluded.
気圧 hPa / 気温 °C / phase 0=乾燥・1=飽和¦Pressure hPa / temperature °C / phase 0=dry, 1=saturated
気圧 hPa / 気温 °C / 出発点からの高度差 m¦Pressure hPa / temperature °C / height above starting point m
気圧 hPa / 高度 m / 気温・露点 °C / 相対湿度 % / u,v m/s / 温位 K / N² s⁻² / シア s⁻¹¦Pressure hPa / height m / temperature and dew point °C / RH % / u,v m/s / potential temperature K / N² s⁻² / shear s⁻¹
気圧 hPa / 高度 m / 気温・露点 °C / 相対湿度 % / u,v m/s / 温位 K / N² s⁻² / シア s⁻¹ / Ri 無次元（空欄=未定義）¦Pressure hPa / height m / temperature and dew point °C / RH % / u,v m/s / potential temperature K / N² s⁻² / shear s⁻¹ / Ri dimensionless (blank=undefined)
気圧 hPa / 相対高度 m¦Pressure hPa / relative height m
気圧 hPa / Δp Pa / q kg/kg / q表示 g/kg / エネルギー J/kg / 層別・累積可降水量 mm¦Pressure hPa / Δp Pa / q kg/kg (displayed in g/kg) / energy J/kg / layer and cumulative precipitable water mm
気圧と下層からの相対高度¦Pressure and height above the lower level
気圧と高度を取り違えないでください。LCLは持ち上げた気塊が飽和する状態で、雲の発生や実際の雲底を保証しません。¦Do not confuse pressure and height. The LCL is where a lifted parcel becomes saturated; it does not guarantee cloud formation or the actual cloud base.
気圧座標で温度風関係を積分¦Integrate thermal wind in pressure coordinates
気圧比を対数へ¦Take the logarithm of the pressure ratio
気温・露点の鉛直分布¦Temperature and dew-point profile
規格化トレーサー量¦Normalized tracer amount
距離 (m)¦Distance (m)
距離 m / 高度差 m¦Distance m / height difference m
計算の種類が不正です。¦Invalid calculation type.
計算は20,000ステップまでです。時間刻みまたは終了時刻を調整してください。¦Maximum 20,000 steps. Adjust the time step or end time.
減衰振動：RK4と解析解¦Damped oscillation: RK4 and analytical solution
勾配Richardson数と適用条件¦Gradient Richardson number and applicability
高度 (m)¦Height (m)
高度が上がるとln(p上/p下)は負になります。温度勾配の符号に注意してください。¦ln(p_upper/p_lower) is negative when moving upward. Check the sign of the temperature gradient.
高度勾配の単位を変換¦Convert height-gradient units
高度差 (m)¦Height difference (m)
混合比ではなく比湿で静力学の圧力積分を行います。Magnus式・液水基準。¦Use specific humidity rather than mixing ratio for the hydrostatic pressure integral. Magnus formula over liquid water.
混合比と比湿¦Mixing ratio and specific humidity
参照解¦Reference solution
参照解では各Fourierモードをexp(−κk²t)で減衰、位相をutだけ移動させます。1次風上差分による数値粘性は物理拡散とは別です。¦Each reference Fourier mode decays by exp(−κk²t) and shifts by ut. Numerical diffusion from first-order upwinding is separate from physical diffusion.
参照解と誤差を比較¦Compare with the reference solution
参照線 0.25¦Reference line 0.25
時間 (h)¦Time (h)
時間 (s)¦Time (s)
時間 h / u,v m/s¦Time h / u,v m/s
時間 s / 変位 m / 速度 m/s¦Time s / displacement m / velocity m/s
自然対数を使います。気圧の単位は上下で同じなら比で打ち消されます。¦Use the natural logarithm. Pressure units cancel if the same units are used above and below.
自由な慣性振動・1周期¦Free inertial oscillation; one period
湿潤空気を同じ密度の乾燥空気として扱う温度が仮温度です。圧力をPaへ換算します。¦Virtual temperature is the temperature of dry air with the same density as the moist air. Convert pressure to Pa.
湿潤静的エネルギー¦Moist static energy
湿潤断熱積分が適用温度範囲（150〜340 K）を超えました。¦Moist adiabatic integration exceeded the valid temperature range (150–340 K).
湿潤断熱積分の温度が適用範囲外です。¦Moist adiabatic temperature is outside the valid range.
湿潤断熱積分の範囲が不正です。¦Invalid moist adiabatic integration range.
実際の最初のステップを例示しています。風が負なら右隣が風上。領域端は反対端につながる周期境界です。¦Shows the actual first step. With negative wind the right neighbor is upwind. Periodic boundaries connect opposite ends.
実際の風には非地衡風成分、摩擦、曲率の効果があります。¦Actual wind also includes ageostrophic components, friction and curvature effects.
周期=2π/|f|、半径=U/|f|¦Period=2π/|f|, radius=U/|f|
周期は秒から時間へ換算しています。グラフはu=Ucos(ft)、v=−Usin(ft)です。¦Period is converted from seconds to hours. The graph uses u=Ucos(ft), v=−Usin(ft).
重み付き平均で次の状態へ¦Weighted average to the next state
出発点からの高度 (m)¦Height above starting point (m)
出発点からの理想化した高度差¦Idealized height above starting point
初期値¦Initial condition
上層気圧は下層気圧より小さくしてください。¦Upper pressure must be lower than lower-level pressure.
水蒸気圧が全気圧以上です。入力条件を確認してください。¦Vapor pressure equals or exceeds total pressure. Check the inputs.
水蒸気量を保ったまま冷却して飽和する温度の近似です。¦An approximation of the temperature at saturation when cooling with constant water-vapor content.
数値解¦Numerical solution
正は加熱側、負は冷却側。流入値には反射前の入射放射ではなく、吸収済みの値を入力します。¦Positive means heating; negative means cooling. Enter absorbed incoming radiation, not incident radiation before reflection.
正は乾燥静的安定、負は乾燥静的不安定。凝結や潜熱を含む湿潤安定度ではありません。¦Positive means dry static stability; negative means dry static instability. This is not moist stability including condensation and latent heat.
正味 = 吸収済み流入 − 放出¦Net = absorbed incoming − emitted
正味の放射収支¦Net radiation balance
精度・計算量の制限：ωΔt≤0.2、20,000ステップ以内にしてください。¦Accuracy and computation limits: ωΔt≤0.2 and at most 20,000 steps.
静力学平衡から層厚へ¦Layer thickness from hydrostatic balance
絶対温度と温位¦Absolute and potential temperature
全層の風差は最上層−最下層のベクトル差です。N²とシアの層別値はCSVから確認できます。¦The profile wind difference is the top-minus-bottom vector difference. Inspect layer N² and shear in the CSV.
全層間でRiは未定義¦Ri is undefined between every pair of levels
全波長の放射を積分した発散度¦Exitance integrated over all wavelengths
層の中間高度 (m)¦Layer midpoint height (m)
層平均仮温度を一定とした静力学解¦Hydrostatic solution with constant layer-mean virtual temperature
相対高度 (m)¦Relative height (m)
第1層の例。高度の基準が変わると位置エネルギーの基準も変わります。¦Example for the first layer. Changing the height datum also changes the potential-energy reference.
地衡風の成分と速さ¦Geostrophic components and speed
中間時刻・中間状態で傾きを再評価しています。実際に計算した最初の1ステップの値です。¦Slopes are reevaluated at intermediate times and states. Values are from the actual first step.
東西断面¦East–west section
南北断面¦North–south section
内部ではkg/kg、表示時に1000倍しています。rは乾燥空気質量、qは湿潤空気全体の質量を分母に使います。¦Internally kg/kg; multiply by 1000 for display. r uses dry-air mass in the denominator; q uses total moist-air mass.
入力した等圧面高度勾配（原点からの差）¦Input pressure-surface height gradients (relative to origin)
入力下端からの累積可降水量¦Cumulative precipitable water from the input bottom
入力気塊からLCLまでの乾燥上昇¦Dry ascent from input parcel to LCL
入力範囲だけを合計する¦Integrate only over the input profile
入力範囲のみ¦Input profile only
波長 (µm)¦Wavelength (µm)
波長 µm / 放射輝度 W m⁻² sr⁻¹ µm⁻¹¦Wavelength µm / radiance W m⁻² sr⁻¹ µm⁻¹
波長領域でのピーク¦Peak in the wavelength spectrum
範囲外の水蒸気は未計算です。全気柱の値や実際に降る雨の量と同一ではありません。¦Water vapor outside the input range is excluded. This is not the full atmospheric column or an actual rainfall amount.
比湿 (g/kg)¦Specific humidity (g/kg)
比湿の鉛直分布¦Specific-humidity profile
非減衰固有周期¦Undamped natural period
浮力成層とシアを隣接層で差分¦Difference buoyancy stratification and shear across adjacent levels
風の鉛直変化¦Vertical wind variation
風上差分と中心差分で更新¦Update with upwind and centered differences
風速成分 (m/s)¦Wind components (m/s)
平均仮温度は気温そのものではありません。湿度を含む仮温度のln(p)平均を与えます。¦Mean virtual temperature is not air temperature alone. Provide a humidity-dependent virtual temperature averaged over ln(p).
変位 (m)¦Displacement (m)
変位 RMSE¦Displacement RMSE
変位の最大誤差¦Maximum displacement error
放射輝度 (W m⁻² sr⁻¹ µm⁻¹)¦Radiance (W m⁻² sr⁻¹ µm⁻¹)
放射発散度¦Radiant exitance
飽和経路を数値積分する¦Numerically integrate the saturated path
飽和水蒸気圧から実際の水蒸気圧へ¦From saturation to actual vapor pressure
未定義¦Undefined
隣接する2層の温位勾配¦Potential-temperature gradient across two adjacent levels
隣接層の水蒸気量を台形積分¦Trapezoidal integration of water vapor between adjacent levels
隣接層差分の勾配Richardson数¦Gradient Richardson number from adjacent-level differences
累積可降水量 (mm)¦Cumulative precipitable water (mm)
列：気圧(hPa), 高度(m), 気温(°C), 相対湿度(%・液水基準), u(m/s・東向き), v(m/s・北向き)。ヘッダーは下記サンプルの形式か、省略してください。高度は同じ基準を使ってください。¦Columns: pressure (hPa), height (m), temperature (°C), relative humidity (% over liquid water), u (m/s eastward), v (m/s northward). Use the sample header format below or omit the header. Use a consistent height datum.
露点からLCL温度へ¦From dew point to LCL temperature
露点を求める¦Calculate dew point
ΔPW=(q下+q上)/2 × Δp/g¦ΔPW=(q_lower+q_upper)/2 × Δp/g
ΔpはhPaからPaへ100倍。水密度1000 kg/m³なら1 kg/m²が1 mmです。¦Multiply Δp by 100 to convert hPa to Pa. At water density 1000 kg/m³, 1 kg/m² equals 1 mm.
Δu = Rd/f · Ty · ln(p上/p下)、Δv = −Rd/f · Tx · ln(p上/p下)¦Δu = Rd/f · Ty · ln(p_upper/p_lower), Δv = −Rd/f · Tx · ln(p_upper/p_lower)
Δz = Rd T̄v/g × ln(p下/p上)¦Δz = Rd T̄v/g × ln(p_lower/p_upper)
Δθ/Δz = (θ上−θ下)/(z上−z下)¦Δθ/Δz = (θ_upper−θ_lower)/(z_upper−z_lower)
ελ一定¦Constant ελ
θ = (t+273.15)(1000/p)^(Rd/cp)、TdはMagnus式¦θ = (t+273.15)(1000/p)^(Rd/cp), Td from Magnus formula
φ次 = φ − C(φ−φ風上) + D(φ左−2φ+φ右)¦φ_next = φ − C(φ−φ_upwind) + D(φ_left−2φ+φ_right)
ωは角振動数。周期は2π/ωで、周波数Hzそのものではありません。¦ω is angular frequency. Period is 2π/ω; ω is not frequency in Hz.
`.trim().split("\n").map((line) => line.split("¦"));
export const CALCULATION_EN_TRANSLATIONS = new Map(CALCULATION_EN_ENTRIES);
