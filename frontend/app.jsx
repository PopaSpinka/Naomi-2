// Naomi UI — само чат-приложение (компоненты, настройки, Live Data, монтирование).
// Зависит от ui-kit.jsx (useTweaks и т.д.). Общается с сервером по относительным /api/*.
window.claude = {
  complete: async function(options) {
    // Таймаут на запрос: при зависшем сервере иначе вечный спиннер и заблокированный ввод
    // (до многоминутного браузерного дефолта). 90с — выше реального думающего чат-ответа,
    // ниже 120с-потолка DeepSeek на сервере. По таймауту бросаем → submit покажет ошибку и разблокирует.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("API call failed: " + response.statusText);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  },
  // Реальный стрим ответа: читаем SSE-поток /api/chat и зовём onDelta(текст) по мере прихода.
  stream: async function(options, onDelta) {
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), 180000);
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), 180000); };
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
        signal: controller.signal
      });
      if (!resp.ok || !resp.body) throw new Error("API call failed: " + resp.statusText);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bump();
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = frame.split("\n").find((l) => l.indexOf("data:") === 0);
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
          if (ev.t === "delta") onDelta(ev.d);
          else if (ev.t === "error") throw new Error("stream error");
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }
};
// chat-app — inlined to avoid babel async-load races
// Pattern: snap-scroll on submit (new user message lands at top of viewport,
// where the previous request used to be — like Claude/ChatGPT).

const { useState, useEffect, useRef, useMemo, useLayoutEffect } = React;

const __savedTheme = 'dark';
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": __savedTheme,
  "density": "regular",
  "streamEffect": "glow",
  "spinnerStyle": "pillar",
  "spinnerLabel": "Thinking…",
  "agentName": "Naomi",
  "agentInitial": "N"
}/*EDITMODE-END*/;

const SPINNERS = {
  ring:    { cls: "sp-ring",    inner: 0 },
  dots:    { cls: "sp-dots",    inner: 3 },
  pulse:   { cls: "sp-pulse",   inner: 0 },
  bars:    { cls: "sp-bars",    inner: 4 },
  orbit:   { cls: "sp-orbit",   inner: 0 },
  shimmer: { cls: "sp-shimmer", inner: "text" },
  wave:    { cls: "sp-wave",    inner: 5 },
  morph:   { cls: "sp-morph",   inner: 0 },
  breath:  { cls: "sp-breath",  inner: 0 },
  dual:    { cls: "sp-dual",    inner: 0 },
  pillar:  { cls: "sp-pillar",  inner: 0 }
};

function Spinner({ kind, label }) {
  const def = SPINNERS[kind] || SPINNERS.ring;
  if (def.inner === "text") {
    return <span className={def.cls}>{label || "Thinking…"}</span>;
  }
  const dots = [];
  for (let i = 0; i < def.inner; i++) dots.push(<i key={i} />);
  return <span className={def.cls}>{dots}</span>;
}

const INITIAL_MESSAGES = [];

const nid = (p = "m") => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;






