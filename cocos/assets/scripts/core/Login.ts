// Username screen: a real HTML overlay (best keyboard behaviour on phones and in WebViews).
import { Sfx } from './Sfx';

export function showLogin(cfg: any, tryLogin: (username: string) => Promise<void>): Promise<void> {
  return new Promise(resolve => {
    const t = cfg.theme || {};
    const primary = t.primary || '#7c3aed', accent = t.secondary || '#fbbf24', bg = t.background || '#1e1b4b', text = t.text || '#ffffff';
    const wrap = document.createElement('div');
    wrap.id = 'mg-login';
    wrap.innerHTML = `
      <style>
        #mg-login{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;
          background:radial-gradient(ellipse at 50% 30%, ${primary}55 0%, ${bg}ee 60%, ${bg} 100%);
          font-family:'Trebuchet MS',Arial,sans-serif;color:${text};animation:mgfade .35s ease-out}
        #mg-login .card{width:min(360px,100%);background:rgba(0,0,0,.38);border:2px solid ${accent}88;border-radius:26px;padding:28px 24px;
          backdrop-filter:blur(10px);box-shadow:0 20px 60px rgba(0,0,0,.5), 0 0 40px ${primary}55;text-align:center;animation:mgpop .45s cubic-bezier(.2,1.4,.4,1)}
        #mg-login h1{margin:0 0 4px;font-size:30px;letter-spacing:.5px;color:${accent};text-shadow:0 3px 0 rgba(0,0,0,.35)}
        #mg-login p{margin:0 0 18px;opacity:.85;font-size:15px}
        #mg-login input{width:100%;box-sizing:border-box;padding:14px 16px;font-size:18px;text-align:center;border-radius:14px;border:2px solid rgba(255,255,255,.25);
          background:rgba(255,255,255,.1);color:${text};outline:none;font-family:inherit;transition:.15s}
        #mg-login input:focus{border-color:${accent};background:rgba(255,255,255,.16)}
        #mg-login button{margin-top:14px;width:100%;padding:15px;font-size:19px;font-weight:800;letter-spacing:1px;border:0;border-radius:14px;cursor:pointer;
          color:#1b1030;background:linear-gradient(${accent},${primary});box-shadow:0 5px 0 rgba(0,0,0,.35);font-family:inherit;transition:transform .1s}
        #mg-login button:active{transform:translateY(3px);box-shadow:0 2px 0 rgba(0,0,0,.35)}
        #mg-login button:disabled{opacity:.6}
        #mg-login .err{min-height:20px;margin-top:10px;color:#fecaca;font-size:14px}
        #mg-login small{display:block;margin-top:6px;opacity:.6;font-size:12px}
        @keyframes mgfade{from{opacity:0}} @keyframes mgpop{from{transform:scale(.8);opacity:0}}
      </style>
      <div class="card">
        <h1></h1><p>Pick a username to start playing</p>
        <input type="text" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Your username" />
        <div class="err"></div>
        <button type="button">PLAY</button>
        <small>3-20 characters: letters, numbers, _ . -</small>
      </div>`;
    (wrap.querySelector('h1') as HTMLElement).textContent = cfg.title || 'Play';
    const input = wrap.querySelector('input') as HTMLInputElement;
    const btn = wrap.querySelector('button') as HTMLButtonElement;
    const err = wrap.querySelector('.err') as HTMLElement;
    try { input.value = localStorage.getItem('mgs_last_username') || ''; } catch { /* ignore */ }

    const submit = async () => {
      Sfx.unlock(); Sfx.click();
      const name = input.value.trim();
      if (!/^[A-Za-z0-9_.-]{3,20}$/.test(name)) { err.textContent = 'Use 3-20 letters, numbers, _ . -'; return; }
      btn.disabled = true; btn.textContent = '…'; err.textContent = '';
      try {
        await tryLogin(name);
        try { localStorage.setItem('mgs_last_username', name); } catch { /* ignore */ }
        wrap.style.transition = 'opacity .3s'; wrap.style.opacity = '0';
        setTimeout(() => wrap.remove(), 320);
        resolve();
      } catch (e: any) {
        err.textContent = e.message || 'Could not sign in';
        btn.disabled = false; btn.textContent = 'PLAY';
      }
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    document.body.appendChild(wrap);
    setTimeout(() => input.focus(), 350);
  });
}

export function showFatal(message: string, canRetry = true) {
  document.getElementById('mg-fatal')?.remove();
  const d = document.createElement('div');
  d.id = 'mg-fatal';
  d.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:#0b0d14;color:#fff;font-family:Arial,sans-serif;padding:24px;text-align:center';
  d.innerHTML = `<div style="max-width:340px"><div style="font-size:44px">⚠️</div><h2 style="margin:8px 0">Game unavailable</h2><p style="opacity:.8;line-height:1.5"></p>${canRetry ? '<button style="margin-top:16px;padding:12px 28px;font-size:16px;border:0;border-radius:12px;background:#7c3aed;color:#fff;cursor:pointer">Try again</button>' : ''}</div>`;
  (d.querySelector('p') as HTMLElement).textContent = message;
  d.querySelector('button')?.addEventListener('click', () => location.reload());
  document.body.appendChild(d);
}
