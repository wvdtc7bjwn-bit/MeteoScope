import json, re
from pathlib import Path
from collections import defaultdict
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.cache/plate_data'); features=[]
for region in ('sw','kanto','izu3','nakajima','baba'):
 for p in sorted((root/region).glob('plate_d*km*.dat')):
  depth=int(re.search(r'd(\d+)km',p.name).group(1)); lines=[[]]
  for line in p.read_text().splitlines():
   if line.startswith('>'): lines.append([]); continue
   try: x,y=map(float,line.split()[:2]); lines[-1].append([x,y])
   except (ValueError,IndexError): continue
  for line in lines:
   if len(line)>1: features.append({'type':'Feature','properties':{'region':region,'plate':'フィリピン海プレート','depthKm':depth,'label':f'{depth}km'},'geometry':{'type':'LineString','coordinates':line}})
grid={}
for line in (root/'PAC/plate_combine.dat').read_text().splitlines():
 try: x,y,z=map(float,line.split()[:3]); grid[(round(x*5),round(y*5))]=z
 except (ValueError,IndexError): pass
# March across the supplied 0.2 degree grid without extrapolating beyond it.
for level in list(range(10,101,10)) + list(range(150,401,50)):
 segments=[]
 for i in range(650,735):
  for j in range(150,235):
   corners=[(i,j),(i+1,j),(i+1,j+1),(i,j+1)]
   if any(c not in grid for c in corners): continue
   for indices in ((0,1,2),(0,2,3)):
    triangle=[corners[n] for n in indices]
    hits=[]
    for n in range(3):
     a,b=triangle[n],triangle[(n+1)%3]; za,zb=grid[a],grid[b]
     if (za<level<=zb) or (zb<level<=za):
      t=(level-za)/(zb-za); hits.append((round((a[0]+t*(b[0]-a[0]))/5,6),round((a[1]+t*(b[1]-a[1]))/5,6)))
    if len(hits)==2 and hits[0] != hits[1]: segments.append(hits)
 adjacency=defaultdict(list)
 for n,(a,b) in enumerate(segments): adjacency[a].append(n); adjacency[b].append(n)
 used=set()
 def follow(start,n):
  line=[start]; cur=start
  while n not in used:
   used.add(n); a,b=segments[n]; cur=b if a==cur else a; line.append(cur)
   choices=[k for k in adjacency[cur] if k not in used]
   if not choices: break
   n=choices[0]
  return line
 for pt,edges in list(adjacency.items()):
  if len(edges)!=1: continue
  for n in edges:
   if n not in used:
    line=follow(pt,n)
    if len(line)>2: features.append({'type':'Feature','properties':{'region':'PAC','plate':'太平洋プレート','depthKm':level,'label':f'{level}km'},'geometry':{'type':'LineString','coordinates':line}})
 for n,(a,b) in enumerate(segments):
  if n not in used:
   line=follow(a,n)
   if len(line)>2: features.append({'type':'Feature','properties':{'region':'PAC','plate':'太平洋プレート','depthKm':level,'label':f'{level}km'},'geometry':{'type':'LineString','coordinates':line}})
out=Path('public/data/mri-jma-plate-depth-contours.geojson'); out.write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(len(features), out.stat().st_size)

