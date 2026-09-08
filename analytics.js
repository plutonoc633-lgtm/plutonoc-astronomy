(() => {
  'use strict';
  const config = window.PLUTONOC_ANALYTICS || {};
  if (!config.enabled || !config.endpoint || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  const uuid = () => crypto.randomUUID();
  const read = (storage, key) => { try { return JSON.parse(window[storage].getItem(key)); } catch { return null; } };
  const write = (storage, key, value) => { try { window[storage].setItem(key, JSON.stringify(value)); } catch { /* memory-only fallback */ } };
  const visitorKey = 'plutonoc.analytics.visitor.v1', sessionKey = 'plutonoc.analytics.session.v1';
  const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
  const idleLimit = 30 * 60000;
  let visitor, session, started = false, pending = [], busy = false, seen = new Set(), activitySaved = 0;
  const source = () => { try { return new URL(document.referrer).hostname; } catch { return ''; } };
  const device = /iPad|Tablet/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'tablet' : /Mobi|Android/i.test(navigator.userAgent) ? 'phone' : 'desktop';
  function persist() { session.seen = [...seen]; write('sessionStorage', sessionKey, session); }
  function touch() {
    const now = Date.now();
    if (!session || now - session.last >= idleLimit) {
      session = { id: uuid(), last: now, source: source(), seen: [] };
      seen = new Set();
    }
    session.last = now;
    if (now - activitySaved > 30000) { persist(); activitySaved = now; }
  }
  function record(kind, key = '', title = '') {
    try {
      if (!started) return;
      touch();
      const unique = kind + ':' + key;
      if (kind !== 'page' && seen.has(unique)) return;
      if (kind !== 'page') seen.add(unique);
      const event = { id: uuid(), kind, key, title: String(title).slice(0, 120), at: Date.now() };
      pending.push({ session: session.id, source: session.source, event });
      if (pending.length > 100) pending.shift();
      persist();
    } catch { /* analytics never interrupts the page */ }
  }
  // Preserve work opens that happened before this optional script's idle start.
  const early = window.plutonoCEarlyWork || [];
  delete window.plutonoCEarlyWork;
  window.PlutonoCAnalytics = { work(kind, id, title) {
    try {
      if (!started) { if (early.length < 20) early.push([kind, id, title]); }
      else record('work', kind + ':' + id, title);
    } catch { /* optional feature */ }
  } };
  function batch() {
    if (!pending.length) return '';
    const first = pending[0];
    const payload = { visitor: visitor.id, session: first.session, source: first.source, device, test: config.test === true, events: [] };
    let text = '', count = 0;
    for (const item of pending) {
      if (count === 20 || item.session !== first.session) break;
      payload.events.push(item.event);
      const next = JSON.stringify(payload);
      if (new TextEncoder().encode(next).length > 10240) { payload.events.pop(); break; }
      text = next; count++;
    }
    pending.splice(0, count || 1);
    return text;
  }
  async function flush(leaving = false) {
    try {
      if (!started || (!leaving && busy)) return;
      const body = batch();
      if (!body) return;
      if (leaving && navigator.sendBeacon?.(config.endpoint, new Blob([body], { type: 'text/plain' }))) return;
      busy = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try { await fetch(config.endpoint, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', signal: controller.signal, keepalive: leaving }); }
      catch { /* discard this batch: no retry loop */ }
      finally { clearTimeout(timeout); busy = false; }
    } catch { busy = false; }
  }
  function start() {
    try {
      if (started) return;
      visitor = read('localStorage', visitorKey);
      if (!validId(visitor?.id) || !(visitor.expires > Date.now())) visitor = { id: uuid(), expires: Date.now() + 90 * 86400000 };
      write('localStorage', visitorKey, visitor);
      session = read('sessionStorage', sessionKey);
      if (!validId(session?.id) || !Number.isFinite(session.last) || !Array.isArray(session.seen)) session = null;
      seen = new Set(session?.seen || []);
      started = true;
      record('page');
      early.splice(0).forEach(args => window.PlutonoCAnalytics.work(...args));
      setInterval(() => flush(), 10000);
      for (const name of ['pointerdown', 'keydown', 'scroll']) window.addEventListener(name, () => { try { touch(); } catch { /* storage */ } }, { passive: true });
      const timers = new Map();
      if ('IntersectionObserver' in window) {
        let observer, resizeTimer;
        const sections = [...document.querySelectorAll('main > section[id]')].filter(element => ['home', 'works', 'films', 'records', 'equipment', 'contact'].includes(element.id));
        const observe = () => {
          timers.forEach(clearTimeout); timers.clear();
          observer?.disconnect();
          // IO percentage margins use root width; pixels keep the central band tied to height.
          const inset = Math.round(window.innerHeight * .25);
          observer = new IntersectionObserver(entries => entries.forEach(entry => {
          clearTimeout(timers.get(entry.target));
          timers.delete(entry.target);
          if (entry.isIntersecting && document.visibilityState === 'visible') timers.set(entry.target, setTimeout(() => {
            if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) record('section', entry.target.id);
            timers.delete(entry.target);
          }, 1000));
          }), { rootMargin: `-${inset}px 0px -${inset}px 0px`, threshold: 0 });
          sections.forEach(element => observer.observe(element));
        };
        observe();
        window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(observe, 150); }, { passive: true });
        document.addEventListener('visibilitychange', () => {
          timers.forEach(clearTimeout); timers.clear();
          if (document.visibilityState === 'hidden') flush(true);
          else sections.forEach(element => { observer.unobserve(element); observer.observe(element); });
        });
      } else document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
      window.addEventListener('pagehide', () => { persist(); flush(true); });
      window.addEventListener('pageshow', event => { if (event.persisted) record('page'); });
    } catch { /* storage, unsupported browser, or blocked collection: website stays usable */ }
  }
  const schedule = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 2000 });
    else setTimeout(start, 200);
  }));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
