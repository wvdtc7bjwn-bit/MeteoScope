import { createJmaTemperatureController } from "../../src/location/jmaTemperatureController.js";
import { updateLocalTemperatureView } from "../../src/ui/localTemperatureView.js";
import { readPngPixel } from "../../src/utils/pngPixel.js";
import { decodeJmaTemperaturePixel } from "../../src/jma/estimatedTemperature.js";

const status=document.querySelector("#checks");
const location={status:"found",coordinates:[139.75,35.68]}; // Public reference only.
const controller=createJmaTemperatureController({onChange:result=>{
  updateLocalTemperatureView(result);
  status.textContent=JSON.stringify({kind:result.kind,range:result.range,analysis:result.observationTime,retrieved:result.retrievedAt,reason:result.reason},null,2);
}});
document.querySelector("#load").onclick=()=>{updateLocalTemperatureView(controller.update({enabled:true,location}));status.textContent="取得中";};
document.querySelector("#missing").onclick=()=>{
  controller.update({enabled:false});
  updateLocalTemperatureView({source:"jma",kind:"unavailable",value:null,range:null,reason:"missing-mesh",location});
  status.textContent="欠測表示のテスト中。実際の取得値ではありません。";
};
document.querySelector("#theme").onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==="light"?"dark":"light";};

// Exercise the shared PNG reader in the actual browser before requesting JMA data.
const canvas=document.createElement("canvas");canvas.width=canvas.height=512;
const context=canvas.getContext("2d");context.fillStyle="#e3f7f6";context.fillRect(0,0,512,512);
canvas.toBlob(async blob=>{
  try {
    const range=decodeJmaTemperaturePixel(await readPngPixel(await blob.arrayBuffer(),250,250,512));
    if(range?.lowerC!==10||range?.upperC!==11)throw Error("PNG category mismatch");
    status.textContent="PNG読み取り：合格（10〜11℃）。最新データボタンで実通信を確認できます。";
  } catch(error){status.textContent=`PNG読み取り：失敗 ${error.message}`;}
});
