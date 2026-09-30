import { assertDeviceModel } from "../model/deviceModel.js";
import { variationName, variationValues } from "../model/modelSettings.js";

const HEADER = ["Version 4", "SHEET 1 880 680"];

const wire = (x1, y1, x2, y2) => `WIRE ${x1} ${y1} ${x2} ${y2}`;
const flag = (x, y, name) => `FLAG ${x} ${y} ${name}`;
const text = (x, y, value) => `TEXT ${x} ${y} Left 2 !${value}`;

function symbol(name, x, y, instanceName, value) {
  return [
    `SYMBOL ${name} ${x} ${y} R0`,
    `SYMATTR InstName ${instanceName}`,
    `SYMATTR Value ${value}`
  ];
}

function finish(model, lines) {
  // An explicit include makes the generated test circuit independent of
  // whether a particular LTspice version honors the symbol's ModelFile field.
  return [
    ...HEADER,
    ...lines,
    text(480, 400, `.include ${model.deviceName}.lib`),
    ...(variationValues(model).length > 1 ? [text(96,448,`.step param ${variationName(model)} list ${variationValues(model).join(" ")}`)] : []),
    ""
  ].join("\n");
}

// Keep this layout aligned with the supplied D_test.asc reference circuit.
function writeDiodeTest(model) {
  return finish(model, [
    wire(288, 128, 160, 128),
    wire(480, 128, 368, 128),
    wire(160, 176, 160, 128),
    wire(480, 176, 480, 128),
    wire(160, 272, 160, 256),
    wire(480, 272, 480, 240),
    wire(480, 272, 160, 272),
    wire(160, 288, 160, 272),
    flag(160, 288, "0"),
    ...symbol(model.deviceName, 464, 176, "D1", model.deviceName),
    ...symbol("voltage", 160, 160, "V1", "0"),
    "SYMBOL res 384 112 R90",
    "WINDOW 0 0 56 VBottom 2",
    "WINDOW 3 32 56 VTop 2",
    "SYMATTR InstName R1",
    "SYMATTR Value 10m",
    text(96, 320, ".dc V1 0 2 1m"),
    text(96, 352, ".meas DC IF FIND I(D1) AT=1")
  ]);
}

// P-type devices reuse the same fixture; signed sweeps reverse the bias.
function writeBjtTest(model) {
  const isPnp = model.polarity === "PNP";
  const sweep = isPnp
    ? ".dc VCE 0 -10 -0.1 VB 0 -1 -0.05"
    : ".dc VCE 0 10 0.1 VB 0 1 0.05";
  const plotCurrent = isPnp ? "I(VCE)" : "-I(VCE)";

  return finish(model, [
    wire(416, 64, 160, 64),
    wire(160, 112, 160, 64),
    wire(416, 112, 416, 64),
    wire(352, 160, 240, 160),
    wire(160, 256, 160, 192),
    wire(240, 256, 240, 240),
    wire(240, 256, 160, 256),
    wire(416, 256, 416, 208),
    wire(416, 256, 240, 256),
    wire(160, 272, 160, 256),
    flag(160, 272, "0"),
    ...symbol(model.deviceName, 352, 112, "Q1", model.deviceName),
    ...symbol("voltage", 160, 96, "VCE", "0"),
    ...symbol("voltage", 240, 144, "VB", "0"),
    text(96, 304, sweep),
    text(96, 336, `;Plot ${plotCurrent} for Ic-Vce curves`)
  ]);
}

function writeMosfetTest(model) {
  const isPmos = model.polarity === "PMOS";
  const sweep = isPmos
    ? ".dc VDS 0 -10 -0.1 VGS 0 -10 -1"
    : ".dc VDS 0 10 0.1 VGS 0 10 1";
  const plotCurrent = isPmos ? "I(VDS)" : "-I(VDS)";
  const instanceName = model.modelType === "SUBCKT" ? "X1" : "M1";

  return finish(model, [
    wire(400, 64, 160, 64),
    wire(160, 112, 160, 64),
    wire(400, 112, 400, 64),
    wire(352, 192, 240, 192),
    wire(160, 288, 160, 192),
    wire(240, 288, 240, 272),
    wire(240, 288, 160, 288),
    wire(400, 288, 400, 208),
    wire(400, 288, 240, 288),
    wire(160, 304, 160, 288),
    flag(160, 304, "0"),
    ...symbol(model.deviceName, 352, 112, instanceName, model.deviceName),
    ...symbol("voltage", 160, 96, "VDS", "0"),
    ...symbol("voltage", 240, 176, "VGS", "0"),
    text(96, 336, sweep),
    text(96, 368, `;Plot ${plotCurrent} for Id-Vds curves`)
  ]);
}

