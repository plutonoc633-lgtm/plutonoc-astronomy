(() => {
  'use strict';
  const root = document.querySelector('[data-guestbook]');
  if (!root) return;
  let loading = false, observer;
  const retry = root.querySelector('[data-book-loader-retry]');
  function script(src) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      const timer = setTimeout(() => { element.remove(); reject(new Error('timeout')); }, 12000);
      element.src = src; element.onload = () => { clearTimeout(timer); resolve(); };
      element.onerror = () => { clearTimeout(timer); element.remove(); reject(new Error('load')); };
      document.head.append(element);
    });
  }
  async function load() {
    if (loading || root.dataset.initialized) return;
    loading = true; retry.hidden = true;
    const status = root.querySelector('[data-book-list-status]');
    status.textContent = '正在读取';
    try {
      if (!window.PLUTONOC_GUESTBOOK) await script('guestbook-config.js?v=20260914-guestbook-1');
      await script('guestbook.js?v=20260914-book-layout-1');
      if (!root.dataset.initialized) throw new Error('initialize');
      observer?.disconnect();
    } catch { if (!root.dataset.initialized) { status.textContent = '留言区暂时未能加载'; retry.hidden = false; } }
    finally { loading = false; }
  }
  retry.addEventListener('click', load);
  document.addEventListener('click', event => { if (event.target.closest('a[href="#guestbook"]')) load(); }, true);
  window.addEventListener('hashchange', () => { if (location.hash === '#guestbook') load(); });
  if (document.querySelector('[data-book-eager]') || location.hash === '#guestbook') load();
  else if ('IntersectionObserver' in window) { observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) load(); }, { rootMargin: '600px 0px' }); observer.observe(root); }
  else { const near = () => { if (root.getBoundingClientRect().top < innerHeight + 600) { load(); window.removeEventListener('scroll', near); } }; window.addEventListener('scroll', near, { passive: true }); near(); }
})();