// ---------------------------------------------------------------- i18n
const I18N = {
  en: {
    "nav.general": "General", "nav.agent": "Agent", "nav.naomi": "Naomi", "nav.memory": "Memory",
    "nav.livedata": "Live Data", "nav.devices": "Devices", "nav.api": "API", "nav.reports": "Reports", "nav.automations": "Automations", "nav.timeline": "Timeline", "nav.about": "About",
    "agent.desc": "Which model powers Naomi and how hard she thinks. Changes apply immediately.",
    "agent.model": "Model", "agent.modelDesc": "GPT-5.5 is the smartest; GPT-5.4 is balanced; GPT-5.4-Mini is the fastest and lightest.",
    "agent.reasoning": "Reasoning", "agent.reasoningDesc": "How deeply Naomi thinks before replying. Low is fast and natural for chat; higher levels think longer.",
    "opt.off": "Off", "opt.low": "Low", "opt.medium": "Medium", "opt.high": "High", "opt.max": "Max", "opt.xhigh": "Extra-high",
    "nav.account": "Account", "nav.docs": "Docs",
    "docs.loading": "Loading…",
    "account.desc": "Naomi runs on your ChatGPT subscription. Sign in once — the token is stored locally and refreshes itself.",
    "account.connected": "Connected", "account.disconnected": "Not connected",
    "account.plan": "Plan", "account.loginHint": "Sign in with your ChatGPT account to power Naomi.",
    "account.login": "Sign in with ChatGPT", "account.relogin": "Sign in again", "account.waiting": "Waiting for sign-in…",
    "account.error": "Error", "account.browserHint": "A browser tab opened — finish the ChatGPT sign-in there.",
    "about.title": "About", "about.tagline": "A living companion you just talk to.",
    "about.creators": "Created by",
    "about.slava": "vision, specs, daily field-testing",
    "about.claude": "all engineering — designed and built in Claude Code",
    "about.naomi": "co-author of her own features: specs, reviews, night reports",
    "composer.ph": "Ask anything…", "empty.title": "How can I help?",
    "err.noReply": "Couldn't get a reply — check your connection and try again.",
  },
  ru: {
    "nav.general": "Общие", "nav.agent": "Агент", "nav.naomi": "Наоми", "nav.memory": "Память",
    "nav.livedata": "Живые данные", "nav.devices": "Устройства", "nav.api": "API", "nav.reports": "Репорты", "nav.automations": "Автоматизации", "nav.timeline": "Летопись", "nav.about": "О Наоми",
    "agent.desc": "Какая модель питает Наоми и насколько глубоко она думает. Изменения применяются сразу.",
    "agent.model": "Модель", "agent.modelDesc": "GPT-5.5 — самая умная; GPT-5.4 — сбалансированная; GPT-5.4-Mini — самая быстрая и лёгкая.",
    "agent.reasoning": "Размышление", "agent.reasoningDesc": "Насколько глубоко Наоми думает перед ответом. Низкий — быстро и естественно для болтовни; выше — думает дольше.",
    "opt.off": "Выкл", "opt.low": "Низкий", "opt.medium": "Средний", "opt.high": "Высокий", "opt.max": "Макс", "opt.xhigh": "Экстра",
    "nav.account": "Аккаунт", "nav.docs": "Документация",
    "docs.loading": "Загружаю…",
    "account.desc": "Наоми работает на твоей подписке ChatGPT. Войди один раз — токен хранится локально и сам обновляется.",
    "account.connected": "Подключено", "account.disconnected": "Не подключено",
    "account.plan": "План", "account.loginHint": "Войди через аккаунт ChatGPT, чтобы Наоми заработала.",
    "account.login": "Войти через ChatGPT", "account.relogin": "Войти заново", "account.waiting": "Жду вход…",
    "account.error": "Ошибка", "account.browserHint": "Открылась вкладка браузера — заверши вход в ChatGPT там.",
    "about.title": "О Наоми", "about.tagline": "Живой компаньон, с которым просто болтаешь.",
    "about.creators": "Создатели",
    "about.slava": "замысел, спеки, ежедневные полевые тесты",
    "about.claude": "вся инженерия — спроектирована и собрана в Claude Code",
    "about.naomi": "соавтор собственных фич: спеки, ревью, ночные отчёты",
    "composer.ph": "Спроси что угодно…", "empty.title": "Чем помочь?",
    "err.noReply": "Не получила ответ — проверь соединение и попробуй ещё раз.",
  },
};
let UI_LANG = (() => { try { return localStorage.getItem("naomi-lang") || "ru"; } catch (e) { return "ru"; } })();
function L(key) {
  const d = I18N[UI_LANG] || I18N.en;
  return d[key] !== undefined ? d[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
}

function groupTurns(messages) {
  const turns = [];
  let cur = null;
  for (const m of messages) {
    if (m.role === "user") {
      if (cur) turns.push(cur);
      cur = { id: m.id, user: m, assistants: [] };
    } else if (m.role === "assistant") {
      if (cur) {
        cur.assistants.push(m);
      } else {
        cur = { id: m.id, user: null, assistants: [m] };
      }
    }
  }
  if (cur) turns.push(cur);
  return turns;
}

function wordsFromText(text, ctx) {
  const tokens = text.split(/(\s+)/);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    if (/^\s+$/.test(tok)) { out.push(tok); continue; }
    const urlMatch = tok.match(/^(https?:\/\/[^\s]+?)([).,!?:;]*)$/);
    if (urlMatch) {
      const idx = ctx.streaming ? ctx.idx++ : 0;
      out.push(
        <a key={ctx.key++} className={ctx.streaming ? "word msg-link" : "msg-link"} href={urlMatch[1]} target="_blank" rel="noopener noreferrer" style={ctx.streaming ? { animationDelay: (idx * ctx.perWord) + "ms" } : undefined}>{urlMatch[1]}</a>
      );
      if (urlMatch[2]) out.push(urlMatch[2]);
      continue;
    }
    if (ctx.streaming) {
      const idx = ctx.idx++;
      out.push(
        <span key={ctx.key++} className="word" data-idx={idx} style={{ animationDelay: (idx * ctx.perWord) + "ms" }}>{tok}</span>
      );
    } else {
      out.push(tok);
    }
  }
  return out;
}

