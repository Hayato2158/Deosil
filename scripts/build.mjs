import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const outputRoot = new URL("../dist/", import.meta.url);

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
