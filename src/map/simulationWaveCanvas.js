import {compileShader} from "./depth3DRenderer.js";

export const SIMULATION_WAVE_CANVAS_LAYER = "earthquake-simulation-waves-direct";
const EMPTY={type:"FeatureCollection",features:[]};
const COLORS={P:"#1769c2",S:"#ff6a3d"};

// Draw the unchanged geographic geometry, colors and widths straight to a
// canvas, then composite it at the correct MapLibre layer position. No DOM
// overlay, radius quantization, geometry simplification or second frame clock.
export function drawSimulationWaves(context,map,collection,width,height) {
  context.clearRect(0,0,width,height);
  const center=map.getCenter().lng;
  const projected=[];
  for(const feature of collection.features){
    const {featureType,waveType}=feature.properties;
    if(featureType==="hypocenter")continue;
    const polygon=feature.geometry.type==="Polygon";
    const paths=polygon?feature.geometry.coordinates:feature.geometry.type==="MultiLineString"?feature.geometry.coordinates:[];
    const color=COLORS[waveType];
    if(!color)continue;
    for(const path of paths){
      if(path.length<2)continue;
      const meanLongitude=(Math.min(...path.map(p=>p[0]))+Math.max(...path.map(p=>p[0])))/2;
      const shift=360*Math.round((center-meanLongitude)/360);
      const points=path.map(p=>map.project([p[0]+shift,p[1]]));
      if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;
      const first=path[0],origin=points[0],world=map.project([first[0]+shift+360,first[1]]);
      const dx=world.x-origin.x,dy=world.y-origin.y;
      const copies=map.getRenderWorldCopies?.()===false?[0]:[-1,0,1];
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      for(const copy of copies){
        const x=copy*dx,y=copy*dy;
        if(maxX+x < -4 || minX+x > width+4 || maxY+y < -4 || minY+y > height+4)continue;
        projected.push({points,x,y,polygon,color,featureType,waveType});
      }
    }
  }
  // Match the style's fill layer followed by its line layer. A later fill
  // must not paint over an earlier wavefront at a P/S intersection.
  for(const fill of [true,false])for(const item of projected){
    const {points,x,y,polygon,color,featureType,waveType}=item;
    if(fill?!polygon:polygon&&featureType!=="wave")continue;
    context.beginPath();
    points.forEach((p,i)=>i?context.lineTo(p.x+x,p.y+y):context.moveTo(p.x+x,p.y+y));
    if(polygon)context.closePath();
    if(fill){
      context.fillStyle=color;context.globalAlpha=featureType==="wave-fill"?.008:waveType==="P"?.055:.065;context.fill();
    }else{
      context.strokeStyle=color;context.lineWidth=waveType==="P"?2.6:2.8;
      context.lineCap="round";context.lineJoin="round";context.globalAlpha=.96;context.stroke();
    }
  }
  context.globalAlpha=1;
}

