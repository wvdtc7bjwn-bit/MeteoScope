const IMAGE_PREFIX = "amedas-value-pill-";
const MORPH_PREFIX = "amedas-value-morph-";
const FONT = '600 11px "Noto Sans JP", "Yu Gothic", sans-serif';
const PIXEL_RATIO = 2;
const CAPSULE_HEIGHT = 18;
const MIN_CAPSULE_WIDTH = 22;
const CAPSULE_TEXT_PADDING = 10;
const markerStates = new WeakMap();
export const AMEDAS_VALUE_ZOOM = 6.6;
export const AMEDAS_VALUE_MORPH_MS = 180;
export const AMEDAS_MARKER_OUTLINE_COLOR = "#41464d";
export const AMEDAS_MARKER_OUTLINE_WIDTH = 0.75;
export const AMEDAS_DOT_LAYER_ID = "sample-amedas-dot";
export const AMEDAS_MORPH_LAYER_ID = "sample-amedas-morph";
const VALUE_LAYER_ID = "sample-amedas-value";
const MARKER_LAYERS = [AMEDAS_DOT_LAYER_ID, AMEDAS_MORPH_LAYER_ID, VALUE_LAYER_ID];
export const AMEDAS_DOT_RADIUS = ["interpolate", ["linear"], ["zoom"], 3, 2.89, 5, 4.25, 5.8, 5.2];

export function getAmedasValueMarkerId(label, color, textColor) {
  return `${IMAGE_PREFIX}${encodeURIComponent(label)}-${color}-${textColor}`;
}

function capsuleWidth(textWidth) {
  return Math.max(MIN_CAPSULE_WIDTH, Math.ceil((textWidth + CAPSULE_TEXT_PADDING) / 2) * 2);
}

export function getAmedasValueMarkerGeometry(zoom, textWidth, progress = zoom >= AMEDAS_VALUE_ZOOM ? 1 : 0) {
  const smallRadius = zoom <= 5
    ? 2.89 + 1.36 * Math.max(0, Math.min(1, (zoom - 3) / 2))
    : 4.25 + 0.95 * Math.min(1, (zoom - 5) / 0.8);
  return {
    radius: smallRadius + (CAPSULE_HEIGHT / 2 - smallRadius) * progress,
    halfLine: (capsuleWidth(textWidth) - CAPSULE_HEIGHT) / 2 * progress,
    textOpacity: progress === 1 ? 1 : 0
  };
}

function createMarkerContext() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  return canvas.getContext("2d", { willReadFrequently: true });
}

// Static RGBA sprite: the number and background are drawn once, together.
// Zooming a completed marker never reads canvas pixels or updates the atlas.
export function createAmedasValueMarkerImage(map, label, color, textColor, context = createMarkerContext()) {
  context.font = FONT;
  const textWidth = context.measureText(label).width;
  const pillWidth = capsuleWidth(textWidth);
  const width = (pillWidth + 4) * PIXEL_RATIO;
  const height = (CAPSULE_HEIGHT + 4) * PIXEL_RATIO;
  const cx = width / PIXEL_RATIO / 2, cy = height / PIXEL_RATIO / 2;
  const {radius,halfLine} = getAmedasValueMarkerGeometry(AMEDAS_VALUE_ZOOM,textWidth,1);
  context.setTransform(PIXEL_RATIO,0,0,PIXEL_RATIO,0,0);
  context.clearRect(0,0,context.canvas.width / PIXEL_RATIO,context.canvas.height / PIXEL_RATIO);
  context.globalAlpha = 1;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(cx-halfLine,cy-radius);
  context.lineTo(cx+halfLine,cy-radius);
  context.arc(cx+halfLine,cy,radius,-Math.PI/2,Math.PI/2);
  context.lineTo(cx-halfLine,cy+radius);
  context.arc(cx-halfLine,cy,radius,Math.PI/2,Math.PI*1.5);
  context.closePath();
  context.fill();
  context.strokeStyle = AMEDAS_MARKER_OUTLINE_COLOR;
  context.lineWidth = AMEDAS_MARKER_OUTLINE_WIDTH;
  context.stroke();
  context.font = FONT;
  context.fillStyle = textColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  // Do not add a vertical offset: it leaves digits below the capsule center.
  context.fillText(label,cx,cy);
  return {width,height,data:context.getImageData(0,0,width,height).data,capsuleWidth:pillWidth};
}

function createMorphImage(map,state,pillWidth) {
  const width = (pillWidth+4)*PIXEL_RATIO;
  const height = (CAPSULE_HEIGHT+4)*PIXEL_RATIO;
  const data = new Uint8Array(width*height*4);
  let previous = -1;
  const image = {width,height,data,render() {
    const progress = state.progress;
    const key = Math.round(progress*256);
    if(previous===key)return false;
    previous=key;
    const radius=5.2+(CAPSULE_HEIGHT/2-5.2)*progress;
    const halfLine=(pillWidth-CAPSULE_HEIGHT)/2*progress;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const dx=Math.max(0,Math.abs((x+.5-width/2)/PIXEL_RATIO)-halfLine);
      const dy=(y+.5-height/2)/PIXEL_RATIO;
      const distance=(Math.hypot(dx,dy)-radius)*PIXEL_RATIO;
      const offset=(y*width+x)*4;
      data[offset]=data[offset+1]=data[offset+2]=255;
      data[offset+3]=Math.max(0,Math.min(255,(.75-distance/8)*255));
    }
    return true;
  }};
  image.render();
  return image;
}

