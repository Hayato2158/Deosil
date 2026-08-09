import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const sbCode = await readFile(new URL("../assets/scripts/sb.js", import.meta.url), "utf8");
const coreCode = await readFile(new URL("../assets/scripts/core.js", import.meta.url), "utf8");

function createContext(overrides = {}) {
  const context = {
    Headers,
    URL,
    console: {
      log() {},
      warn() {},
      error() {},
    },
    location: {
      pathname: "/home.html",
      href: "/home.html",
    },
    navigator: {},
    document: {},
    localStorage: {},
    ...overrides,
  };
  context.window = context;
  return vm.createContext(context);
}

async function testGetAuthedUser() {
  const unauthorizedContext = createContext({
    fetch: async () => new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    ),
  });
  vm.runInContext(sbCode, unauthorizedContext);
  unauthorizedContext.App.userId = "existing-user";
  assert.equal(await unauthorizedContext.App.getAuthedUser(), null);
  assert.equal(unauthorizedContext.App.userId, null);

  for (const fetchFailure of [
    async () => new Response(
      JSON.stringify({ error: "temporarily unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    ),
    async () => {
      throw new TypeError("network failed");
    },
  ]) {
    const transientContext = createContext({ fetch: fetchFailure });
    vm.runInContext(sbCode, transientContext);
    transientContext.App.userId = "existing-user";
    await assert.rejects(() => transientContext.App.getAuthedUser());
    assert.equal(transientContext.App.userId, "existing-user");
  }
}

async function testRequireLoginStaysOnCurrentPageForTransientFailure() {
  const elements = new Map();
  const body = {
    prepend(element) {
      elements.set(element.id, element);
    },
  };
  const document = {
    body,
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    createElement() {
      return {
        id: "",
        className: "",
        textContent: "",
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
    },
  };
  const context = createContext({ document });
  vm.runInContext(coreCode, context);
  context.App.getAuthedUser = async () => {
    const error = new Error("temporarily unavailable");
    error.status = 503;
    throw error;
  };

  assert.equal(await context.App.requireLogin(), null);
  assert.equal(context.location.href, "/home.html");
  const message = elements.get("authStatusError");
  assert.ok(message);
  assert.equal(message.attributes.role, "alert");
  assert.match(message.textContent, /ログイン状態を確認できませんでした/);
}

await testGetAuthedUser();
await testRequireLoginStaysOnCurrentPageForTransientFailure();
console.log("Verified browser authentication error handling.");
