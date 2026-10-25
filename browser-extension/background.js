/* global chrome */
"use strict";

// In-memory browser rule cache; DNR keeps rules active across service-worker suspension.
const BRIDGE = "http://127.0.0.1:47846";
const REFRESH_ALARM = "focus-blocker-refresh";
let appliedRevision = -1;
let updating = Promise.resolve();
let watching = false;

function applyState(state) {
  const update = updating.then(async () => {
    if (state.version !== 1 || typeof state.enabled !== "boolean" || !Array.isArray(state.rules)) {
      throw new Error("Invalid bridge response");
    }
    if (!Number.isSafeInteger(state.revision) || state.revision < 0 || state.revision <= appliedRevision) return;
    const enabledRules = state.enabled ? state.rules.filter((rule) => rule.enabled) : [];
    if (enabledRules.length > 1000) throw new Error("Too many website rules");
    const rules = enabledRules.map((rule, index) => {
      if (typeof rule.regex !== "string" || rule.regex.length > 2048 || !/^\^https?(?:\?|:)/.test(rule.regex)) {
        throw new Error("Invalid URL regex");
      }
      return {
        id: index + 1,
        priority: 1,
        action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } },
        condition: { regexFilter: rule.regex, resourceTypes: ["main_frame"] },
      };
    });

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    // One atomic update; no momentary window where blocking is switched off.
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((rule) => rule.id),
      addRules: rules,
    });
    await chrome.storage.local.set({
      focusBlocker: { enabled: state.enabled, patterns: enabledRules.map((rule) => rule.regex), revision: state.revision },
    });
    appliedRevision = state.revision;
  });
  // Do not break the update chain if one write fails, but let the caller retry.
  updating = update.catch((error) => console.warn("Focus Blocker update failed:", error));
  return update;
}

async function fetchState(since) {
  const endpoint = Number.isInteger(since) && since >= 0 ? `/watch?since=${since}` : "/state";
  const response = await fetch(`${BRIDGE}${endpoint}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(26000),
  });
  if (!response.ok) throw new Error(`Bridge returned ${response.status}`);
  return response.json();
}

async function refresh() {
  try {
    await applyState(await fetchState());
  } catch (error) {
    // If the bridge is unavailable, keep DNR rules from the previous sync.
    console.warn("Focus Blocker could not sync; existing rules remain active", error);
  }
}

async function watchChanges() {
  if (watching) return;
  watching = true;
  try {
    while (true) {
      const state = await fetchState(appliedRevision);
      await applyState(state);
    }
  } catch {
    // Chrome suspends background workers. A 30-second alarm is the fallback.
  } finally {
    watching = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 0.5 });
  void refresh();
  void watchChanges();
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 0.5 });
  void refresh();
  void watchChanges();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== REFRESH_ALARM) return;
  void refresh();
  void watchChanges();
});

// YouTube (and other SPAs) often navigate with history.pushState rather than
// loading a new document. DNR sees full navigations; this handles SPA changes.
// It runs only when navigation happens and doesn't need a content script or a
// timer on every tab.
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  try {
    const stored = await chrome.storage.local.get("focusBlocker");
    const data = stored.focusBlocker;
    if (!data?.enabled || !Array.isArray(data.patterns)) return;
    if (data.patterns.some((pattern) => new RegExp(pattern).test(details.url))) {
      await chrome.tabs.update(details.tabId, { url: chrome.runtime.getURL("blocked.html") });
    }
  } catch (error) {
    console.warn("Focus Blocker SPA navigation check failed", error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "refresh") return;
  refresh().then(async () => {
    const { focusBlocker } = await chrome.storage.local.get("focusBlocker");
    sendResponse(focusBlocker ?? null);
  });
  return true;
});

void chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 0.5 });
void refresh();
void watchChanges();
