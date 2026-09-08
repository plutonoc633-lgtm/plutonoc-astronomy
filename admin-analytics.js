(() => {
  'use strict';
  window.createVisitorAnalytics = request => {
    const root = document.querySelector('[data-analytics]');
    const $ = selector => root.querySelector(selector);
    const day = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
    const dateTime = time => new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const labels = { desktop: '电脑', phone: '手机', tablet: '平板', unknown: '未知', home: '首页', works: '摄影作品', films: '动态影像', records: '媒体与荣誉', equipment: '设备', contact: '结尾' };
    let generation = 0, page = 0, active = false, loading = false, selectedRange = null;
    function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
    const dates = () => ({ start: $('[data-stats-start]').value, end: $('[data-stats-end]').value });
    function updateBounds() {
      for (const el of [$('[data-stats-start]'), $('[data-stats-end]')]) { el.min = day(Date.now() - 89 * 86400000); el.max = day(Date.now()); }
    }
    function preset(days) {
      updateBounds();
      const today = day(Date.now());
      $('[data-stats-end]').value = today;
      $('[data-stats-start]').value = day(Date.parse(today + 'T00:00:00+08:00') - (days - 1) * 86400000);
    }
    function clear() {
      for (const name of ['metrics', 'trend', 'works', 'devices', 'sources', 'visits']) $('[data-stats-' + name + ']').replaceChildren();
      $('[data-stats-page]').textContent = '';
      $('[data-stats-prev]').disabled = true; $('[data-stats-next]').disabled = true;
    }
    function list(name, rows, label) {
      const target = $('[data-stats-' + name + ']'); target.replaceChildren();
      if (!rows.length) { target.append(node('p', '暂无记录', 'stats-muted')); return; }
      rows.forEach(row => { const item = node('li'); item.append(node('span', label(row)), node('strong', row.count.toLocaleString())); target.append(item); });
    }
    function summary(data) {
      const counts = Object.fromEntries(data.counts.map(row => [row._id, row.count]));
      const metrics = $('[data-stats-metrics]'); metrics.replaceChildren();
      for (const [title, count] of [['匿名访客人数', data.visitors], ['访问次数', counts.page || 0], ['作品打开次数', counts.work || 0]]) {
        const card = node('div', undefined, 'stats-metric'); card.append(node('span', title), node('strong', count.toLocaleString())); metrics.append(card);
      }
      const daily = new Map();
      for (let time = Date.parse(data.dates.start + 'T00:00:00+08:00'); time <= Date.parse(data.dates.end + 'T00:00:00+08:00'); time += 86400000) daily.set(day(time), { visitor: 0, page: 0, work: 0 });
      data.trendCounts.forEach(row => { if (daily.has(row._id.day)) daily.get(row._id.day)[row._id.kind] = row.count; });
      data.trendVisitors.forEach(row => { if (daily.has(row._id)) daily.get(row._id).visitor = row.count; });
      const trend = $('[data-stats-trend]'); trend.replaceChildren();
      [...daily].reverse().forEach(([date, row]) => { const tr = node('tr'); [date, row.visitor, row.page, row.work].forEach(value => tr.append(node('td', value))); trend.append(tr); });
      list('works', data.works, row => row.title || row._id);
      list('devices', data.devices, row => labels[row._id] || '未知');
      list('sources', data.sources, row => row._id || '直接访问 / 来源不可用');
    }
    function visits(data, token, selectedDates) {
      const target = $('[data-stats-visits]'); target.replaceChildren();
      if (!data.rows.length) target.append(node('p', '所选日期还没有访问记录。', 'stats-muted'));
      data.rows.forEach(row => {
        const details = node('details', undefined, 'stats-visit');
        const title = node('summary', `${dateTime(row.first)} · ${labels[row.device] || '未知设备'} · ${row.source || '直接访问'} · ${row.actions} 条活动`);
        const body = node('div', undefined, 'stats-timeline'); let loaded = false, fetching = false;
        details.append(title, body); target.append(details);
        details.addEventListener('toggle', async () => {
          if (!details.open || loaded || fetching) return;
          fetching = true; body.replaceChildren(node('p', '正在读取访问过程…'));
          try {
            const result = await request('detail', { ...selectedDates, visitor: row._id.visitor, session: row._id.session });
            if (token !== generation || !active) return;
            body.replaceChildren(node('p', `匿名访客 ${row._id.visitor.slice(0, 8)} · 时间为北京时间`, 'stats-muted'));
            result.rows.forEach(event => body.append(node('p', `${dateTime(event.at)}　${event.kind === 'page' ? '打开网页' : event.kind === 'section' ? '浏览栏目：' + (labels[event.key] || event.key) : '打开作品：' + (event.title || event.key)}`)));
            loaded = true;
          } catch (error) { if (token === generation && active) body.replaceChildren(node('p', error.message + '；收起后可再次展开重试。')); }
          finally { fetching = false; }
        });
      });
      $('[data-stats-page]').textContent = `第 ${data.page + 1} 页 · 每页 50 条浏览过程`;
      $('[data-stats-prev]').disabled = page === 0;
      $('[data-stats-next]').disabled = !data.hasNext;
    }
    async function load(includeSummary = true) {
      if (!active) return;
      updateBounds();
      if (includeSummary) { selectedRange = dates(); page = 0; }
      const selectedDates = { ...selectedRange }, token = ++generation;
      loading = true; $('[data-stats-status]').textContent = '正在读取统计…';
      $('[data-stats-prev]').disabled = true; $('[data-stats-next]').disabled = true;
      if (includeSummary) clear();
      try {
        const [stats, records] = await Promise.all([includeSummary ? request('summary', selectedDates) : null, request('visits', { ...selectedDates, page })]);
        if (token !== generation || !active) return;
        if (stats) summary(stats);
        visits(records, token, selectedDates);
        $('[data-stats-status]').textContent = '已更新 · 测试访问不计入统计';
      } catch (error) { if (token === generation && active) { clear(); $('[data-stats-status]').textContent = error.message || '统计暂时不可用，请刷新重试'; } }
      finally { if (token === generation) loading = false; }
    }
    root.querySelectorAll('[data-stats-days]').forEach(button => button.addEventListener('click', () => { preset(Number(button.dataset.statsDays)); page = 0; load(); }));
    $('[data-stats-form]').addEventListener('submit', event => { event.preventDefault(); page = 0; load(); });
    $('[data-stats-prev]').addEventListener('click', () => { if (!loading && page > 0) { page--; load(false); } });
    $('[data-stats-next]').addEventListener('click', () => { if (!loading) { page++; load(false); } });
    preset(7);
    root.addEventListener('focusin', updateBounds);
    root.addEventListener('pointerdown', updateBounds, { passive: true });
    document.addEventListener('visibilitychange', () => { if (active && document.visibilityState === 'visible') updateBounds(); });
    return { show() { active = true; load(); }, reset() { active = false; generation++; page = 0; loading = false; clear(); $('[data-stats-status]').textContent = ''; preset(7); } };
  };
})();
