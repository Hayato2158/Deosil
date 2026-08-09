import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = fileURLToPath(new URL("../.test-dist/", import.meta.url));

if (resolve(outputDirectory) !== resolve(projectRoot, ".test-dist")) {
  throw new Error("Refusing to use an unexpected test output directory.");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function addJsExtensions(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await addJsExtensions(path);
      continue;
    }
    if (!entry.name.endsWith(".js")) continue;
    const code = await readFile(path, "utf8");
    const rewritten = code.replace(
      /(from\s+["'])(\.\.?\/[^"']+)(["'])/g,
      (match, prefix, specifier, suffix) => (
        /\.[a-z0-9]+$/i.test(specifier) ? match : `${prefix}${specifier}.js${suffix}`
      ),
    );
    await writeFile(path, rewritten);
  }
}

try {
  await rm(outputDirectory, { recursive: true, force: true });
  await run(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--noEmit", "false",
    "--outDir", ".test-dist",
    "--rootDir", "src",
    "--module", "ESNext",
    "--moduleResolution", "Bundler",
    "--target", "ES2022",
  ]);
  await addJsExtensions(outputDirectory);
  await run(process.execPath, [
    "--test",
    "tests/backend.test.mjs",
  ]);
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
