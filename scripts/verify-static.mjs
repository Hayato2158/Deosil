import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const scriptRoot = join(root, "assets", "scripts");
const files = [
  ...(await readdir(root)).filter((name) => name.endsWith(".html")).map((name) => join(root, name)),
  ...(await readdir(scriptRoot)).filter((name) => name.endsWith(".js")).map((name) => join(scriptRoot, name)),
];

const forbidden = [
  /supabase-js/i,
  /App\.supabase/,
  /window\.supabase/,
  /SUPABASE_ANON_KEY/,
  /SUPABASE_URL/,
  /indexedDB/i,
  /<script[^>]+src=["']https?:\/\//i,
];

const violations = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) violations.push(`${file}: ${pattern}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Browser bundle security verification failed:\n${violations.join("\n")}`);
}

for (const file of (await readdir(scriptRoot)).filter((name) => name.endsWith(".js"))) {
  const content = await readFile(join(scriptRoot, file), "utf8");
  const matches = content.match(/localStorage/g) ?? [];
  if (matches.length > 0) {
    throw new Error(`${file} must not access localStorage`);
  }
}

console.log(`Verified ${files.length} browser source files.`);
