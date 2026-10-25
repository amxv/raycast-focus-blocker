import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { patternToRegex } from "../src/patterns";

type Rule = {
  id: number;
  action: { type: string; redirect: { extensionPath: string } };
  condition: { regexFilter: string; resourceTypes: string[] };
};

test("browser rules block Shorts, allow regular YouTube, intercept SPA navigations, and toggle off", async () => {
  const pattern = "https://www.youtube.com/shorts/*";
  let state = {
    version: 1,
    revision: 1,
    enabled: true,
    rules: [{ id: "youtube-shorts", pattern, regex: patternToRegex(pattern), enabled: true }],
  };
  let rules: Rule[] = [];
  const storage: Record<string, unknown> = {};
  const redirected: Array<{ id: number; url: string }> = [];
  let onAlarm: (alarm: { name: string }) => void = () => {};
  let onHistory: (event: { frameId: number; tabId: number; url: string }) => Promise<void> = async () => {};

  const chrome = {
    declarativeNetRequest: {
      getDynamicRules: async () => [...rules],
      updateDynamicRules: async ({ removeRuleIds, addRules }: { removeRuleIds: number[]; addRules: Rule[] }) => {
        rules = [...rules.filter((rule) => !removeRuleIds.includes(rule.id)), ...addRules];
      },
    },
    alarms: { create: async () => {}, onAlarm: { addListener: (cb: typeof onAlarm) => (onAlarm = cb) } },
    webNavigation: { onHistoryStateUpdated: { addListener: (cb: typeof onHistory) => (onHistory = cb) } },
    storage: {
      local: {
        set: async (data: Record<string, unknown>) => Object.assign(storage, data),
        get: async (name: string) => ({ [name]: storage[name] }),
      },
    },
    runtime: {
      getURL: (file: string) => `chrome-extension://test/${file}`,
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: () => {} },
    },
    tabs: {
      update: async (id: number, data: { url: string }) => redirected.push({ id, url: data.url }),
    },
  };

  const fetch = async (url: string) => {
    if (url.includes("/watch?since=")) return new Promise<never>(() => {});
    return { ok: true, json: async () => structuredClone(state) };
  };

  const file = join(process.cwd(), "browser-extension", "background.js");
  runInNewContext(readFileSync(file, "utf8"), { chrome, fetch, AbortSignal, console });
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
  };
  await settle();

  assert.equal(rules.length, 1);
  assert.equal(rules[0].action.type, "redirect");
  assert.equal(rules[0].condition.resourceTypes[0], "main_frame");
  assert.equal(new RegExp(rules[0].condition.regexFilter).test("https://www.youtube.com/shorts/ABC"), true);
  assert.equal(new RegExp(rules[0].condition.regexFilter).test("https://www.youtube.com/watch?v=ABC"), false);

  await onHistory({ frameId: 0, tabId: 12, url: "https://www.youtube.com/watch?v=ABC" });
  assert.equal(redirected.length, 0);
  await onHistory({ frameId: 0, tabId: 12, url: "https://www.youtube.com/shorts/ABC" });
  assert.deepEqual(redirected, [{ id: 12, url: "chrome-extension://test/blocked.html" }]);

  state = { ...state, revision: 2, enabled: false };
  onAlarm({ name: "focus-blocker-refresh" });
  await settle();
  assert.equal(rules.length, 0);
  redirected.length = 0;
  await onHistory({ frameId: 0, tabId: 12, url: "https://www.youtube.com/shorts/ABC" });
  assert.equal(redirected.length, 0);

  state = { ...state, revision: 3, enabled: true };
  onAlarm({ name: "focus-blocker-refresh" });
  await settle();
  assert.equal(rules.length, 1);
});
