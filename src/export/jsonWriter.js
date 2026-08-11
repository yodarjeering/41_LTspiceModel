export function writeJson(model) {
  return JSON.stringify(model, null, 2) + "\n";
}
