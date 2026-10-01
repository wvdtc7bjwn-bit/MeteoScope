// Fixed, inspectable templates: no user text is interpolated as executable code.
export function buildNumericalPython(result) {
  const payload = { type: result.type, input: ["profile", "waterColumn", "richardson"].includes(result.type) ? { rows: result.rows.map(({ pressure, height, temperature, humidity, u, v }) => ({ pressure, height, temperature, humidity, u, v })) } : result.input };
  return `# MeteoScope numerical calculation v1
# Python 3.10+. Plotting: python -m pip install matplotlib
# Calculation uses standard library only. Optional: --no-plot --no-save
# Units: pressure hPa, temperature Celsius (converted internally to K),
# height/length m, time s, wind m/s, diffusivity m^2/s, humidity percent.
# Reproduce the browser's approximations, not a validated forecast model.
import math, json, csv, sys
config = json.loads(${JSON.stringify(JSON.stringify(payload))})
RD, CP, EPSILON, G = 287.05, 1004.0, 0.622, 9.80665
def theta(t, p):
    return (t + 273.15) * (1000 / p) ** (RD / CP)
def dewpoint(t, rh):
    gamma = math.log(rh / 100) + 17.625 * t / (243.04 + t)
    return 243.04 * gamma / (17.625 - gamma)
LV = 2.5e6
def moisture(t, pressure, rh):
    e = 6.1094 * math.exp(17.625*t/(243.04+t)) * rh/100
    if e >= pressure: raise ValueError('Vapour pressure must be below total pressure')
    r = EPSILON*e/(pressure-e)
    return e, r, r/(1+r)
def lcl(t, td, pressure):
    tk, tdk = t+273.15, min(td,t)+273.15
    tl = 1/(1/(tdk-56)+math.log(tk/tdk)/800)+56
    return tl-273.15, pressure*(tl/tk)**(CP/RD)
def liquid_adiabat(t0, p0, end, step=1):
    def derivative(t,p):
        if not 150 <= t <= 340: raise ValueError('Temperature outside integration range')
        _, r, _ = moisture(t-273.15,p,100)
        return t/p*(RD+LV*r/t)/(CP+LV**2*r*EPSILON/(RD*t*t))
    t, pressure = t0+273.15, p0
    output = [dict(pressure=pressure,temperature=t0)]
    count = math.ceil(abs(end-p0)/step)
    for i in range(count):
        h = (1 if end > p0 else -1)*min(step,abs(end-pressure))
        k1 = derivative(t,pressure)
        k2 = derivative(t+h*k1/2,pressure+h/2)
        k3 = derivative(t+h*k2/2,pressure+h/2)
        k4 = derivative(t+h*k3,pressure+h)
        t += h*(k1+2*k2+2*k3+k4)/6
        pressure = end if i == count-1 else pressure+h
        if not 150 <= t <= 340: raise ValueError('Temperature outside integration range')
        output.append(dict(pressure=pressure,temperature=t-273.15))
    return output
p = config['input']
kind = config['type']
layers = []
if kind in ['moist','lcl']:
    t, pressure, rh = p['temperature'], p['pressure'], p['humidity']
    td = dewpoint(t,rh)
    tl_c, pl = lcl(t,td,pressure)
    if rh == 100: tl_c, pl = t, pressure
    tk, tl = t+273.15, tl_c+273.15
    if kind == 'lcl':
        summary = dict(dewPoint=td,lclTemperature=tl_c,lclPressure=pl,lclHeight=CP/G*(tk-tl))
        rows = []
        for i in range(81):
            level = pressure*(pl/pressure)**(i/80)
            temp = tk*(level/pressure)**(RD/CP)-273.15
            rows.append(dict(pressure=level,temperature=temp,height=CP/G*(t-temp)))
        charts = [('Dry ascent to LCL (height relative to start)', 'Temperature (C)', 'Height difference (m)', False,
                   [('Dry parcel',[(r['temperature'],r['height']) for r in rows])])]
    else:
        if p['topPressure'] >= pl: raise ValueError('Top pressure must be below LCL pressure')
        e, ratio, _ = moisture(t,pressure,rh)
        theta_dl = tk*(1000/(pressure-e))**(RD/CP)*(tk/tl)**(.28*ratio)
        theta_e = theta_dl*math.exp((3036/tl-1.78)*ratio*(1+.448*ratio))
        tw = liquid_adiabat(tl_c,pl,pressure)[-1]['temperature']
        dry = []
        for i in range(41):
            level = pressure*(pl/pressure)**(i/40)
            dry.append(dict(pressure=level,phase=0,temperature=tk*(level/pressure)**(RD/CP)-273.15))
        saturated = liquid_adiabat(tl_c,pl,p['topPressure'])
        rows = dry+[dict(r,phase=1) for r in saturated[1:]]
        summary = dict(equivalentPotentialTemperature=theta_e,wetBulbTemperature=tw,dewPoint=td,lclTemperature=tl_c,lclPressure=pl)
        charts = [('Idealized parcel ascent: liquid water, constant latent heat', 'Temperature (C)', 'Pressure (hPa)', True,
                   [('Dry to LCL',[(r['temperature'],r['pressure']) for r in dry]),
                    ('Liquid pseudo-adiabat',[(r['temperature'],r['pressure']) for r in saturated])])]
elif kind == 'waterColumn':
    rows = []
    for row in p['rows']:
        _, _, q = moisture(row['temperature'],row['pressure'],row['humidity'])
        rows.append(dict(row,specificHumidity=q,specificHumidityGKg=q*1000,
                         moistStaticEnergy=CP*(row['temperature']+273.15)+G*row['height']+LV*q))
    cumulative = 0
    for lower, upper in zip(rows,rows[1:]):
        delta_p = (lower['pressure']-upper['pressure'])*100
        water = (lower['specificHumidity']+upper['specificHumidity'])/2*delta_p/G
        cumulative += water
        layers.append(dict(pressure=upper['pressure'],deltaPressure=delta_p,water=water,cumulative=cumulative))
    summary = dict(levels=len(rows),precipitableWater=cumulative,bottomPressure=rows[0]['pressure'],topPressure=rows[-1]['pressure'])
    charts = [('Specific humidity', 'q (g/kg)', 'Pressure (hPa)', True,
               [('Liquid-water convention',[(r['specificHumidityGKg'],r['pressure']) for r in rows])]),
              ('Cumulative water: input bounds only', 'Water (mm)', 'Pressure (hPa)', True,
               [('Integrated q dp/g',[(0,rows[0]['pressure'])]+[(r['cumulative'],r['pressure']) for r in layers])]),
              ('Moist static energy', 'Energy (kJ/kg)', 'Height (m)', False,
               [('cp T + g z + Lv q',[(r['moistStaticEnergy']/1000,r['height']) for r in rows])])]
elif kind == 'thermal':
    t, pressure, rh = p['temperature'], p['pressure'], p['humidity']
    e = 6.1094 * math.exp(17.625 * t / (243.04 + t)) * rh / 100
    r = EPSILON * e / (pressure - e)
    tv = (t + 273.15) * (1 + r / EPSILON) / (1 + r)
    th = theta(t, pressure)
    summary = dict(potentialTemperature=th, dewPoint=dewpoint(t, rh),
                   mixingRatio=r * 1000, specificHumidity=r / (1 + r) * 1000,
                   virtualTemperature=tv, density=pressure * 100 / (RD * tv))
    rows = [dict(pressure=1000-i*10, temperature=th*((1000-i*10)/1000)**(RD/CP)-273.15) for i in range(91)]
    charts = [('Dry adiabat (unsaturated assumption)', 'Temperature (C)', 'Pressure (hPa)', True,
               [('Dry adiabat', [(r['temperature'], r['pressure']) for r in rows])])]
elif kind in ['profile','richardson']:
    rows = [dict(r, theta=theta(r['temperature'], r['pressure']),
                 dewPoint=dewpoint(r['temperature'], r['humidity'])) for r in p['rows']]
    for lower, upper in zip(rows, rows[1:]):
        dz = upper['height'] - lower['height']
        layers.append(dict(height=(upper['height']+lower['height'])/2,
                           n2=G/((upper['theta']+lower['theta'])/2)*(upper['theta']-lower['theta'])/dz,
                           shear=math.hypot(upper['u']-lower['u'], upper['v']-lower['v'])/dz))
    summary = dict(levels=len(rows), minN2=min(r['n2'] for r in layers), maxN2=max(r['n2'] for r in layers),
                   bulkWindDifference=math.hypot(rows[-1]['u']-rows[0]['u'], rows[-1]['v']-rows[0]['v']))
    charts = [('Temperature / dew point', 'Temperature (C)', 'Pressure (hPa)', True,
               [(key, [(r[key], r['pressure']) for r in rows]) for key in ['temperature', 'dewPoint']]),
              ('Potential temperature', 'Potential temperature (K)', 'Height (m)', False,
               [('theta', [(r['theta'], r['height']) for r in rows])]),
              ('Dry static stability', 'N^2 (s^-2)', 'Mid-layer height (m)', False,
               [('N^2', [(r['n2'], r['height']) for r in layers])]),
              ('Wind components', 'Wind (m/s)', 'Height (m)', False,
               [(key, [(r[key], r['height']) for r in rows]) for key in ['u', 'v']])]
    if kind == 'richardson':
        for layer in layers:
            layer['richardson'] = None if layer['shear'] <= 1e-12 else layer['n2']/layer['shear']**2
        finite = [r['richardson'] for r in layers if r['richardson'] is not None]
        summary = dict(levels=len(rows),minRichardson=min(finite) if finite else None,undefinedLayers=len(layers)-len(finite))
        charts = [('Dry gradient Richardson number (missing where shear is zero)', 'Ri', 'Mid-layer height (m)', False,
                   [('Dry Ri',[(r['richardson'],r['height']) for r in layers]),
                    ('Reference 0.25',[(.25,r['height']) for r in layers])])]+charts[2:]
elif kind == 'thickness':
    lo, hi, tv = p['lowerPressure'], p['upperPressure'], p['meanVirtualTemperature']
    rows = []
    for i in range(81):
        pressure = lo*(hi/lo)**(i/80)
        rows.append(dict(pressure=pressure, height=RD*tv/G*math.log(lo/pressure)))
    summary = dict(layerThickness=RD*tv/G*math.log(lo/hi))
    charts = [('Hypsometric equation', 'Pressure (hPa)', 'Height above lower level (m)', False,
               [('constant mean Tv', [(r['pressure'], r['height']) for r in rows])])]
elif kind in ['geostrophic', 'thermalWind', 'coriolis']:
    f = 2*7.292115e-5*math.sin(p['latitude']*math.pi/180)
    if kind == 'geostrophic':
        gx, gy = p['gradientX'], p['gradientY']
        u, v = -G/f*gy/100000, G/f*gx/100000
        summary = dict(coriolisParameter=f, u=u, v=v, windSpeed=math.hypot(u,v))
        rows = [dict(distance=(i-20)*10000, heightX=gx*(i-20)/10, heightY=gy*(i-20)/10) for i in range(41)]
        charts = [('Geopotential height gradients', 'Distance (m)', 'Height difference (m)', False,
                   [(key, [(r['distance'], r[key]) for r in rows]) for key in ['heightX','heightY']])]
    elif kind == 'thermalWind':
        rows = []
        for i in range(81):
            pressure = p['lowerPressure']*(p['upperPressure']/p['lowerPressure'])**(i/80)
            scale = RD/f*math.log(pressure/p['lowerPressure'])/100000
            rows.append(dict(pressure=pressure, u=p['lowerU']+scale*p['temperatureGradientY'], v=p['lowerV']-scale*p['temperatureGradientX']))
        summary = dict(coriolisParameter=f, deltaU=rows[-1]['u']-p['lowerU'], deltaV=rows[-1]['v']-p['lowerV'], upperU=rows[-1]['u'], upperV=rows[-1]['v'])
        charts = [('Thermal wind', 'Wind (m/s)', 'Pressure (hPa)', True,
                   [(key, [(r[key], r['pressure']) for r in rows]) for key in ['u','v']])]
    else:
        period = 2*math.pi/abs(f)
        rows = [dict(timeHours=period*i/120/3600, u=p['velocity']*math.cos(f*period*i/120), v=-p['velocity']*math.sin(f*period*i/120)) for i in range(121)]
        summary = dict(coriolisParameter=f, inertialPeriodHours=period/3600, inertialRadius=p['velocity']/abs(f), rossbyNumber=p['velocity']/(abs(f)*p['length']))
        charts = [('Free inertial oscillation', 'Time (h)', 'Wind (m/s)', False,
                   [(key, [(r['timeHours'], r[key]) for r in rows]) for key in ['u','v']])]
elif kind == 'radiation':
    t, eps = p['temperatureK'], p['emissivity']
    emitted = eps*5.670374419e-8*t**4
    summary = dict(emittedFlux=emitted, netRadiativeFlux=p['incomingFlux']-emitted, peakWavelength=2897.771955/t)
    rows = []
    for i in range(197):
        wavelength = 2+i*.5
        lam = wavelength*1e-6
        radiance = eps*2*6.62607015e-34*299792458**2/(lam**5*math.expm1(6.62607015e-34*299792458/(lam*1.380649e-23*t)))*1e-6
        rows.append(dict(wavelength=wavelength, radiance=radiance))
    charts = [('Graybody spectral radiance', 'Wavelength (micrometre)', 'W / m^2 / sr / micrometre', False,
               [('radiance', [(r['wavelength'],r['radiance']) for r in rows])])]
elif kind == 'oscillator':
    w, damping, z, v = p['frequency'], p['damping'], p['displacement'], p['initialVelocity']
    dt, duration = p['dt'], p['duration']
    steps = math.ceil(duration/dt)
    if w*dt > .2 or steps > 20000: raise ValueError('Accuracy or step budget exceeded')
    def reference_at(t):
        z0, v0 = p['displacement'], p['initialVelocity']
        if abs(damping-1) < 1e-10: return math.exp(-w*t)*(z0+(v0+w*z0)*t)
        if damping < 1:
            wd = w*math.sqrt(1-damping**2)
            return math.exp(-damping*w*t)*(z0*math.cos(wd*t)+(v0+damping*w*z0)/wd*math.sin(wd*t))
        a, b = w*(-damping+math.sqrt(damping*damping-1)), w*(-damping-math.sqrt(damping*damping-1))
        c = (v0-b*z0)/(a-b)
        return c*math.exp(a*t)+(z0-c)*math.exp(b*t)
    def acceleration(z,v): return -2*damping*w*v-w*w*z
    rows = [dict(time=0, numerical=z, reference=z, velocity=v)]
    square_error, max_error = 0, 0
    for i in range(steps):
        h = min(dt,duration-i*dt)
        a1 = acceleration(z,v)
        v2 = v+h*a1/2
        a2 = acceleration(z+h*v/2,v2)
        v3 = v+h*a2/2
        a3 = acceleration(z+h*v2/2,v3)
        v4 = v+h*a3
        a4 = acceleration(z+h*v3,v4)
        z += h/6*(v+2*v2+2*v3+v4)
        v += h/6*(a1+2*a2+2*a3+a4)
        time = min((i+1)*dt,duration)
        reference = reference_at(time)
        error = abs(z-reference)
        square_error += error*error
        max_error = max(max_error,error)
        if (i+1)%max(1,math.ceil(steps/300)) == 0 or i+1 == steps:
            rows.append(dict(time=time,numerical=z,reference=reference,velocity=v))
    summary = dict(naturalPeriodSeconds=2*math.pi/w,steps=steps,displacementRmse=math.sqrt(square_error/steps),maxDisplacementError=max_error)
    charts = [('Damped oscillator: RK4 / exact', 'Time (s)', 'Displacement (m)', False,
               [(key,[(r['time'],r[key]) for r in rows]) for key in ['numerical','reference']])]
elif kind == 'transport':
    L, n, u, kappa = p['length'], p['cells'], p['velocity'], p['diffusivity']
    dt, duration, sigma, dx = p['dt'], p['duration'], p['sigma'], p['dx']
    c, d = abs(u)*dt/dx, kappa*dt/dx**2
    steps = math.ceil(duration / dt)
    if c + 2*d > 1 + 1e-12 or steps > 20000:
        raise ValueError('Stability or step budget exceeded')
    def reference_at(x, time):
        mean = math.sqrt(2*math.pi)*sigma/L
        return mean + sum(2*mean*math.exp(-0.5*(sigma*2*math.pi*m/L)**2-kappa*(2*math.pi*m/L)**2*time)
                          * math.cos(2*math.pi*m/L*(x-L/4-u*time)) for m in range(1, n//2+1))
    x = [i*dx for i in range(n)]
    initial = [reference_at(position, 0) for position in x]
    field = initial[:]
    for step in range(steps):
        h = min(dt, duration-step*dt)
        c_step, d_step = abs(u)*h/dx, kappa*h/dx**2
        field = [v-c_step*(v-(field[(i-1)%n] if u >= 0 else field[(i+1)%n]))
                 + d_step*(field[(i-1)%n]-2*v+field[(i+1)%n]) for i, v in enumerate(field)]
    reference = [reference_at(position, duration) for position in x]
    rows = [dict(x=position, initial=initial[i], numerical=field[i], reference=reference[i]) for i, position in enumerate(x)]
    summary = dict(courant=c, diffusionNumber=d, stabilityNumber=c+2*d, steps=steps,
                   rmse=math.sqrt(sum((a-b)**2 for a, b in zip(field, reference))/n),
                   massChangePercent=(sum(field)-sum(initial))/sum(initial)*100)
    charts = [('Periodic 1D advection-diffusion', 'Position (m)', 'Normalized tracer', False,
               [(key, [(r['x'], r[key]) for r in rows]) for key in ['initial', 'numerical', 'reference']])]
print(json.dumps(dict(summary=summary, rows=rows, layers=layers), ensure_ascii=False, allow_nan=False))
if '--no-save' not in sys.argv:
    for name, data in [('results', rows), ('layers', layers)]:
        if data:
            with open('meteoscope_' + kind + '_' + name + '.csv', 'w', newline='', encoding='utf-8') as file:
                writer = csv.DictWriter(file, fieldnames=list(data[0]))
                writer.writeheader()
                writer.writerows(data)
if '--no-plot' not in sys.argv:
    try:
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(1, len(charts), figsize=(7*len(charts), 5), squeeze=False)
        for ax, (title, xlabel, ylabel, invert, series) in zip(axes[0], charts):
            for label, points in series:
                ax.plot([v[0] for v in points], [v[1] for v in points], label=label)
            ax.set(title=title, xlabel=xlabel, ylabel=ylabel)
            if invert: ax.invert_yaxis()
            ax.grid(True, alpha=0.3)
            ax.legend()
        fig.tight_layout()
        fig.savefig('meteoscope_' + kind + '.png', dpi=180)
        plt.show()
    except ImportError:
        print('Plotting requires: python -m pip install matplotlib', file=sys.stderr)
`;
}