export function createSimulationWaveCanvas(getMap,{createCanvas=()=>document.createElement("canvas"),onCapabilityChange=()=>{}}={}) {
  let owner=null,canvas=null,context=null,glContext=null,program=null,buffer=null,texture=null,vao=null;
  let sampler=null;
  let data=EMPTY,visible=false,dirty=true,available=false,cameraKey="",capability=null;
  const supported=()=>{
    const map=getMap();
    return Boolean(map && (map.getPitch?.()??0)===0 && !map.getTerrain?.()
      && (map.getProjection?.()?.type??"mercator")==="mercator");
  };
  const cameraChanged=()=>{
    dirty=true;
    const next=supported();
    if(next!==capability){capability=next;onCapabilityChange();}
    if(visible)owner?.triggerRepaint();
  };
  const dispose=gl=>{
    if(program)gl.deleteProgram(program);if(buffer)gl.deleteBuffer(buffer);
    if(texture)gl.deleteTexture(texture);if(vao)gl.deleteVertexArray(vao);
    program=buffer=texture=vao=sampler=null;available=false;
  };
  const initialize=gl=>{
    dispose(gl);glContext=gl;
    let vertex=null,fragment=null;
    try{
    vertex=compileShader(gl,gl.VERTEX_SHADER,`#version 300 es
      in vec2 a_position; out vec2 v_uv;
      void main(){gl_Position=vec4(a_position,0.,1.);v_uv=vec2((a_position.x+1.)*.5,(1.-a_position.y)*.5);}`);
    fragment=compileShader(gl,gl.FRAGMENT_SHADER,`#version 300 es
      precision mediump float; uniform sampler2D u_canvas; in vec2 v_uv; out vec4 color;
      void main(){color=texture(u_canvas,v_uv);}`);
    program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    }finally{
      if(vertex)gl.deleteShader(vertex);if(fragment)gl.deleteShader(fragment);
    }
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||"Wave program link failed");
    const previousVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING),previousBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    vao=gl.createVertexArray();gl.bindVertexArray(vao);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,"a_position");gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    gl.bindVertexArray(previousVao);gl.bindBuffer(gl.ARRAY_BUFFER,previousBuffer);
    texture=gl.createTexture();sampler=gl.getUniformLocation(program,"u_canvas");dirty=true;available=true;
  };
  const lost=()=>{available=false;onCapabilityChange();};
  const restored=()=>{
    try{initialize(glContext);}catch(error){dispose(glContext);console.warn("[MeteoScope] direct wave renderer unavailable",error);}
    onCapabilityChange();
  };
  const layer={
    id:SIMULATION_WAVE_CANVAS_LAYER,type:"custom",renderingMode:"2d",
    onAdd(map,gl){
      owner=map;
      for(const event of ["move","resize","terrain","projectiontransition"])map.on(event,cameraChanged);
      map.on("webglcontextlost",lost);map.on("webglcontextrestored",restored);
      try{initialize(gl);}catch(error){dispose(gl);console.warn("[MeteoScope] direct wave renderer unavailable",error);}
    },
    render(gl){
      if(!visible||!available||!supported())return;
      const base=owner.getCanvas(),width=base.clientWidth,height=base.clientHeight;
      if(!width||!height||!base.width||!base.height)return;
      const center=owner.getCenter();
      const key=`${center.lng}|${center.lat}|${owner.getZoom()}|${owner.getBearing()}|${base.width}|${base.height}`;
      const previousTextureUnit=gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE0);
      const previousTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);
      const previousProgram=gl.getParameter(gl.CURRENT_PROGRAM),previousVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      let failure=null;
      try{
      gl.bindTexture(gl.TEXTURE_2D,texture);
      if(dirty||cameraKey!==key){
        if(canvas.width!==base.width||canvas.height!==base.height){canvas.width=base.width;canvas.height=base.height;}
        context.setTransform(base.width/width,0,0,base.height/height,0,0);
        drawSimulationWaves(context,owner,data,width,height);
        const premultiplied=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
        try{
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
        }finally{
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiplied);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);
        }
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        dirty=false;cameraKey=key;
      }
      gl.useProgram(program);gl.uniform1i(sampler,0);gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      }catch(error){
        available=false;failure=error;
      }finally{
        gl.bindVertexArray(previousVao);gl.useProgram(previousProgram);
        gl.bindTexture(gl.TEXTURE_2D,previousTexture);gl.activeTexture(previousTextureUnit);
      }
      if(failure){console.warn("[MeteoScope] direct wave renderer unavailable",failure);onCapabilityChange();}
    },
    onRemove(map,gl){
      for(const event of ["move","resize","terrain","projectiontransition"])map.off(event,cameraChanged);
      map.off("webglcontextlost",lost);map.off("webglcontextrestored",restored);
      dispose(gl);owner=null;cameraKey="";
    }
  };
  return {
    setData(collection){
      const map=getMap();capability=supported();
      if(!capability){this.clear();return false;}
      if(!map.getLayer(SIMULATION_WAVE_CANVAS_LAYER)){
        try{
          canvas??=createCanvas();context??=canvas.getContext("2d");
          if(!context)return false;
          map.addLayer(layer,"eew-hypocenter-cross");
        }catch(error){console.warn("[MeteoScope] direct wave renderer unavailable",error);return false;}
      }
      if(!available){this.clear();return false;}
      if(data===collection&&visible)return true;
      data=collection;visible=true;dirty=true;map.triggerRepaint();return true;
    },
    setVisible(value){
      const next=Boolean(value&&available&&data!==EMPTY);
      if(next!==visible){visible=next;owner?.triggerRepaint();}
    },
    clear(){if(visible)owner?.triggerRepaint();visible=false;data=EMPTY;dirty=true;}
  };
}
