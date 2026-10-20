# Accessible Visualisation Kit

A drop-in shell that makes any data visualisation usable with a screen reader. It adds a chat that answers from the visualisation's own data. It is built from the Weather Explorer (16 October version) and follows the principles in `PLAYBOOK.md`.

You write one **adapter** that describes your data. The kit provides everything else:

- the reading order: purpose sentence, skip link, headline, summary
- the chat: suggested questions, text and voice input, answer focus, Listen button, previous questions
- the visualisation panel: description, key figures list, views as tabs, each with a written description and a data table
- keyboard patterns, delayed announcements for control changes, and a quiet period after chat answers

It needs no build step or framework, and works with any chart library (Chart.js, D3, Leaflet, ECharts), an embedded BI dashboard, or a static image.

```
accessible-viz-kit/
├── core/
│   ├── accessible-viz.js    the kit (plain JavaScript, ~20 KB)
│   └── accessible-viz.css   shell styles, themeable with --av-* variables
├── react/
│   └── AccessibleViz.js     thin React wrapper (no JSX needed)
├── examples/
│   ├── weather/             Weather Explorer rebuilt on the kit (React, live data)
│   ├── apex-finance/        a static PNG dashboard made accessible (plain JS)
│   └── schools/             MOE school directory for parents, built from CSVs (plain JS, filters, chat)
├── PLAYBOOK.md              principles and how to apply them
└── README.md
```

Open any example by serving the folder (for example `npx serve .`) and going to `examples/weather/`, `examples/apex-finance/` or `examples/schools/`. Each example folder includes its own copy of the kit files, so you can deploy a single example folder (for example to Vercel) on its own. If you change `core/` or `react/`, copy the updated files into the examples.

---

## Quick start (plain JavaScript)

```html
<link rel="stylesheet" href="core/accessible-viz.css">
<body>
  <div id="root"></div>   <!-- must be the first thing in <body> -->
  <script src="core/accessible-viz.js"></script>
  <script>
    const data = { total: 1240, regions: [["North", 520], ["South", 720]] };

    const adapter = {
      topic: "ticket sales",                     // "Chat to explore ticket sales"
      purpose: "Ticket Sales. A dashboard of ticket sales by region, with a chat box to ask about sales.",
      headline: "1,240 tickets sold this week",
      summary: "South sold the most, with 720 tickets.",
      vizTitle: "Ticket sales",
      vizDescription: "Weekly ticket sales in total and by region.",
      keyFigures: () => [{ label: "Tickets sold", value: "1,240", spoken: "1,240 tickets" }],
      suggestions: ["Which region sold the most?", "How many tickets were sold?"],
      views: [{
        id: "region",
        name: "By region",
        describe: "South sold 720 tickets and North sold 520.",
        table: () => ({ columns: ["Region", "Tickets"], rows: data.regions }),
        render: (slot) => { /* draw your chart into slot */ },
      }],
    };

    const chat = AccessibleViz.rules([
      { patterns: [/most|top|best/], answer: () => "South sold the most, with 720 tickets. From the By region chart." },
      { patterns: [/how many|total/], answer: () => "1,240 tickets were sold this week. From the Tickets sold figure." },
    ]);

    const kit = AccessibleViz.create({ root: document.getElementById("root"), adapter, chat });
    // When data changes: kit.update();
  </script>
</body>
```

---

## The adapter

Every field can be a value or a function of `state` (whatever `getState()` returns). Only `purpose` and `topic` are required.

| Field | What it is |
|---|---|
| `topic` | What the chat explores, with its article: `"the weather"`. Used in the chat box name ("Chat to explore the weather") and the skip link ("Skip to weather questions"). |
| `purpose` | One sentence, read first: product name, then what it shows, then that there is a chat box. |
| `skipLabel` | Optional override for the skip link text. |
| `getState()` | Returns the current data, filters and selection. The kit calls it every time it renders or answers, so it never uses stale data. |
| `headline(state)` | The main heading (h1). Make it the headline fact, for example "Partly cloudy in Bedok". |
| `summary(state)` | Two or three supporting facts in one short paragraph. |
| `chatIntro` | Optional one-line invitation to ask. |
| `suggestions` | Three or four questions the data can actually answer. |
| `placeholder` | Optional placeholder for the chat box. |
| `vizTitle`, `vizDescription` | Heading and one-sentence description of the visualisation: what it is, what it includes. |
| `note(state)` | Short status, for example "Live data. Updated 2 minutes ago." |
| `keyFigures(state)` | `[{ label, value, spoken, status }]`. `value` is shown; `spoken` is read instead (units spelled out: "31 degrees Celsius"). |
| `figuresLabel` | Name of the key figures list. Default "Key figures". |
| `viewsTitle` | Heading and tab-list name for the views. |
| `views[]` | One per chart, map or image. See below. |
| `dataNote` | Source and accuracy. Sent to the AI engine. |
| `chatContext(state)` | Extra data for the AI engine. |
| `onAnswer(result, kit)` | Called after each answer, for example to move a slider to the time asked about. |
| `noAnswer` | Text when no engine can answer. |
| `pageTitle(state)` | Optional document title: `[headline figure] – [product name]`. |

