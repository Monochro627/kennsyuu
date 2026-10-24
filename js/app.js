(() => {
  const data = window.TRAINING_DATA;
  const STORAGE_KEY = 'kennsyuu-progress-v1';
  const $ = (sel) => document.querySelector(sel);

  // 進捗は端末のブラウザに保存（ログイン不要）
  const loadProgress = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  };
  const saveProgress = (p) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* 保存不可の環境では無視 */ }
  };
  let progress = loadProgress();

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) node.append(c);
    return node;
  };

  // ---------- ① 卒業フロー ----------
  const isDone = (step, i) => !!progress[`${step.id}:${i}`];
  const stepDoneCount = (step) => step.tasks.filter((_, i) => isDone(step, i)).length;

  function renderFlow() {
    const list = $('#step-list');
    list.replaceChildren();
    const totalTasks = data.steps.reduce((n, s) => n + s.tasks.length, 0);
    const doneTasks = data.steps.reduce((n, s) => n + stepDoneCount(s), 0);
    const currentIndex = data.steps.findIndex((s) => stepDoneCount(s) < s.tasks.length);

    const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
    $('#progress-label').textContent = `${pct}%`;
    $('#progress-fill').style.width = `${pct}%`;
    $('#progress-next').textContent = currentIndex === -1
      ? '🎉 全ステップ完了！ルームアドバイザーへの卒業おめでとうございます！'
      : `次のステップ：STEP${currentIndex + 1}「${data.steps[currentIndex].title}」`;

    data.steps.forEach((step, si) => {
      const done = stepDoneCount(step);
      const complete = done === step.tasks.length;
      const isCurrent = si === currentIndex;
      const body = el('div', { class: 'step-body' }, [
        el('p', { text: step.description }),
        el('ul', { class: 'tasks' }, step.tasks.map((task, ti) => {
          const cb = el('input', { type: 'checkbox' });
          cb.checked = isDone(step, ti);
          cb.addEventListener('change', () => {
            if (cb.checked) progress[`${step.id}:${ti}`] = true;
            else delete progress[`${step.id}:${ti}`];
            saveProgress(progress);
            renderFlow();
          });
          return el('li', {}, el('label', {}, [cb, el('span', { text: task })]));
        })),
        data.materials.some((m) => m.step === step.id) && el('button', {
          class: 'step-link', text: '📚 このステップの資料を見る',
          onclick: () => { $('#material-step').value = step.id; location.hash = 'materials'; },
        }),
      ]);
      body.hidden = !isCurrent;

      list.append(el('li', {
        class: `step${complete ? ' done' : ''}${isCurrent ? ' current' : ''}`,
        'data-no': si + 1,
      }, [
        el('div', { class: 'step-head', onclick: () => { body.hidden = !body.hidden; } }, [
          el('div', {}, [
            el('div', { class: 'step-role', text: `STEP${si + 1} ・ ${step.role}` }),
            el('h3', { class: 'step-title', text: step.title }),
          ]),
          el('span', { class: 'step-count', text: `${done}/${step.tasks.length}` }),
        ]),
        body,
      ]));
    });
  }

  $('#reset-progress').addEventListener('click', () => {
    if (!confirm('チェックした進捗をすべてリセットしますか？')) return;
    progress = {};
    saveProgress(progress);
    renderFlow();
  });

  // ---------- ② 資料・動画 ----------
  const ICONS = { youtube: '🎬', drive: '📄', link: '🔗' };
  const TYPE_LABELS = { youtube: '動画', drive: '資料', link: '外部サイト' };

  function youtubeId(url) {
    const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m && m[1];
  }

  // 一覧ではiframeを読み込まず、開いた時だけ読み込む → アプリが重くならない
  function embedUrl(m) {
    if (m.type === 'youtube') {
      const id = youtubeId(m.url);
      return id && `https://www.youtube.com/embed/${id}`;
    }
    if (m.type === 'drive') return m.url.replace(/\/(view|edit)([?#].*)?$/, '/preview');
    return null;
  }

  function openMaterial(m) {
    const src = embedUrl(m);
    if (!src) { window.open(m.url, '_blank', 'noopener'); return; }
    $('#viewer-title').textContent = m.title;
    $('#viewer-open').href = m.url;
    $('#viewer-body').replaceChildren(el('iframe', {
      src, allow: 'autoplay; fullscreen; encrypted-media', allowfullscreen: '',
    }));
    $('#viewer').showModal();
  }
  const closeViewer = () => {
    $('#viewer-body').replaceChildren(); // 動画を確実に停止
    $('#viewer').close();
  };
  $('#viewer-close').addEventListener('click', closeViewer);
  $('#viewer').addEventListener('cancel', (e) => { e.preventDefault(); closeViewer(); });

  function renderMaterials() {
    const q = $('#material-search').value.trim().toLowerCase();
    const stepFilter = $('#material-step').value;
    const items = data.materials.filter((m) =>
      (!stepFilter || m.step === stepFilter) &&
      (!q || `${m.title} ${m.note || ''}`.toLowerCase().includes(q)));

    const list = $('#material-list');
    list.replaceChildren();
    if (!items.length) { list.append(el('p', { class: 'empty', text: '該当する資料がありません' })); return; }
    for (const m of items) {
      const step = data.steps.find((s) => s.id === m.step);
      const meta = [TYPE_LABELS[m.type], step && `STEP${data.steps.indexOf(step) + 1} ${step.title}`, m.note]
        .filter(Boolean).join(' ・ ');
      list.append(el('button', { class: 'material', onclick: () => openMaterial(m) }, [
        el('span', { class: 'material-icon', text: ICONS[m.type] || '📄' }),
        el('div', {}, [el('div', { class: 'material-title', text: m.title }), el('div', { class: 'material-meta', text: meta })]),
      ]));
    }
  }

  const stepSelect = $('#material-step');
  stepSelect.append(el('option', { value: '', text: 'すべてのステップ' }));
  data.steps.forEach((s, i) => stepSelect.append(el('option', { value: s.id, text: `STEP${i + 1} ${s.title}` })));
  $('#material-search').addEventListener('input', renderMaterials);
  stepSelect.addEventListener('change', renderMaterials);

  // ---------- ③ AIチャット ----------
  $('#notebook-link').href = data.notebookLmUrl;
  $('#chat-examples').replaceChildren(...data.chatExamples.map((q) => el('li', {}, el('button', {
    text: q,
    title: 'コピーしてNotebookLMを開く',
    onclick: async () => {
      try { await navigator.clipboard.writeText(q); } catch { /* コピー不可でも開く */ }
      window.open(data.notebookLmUrl, '_blank', 'noopener');
    },
  }))));

  // ---------- タブ切替 ----------
  function route() {
    const tab = ['flow', 'materials', 'chat'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'flow';
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${tab}`; });
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    if (tab === 'materials') renderMaterials();
  }
  window.addEventListener('hashchange', route);

  document.title = data.title;
  $('#app-title').textContent = data.title;
  $('#app-subtitle').textContent = data.subtitle;
  renderFlow();
  route();
})();
