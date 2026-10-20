/*
 * Accessible Visualisation Kit — core (no dependencies, no build step).
 *
 * AccessibleViz.create({ root, adapter, chat, voice, listen }) builds a
 * screen-reader-first shell around any visualisation:
 *   purpose sentence → skip link → chat (headline, summary, suggestions,
 *   voice + text input, answer) → visualisation (description, key figures,
 *   views with text equivalents).
 *
 * See README.md for the adapter contract.
 */
(function (global) {
  "use strict";
  var uid = 0;

  function h(tag, props) {
    var n = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(function (c) {
        if (c == null || c === false) return;
        n.append(c);
      });
    }
    return n;
  }

  function svg(paths) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.innerHTML = paths;
    return s;
  }
  var ICON_MIC = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
  var ICON_PLAY = '<path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>';
  var ICON_STOP = '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>';

  // Roving tabindex: one Tab stop per group, arrow keys / Home / End move within it.
  function rove(container, selector, onMove) {
    var idx = 0;
    function items() { return Array.prototype.slice.call(container.querySelectorAll(selector)); }
    function sync() {
      var list = items();
      if (idx >= list.length) idx = 0;
      list.forEach(function (it, i) { it.tabIndex = i === idx ? 0 : -1; });
    }
    container.addEventListener("keydown", function (e) {
      var list = items();
      var cur = list.indexOf(document.activeElement);
      if (cur < 0) return;
      var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      var next;
      if (step) next = (cur + step + list.length) % list.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = list.length - 1;
      else return;
      e.preventDefault();
      idx = next;
      sync();
      list[next].focus();
      if (onMove) onMove(list[next], next);
    });
    container.addEventListener("focusin", function (e) {
      var i = items().indexOf(e.target);
      if (i >= 0) { idx = i; sync(); }
    });
    return { sync: sync, set: function (i) { idx = i; sync(); } };
  }

  function val(f, state, fallback) {
    if (typeof f === "function") return f(state);
    return f == null ? fallback : f;
  }

  function buildTable(t) {
    if (!t || !t.rows || !t.rows.length) return null;
    return h("div", { class: "av-table-scroll" },
      h("table", { class: "av-table" },
        t.caption ? h("caption", { class: "av-sr-only", text: t.caption }) : null,
        h("thead", {}, h("tr", {}, t.columns.map(function (c) { return h("th", { scope: "col", text: c }); }))),
        h("tbody", {}, t.rows.map(function (r) {
          return h("tr", {}, r.map(function (c, i) {
            return i === 0 ? h("th", { scope: "row", text: String(c) }) : h("td", { text: String(c) });
          }));
        }))
      )
    );
  }

  function create(opts) {
    var A = opts.adapter;
    var root = opts.root;
    var engines = [].concat(opts.chat || []);
    var id = "av" + (++uid);
    var topic = A.topic || "the data";
    var S = function () { return A.getState ? A.getState() : undefined; };
    var kit = {};
    var current = null;
    var history = [];
    var quietUntil = 0;
    var announceTimer = null;
    // Views with hidden: true are not shown; they exist only as data for the chat (snapshot()).
    var shown = (A.views || []).filter(function (v) { return !v.hidden; });
    var activeView = shown.length ? shown[0].id : null;
    var viewEls = {};

    root.innerHTML = "";
    root.classList.add("av-root");

    // 1. Purpose sentence — the first thing a screen reader reads.
    var purpose = h("p", { class: "av-sr-only", text: A.purpose });

    // 2. Skip link — the first Tab stop.
    var input;
    var skip = h("a", {
      class: "av-skip", href: "#" + id + "-query",
      text: A.skipLabel || "Skip to " + topic.replace(/^the /i, "") + " questions",
      onclick: function (e) { e.preventDefault(); input.focus(); },
    });

    // Polite region for control changes (not for chat answers — focus carries those).
    var live = h("div", { class: "av-sr-only", "aria-live": "polite", "aria-atomic": "true" });

    // 3. Chat panel
    var headline = h("h1", { class: "av-headline" });
    var summary = h("p", { class: "av-summary" });
    var intro = A.chatIntro ? h("p", { class: "av-intro", text: A.chatIntro }) : null;

    var qText = h("p", { class: "av-q" });
    var aText = h("p", { class: "av-a", tabindex: "-1" });
    var listen = opts.listen === false ? null : listenButton(function () { return current && current.answer; });
    var answerBox = h("section", { class: "av-answer", "aria-label": "Latest answer", hidden: true },
      h("h2", { class: "av-label", text: "Your question" }), qText,
      h("h2", { class: "av-label", text: "Latest answer" }), aText,
      listen ? h("div", { class: "av-answer-row" }, listen.el) : null
    );

    // Suggestions: read as "Try asking: Suggested questions", then the options as a list.
    var suggest = null;
    if (A.suggestions && A.suggestions.length) {
      var list = h("ul", { class: "av-suggest-list" },
        A.suggestions.map(function (q) {
          return h("li", {}, h("button", { type: "button", class: "av-chip", text: q, onclick: function () { ask(q); } }));
        })
      );
      suggest = h("div", { class: "av-suggest", role: "group", "aria-labelledby": id + "-try " + id + "-sq" },
        h("p", { class: "av-suggest-label", id: id + "-try", "aria-hidden": "true", text: "Try asking:" }),
        h("span", { id: id + "-sq", hidden: true, text: "Suggested questions" }),
        list
      );
      rove(list, "button").sync();
    }

    input = h("input", {
      id: id + "-query", class: "av-input", type: "text", autocomplete: "off",
      placeholder: A.placeholder || "What would you like to know?",
      "aria-label": "Chat to explore " + topic,
      "aria-describedby": id + "-hint",
    });
    var send = h("button", { type: "submit", class: "av-send", hidden: true, text: "Send" });
    input.addEventListener("input", function () { send.hidden = !input.value.trim(); });
    var form = h("form", { class: "av-form", onsubmit: function (e) { e.preventDefault(); ask(input.value); } });
    var voice = opts.voice === false ? null : voiceInput(form, function (t) { ask(t); });
    if (voice) form.append(voice.el);
    form.append(input, send);
    var hint = h("p", { id: id + "-hint", hidden: true, text: "Type a question and press Enter to send. A Send button also appears after the text box once you start typing." });

    var historyBox = h("details", { class: "av-history", hidden: true });

    var chat = h("section", { class: "av-chat", "aria-label": A.chatLabel || "Ask about " + topic },
      headline, summary, intro, answerBox, suggest, form, hint, historyBox
    );

    // 4. Visualisation panel
    var vizHeadingId = id + "-viz";
    var note = h("p", { class: "av-note" });
    var vizDesc = h("p", { class: "av-viz-desc" });
    var figures = h("ul", { class: "av-figures", "aria-label": A.figuresLabel || "Key figures" });
    var figRove = rove(figures, "li");
    var viz = h("section", { class: "av-viz", "aria-labelledby": vizHeadingId },
      h("header", { class: "av-viz-header" }, h("h2", { id: vizHeadingId, text: A.vizTitle || "Visualisation" }), note),
      vizDesc, figures
    );

    if (shown.length) {
      var multi = shown.length > 1;
      if (A.viewsTitle) viz.append(h("h3", { class: "av-views-title", id: id + "-views", text: A.viewsTitle }));
      var tablist = null;
      if (multi) {
        tablist = h("div", { class: "av-tabs", role: "tablist", "aria-label": A.viewsTitle || "Views" });
        viz.append(tablist);
      }
      shown.forEach(function (v) {
        var panel = h("div", { class: "av-panel", id: id + "-panel-" + v.id });
        if (multi) {
          var tab = h("button", {
            type: "button", role: "tab", class: "av-tab", id: id + "-tab-" + v.id, text: v.name,
            onclick: function () { showView(v.id); },
          });
          tablist.append(tab);
          panel.setAttribute("role", "tabpanel");
          panel.setAttribute("aria-labelledby", tab.id);
          viewEls[v.id] = { tab: tab };
        } else {
          panel.append(h(A.viewsTitle ? "h4" : "h3", { class: "av-view-name", text: v.name }));
          viewEls[v.id] = {};
        }
        var e = viewEls[v.id];
        e.panel = panel;
        // Visual-only by default: the description and table carry the content.
        if (v.render) e.slot = h("div", { class: "av-slot", "aria-hidden": v.interactive ? null : "true" });
        e.desc = h("p", { class: "av-view-desc" });
        e.table = h("div");
        if (e.slot) panel.append(e.slot);
        panel.append(e.desc, e.table);
        viz.append(panel);
      });
      if (multi) rove(tablist, "[role=tab]", function (tab) { tab.click(); });
    }

    root.append(purpose, skip, chat, viz, live);

    // ---- behaviour ----
    function showView(vid) {
      if (!viewEls[vid]) return;
      activeView = vid;
      shown.forEach(function (v) {
        var e = viewEls[v.id];
        var on = v.id === vid;
        e.panel.hidden = !on;
        if (e.tab) {
          e.tab.setAttribute("aria-selected", on ? "true" : "false");
          e.tab.tabIndex = on ? 0 : -1;
          if (on) e.tab.setAttribute("aria-controls", e.panel.id); else e.tab.removeAttribute("aria-controls");
        }
      });
      renderView(vid);
    }

    function renderView(vid) {
      var v = shown.filter(function (x) { return x.id === vid; })[0];
      var e = viewEls[vid];
      var s = S();
      if (v.render && e.slot) v.render(e.slot, s, kit);
      e.desc.textContent = val(v.describe, s, "");
      var t = v.table ? v.table(s) : null;
      var wasOpen = e.table.querySelector("details") && e.table.querySelector("details").open;
      e.table.innerHTML = "";
      var tbl = buildTable(t);
      if (tbl) {
        e.table.append(h("details", { class: "av-table-wrap", open: !!wasOpen },
          h("summary", { text: "Data table: " + v.name }), tbl));
      }
    }

    function renderFigures(s) {
      var items = (A.keyFigures && A.keyFigures(s)) || [];
      var lis = figures.children;
      while (lis.length > items.length) figures.removeChild(figures.lastChild);
      while (lis.length < items.length) figures.append(h("li", { class: "av-figure" }));
      items.forEach(function (f, i) {
        var li = lis[i];
        li.innerHTML = "";
        var spoken = f.spoken && f.spoken !== String(f.value);
        li.append(
          h("p", { class: "av-figure-label", text: f.label }),
          h("p", { class: "av-figure-value" },
            spoken ? h("span", { "aria-hidden": "true", text: String(f.value) }) : String(f.value),
            spoken ? h("span", { class: "av-sr-only", text: f.spoken }) : null),
          f.status ? h("p", { class: "av-figure-status", text: f.status }) : null
        );
      });
      figures.hidden = items.length === 0;
      figRove.sync();
    }

    function update() {
      var s = S();
      headline.textContent = val(A.headline, s, "");
      summary.textContent = val(A.summary, s, "");
      summary.hidden = !summary.textContent;
      note.textContent = val(A.note, s, "");
      vizDesc.textContent = val(A.vizDescription, s, "");
      if (A.pageTitle) document.title = val(A.pageTitle, s, document.title);
      renderFigures(s);
      if (activeView) renderView(activeView);
    }

    function renderHistory() {
      historyBox.hidden = history.length === 0;
      historyBox.innerHTML = "";
      historyBox.append(h("summary", { text: "Previous questions (" + history.length + ")" }));
      history.forEach(function (it) {
        historyBox.append(h("div", { class: "av-history-item" }, h("p", { text: it.question }), h("p", { text: it.answer })));
      });
    }

    function snapshot() {
      var s = S();
      return {
        topic: topic,
        purpose: A.purpose,
        headline: val(A.headline, s, ""),
        summary: val(A.summary, s, ""),
        dataNote: val(A.dataNote, s, ""),
        keyFigures: (A.keyFigures && A.keyFigures(s)) || [],
        views: (A.views || []).map(function (v) {
          return { name: v.name, description: val(v.describe, s, ""), table: v.table ? v.table(s) : null };
        }),
        extra: A.chatContext ? A.chatContext(s) : undefined,
      };
    }

    // One path for typed, suggested and spoken questions. State is read at the
    // moment of asking, so voice answers always use the latest data.
    async function ask(q) {
      q = (q || "").trim();
      if (!q) return;
      input.value = "";
      send.hidden = true;
      form.setAttribute("aria-busy", "true");
      var ctx = { state: S(), adapter: A, snapshot: snapshot, question: q, kit: kit };
      var res = null;
      for (var i = 0; i < engines.length && !res; i++) {
        try { res = await engines[i].ask(q, ctx); } catch (err) { console.warn("[AccessibleViz] chat engine failed", err); }
      }
      form.removeAttribute("aria-busy");
      if (!res) res = { text: A.noAnswer || "I can't answer that from this data. Try one of the suggested questions." };
      if (typeof res === "string") res = { text: res };

      if (current) history = [current].concat(history).slice(0, 10);
      renderHistory();
      current = { question: q, answer: res.text };
      if (listen) listen.stop();
      qText.textContent = q;
      aText.textContent = res.text;
      answerBox.hidden = false;
      if (suggest && suggest.parentNode && suggest.nextSibling === form) form.after(hint, suggest);

      // Changes the answer causes (switching view, moving a slider) stay quiet:
      // the answer is the only thing read.
      quietUntil = Date.now() + 1500;
      if (res.view) showView(res.view);
      if (A.onAnswer) A.onAnswer(res, kit);

      aText.focus(); // screen reader reads the answer; next Tab is Listen
    }

    function announce(text, delay) {
      clearTimeout(announceTimer);
      announceTimer = setTimeout(function () {
        if (Date.now() < quietUntil || !text) return;
        live.textContent = text;
        setTimeout(function () { if (live.textContent === text) live.textContent = ""; }, 4000);
      }, delay == null ? 600 : delay);
    }

    kit.update = update;
    kit.announce = announce;
    kit.ask = ask;
    kit.showView = showView;
    kit.snapshot = snapshot;
    kit.root = root;
    kit.destroy = function () {
      if (listen) listen.stop();
      if (voice) voice.stop();
      clearTimeout(announceTimer);
      root.innerHTML = "";
      root.classList.remove("av-root");
    };

    if (activeView) showView(activeView);
    update();
    return kit;
  }

  // ---- Listen button: audio is opt-in, never automatic ----
  function listenButton(getText) {
    if (!("speechSynthesis" in window)) return null;
    var playing = false;
    var icon = svg(ICON_PLAY);
    icon.setAttribute("width", "18"); icon.setAttribute("height", "18");
    var label = h("span", { "aria-hidden": "true", text: "Listen" });
    var btn = h("button", { type: "button", class: "av-listen", "aria-label": "Play answer aloud" }, icon, label);
    function set(p) {
      playing = p;
      icon.innerHTML = p ? ICON_STOP : ICON_PLAY;
      label.textContent = p ? "Stop" : "Listen";
      btn.setAttribute("aria-label", p ? "Stop reading answer aloud" : "Play answer aloud");
    }
    function stop() { window.speechSynthesis.cancel(); set(false); }
    btn.addEventListener("click", function () {
      if (playing) return stop();
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(getText() || "");
      u.lang = document.documentElement.lang || "en";
      u.onend = u.onerror = function () { set(false); };
      set(true);
      window.speechSynthesis.speak(u);
    });
    return { el: btn, stop: stop };
  }

  // ---- Voice input: status text sits directly below the mic button ----
  function voiceInput(form, onText) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return { el: h("span", { class: "av-voice-na", role: "note", text: "Voice input not available in this browser" }), stop: function () {} };
    var rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = document.documentElement.lang || "en";
    var listening = false;
    var btn = h("button", { type: "button", class: "av-mic", "aria-label": "Start voice input", "aria-pressed": "false" }, svg(ICON_MIC));
    var status = h("p", { class: "av-voice-status", role: "status" });
    function setStatus(t) { status.textContent = t; form.classList.toggle("av-has-status", !!t); }
    function set(v) {
      listening = v;
      btn.classList.toggle("is-listening", v);
      btn.setAttribute("aria-pressed", v ? "true" : "false");
      btn.setAttribute("aria-label", v ? "Listening. Click to stop" : "Start voice input");
      if (v) setStatus("Listening…"); else if (status.textContent === "Listening…") setStatus("");
    }
    rec.onresult = function (e) {
      var t = e.results[0][0].transcript;
      set(false);
      if (t) onText(t);
    };
    rec.onerror = function (e) {
      set(false);
      if (e.error === "not-allowed") setStatus("Microphone access was denied.");
      else if (e.error === "no-speech") setStatus("No speech detected. Try again.");
    };
    rec.onend = function () { set(false); };
    btn.addEventListener("click", function () {
      setStatus("");
      if (listening) { rec.abort(); set(false); } else { rec.start(); set(true); }
    });
    return { el: h("div", { class: "av-mic-wrap" }, btn, status), stop: function () { try { rec.abort(); } catch (e) {} } };
  }

  // ---- Chat engines ----

  // Rules: [{ id, patterns: [RegExp|string], match?(q, ctx), answer(state, q, ctx) }]
  // Questions are normalised first, so spoken ("will it rain") and typed
  // ("Will it rain?") versions match the same rule.
  function rules(list, options) {
    options = options || {};
    var memory = {};
    return {
      ask: function (q, ctx) {
        var nq = q.toLowerCase().replace(/[?!,;:"“”]/g, " ").replace(/\s+/g, " ").trim();
        var best = null, bestScore = 0;
        list.forEach(function (r) {
          var score = 0;
          (r.patterns || []).forEach(function (p) {
            if (p instanceof RegExp ? p.test(nq) : nq.indexOf(String(p).toLowerCase()) >= 0) score++;
          });
          if (r.match && r.match(nq, ctx)) score += r.weight || 1;
          if (score > bestScore) { best = r; bestScore = score; }
        });
        ctx.memory = memory;
        if (best) return best.answer(ctx.state, nq, ctx);
        return options.fallback ? options.fallback(ctx.state, nq, ctx) : null;
      },
    };
  }

  // AI: give a model the visualisation's current data and strict instructions.
  // `complete({ system, prompt, data, question })` is yours: call any provider and return text.
  function ai(options) {
    var n = options.maxSentences || 3;
    var system = [
      "You answer questions about a data visualisation for people who may be using a screen reader.",
      "Use only the data provided. If the answer is not in the data, say so in one sentence and suggest what the data can answer.",
      "Name the chart or figure you used.",
      "Answer in at most " + n + " sentences of plain text. No markdown, lists, emoji or symbols.",
      "Spell out units and symbols, for example 'degrees Celsius', 'millimetres', 'per cent', 'million pounds'.",
      "When a value is marked approximate, say 'approximately'.",
      options.instructions || "",
    ].filter(Boolean).join("\n");
    return {
      ask: async function (q, ctx) {
        var data = ctx.snapshot();
        var prompt = "Data (JSON):\n" + JSON.stringify(data) + "\n\nQuestion: " + q;
        var text = await options.complete({ system: system, prompt: prompt, data: data, question: q });
        text = text && String(text).trim();
        return text ? { text: text } : null;
      },
    };
  }

  var api = { create: create, rules: rules, ai: ai, version: "1.0.0" };
  global.AccessibleViz = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
