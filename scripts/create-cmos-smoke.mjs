import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDeviceModel } from "../src/model/deviceModel.js";
import { writeModel } from "../src/ltspice/modelWriter.js";
import { variationName } from "../src/model/modelSettings.js";

// Run the generated circuit with LTspice -b. No proprietary model is required.
const output = process.argv[2] || await mkdtemp(path.join(tmpdir(), "cmos-smoke-"));
const inv = createDeviceModel({ deviceName: "INV_DUT", variant: "PhotoCoupler-CMOS", variation: { min: 0.8, max: 1.2 } });
const noninv = createDeviceModel({ deviceName: "BUF_DUT", variant: "PhotoCoupler-CMOS", cmosParameters: { inverting: false } });
const circuit = `CMOS datasheet smoke
VCC VCC 0 5
IIN 0 LED PWL(0 0 1u 0 1.1u 3.2m 3u 3.2m 3.1u 1.4m 5u 1.4m 5.1u 0.8m)
BTHRESH THRESH 0 V=I(IIN)/${variationName(inv)}
RTHRESH THRESH 0 1T
XINV LED K1 VCC 0 OINV INV_DUT
XBUF K1 0 VCC 0 OBUF BUF_DUT
RINV OINV 0 10k
RBUF OBUF 0 10k
* Static specified load checks: default inverted LED-off=High / LED-on=Low.
XHIGH 0 0 VCC 0 OHIGH INV_DUT
IHIGH OHIGH 0 4m
ILOW 0 LLED 5m
XLOW LLED 0 VCC 0 OLOW INV_DUT
ILOAD 0 OLOW 4m
.step param ${variationName(inv)} list 0.8 1 1.2
.tran 0 7u 0 1n
.meas tran inv_on FIND V(OINV) AT=2u
.meas tran buf_on FIND V(OBUF) AT=2u
.meas tran hysteresis FIND V(OINV) AT=4u
.meas tran inv_off FIND V(OINV) AT=6u
.meas tran voh FIND V(OHIGH) AT=6u
.meas tran vol FIND V(OLOW) AT=6u
.meas tran delay_fall TRIG V(THRESH) VAL=1.6m RISE=1 TARG V(OINV) VAL=2.5 FALL=1
${writeModel(inv)}
${writeModel(noninv)}
.end
`;
await writeFile(path.join(output, "CMOS.cir"), circuit);
console.log(path.join(output, "CMOS.cir"));
