export function writeReverseDiode(model, parameters) {
  const curve = model.characteristicCurves.find(curve => curve.name === "IR-VR");
  const points = curve.points.slice().sort((a, b) => a.VR - b.VR);
  if (points[0].VR !== 0) points.unshift({ VR: 0, IR: 0 });
  const last = points.at(-1), previous = points.at(-2);
  const slope = (last.IR - previous.IR) / (last.VR - previous.VR);
  const reverse = `max(-V(A,K),0)`;
  const expression = `(table(${reverse},${points.map(p => `${p.VR},${p.IR}`).join(",")})+max(${reverse}-${last.VR},0)*${slope})`;
  const core = { ...parameters, RS: 0, TNOM: model.temperature };
  const staticCore = { ...core, CJO: 0, TT: 0 };
  const params = p => Object.entries(p).filter(([, value]) => value != null && value !== "").map(([key, value]) => `${key}=${value}`).join(" ");
  return `* Reverse IR-VR: piecewise-linear at supplied temperature; final slope extrapolation.
.SUBCKT ${model.deviceName} A K
RSERIES A J ${parameters.RS || 0}
DCORE J K ${model.deviceName}__CORE
* Isolated static replica cancels junction leakage without cancelling CJO/TT current.
EREF RJ 0 J K 1
DSTATIC RJ 0 ${model.deviceName}__STATIC
BREVERSE J K I=if(V(A,K)<0,-I(DSTATIC)-${expression},0)
.model ${model.deviceName}__CORE D(${params(core)})
.model ${model.deviceName}__STATIC D(${params(staticCore)})
.ENDS ${model.deviceName}
`;
}

export function writeReverseDiodeTest(model) {
  const curve = model.characteristicCurves.find(curve => curve.name === "IR-VR");
  if (!curve) return null;
  const end = curve.points.at(-1).VR;
  const checks = curve.points.map((point, index) => ({ name: `ir_${index}`, expected: point.IR, absoluteTolerance: Math.max(1e-10, point.IR * 0.01) }));
  const forwardCurrent = 0.01;
  const vt = 8.617333262e-5 * (273.15 + model.temperature);
  const p = model.spiceParameters;
  const isScale = model.variation?.target === "IS" ? model.variation.k : 1;
  checks.push({ name: "forward_vf", expected: Number(p.N ?? 1) * vt * Math.log1p(forwardCurrent / (Number(p.IS ?? 1e-14) * isScale)) + Number(p.RS ?? 0.1) * forwardCurrent, absoluteTolerance: 0.002 });
  return {
    checks,
    circuit: `Reverse diode IR-VR validation
.include ${model.deviceName}.lib
.temp ${model.temperature}
VR K 0 0
XDUT 0 K ${model.deviceName}
IFORWARD 0 F ${forwardCurrent}
XFORWARD F 0 ${model.deviceName}
* Independent fixed-bias probes avoid interpolating across a sharp knee in the DC sweep.
${curve.points.map((point, index) => `VBIAS${index} K${index} 0 ${point.VR}\nXPROBE${index} 0 K${index} ${model.deviceName}`).join("\n")}
.dc VR 0 ${end} ${end / 2000}
${curve.points.map((point, index) => `.meas DC ir_${index} FIND -I(VBIAS${index}) AT=${end}`).join("\n")}
.meas DC forward_vf FIND V(F) AT=${end}
.end
`
  };
}
