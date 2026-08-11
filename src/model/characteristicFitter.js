const VT_27 = 0.0256926;

export function parseCsvPoints(text, columns) {
  const cleaned=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/).map(line=>line.replace(/#.*$/,"").trim()).filter(Boolean).join(" ");
  const tokens=cleaned.replace(/[\u3000,;]+/g," ").trim().split(/\s+/).filter(Boolean).map(token=>Number(token.replace(/[dD]([+-]?\d+)$/, "e$1")));
  if(tokens.some(value=>!Number.isFinite(value)))throw new Error("特性データに数値以外の値が含まれています。");
  if(tokens.length%columns.length!==0)throw new Error(`特性データは${columns.length}列単位で入力してください（数値${tokens.length}個を検出）。`);
  const points=[];
  for(let index=0;index<tokens.length;index+=columns.length)points.push(Object.fromEntries(columns.map((column,offset)=>[column,tokens[index+offset]])));
  if (points.length < 2) throw new Error("フィッティングには2点以上の特性データが必要です。");
  return points;
}

export function swapSeriesXY(text, columnCount=2) {
  const values=String(text||"").replace(/[\u3000,;]+/g," ").trim().split(/\s+/).filter(Boolean);
  if(values.length%columnCount!==0)return text;
  const rows=[];for(let index=0;index<values.length;index+=columnCount){const row=values.slice(index,index+columnCount);[row[0],row[1]]=[row[1],row[0]];rows.push(row.join(" "));}return rows.join("\n");
}

function linearFit(points) {
  const n=points.length, sx=points.reduce((s,p)=>s+p.x,0), sy=points.reduce((s,p)=>s+p.y,0), sxx=points.reduce((s,p)=>s+p.x*p.x,0), sxy=points.reduce((s,p)=>s+p.x*p.y,0);
  const denominator=n*sxx-sx*sx;
  if (Math.abs(denominator)<1e-20) throw new Error("同じX値だけではフィッティングできません。");
  const slope=(n*sxy-sx*sy)/denominator, intercept=(sy-slope*sx)/n;
  return {slope,intercept,rmse:Math.sqrt(points.reduce((s,p)=>s+(p.y-(slope*p.x+intercept))**2,0)/n)};
}
function format(value) { if(!Number.isFinite(value)) throw new Error("有効なパラメータを求められませんでした。"); return Number(value.toPrecision(7)).toString(); }
function fitJunction(points, voltageKey, currentKey, temperature) {
  const valid=points.filter(p=>p[currentKey]>0).map(p=>({x:Math.abs(p[voltageKey]),y:Math.log(Math.abs(p[currentKey]))}));
  if(valid.length<2) throw new Error("接合特性には正の電流値が2点以上必要です。");
  const fit=linearFit(valid), vt=VT_27*(Number(temperature)+273.15)/300.15;
  return {parameters:{IS:format(Math.exp(fit.intercept)),N:format(1/(fit.slope*vt))},error:fit.rmse};
}
function fitDiode(data,temp){const points=parseCsvPoints(data.iv,["VF","IF"]),r=fitJunction(points,"VF","IF",temp);return{...r,curves:[{name:"IF-VF",columns:["VF","IF"],points}]};}
const hasData=value=>String(value||"").split(/\r?\n/).some(line=>line.trim()&&!line.trim().startsWith("#"));
function fitBjt(data,temp){
  const parameters={},curves=[],errors=[],warnings=[],parameterSources={};let gains=[];
  if(hasData(data.vbeIc)){const points=parseCsvPoints(data.vbeIc,["VBE","IC"]),r=fitJunction(points,"VBE","IC",temp);Object.assign(parameters,r.parameters);errors.push(r.error);curves.push({name:"VBE-IC",columns:["VBE","IC"],points});parameterSources.IS="VBE-IC";parameterSources.N="VBE-IC";}
  if(hasData(data.gummel)){const points=parseCsvPoints(data.gummel,["VBE","IC","IB"]),r=fitJunction(points,"VBE","IC",temp);Object.assign(parameters,r.parameters);gains.push(...points.filter(p=>p.IB>0&&p.IC>0).map(p=>({IC:p.IC,hFE:p.IC/p.IB})));errors.push(r.error);curves.push({name:"Gummel VBE-IC-IB",columns:["VBE","IC","IB"],points});parameterSources.IS="Gummel";parameterSources.N="Gummel";}
  if(hasData(data.hfeIc)){const points=parseCsvPoints(data.hfeIc,["IC","hFE"]);gains.push(...points.filter(p=>p.IC>0&&p.hFE>0));curves.push({name:"hFE-IC",columns:["IC","hFE"],points});}
  if(hasData(data.icIb)){const points=parseCsvPoints(data.icIb,["IB","IC"]);gains.push(...points.filter(p=>p.IB>0&&p.IC>0).map(p=>({IC:p.IC,hFE:p.IC/p.IB})));curves.push({name:"IC-IB",columns:["IB","IC"],points});}
  if(gains.length){const bf=Math.max(...gains.map(p=>p.hFE));parameters.BF=format(bf);parameterSources.BF=curves.some(c=>c.name==="hFE-IC")?"hFE-IC":"IC-IB/Gummel";const candidates=gains.filter(p=>p.hFE<bf*.95).map(p=>p.IC/(bf/p.hFE-1)).filter(v=>v>0&&Number.isFinite(v));if(candidates.length){parameters.IKF=format(candidates.sort((a,b)=>a-b)[Math.floor(candidates.length/2)]);parameterSources.IKF="high-current hFE roll-off";}const mean=gains.reduce((s,p)=>s+p.hFE,0)/gains.length;errors.push(Math.sqrt(gains.reduce((s,p)=>s+(p.hFE-mean)**2,0)/gains.length)/mean);}
  if(!("IS" in parameters))warnings.push("VBE-ICデータがないためIS/Nは既定値を使用します。");if(!("BF" in parameters))warnings.push("hFE-ICまたはIC-IBデータがないためBFは既定値を使用します。");
  if(!curves.length)throw new Error("BJTはVBE-IC、hFE-IC、IC-IBのいずれかを入力してください。");return{parameters,error:errors.length?Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length):0,curves,warnings,parameterSources};
}
function fitMosfet(data){const points=parseCsvPoints(data.transfer,["VGS","ID"]),valid=points.filter(p=>Math.abs(p.ID)>0).map(p=>({x:Math.abs(p.VGS),y:Math.sqrt(Math.abs(p.ID))})),fit=linearFit(valid);return{parameters:{VTO:format(-fit.intercept/fit.slope),KP:format(2*fit.slope*fit.slope)},error:fit.rmse,curves:[{name:"Transfer VGS-ID",columns:["VGS","ID"],points}]};}
function fitPhoto(data,temp){
  const parameters={},curves=[],errors=[],warnings=[],parameterSources={};
  if(hasData(data.transfer)){const points=parseCsvPoints(data.transfer,["IF","IC"]),valid=points.filter(p=>p.IF>0),ratios=valid.map(p=>p.IC/p.IF);parameters.CTR=format(ratios.reduce((a,b)=>a+b,0)/ratios.length);parameterSources.CTR="IF-IC";curves.push({name:"IF-IC",columns:["IF","IC"],points});const mean=Number(parameters.CTR);errors.push(Math.sqrt(ratios.reduce((s,v)=>s+(v-mean)**2,0)/ratios.length)/mean);}
  if(hasData(data.ifCtr)){const points=parseCsvPoints(data.ifCtr,["IF","CTR"]);parameters.CTR=format(points.reduce((s,p)=>s+p.CTR,0)/points.length);parameterSources.CTR="IF-CTR table";curves.push({name:"IF-CTR",columns:["IF","CTR"],points});const mean=Number(parameters.CTR);errors.push(Math.sqrt(points.reduce((s,p)=>s+(p.CTR-mean)**2,0)/points.length)/mean);}
  if(hasData(data.led)){const points=parseCsvPoints(data.led,["VF","IF"]),j=fitJunction(points,"VF","IF",temp);Object.assign(parameters,j.parameters);parameterSources.IS="LED IF-VF";parameterSources.N="LED IF-VF";errors.push(j.error);curves.push({name:"LED IF-VF",columns:["VF","IF"],points});}else warnings.push("LED IF-VFデータがないため入力LEDのIS/Nは既定値を使用します。");
  if(!("CTR" in parameters))throw new Error("PhotoCouplerはIF-CTRまたはIF-ICを入力してください。");return{parameters,error:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length),curves,warnings,parameterSources};
}

