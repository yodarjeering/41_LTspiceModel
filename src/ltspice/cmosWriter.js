import { validateCmos, variationName } from "../model/modelSettings.js";

export function writeCmos(model) {
  const p = validateCmos(model.cmosParameters);
  const scale = (value, target) => model.variation?.target === target ? `(${value}*${variationName(model)})` : `${value}`;
  const on = scale(p.IF_ON, "IF_THRESHOLD"), off = scale(p.IF_OFF, "IF_THRESHOLD");
  const td = scale(p.TD, "TIMING"), tr = scale(p.TR, "TIMING"), tf = scale(p.TF, "TIMING");
  const rh = scale(Math.max((p.VCC - p.VOH) / p.IOH, 1e-3), "ROUT");
  const rl = scale(Math.max(p.VOL / p.IOL, 1e-3), "ROUT");
  const is = p.IF_REF / Math.expm1(p.VF / (2 * 8.617333262e-5 * 300.15));
  if (!(is > 0 && Number.isFinite(is))) throw new Error("LEDのVF・測定電流を確認してください。モデル化可能な範囲を超えています。");
  const outputs = p.inverting ? "LOGIC GND" : "GND LOGIC";
  return `* Datasheet behavioral approximation, not a vendor transistor-level model.
* TR/TF describe internal logic slew; OUT slew also depends on load.
.SUBCKT ${model.deviceName} A K VCC GND OUT
DLED A K ${model.deviceName}__LED
.model ${model.deviceName}__LED D(IS=${is} N=2 TNOM=27)
BSENSE SENSE GND V=I(DLED)
ALOGIC SENSE GND GND GND GND ${outputs} GND SCHMITT Vt={(${on}+${off})/2} Vh={(${on}-${off})/2} Vhigh=1 Vlow=0 Td={${td}} Trise={${tr}} Tfall={${tf}} tripdt={min(${tr},${tf})/10}
BHI VCC OUT I=V(VCC,OUT)*limit(V(LOGIC,GND),0,1)/(${rh})
BLO OUT GND I=V(OUT,GND)*(1-limit(V(LOGIC,GND),0,1))/(${rl})
RLEAK OUT GND 1T
BICC VCC GND I=if(V(VCC,GND)>0,${p.ICC},0)
.ENDS ${model.deviceName}
`;
}