### Views

```js
{
  id: "rain",
  name: "Rainfall",                       // tab label
  describe: (state) => "Rainfall peaks at 4 millimetres around 3 PM.",
  table: (state) => ({ caption, columns: [...], rows: [[...], ...] }),   // optional
  render: (slot, state, kit) => { ... }, // optional: draw into slot
  interactive: false,                     // true if slot holds controls (e.g. a slider)
  hidden: false,                          // true: not shown, kept as data for the chat only
}
```

- `render` is called when the view is shown and on every `kit.update()`. Create your chart on the first call (store it on `slot`) and update it on later calls.
- The slot is `aria-hidden` by default. The text in `describe` and `table` is the content for screen readers, so the chart isn't read twice.
- Set `hidden: true` for data that has no visual of its own on the page, such as values extracted from a dashboard image. It gets no tab, but its description and table are still sent to the chat engines through `snapshot()`. If only one view is shown, no tabs are drawn.
- Set `interactive: true` only when the slot contains controls, and then hide the purely visual parts yourself (`aria-hidden="true"` on the map or canvas).
- Inside `render`, never rely on the `state` argument in event handlers you create once. Store the latest state on the slot (`slot._state = state`) and read it from there.

---

## The chat

`chat` is one engine or an array of engines. Each engine is any object with `ask(question, ctx)` that returns `{ text, view?, ...anything }`, a string, or `null` (meaning "not mine, try the next engine"). It can return a Promise.

`ctx` contains `state`, `adapter`, `snapshot()` (all text the kit shows, as JSON), `question` and `kit`.

### Rules (default)

```js
const rules = AccessibleViz.rules([
  {
    id: "budget",
    patterns: [/over budget/, "overspend"],     // RegExp or plain text; each hit scores 1
    match: (q, ctx) => false,                   // optional extra test
    answer: (state, q, ctx) => ({ text: "…", view: "unit" }),
  },
], { fallback: (state, q) => null });
```

Questions are lower-cased and stripped of punctuation before matching, so spoken and typed questions match the same rule. The rule with the most hits wins. Return `view` to switch the visualisation to the tab the answer came from.

### AI (optional)

```js
const ai = AccessibleViz.ai({
  instructions: "Money is in millions of pounds.",
  complete: async ({ system, prompt, data, question }) => {
    const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ system, prompt }) });
    return (await res.json()).text;
  },
});

AccessibleViz.create({ root, adapter, chat: [rules, ai] });  // rules first, AI for the rest
```

The kit sends the model the same text the page shows (`snapshot()`), with instructions to:

- answer only from that data
- name the chart it used
- use at most three sentences of plain text
- spell out units
- say "approximately" for estimated values

Call the model from your own server so API keys stay private, and review data sensitivity before sending it.

---

## React

```html
<script src="core/accessible-viz.js"></script>
<script src="react/AccessibleViz.js"></script>
```

```jsx
const { AccessibleViz } = window.AccessibleVizReact;   // or import from "react/AccessibleViz.js"

<AccessibleViz adapter={adapter} chat={[rules]} state={{ weather, map }} onReady={(kit) => {}} />
```

When `state` changes, the shell updates in place. Focus, typed text and the open tab are kept. The adapter's `getState` is supplied for you.

---

## Kit API

| Method | Use |
|---|---|
| `kit.update()` | Re-read the adapter after data changes. |
| `kit.announce(text, delay = 600)` | Announce the result of a control change once, after the user stops. Skipped for 1.5 seconds after a chat answer, so the answer is the only thing read. |
| `kit.ask(question)` | Ask programmatically. |
| `kit.showView(id)` | Switch view. |
| `kit.snapshot()` | Everything the page says, as JSON. |
| `kit.destroy()` | Remove the shell. |

## Theming

Override variables on `.av-root`: `--av-primary`, `--av-text`, `--av-bg`, `--av-surface`, `--av-border`, `--av-accent`, `--av-focus`, `--av-font`, `--av-radius`, `--av-chat-width`. Keep text contrast at 4.5:1 or more.

---

## Using it with different kinds of visualisation

| Kind | Adapter data comes from | Notes |
|---|---|---|
| Built by you (Chart.js, D3, maps) | The same data the charts draw from | Draw in `render`. Everything works, including controls. |
| Embedded BI (Tableau, Power BI) | The tool's embedding API: read chart data, listen for filter changes, then `kit.update()` | Put the embed in a view's `render`. The kit's text carries the content; charts inside the embed are only as accessible as the tool makes them. |
| Static image (PNG, JPG) | A data file you extract once and have a person check | No filters. Mark estimated values as approximate. See `examples/apex-finance` and `PLAYBOOK.md`, section 5. |
| Data with no chart (API, CSV) | Fetch it, then build a chart (first row) | See `examples/schools`: five CSVs joined into one data file, with filters and a rules-based chat. |

## Before you ship

Run the testing checklist in `PLAYBOOK.md`, section 7, with NVDA on Windows, VoiceOver on Mac and iPhone, and keyboard only.
