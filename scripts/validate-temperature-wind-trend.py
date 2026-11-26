"""Offline bounded residual models. No evaluation fitting and no production activation."""
import json, sys, math, hashlib
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'.cache/temperature-wind-trend'
EVALUATE='--evaluation' in sys.argv

def metric(errors):
    a=np.array(errors,dtype=float);a=a[np.isfinite(a)];v=np.abs(a);n=len(a)
    return dict(count=n,mae=float(np.mean(v)) if n else None,rmse=float(np.sqrt(np.mean(a*a))) if n else None,
       bias=float(np.mean(a)) if n else None,p95=float(np.quantile(v,.95,method='inverted_cdf')) if n else None,
       p99=float(np.quantile(v,.99,method='inverted_cdf')) if n else None,max=float(np.max(v)) if n else None,
       above3C=int(sum(v>=3)),above5C=int(sum(v>=5)))

def subsets(rows):
    return {'pooled':np.ones(len(rows),dtype=bool),'morning':np.array([r['morning'] for r in rows]),
       'coastal':np.array([(r.get('sea') or 0)>=.1 for r in rows]),'mountain':np.array([r['elevation']>=800 for r in rows]),
       'outsideHull':np.array(['outside-station-hull' in r['flags'] for r in rows]),
       'reservedRegions':np.array([r['fold'] in [0,3] for r in rows]),
       **{'time:'+t:np.array([r['time']==t for r in rows]) for t in sorted(set(r['time'] for r in rows))}}

def summaries(rows,prediction):
    truth=np.array([r['observedC'] for r in rows]);return {k:metric((prediction-truth)[s]) for k,s in subsets(rows).items() if np.any(s)}

def passes(summary,baseline):
    reasons=[]
    for key,s in summary.items():
        keys=['mae','rmse'] if key.startswith('time:') else ['mae','rmse','p95','max']
        for m in keys:
            if s[m]>baseline[key][m]+1e-9:reasons.append(f'{key}:{m}')
    if summary['pooled']['mae']>=baseline['pooled']['mae']-1e-9:reasons.append('no-mean-improvement')
    return reasons

def fit(rows,columns,ridge):
    x=np.array([[r['features'][k] for k in columns] for r in rows]);y=np.clip(np.array([r['observedC']-r['baseline'] for r in rows]),-3,3)
    center=x.mean(axis=0);scale=x.std(axis=0);scale[scale<1e-8]=1
    z=np.clip((x-center)/scale,-5,5);z=np.column_stack([np.ones(len(z)),z]);n=z.shape[1]
    penalty=np.diag([0]+[ridge]*(n-1));beta=np.linalg.solve(z.T@z/len(z)+penalty,z.T@y/len(z))
    return {'columns':columns,'center':center.tolist(),'scale':scale.tolist(),'beta':beta.tolist(),'ridge':ridge,'trainCount':len(rows)}

def predict(rows,model):
    valid=np.array([r['features'] is not None for r in rows]);p=np.zeros(len(rows))
    if not np.any(valid):return p
    x=np.array([[r['features'][k] for k in model['columns']] for r in rows if r['features'] is not None])
    z=np.clip((x-np.array(model['center']))/np.array(model['scale']),-5,5)
    p[valid]=np.column_stack([np.ones(len(z)),z])@np.array(model['beta']);return p

def apply(rows,raw,strength,gate):
    usable=np.array([r['features'] is not None and (gate=='all' or r['morning']) for r in rows]);b=np.array([r['baseline'] for r in rows])
    return b+np.where(usable,np.clip(strength*raw,-1,1),0)

if '--self-test' in sys.argv:
    training=[{'features':{'x':x},'baseline':10.,'observedC':10.+x} for x in [-.5,0,.5]]
    model=fit(training,['x'],0)
    check=[{'features':{'x':.2},'baseline':10.,'observedC':999.,'morning':True},
       {'features':None,'baseline':10.,'observedC':-999.,'morning':True}]
    predicted=predict(check,model);assert abs(predicted[0]-.2)<1e-10 and predicted[1]==0
    check[0]['observedC']=-500;assert np.array_equal(predict(check,model),predicted)
    assert np.array_equal(apply(check,np.array([20.,20.]),1,'all'),np.array([11.,10.]))
    check[0]['morning']=False;assert np.array_equal(apply(check,np.array([20.,20.]),1,'morning'),np.array([10.,10.]))
    assert metric([-2,1])['mae']==1.5
    print('Residual fit/prediction, held-out truth independence, bounds and missing-feature guards passed')
    sys.exit(0)

