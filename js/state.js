/* Conference state machine. Pure functions: timeline + papers + now -> state.
   Works in the browser (window.ShowState) and in Node tests. */
(function (root) {
  "use strict";
  var T = (typeof module !== "undefined" && module.exports) ? require("./time.js") : root.ShowTime;
  var MIN = T.MIN;

  function speakerOf(ev) {
    var d = ev.detail || "";
    return d.split(" · ")[0].trim();
  }
  function cleanName(n) { return String(n || "").replace(/^(Prof\.|Dr\.)\s+/i, "").trim(); }

  // Build a flat, sorted timeline from program days.
  function buildTimeline(program) {
    var out = [];
    (program || []).forEach(function (day) {
      (day.events || []).forEach(function (ev, i) {
        var r = T.parseTimeRange(ev.time);
        if (!r) return;
        out.push({
          id: day.date + "#" + i,
          date: day.date, day: day.day,
          start: T.atMinutes(day.date, r.start),
          end: T.atMinutes(day.date, r.end),
          openEnded: !!r.openEnded,
          kind: ev.kind || "other",
          title: ev.title || "",
          detail: ev.detail || "",
          talkTitle: ev.talkTitle || "",
          speaker: ev.kind === "keynote" ? speakerOf(ev) : "",
          presenters: ev.presenters || [],
          chairs: (ev.chairs || []).map(function (c) { return { name: cleanName(c.name), affiliation: c.affiliation || "" }; }),
          sessionId: ev.sessionId || "",
          time: ev.time,
        });
      });
    });
    out.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    return out;
  }

  function sessionPapers(papers, sessionId) {
    return (papers || []).filter(function (p) {
      return (p.oral && p.oral.id === sessionId) || (p.poster && p.poster.id === sessionId);
    });
  }

  function oralTalks(papers, ev) {
    return (papers || []).filter(function (p) { return p.oral && p.oral.id === ev.sessionId; })
      .map(function (p) {
        var s = T.hhmm(p.oral.start), e = T.hhmm(p.oral.end);
        return {
          paper: p, order: p.oral.order,
          start: T.atMinutes(p.oral.date || ev.date, s),
          end: T.atMinutes(p.oral.date || ev.date, isNaN(e) ? s + 15 : e),
          title: p.title,
          firstAuthor: (p.authors && p.authors[0] && p.authors[0].name) || "",
        };
      })
      .sort(function (a, b) { return a.order - b.order || a.start - b.start; });
  }

  function posterInfo(papers, ev) {
    var list = (papers || []).filter(function (p) { return p.poster && p.poster.id === ev.sessionId; });
    var byTheme = {};
    list.forEach(function (p) { byTheme[p.theme] = (byTheme[p.theme] || 0) + 1; });
    var themes = Object.keys(byTheme).map(function (k) { return [k, byTheme[k]]; })
      .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
    var n = (/(\d+)/.exec(ev.title) || [])[1] || "";
    return { number: n, count: list.length, themes: themes, papers: list };
  }

  var PRIORITY = { oral: 5, keynote: 5, tutorial: 5, poster: 5, closing: 4, social: 4, break: 3, registration: 1 };

  function isReal(ev) { return !ev.openEnded; }

  // First events of a given date (skip registration unless it is all there is).
  function firstEventsOf(tl, date, n) {
    var list = tl.filter(function (e) { return e.date === date && isReal(e); });
    var main = list.filter(function (e) { return e.kind !== "registration" && e.kind !== "break"; });
    var reg = list.filter(function (e) { return e.kind === "registration"; })[0];
    var out = main.slice(0, n || 3);
    return { registration: reg || null, events: out };
  }

  function computeState(now, tl, papers) {
    var real = tl.filter(isReal);
    if (!real.length) return { phase: "unknown" };
    var first = real[0];
    var closing = real[real.length - 1];
    var dates = [];
    real.forEach(function (e) { if (dates.indexOf(e.date) < 0) dates.push(e.date); });

    if (now < first.start) {
      return {
        phase: "before", now: now, target: first,
        firstDay: first.date,
        highlights: real.filter(function (e) { return e.date === first.date && /tutorial|keynote|social/.test(e.kind); }),
      };
    }
    if (now >= closing.end) {
      return { phase: "after", now: now, closing: closing };
    }

    var today = T.dateKey(now);
    var cur = real.filter(function (e) { return e.start <= now && now < e.end; })
      .sort(function (a, b) { return (PRIORITY[b.kind] || 2) - (PRIORITY[a.kind] || 2) || b.start - a.start; })[0] || null;

    // Next main event: the first non-registration event starting at or after
    // the current event's end (or after now if nothing is on).
    var from = cur && cur.kind !== "registration" ? cur.end : now;
    var next = real.filter(function (e) { return e.start >= from && e.start > now && e.kind !== "registration" && e !== cur; })[0] || null;
    var after = next ? real.filter(function (e) { return e.start >= next.end && e.kind !== "registration"; })[0] || null : null;

    var nextMain = real.filter(function (e) { return e.start >= from && e.start > now && !/registration|break/.test(e.kind) && e !== cur; })[0] || null;
    var st = { phase: "during", now: now, today: today, current: cur, next: next, afterNext: after, nextMain: nextMain };

    if (!cur || cur.kind === "registration") {
      if (!next) { st.mode = "after"; return st; }
      var sameDay = next.date === today;
      var gap = next.start - now;
      var todays = real.filter(function (e) { return e.date === today; });
      var lastToday = todays.length ? todays[todays.length - 1] : null;
      var dayOver = lastToday && now >= lastToday.end;
      if (!sameDay || dayOver || gap >= 3 * 60 * MIN) {
        st.mode = "overnight";
        st.upcomingDate = next.date;
        st.upcomingDay = next.day;
        st.isTomorrow = next.date !== today;
        st.upcoming = firstEventsOf(real, next.date, 3);
      } else {
        st.mode = "break";
        st.registrationOpen = !!(cur && cur.kind === "registration");
      }
    } else {
      st.mode = cur.kind === "break" ? "break" : cur.kind;
      if (cur.kind === "social") {
        var nd = dates[dates.indexOf(cur.date) + 1];
        if (nd) { st.upcomingDate = nd; st.upcoming = firstEventsOf(real, nd, 2); }
      }
    }

    if (st.mode === "break" && next && next.kind === "oral") st.nextTalks = oralTalks(papers, next);
    if (st.mode === "oral") {
      var talks = oralTalks(papers, cur);
      st.talks = talks;
      st.currentTalk = talks.filter(function (t) { return t.start <= now && now < t.end; })[0] || null;
      st.nextTalk = talks.filter(function (t) { return t.start > now; })[0] || null;
    }
    if (st.mode === "poster") st.poster = posterInfo(papers, cur);
    return st;
  }

  // Loop-level summary: is a poster session on (for the rotator)?
  function activePoster(st) { return st && st.mode === "poster" ? st.poster : null; }

  var api = {
    buildTimeline: buildTimeline, computeState: computeState, oralTalks: oralTalks,
    posterInfo: posterInfo, sessionPapers: sessionPapers, activePoster: activePoster,
    firstEventsOf: firstEventsOf, cleanName: cleanName,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ShowState = api;
})(this);
