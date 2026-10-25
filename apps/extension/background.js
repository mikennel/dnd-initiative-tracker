// D&D Beyond connector (ADR 0006). Reads the HttpOnly CobaltSession cookie, which page
// scripts can't, and hands it to the tracker's Settings page via connect.js. It only reads
// the cookie: it never calls D&D Beyond itself and never stores the value.

const DDB = 'https://www.dndbeyond.com';
const LOGIN = 'https://www.dndbeyond.com/sign-in';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'getCobaltSession') return false;
  (async () => {
    const cookie = await chrome.cookies.get({ url: DDB, name: 'CobaltSession' });
    if (cookie?.value) return sendResponse({ ok: true, value: cookie.value });
    // Not logged in: open the D&D Beyond sign-in once; the page polls until the cookie appears.
    if (msg.openLogin) await chrome.tabs.create({ url: LOGIN });
    sendResponse({ ok: false, pending: true });
  })().catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