export function fitCharacteristics(variant,data,temperature=27){if(variant==="Diode")return fitDiode(data,temperature);if(variant.startsWith("BJT"))return fitBjt(data,temperature);if(variant.startsWith("MOSFET"))return fitMosfet(data);return fitPhoto(data,temperature);}
export const characteristicInputs={
  Diode:[{key:"iv",label:"IF–VF特性",hint:"VF [V]  IF [A]",sample:"0.55 0.001\n0.62 0.01\n0.70 0.1"}],
  BJT:[{key:"vbeIc",label:"VBE–IC特性（任意）",hint:"VBE [V]  IC [A]",sample:"0.55 0.001\n0.62 0.01\n0.69 0.1"},{key:"hfeIc",label:"hFE–IC特性（任意）",hint:"IC [A]  hFE",sample:"0.001 120\n0.01 180\n0.1 150"},{key:"icIb",label:"IC–IB特性（任意）",hint:"IB [A]  IC [A]",sample:""}],
  MOSFET:[{key:"transfer",label:"伝達特性（十分大きいVDS）",hint:"VGS [V]  ID [A]",sample:"2.5 0.05\n3 0.25\n4 1.0\n5 2.25"}],
  PhotoCoupler:[{key:"ifCtr",label:"IF–CTR特性（IF–ICの代わりに可）",hint:"IF [A]  CTR [ratio]",sample:"0.001 0.7\n0.005 0.9\n0.01 0.8"},{key:"transfer",label:"IF–IC特性（任意）",hint:"IF [A]  IC [A]",sample:""},{key:"led",label:"入力LED IF–VF特性（任意）",hint:"VF [V]  IF [A]",sample:""}]
};
