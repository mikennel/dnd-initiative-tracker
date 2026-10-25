// Runs only on the tracker's own localhost ports (see manifest). Lets the Settings page know
// the connector is installed, and relays one request/response pair at a time.

const ext = globalThis.browser ?? globalThis.chrome;
document.documentElement.dataset.ddbConnector = ext.runtime.getManifest().version;

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== 'dnd-tracker/get-cobalt') return;
  ext.runtime
    .sendMessage({ type: 'getCobaltSession', openLogin: !!event.data.openLogin })
    .then(
      (res) => res ?? { ok: false, error: 'No response from the extension' },
      (err) => ({ ok: false, error: String(err?.message ?? err) }),
    )
    .then((reply) => window.postMessage({ type: 'dnd-tracker/cobalt', ...reply }, location.origin));
});
