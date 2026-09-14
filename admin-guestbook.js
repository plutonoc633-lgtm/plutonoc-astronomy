(() => {
  'use strict';
  window.createGuestbookAdmin = request => {
    const root = document.querySelector('[data-admin-book]'), $ = selector => root.querySelector(selector);
    const list = $('[data-admin-book-list]'), status = $('[data-admin-book-status]'), select = $('[data-admin-book-filter]');
    const prev = $('[data-admin-book-prev]'), next = $('[data-admin-book-next]'), refresh = $('[data-admin-book-refresh]');
    let active = false, epoch = 0, busy = false, page = 0, cursors = [null], nextCursor = null;
    const node = (tag, value) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; return el; };
    function controls() {
      root.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = busy; });
      prev.disabled = busy || page === 0; next.disabled = busy || !nextCursor;
    }
    function reset() { active = false; epoch++; busy = false; page = 0; cursors = [null]; nextCursor = null; list.replaceChildren(); status.textContent = ''; $('[data-admin-book-page]').textContent = ''; controls(); }
    async function load(target = 0) {
      if (!active || busy) return;
      const token = ++epoch, filter = select.value;
      busy = true; controls(); status.textContent = '正在读取';
      try {
        const result = await request('list', { status: filter, cursor: target ? cursors[target] : null });
        if (!active || token !== epoch) return;
        page = target; if (!target) cursors = [null]; nextCursor = result.nextCursor; cursors[page + 1] = nextCursor;
        list.replaceChildren(...result.items.map(render)); status.textContent = result.items.length ? '' : '暂无留言'; $('[data-admin-book-page]').textContent = `第 ${page + 1} 页`;
      } catch (error) { if (active && token === epoch) status.textContent = error.message; }
      finally { if (active && token === epoch) { busy = false; controls(); } }
    }
    async function mutate(item, action, reply) {
      if (!active || busy) return;
      if (action === 'delete' && !window.confirm('永久删除这条留言及回复？删除后无法恢复。')) return;
      const token = epoch;
      busy = true; controls(); status.textContent = '正在处理';
      try {
        await request(action, { id: item._id, revision: item.revision, ...(action === 'reply' ? { reply } : {}) });
        if (!active || token !== epoch) return;
        busy = false; await load(0);
      } catch (error) { if (active && token === epoch) status.textContent = `${error.message}；可刷新列表核对处理结果。`; }
      finally { if (active && token === epoch) { busy = false; controls(); } }
    }
    function render(item) {
      const card = node('article'), heading = node('header'), title = node('strong', item.nickname), date = node('time', new Date(item.createdAt).toLocaleString('zh-CN'));
      card.className = 'admin-book-entry'; heading.append(title, date); card.append(heading, node('p', item.body));
      const label = node('label', '作者回复'), reply = node('textarea'); reply.rows = 3; reply.maxLength = 2000; reply.value = item.reply || ''; label.append(reply); card.append(label);
      const actions = node('div'); actions.className = 'admin-book-actions';
      for (const [action, text] of [['publish', '审核公开'], ['hide', '隐藏'], ['reply', '保存回复'], ['delete', '删除']]) {
        if (action === 'publish' && item.status === 'published' || action === 'hide' && item.status === 'hidden') continue;
        const button = node('button', text); button.type = 'button'; if (action === 'delete') button.className = 'danger';
        button.addEventListener('click', () => {
          reply.setCustomValidity([...reply.value.normalize('NFC').trim()].length > 1000 ? '回复最多 1000 字' : '');
          if (action === 'reply' && !reply.reportValidity()) return;
          mutate(item, action, reply.value);
        }); actions.append(button);
      }
      card.append(actions); return card;
    }
    select.addEventListener('change', () => load(0)); refresh.addEventListener('click', () => load(0));
    prev.addEventListener('click', () => { if (page) load(page - 1); }); next.addEventListener('click', () => { if (nextCursor) load(page + 1); });
    return { show() { if (active) return; active = true; select.value = 'pending'; load(0); }, reset };
  };
})();
