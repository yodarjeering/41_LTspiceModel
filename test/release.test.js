import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRelease } from "../scripts/build-release.mjs";

test("standalone release embeds all CSS and JavaScript", async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "ltspice-release-"));
  const outputPath = await buildRelease(outputDirectory);
  const html = await readFile(outputPath, "utf8");

  assert.match(html, /<style>[\s\S]*\.characteristic-grid/);
  assert.match(html, /<script>[\s\S]*function fitCharacteristics/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+stylesheet/);
  assert.doesNotMatch(html, /\bimport\s+{/);
  assert.doesNotMatch(html, /\bexport\s+(?:const|function)/);
});
