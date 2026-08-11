# LTspice package output design

- `.model` variants: Diode=`D`, BJT=`Q`, Basic MOSFET=`M`.
- `.SUBCKT` variants: Advanced MOSFET and PhotoCoupler use `X`.
- Every symbol carries `Value`, `SpiceModel`, and `ModelFile`; package files are siblings of the test schematic.
- Subcircuit port lists and `PINATTR SpiceOrder` are both generated from the common ordered `pins` array.
- Model fitting remains outside the output writers. Writers accept a normalized snapshot and have no graph-fitting dependency.

LTspice 24 portability is based on keeping `.asc`, `.asy`, and `.lib` in the same schematic directory. The generated README also explains search-path installation for reuse.