function syncLayers(map,state) {
  const active = !state.visible ? null : state.progress===0 ? AMEDAS_DOT_LAYER_ID
    : state.progress===1 ? VALUE_LAYER_ID : AMEDAS_MORPH_LAYER_ID;
  if(state.appliedVisible!==state.visible) {
    state.appliedVisible=state.visible;
    for(const id of MARKER_LAYERS)if(map.getLayer(id))map.setLayoutProperty(id,"visibility",state.visible ? "visible" : "none");
  }
  if(active===state.activeLayer)return;
  state.activeLayer=active;
  for(const id of MARKER_LAYERS)if(map.getLayer(id)) {
    const opacity=id===active ? 1 : 0;
    map.setPaintProperty(id,id===AMEDAS_DOT_LAYER_ID ? "circle-opacity" : "icon-opacity",opacity);
    if(id===AMEDAS_DOT_LAYER_ID)map.setPaintProperty(id,"circle-stroke-opacity",opacity);
  }
}

export function isAmedasMarkerLayerActive(map,id) {
  return !MARKER_LAYERS.includes(id) || markerStates.get(map)?.activeLayer===id;
}

function stopAnimation(state) {
  if(state.frame!==null)cancelAnimationFrame(state.frame);
  state.frame=null;
}

function updateTarget(map,state) {
  const target=state.valuesVisible!==false && map.getZoom()>=AMEDAS_VALUE_ZOOM ? 1 : 0;
  if(!state.visible) {
    stopAnimation(state);
    state.progress=state.target=target;
    return;
  }
  if(target===state.target)return;
  stopAnimation(state);
  state.target=target;
  const from=state.progress,started=performance.now();
  // Only this short transition requests frames. Each shared width sprite
  // updates once per frame, independently of the number of stations/values.
  const tick=now=>{
    state.frame=null;
    const t=Math.max(0,Math.min(1,(now-started)/AMEDAS_VALUE_MORPH_MS));
    state.progress=t===1 ? target : from+(target-from)*t*t*(3-2*t);
    syncLayers(map,state);
    map.triggerRepaint();
    if(t<1)state.frame=requestAnimationFrame(tick);
  };
  state.frame=requestAnimationFrame(tick);
}

export function syncAmedasValueMarkerVisibility(map,visible,valuesVisible=true) {
  const state=markerStates.get(map);
  if(!state)return;
  state.valuesVisible=valuesVisible;
  state.visible=Boolean(visible && state.hasMarkers);
  updateTarget(map,state);
  syncLayers(map,state);
}

export function setupAmedasValueMarkerImages(map,features) {
  let state=markerStates.get(map);
  if(!state) {
    const progress=map.getZoom()>=AMEDAS_VALUE_ZOOM ? 1 : 0;
    state={context:createMarkerContext(),ids:new Set(),features:null,generation:0,progress,target:progress,visible:false,hasMarkers:false,activeLayer:undefined,frame:null};
    markerStates.set(map,state);
    map.on("zoom",()=>updateTarget(map,state));
    map.on("remove",()=>stopAnimation(state));
  }
  if(state.features===features)return;
  state.features=features;
  const activeIds=new Set();
  for(const {properties} of features) {
    if(properties.markerType!=="amedas")continue;
    const {amedasMarkerImage:id,amedasValueLabel:label,color,amedasTextColor:textColor}=properties;
    let valueImage;
    if(!map.hasImage(id)) {
      valueImage=createAmedasValueMarkerImage(map,label,color,textColor,state.context);
      map.addImage(id,valueImage,{pixelRatio:PIXEL_RATIO});
      state.ids.add(id);
    }
    state.context.font=FONT;
    const pillWidth=valueImage?.capsuleWidth ?? capsuleWidth(state.context.measureText(label).width);
    const morphId=`${MORPH_PREFIX}${pillWidth}`;
    properties.amedasMorphImage=morphId;
    activeIds.add(id);activeIds.add(morphId);
    if(!map.hasImage(morphId)) {
      map.addImage(morphId,createMorphImage(map,state,pillWidth),{sdf:true,pixelRatio:PIXEL_RATIO});
      state.ids.add(morphId);
    }
  }
  state.hasMarkers=activeIds.size>0;
  const generation=++state.generation;
  map.once("idle",()=>{
    if(generation!==state.generation)return;
    for(const id of state.ids) {
      if(activeIds.has(id))continue;
      if(map.hasImage(id))map.removeImage(id);
      state.ids.delete(id);
    }
  });
}
