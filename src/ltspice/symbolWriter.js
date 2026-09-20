import { assertDeviceModel } from "../model/deviceModel.js";

// Geometry and pin locations are based directly on LTspice's bundled
// diode.asy, npn.asy, pnp.asy, nmos.asy, pmos.asy and Optos/PC817A.asy.
export const symbolGeometry = {
  diode: ["LINE Normal 0 44 32 44","LINE Normal 0 20 32 20","LINE Normal 32 20 16 44","LINE Normal 0 20 16 44","LINE Normal 16 0 16 20","LINE Normal 16 44 16 64","WINDOW 0 24 0 Left 2","WINDOW 3 24 64 Left 2"],
  npn: ["LINE Normal 44 76 36 84","LINE Normal 64 96 44 76","LINE Normal 64 96 36 84","LINE Normal 40 80 16 64","LINE Normal 16 80 16 16","LINE Normal 16 32 64 0","LINE Normal 16 48 0 48","WINDOW 0 56 32 Left 2","WINDOW 3 56 68 Left 2"],
  pnp: ["LINE Normal 16 64 44 76","LINE Normal 44 76 36 84","LINE Normal 16 64 36 84","LINE Normal 40 80 64 96","LINE Normal 16 80 16 16","LINE Normal 16 32 64 0","LINE Normal 16 48 0 48","WINDOW 0 84 32 Left 2","WINDOW 3 84 68 Left 2"],
  nmos: ["LINE Normal 48 48 48 96","LINE Normal 16 80 48 80","LINE Normal 40 48 48 48","LINE Normal 16 48 40 44","LINE Normal 16 48 40 52","LINE Normal 40 44 40 52","LINE Normal 16 8 16 24","LINE Normal 16 40 16 56","LINE Normal 16 72 16 88","LINE Normal 0 80 8 80","LINE Normal 8 16 8 80","LINE Normal 48 16 16 16","LINE Normal 48 0 48 16","WINDOW 0 56 32 Left 2","WINDOW 3 56 72 Left 2"],
  pmos: ["LINE Normal 48 48 48 96","LINE Normal 16 80 48 80","LINE Normal 16 48 24 48","LINE Normal 48 48 24 44","LINE Normal 48 48 24 52","LINE Normal 24 44 24 52","LINE Normal 16 8 16 24","LINE Normal 16 40 16 56","LINE Normal 16 72 16 88","LINE Normal 0 80 8 80","LINE Normal 8 16 8 80","LINE Normal 48 16 16 16","LINE Normal 48 0 48 16","WINDOW 0 56 32 Left 2","WINDOW 3 56 72 Left 2"],
  "opto-coupler": ["LINE Normal -96 -48 -56 -48","LINE Normal -56 -16 -56 -48","LINE Normal -56 16 -56 48","LINE Normal -96 48 -56 48","LINE Normal -80 -16 -32 -16","LINE Normal -56 16 -32 -16","LINE Normal -56 16 -80 -16","LINE Normal -80 16 -32 16","LINE Normal 96 -48 72 -48","LINE Normal 32 0 72 -48","LINE Normal 32 0 68 36","LINE Normal 32 -28 32 28","LINE Normal 96 48 80 48","LINE Normal 80 48 64 40","LINE Normal 80 48 72 32","LINE Normal 64 40 72 32","LINE Normal 24 0 12 -4","LINE Normal 24 0 20 -12","LINE Normal 20 -4 24 0","RECTANGLE Normal -96 -64 96 64","ARC Normal -4 12 20 -12 16 -4 -4 0","ARC Normal -28 12 -4 -12 -28 4 -4 0","WINDOW 0 0 -80 Center 2","WINDOW 3 0 80 Center 2"]
};
export const symbolPinLocations={diode:[[16,0],[16,64]],npn:[[64,0],[0,48],[64,96]],pnp:[[64,0],[0,48],[64,96]],nmos:[[48,0],[0,80],[48,96]],pmos:[[48,0],[0,80],[48,96]],"opto-coupler":[[-96,-48],[-96,48],[96,-48],[96,48]]};

export function writeSymbol(model) {
  assertDeviceModel(model);const base=model.symbolBase,lines=["Version 4","SymbolType CELL",...symbolGeometry[base],`SYMATTR Value ${model.deviceName}`,`SYMATTR Prefix ${model.symbolPrefix}`,`SYMATTR ModelFile ${model.deviceName}.lib`,`SYMATTR Description ${model.variant} generated from LTspice ${base} symbol`];
  model.pins.forEach((p,index)=>{const [x,y]=symbolPinLocations[base][index];lines.push(`PIN ${x} ${y} NONE 0`,`PINATTR PinName ${p.name}`,`PINATTR SpiceOrder ${p.spiceOrder}`);});
  return [...lines,""].join("\n");
}