function safeHref(url) {
  // Model output (and Telegram-sourced content mirrored into chat) can carry links.
  // Allow only http(s), in-app absolute paths and anchors; everything else
  // (javascript:, data:, protocol-relative //host) is rejected and rendered inert.
  const u = (url || "").trim();
  if (/^https?:\/\//i.test(u) || /^\/[^/]/.test(u) || u.startsWith("#")) return u;
  return null;
}

function renderInline(text, ctx) {
  if (!ctx) ctx = { streaming: false, idx: 0, key: 0, perWord: 26 };
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0, m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(...wordsFromText(text.slice(last, m.index), ctx));
    const tok = m[0];
    if (tok.startsWith("**")) {
      // recurse so links inside bold still render as links
      parts.push(<strong key={ctx.key++}>{renderInline(tok.slice(2, -2), ctx)}</strong>);
    } else if (tok.startsWith("[")) {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const txt = mm ? mm[1] : tok;
      const href = mm ? safeHref(mm[2]) : null;
      const idx = ctx.streaming ? ctx.idx++ : 0;
      if (href) {
        parts.push(
          <a key={ctx.key++} className={ctx.streaming ? "word msg-link" : "msg-link"} href={href} target="_blank" rel="noopener noreferrer" style={ctx.streaming ? { animationDelay: (idx * ctx.perWord) + "ms" } : undefined}>{txt}</a>
        );
      } else {
        // Unsafe/unknown scheme (javascript:, data:, …) in model-influenced output:
        // render the label as inert text, never an executable link.
        parts.push(
          <span key={ctx.key++} className={ctx.streaming ? "word" : undefined} style={ctx.streaming ? { animationDelay: (idx * ctx.perWord) + "ms" } : undefined}>{txt}</span>
        );
      }
    } else {
      // treat inline code as one "word" for stagger purposes
      if (ctx.streaming) {
        const idx = ctx.idx++;
        parts.push(<code key={ctx.key++} className="word" style={{ animationDelay: (idx * ctx.perWord) + "ms" }}>{tok.slice(1, -1)}</code>);
      } else {
        parts.push(<code key={ctx.key++}>{tok.slice(1, -1)}</code>);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(...wordsFromText(text.slice(last), ctx));
  return parts;
}

function countWords(text) {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

// Блок кода с подписью языка и кнопкой «копировать».
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch (e) {}
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{lang || "code"}</span>
        <button className="code-copy" onClick={copy}>{copied ? "скопировано ✓" : "копировать"}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

// Делим текст на сегменты: блоки ```код``` и обычная проза, по порядку.
// Незакрытый блок (во время стриминга) — тоже как код, чтобы не мелькали ```.
function splitFences(text) {
  const segments = [];
  let rest = text;
  for (;;) {
    const open = rest.match(/```([^\n`]*)\n/);
    if (!open) { if (rest) segments.push({ type: "prose", text: rest }); break; }
    const before = rest.slice(0, open.index);
    if (before.trim()) segments.push({ type: "prose", text: before });
    const afterOpen = rest.slice(open.index + open[0].length);
    const closeIdx = afterOpen.indexOf("\n```");
    if (closeIdx === -1) {
      segments.push({ type: "code", lang: open[1].trim(), code: afterOpen.replace(/\n$/, "") });
      break;
    }
    segments.push({ type: "code", lang: open[1].trim(), code: afterOpen.slice(0, closeIdx) });
    const tail = afterOpen.slice(closeIdx + 4); // пропускаем "\n```"
    rest = tail.replace(/^[^\n]*\n?/, ""); // и хвост строки закрывающего забора
  }
  return segments;
}

// Один блок прозы (между пустыми строками): список / таблица / абзац.
function renderProseBlock(block, key, ctx) {
  const lines = block.split("\n");
  // Заголовки markdown (#, ##, ###) — одной строкой в блоке.
  const hm = lines.length === 1 && block.match(/^(#{1,4})\s+(.+)$/);
  if (hm) {
    const lvl = hm[1].length;
    const Tag = lvl <= 1 ? "h2" : lvl === 2 ? "h3" : "h4";
    return <Tag key={key} className="doc-h">{renderInline(hm[2], ctx)}</Tag>;
  }
  const looksTable = lines.length >= 2 && lines.every((l) => l.includes("|")) && /^[\s|:-]+$/.test(lines[1]) && lines[1].includes("-");
  if (looksTable) {
    const toCells = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    const header = toCells(lines[0]);
    const rows = lines.slice(2).filter((l) => l.trim()).map(toCells);
    return (
      <table key={key} className="md-table">
        <thead><tr>{header.map((c, ci) => <th key={ci}>{renderInline(c, ctx)}</th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, ctx)}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  // Списки + абзацы вперемешку. Пункт начинается со строки-маркера (-, •, «1.»),
  // строки без маркера приклеиваются к текущему пункту (поддержка многострочных пунктов).
  const bulletRe = /^\s*[-•]\s+/;
  const orderedRe = /^\s*\d+\.\s+/;
  const out = [];
  let buf = [];               // строки обычного абзаца
  let listKind = null;        // 'ul' | 'ol'
  let items = [];             // пункты текущего списка (каждый — массив сегментов)
  const flushPara = () => {
    if (!buf.length) return;
    const ls = buf; buf = [];
    out.push(<p key={key + "-p" + out.length}>{ls.map((l, li) => (
      <React.Fragment key={li}>{renderInline(l, ctx)}{li < ls.length - 1 ? <br /> : null}</React.Fragment>
    ))}</p>);
  };
  const flushList = () => {
    if (!items.length) return;
    const its = items; const kind = listKind; items = []; listKind = null;
    const Tag = kind === "ol" ? "ol" : "ul";
    out.push(
      <Tag key={key + "-l" + out.length} style={{ margin: "0 0 0.85em", padding: 0, listStyle: "none" }}>
        {its.map((it, li) => {
          const marker = kind === "ol" ? (li + 1) + "." : "•";
          const mk = ctx.streaming
            ? <span className="word" style={{ animationDelay: ((ctx.idx++) * ctx.perWord) + "ms" }}>{marker}</span>
            : <span>{marker}</span>;
          return (
            <li key={li} style={{ display: "flex", gap: "0.55em", marginBottom: 4 }}>{mk}<span style={{ minWidth: 0 }}>{it.map((seg, si) => (
              <React.Fragment key={si}>{si ? " " : null}{renderInline(seg, ctx)}</React.Fragment>
            ))}</span></li>
          );
        })}
      </Tag>
    );
  };
  for (const raw of lines) {
    const isB = bulletRe.test(raw), isO = !isB && orderedRe.test(raw);
    if (isB || isO) {
      flushPara();
      const kind = isO ? "ol" : "ul";
      if (listKind && listKind !== kind) flushList();
      listKind = kind;
      items.push([raw.replace(isO ? orderedRe : bulletRe, "")]);
    } else if (items.length && raw.trim()) {
      items[items.length - 1].push(raw.trim());   // продолжение пункта
    } else {
      flushList();
      if (raw.trim() || buf.length) buf.push(raw);
    }
  }
  flushPara(); flushList();
  return <React.Fragment key={key}>{out}</React.Fragment>;
}

function formatAssistant(text, streaming, perWord) {
  if (!text) return null;
  const ctx = { streaming: !!streaming, idx: 0, key: 0, perWord: perWord != null ? perWord : 26 };
  const rendered = [];
  splitFences(text).forEach((seg, si) => {
    if (seg.type === "code") {
      rendered.push(<CodeBlock key={"c" + si} lang={seg.lang} code={seg.code} />);
      return;
    }
    seg.text.replace(/^\n+|\n+$/g, "").split(/\n{2,}/).forEach((block, bi) => {
      if (block.trim()) rendered.push(renderProseBlock(block, "p" + si + "-" + bi, ctx));
    });
  });
  return { content: rendered, totalWords: ctx.idx, perWord: ctx.perWord };
}

const IconSend = () => (
  <svg viewBox="0 0 16 16" fill="none">
    <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
function Composer({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const taRef = useRef(null);

  useEffect(() => {
    // The composer overlays the chat (position:absolute), so resizing it never
    // touches the scroll area — no compensation needed, nothing can shift.
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [value]);

  function submit(e) {
    e && e.preventDefault();
    const v = value.trim();
    if (!v || disabled) return;
    onSend(v);
    setValue("");
  }
  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="composer-wrap">
      <form className="composer" onSubmit={submit}>
        <textarea
          ref={taRef}
          rows={1}
          placeholder={L("composer.ph")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          autoFocus
        />
        <button type="submit" className="send-btn" disabled={!canSend} aria-label="Send">
          <IconSend />
        </button>
      </form>
    </div>
  );
}

function Turn({ turn, isLast, busy, leaving, instant, minHeight, spinnerStyle, spinnerLabel }) {
  const assistants = turn.assistants || [];
  return (
    <div className="turn" data-turn-id={turn.id} style={isLast && minHeight && turn.user ? { minHeight } : undefined}>
      {turn.user ? (
        <div className="row-user" style={{ fontFamily: "Geist" }}>
          <div className="bubble-user">{turn.user.content}</div>
        </div>
      ) : null}
      {assistants.map((asst, index) => {
        const streaming = !!(asst && asst.streaming);
        const formatted = formatAssistant(asst.content, streaming, asst.live ? 0 : 26);
        const isLastAsst = index === assistants.length - 1;
        return (
          <div className="row-asst" key={asst.id}>
            <div className={"asst-spinner-slot" + (busy && isLastAsst ? (leaving ? " is-leaving" : " is-busy") : "") + (instant && busy && isLastAsst ? " is-instant" : "")}>
              <span className="sp-fade">
                <span className="sp-blink">
                  <Spinner kind={spinnerStyle} label={spinnerLabel} />
                </span>
              </span>
            </div>
            <div className={"asst-body" + (asst.erasing ? " is-erasing" : "")}>
              {asst.taskLabel ? (<div className="task-ref">↳ {asst.taskLabel}</div>) : null}
              {formatted ? formatted.content : null}
            </div>
          </div>
        );
      })}
      {assistants.length === 0 && busy ? (
        <div className="row-asst">
          <div className={"asst-spinner-slot is-busy" + (instant ? " is-instant" : "")}>
            <span className="sp-fade">
              <span className="sp-blink">
                <Spinner kind={spinnerStyle} label={spinnerLabel} />
              </span>
            </span>
          </div>
          <div className="asst-body" />
        </div>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8vh 0 4vh", minHeight: "60vh" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 34, letterSpacing: "-0.02em", lineHeight: 1.1, textAlign: "center", maxWidth: 480 }}>
        {L("empty.title")}
      </div>
    </div>
  );
}

function setAdd(setter, id) {
  setter((prev) => { if (prev.has(id)) return prev; const n = new Set(prev); n.add(id); return n; });
}
function setDel(setter, id) {
  setter((prev) => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
}



function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [thinking, setThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("agent");
  const [agentCfg, setAgentCfg] = useState({
    model: "gpt-5.5", reasoning: "low",
  });
  // Авторизация (вкладка «Аккаунт»): статус подписки + собственный вход «Sign in with ChatGPT».
  const [authInfo, setAuthInfo] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const loadAuth = () => fetch("/api/auth/status").then((r) => r.json()).then(setAuthInfo).catch(() => {});
  // Документация (вкладка «Документация»): markdown из DOCUMENTATION.md.
  const [docs, setDocs] = useState("");
  const loadDocs = () => fetch("/api/docs").then((r) => r.json()).then((d) => setDocs(d.markdown || "")).catch(() => {});
  const startLogin = () => {
    setAuthBusy(true);
    fetch("/api/auth/login", { method: "POST" }).then((r) => r.json()).then((d) => {
      if (d && d.authorize_url) { try { window.open(d.authorize_url, "_blank", "noopener"); } catch (e) {} }
      const t = setInterval(() => {
        fetch("/api/auth/status").then((r) => r.json()).then((s) => {
          setAuthInfo(s);
          const st = s && s.login && s.login.status;
          if (st === "success" || st === "error") { clearInterval(t); setAuthBusy(false); }
        }).catch(() => {});
      }, 1500);
      setTimeout(() => { clearInterval(t); setAuthBusy(false); }, 300000);
    }).catch(() => setAuthBusy(false));
  };
  // Настройки агента живут на сервере (/api/settings): каждое изменение сразу сохраняем.
  const scfg = (k, v) => setAgentCfg((c) => {
    const next = Object.assign({}, c, { [k]: v });
    fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
    return next;
  });
  const loadSettings = () => fetch("/api/settings").then((r) => r.json()).then((d) => setAgentCfg((c) => Object.assign({}, c, d))).catch(() => {});
  // Подтягиваем сохранённые настройки сразу при загрузке — чтобы видимость облачек
  // задач (showTaskChips) и прочее отражали сервер, а не только после открытия настроек.
  useEffect(() => { loadSettings(); loadAuth(); }, []);
  // Esc закрывает модалку настроек (раньше — только клик по фону/✕, rank 17).
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setSettingsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);
  const [uiLang, setUiLang] = useState(UI_LANG);
  const switchLang = (v) => {
    UI_LANG = v;
    try { localStorage.setItem("naomi-lang", v); } catch (e) {}
    setUiLang(v);
  };
  const [busyTurns, setBusyTurns] = useState(() => new Set());
  const [fadingTurns, setFadingTurns] = useState(() => new Set());
  // Ходы, где агент ответил БЕЗ размышления → зелёный спиннер. Заполняется по ФАКТУ
  // (reply.thought от сервера), а не по настройке: провизорно на отправке, уточняется
  // по ответу. Жёлтый = думала; голубой (brainTurns/задача) перебивает оба.
  const [instantTurns, setInstantTurns] = useState(() => new Set());
  const [scrollH, setScrollH] = useState(600);
  const scrollRef = useRef(null);
  const lastSubmittedRef = useRef(null);
  // Актуальный список сообщений для SSE-обработчиков (замыкание видит только ref).
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    document.body.dataset.theme = t.theme;
    document.body.dataset.density = t.density;
    document.body.dataset.stream = t.streamEffect || "blur";
    try { localStorage.setItem('naomi-theme', t.theme); } catch(e) {}
  }, [t.theme, t.density, t.streamEffect]);


  // Версия (короткий git-хеш) для бейджа внизу справа. Тянем с /api/health на
  // загрузке И при переподключении SSE — после naomi-restart соединение рвётся и
  // восстанавливается, так что хеш обновится сам, без ручной перезагрузки страницы.
  const [version, setVersion] = useState("");
  const loadVersion = () => fetch('/api/health').then((r) => r.json()).then((d) => setVersion(d.version || "")).catch(() => {});
  useEffect(() => { loadVersion(); }, []);


  useEffect(() => {
    // Память во владении ядра: при загрузке восстанавливаем видимую историю с сервера.
    fetch('/api/history').then((r) => r.json()).then((data) => {
      const hist = (data && data.messages) || [];
      if (!hist.length) return;
      const msgs = hist.map((m) => ({ id: nid(m.role === 'user' ? 'u' : 'a'), role: m.role, content: m.content }));
      setMessages((prev) => prev.length ? prev : msgs);
      // Instant jump to the latest message on restore — scroll-behavior:smooth
      // would otherwise animate through the whole history for seconds.
      setTimeout(() => {
        const el = scrollRef.current;
        if (el) { el.style.scrollBehavior = "auto"; el.scrollTop = el.scrollHeight; el.style.scrollBehavior = ""; }
      }, 60);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    // SSE с самовосстановлением. Браузер обычно переподключается сам, но после
    // рестарта сервера соединение может закрыться навсегда — тогда пересоздаём
    // вручную. После ЛЮБОГО обрыва события могли потеряться, поэтому при
    // восстановлении пересинхронизируемся: история и задачи сервера — истина.
    let es = null;
    let stopped = false;
    let needResync = false;
    const resync = () => {
      fetch('/api/history').then((r) => r.json()).then((data) => {
        const hist = (data && data.messages) || [];
        const msgs = hist.map((m) => ({ id: nid(m.role === 'user' ? 'u' : 'a'), role: m.role, content: m.content }));
        setBusyTurns(new Set());
        setFadingTurns(new Set());
        setInstantTurns(new Set());
        setMessages(msgs);
      }).catch(() => {});
      loadVersion(); // после рестарта сервера хеш мог смениться — подтянуть свежий
    };
    const handleSse = (event) => {
      try {
        const data = JSON.parse(event.data);if(data.type==='incoming'){var _r=data.role==='user'?'user':'assistant';var _iid=nid(_r==='user'?'u':'a');var _ms=countWords(data.content)*26+560;setMessages(function(prev){return prev.concat([{id:_iid,role:_r,content:data.content,streaming:_r==='assistant'}]);});if(_r==='assistant'){setTimeout(function(){setMessages(function(prev){return prev.map(function(m){return m.id===_iid?Object.assign({},m,{streaming:false}):m;});});},_ms);}return;}
      } catch (err) {
        console.error("Error parsing SSE event:", err);
      }
    };
    let backoff = 2000;
    const connect = () => {
      if (stopped) return;
      es = new EventSource('/api/events');
      es.onmessage = handleSse;
      es.onopen = () => {
        backoff = 2000; // успешное соединение — сбрасываем бэкофф
        if (needResync) { needResync = false; resync(); }
      };
      es.onerror = () => {
        needResync = true;
        if (es.readyState === EventSource.CLOSED) {
          setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 30000); // экспонента до 30с — не долбим мёртвый сервер
        }
      };
    };
    connect();
    return () => { stopped = true; if (es) es.close(); };
  }, []);

  // Once a streaming word finishes its animation, clear the compositor layer
  // by swapping in a plain rendering — fixes the subpixel "settle" jiggle.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onEnd(e) {
      const target = e.target;
      if (target && target.classList && target.classList.contains("word")) {
        target.classList.add("done");
      }
    }
    el.addEventListener("animationend", onEnd);
    return () => el.removeEventListener("animationend", onEnd);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setScrollH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const turns = useMemo(() => groupTurns(messages), [messages]);

  useLayoutEffect(() => {
    const id = lastSubmittedRef.current;
    if (!id) return;
    const el = scrollRef.current;
    if (!el) return;
    const turnEl = el.querySelector('[data-turn-id="' + id + '"]');
    if (!turnEl) return;
    // Use getBoundingClientRect so we get the turn's position relative to the
    // scroll viewport regardless of offsetParent — offsetTop would include the
    // header height because nothing in the ancestor chain is positioned.
    const rectTurn = turnEl.getBoundingClientRect();
    const rectScroll = el.getBoundingClientRect();
    const target = Math.max(0, rectTurn.top - rectScroll.top + el.scrollTop - 16);
    el.scrollTo({ top: target, behavior: "smooth" });
    lastSubmittedRef.current = null;
  }, [messages]);

  async function handleSend(text) {
    const userId = nid("u");
    const userMsg = { id: userId, role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setThinking(true);
    setAdd(setBusyTurns, userId);
    setDel(setFadingTurns, userId);
    // Провизорный цвет спиннера: «off» точно без раздумий → зелёный; иначе пока жёлтый
    // (думающий режим), уточним по факту, когда придёт reply.thought.
    if (agentCfg.reasoning === "off") setAdd(setInstantTurns, userId); else setDel(setInstantTurns, userId);
    lastSubmittedRef.current = userId;

    // Системный промпт и история — во владении бэкенда (личность Naomi живёт там);
    // клиент шлёт только видимые сообщения, сервер берёт из них последнее пользовательское.
    const aId = nid("a");
    let acc = "";            // накопленный текст ответа
    let started = false;     // пришёл ли первый токен
    let pending = false;     // запланирован ли флэш в этот кадр
    const flush = () => {
      pending = false;
      setMessages((prev) => prev.some((m) => m.id === aId)
        ? prev.map((m) => m.id === aId ? { ...m, content: acc } : m)
        : [...prev, { id: aId, role: "assistant", content: acc, streaming: true, live: true }]);
    };
    const onDelta = (d) => {
      if (!d) return;
      acc += d; started = true;
      if (!pending) { pending = true; requestAnimationFrame(flush); }   // батчим по кадрам экрана
    };

    try {
      await window.claude.stream(
        { messages: nextMessages.map((m) => ({ role: m.role, content: m.content })), client_turn_id: userId },
        onDelta
      );
      if (pending) flush();                       // долить остаток последнего кадра
      if (!started) {
        setMessages((prev) => [...prev, { id: nid("a"), role: "assistant", content: L("err.noReply") }]);
      } else {
        // дать последним словам доанимироваться, затем убрать стрим-слой (фикс субпиксельного джиттера)
        setTimeout(() => setMessages((prev) => prev.map((m) => m.id === aId ? { ...m, streaming: false } : m)), 450);
      }
      setTimeout(() => setAdd(setFadingTurns, userId), 500);
      setTimeout(() => { setDel(setBusyTurns, userId); setDel(setFadingTurns, userId); }, 900);
    } catch (err) {
      if (pending) flush();
      if (!started) {
        setMessages((prev) => [...prev, { id: nid("a"), role: "assistant", content: L("err.noReply") }]);
      } else {
        setMessages((prev) => prev.map((m) => m.id === aId ? { ...m, streaming: false } : m));
      }
      setDel(setBusyTurns, userId); setDel(setFadingTurns, userId);
    } finally {
      setThinking(false);
      setDel(setInstantTurns, userId);
    }
  }

  // Last turn height makes the natural max scrollTop land the user bubble at
  // 16px from the viewport top. No JS clamp — the browser hits its own scroll
  // limit at the exact right place, no spring. 190 = .conversation bottom
  // padding (the floating composer reserve, see styles.css) — it extends the
  // scrollable area below the content, so subtract it or max scroll (and the
  // restore-jump after a hard refresh) overshoots past the last message.
  const lastTurnMinHeight = Math.max(280, scrollH - 16 - 190);

  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-l">
          <div>
            <div className="hdr-title">{t.agentName}</div>
          </div>
        </div>
        <div className="hdr-r">
          
          <button className="ghost-btn" aria-label="Очистить чат" title="Очистить чат" onClick={() => { if (!window.confirm("Очистить весь чат? Наоми полностью забудет разговор.")) return; fetch("/api/reset", { method: "POST" }).catch(() => {}); setMessages([]); setBusyTurns(new Set()); setFadingTurns(new Set()); setInstantTurns(new Set()); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
          <button className="ghost-btn" aria-label="Settings" title="Settings" onClick={() => { setSettingsOpen(true); loadSettings(); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
        </div>
      </header>

      <main className="scroll" ref={scrollRef}>
        <div className="conversation">
          {turns.length === 0 ? (
            <EmptyState />
          ) : (
            turns.map((turn, i) => {
              const isLast = i === turns.length - 1;
              return (
                <Turn key={turn.id} turn={turn} isLast={isLast}
                  busy={busyTurns.has(turn.id)}
                  leaving={fadingTurns.has(turn.id)}
                  instant={instantTurns.has(turn.id)}
                  spinnerStyle={t.spinnerStyle}
                  spinnerLabel={t.spinnerLabel}
                  minHeight={lastTurnMinHeight} />
              );
            })
          )}
        </div>
      </main>

      <Composer onSend={handleSend} disabled={thinking} />

      {version ? <div className="version-badge" title="Текущая версия (git HEAD)">{version}</div> : null}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Внешний вид" />
        <TweakRadio label="Тема" value={t.theme} options={["light", "dark"]} onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Плотность" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
        <TweakSelect label="Эффект потока" value={t.streamEffect} options={["blur", "rise", "glow", "fade", "tilt", "bloom", "scan"]} onChange={(v) => setTweak("streamEffect", v)} />
        <TweakSection label="Спинер" />
        <TweakSelect label="Стиль" value={t.spinnerStyle} options={["ring", "dots", "pulse", "bars", "orbit", "shimmer", "wave", "morph", "breath", "dual", "pillar"]} onChange={(v) => setTweak("spinnerStyle", v)} />
        <TweakText label="Подпись (для shimmer)" value={t.spinnerLabel} onChange={(v) => setTweak("spinnerLabel", v)} />
        <TweakSection label="Агент" />
        <TweakText label="Имя" value={t.agentName} onChange={(v) => setTweak("agentName", v)} />
        <TweakText label="Инициал" value={t.agentInitial} onChange={(v) => setTweak("agentInitial", v.slice(0, 1).toUpperCase())} />
      </TweaksPanel>

      <React.Fragment>
        <style>{".set-backdrop{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.5);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:setfade .15s ease}@keyframes setfade{from{opacity:0}to{opacity:1}}.set-modal{position:relative;width:min(860px,92vw);height:min(600px,85vh);display:flex;background:#1d1d1b;color:#ece9e3;border:1px solid rgba(255,255,255,.09);border-radius:16px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.55)}.set-side{flex:0 0 210px;background:#171716;border-right:1px solid rgba(255,255,255,.07);padding:18px 10px;display:flex;flex-direction:column;gap:2px}.set-nav{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:9px;cursor:pointer;color:#b6b3aa;font-size:14px;border:none;background:none;text-align:left;width:100%;font-family:inherit;transition:background .12s,color .12s}.set-nav:hover{background:rgba(255,255,255,.05);color:#ece9e3}.set-nav.active{background:rgba(255,255,255,.1);color:#fff}.set-nav svg{width:18px;height:18px;flex:0 0 18px;opacity:.9}.set-main{flex:1;min-width:0;padding:28px 34px;overflow-y:auto}.set-h{font-size:21px;font-weight:600;margin:0 0 18px}.set-row{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:17px 2px;border-bottom:1px solid rgba(255,255,255,.06)}.set-row:last-child{border-bottom:none}.set-rt{font-size:14.5px;font-weight:500;margin:0 0 4px}.set-rd{font-size:13px;color:#9a978f;margin:0;line-height:1.5;max-width:46ch}.set-x{position:absolute;top:16px;right:18px;background:none;border:none;color:#9a978f;font-size:20px;cursor:pointer;line-height:1;padding:4px;z-index:2}.set-x:hover{color:#fff}.set-select{background:#2b2b28;color:#ece9e3;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:13.5px;cursor:pointer;font-family:inherit}.set-sw{width:42px;height:24px;border-radius:999px;border:none;cursor:pointer;position:relative;transition:background .15s;background:#3a3a37;flex:0 0 auto}.set-sw.on{background:#4a9eff}.set-sw::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}.set-sw.on::after{left:21px}.set-btn{background:#2b2b28;color:#ece9e3;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;font-family:inherit}.set-btn:hover{background:#35342f}.doc-h{font-size:16px;font-weight:600;margin:18px 0 8px;color:#ece9e3}.doc-h:first-child{margin-top:0}.doc-body{font-size:13.5px;line-height:1.6;color:#c9c6be}.doc-body p{margin:0 0 10px}.doc-body code{background:#2b2b28;padding:1px 5px;border-radius:4px;font-size:12px}.doc-body table{font-size:12.5px}"}</style>
        {settingsOpen ? (
          <div className="set-backdrop" onClick={() => setSettingsOpen(false)}>
            <div className="set-modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
              <button className="set-x" aria-label="Close" onClick={() => setSettingsOpen(false)}>✕</button>
              <div className="set-side">
                <button className={"set-nav" + (settingsTab === "agent" ? " active" : "")} onClick={() => setSettingsTab("agent")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span>{L("nav.agent")}</span></button>
                <button className={"set-nav" + (settingsTab === "account" ? " active" : "")} onClick={() => { setSettingsTab("account"); loadAuth(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zM15.5 7.5l3 3L22 7l-3-3-3.5 3.5z"></path></svg><span>{L("nav.account")}</span></button>
                <button className={"set-nav" + (settingsTab === "docs" ? " active" : "")} onClick={() => { setSettingsTab("docs"); loadDocs(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg><span>{L("nav.docs")}</span></button>
                <button className={"set-nav" + (settingsTab === "about" ? " active" : "")} style={{ marginTop: "auto" }} onClick={() => setSettingsTab("about")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span>{L("nav.about")}</span></button>
              </div>
              <div className="set-main">
                {settingsTab === "agent" ? (
                  <React.Fragment>
                    <h2 className="set-h">{L("nav.agent")}</h2>
                    <p className="set-rd" style={{ margin: "0 0 16px" }}>{L("agent.desc")}</p>
                    <div className="set-row">
                      <div><p className="set-rt">{L("agent.model")}</p><p className="set-rd">{L("agent.modelDesc")}</p></div>
                      <select className="set-select" value={agentCfg.model} onChange={(e) => scfg("model", e.target.value)}>
                        <option value="gpt-5.5">GPT-5.5</option>
                        <option value="gpt-5.4">GPT-5.4</option>
                        <option value="gpt-5.4-mini">GPT-5.4-Mini</option>
                      </select>
                    </div>
                    <div className="set-row">
                      <div><p className="set-rt">{L("agent.reasoning")}</p><p className="set-rd">{L("agent.reasoningDesc")}</p></div>
                      <select className="set-select" value={agentCfg.reasoning} onChange={(e) => scfg("reasoning", e.target.value)}>
                        <option value="low">{L("opt.low")}</option>
                        <option value="medium">{L("opt.medium")}</option>
                        <option value="high">{L("opt.high")}</option>
                        <option value="xhigh">{L("opt.xhigh")}</option>
                      </select>
                    </div>
                  </React.Fragment>
                ) : settingsTab === "account" ? (
                  <React.Fragment>
                    <h2 className="set-h">{L("nav.account")}</h2>
                    <p className="set-rd" style={{ margin: "0 0 16px" }}>{L("account.desc")}</p>
                    <div className="set-row">
                      <div>
                        <p className="set-rt">{authInfo && authInfo.logged_in ? L("account.connected") : L("account.disconnected")}</p>
                        <p className="set-rd">{authInfo && authInfo.logged_in
                          ? (L("account.plan") + ": " + (authInfo.plan || "—"))
                          : L("account.loginHint")}</p>
                      </div>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: authInfo && authInfo.logged_in ? "#3fb950" : "#8b8b8b", display: "inline-block" }} />
                        <button className="set-btn" onClick={startLogin} disabled={authBusy}>
                          {authBusy ? L("account.waiting") : (authInfo && authInfo.logged_in ? L("account.relogin") : L("account.login"))}
                        </button>
                      </span>
                    </div>
                    {authInfo && authInfo.login && authInfo.login.status === "error" ? (
                      <p className="set-rd" style={{ color: "#e5736b" }}>{L("account.error")}: {authInfo.login.error}</p>
                    ) : null}
                    {authBusy ? (
                      <p className="set-rd" style={{ margin: "10px 0 0" }}>{L("account.browserHint")}</p>
                    ) : null}
                  </React.Fragment>
                ) : settingsTab === "docs" ? (
                  <React.Fragment>
                    <h2 className="set-h">{L("nav.docs")}</h2>
                    {docs ? (
                      <div className="doc-body">{formatAssistant(docs, false).content}</div>
                    ) : (
                      <p className="set-rd">{L("docs.loading")}</p>
                    )}
                  </React.Fragment>
                ) : settingsTab === "about" ? (
                  <React.Fragment>
                    <h2 className="set-h">{L("about.title")}</h2>
                    <div style={{ textAlign: "center", padding: "6px 0 16px" }}>
                      <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: ".5px" }}>Naomi</div>
                      <p className="set-rd" style={{ margin: "6px auto 0" }}>{L("about.tagline")}</p>
                    </div>
                    <div className="set-row" style={{ display: "block" }}>
                      <p className="set-rt">{L("about.creators")}</p>
                      <p className="set-rd" style={{ margin: "8px 0 0" }}><b style={{ color: "#ece9e3" }}>Слава (PopaSpinka)</b> — {L("about.slava")}</p>
                      <p className="set-rd" style={{ margin: "6px 0 0" }}><b style={{ color: "#ece9e3" }}>Claude Fable 5 Max</b> — {L("about.claude")}</p>
                      <p className="set-rd" style={{ margin: "6px 0 0" }}><b style={{ color: "#ece9e3" }}>Naomi</b> — {L("about.naomi")}</p>
                    </div>
                  </React.Fragment>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </React.Fragment>

    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("UI render error:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "var(--text)", maxWidth: 560, margin: "10vh auto" }}>
        <h2 style={{ marginBottom: 8 }}>The interface hit an error</h2>
        <p style={{ opacity: 0.8, lineHeight: 1.5 }}>Your conversation is safe on the server. Reload to restore it.</p>
        <button className="set-btn" style={{ marginTop: 12 }} onClick={() => location.reload()}>Reload</button>
        <pre style={{ whiteSpace: "pre-wrap", opacity: 0.5, marginTop: 16, fontSize: 12 }}>{String(this.state.error)}</pre>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
