import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { writeModel } from "../src/ltspice/modelWriter.js";
import { variationName } from "../src/model/modelSettings.js";

const folder = process.argv[2] || await mkdtemp(path.join(tmpdir(), "thyristor-smoke-"));
const scr = createDeviceModel({ deviceName: "SCR_DUT", variant: "Thyristor", variation: { min: 0.8, max: 1.2 } });
const triac = createDeviceModel({ deviceName: "TRIAC_DUT", variant: "Triac", thyristorParameters: { IGT_Q2: 0.015, IGT_Q3: 0.02 } });
const q4 = createDeviceModel({ deviceName: "Q4_DUT", variant: "Triac", thyristorParameters: { q4Enabled: true, IGT_Q4: 0.025 } });
const circuit = `Thyristor datasheet calibration smoke
VS SUP 0 PWL(0 12 7u 12 7.1u 2.3015 9u 2.3015 9.1u 1.3005 11u 1.3005 11.1u -12)
RS SUP ASCR 100
IG 0 GSCR PWL(0 0 1u 0 1.1u 9m 3u 9m 3.1u 13m 5u 13m 5.1u 0 11u 0 11.1u 30m)
XSCR ASCR GSCR 0 SCR_DUT
* Below IL: conducts with gate, but cannot latch at 15mA.
VL SMALL 0 2.3015
RL SMALL ALOW 100
IGL 0 GLOW PWL(0 0 3u 0 3.1u 13m 5u 13m 5.1u 0)
XLOW ALOW GLOW 0 SCR_DUT
* On-state calibration at approximately ITM=4A.
VC CAL 0 41.2
RC CAL ACAL 10
IGC 0 GCAL PULSE(0 30m 1u 1n 1n 20u 30u)
XCAL ACAL GCAL 0 SCR_DUT
* Quadrant checks: QI (+,+), QII (+,-), QIII (-,-), QIV (-,+).
VP POS 0 12
VN NEG 0 -12
R1 POS A1 100
R2 POS A2 100
R3 NEG A3 100
R4 NEG A4 100
R5 NEG A5 100
G1 0 G1 VALUE={if(time>1u,11m,0)}
G2 0 G2 VALUE={if(time>3u,-16m,if(time>1u,-11m,0))}
G3 0 G3 VALUE={if(time>3u,-21m,if(time>1u,-11m,0))}
G4 0 G4 VALUE={if(time>1u,30m,0)}
G5 0 G5 VALUE={if(time>3u,26m,if(time>1u,21m,0))}
X1 A1 G1 0 TRIAC_DUT
X2 A2 G2 0 TRIAC_DUT
X3 A3 G3 0 TRIAC_DUT
X4 A4 G4 0 TRIAC_DUT
X5 A5 G5 0 Q4_DUT
.step param ${variationName(scr)} list 0.8 1 1.2
.tran 0 13u 0 2n
.meas tran trigger_low FIND I(RS) AT=2u
.meas tran triggered FIND I(RS) AT=4u
.meas tran latched FIND I(RS) AT=6u
.meas tran held FIND I(RS) AT=8u
.meas tran extinguished FIND I(RS) AT=10u
.meas tran reverse_blocked FIND I(RS) AT=12u
.meas tran below_il_on FIND I(RL) AT=4u
.meas tran below_il_off FIND I(RL) AT=6u
.meas tran vtm FIND V(ACAL) AT=4u
.meas tran gate_vgt FIND V(GSCR) AT=4u
.meas tran qi FIND I(R1) AT=2u
.meas tran qii_below FIND I(R2) AT=2u
.meas tran qii_on FIND I(R2) AT=4u
.meas tran qiii_below FIND I(R3) AT=2u
.meas tran qiii_on FIND I(R3) AT=4u
.meas tran qiv_disabled FIND I(R4) AT=4u
.meas tran qiv_below FIND I(R5) AT=2u
.meas tran qiv_on FIND I(R5) AT=4u
${writeModel(scr)}
${writeModel(triac)}
${writeModel(q4)}
.end
`;
await writeFile(path.join(folder, "Thyristor.cir"), circuit);
console.log(path.join(folder, "Thyristor.cir"));
