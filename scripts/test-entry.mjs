import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const code = await readFile(new URL("../assets/scripts/entry.js", import.meta.url), "utf8");

function runEntry(hostname, initialStorage = {}) {
  const storage = new Map(Object.entries(initialStorage));
  const elements = {
    entryLoader: {
      hidden: false,
      setAttribute(name) {
        if (name === "hidden") this.hidden = true;
      },
    },
    migrationNotice: {
      hidden: true,
      removeAttribute(name) {
        if (name === "hidden") this.hidden = false;
      },
    },
  };
  const classes = new Set();
  let replacement = null;

  const context = {
    location: {
      hostname,
      replace(value) {
        replacement = value;
      },
    },
    localStorage: {
      get length() {
        return storage.size;
      },
      key(index) {
        return [...storage.keys()][index] ?? null;
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    navigator: {},
    document: {
      title: "Deosil",
      body: {
        classList: {
          add(name) {
            classes.add(name);
          },
        },
      },
      getElementById(id) {
        return elements[id] ?? null;
      },
    },
  };

  vm.runInNewContext(code, context);
  return { replacement, storage, elements, classes, title: context.document.title };
}

const worker = runEntry("deosil.hayato2158.workers.dev", {
  "sb-bllysyzdusuregqlraoi-auth-token": "must-not-be-touched-on-new-origin",
});
assert.equal(worker.replacement, "./home.html");
assert.equal(worker.storage.size, 1);

const legacy = runEntry("hayato2158.github.io", {
  "sb-bllysyzdusuregqlraoi-auth-token": "legacy-session",
  "unrelated-setting": "preserve-me",
});
assert.equal(legacy.replacement, null);
assert.equal(legacy.storage.has("sb-bllysyzdusuregqlraoi-auth-token"), false);
assert.equal(legacy.storage.get("unrelated-setting"), "preserve-me");
assert.equal(legacy.elements.entryLoader.hidden, true);
assert.equal(legacy.elements.migrationNotice.hidden, false);
assert.equal(legacy.classes.has("migrationPage"), true);
assert.equal(legacy.title, "Deosilは移行しました");

console.log("Verified Cloudflare and legacy GitHub Pages entry behavior.");
