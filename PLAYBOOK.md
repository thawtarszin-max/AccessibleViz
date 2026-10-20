# Accessible Visualisation Playbook

Principles for pairing any data visualisation with a screen-reader-first summary and a chat that answers from the visualisation's own data. They come from the Weather Explorer, 16 October 2026 version, and are built into the Accessible Visualisation Kit (`README.md`).

## 1. Principles

Each principle has a rule, how to apply it, and a test.

**1. Say what the page is first.**
The first thing read is one sentence: the product name, what it shows, and that there is a chat box.
*Apply:* a visually hidden paragraph at the very top of the page, before anything focusable. For example: "Weather Explorer. A live weather dashboard with a rain map, hourly charts, and a chat box to ask about the weather."
*Test:* the first sentence the screen reader reads answers "what is this?".

**2. The skip link is the first Tab stop.**
It follows the purpose sentence and goes straight to the chat box.
*Apply:* name it for the topic: "Skip to weather questions".
*Test:* the first Tab lands on the skip link; activating it puts focus in the chat box.

**3. Headline fact, then summary.**
*Apply:* the main heading carries the headline fact, for example "Partly cloudy in Bedok". Follow it with one short paragraph of two or three supporting facts.
*Test:* a user who stops after 15 seconds of listening knows the main result.

**4. Name the chat box for its topic, and say how to send.**
*Apply:*
- Name the box "Chat to explore [topic]", for example "Chat to explore the weather".
- Put the name on the box itself (`aria-label`), not in separate hidden text that is also read as page text.
- Give it a hidden description: "Type a question and press Enter to send. A Send button also appears after the text box once you start typing."
*Test:* the box is announced once, with its name and the Enter hint.

**5. Show controls only when they work.**
*Apply:* hide Send until the box has text; Enter always sends.
*Test:* no control is announced as unavailable.

**6. Read suggestions as one group.**
*Apply:* the group reads "Try asking:", then "Suggested questions", then the options as a list ("list, 4 items"). Arrow keys move between options; one Tab stop for the group. Make sure the visible "Try asking:" and the group name aren't each read again as page text.
*Test:* the group is introduced once, and the user hears how many options there are before the first one.

**7. Take the user to the answer.**
After a question, focus moves to the answer text, so it is read straight away and once.
*Apply:*
- Don't also put the answer in a live region (it would be read twice).
- Don't keep focus on the suggestion that was pressed.
- The next Tab lands on the Listen button below the answer.
*Test:* after asking, the answer is read once, and the next Tab reaches Listen.

**8. Audio is the user's choice.**
*Apply:* the page never speaks by itself. A Listen button beside the answer reads it aloud, and changes to Stop while playing.
*Test:* with a screen reader on, only one voice is ever heard.

**9. Voice and typed questions take the same path.**
*Apply:*
- Spoken questions go through exactly the same function as typed ones.
- That function reads the current data when it is called.
- Never keep a copy of the data from when the microphone was set up (in React, read through a ref).
- Strip punctuation and case before matching, because transcripts have none.
*Test:* ask the same question by voice and by typing; the answers match.

**10. Status text sits with its control.**
*Apply:*
- Put "Listening…" and microphone errors directly below the mic button, as a status message.
- Leave room for it, so it doesn't crowd or cover the next content.
*Test:* with the mic on, the status is visible under the button and clear of the suggestions.

**11. Every visual has one text equivalent.**
*Apply:*
- Hide charts, maps and images from screen readers.
- Give each one a written description (one or two sentences on the main pattern) and, where there are values, a data table.
- Don't also label the chart with the same summary: say it once.
*Test:* nothing meaningful is only visible, and no description is read twice.

**12. Key figures as a list, with units spoken.**
*Apply:* one list item per figure (label, value, status). Spell out units for screen readers ("31 degrees Celsius", "2 millimetres", "15 per cent", "12.5 million pounds"); use words instead of ▲ ▼ symbols.
*Test:* each figure is read as a single, natural sentence.

**13. Predictable keyboard patterns.**
*Apply:*
- Tab moves between groups; arrow keys move within them (key figures, suggestions, tabs).
- Use tabs for switching views, a native slider for time, and headings without gaps.
*Test:* the Tab order and the heading list each make sense on their own.

**14. Announce control changes once, and stay quiet when the chat made the change.**
*Apply:*
- When the user moves a control (such as a time slider), announce the result once, about 600 ms after they stop.
- When an answer moves the control (for example, to the time asked about), make no announcement; the answer is enough.
*Test:* dragging the slider gives one announcement; asking "will it rain at 5pm" gives only the answer.

**15. Answer only from the data shown.**
*Apply:*
- The chat reads from the same adapter as the visualisation.
- It says when something isn't in the data, and names the chart it used.
- Answers are at most three sentences, with units spelled out.
*Test:* every answer can be found in the visualisation.

## 2. Reading and Tab order

