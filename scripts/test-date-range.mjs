import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const code = await readFile(new URL("../assets/scripts/date-range.js", import.meta.url), "utf8");
const context = { window: { App: {} } };
vm.runInNewContext(code, context);

const enumerate = context.window.App.enumerateDateRange;

assert.deepEqual([...enumerate("2026-09-19", "2026-09-19")], ["2026-09-19"]);
assert.deepEqual([...enumerate("2024-02-28", "2024-03-01")], [
  "2024-02-28",
  "2024-02-29",
  "2024-03-01",
]);
assert.deepEqual([...enumerate("2026-12-30", "2027-01-02")], [
  "2026-12-30",
  "2026-12-31",
  "2027-01-01",
  "2027-01-02",
]);
assert.deepEqual([...enumerate("2026-09-20", "2026-09-19")], []);
assert.deepEqual([...enumerate("2026-02-30", "2026-03-01")], []);

console.log("Verified inclusive leave date range behavior.");
