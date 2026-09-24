/* Time helpers. All times are "ET wall-clock ms": Date.UTC() of the
   America/New_York wall clock. That keeps math simple and independent of
   the laptop's own time zone. Works in the browser and in Node tests. */
(function (root) {
  "use strict";
  var TZ = "America/New_York";
  var MIN = 60000;

  var fmt = null;
  function etParts(date) {
    if (!fmt) {
      fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      });
    }
    var o = {};
    fmt.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }

  // Real "now" as ET wall-clock ms.
  function realNowET(date) {
    var p = etParts(date || new Date());
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  }

  // "2026-09-30T15:45" (or with :ss) -> ET wall-clock ms. Returns NaN if bad.
  function parseLocal(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s || "").trim());
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function dateKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function atMinutes(dateStr, minutes) { return parseLocal(dateStr) + minutes * MIN; }

  // Parse one clock time like "10:30 AM", "12:00", "9 PM". Returns {min, mer}.
  function parseClock(s) {
    var m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|A\.M\.|P\.M\.)?\s*$/i.exec(s || "");
    if (!m) return null;
    var h = +m[1], mm = +(m[2] || 0);
    if (h > 12 || mm > 59 || (h === 0 && m[3])) return null;
    var mer = m[3] ? m[3].replace(/\./g, "").toUpperCase() : null;
    return { h: h, m: mm, mer: mer };
  }
  function toMinutes(c, mer) {
    var h = c.h % 12;
    if (mer === "PM") h += 12;
    return h * 60 + c.m;
  }

  /* Parse program times:
     "10:30 AM–12:00 PM", "8:00–9:30 AM", "12:00–1:00 PM", "7:30 AM",
     "After 3:30 PM". Returns {start, end, openEnded} in minutes from
     midnight, or null. A time with no end lasts 30 minutes. */
  function parseTimeRange(text) {
    if (typeof text !== "string") return null;
    var t = text.replace(/ /g, " ").trim();
    var after = /^after\s+/i.test(t);
    if (after) t = t.replace(/^after\s+/i, "");
    var parts = t.split(/\s*(?:[–—‒-]|\bto\b)\s*/i).filter(Boolean);
    if (parts.length === 0 || parts.length > 2) return null;
    var a = parseClock(parts[0]);
    if (!a) return null;
    if (parts.length === 1) {
      if (!a.mer) return null;
      var s1 = toMinutes(a, a.mer);
      return { start: s1, end: s1 + 30, openEnded: after };
    }
    var b = parseClock(parts[1]);
    if (!b) return null;
    var endMer = b.mer || a.mer;
    if (!endMer) return null;
    var end = toMinutes(b, endMer);
    var start;
    if (a.mer) {
      start = toMinutes(a, a.mer);
    } else {
      // Borrow the end's AM/PM; if that puts start after end, flip it.
      start = toMinutes(a, endMer);
      if (start > end) {
        start = toMinutes(a, endMer === "PM" ? "AM" : "PM");
        if (end - start > 5 * 60) return null; // e.g. "3:00–2:00 PM" is a typo, not 3 AM
      }
    }
    if (end <= start) return null;
    return { start: start, end: end, openEnded: after };
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  // Minutes from midnight -> "3:45 PM"
  function clockLabel(min) {
    var h = Math.floor(min / 60) % 24, m = min % 60;
    var mer = h >= 12 ? "PM" : "AM";
    var hh = h % 12 === 0 ? 12 : h % 12;
    return hh + ":" + pad(m) + " " + mer;
  }
  function msClock(ms) { var d = new Date(ms); return clockLabel(d.getUTCHours() * 60 + d.getUTCMinutes()); }
  // "HH:MM" -> minutes
  function hhmm(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : NaN; }

  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function weekday(ms) { return DAYS[new Date(ms).getUTCDay()]; }

  // Countdown text: "12:05" (m:ss) under an hour, "2 h 05 min" above, "3 days" above 2 days.
  function countdown(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d >= 2) return { big: d + " days", small: h + " h " + pad(m) + " min" };
    if (s >= 3600) return { big: (d * 24 + h) + " h " + pad(m) + " min", small: "" };
    return { big: m + ":" + pad(sec), small: "" };
  }

  // A clock that can be faked with ?now= and runs forward from there.
  function makeClock(nowParam, perfNow) {
    perfNow = perfNow || function () { return Date.now(); };
    var fake = parseLocal(nowParam);
    if (isNaN(fake)) return { fake: false, now: function () { return realNowET(); } };
    var t0 = perfNow();
    return { fake: true, now: function () { return fake + (perfNow() - t0); } };
  }

  var api = {
    TZ: TZ, MIN: MIN, etParts: etParts, realNowET: realNowET, parseLocal: parseLocal,
    dateKey: dateKey, atMinutes: atMinutes, parseTimeRange: parseTimeRange,
    clockLabel: clockLabel, msClock: msClock, hhmm: hhmm, weekday: weekday,
    countdown: countdown, makeClock: makeClock, pad: pad,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ShowTime = api;
})(this);