1. Purpose sentence (hidden)
2. Skip link: "Skip to [topic] questions"
3. Chat region: headline (h1) → summary → invitation to ask
4. Suggested questions: "Try asking:", "Suggested questions", list of options
5. Voice input → chat box "Chat to explore [topic]" (Enter to send; Send appears when typing)
6. Visualisation region: heading, status note, description
7. Key figures list
8. Views, each with its visual (hidden), description and data table. Tabs appear only when there is more than one view to show.

After a question: answer (focused) → Listen → chat box → suggestions → previous questions.

## 3. Shell and adapter

The **shell** is the same for every dataset. It holds the reading order, chat, focus handling, keyboard patterns, Listen button, voice input and announcements. The kit provides it.

The **adapter** is written for each visualisation:

- **purpose and topic:** the first sentence, and what the chat explores
- **headline and summary:** the main facts for the current state
- **key figures:** label, value, spoken value and status
- **views:** for each chart, map or image, a description, a table and an optional render function. Views marked hidden aren't shown and are kept only as data for the chat.
- **suggestions:** three or four questions the data can answer
- **data note:** the source, when it was last updated, and its accuracy
- **chat engine:** rules for this dataset, an AI model given the adapter's data, or both

## 4. By kind of visualisation

- **Built by us** (HTML, D3, Chart.js, maps): the adapter reads the same data the charts draw. Everything is possible, including controls and chat-driven changes.
- **Embedded BI** (Tableau, Power BI): read chart data and filter changes through the tool's embedding API, with the owner's permission. The kit's text carries the content; the charts inside stay as accessible as the tool makes them.
- **Static image** (PNG, JPG, PDF page): extract the values once into a data file and have a person check them. The summary, figures and chat work on a fixed snapshot. There is no filtering, and values read off bars are approximate.
- **Data with no chart** (API, CSV): build our own chart on it, then treat it as built by us.

## 5. Working from a PNG dashboard

Worked example: `examples/apex-finance` (Apex Financial Overview).

1. **List the parts** in reading order (left to right, top to bottom) and group them by section. Apex has:
   - 4 headline cards
   - revenue, profit, cost of goods sold and expenses, each by business unit and by region
   - revenue variance against target
   - 4 monthly trend charts
   - costs by department
2. **Extract the values** into a data file.
   - Printed numbers are exact (Revenue £12.5M, up 15.2%).
   - Bar values are measured against the axis, rounded and marked approximate.
   - Record markers (target, budget) and what the colours mean (blue above target, pink over budget).
   - Where bars are too small to read, describe the trend in words instead.
3. **Have a person check** every value against the image. Leave out anything unclear rather than guess. Set `checked: true` in the data file only after this.
4. **Write the text:**
   - the purpose sentence
   - the headline and summary
   - the key figures
   - one description and one table per chart
5. **Hide the image** from screen readers and show it as the first view, so sighted users see the original. Give each extracted chart its own view, with a description and table; the chat answers from the same views.
6. **Never leave an empty placeholder.** A view with no visual of its own shows only its description and table, with no blank or "undefined" area.
7. **Limit the chat.** It answers from the extracted data only, names the chart it used, says "approximately" for bar values, and can't filter.
8. **Date the snapshot** and redo the extraction whenever the image changes.

## 6. The chat

There are two ways to make the chat understand questions. The kit supports both, and can run them in order.

- **Rules for each dataset:** predictable, offline, and never invent an answer. Each dataset needs its own question patterns.
- **An AI model given the adapter's data:** one setup works for any dataset. It needs strict instructions, adds cost and delay, and needs a review before sensitive data is sent.

Use rules first and the AI only for questions the rules don't cover.

## 7. Testing checklist

- [ ] First sentence read is the purpose; first Tab is the skip link.
- [ ] The chat box is announced once: "Chat to explore [topic]" plus the Enter hint.
- [ ] Send is hidden until typing; Enter sends.
- [ ] Suggestions read "Try asking", "Suggested questions", then a list of options.
- [ ] After a question, focus is on the answer, it is read once, and the next Tab is Listen.
- [ ] The same question asked by voice and typed gives the same answer.
- [ ] Mic status appears under the mic button, clear of the suggestions.
- [ ] No sound plays unless the user presses Listen.
- [ ] Every chart has a description and a table, and no description is read twice.
- [ ] No view shows an empty area or the word "undefined".
- [ ] Moving a control is announced once after stopping; a chat-driven change is silent.
- [ ] Write out the full read-through and search it for repeated sentences.
- [ ] Ten test questions per dataset, including ones the data can't answer.
- [ ] Test with NVDA and Chrome on Windows, VoiceOver and Safari on Mac and iPhone, and keyboard only.

## 8. Known limits

- Screen readers read at their own pace; the page can't stop a read-through at a chosen point.
- Charts inside embedded BI tools can't be made more accessible by the kit; its text carries that content.
- Values read from images are approximate and fixed in time.
- Choosing the headline facts needs a person.
- Maps can't be fully accessible; the description must be as complete as the map.
