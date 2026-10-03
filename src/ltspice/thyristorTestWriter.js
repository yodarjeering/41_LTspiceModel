

// Independent fixtures and numeric expectations, consumed by either UI export or CLI.
export function writeThyristorTests(model) {
  if (model.variant !== "Thyristor") return {};
  const p = model.thyristorParameters;
  const k = model.variation?.k ?? 1;
  const factor = target => model.variation?.target === target ? k : 1;
  const igt = p.IGT * factor("IGT"), il = p.IL * factor("HOLDING"), ih = p.IH * factor("HOLDING");
  const vt = p.VTO * factor("ON_VOLTAGE"), rd = p.RD * factor("ON_VOLTAGE");
  const load = 100;
  const supply = current => vt + (load + rd) * current;
  const high = 2 * il, low = 0.8 * ih, held = 1.2 * ih;
  const gateIs = p.IGT / Math.expm1(p.VGT / (2 * 8.617333262e-5 * 300.15));
  const gateVoltage = 2 * 8.617333262e-5 * 300.15 * Math.log1p(igt / gateIs);
  const fixtures = {};
  function add(name, voltage, gate, checks) {
    const measures = checks.map(([key, at]) => `.meas tran ${key} FIND ${key === "vt" || key === "vgt" ? (key === "vt" ? "V(A)" : "V(G)") : "I(RLOAD)"} AT=${at}u`).join("\n");
    fixtures[name] = {
      circuit: `SCR ${name}\n.include ${model.deviceName}.lib\nVMAIN SUP 0 ${voltage}\nRLOAD SUP A ${load}\nIGATE 0 G ${gate}\nXDUT A G 0 ${model.deviceName}\n.tran 0 10u 0 2n\n${measures}\n.end\n`,
      checks: checks.map(([key, , expected, absoluteTolerance]) => ({ name: key, expected, absoluteTolerance }))
    };
  }
  const offTolerance = Math.max(1e-8, supply(high) / p.ROFF * 2);
  const onTolerance = high * 0.01;
  add("igt", supply(high), `PWL(0 0 1u 0 1.01u ${0.8 * igt} 3u ${0.8 * igt} 3.01u ${1.2 * igt} 5u ${1.2 * igt} 5.01u 0)`,
    [["below_igt", 2, 0, offTolerance], ["triggered", 4, high, onTolerance], ["latched", 6, high, onTolerance]]);
  add("il", `PWL(0 ${supply(low)} 4u ${supply(low)} 4.01u ${supply(high)})`, `PWL(0 0 1u 0 1.01u ${2 * igt} 2u ${2 * igt} 2.01u 0 5u 0 5.01u ${2 * igt} 6u ${2 * igt} 6.01u 0)`,
    [["gate_on_below_il", 1.8, low, low * 0.01], ["not_latched", 3, 0, offTolerance], ["latched_above_il", 7, high, onTolerance]]);
  add("ih", `PWL(0 ${supply(high)} 4u ${supply(high)} 4.01u ${supply(held)} 6u ${supply(held)} 6.01u ${supply(low)})`, `PULSE(0 ${2 * igt} 1u 1n 1n 1u 20u)`,
    [["initial_latch", 3, high, onTolerance], ["above_ih", 5, held, held * 0.01], ["below_ih_off", 7, 0, offTolerance]]);
  add("on_voltage", supply(high), `PULSE(0 ${igt} 1u 1n 1n 8u 20u)`,
    [["vt", 4, vt + rd * high, 0.002], ["vgt", 4, gateVoltage, 0.002]]);
  return fixtures;
}
