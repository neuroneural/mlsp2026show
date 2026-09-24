# MLSP 2026 auditorium loop

A full-screen page that loops on the auditorium screen at IEEE MLSP 2026 (Centennial Hall, 100 Auburn Ave NE, Atlanta, September 28 to October 1, 2026). It shows what is on now and next, the program, conference facts, thank-you slides, and a few checked facts about Atlanta and MLSP.

Live at **https://neuroneural.net/mlsp2026show/**

## For the AV team

Open https://neuroneural.net/mlsp2026show/ in Chrome, press **F** for full screen, and walk away. The page runs on its own for days. It keeps the screen awake, updates itself, and reloads every 3 hours to pick up fixes. If the Wi-Fi drops, it keeps running on the copy it already has. To get your own slides back, just switch the projector input or exit full screen with **Esc**.

## Keys

| Key | Does |
| --- | --- |
| Right / Left | next / previous slide |
| Space | pause / resume |
| F | full screen |

The cursor hides after 3 seconds.

## URL parameters

| Parameter | Example | Does |
| --- | --- | --- |
| `now` | `?now=2026-09-30T15:45` | fake clock in Atlanta time; it then runs forward |
| `slide` | `?slide=now` | hold one slide (it refreshes every 30 s) |
| `speed` | `?speed=4` | rotate faster |
| `debug` | `?debug=1` | show slide id, state, and data source |
| `static` | `?static=1` | no animations (for screenshots) |

Slide ids: `now`, `posters`, `keynotes-1..3`, `tutorials`, `qr`, `stat-review`, `stat-accept`, `stat-reviews`, `stat-ratios`, `stat-program`, `stat-themes`, `stat-words`, `stat-reg`, `stat-regions`, `committee-1..3`, `chairs`, `area-chairs`, `reviewers-N`, `fact-<id>`, `trivia-q-<id>`, `trivia-a-<id>`, `sources`.

The tiny dot in the lower right is green when paper data came from the live schedule site and grey when the page is using its own snapshot.

## How time works

"Now" is always computed in America/New_York with `Intl.DateTimeFormat`, whatever time zone the laptop is set to. The "Now and next" slide shows every 4th slide during the conference:

- before Monday: countdown to 7:30 AM registration and Monday highlights
- breaks and gaps: countdown to the next event and its details (for an oral session, the chair and all six talks)
- oral session: the current talk, the next talk, and the chair
- poster session: count of posters and count by theme, plus a slide that pages through the posters 3 at a time
- keynote or tutorial: what is on and what comes next
- evening events: where and when, then tomorrow's first events
- after the last event of the day: tomorrow's first events
- after closing on Thursday: thank you and MLSP 2027

## Data

| File | What | Update |
| --- | --- | --- |
| `data/papers.json` | snapshot of the schedule site's papers | copy from `neuroneural/mlsp2026schedule` |
| `data/program.json` | snapshot of the day-by-day program | copy from the schedule repo |
| `data/facts.json` | every Atlanta / MLSP fact and trivia item, with source and date checked | edit by hand |
| `data/stats.json` | conference numbers, committee, area chairs | edit by hand |
| `data/reviewers.json` | reviewer names (`["Name", ...]`); an empty list hides the slide | edit by hand |

At load and every 10 minutes the page tries the live files on the same origin: `/mlsp2026schedule/data/papers.json` and `/mlsp2026schedule/data/program.json`. If a fetch fails or the JSON looks wrong, it keeps the last good data and never shows an error.

To add a fact, add an entry to `data/facts.json` with `id`, `group` (`atlanta-fun`, `atlanta-engineering`, or `mlsp-community`), `headline`, `big` (optional), `text`, `source_url`, `source_title`, and `checked_on`. Keep `text` under about 25 words, and put the year on any number that changes year to year. `sources.html` lists every source.

## Development

No build step. Serve the folder and open it:

```bash
python3 -m http.server 8765   # then open http://localhost:8765/
node --test tests/*.test.js   # time parser and state machine tests
```

After changing any file in `js/`, `css/`, or `vendor/`, bump the `?v=` tag on the links in `index.html` so browsers fetch the new files.

`tools/shoot.mjs` takes screenshots of every slide at fixed fake times, and `tools/soak.mjs` runs the loop for 30 minutes at `?speed=4` and reports memory and errors. Both need Playwright (`PW=/path/to/node_modules/playwright`).

Vendored: `vendor/qrcode.js` (Kazuhiko Arase, MIT), IBM Plex and Archivo Black fonts (SIL OFL, in `fonts/`).
