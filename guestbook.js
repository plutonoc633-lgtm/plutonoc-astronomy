(() => {
  'use strict';
  const config = window.PLUTONOC_GUESTBOOK || {}, $ = selector => document.querySelector(selector);
  const form = $('[data-book-form]'), list = $('[data-book-list]'), more = $('[data-book-more]');
  const submitStatus = $('[data-book-submit-status]'), listStatus = $('[data-book-list-status]');
  const nickname = form.elements.nickname, body = form.elements.body;
  let cursor = null, listBusy = false, submitting = false, pending = null;
  const seen = new Set();
  const node = (tag, value) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; return el; };
  async function request(method, value) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const url = new URL(config.endpoint);
      if (method === 'GET' && value) url.searchParams.set('cursor', value);
      const response = await fetch(url, { method, signal: controller.signal, credentials: 'omit', cache: 'no-store', ...(method === 'POST' ? { headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(value) } : {}) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message || '暂时无法连接，请稍后重试');
      return result.data;
    } catch (error) { throw new Error(error.name === 'AbortError' ? '请求超时，请重试；重复提交不会增加留言。' : error.message || '暂时无法连接，请稍后重试'); }
    finally { clearTimeout(timer); }
  }
  function render(item) {
    if (seen.has(item._id)) return;
    seen.add(item._id);
    const article = node('article'), header = node('header'), date = node('time');
    article.className = 'book-entry'; date.dateTime = new Date(item.publishedAt).toISOString(); date.textContent = new Date(item.publishedAt).toLocaleDateString('zh-CN');
    header.append(node('h2', item.nickname), date); article.append(header, node('p', item.body));
    if (item.reply) { const reply = node('div'); reply.className = 'book-reply'; reply.append(node('span', 'PlutonoC'), node('p', item.reply)); article.append(reply); }
    list.append(article);
  }
  async function load() {
    if (listBusy) return;
    listBusy = true; more.disabled = true; listStatus.textContent = '正在读取';
    try {
      const result = await request('GET', cursor); result.items.forEach(render); cursor = result.nextCursor;
      more.hidden = !cursor; more.textContent = '加载更多'; listStatus.textContent = seen.size ? '' : '还没有公开留言。';
    } catch (error) { listStatus.textContent = error.message; more.hidden = false; more.textContent = '重新加载'; }
    finally { listBusy = false; more.disabled = false; }
  }
  function validate() {
    const count = [...body.value.normalize('NFC').trim()].length;
    $('[data-book-count]').textContent = `${count} / 1000`;
    body.setCustomValidity(count > 1000 ? '留言最多 1000 字' : !count ? '请输入留言' : '');
    nickname.setCustomValidity([...nickname.value.normalize('NFC').trim()].length > 20 ? '昵称最多 20 字' : '');
  }
  form.addEventListener('input', validate);
  form.addEventListener('submit', async event => {
    event.preventDefault(); validate(); if (submitting || !form.reportValidity()) return;
    const value = { nickname: nickname.value.normalize('NFC').trim(), body: body.value.normalize('NFC').trim(), website: form.elements.website.value };
    const fingerprint = JSON.stringify(value);
    if (!pending || pending.fingerprint !== fingerprint) pending = { fingerprint, requestId: crypto.randomUUID() };
    submitting = true; const controls = [...form.querySelectorAll('button,input,textarea')]; controls.forEach(el => { el.disabled = true; }); submitStatus.textContent = '正在提交';
    try { await request('POST', { ...value, requestId: pending.requestId }); body.value = ''; pending = null; validate(); submitStatus.textContent = '留言已收到，审核后会显示'; }
    catch (error) { submitStatus.textContent = error.message; }
    finally { submitting = false; controls.forEach(el => { el.disabled = false; }); }
  });
  more.addEventListener('click', load);
  if (!config.enabled || !config.endpoint) { form.hidden = true; listStatus.textContent = '留言簿暂未开放。'; return; }
  validate(); load();
})();
