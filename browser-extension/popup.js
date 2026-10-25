/* global chrome */
async function render() {
  const { focusBlocker } = await chrome.storage.local.get("focusBlocker");
  const status = document.getElementById("status");
  const description = document.getElementById("description");
  if (!focusBlocker) {
    status.textContent = "Not synced yet";
    description.textContent = "Open Manage Blocked Websites in Raycast, then sync again.";
    return;
  }
  status.textContent = focusBlocker.enabled ? "Blocking is ON" : "Blocking is OFF";
  description.textContent = `${focusBlocker.patterns.length} active rules. Use Raycast to add, remove, or pause websites.`;
}
document.getElementById("sync").addEventListener("click", async () => {
  document.getElementById("status").textContent = "Syncing...";
  await chrome.runtime.sendMessage({ type: "refresh" });
  await render();
});
void render();
