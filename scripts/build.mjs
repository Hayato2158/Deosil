import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const projectRoot = new URL("../", import.meta.url);
const outputRoot = new URL("../dist/", import.meta.url);
const shouldMinify = !process.argv.includes("--no-minify");

async function minifyFile(sourceUrl, outputUrl, loader) {
  const source = await readFile(sourceUrl, "utf8");
  const commonOptions = {
    loader,
    charset: "utf8",
    legalComments: "eof",
    sourcemap: false,
  };
  const result = await transform(source, loader === "js"
    ? {
        ...commonOptions,
        target: "es2022",
        minifyWhitespace: true,
        minifySyntax: true,
        // Classic scripts share a few global names across files, so keep identifiers stable.
        minifyIdentifiers: false,
      }
    : {
        ...commonOptions,
        minify: true,
      });

  await writeFile(outputUrl, result.code, "utf8");
}

async function minifyDirectory(relativeDirectory, extension, loader) {
  const sourceDirectory = new URL(`../${relativeDirectory}/`, import.meta.url);
  const outputDirectory = new URL(`../dist/${relativeDirectory}/`, import.meta.url);
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  await Promise.all(entries
    .filter((entry) => entry.isFile() && extname(entry.name) === extension)
    .map((entry) => minifyFile(
      new URL(entry.name, sourceDirectory),
      new URL(entry.name, outputDirectory),
      loader,
    )));
}

await rm(outputRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
await mkdir(outputRoot, { recursive: true });

for (const directory of ["assets", "icons"]) {
  await cp(new URL(`../${directory}/`, import.meta.url), new URL(`../dist/${directory}/`, import.meta.url), {
    recursive: true,
  });
}

const rootFiles = await readdir(projectRoot, { withFileTypes: true });
for (const entry of rootFiles) {
  if (!entry.isFile()) continue;
  if (!entry.name.endsWith(".html") && !["manifest.webmanifest", "service-worker.js", "_headers"].includes(entry.name)) {
    continue;
  }
  await cp(join(fileURLToPath(projectRoot), entry.name), join(fileURLToPath(outputRoot), entry.name));
}

if (shouldMinify) {
  await Promise.all([
    minifyDirectory("assets/scripts", ".js", "js"),
    minifyDirectory("assets/style", ".css", "css"),
    minifyFile(
      new URL("../service-worker.js", import.meta.url),
      new URL("../dist/service-worker.js", import.meta.url),
      "js",
    ),
  ]);
}

console.log(`Built dist with ${shouldMinify ? "minified" : "unminified"} browser assets.`);
