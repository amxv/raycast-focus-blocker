/* global chrome */
document.getElementById("close").addEventListener("click", () => {
  chrome.tabs.getCurrent((tab) => {
    if (tab?.id) chrome.tabs.remove(tab.id);
  });
});
document.getElementById("back").addEventListener("click", () => history.back());
