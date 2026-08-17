import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const importPattern = /import\s+[\s\S]*?\s+from\s+["'](.+?)["'];/g;

async function bundleModules(entryPath) {
  const visited = new Set();
  const modules = [];

  async function visit(modulePath) {
    const absolutePath = path.resolve(modulePath);
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);

    const source = await readFile(absolutePath, "utf8");
    const dependencies = [...source.matchAll(importPattern)].map(match => {
      return path.resolve(path.dirname(absolutePath), match[1]);
    });
    for (const dependency of dependencies) await visit(dependency);

    const relativePath = path.relative(projectRoot, absolutePath).replaceAll("\\", "/");
    const transformed = source
      .replace(importPattern, "")
      .replace(/\bexport\s+(?=(?:const|let|var|function|class)\b)/g, "")
      .trim();
    modules.push(`// ${relativePath}\n${transformed}`);
  }

  await visit(entryPath);
  return `(function () {\n"use strict";\n\n${modules.join("\n\n")}\n})();\n`;
}

export async function buildRelease(outputDirectory = path.join(projectRoot, "dist")) {
  const [html, css, javascript] = await Promise.all([
    readFile(path.join(projectRoot, "index.html"), "utf8"),
    readFile(path.join(projectRoot, "src/styles.css"), "utf8"),
    bundleModules(path.join(projectRoot, "src/app.js"))
  ]);

  const releaseHtml = html
    .replace(/<link\s+rel="stylesheet"\s+href="src\/styles\.css">/, `<style>\n${css}\n</style>`)
    .replace(/<script\s+type="module"\s+src="src\/app\.js"><\/script>/, `<script>\n${javascript}</script>`)
    .replace("<title>", "<!-- Standalone offline release: no local server required. -->\n<title>");

  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "LTspiceModelGenerator.html");
  await writeFile(outputPath, releaseHtml, "utf8");
  return outputPath;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const outputPath = await buildRelease();
  console.log(`Built standalone release: ${outputPath}`);
}
