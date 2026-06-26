window.claude = {
  complete: async function(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9e4);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  }
};
const { useState, useEffect, useRef, useMemo, useLayoutEffect } = React;
const __savedTheme = "dark";
const TWEAK_DEFAULTS = (
  /*EDITMODE-BEGIN*/
  {
    "theme": __savedTheme,
    "density": "regular",
    "streamEffect": "glow",
    "spinnerStyle": "pillar",
    "spinnerLabel": "Thinking\u2026",
    "agentName": "Naomi",
    "agentInitial": "N"
  }
);
const SPINNERS = {
  ring: { cls: "sp-ring", inner: 0 },
  dots: { cls: "sp-dots", inner: 3 },
  pulse: { cls: "sp-pulse", inner: 0 },
  bars: { cls: "sp-bars", inner: 4 },
  orbit: { cls: "sp-orbit", inner: 0 },
  shimmer: { cls: "sp-shimmer", inner: "text" },
  wave: { cls: "sp-wave", inner: 5 },
  morph: { cls: "sp-morph", inner: 0 },
  breath: { cls: "sp-breath", inner: 0 },
  dual: { cls: "sp-dual", inner: 0 },
  pillar: { cls: "sp-pillar", inner: 0 }
};
function Spinner({ kind, label }) {
  const def = SPINNERS[kind] || SPINNERS.ring;
  if (def.inner === "text") {
    return /* @__PURE__ */ React.createElement("span", { className: def.cls }, label || "Thinking\u2026");
  }
  const dots = [];
  for (let i = 0; i < def.inner; i++) dots.push(/* @__PURE__ */ React.createElement("i", { key: i }));
  return /* @__PURE__ */ React.createElement("span", { className: def.cls }, dots);
}
const INITIAL_MESSAGES = [];
const nid = (p = "m") => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const I18N = {
  en: {
    "nav.general": "General",
    "nav.agent": "Agent",
    "nav.naomi": "Naomi",
    "nav.memory": "Memory",
    "nav.livedata": "Live Data",
    "nav.devices": "Devices",
    "nav.api": "API",
    "nav.reports": "Reports",
    "nav.automations": "Automations",
    "nav.timeline": "Timeline",
    "nav.about": "About",
    "agent.desc": "Which model powers Naomi and how hard she thinks. Changes apply immediately.",
    "agent.model": "Model",
    "agent.modelDesc": "GPT-5.5 is the smartest; GPT-5.4 is balanced; GPT-5.4-Mini is the fastest and lightest.",
    "agent.reasoning": "Reasoning",
    "agent.reasoningDesc": "How deeply Naomi thinks before replying. Low is fast and natural for chat; higher levels think longer.",
    "opt.off": "Off",
    "opt.low": "Low",
    "opt.medium": "Medium",
    "opt.high": "High",
    "opt.max": "Max",
    "opt.xhigh": "Extra-high",
    "nav.account": "Account",
    "nav.docs": "Docs",
    "docs.loading": "Loading\u2026",
    "account.desc": "Naomi runs on your ChatGPT subscription. Sign in once \u2014 the token is stored locally and refreshes itself.",
    "account.connected": "Connected",
    "account.disconnected": "Not connected",
    "account.plan": "Plan",
    "account.loginHint": "Sign in with your ChatGPT account to power Naomi.",
    "account.login": "Sign in with ChatGPT",
    "account.relogin": "Sign in again",
    "account.waiting": "Waiting for sign-in\u2026",
    "account.error": "Error",
    "account.browserHint": "A browser tab opened \u2014 finish the ChatGPT sign-in there.",
    "about.title": "About",
    "about.tagline": "A living companion you just talk to.",
    "about.creators": "Created by",
    "about.slava": "vision, specs, daily field-testing",
    "about.claude": "all engineering \u2014 designed and built in Claude Code",
    "about.naomi": "co-author of her own features: specs, reviews, night reports",
    "composer.ph": "Ask anything\u2026",
    "empty.title": "How can I help?",
    "err.noReply": "Couldn't get a reply \u2014 check your connection and try again."
  },
  ru: {
    "nav.general": "\u041E\u0431\u0449\u0438\u0435",
    "nav.agent": "\u0410\u0433\u0435\u043D\u0442",
    "nav.naomi": "\u041D\u0430\u043E\u043C\u0438",
    "nav.memory": "\u041F\u0430\u043C\u044F\u0442\u044C",
    "nav.livedata": "\u0416\u0438\u0432\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435",
    "nav.devices": "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430",
    "nav.api": "API",
    "nav.reports": "\u0420\u0435\u043F\u043E\u0440\u0442\u044B",
    "nav.automations": "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u0438",
    "nav.timeline": "\u041B\u0435\u0442\u043E\u043F\u0438\u0441\u044C",
    "nav.about": "\u041E \u041D\u0430\u043E\u043C\u0438",
    "agent.desc": "\u041A\u0430\u043A\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u043F\u0438\u0442\u0430\u0435\u0442 \u041D\u0430\u043E\u043C\u0438 \u0438 \u043D\u0430\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0443\u0431\u043E\u043A\u043E \u043E\u043D\u0430 \u0434\u0443\u043C\u0430\u0435\u0442. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u0441\u0440\u0430\u0437\u0443.",
    "agent.model": "\u041C\u043E\u0434\u0435\u043B\u044C",
    "agent.modelDesc": "GPT-5.5 \u2014 \u0441\u0430\u043C\u0430\u044F \u0443\u043C\u043D\u0430\u044F; GPT-5.4 \u2014 \u0441\u0431\u0430\u043B\u0430\u043D\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u0430\u044F; GPT-5.4-Mini \u2014 \u0441\u0430\u043C\u0430\u044F \u0431\u044B\u0441\u0442\u0440\u0430\u044F \u0438 \u043B\u0451\u0433\u043A\u0430\u044F.",
    "agent.reasoning": "\u0420\u0430\u0437\u043C\u044B\u0448\u043B\u0435\u043D\u0438\u0435",
    "agent.reasoningDesc": "\u041D\u0430\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0443\u0431\u043E\u043A\u043E \u041D\u0430\u043E\u043C\u0438 \u0434\u0443\u043C\u0430\u0435\u0442 \u043F\u0435\u0440\u0435\u0434 \u043E\u0442\u0432\u0435\u0442\u043E\u043C. \u041D\u0438\u0437\u043A\u0438\u0439 \u2014 \u0431\u044B\u0441\u0442\u0440\u043E \u0438 \u0435\u0441\u0442\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u043E \u0434\u043B\u044F \u0431\u043E\u043B\u0442\u043E\u0432\u043D\u0438; \u0432\u044B\u0448\u0435 \u2014 \u0434\u0443\u043C\u0430\u0435\u0442 \u0434\u043E\u043B\u044C\u0448\u0435.",
    "opt.off": "\u0412\u044B\u043A\u043B",
    "opt.low": "\u041D\u0438\u0437\u043A\u0438\u0439",
    "opt.medium": "\u0421\u0440\u0435\u0434\u043D\u0438\u0439",
    "opt.high": "\u0412\u044B\u0441\u043E\u043A\u0438\u0439",
    "opt.max": "\u041C\u0430\u043A\u0441",
    "opt.xhigh": "\u042D\u043A\u0441\u0442\u0440\u0430",
    "nav.account": "\u0410\u043A\u043A\u0430\u0443\u043D\u0442",
    "nav.docs": "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F",
    "docs.loading": "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u044E\u2026",
    "account.desc": "\u041D\u0430\u043E\u043C\u0438 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u043D\u0430 \u0442\u0432\u043E\u0435\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0435 ChatGPT. \u0412\u043E\u0439\u0434\u0438 \u043E\u0434\u0438\u043D \u0440\u0430\u0437 \u2014 \u0442\u043E\u043A\u0435\u043D \u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E \u0438 \u0441\u0430\u043C \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442\u0441\u044F.",
    "account.connected": "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    "account.disconnected": "\u041D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
    "account.plan": "\u041F\u043B\u0430\u043D",
    "account.loginHint": "\u0412\u043E\u0439\u0434\u0438 \u0447\u0435\u0440\u0435\u0437 \u0430\u043A\u043A\u0430\u0443\u043D\u0442 ChatGPT, \u0447\u0442\u043E\u0431\u044B \u041D\u0430\u043E\u043C\u0438 \u0437\u0430\u0440\u0430\u0431\u043E\u0442\u0430\u043B\u0430.",
    "account.login": "\u0412\u043E\u0439\u0442\u0438 \u0447\u0435\u0440\u0435\u0437 ChatGPT",
    "account.relogin": "\u0412\u043E\u0439\u0442\u0438 \u0437\u0430\u043D\u043E\u0432\u043E",
    "account.waiting": "\u0416\u0434\u0443 \u0432\u0445\u043E\u0434\u2026",
    "account.error": "\u041E\u0448\u0438\u0431\u043A\u0430",
    "account.browserHint": "\u041E\u0442\u043A\u0440\u044B\u043B\u0430\u0441\u044C \u0432\u043A\u043B\u0430\u0434\u043A\u0430 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u2014 \u0437\u0430\u0432\u0435\u0440\u0448\u0438 \u0432\u0445\u043E\u0434 \u0432 ChatGPT \u0442\u0430\u043C.",
    "about.title": "\u041E \u041D\u0430\u043E\u043C\u0438",
    "about.tagline": "\u0416\u0438\u0432\u043E\u0439 \u043A\u043E\u043C\u043F\u0430\u043D\u044C\u043E\u043D, \u0441 \u043A\u043E\u0442\u043E\u0440\u044B\u043C \u043F\u0440\u043E\u0441\u0442\u043E \u0431\u043E\u043B\u0442\u0430\u0435\u0448\u044C.",
    "about.creators": "\u0421\u043E\u0437\u0434\u0430\u0442\u0435\u043B\u0438",
    "about.slava": "\u0437\u0430\u043C\u044B\u0441\u0435\u043B, \u0441\u043F\u0435\u043A\u0438, \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0435 \u043F\u043E\u043B\u0435\u0432\u044B\u0435 \u0442\u0435\u0441\u0442\u044B",
    "about.claude": "\u0432\u0441\u044F \u0438\u043D\u0436\u0435\u043D\u0435\u0440\u0438\u044F \u2014 \u0441\u043F\u0440\u043E\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u0438 \u0441\u043E\u0431\u0440\u0430\u043D\u0430 \u0432 Claude Code",
    "about.naomi": "\u0441\u043E\u0430\u0432\u0442\u043E\u0440 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0445 \u0444\u0438\u0447: \u0441\u043F\u0435\u043A\u0438, \u0440\u0435\u0432\u044C\u044E, \u043D\u043E\u0447\u043D\u044B\u0435 \u043E\u0442\u0447\u0451\u0442\u044B",
    "composer.ph": "\u0421\u043F\u0440\u043E\u0441\u0438 \u0447\u0442\u043E \u0443\u0433\u043E\u0434\u043D\u043E\u2026",
    "empty.title": "\u0427\u0435\u043C \u043F\u043E\u043C\u043E\u0447\u044C?",
    "err.noReply": "\u041D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u0430 \u043E\u0442\u0432\u0435\u0442 \u2014 \u043F\u0440\u043E\u0432\u0435\u0440\u044C \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437."
  }
};
let UI_LANG = (() => {
  try {
    return localStorage.getItem("naomi-lang") || "ru";
  } catch (e) {
    return "ru";
  }
})();
function L(key) {
  const d = I18N[UI_LANG] || I18N.en;
  return d[key] !== void 0 ? d[key] : I18N.en[key] !== void 0 ? I18N.en[key] : key;
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
    if (/^\s+$/.test(tok)) {
      out.push(tok);
      continue;
    }
    const urlMatch = tok.match(/^(https?:\/\/[^\s]+?)([).,!?:;]*)$/);
    if (urlMatch) {
      const idx = ctx.streaming ? ctx.idx++ : 0;
      out.push(
        /* @__PURE__ */ React.createElement("a", { key: ctx.key++, className: ctx.streaming ? "word msg-link" : "msg-link", href: urlMatch[1], target: "_blank", rel: "noopener noreferrer", style: ctx.streaming ? { animationDelay: idx * ctx.perWord + "ms" } : void 0 }, urlMatch[1])
      );
      if (urlMatch[2]) out.push(urlMatch[2]);
      continue;
    }
    if (ctx.streaming) {
      const idx = ctx.idx++;
      out.push(
        /* @__PURE__ */ React.createElement("span", { key: ctx.key++, className: "word", "data-idx": idx, style: { animationDelay: idx * ctx.perWord + "ms" } }, tok)
      );
    } else {
      out.push(tok);
    }
  }
  return out;
}
function safeHref(url) {
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
      parts.push(/* @__PURE__ */ React.createElement("strong", { key: ctx.key++ }, renderInline(tok.slice(2, -2), ctx)));
    } else if (tok.startsWith("[")) {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const txt = mm ? mm[1] : tok;
      const href = mm ? safeHref(mm[2]) : null;
      const idx = ctx.streaming ? ctx.idx++ : 0;
      if (href) {
        parts.push(
          /* @__PURE__ */ React.createElement("a", { key: ctx.key++, className: ctx.streaming ? "word msg-link" : "msg-link", href, target: "_blank", rel: "noopener noreferrer", style: ctx.streaming ? { animationDelay: idx * ctx.perWord + "ms" } : void 0 }, txt)
        );
      } else {
        parts.push(
          /* @__PURE__ */ React.createElement("span", { key: ctx.key++, className: ctx.streaming ? "word" : void 0, style: ctx.streaming ? { animationDelay: idx * ctx.perWord + "ms" } : void 0 }, txt)
        );
      }
    } else {
      if (ctx.streaming) {
        const idx = ctx.idx++;
        parts.push(/* @__PURE__ */ React.createElement("code", { key: ctx.key++, className: "word", style: { animationDelay: idx * ctx.perWord + "ms" } }, tok.slice(1, -1)));
      } else {
        parts.push(/* @__PURE__ */ React.createElement("code", { key: ctx.key++ }, tok.slice(1, -1)));
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
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch (e) {
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "code-block" }, /* @__PURE__ */ React.createElement("div", { className: "code-head" }, /* @__PURE__ */ React.createElement("span", { className: "code-lang" }, lang || "code"), /* @__PURE__ */ React.createElement("button", { className: "code-copy", onClick: copy }, copied ? "\u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u2713" : "\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C")), /* @__PURE__ */ React.createElement("pre", null, /* @__PURE__ */ React.createElement("code", null, code)));
}
function splitFences(text) {
  const segments = [];
  let rest = text;
  for (; ; ) {
    const open = rest.match(/```([^\n`]*)\n/);
    if (!open) {
      if (rest) segments.push({ type: "prose", text: rest });
      break;
    }
    const before = rest.slice(0, open.index);
    if (before.trim()) segments.push({ type: "prose", text: before });
    const afterOpen = rest.slice(open.index + open[0].length);
    const closeIdx = afterOpen.indexOf("\n```");
    if (closeIdx === -1) {
      segments.push({ type: "code", lang: open[1].trim(), code: afterOpen.replace(/\n$/, "") });
      break;
    }
    segments.push({ type: "code", lang: open[1].trim(), code: afterOpen.slice(0, closeIdx) });
    const tail = afterOpen.slice(closeIdx + 4);
    rest = tail.replace(/^[^\n]*\n?/, "");
  }
  return segments;
}
function renderProseBlock(block, key, ctx) {
  const lines = block.split("\n");
  const hm = lines.length === 1 && block.match(/^(#{1,4})\s+(.+)$/);
  if (hm) {
    const lvl = hm[1].length;
    const Tag = lvl <= 1 ? "h2" : lvl === 2 ? "h3" : "h4";
    return /* @__PURE__ */ React.createElement(Tag, { key, className: "doc-h" }, renderInline(hm[2], ctx));
  }
  const isOrdered = lines.every((l) => /^\s*\d+\.\s/.test(l));
  const isBullet = lines.every((l) => /^\s*[-•]\s/.test(l));
  if (isOrdered) {
    return /* @__PURE__ */ React.createElement("ol", { key, style: { margin: "0 0 0.85em", padding: 0, listStyle: "none" } }, lines.map((l, li) => {
      const mk = ctx.streaming ? /* @__PURE__ */ React.createElement("span", { className: "word", style: { animationDelay: ctx.idx++ * ctx.perWord + "ms" } }, li + 1 + ".") : /* @__PURE__ */ React.createElement("span", null, li + 1 + ".");
      return /* @__PURE__ */ React.createElement("li", { key: li, style: { display: "flex", gap: "0.55em", marginBottom: 4 } }, mk, /* @__PURE__ */ React.createElement("span", { style: { minWidth: 0 } }, renderInline(l.replace(/^\s*\d+\.\s/, ""), ctx)));
    }));
  }
  if (isBullet) {
    return /* @__PURE__ */ React.createElement("ul", { key, style: { margin: "0 0 0.85em", padding: 0, listStyle: "none" } }, lines.map((l, li) => {
      const mk = ctx.streaming ? /* @__PURE__ */ React.createElement("span", { className: "word", style: { animationDelay: ctx.idx++ * ctx.perWord + "ms" } }, "\u2022") : /* @__PURE__ */ React.createElement("span", null, "\u2022");
      return /* @__PURE__ */ React.createElement("li", { key: li, style: { display: "flex", gap: "0.55em", marginBottom: 4 } }, mk, /* @__PURE__ */ React.createElement("span", { style: { minWidth: 0 } }, renderInline(l.replace(/^\s*[-•]\s/, ""), ctx)));
    }));
  }
  const looksTable = lines.length >= 2 && lines.every((l) => l.includes("|")) && /^[\s|:-]+$/.test(lines[1]) && lines[1].includes("-");
  if (looksTable) {
    const toCells = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    const header = toCells(lines[0]);
    const rows = lines.slice(2).filter((l) => l.trim()).map(toCells);
    return /* @__PURE__ */ React.createElement("table", { key, className: "md-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, header.map((c, ci) => /* @__PURE__ */ React.createElement("th", { key: ci }, renderInline(c, ctx))))), /* @__PURE__ */ React.createElement("tbody", null, rows.map((r, ri) => /* @__PURE__ */ React.createElement("tr", { key: ri }, r.map((c, ci) => /* @__PURE__ */ React.createElement("td", { key: ci }, renderInline(c, ctx)))))));
  }
  return /* @__PURE__ */ React.createElement("p", { key }, lines.map((l, li) => /* @__PURE__ */ React.createElement(React.Fragment, { key: li }, renderInline(l, ctx), li < lines.length - 1 ? /* @__PURE__ */ React.createElement("br", null) : null)));
}
function formatAssistant(text, streaming) {
  if (!text) return null;
  const ctx = { streaming: !!streaming, idx: 0, key: 0, perWord: 26 };
  const rendered = [];
  splitFences(text).forEach((seg, si) => {
    if (seg.type === "code") {
      rendered.push(/* @__PURE__ */ React.createElement(CodeBlock, { key: "c" + si, lang: seg.lang, code: seg.code }));
      return;
    }
    seg.text.replace(/^\n+|\n+$/g, "").split(/\n{2,}/).forEach((block, bi) => {
      if (block.trim()) rendered.push(renderProseBlock(block, "p" + si + "-" + bi, ctx));
    });
  });
  return { content: rendered, totalWords: ctx.idx, perWord: ctx.perWord };
}
const IconSend = () => /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 16 16", fill: "none" }, /* @__PURE__ */ React.createElement("path", { d: "M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
function Composer({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const taRef = useRef(null);
  useEffect(() => {
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }
  const canSend = value.trim().length > 0 && !disabled;
  return /* @__PURE__ */ React.createElement("div", { className: "composer-wrap" }, /* @__PURE__ */ React.createElement("form", { className: "composer", onSubmit: submit }, /* @__PURE__ */ React.createElement(
    "textarea",
    {
      ref: taRef,
      rows: 1,
      placeholder: L("composer.ph"),
      value,
      onChange: (e) => setValue(e.target.value),
      onKeyDown: onKey,
      autoFocus: true
    }
  ), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "send-btn", disabled: !canSend, "aria-label": "Send" }, /* @__PURE__ */ React.createElement(IconSend, null))));
}
function Turn({ turn, isLast, busy, leaving, instant, minHeight, spinnerStyle, spinnerLabel }) {
  const assistants = turn.assistants || [];
  return /* @__PURE__ */ React.createElement("div", { className: "turn", "data-turn-id": turn.id, style: isLast && minHeight && turn.user ? { minHeight } : void 0 }, turn.user ? /* @__PURE__ */ React.createElement("div", { className: "row-user", style: { fontFamily: "Geist" } }, /* @__PURE__ */ React.createElement("div", { className: "bubble-user" }, turn.user.content)) : null, assistants.map((asst, index) => {
    const streaming = !!(asst && asst.streaming);
    const formatted = formatAssistant(asst.content, streaming);
    const isLastAsst = index === assistants.length - 1;
    return /* @__PURE__ */ React.createElement("div", { className: "row-asst", key: asst.id }, /* @__PURE__ */ React.createElement("div", { className: "asst-spinner-slot" + (busy && isLastAsst ? leaving ? " is-leaving" : " is-busy" : "") + (instant && busy && isLastAsst ? " is-instant" : "") }, /* @__PURE__ */ React.createElement("span", { className: "sp-fade" }, /* @__PURE__ */ React.createElement("span", { className: "sp-blink" }, /* @__PURE__ */ React.createElement(Spinner, { kind: spinnerStyle, label: spinnerLabel })))), /* @__PURE__ */ React.createElement("div", { className: "asst-body" + (asst.erasing ? " is-erasing" : "") }, asst.taskLabel ? /* @__PURE__ */ React.createElement("div", { className: "task-ref" }, "\u21B3 ", asst.taskLabel) : null, formatted ? formatted.content : null));
  }), assistants.length === 0 && busy ? /* @__PURE__ */ React.createElement("div", { className: "row-asst" }, /* @__PURE__ */ React.createElement("div", { className: "asst-spinner-slot is-busy" + (instant ? " is-instant" : "") }, /* @__PURE__ */ React.createElement("span", { className: "sp-fade" }, /* @__PURE__ */ React.createElement("span", { className: "sp-blink" }, /* @__PURE__ */ React.createElement(Spinner, { kind: spinnerStyle, label: spinnerLabel })))), /* @__PURE__ */ React.createElement("div", { className: "asst-body" })) : null);
}
function EmptyState() {
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8vh 0 4vh", minHeight: "60vh" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--font-serif)", fontSize: 34, letterSpacing: "-0.02em", lineHeight: 1.1, textAlign: "center", maxWidth: 480 } }, L("empty.title")));
}
function setAdd(setter, id) {
  setter((prev) => {
    if (prev.has(id)) return prev;
    const n = new Set(prev);
    n.add(id);
    return n;
  });
}
function setDel(setter, id) {
  setter((prev) => {
    if (!prev.has(id)) return prev;
    const n = new Set(prev);
    n.delete(id);
    return n;
  });
}
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [thinking, setThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("agent");
  const [agentCfg, setAgentCfg] = useState({
    model: "gpt-5.5",
    reasoning: "low"
  });
  const [authInfo, setAuthInfo] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const loadAuth = () => fetch("/api/auth/status").then((r) => r.json()).then(setAuthInfo).catch(() => {
  });
  const [docs, setDocs] = useState("");
  const loadDocs = () => fetch("/api/docs").then((r) => r.json()).then((d) => setDocs(d.markdown || "")).catch(() => {
  });
  const startLogin = () => {
    setAuthBusy(true);
    fetch("/api/auth/login", { method: "POST" }).then((r) => r.json()).then((d) => {
      if (d && d.authorize_url) {
        try {
          window.open(d.authorize_url, "_blank", "noopener");
        } catch (e) {
        }
      }
      const t2 = setInterval(() => {
        fetch("/api/auth/status").then((r) => r.json()).then((s) => {
          setAuthInfo(s);
          const st = s && s.login && s.login.status;
          if (st === "success" || st === "error") {
            clearInterval(t2);
            setAuthBusy(false);
          }
        }).catch(() => {
        });
      }, 1500);
      setTimeout(() => {
        clearInterval(t2);
        setAuthBusy(false);
      }, 3e5);
    }).catch(() => setAuthBusy(false));
  };
  const scfg = (k, v) => setAgentCfg((c) => {
    const next = Object.assign({}, c, { [k]: v });
    fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {
    });
    return next;
  });
  const loadSettings = () => fetch("/api/settings").then((r) => r.json()).then((d) => setAgentCfg((c) => Object.assign({}, c, d))).catch(() => {
  });
  useEffect(() => {
    loadSettings();
    loadAuth();
  }, []);
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);
  const [uiLang, setUiLang] = useState(UI_LANG);
  const switchLang = (v) => {
    UI_LANG = v;
    try {
      localStorage.setItem("naomi-lang", v);
    } catch (e) {
    }
    setUiLang(v);
  };
  const [busyTurns, setBusyTurns] = useState(() => /* @__PURE__ */ new Set());
  const [fadingTurns, setFadingTurns] = useState(() => /* @__PURE__ */ new Set());
  const [instantTurns, setInstantTurns] = useState(() => /* @__PURE__ */ new Set());
  const [scrollH, setScrollH] = useState(600);
  const scrollRef = useRef(null);
  const lastSubmittedRef = useRef(null);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    document.body.dataset.theme = t.theme;
    document.body.dataset.density = t.density;
    document.body.dataset.stream = t.streamEffect || "blur";
    try {
      localStorage.setItem("naomi-theme", t.theme);
    } catch (e) {
    }
  }, [t.theme, t.density, t.streamEffect]);
  const [version, setVersion] = useState("");
  const loadVersion = () => fetch("/api/health").then((r) => r.json()).then((d) => setVersion(d.version || "")).catch(() => {
  });
  useEffect(() => {
    loadVersion();
  }, []);
  useEffect(() => {
    fetch("/api/history").then((r) => r.json()).then((data) => {
      const hist = data && data.messages || [];
      if (!hist.length) return;
      const msgs = hist.map((m) => ({ id: nid(m.role === "user" ? "u" : "a"), role: m.role, content: m.content }));
      setMessages((prev) => prev.length ? prev : msgs);
      setTimeout(() => {
        const el = scrollRef.current;
        if (el) {
          el.style.scrollBehavior = "auto";
          el.scrollTop = el.scrollHeight;
          el.style.scrollBehavior = "";
        }
      }, 60);
    }).catch(() => {
    });
  }, []);
  useEffect(() => {
    let es = null;
    let stopped = false;
    let needResync = false;
    const resync = () => {
      fetch("/api/history").then((r) => r.json()).then((data) => {
        const hist = data && data.messages || [];
        const msgs = hist.map((m) => ({ id: nid(m.role === "user" ? "u" : "a"), role: m.role, content: m.content }));
        setBusyTurns(/* @__PURE__ */ new Set());
        setFadingTurns(/* @__PURE__ */ new Set());
        setInstantTurns(/* @__PURE__ */ new Set());
        setMessages(msgs);
      }).catch(() => {
      });
      loadVersion();
    };
    const handleSse = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "incoming") {
          var _r = data.role === "user" ? "user" : "assistant";
          var _iid = nid(_r === "user" ? "u" : "a");
          var _ms = countWords(data.content) * 26 + 560;
          setMessages(function(prev) {
            return prev.concat([{ id: _iid, role: _r, content: data.content, streaming: _r === "assistant" }]);
          });
          if (_r === "assistant") {
            setTimeout(function() {
              setMessages(function(prev) {
                return prev.map(function(m) {
                  return m.id === _iid ? Object.assign({}, m, { streaming: false }) : m;
                });
              });
            }, _ms);
          }
          return;
        }
      } catch (err) {
        console.error("Error parsing SSE event:", err);
      }
    };
    let backoff = 2e3;
    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/events");
      es.onmessage = handleSse;
      es.onopen = () => {
        backoff = 2e3;
        if (needResync) {
          needResync = false;
          resync();
        }
      };
      es.onerror = () => {
        needResync = true;
        if (es.readyState === EventSource.CLOSED) {
          setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 3e4);
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      if (es) es.close();
    };
  }, []);
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
    if (agentCfg.reasoning === "off") setAdd(setInstantTurns, userId);
    else setDel(setInstantTurns, userId);
    lastSubmittedRef.current = userId;
    try {
      const reply = await window.claude.complete({
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        client_turn_id: userId
      });
      const replyObj = reply && typeof reply === "object" ? reply : null;
      if (replyObj && replyObj.silent) {
        setDel(setBusyTurns, userId);
        setDel(setFadingTurns, userId);
        setDel(setInstantTurns, userId);
        return;
      }
      const replyVal = replyObj ? replyObj.reply : reply;
      const replyText = typeof replyVal === "string" ? replyVal : String(replyVal);
      const aId = nid("a");
      setMessages((prev) => [...prev, { id: aId, role: "assistant", content: replyText, streaming: true }]);
      const totalMs = countWords(replyText) * 26 + 560;
      if (replyObj && replyObj.thought) setDel(setInstantTurns, userId);
      else setAdd(setInstantTurns, userId);
      setTimeout(() => {
        setMessages((prev) => prev.map((m) => m.id === aId ? { ...m, streaming: false } : m));
        setTimeout(() => setAdd(setFadingTurns, userId), 500);
        setTimeout(() => {
          setDel(setBusyTurns, userId);
          setDel(setFadingTurns, userId);
          setDel(setInstantTurns, userId);
        }, 500 + 380);
      }, totalMs);
    } catch (err) {
      setMessages((prev) => [...prev, { id: nid("a"), role: "assistant", content: L("err.noReply") }]);
      setDel(setBusyTurns, userId);
      setDel(setFadingTurns, userId);
      setDel(setInstantTurns, userId);
    } finally {
      setThinking(false);
    }
  }
  const lastTurnMinHeight = Math.max(280, scrollH - 16 - 190);
  return /* @__PURE__ */ React.createElement("div", { className: "app" }, /* @__PURE__ */ React.createElement("header", { className: "hdr" }, /* @__PURE__ */ React.createElement("div", { className: "hdr-l" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "hdr-title" }, t.agentName))), /* @__PURE__ */ React.createElement("div", { className: "hdr-r" }, /* @__PURE__ */ React.createElement("button", { className: "ghost-btn", "aria-label": "Settings", title: "Settings", onClick: () => {
    setSettingsOpen(true);
    loadSettings();
  } }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }))))), /* @__PURE__ */ React.createElement("main", { className: "scroll", ref: scrollRef }, /* @__PURE__ */ React.createElement("div", { className: "conversation" }, turns.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, null) : turns.map((turn, i) => {
    const isLast = i === turns.length - 1;
    return /* @__PURE__ */ React.createElement(
      Turn,
      {
        key: turn.id,
        turn,
        isLast,
        busy: busyTurns.has(turn.id),
        leaving: fadingTurns.has(turn.id),
        instant: instantTurns.has(turn.id),
        spinnerStyle: t.spinnerStyle,
        spinnerLabel: t.spinnerLabel,
        minHeight: lastTurnMinHeight
      }
    );
  }))), /* @__PURE__ */ React.createElement(Composer, { onSend: handleSend, disabled: thinking }), version ? /* @__PURE__ */ React.createElement("div", { className: "version-badge", title: "\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F (git HEAD)" }, version) : null, /* @__PURE__ */ React.createElement(TweaksPanel, { title: "Tweaks" }, /* @__PURE__ */ React.createElement(TweakSection, { label: "\u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u0432\u0438\u0434" }), /* @__PURE__ */ React.createElement(TweakRadio, { label: "\u0422\u0435\u043C\u0430", value: t.theme, options: ["light", "dark"], onChange: (v) => setTweak("theme", v) }), /* @__PURE__ */ React.createElement(TweakRadio, { label: "\u041F\u043B\u043E\u0442\u043D\u043E\u0441\u0442\u044C", value: t.density, options: ["compact", "regular", "comfy"], onChange: (v) => setTweak("density", v) }), /* @__PURE__ */ React.createElement(TweakSelect, { label: "\u042D\u0444\u0444\u0435\u043A\u0442 \u043F\u043E\u0442\u043E\u043A\u0430", value: t.streamEffect, options: ["blur", "rise", "glow", "fade", "tilt", "bloom", "scan"], onChange: (v) => setTweak("streamEffect", v) }), /* @__PURE__ */ React.createElement(TweakSection, { label: "\u0421\u043F\u0438\u043D\u0435\u0440" }), /* @__PURE__ */ React.createElement(TweakSelect, { label: "\u0421\u0442\u0438\u043B\u044C", value: t.spinnerStyle, options: ["ring", "dots", "pulse", "bars", "orbit", "shimmer", "wave", "morph", "breath", "dual", "pillar"], onChange: (v) => setTweak("spinnerStyle", v) }), /* @__PURE__ */ React.createElement(TweakText, { label: "\u041F\u043E\u0434\u043F\u0438\u0441\u044C (\u0434\u043B\u044F shimmer)", value: t.spinnerLabel, onChange: (v) => setTweak("spinnerLabel", v) }), /* @__PURE__ */ React.createElement(TweakSection, { label: "\u0410\u0433\u0435\u043D\u0442" }), /* @__PURE__ */ React.createElement(TweakText, { label: "\u0418\u043C\u044F", value: t.agentName, onChange: (v) => setTweak("agentName", v) }), /* @__PURE__ */ React.createElement(TweakText, { label: "\u0418\u043D\u0438\u0446\u0438\u0430\u043B", value: t.agentInitial, onChange: (v) => setTweak("agentInitial", v.slice(0, 1).toUpperCase()) })), /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("style", null, ".set-backdrop{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.5);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;animation:setfade .15s ease}@keyframes setfade{from{opacity:0}to{opacity:1}}.set-modal{position:relative;width:min(860px,92vw);height:min(600px,85vh);display:flex;background:#1d1d1b;color:#ece9e3;border:1px solid rgba(255,255,255,.09);border-radius:16px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.55)}.set-side{flex:0 0 210px;background:#171716;border-right:1px solid rgba(255,255,255,.07);padding:18px 10px;display:flex;flex-direction:column;gap:2px}.set-nav{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:9px;cursor:pointer;color:#b6b3aa;font-size:14px;border:none;background:none;text-align:left;width:100%;font-family:inherit;transition:background .12s,color .12s}.set-nav:hover{background:rgba(255,255,255,.05);color:#ece9e3}.set-nav.active{background:rgba(255,255,255,.1);color:#fff}.set-nav svg{width:18px;height:18px;flex:0 0 18px;opacity:.9}.set-main{flex:1;min-width:0;padding:28px 34px;overflow-y:auto}.set-h{font-size:21px;font-weight:600;margin:0 0 18px}.set-row{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:17px 2px;border-bottom:1px solid rgba(255,255,255,.06)}.set-row:last-child{border-bottom:none}.set-rt{font-size:14.5px;font-weight:500;margin:0 0 4px}.set-rd{font-size:13px;color:#9a978f;margin:0;line-height:1.5;max-width:46ch}.set-x{position:absolute;top:16px;right:18px;background:none;border:none;color:#9a978f;font-size:20px;cursor:pointer;line-height:1;padding:4px;z-index:2}.set-x:hover{color:#fff}.set-select{background:#2b2b28;color:#ece9e3;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 10px;font-size:13.5px;cursor:pointer;font-family:inherit}.set-sw{width:42px;height:24px;border-radius:999px;border:none;cursor:pointer;position:relative;transition:background .15s;background:#3a3a37;flex:0 0 auto}.set-sw.on{background:#4a9eff}.set-sw::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}.set-sw.on::after{left:21px}.set-btn{background:#2b2b28;color:#ece9e3;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;font-family:inherit}.set-btn:hover{background:#35342f}.doc-h{font-size:16px;font-weight:600;margin:18px 0 8px;color:#ece9e3}.doc-h:first-child{margin-top:0}.doc-body{font-size:13.5px;line-height:1.6;color:#c9c6be}.doc-body p{margin:0 0 10px}.doc-body code{background:#2b2b28;padding:1px 5px;border-radius:4px;font-size:12px}.doc-body table{font-size:12.5px}"), settingsOpen ? /* @__PURE__ */ React.createElement("div", { className: "set-backdrop", onClick: () => setSettingsOpen(false) }, /* @__PURE__ */ React.createElement("div", { className: "set-modal", role: "dialog", "aria-modal": "true", "aria-label": "Settings", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("button", { className: "set-x", "aria-label": "Close", onClick: () => setSettingsOpen(false) }, "\u2715"), /* @__PURE__ */ React.createElement("div", { className: "set-side" }, /* @__PURE__ */ React.createElement("button", { className: "set-nav" + (settingsTab === "agent" ? " active" : ""), onClick: () => setSettingsTab("agent") }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "7", r: "4" })), /* @__PURE__ */ React.createElement("span", null, L("nav.agent"))), /* @__PURE__ */ React.createElement("button", { className: "set-nav" + (settingsTab === "account" ? " active" : ""), onClick: () => {
    setSettingsTab("account");
    loadAuth();
  } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zM15.5 7.5l3 3L22 7l-3-3-3.5 3.5z" })), /* @__PURE__ */ React.createElement("span", null, L("nav.account"))), /* @__PURE__ */ React.createElement("button", { className: "set-nav" + (settingsTab === "docs" ? " active" : ""), onClick: () => {
    setSettingsTab("docs");
    loadDocs();
  } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }), /* @__PURE__ */ React.createElement("path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" })), /* @__PURE__ */ React.createElement("span", null, L("nav.docs"))), /* @__PURE__ */ React.createElement("button", { className: "set-nav" + (settingsTab === "about" ? " active" : ""), style: { marginTop: "auto" }, onClick: () => setSettingsTab("about") }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "16", x2: "12", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" })), /* @__PURE__ */ React.createElement("span", null, L("nav.about")))), /* @__PURE__ */ React.createElement("div", { className: "set-main" }, settingsTab === "agent" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", { className: "set-h" }, L("nav.agent")), /* @__PURE__ */ React.createElement("p", { className: "set-rd", style: { margin: "0 0 16px" } }, L("agent.desc")), /* @__PURE__ */ React.createElement("div", { className: "set-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "set-rt" }, L("agent.model")), /* @__PURE__ */ React.createElement("p", { className: "set-rd" }, L("agent.modelDesc"))), /* @__PURE__ */ React.createElement("select", { className: "set-select", value: agentCfg.model, onChange: (e) => scfg("model", e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "gpt-5.5" }, "GPT-5.5"), /* @__PURE__ */ React.createElement("option", { value: "gpt-5.4" }, "GPT-5.4"), /* @__PURE__ */ React.createElement("option", { value: "gpt-5.4-mini" }, "GPT-5.4-Mini"))), /* @__PURE__ */ React.createElement("div", { className: "set-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "set-rt" }, L("agent.reasoning")), /* @__PURE__ */ React.createElement("p", { className: "set-rd" }, L("agent.reasoningDesc"))), /* @__PURE__ */ React.createElement("select", { className: "set-select", value: agentCfg.reasoning, onChange: (e) => scfg("reasoning", e.target.value) }, /* @__PURE__ */ React.createElement("option", { value: "low" }, L("opt.low")), /* @__PURE__ */ React.createElement("option", { value: "medium" }, L("opt.medium")), /* @__PURE__ */ React.createElement("option", { value: "high" }, L("opt.high")), /* @__PURE__ */ React.createElement("option", { value: "xhigh" }, L("opt.xhigh"))))) : settingsTab === "account" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", { className: "set-h" }, L("nav.account")), /* @__PURE__ */ React.createElement("p", { className: "set-rd", style: { margin: "0 0 16px" } }, L("account.desc")), /* @__PURE__ */ React.createElement("div", { className: "set-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "set-rt" }, authInfo && authInfo.logged_in ? L("account.connected") : L("account.disconnected")), /* @__PURE__ */ React.createElement("p", { className: "set-rd" }, authInfo && authInfo.logged_in ? L("account.plan") + ": " + (authInfo.plan || "\u2014") : L("account.loginHint"))), /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 9, height: 9, borderRadius: "50%", background: authInfo && authInfo.logged_in ? "#3fb950" : "#8b8b8b", display: "inline-block" } }), /* @__PURE__ */ React.createElement("button", { className: "set-btn", onClick: startLogin, disabled: authBusy }, authBusy ? L("account.waiting") : authInfo && authInfo.logged_in ? L("account.relogin") : L("account.login")))), authInfo && authInfo.login && authInfo.login.status === "error" ? /* @__PURE__ */ React.createElement("p", { className: "set-rd", style: { color: "#e5736b" } }, L("account.error"), ": ", authInfo.login.error) : null, authBusy ? /* @__PURE__ */ React.createElement("p", { className: "set-rd", style: { margin: "10px 0 0" } }, L("account.browserHint")) : null) : settingsTab === "docs" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", { className: "set-h" }, L("nav.docs")), docs ? /* @__PURE__ */ React.createElement("div", { className: "doc-body" }, formatAssistant(docs, false).content) : /* @__PURE__ */ React.createElement("p", { className: "set-rd" }, L("docs.loading"))) : settingsTab === "about" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", { className: "set-h" }, L("about.title")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "6px 0 16px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 34, fontWeight: 700, letterSpacing: ".5px" } }, "Naomi"), /* @__PURE__ */ React.createElement("p", { className: "set-rd", style: { margin: "6px auto 0" } }, L("about.tagline"))), /* @__PURE__ */ React.createElement("div", { className: "set-row", style: { display: "block" } }, /* @__PURE__ */ React.createElement("p", { className: "set-rt" }, L("about.creators")), /* @__PURE__ */ React.createElement("p", { className: "set-rd", style: { margin: "8px 0 0" } }, /* @__PURE__ */ React.createElement("b", { style: { color: "#ece9e3" } }, "\u0421\u043B\u0430\u0432\u0430 (PopaSpinka)"), " \u2014 ", L("about.slava")), /* @__PURE__ */ React.createElement("p", { className: "set-rd", style: { margin: "6px 0 0" } }, /* @__PURE__ */ React.createElement("b", { style: { color: "#ece9e3" } }, "Claude Fable 5 Max"), " \u2014 ", L("about.claude")), /* @__PURE__ */ React.createElement("p", { className: "set-rd", style: { margin: "6px 0 0" } }, /* @__PURE__ */ React.createElement("b", { style: { color: "#ece9e3" } }, "Naomi"), " \u2014 ", L("about.naomi")))) : null))) : null));
}
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("UI render error:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return /* @__PURE__ */ React.createElement("div", { style: { padding: 24, fontFamily: "system-ui, sans-serif", color: "var(--text)", maxWidth: 560, margin: "10vh auto" } }, /* @__PURE__ */ React.createElement("h2", { style: { marginBottom: 8 } }, "The interface hit an error"), /* @__PURE__ */ React.createElement("p", { style: { opacity: 0.8, lineHeight: 1.5 } }, "Your conversation is safe on the server. Reload to restore it."), /* @__PURE__ */ React.createElement("button", { className: "set-btn", style: { marginTop: 12 }, onClick: () => location.reload() }, "Reload"), /* @__PURE__ */ React.createElement("pre", { style: { whiteSpace: "pre-wrap", opacity: 0.5, marginTop: 16, fontSize: 12 } }, String(this.state.error)));
  }
}
ReactDOM.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ React.createElement(ErrorBoundary, null, /* @__PURE__ */ React.createElement(App, null))
);
