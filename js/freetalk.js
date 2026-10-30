/* freetalk.js — AI会話（フリートーク）。Speak型のAI会話パートナー。
 * Anthropic API を利用（CRMと同じ localStorage キー peach.anthropicApiKey を共用）。
 * window.FreetalkView
 */
(function () {
  'use strict';

  const API_KEY_STORAGE = 'peach.anthropicApiKey';
  const MODEL = 'claude-haiku-4-5-20251001'; // 会話はテンポ重視で高速モデル
  const HISTORY_KEY = 'speak.freetalk.v1';

  let micRef = {};
  let listening = false;
  let busy = false;

  const SCENARIOS = [
    { key: 'chat', bg: 'linear-gradient(160deg,#5a3d2b,#1a120e)', emoji: '☕', title: '日常の雑談', desc: '天気・週末・趣味など気軽に',
      opener: "Hi Watanabe-san! It's great to see you. How's your day going so far?" },
    { key: 'restaurant', bg: 'linear-gradient(160deg,#6b2d2d,#1a0e0e)', emoji: '🍽️', title: 'レストラン', desc: '注文・おすすめを聞く',
      opener: "Good evening! Welcome to our restaurant. Here's the menu. Can I get you something to drink first?" },
    { key: 'travel', bg: 'linear-gradient(160deg,#1f4d6b,#0a1620)', emoji: '✈️', title: '旅行の話', desc: '東北旅行の予定を英語で',
      opener: "I heard you're planning a road trip to Tohoku! That sounds exciting. Where will you go first?" },
    { key: 'business', bg: 'linear-gradient(160deg,#2d3a5a,#0e111a)', emoji: '💼', title: 'ビジネス自己紹介', desc: '会社や仕事を紹介',
      opener: "Nice to meet you! I don't think we've met before. Could you tell me a little about yourself and your company?" },
    { key: 'shopping', bg: 'linear-gradient(160deg,#5a2d6b,#160a1a)', emoji: '🛍️', title: '買い物・返品', desc: '店員とのやりとり',
      opener: "Hi there! Welcome. Are you looking for anything in particular today?" },
    { key: 'meat', bg: 'linear-gradient(160deg,#6b3a1f,#1a0f08)', emoji: '🥩', title: 'お肉の商談', desc: '精肉卸として英語で提案',
      opener: "Hello! I run a restaurant and I'm looking for a new meat supplier. What kind of products do you offer?" },
  ];

  function systemPrompt(sc) {
    return `You are a warm, encouraging English conversation partner for a Japanese adult learner named Watanabe-san, the president of a meat wholesale company in Nagoya. His English is around intermediate level (CEFR A2-B1).

Rules:
- Reply ONLY in natural, spoken English. Keep replies SHORT: 1-2 sentences maximum.
- Stay in this scenario: "${sc.title}" (${sc.desc}).
- Speak clearly and simply. Avoid rare idioms unless you explain them.
- Always end your reply with a simple follow-up question so the conversation keeps flowing.
- If Watanabe-san makes a clear mistake, gently model the correct sentence inside your reply (naturally, without lecturing).
- Be positive and patient. Never switch to Japanese unless explicitly asked.`;
  }

  function getKey() { try { return localStorage.getItem(API_KEY_STORAGE) || ''; } catch (e) { return ''; } }
  function setKey(k) { try { localStorage.setItem(API_KEY_STORAGE, k || ''); } catch (e) {} }

  // 状態: { sc, messages:[{role, en, ja}] }
  let convo = null;
  function loadConvo() {
    try { const r = localStorage.getItem(HISTORY_KEY); if (r) return JSON.parse(r); } catch (e) {}
    return null;
  }
  function saveConvo() { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(convo)); } catch (e) {} }

  function render(container) {
    SCENARIOS.forEach((sc) => window.Speech.registerText(sc.opener, 'ft_' + sc.key));
    convo = loadConvo();
    if (!convo || !convo.sc) { drawScenarioPicker(container); return; }
    drawChat(container);
  }

  function drawScenarioPicker(container) {
    const custom = loadCustom();
    const card = (s) => `
      <button data-sc="${s.key}" class="sp-scene">
        <div class="sp-scene-art" style="background:${s.bg || 'linear-gradient(160deg,#243b6b,#0f1424)'}"><span>${window.App.icon(s.key)}</span></div>
        <div class="sp-scene-body"><div class="sp-item-title">${window.App.escapeHtml(s.title)}</div><div class="sp-item-sub">${window.App.escapeHtml(s.desc)}</div></div>
      </button>`;
    container.innerHTML = `
      <div class="sp-page">
        <div class="sp-head-row"><h1 class="sp-h1">フリートーク</h1></div>
        <p class="sp-lead">場面を選んで、声に出して会話します。短く返してくれるので、テンポよく続きます。</p>
        <div class="sp-scenes">${SCENARIOS.map(card).join('')}${custom.map(card).join('')}</div>
        <button id="ft-custom" class="sp-next">＋ 自分のシナリオを作成</button>
        ${getKey() ? '' : `<div class="sp-note">💡 AI 会話には Anthropic の API キーが要ります。会話を始めると入力欄が出ます。</div>`}
      </div>`;
    const start = (sc) => {
      convo = { sc, messages: [{ role: 'assistant', en: sc.opener, ja: '' }] };
      saveConvo();
      drawChat(container);
      window.Speech.speak(sc.opener, { rate: 1, key: 'ft_' + sc.key });
    };
    container.querySelectorAll('[data-sc]').forEach((b) => {
      b.onclick = () => { const sc = SCENARIOS.concat(custom).find((x) => x.key === b.dataset.sc); if (sc) start(sc); };
    });
    container.querySelector('#ft-custom').onclick = () => {
      const title = prompt('シナリオの名前（例: ホテルのフロント）'); if (!title) return;
      const desc = prompt('どんな場面か、ひとこと（例: チェックインから部屋の案内まで）') || '';
      const sc = { key: 'c' + Date.now(), emoji: '✨', title, desc, opener: 'Hi! Let\'s start. ' + (desc ? 'Today\'s situation: ' + desc + '. ' : '') + 'Are you ready?', bg: 'linear-gradient(160deg,#4b2d7a,#141020)' };
      custom.push(sc); saveCustom(custom); start(sc);
    };
  }
  const CUSTOM_KEY = 'speak.freetalk.custom';
  function loadCustom() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch (e) { return []; } }
  function saveCustom(list) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch (e) {} }

  function drawChat(container) {
    const sc = convo.sc;
    const asr = window.Speech.asrSupported;
    container.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <button class="text-sm text-gray-400 back-home">← ホーム</button>
        <div class="text-sm font-bold text-gray-700">${sc.emoji} ${sc.title}</div>
        <button id="ft-reset" class="text-xs text-gray-400 underline">場面を変える</button>
      </div>
      <div id="ft-log" class="space-y-3 mb-4"></div>
      <div id="ft-typing" class="text-xs text-gray-400 mb-2 hidden-x">AIが入力中…</div>

      <div class="sticky bottom-[84px] bg-white pt-2">
        <div class="flex items-end gap-2">
          <button id="ft-mic" class="shrink-0 w-12 h-12 rounded-full brand-grad text-white flex items-center justify-center shadow-md">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
          </button>
          <textarea id="ft-input" rows="1" placeholder="英語で入力 or 🎤で話す" class="flex-1 border border-gray-200 rounded-2xl px-3 py-2.5 text-sm resize-none max-h-24"></textarea>
          <button id="ft-send" class="shrink-0 w-12 h-12 rounded-full bg-gray-800 text-white flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
        </div>
        <div class="flex gap-3 mt-2 px-1">
          <button id="ft-hint" class="text-xs text-brand font-semibold">💡 何て言えばいい？</button>
          <span id="ft-status" class="text-xs text-gray-400"></span>
        </div>
      </div>
    `;
    bindBack(container);
    renderLog(container);

    container.querySelector('#ft-reset').onclick = () => {
      convo = null; try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
      drawScenarioPicker(container);
    };
    const input = container.querySelector('#ft-input');
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(96, input.scrollHeight) + 'px'; });
    container.querySelector('#ft-send').onclick = () => {
      const t = input.value.trim();
      if (t) { input.value = ''; input.style.height = 'auto'; sendUser(container, t); }
    };
    container.querySelector('#ft-mic').onclick = () => micInput(container);
    container.querySelector('#ft-hint').onclick = () => askHint(container);
  }

  function renderLog(container) {
    const log = container.querySelector('#ft-log');
    if (!log) return;
    log.innerHTML = convo.messages.map((m, i) => {
      if (m.role === 'assistant') {
        return `
          <div class="flex items-start gap-2">
            <div class="w-8 h-8 rounded-full brand-grad text-white flex items-center justify-center text-xs shrink-0">AI</div>
            <div class="bg-white border border-gray-100 rounded-2xl rounded-tl-sm p-3 shadow-sm max-w-[85%]">
              <div class="text-gray-800">${window.App.escapeHtml(m.en)}</div>
              ${m.ja ? `<div class="text-xs text-gray-500 mt-1">${window.App.escapeHtml(m.ja)}</div>` : ''}
              <div class="flex flex-wrap gap-2 mt-2">
                <button class="ft-say ft-btn" data-i="${i}">🔊 もう一度聞く</button>
                <button class="ft-slow ft-btn" data-i="${i}">🐢 ゆっくり</button>
                <button class="ft-tr ft-btn" data-i="${i}">和訳</button>
              </div>
            </div>
          </div>`;
      }
      return `
        <div class="flex items-start gap-2 flex-row-reverse">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0" style="background:var(--brand2);color:#fff">You</div>
          <div class="rounded-2xl rounded-tr-sm p-3 max-w-[85%] bg-pink-50 border border-pink-100">
            <div class="text-gray-800">${window.App.escapeHtml(m.en)}</div>
          </div>
        </div>`;
    }).join('');
    log.querySelectorAll('.ft-say').forEach((b) => {
      b.onclick = () => { window.Speech.unlockAudio(); window.Speech.stopSpeaking(); window.Speech.speak(convo.messages[+b.dataset.i].en, { rate: 1 }); };
    });
    log.querySelectorAll('.ft-slow').forEach((b) => {
      b.onclick = () => { window.Speech.unlockAudio(); window.Speech.stopSpeaking(); window.Speech.speak(convo.messages[+b.dataset.i].en, { rate: 0.75, slow: true }); };
    });
    log.querySelectorAll('.ft-tr').forEach((b) => {
      b.onclick = () => translateMsg(container, +b.dataset.i);
    });
    log.scrollIntoView && window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  async function micInput(container) {
    if (!window.Speech.asrSupported) { window.App.toast('音声認識に非対応のブラウザです'); return; }
    const mic = container.querySelector('#ft-mic');
    const status = container.querySelector('#ft-status');
    if (listening) { if (micRef.stop) micRef.stop(); return; }
    listening = true;
    mic.classList.add('listening');
    status.textContent = '🎤 聞き取り中…';
    window.Speech.stopSpeaking();
    micRef = {};
    try {
      const said = await window.Speech.listenOnce({ ref: micRef, onPartial: (t) => { status.textContent = '🎤 ' + (t || '…'); } });
      status.textContent = '';
      if (said && said.trim()) sendUser(container, said.trim());
    } catch (e) { status.textContent = 'もう一度お試しください'; }
    finally { listening = false; mic.classList.remove('listening'); }
  }

  async function callAnthropic(messages, system, maxTokens) {
    if (window.__ARTIFACT__) {
      throw new Error('AI会話はこの共有版では利用できません。GitHub/ローカル版でAPIキーを設定してご利用ください。');
    }
    let key = getKey();
    if (!key) {
      key = await promptForKey();
      if (!key) throw new Error('APIキーが必要です');
      setKey(key.trim());
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens || 300, system, messages }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) setKey('');
      throw new Error(`API ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    return (data.content || []).map((b) => b.text || '').join('').trim();
  }

  function apiMessages() {
    return convo.messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.en }));
  }

  async function sendUser(container, text) {
    if (busy) return;
    convo.messages.push({ role: 'user', en: text });
    saveConvo();
    renderLog(container);
    const typing = container.querySelector('#ft-typing');
    typing.classList.remove('hidden-x');
    busy = true;
    try {
      const reply = await callAnthropic(apiMessages(), systemPrompt(convo.sc), 300);
      convo.messages.push({ role: 'assistant', en: reply, ja: '' });
      saveConvo();
      window.Store.recordActivity(8);
      window.App.checkLevelUp();
      renderLog(container);
      window.Speech.speak(reply, { rate: 1 });
    } catch (e) {
      window.App.toast(e.message.startsWith('API') ? e.message : 'AI応答に失敗しました');
      const status = container.querySelector('#ft-status');
      if (status) status.textContent = '⚠️ ' + e.message;
    } finally {
      busy = false;
      if (typing) typing.classList.add('hidden-x');
    }
  }

  async function translateMsg(container, i) {
    const m = convo.messages[i];
    if (m.ja) return; // 既に翻訳済み
    try {
      const ja = await callAnthropic(
        [{ role: 'user', content: `Translate this English into natural Japanese. Output ONLY the Japanese, nothing else:\n\n${m.en}` }],
        'You are a precise English-to-Japanese translator.', 200);
      m.ja = ja;
      saveConvo();
      renderLog(container);
    } catch (e) { window.App.toast('翻訳に失敗しました'); }
  }

  async function askHint(container) {
    const status = container.querySelector('#ft-status');
    status.textContent = '💭 ヒントを考え中…';
    try {
      const hint = await callAnthropic(
        apiMessages().concat([{ role: 'user', content: '(Coach aside) Suggest ONE natural, simple English sentence I could say next in this conversation. Give the English sentence, then its Japanese translation in parentheses. Keep it to one line.' }]),
        systemPrompt(convo.sc), 150);
      status.textContent = '';
      showHint(container, hint);
    } catch (e) { status.textContent = 'ヒント取得に失敗しました'; }
  }

  function showHint(container, hint) {
    const div = document.createElement('div');
    div.innerHTML = `<div class="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" id="hint-ov">
      <div class="bg-white w-full max-w-[560px] rounded-t-3xl p-5">
        <div class="font-bold text-gray-800 mb-2">💡 こう言ってみよう</div>
        <div class="text-gray-700 bg-violet-50 rounded-xl p-3 text-sm leading-relaxed">${window.App.escapeHtml(hint)}</div>
        <button id="hint-close" class="w-full mt-4 brand-grad text-white rounded-xl py-2.5 font-bold">閉じる</button>
      </div></div>`;
    document.body.appendChild(div);
    const close = () => div.remove();
    div.querySelector('#hint-close').onclick = close;
    div.querySelector('#hint-ov').onclick = (e) => { if (e.target.id === 'hint-ov') close(); };
  }

  function promptForKey() {
    return new Promise((resolve) => {
      const div = document.createElement('div');
      div.innerHTML = `<div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" id="key-ov">
        <div class="bg-white w-full max-w-[440px] rounded-2xl p-5">
          <div class="font-bold text-lg mb-1">Anthropic APIキー</div>
          <div class="text-xs text-gray-500 mb-3">AI会話にはAnthropic APIキーが必要です。キーは端末内(localStorage)に保存され、Anthropic以外へは送信されません。経営分析AIと共用です。</div>
          <input id="key-inp" type="password" placeholder="sk-ant-..." class="w-full border rounded-xl px-3 py-2 mb-3 text-sm" />
          <div class="flex gap-2">
            <button id="key-cancel" class="flex-1 bg-gray-100 rounded-xl py-2.5 font-semibold text-sm">キャンセル</button>
            <button id="key-ok" class="flex-1 brand-grad text-white rounded-xl py-2.5 font-bold text-sm">保存して開始</button>
          </div>
        </div></div>`;
      document.body.appendChild(div);
      const done = (v) => { div.remove(); resolve(v); };
      div.querySelector('#key-cancel').onclick = () => done('');
      div.querySelector('#key-ok').onclick = () => done(div.querySelector('#key-inp').value.trim());
      div.querySelector('#key-ov').onclick = (e) => { if (e.target.id === 'key-ov') done(''); };
    });
  }

  function bindBack(container) {
    const b = container.querySelector('.back-home');
    if (b) b.onclick = () => window.App.navigate('home');
  }

  function onLeave() {
    if (micRef.stop) micRef.stop();
    listening = false;
    window.Speech.stopSpeaking();
  }

  window.FreetalkView = { SCENARIOS, render, onLeave };
})();