function writePhotoCouplerTest(model) {
  return finish(model, [
    wire(288, 128, 160, 128),
    wire(592, 128, 480, 128),
    wire(160, 256, 160, 208),
    wire(288, 256, 288, 224),
    wire(288, 256, 160, 256),
    wire(480, 256, 480, 224),
    wire(480, 256, 288, 256),
    wire(592, 256, 592, 208),
    wire(592, 256, 480, 256),
    flag(160, 256, "0"),
    ...symbol(model.deviceName, 384, 176, "X1", model.deviceName),
    ...symbol("current", 160, 128, "IIN", "0"),
    ...symbol("voltage", 592, 112, "VCC", "5"),
    text(96, 320, ".dc IIN 0 -20m -0.1m"),
    text(96, 352, ";IF=-I(IIN), IC=-I(VCC), CTR=I(VCC)/I(IIN)")
  ]);
}

export function writeTestSchematic(model) {
  assertDeviceModel(model);

  if (["PhotoMOS-Relay", "PhotoCoupler-CMOS"].includes(model.deviceType)) {
    const relay = model.deviceType === "PhotoMOS-Relay";
    return finish(model, [
      ...symbol(model.deviceName, 384, 176, "X1", model.deviceName),
      flag(288,128,"LED"), flag(288,224,"0"), flag(480,128,relay ? "LOAD" : "VCC"), flag(480,224,"0"),
      ...(relay ? [] : [flag(480,176,"OUT")]),
      text(96,280,`IIN 0 LED PULSE(0 ${model.cmosParameters ? 2 * model.cmosParameters.IF_ON * Math.max(...variationValues(model), 1) : "5m"} 1m 1u 1u 10m 20m)`),
      text(96,312,`VCC VCC 0 ${model.cmosParameters?.VCC ?? 5}`),
      text(96,344, relay ? "RLOAD VCC LOAD 1k" : "RLOAD OUT 0 10k"),
      text(96,376,".tran 0 60m 0 10u")
    ]);
  }

  if (["Thyristor", "Triac"].includes(model.deviceType)) {
    const p = model.thyristorParameters;
    const kMax = Math.max(...variationValues(model), 1);
    const amplitude = Math.max(12, 4 * p.VTO * kMax);
    const load = (amplitude - p.VTO * kMax) / (5 * p.IL * kMax);
    const gate = 2 * Math.max(p.IGT, p.IGT_Q2 || 0, p.IGT_Q3 || 0, p.IGT_Q4 || 0) * kMax;
    const x = model.deviceType === "Triac" ? 32 : 16;
    const gx = model.deviceType === "Triac" ? -16 : -32;
    return finish(model, [
      ...symbol(model.deviceName, 320, 128, "X1", model.deviceName),
      flag(320+x,128,"LOAD"), flag(320+x,192,"0"), flag(320+gx,192,"GATE"),
      text(96,248,`VMAIN SUPPLY 0 SINE(0 ${amplitude} 50)`),
      text(96,280,`RLOAD SUPPLY LOAD ${load}`),
      text(96,312,`VCMD CMD 0 PULSE(0 ${gate} 2m 1u 1u 1m 10m)`),
      text(96,344,`BG 0 GATE I=V(CMD)${model.deviceType === "Triac" ? "*if(V(SUPPLY)>=0,1,-1)" : ""}`),
      text(96,376,".tran 0 60m 0 1u")
    ]);
  }
  if (model.deviceType === "Diode") return writeDiodeTest(model);
  if (model.deviceType === "BJT") return writeBjtTest(model);
  if (model.deviceType === "MOSFET") return writeMosfetTest(model);
  return writePhotoCouplerTest(model);
}