data=json.loads((OUT/('evaluation-features.json' if EVALUATE else 'calibration-features.json')).read_text(encoding='utf-8'))
allrows=data['records'];rows=[r for r in allrows if r['kind']=='estimated' and (EVALUATE or r['fold'] not in [0,3])]
baseline=summaries(rows,np.array([r['baseline'] for r in rows]))
if not EVALUATE:
    groups=data['featureGroups'];columns={'static':groups['static'],'wind':groups['static']+groups['wind'],
      'trend':groups['static']+groups['trend'],'joint':sum(groups.values(),[])}
    times=sorted(set(r['time'] for r in rows));foldtime={t:min(2,i*3//len(times)) for i,t in enumerate(times)}
    candidates=[]
    for family,cols in columns.items():
        for ridge in [.1,1]:
            raw=np.zeros(len(rows))
            for fold in range(3):
                train=[r for r in rows if foldtime[r['time']]!=fold and r['features'] is not None]
                ids=[i for i,r in enumerate(rows) if foldtime[r['time']]==fold]
                model=fit(train,cols,ridge);raw[ids]=predict([rows[i] for i in ids],model)
            for strength in [.5,1]:
                for gate in ['all','morning']:
                    name=f'{family}/r{ridge}/s{strength}/{gate}';values=apply(rows,raw,strength,gate);s=summaries(rows,values)
                    candidates.append({'name':name,'family':family,'ridge':ridge,'strength':strength,'gate':gate,'summary':s,'failures':passes(s,baseline)})
    for family in ['legacy','advection30','advection60','trendPhysical']:
        raw=np.array([r['physics']['trend' if family=='trendPhysical' else family] for r in rows])
        for strength in [.5,1]:
            for gate in ['all','morning']:
                values=apply(rows,raw,strength,gate);s=summaries(rows,values)
                candidates.append({'name':f'{family}/s{strength}/{gate}','family':family,'strength':strength,'gate':gate,'summary':s,'failures':passes(s,baseline)})
    retained=[]
    for family in columns.keys()|{'legacy','advection30','advection60','trendPhysical'}:
        group=[c for c in candidates if c['family']==family];best=min(group,key=lambda c:(bool(c['failures']),c['summary']['pooled']['mae']))
        if family in columns:best={**best,'model':fit([r for r in rows if r['features'] is not None],columns[family],best['ridge'])}
        retained.append(best)
    # Morning-specific arms are predeclared because this is the user's primary failure regime.
    for family in ['wind','trend','joint']:
        group=[c for c in candidates if c['family']==family and c['gate']=='morning']
        best=min(group,key=lambda c:(bool(c['failures']),c['summary']['pooled']['mae']))
        if not any(c['name']==best['name'] for c in retained):
            retained.append({**best,'model':fit([r for r in rows if r['features'] is not None],columns[family],best['ridge'])})
    selection={'frozenAt':datetime.now(timezone.utc).isoformat(),'candidateCount':len(candidates),
       'design':'Three blocked time-fold OOF ranking; target regions 0 and 3 excluded; calibration gate failure means diagnostic comparison only.',
       'passingCandidates':[c['name'] for c in candidates if not c['failures']],'lockedCandidates':retained,
       'sourceFeatureSha256':hashlib.sha256((OUT/'calibration-features.json').read_bytes()).hexdigest(),
       'candidateCodeSha256':hashlib.sha256((ROOT/'scripts/temperatureWindTrendCandidates.mjs').read_bytes()).hexdigest()}
    (OUT/'selection.json').write_text(json.dumps(selection,indent=2),encoding='utf-8')
    report={'stage':'calibration','count':len(rows),'baseline':baseline,'candidates':candidates}
    print('passing',selection['passingCandidates'])
    for c in retained:print(c['name'],c['summary']['pooled'],'failures',len(c['failures']))
else:
    selection=json.loads((OUT/'selection.json').read_text(encoding='utf-8'));candidates=[];predictions={}
    if hashlib.sha256((ROOT/'scripts/temperatureWindTrendCandidates.mjs').read_bytes()).hexdigest()!=selection['candidateCodeSha256']:
        raise RuntimeError('Candidate code changed after selection')
    for c in selection['lockedCandidates']:
        raw=predict(rows,c['model']) if 'model' in c else np.array([r['physics']['trend' if c['family']=='trendPhysical' else c['family']] for r in rows])
        values=apply(rows,raw,c['strength'],c['gate']);summary=summaries(rows,values);failures=passes(summary,baseline)
        predictions[c['name']]=values.tolist();truth=np.array([r['observedC'] for r in rows]);base=np.array([r['baseline'] for r in rows]);delta=np.abs(values-truth)-np.abs(base-truth)
        candidates.append({'name':c['name'],'family':c['family'],'calibrationPassed':not c['failures'],'evaluationPassed':not failures,'failures':failures,'summary':summary,
           'individualChanges':{'improved':int(sum(delta < -1e-8)),'worsened':int(sum(delta>1e-8)),'worsenedOver1C':int(sum(delta>1))}})
    report={'stage':'evaluation','count':len(rows),'allCases':len(allrows),'baseline':baseline,'candidates':candidates,
       'adoptable':[c['name'] for c in candidates if c['calibrationPassed'] and c['evaluationPassed']],
       'predictionRecords':[{'time':r['time'],'id':r['id'],'name':r['name'],'observedC':r['observedC'],'baseline':r['baseline'],
         'morning':r['morning'],'context':r['context'],'predictions':{name:values[i] for name,values in predictions.items()}} for i,r in enumerate(rows)]}
    print('adoptable',report['adoptable'])
    for c in candidates:print(c['name'],c['summary']['pooled'],'failures',len(c['failures']))
(OUT/('evaluation-result.json' if EVALUATE else 'calibration-result.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
