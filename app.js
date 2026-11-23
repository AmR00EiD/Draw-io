// Draw.io mobile shell: hosts the official draw.io editor (embed mode) in an iframe
// and adds native-feeling Open / New / Save on top. Protocol docs:
// https://www.drawio.com/doc/faq/embed-mode
(() => {
  'use strict';

  const EDITOR_ORIGIN = 'https://embed.diagrams.net';
  const DRAFT_KEY = 'drawio.draft';
  const NAME_KEY = 'drawio.name';

  const $ = (id) => document.getElementById(id);
  const frame = $('editor');
  const fileInput = $('file');

  const state = {
    ready: false,
    name: 'Untitled',
    xml: '',          // latest known diagram XML
    pendingLoad: null // {xml}|{xmlpng} to send once the editor says "init"
  };

  // ---------- storage (wrapped: Safari private mode can throw) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* quota / private mode */ } },
  };

  // ---------- UI helpers ----------
  let toastTimer;
  function toast(text, { action, onAction, ms = 3000 } = {}) {
    $('toast-text').textContent = text;
    const btn = $('toast-action');
    btn.hidden = !action;
    btn.textContent = action || '';
    btn.onclick = () => { $('toast').hidden = true; onAction && onAction(); };
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, action ? 15000 : ms);
  }

  function setName(name) {
    state.name = name || 'Untitled';
    $('title').textContent = state.name;
    document.title = state.name + ' – Draw.io';
    store.set(NAME_KEY, state.name);
  }

  // ---------- talking to the editor ----------
  function send(msg) {
    frame.contentWindow.postMessage(JSON.stringify(msg), EDITOR_ORIGIN);
  }

  function loadIntoEditor(payload, name) {
    if (name) setName(name);
    if (!state.ready) { state.pendingLoad = payload; return; }
    send({ action: 'load', autosave: 1, ...payload });
  }

  function boot() {
    const p = new URLSearchParams({
      embed: '1',
      proto: 'json',
      spin: '1',
      saveAndExit: '0',
      noSaveBtn: '1',
      noExitBtn: '1',
      libraries: '1',
      dark: 'auto',
    });
    frame.src = `${EDITOR_ORIGIN}/?${p}`;

    // If the editor never says "init", show why instead of an endless spinner.
    setTimeout(() => {
      if (state.ready) return;
      const el = $('loading');
      el.style.pointerEvents = 'auto';
      el.innerHTML = '<div style="text-align:center;padding:24px">' +
        '<p>The draw.io editor did not load.</p>' +
        '<p style="font-size:13px;opacity:.7">' + (navigator.onLine ? 'Online, but ' + EDITOR_ORIGIN + ' did not respond (blocked by network/content blocker?).' : 'You are offline.') + '</p>' +
        '<button id="retry" style="padding:10px 18px;font:inherit">Retry</button></div>';
      $('retry').onclick = () => location.reload();
    }, 12000);
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== EDITOR_ORIGIN || e.source !== frame.contentWindow) return;
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    switch (msg.event) {
      case 'init':
        state.ready = true;
        $('loading').classList.add('done');
        send({ action: 'load', autosave: 1, ...(state.pendingLoad || { xml: state.xml }) });
        state.pendingLoad = null;
        break;

      case 'autosave':
        if (msg.xml) { state.xml = msg.xml; store.set(DRAFT_KEY, msg.xml); }
        break;

      case 'save':           // Ctrl/Cmd+S inside the editor
        if (msg.xml) { state.xml = msg.xml; store.set(DRAFT_KEY, msg.xml); }
        requestExport();
        break;

      case 'export':
        handleExport(msg);
        break;
    }
  });

  // ---------- save / share ----------
  function requestExport() {
    if (!state.ready) return;
    send({ action: 'export', format: 'xml', spinKey: 'saving' });
  }

  function decodeExport(msg) {
    let data = msg.xml || msg.data || '';
    if (typeof data === 'string' && data.startsWith('data:')) {
      const i = data.indexOf(',');
      const meta = data.slice(0, i);
      const body = data.slice(i + 1);
      data = meta.includes(';base64') ? decodeURIComponent(escape(atob(body))) : decodeURIComponent(body);
    }
    return data;
  }

  function handleExport(msg) {
    send({ action: 'spinner', show: false });
    const xml = decodeExport(msg);
    if (!xml) { toast('Nothing to save'); return; }
    state.xml = xml;
    store.set(DRAFT_KEY, xml);
    saveFile(xml);
  }

  function fileNameForSave() {
    const base = state.name.replace(/\.(drawio|xml|svg|png)$/i, '').replace(/[\\/:*?"<>|]+/g, '_') || 'diagram';
    return base + '.drawio';
  }

  async function saveFile(xml) {
    const name = fileNameForSave();
    const file = new File([xml], name, { type: 'application/vnd.jgraph.mxfile' });

    // iOS/Android: share sheet -> "Save to Files", AirDrop, Drive, ...
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        toast('Saved ✓');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // user closed the sheet
        // Safari may reject because the async export consumed the tap gesture:
        // ask for one more tap, which always satisfies the requirement.
        toast('Ready to save', {
          action: 'Save',
          onAction: () => navigator.share({ files: [file], title: name }).catch(() => download(file)),
        });
        return;
      }
    }
    download(file);
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Downloaded ' + file.name);
  }

  // ---------- open ----------
  function readAsText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsText(file);
    });
  }
  function readAsDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  }

  async function openFile(file) {
    try {
      const name = file.name || 'Untitled';
      const lower = name.toLowerCase();
      let payload;

      if (lower.endsWith('.png') || file.type === 'image/png') {
        payload = { xmlpng: await readAsDataURL(file) };   // draw.io PNG with embedded XML
      } else if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
        const doc = new DOMParser().parseFromString(await readAsText(file), 'image/svg+xml');
        const content = doc.documentElement && doc.documentElement.getAttribute('content');
        if (!content) { toast('This SVG has no embedded draw.io data'); return; }
        payload = { xml: content };
      } else {
        payload = { xml: await readAsText(file) };         // .drawio / .xml (plain or compressed)
      }

      state.xml = payload.xml || state.xml;
      loadIntoEditor(payload, name);
      if (payload.xml) store.set(DRAFT_KEY, payload.xml);
    } catch (err) {
      toast('Could not open file');
      console.error(err);
    }
  }

  function newDiagram() {
    if (state.xml && !confirm('Start a new diagram? Unsaved changes will be lost.')) return;
    state.xml = '';
    store.set(DRAFT_KEY, '');
    loadIntoEditor({ xml: '' }, 'Untitled');
  }

  // ---------- wire up ----------
  $('btn-open').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
  $('btn-new').addEventListener('click', newDiagram);
  $('btn-save').addEventListener('click', requestExport);
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) openFile(f);
  });

  // Installed on Android/desktop Chrome: "Open with" a .drawio file
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files || !params.files.length) return;
      openFile(await params.files[0].getFile());
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // restore last draft so a swipe-away / reload doesn't lose work
  state.xml = store.get(DRAFT_KEY) || '';
  setName(store.get(NAME_KEY) || 'Untitled');
  boot();
})();
