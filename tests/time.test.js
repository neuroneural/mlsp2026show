// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../js/time.js");
const S = require("../js/state.js");
const program = require("../data/program.json").program;
const papers = require("../data/papers.json").papers;

test("parseTimeRange: full ranges", () => {
  assert.deepEqual(T.parseTimeRange("10:30 AM–12:00 PM"), { start: 630, end: 720, openEnded: false });
  assert.deepEqual(T.parseTimeRange("11:45 AM–1:00 PM"), { start: 705, end: 780, openEnded: false });
  assert.deepEqual(T.parseTimeRange("6:00–9:00 PM"), { start: 1080, end: 1260, openEnded: false });
});

test("parseTimeRange: start borrows end meridiem", () => {
  assert.deepEqual(T.parseTimeRange("8:00–9:30 AM"), { start: 480, end: 570, openEnded: false });
  assert.deepEqual(T.parseTimeRange("12:00–1:00 PM"), { start: 720, end: 780, openEnded: false });
  assert.deepEqual(T.parseTimeRange("1:00–2:00 PM"), { start: 780, end: 840, openEnded: false });
  // start would land after end, so it flips to AM
  assert.deepEqual(T.parseTimeRange("11:00–12:30 PM"), { start: 660, end: 750, openEnded: false });
});

test("parseTimeRange: single time lasts 30 minutes", () => {
  assert.deepEqual(T.parseTimeRange("7:30 AM"), { start: 450, end: 480, openEnded: false });
  assert.deepEqual(T.parseTimeRange("8:00 AM"), { start: 480, end: 510, openEnded: false });
  assert.deepEqual(T.parseTimeRange("12:00 PM"), { start: 720, end: 750, openEnded: false });
  assert.deepEqual(T.parseTimeRange("12:00 AM"), { start: 0, end: 30, openEnded: false });
});

test("parseTimeRange: After X", () => {
  assert.deepEqual(T.parseTimeRange("After 3:30 PM"), { start: 930, end: 960, openEnded: true });
});

test("parseTimeRange: other separators and junk", () => {
  assert.deepEqual(T.parseTimeRange("9:00-10:00 AM"), { start: 540, end: 600, openEnded: false });
  assert.deepEqual(T.parseTimeRange("9:00 AM — 10:00 AM"), { start: 540, end: 600, openEnded: false });
  assert.deepEqual(T.parseTimeRange("9:00 AM to 10:00 AM"), { start: 540, end: 600, openEnded: false });
  assert.equal(T.parseTimeRange(""), null);
  assert.equal(T.parseTimeRange("TBD"), null);
  assert.equal(T.parseTimeRange("7:30"), null);
  assert.equal(T.parseTimeRange("13:00 PM"), null);
  assert.equal(T.parseTimeRange("3:00–2:00 PM"), null);
  assert.equal(T.parseTimeRange(null), null);
});

test("every program time parses", () => {
  for (const d of program) for (const e of d.events) {
    assert.ok(T.parseTimeRange(e.time), `${d.day} ${e.time}`);
  }
});

test("realNowET ignores the machine time zone", () => {
  // 2026-09-29 15:20 UTC == 11:20 EDT
  const ms = T.realNowET(new Date(Date.UTC(2026, 8, 29, 15, 20, 0)));
  assert.equal(ms, T.parseLocal("2026-09-29T11:20"));
  // 2026-11-02 15:00 UTC == 10:00 EST (after DST ends)
  assert.equal(T.realNowET(new Date(Date.UTC(2026, 10, 2, 15, 0, 0))), T.parseLocal("2026-11-02T10:00"));
});

test("fake clock runs forward", () => {
  let t = 1000;
  const c = T.makeClock("2026-09-30T15:45", () => t);
  assert.equal(c.fake, true);
  assert.equal(c.now(), T.parseLocal("2026-09-30T15:45"));
  t += 90000;
  assert.equal(T.msClock(c.now()), "3:46 PM");
  assert.equal(T.makeClock("garbage").fake, false);
});

test("countdown formats", () => {
  assert.equal(T.countdown(5 * 60000 + 7000).big, "5:07");
  assert.equal(T.countdown(2 * 3600000 + 5 * 60000).big, "2 h 05 min");
  assert.equal(T.countdown(3 * 86400000).big, "3 days");
  assert.equal(T.countdown(-5).big, "0:00");
});

