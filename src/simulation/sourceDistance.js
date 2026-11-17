// Utsu (1977) finite-source sphere used in JMA's reference method.
// https://www.jma.go.jp/jma/kishou/know/jishin/eew/katsuyou/reference.pdf
// This teaching approximation does not infer a real fault's strike or dip.
export function pointSourceFaultDistance(magnitude, depthKm, hypocentralDistanceKm) {
  if (![magnitude, depthKm, hypocentralDistanceKm].every(Number.isFinite)
      || depthKm < 0 || hypocentralDistanceKm < 0) throw new RangeError("Invalid source distance");
  // Keep the existing deep approximation unchanged and continuous at 150 km.
  const weight = Math.max(0, Math.min(1, (150 - depthKm) / 50));
  // The reference PGV model saturates at Mw8.3. Apply the same conservative
  // bound to an unknown source's radius, rather than painting a huge sphere
  // as equally near-fault. Known source geometries do not use this sphere.
  const radius = 10 ** (.5 * Math.min(magnitude, 8.3) - 1.85) / 2;
  return weight === 0 ? hypocentralDistanceKm : Math.max(3, hypocentralDistanceKm - weight * radius);
}

// Surface point -> rectangular plane in local east/north/down coordinates.
// The origin is the upper corner, strike clockwise from north, dip to its right.
export function rectangularFaultDistance(point, fault, depthShiftKm = 0, alongRange = [0, fault.LEN]) {
  if(fault.CORNERS)return officialPlaneDistance(point,fault,depthShiftKm,alongRange);
  const rad = Math.PI / 180;
  const east = (point[0] - fault.LON) * rad * 6371 * Math.cos((point[1] + fault.LAT) / 2 * rad);
  const north = (point[1] - fault.LAT) * rad * 6371;
  const down = -Math.max(0, fault.DEP + depthShiftKm);
  const strike = fault.STR * rad, dip = fault.DIP * rad;
  const along = Math.max(alongRange[0], Math.min(alongRange[1], east * Math.sin(strike) + north * Math.cos(strike)));
  const across = Math.max(0, Math.min(fault.WID,
    east * Math.cos(strike) * Math.cos(dip) - north * Math.sin(strike) * Math.cos(dip) + down * Math.sin(dip)));
  return Math.hypot(east - along * Math.sin(strike) - across * Math.cos(strike) * Math.cos(dip),
    north - along * Math.cos(strike) + across * Math.sin(strike) * Math.cos(dip), down - across * Math.sin(dip));
}

// Closest distance to the finite official quadrilateral, split into triangles.
// The local projection is a distance approximation; source/display vertices
// themselves remain the original WGS84 positions and depths.
function officialPlaneDistance(point,fault,shift,[start,end]) {
  const rad=Math.PI/180,scale=rad*6371;
  const corners=fault.CORNERS.map(p=>[(p[0]-point[0])*scale*Math.cos((p[1]+point[1])/2*rad),
    (p[1]-point[1])*scale,Math.max(0,p[2]+shift)]);
  const along=(a,b,f)=>a.map((v,i)=>v+(b[i]-v)*Math.max(0,Math.min(1,f/fault.LEN)));
  const [a,b,c,d]=[along(corners[0],corners[1],start),along(corners[0],corners[1],end),
    along(corners[3],corners[2],end),along(corners[3],corners[2],start)];
  return Math.min(triangleDistance(a,b,c),triangleDistance(a,c,d));
}

function triangleDistance(a,b,c) {
  const bx=b[0]-a[0],by=b[1]-a[1],bz=b[2]-a[2],cx=c[0]-a[0],cy=c[1]-a[1],cz=c[2]-a[2];
  const aa=bx*bx+by*by+bz*bz,bb=bx*cx+by*cy+bz*cz,cc=cx*cx+cy*cy+cz*cz,den=aa*cc-bb*bb;
  if(den>1e-15){
    const nx=by*cz-bz*cy,ny=bz*cx-bx*cz,nz=bx*cy-by*cx,nn=nx*nx+ny*ny+nz*nz;
    const offset=a[0]*nx+a[1]*ny+a[2]*nz,scale=offset/nn;
    const px=nx*scale-a[0],py=ny*scale-a[1],pz=nz*scale-a[2];
    const pab=px*bx+py*by+pz*bz,pac=px*cx+py*cy+pz*cz;
    const u=(cc*pab-bb*pac)/den,v=(aa*pac-bb*pab)/den;
    if(u>=0&&v>=0&&u+v<=1)return Math.abs(offset)/Math.sqrt(nn);
  }
  return Math.sqrt(Math.min(segmentDistanceSquared(a,b),segmentDistanceSquared(b,c),segmentDistanceSquared(c,a)));
}

function segmentDistanceSquared(a,b) {
  const x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2],length=x*x+y*y+z*z;
  const t=length?Math.max(0,Math.min(1,-(a[0]*x+a[1]*y+a[2]*z)/length)):0;
  return (a[0]+t*x)**2+(a[1]+t*y)**2+(a[2]+t*z)**2;
}

export function activeFaultSourceDistances(point, fault, sources, depthShiftKm = 0) {
  const positions = sources.map(source => source.faultAlongKm);
  return positions.map((along, i) => rectangularFaultDistance(point, fault, depthShiftKm,
    [i ? (positions[i - 1] + along) / 2 : 0,
      i + 1 < positions.length ? (along + positions[i + 1]) / 2 : fault.LEN]));
}

// Fade the shallow rectangular-source correction before the deep model starts.
// Propagation still uses the unchanged source-line distances.
export function simulationActiveFaultDistances(point, fault, sources, depthKm, referenceDepthKm, surfaceDistances) {
  const weight = Math.max(0, Math.min(1, (150 - depthKm) / 50));
  if (!weight) return null;
  const distances = new Array(sources.length);
  for (const plane of fault.planes ?? [fault]) {
    const indices = sources.flatMap((source,index) => !source.faultId || source.faultId===plane.FLT_ID ? [index] : []);
    const strips = activeFaultSourceDistances(point, plane, indices.map(index=>sources[index]), depthKm-referenceDepthKm);
    indices.forEach((index,i) => { distances[index]=weight*strips[i]+(1-weight)*Math.hypot(surfaceDistances[index],depthKm); });
  }
  return distances;
}
