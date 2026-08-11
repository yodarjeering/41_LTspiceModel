import { createDeviceModel, deviceOptions } from "./model/deviceModel.js";
import { fitCharacteristics, characteristicInputs, swapSeriesXY } from "./model/characteristicFitter.js";
import { buildPackage } from "./ltspice/packageWriter.js";

const $=id=>document.getElementById(id), select=$("variant");
for(const value of deviceOptions){const option=document.createElement("option");option.value=value;option.textContent=value;select.append(option);} select.value="PhotoCoupler";
const group=variant=>variant.startsWith("BJT")?"BJT":variant.startsWith("MOSFET")?"MOSFET":variant;

function renderFields(){
  $("fit-output").textContent="未フィッティング";const container=$("characteristic-fields");container.replaceChildren();
  for(const field of characteristicInputs[group(select.value)]){
    const label=document.createElement("label"), small=document.createElement("small"), area=document.createElement("textarea");
    const swapLabel=document.createElement("label"),swap=document.createElement("input");swap.type="checkbox";swap.dataset.swap=field.key;swapLabel.className="swap-control";swapLabel.append(swap," X/Yを入れ替える");
    label.append(field.label);small.textContent=`${field.hint}（空白・タブで区切る。改行位置は任意）`;area.rows=5;area.dataset.characteristic=field.key;area.value=field.sample;label.append(small,area,swapLabel);container.append(label);
  }
}
function collectData(){return Object.fromEntries([...document.querySelectorAll("[data-characteristic]")].map(element=>{const swap=document.querySelector(`[data-swap="${element.dataset.characteristic}"]`);return[element.dataset.characteristic,swap?.checked?swapSeriesXY(element.value):element.value];}));}
function runFit(){const fit=fitCharacteristics(select.value,collectData(),Number($("temperature").value)),warning=fit.warnings?.length?` / 注意: ${fit.warnings.join(" ")}`:"";$("fit-output").textContent=`推定値: ${JSON.stringify(fit.parameters)} / RMSE: ${fit.error.toPrecision(4)}${warning}`;return fit;}
select.addEventListener("change",renderFields);$("fit-button").addEventListener("click",()=>{try{runFit();}catch(error){$("fit-output").textContent=error.message;}});renderFields();

$("model-form").addEventListener("submit",event=>{
  event.preventDefault();const status=$("status");
  try{
    const fit=runFit(),overrides=JSON.parse($("parameters").value||"{}");
    const model=createDeviceModel({deviceName:$("device-name").value,variant:select.value,temperature:$("temperature").value,fittingError:fit.error,fittingWarnings:fit.warnings,parameterSources:fit.parameterSources,spiceParameters:{...fit.parameters,...overrides},characteristicCurves:fit.curves});
    const pkg=buildPackage(model),blob=new Blob([pkg.bytes],{type:"application/zip"}),url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=pkg.fileName;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent=`${pkg.fileName} を生成しました`;
  }catch(error){status.textContent=error.message;}
});