const tl = S.buildTimeline(program);
const at = (s) => S.computeState(T.parseLocal(s), tl, papers);

test("state: before the conference", () => {
  const st = at("2026-09-25T12:00");
  assert.equal(st.phase, "before");
  assert.equal(T.msClock(st.target.start), "7:30 AM");
  assert.equal(st.target.date, "2026-09-28");
  assert.ok(st.highlights.length >= 3);
});

test("state: Monday coffee break", () => {
  const st = at("2026-09-28T09:45");
  assert.equal(st.mode, "break");
  assert.equal(st.next.title, "Tutorial 2 · Session 1");
});

test("state: break before Oral Session 1 lists six talks", () => {
  const st = at("2026-09-29T10:15");
  assert.equal(st.mode, "break");
  assert.equal(st.next.title, "Oral Session 1");
  assert.equal(st.nextTalks.length, 6);
  assert.equal(st.next.chairs[0].name, "Cem Subakan");
  assert.equal(T.msClock(st.nextTalks[0].start), "10:30 AM");
});

test("state: during Oral Session 1", () => {
  const st = at("2026-09-29T11:20");
  assert.equal(st.mode, "oral");
  assert.equal(st.currentTalk.order, 4);
  assert.equal(T.msClock(st.currentTalk.start), "11:15 AM");
  assert.equal(st.nextTalk.order, 5);
});

test("state: Poster Session 1", () => {
  const st = at("2026-09-29T16:30");
  assert.equal(st.mode, "poster");
  assert.equal(st.poster.number, "1");
  assert.equal(st.poster.count, 34);
  assert.equal(T.msClock(st.current.end), "6:00 PM");
});

test("state: banquet", () => {
  const st = at("2026-09-30T18:30");
  assert.equal(st.mode, "social");
  assert.match(st.current.title, /Aquarium/);
  assert.equal(st.upcomingDate, "2026-10-01");
});

test("state: Poster Session 3", () => {
  const st = at("2026-10-01T13:30");
  assert.equal(st.mode, "poster");
  assert.equal(st.poster.count, 32);
  assert.equal(T.msClock(st.current.end), "3:00 PM");
});

test("state: after closing", () => {
  assert.equal(at("2026-10-01T16:00").phase, "after");
  assert.equal(at("2026-10-01T15:31").phase, "after");
  assert.equal(at("2026-10-01T15:10").mode, "closing");
});

test("state: keynote, tutorial, registration, late night", () => {
  assert.equal(at("2026-09-29T09:30").mode, "keynote");
  assert.equal(at("2026-09-29T09:30").next.title, "Coffee Break");
  assert.equal(at("2026-09-29T09:30").nextMain.title, "Oral Session 1");
  assert.equal(at("2026-09-28T08:15").mode, "tutorial");
  const reg = at("2026-09-29T08:10");
  assert.equal(reg.mode, "break");
  assert.equal(reg.registrationOpen, true);
  assert.equal(reg.next.title, "Keynote 1");
  const late = at("2026-09-29T22:00");
  assert.equal(late.mode, "overnight");
  assert.equal(late.isTomorrow, true);
  assert.equal(late.upcoming.events[0].title, "Keynote 3");
  const early = at("2026-09-30T03:00");
  assert.equal(early.mode, "overnight");
  assert.equal(early.isTomorrow, false);
  // Between Monday 7:30 registration and the 8:00 tutorial
  assert.equal(at("2026-09-28T07:40").mode, "break");
});

test("state: every minute of the conference yields a valid state", () => {
  const start = T.parseLocal("2026-09-27T00:00"), end = T.parseLocal("2026-10-02T12:00");
  for (let t = start; t < end; t += 60000) {
    const st = S.computeState(t, tl, papers);
    assert.ok(["before", "during", "after"].includes(st.phase));
    if (st.phase === "during") assert.ok(["break", "oral", "poster", "keynote", "tutorial", "social", "closing", "overnight"].includes(st.mode), `${new Date(t).toISOString()} ${st.mode}`);
  }
});
