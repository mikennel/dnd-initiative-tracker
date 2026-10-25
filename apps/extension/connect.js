// Runs only on the tracker's own localhost ports (see manifest). Lets the Settings page know
// the connector is installed, and relays one request/response pair at a time.

document.documentElement.dataset.ddbConnector = chrome.runtime.getManifest().version;

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== 'dnd-tracker/get-cobalt') return;
  chrome.runtime.sendMessage({ type: 'getCobaltSession', openLogin: !!event.data.openLogin }, (res) => {
    const reply = res ?? { ok: false, error: chrome.runtime.lastError?.message ?? 'No response from the extension' };
    window.postMessage({ type: 'dnd-tracker/cobalt', ...reply }, location.origin);
  });
});
