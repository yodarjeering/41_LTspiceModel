import { fitThyristor } from "../model/thyristorFitter.js";
import { variationName } from "../model/modelSettings.js";

export function writeThyristor(model) {
  const p = fitThyristor(model.thyristorParameters, model.variant).parameters;
  const triac = model.variant === "Triac";
  const scale = (value, target) => model.variation?.target === target ? `(${value}*${variationName(model)})` : String(value);
  const igt = scale(p.IGT, "IGT"), il = scale(p.IL, "HOLDING"), ih = scale(p.IH, "HOLDING");
  const vto = scale(p.VTO, "ON_VOLTAGE"), rd = scale(p.RD, "ON_VOLTAGE");
  const gateIs = p.IGT / Math.expm1(p.VGT / (2 * 8.617333262e-5 * 300.15));
  if (!(gateIs > 0 && Number.isFinite(gateIs))) throw new Error("VGT/IGTがゲートモデルの計算範囲外です。");
  const forwardGate = triac ? `if(I(VGATE)>=0,I(VGATE)>=${igt},-I(VGATE)>=${scale(p.IGT_Q2, "IGT")})` : `I(VGATE)>=${igt}`;
  const reverseGate = `if(I(VGATE)<0,-I(VGATE)>=${scale(p.IGT_Q3, "IGT")},${p.q4Enabled ? `I(VGATE)>=${scale(p.IGT_Q4, "IGT")}` : "0"})`;
  // Capacitor state preserves latching without an algebraic self-reference.
  const branch = (suffix, sign, gate) => {
    const voltage = `${sign}V(MAIN,REF)`, current = `${sign}I(VPOWER)`;
    return `BTRIG${suffix} TRIG${suffix} REF V=if((${voltage}>0)&(${gate}),1,0)
RTRIG${suffix} TRIG${suffix} REF 1G
CSTATE${suffix} STATE${suffix} REF 10n IC=0
RSTATE${suffix} STATE${suffix} REF 1
BSTATE${suffix} REF STATE${suffix} I=if((${voltage}>0)&(((V(TRIG${suffix},REF)>0.5)&(${current}>${il}))|(V(STATE${suffix},REF)>0.5))&(${current}>${ih}),1,0)
BON${suffix} MAIN REF I=${sign}if((V(TRIG${suffix},REF)>0.5)|(V(STATE${suffix},REF)>0.5),max((${voltage}-${vto})/${rd},0),0)`;
  };
  return `* Datasheet-calibrated behavioral SCR/TRIAC; no thermal or breakdown model.
* State time constant 10ns is numerical, not specified switching time.
.SUBCKT ${model.deviceName} ${triac ? "T2 G T1" : "A G K"}
VPOWER ${triac ? "T2" : "A"} MAIN 0
VREF REF ${triac ? "T1" : "K"} 0
VGATE G GI 0
DGATE GI REF ${model.deviceName}__GATE
${triac ? `DGATEN REF GI ${model.deviceName}__GATE\n` : ""}.model ${model.deviceName}__GATE D(IS=${gateIs} N=2 TNOM=27)
ROFF MAIN REF ${p.VDRM / p.IDRM}
${branch("P", "", forwardGate)}
${triac ? branch("N", "-", reverseGate) + "\n" : ""}.ENDS ${model.deviceName}
`;
}
