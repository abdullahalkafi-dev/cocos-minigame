// Sends game events to the page/app that embeds the game:
//  - web:     window.parent.postMessage({source:'minigames', type, data})  (read by sdk/minigames.js)
//  - Flutter: a JavaScriptChannel named "MiniGames" receives the same message as a JSON string
export function emit(type: string, data: unknown = {}) {
  const msg = { source: 'minigames', type, data };
  try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*'); } catch { /* ignore */ }
  try {
    const ch = (window as any).MiniGames;
    if (ch && typeof ch.postMessage === 'function') ch.postMessage(JSON.stringify(msg));
  } catch { /* ignore */ }
  try { const rn = (window as any).ReactNativeWebView; if (rn) rn.postMessage(JSON.stringify(msg)); } catch { /* ignore */ }
}
