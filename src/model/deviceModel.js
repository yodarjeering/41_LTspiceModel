const DEFINITIONS = {
  Diode: { modelType: "MODEL", polarity: "D", prefix: "D", pins: ["A", "K"] },
  "BJT-NPN": { modelType: "MODEL", polarity: "NPN", prefix: "Q", pins: ["C", "B", "E"] },
  "BJT-PNP": { modelType: "MODEL", polarity: "PNP", prefix: "Q", pins: ["C", "B", "E"] },
  "MOSFET-NMOS-Basic": { modelType: "MODEL", polarity: "NMOS", prefix: "M", pins: ["D", "G", "S"] },
  "MOSFET-PMOS-Basic": { modelType: "MODEL", polarity: "PMOS", prefix: "M", pins: ["D", "G", "S"] },
  "MOSFET-NMOS-Advanced": { modelType: "SUBCKT", polarity: "NMOS", prefix: "X", pins: ["D", "G", "S"] },
  "MOSFET-PMOS-Advanced": { modelType: "SUBCKT", polarity: "PMOS", prefix: "X", pins: ["D", "G", "S"] },
  PhotoCoupler: { modelType: "SUBCKT", polarity: "PhotoCoupler", prefix: "X", pins: ["A", "K", "C", "E"] }
};

export const deviceOptions = Object.keys(DEFINITIONS);

export function createDeviceModel(input) {
  const definition = DEFINITIONS[input.variant];
  if (!definition) throw new Error(`Unsupported device variant: ${input.variant}`);
  const deviceName = String(input.deviceName || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_");
  if (!deviceName) throw new Error("Device name is required.");
  const deviceType = input.variant.startsWith("BJT") ? "BJT"
    : input.variant.startsWith("MOSFET") ? "MOSFET" : input.variant;
  return {
    schemaVersion: 1,
    deviceName,
    deviceType,
    variant: input.variant,
    modelType: definition.modelType,
    polarity: definition.polarity,
    symbolPrefix: definition.prefix,
    symbolBase: input.variant === "Diode" ? "diode"
      : input.variant === "BJT-NPN" ? "npn"
      : input.variant === "BJT-PNP" ? "pnp"
      : input.variant.includes("NMOS") ? "nmos"
      : input.variant.includes("PMOS") ? "pmos" : "opto-coupler",
    pins: definition.pins.map((name, index) => ({ name, spiceOrder: index + 1 })),
    spiceParameters: { ...(input.spiceParameters || {}) },
    characteristicCurves: input.characteristicCurves || [],
    temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 27,
    fittingError: input.fittingError ?? null,
    fittingWarnings: input.fittingWarnings || [],
    parameterSources: input.parameterSources || {},
    generatedAt: input.generatedAt || new Date().toISOString(),
    generatorVersion: input.generatorVersion || "1.0.0"
  };
}

export function assertDeviceModel(model) {
  if (!model.deviceName || !model.modelType || !Array.isArray(model.pins)) throw new Error("Invalid common model data.");
  model.pins.forEach((pin, index) => {
    if (!pin.name || pin.spiceOrder !== index + 1) throw new Error("pins must have contiguous SpiceOrder values starting at 1.");
  });
  return model;
}
