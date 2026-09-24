/* MLSP 2026 auditorium loop: data, loop planning, playback, controls. */
(function () {
  "use strict";
  var T = window.ShowTime, S = window.ShowState, SL = window.ShowSlides;

  var params = new URLSearchParams(location.search);
  var SPEED = Math.min(20, Math.max(0.25, parseFloat(params.get("speed")) || 1));
  var HOLD = params.get("slide");
  var DEBUG = params.get("debug") === "1";
  var STATIC = params.get("static") === "1"; // tests: skip transitions and animations
  var clock = T.makeClock(params.get("now"));

  var SCHEDULE_URL = "https://neuroneural.net/mlsp2026schedule/";
  var SOURCES_URL = "https://neuroneural.net/mlsp2026show/sources.html";
  var LIVE = { papers: "/mlsp2026schedule/data/papers.json", program: "/mlsp2026schedule/data/program.json" };
  var SNAP = { papers: "data/papers.json", program: "data/program.json", facts: "data/facts.json", stats: "data/stats.json", reviewers: "data/reviewers.json" };
  var REFRESH_MS = 10 * 60 * 1000;
  var RELOAD_MS = 3 * 60 * 60 * 1000;

  var log = [];
  function note(msg) { log.push(new Date().toISOString() + " " + msg); if (log.length > 50) log.shift(); if (DEBUG) console.log("[show]", msg); }
  window.addEventListener("error", function (e) { note("error: " + (e.message || e)); e.preventDefault && e.preventDefault(); });
  window.addEventListener("unhandledrejection", function (e) { note("rejection: " + (e.reason && e.reason.message || e.reason)); e.preventDefault && e.preventDefault(); });

  /* ---------- Data ---------- */
  var data = { papers: [], program: [], facts: { facts: [], trivia: [] }, stats: null, reviewers: null };
  var source = { papers: "none", program: "none" };
  var tl = [];

  function getJSON(url, timeoutMs) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { ctrl && ctrl.abort(); }, timeoutMs || 12000);
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    return fetch(url + sep + "t=" + Date.now(), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(url + " " + r.status); return r.json(); })
      .catch(function (e) { clearTimeout(t); throw e; });
  }
  function papersOK(j) {
    var list = j && j.papers;
    if (!Array.isArray(list) || list.length < 50) return null;
    var good = list.filter(function (p) { return p && typeof p.title === "string" && p.title && Array.isArray(p.authors) && p.poster && p.poster.id; });
    if (good.length < list.length * 0.9) return null;
    return good;
  }
  function programOK(j) {
    var prog = Array.isArray(j) ? j : j && j.program;
    if (!Array.isArray(prog) || prog.length < 3) return null;
    var events = 0, bad = 0;
    prog.forEach(function (d) {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Array.isArray(d.events)) { bad++; return; }
      d.events.forEach(function (e) { events++; if (!T.parseTimeRange(e.time)) bad++; });
    });
    if (events < 10 || bad > 0) return null;
    return prog;
  }
  function rebuildTimeline() { tl = S.buildTimeline(data.program); }

  function loadSnapshots() {
    return Promise.all([
      getJSON(SNAP.papers).then(function (j) { var p = papersOK(j); if (p) { data.papers = p; source.papers = "snapshot"; } }).catch(function (e) { note("snapshot papers: " + e.message); }),
      getJSON(SNAP.program).then(function (j) { var p = programOK(j); if (p) { data.program = p; source.program = "snapshot"; } }).catch(function (e) { note("snapshot program: " + e.message); }),
      getJSON(SNAP.facts).then(function (j) { if (j && Array.isArray(j.facts)) data.facts = j; }).catch(function (e) { note("facts: " + e.message); }),
      getJSON(SNAP.stats).then(function (j) { if (j && j.review) data.stats = j; }).catch(function (e) { note("stats: " + e.message); }),
      getJSON(SNAP.reviewers).then(function (j) {
        var r = Array.isArray(j) ? j : j && j.reviewers;
        if (Array.isArray(r)) data.reviewers = r.map(function (x) { return typeof x === "string" ? x : x && x.name; }).filter(Boolean);
      }).catch(function () { /* optional file */ }),
    ]).then(function () { rebuildTimeline(); SL.setVenues(data.facts.venues); });
  }
  function refreshLive() {
    return Promise.all([
      getJSON(LIVE.papers).then(function (j) { var p = papersOK(j); if (!p) throw new Error("bad papers"); data.papers = p; source.papers = "live"; })
        .catch(function (e) { note("live papers: " + e.message); if (source.papers === "live") source.papers = "live (stale)"; }),
      getJSON(LIVE.program).then(function (j) { var p = programOK(j); if (!p) throw new Error("bad program"); data.program = p; source.program = "live"; rebuildTimeline(); })
        .catch(function (e) { note("live program: " + e.message); if (source.program === "live") source.program = "live (stale)"; }),
    ]).then(updateDot);
  }
  function updateDot() {
    var d = document.getElementById("src-dot");
    var live = /^live/.test(source.papers);
    d.className = live ? "live" : "";
    d.title = "papers: " + source.papers + ", program: " + source.program;
  }

  /* ---------- Context ---------- */
  var stCache = { t: -1, st: null };
  var ctx = {
    now: function () { return clock.now(); },
    state: function () {
      var now = clock.now();
      if (Math.abs(now - stCache.t) > 500) { stCache = { t: now, st: S.computeState(now, tl, data.papers) }; }
      return stCache.st;
    },
    timeline: function () { return tl; },
    papers: function () { return data.papers; },
    reviewers: function () { return data.reviewers; },
    scheduleURL: SCHEDULE_URL,
    sourcesURL: SOURCES_URL,
  };
  Object.defineProperty(ctx, "facts", { get: function () { return data.facts; } });
  Object.defineProperty(ctx, "stats", { get: function () { return data.stats; } });

  /* ---------- Catalog ---------- */
  function catalog() {
    var c = [];
    function add(id, kind, dur, build) { c.push({ id: id, kind: kind, dur: dur, build: build }); }
    add("now", "now", 12, SL.buildNow);
    add("posters", "posters", 24, SL.buildPosters);
    add("keynotes-1", "program", 11, SL.keynotePage(0));
    add("keynotes-2", "program", 11, SL.keynotePage(1));
    add("keynotes-3", "program", 11, SL.keynotePage(2));
    add("tutorials", "program", 12, SL.buildTutorials);
    add("qr", "qr", 11, SL.buildQR);
    if (data.stats) {
      add("stat-review", "stat", 11, SL.statReview);
      add("stat-accept", "stat", 10, SL.statAccept);
      add("stat-reviews", "stat", 10, SL.statReviews);
      add("stat-ratios", "stat", 11, SL.statRatios);
      add("stat-program", "stat", 10, SL.statProgram);
      add("stat-themes", "stat", 12, SL.statThemes);
      add("stat-words", "stat", 12, SL.statWords);
      add("stat-reg", "stat", 10, SL.statReg);
      add("stat-regions", "stat", 11, SL.statRegions);
      add("committee-1", "thanks", 14, SL.committee(1));
      add("committee-2", "thanks", 14, SL.committee(2));
      add("committee-3", "thanks", 12, SL.committee(3));
      add("area-chairs", "thanks", 14, SL.buildACs);
    }
    add("chairs", "thanks", 13, SL.buildChairs);
    if (data.stats && data.stats.gala) add("gala", "event", 14, SL.buildGala);
    ((data.stats && data.stats.imageSlides) || []).forEach(function (im) {
      add("image-" + im.id, "event", im.dur || 14, SL.imageSlide(im));
    });
    var nrev = data.reviewers ? Math.ceil(data.reviewers.length / 48) : 0;
    for (var r = 0; r < nrev; r++) add("reviewers-" + (r + 1), "thanks", 14, SL.reviewerPage(r));
    (data.facts.facts || []).forEach(function (f) { add("fact-" + f.id, "fact", 11, SL.factSlide(f)); });
    (data.facts.trivia || []).forEach(function (q) {
      add("trivia-q-" + q.id, "trivia", 11, SL.triviaQ(q));
      add("trivia-a-" + q.id, "trivia", 11, SL.triviaA(q));
    });
    add("sources", "sources", 10, SL.buildSources);
    return c;
  }
  function tryBuild(def) {
    try { var e = def.build(ctx); return e || null; } catch (err) { note("build " + def.id + ": " + err.message); return null; }
  }
  function valid(def) { return !!tryBuild(def); }

  /* ---------- Loop planning ---------- */
  var cursors = {};
  function take(pool, key, n) {
    if (!pool.length) return [];
    if (cursors[key] === undefined) cursors[key] = Math.floor(ctx.now() / 240000) % pool.length; // vary the start after a reload
    var out = [], i = cursors[key] % pool.length;
    for (var k = 0; k < Math.min(n, pool.length); k++) out.push(pool[(i + k) % pool.length]);
    cursors[key] = (i + Math.min(n, pool.length)) % pool.length;
    return out;
  }
  function planLoop() {
    var all = catalog();
    var by = function (pred) { return all.filter(pred); };
    var st = ctx.state();
    var after = st.phase === "after";
    var posterOn = st.mode === "poster";
    var nowDef = by(function (d) { return d.id === "now"; })[0];

    var program = after ? [] : by(function (d) { return d.kind === "program"; }).filter(valid);
    var stats = by(function (d) { return d.kind === "stat"; }).filter(valid);
    var thanks = by(function (d) { return d.kind === "thanks"; }).filter(valid);
    var facts = by(function (d) { return d.kind === "fact"; }).filter(valid);
    var qs = by(function (d) { return /^trivia-q-/.test(d.id); });
    var content = [];
    content = content.concat(by(function (d) { return d.id === "qr"; }));
    content = content.concat(take(program, "program", 2));
    content = content.concat(take(stats, "stat", posterOn ? 2 : 3));
    content = content.concat(take(thanks, "thanks", after ? 3 : 2));
    content = content.concat(take(facts, "fact", posterOn ? 4 : (after ? 6 : 5)));
    content = content.concat(take(by(function (d) { return d.kind === "event"; }).filter(valid), "event", 1));
    if (posterOn) {
      var pd = by(function (d) { return d.id === "posters"; })[0];
      if (valid(pd)) content.push(pd, pd);
    }
    var q = take(qs, "trivia", 1)[0];

    // Interleave so the same kind never runs twice in a row.
    var pools = {};
    content.forEach(function (d) { (pools[d.kind] = pools[d.kind] || []).push(d); });
    var seq = [], last = null;
    while (Object.keys(pools).some(function (k) { return pools[k].length; })) {
      var kinds = Object.keys(pools).filter(function (k) { return pools[k].length && k !== last; })
        .sort(function (a, b) { return pools[b].length - pools[a].length || a.localeCompare(b); });
      var k = kinds[0] || Object.keys(pools).filter(function (x) { return pools[x].length; })[0];
      seq.push(pools[k].shift()); last = k;
    }
    // "Now and next" every 4th slide.
    var out = [];
    seq.forEach(function (d) { if (out.length % 4 === 0) out.push(nowDef); out.push(d); });
    // Trivia question mid-loop, answer two slides later.
    if (q) {
      var ans = all.filter(function (d) { return d.id === q.id.replace("trivia-q-", "trivia-a-"); })[0];
      var p = Math.max(1, Math.floor(out.length / 2));
      out.splice(p, 0, q);
      if (ans) out.splice(Math.min(out.length, p + 2), 0, ans);
    }
    var src = by(function (d) { return d.id === "sources"; })[0];
    if (src) out.push(src);
    // Final pass: no two of a kind back to back (swap forward if needed).
    for (var i = 1; i < out.length; i++) {
      if (out[i].kind === out[i - 1].kind) {
        for (var j = i + 1; j < out.length; j++) {
          if (out[j].kind !== out[i - 1].kind && !/^(now|trivia|sources)$/.test(out[j].kind) && !/^(trivia|sources)$/.test(out[i].kind) && (j + 1 >= out.length || out[j + 1].kind !== out[i].kind) && out[j - 1].kind !== out[i].kind) {
            var tmp = out[i]; out[i] = out[j]; out[j] = tmp; break;
          }
        }
      }
    }
    return out;
  }

  /* ---------- Playback ---------- */
  var slidesEl, progressEl, debugEl, clockEl;
  var queue = [], qi = 0, history = [];
  var curDef = null, curEl = null, elapsed = 0, lastTick = 0, lastPage = 0, paused = false, loops = 0;
  var startedAt = Date.now(), reloadDue = false;

  function countUp(el) {
    var nodes = el.querySelectorAll("[data-count]");
    nodes.forEach(function (n) {
      var target = parseFloat(n.getAttribute("data-count")), dec = +(n.getAttribute("data-dec") || 0), suf = n.getAttribute("data-suffix") || "";
      if (isNaN(target) || STATIC) return;
      var t0 = performance.now(), D = 1600;
      function fmt(v) { return (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US")) + suf; }
      n.textContent = fmt(0);
      function step(t) {
        if (!n.isConnected) return;
        var p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3);
        n.textContent = fmt(target * e);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }
  function growBars(el) {
    el.querySelectorAll("[data-w]").forEach(function (f) {
      if (STATIC) { f.style.transition = "none"; f.style.width = f.getAttribute("data-w") + "%"; return; }
      setTimeout(function () { f.style.width = f.getAttribute("data-w") + "%"; }, 350);
    });
  }

  function show(def, el) {
    var old = curEl;
    curDef = def; curEl = el; elapsed = 0; lastPage = 0;
    el.setAttribute("data-id", def.id);
    slidesEl.appendChild(el);
    if (STATIC) { el.style.transition = "none"; el.classList.add("in"); }
    else requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("in"); }); });
    countUp(el); growBars(el);
    if (el._onShow) { try { el._onShow(); } catch (e) { note(e.message); } }
    if (old) {
      old.classList.remove("in"); old.classList.add("out");
      setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, STATIC ? 0 : 900);
    }
    document.body.setAttribute("data-slide", def.id);
    renderDebug();
  }

  function next(dir) {
    if (reloadDue && !HOLD) { location.reload(); return; }
    var tries = 0;
    while (tries++ < 60) {
      var def;
      if (HOLD) {
        def = catalog().filter(function (d) { return d.id === HOLD; })[0];
        if (!def) { note("unknown slide " + HOLD); def = catalog()[0]; }
      } else if (dir === -1 && history.length > 1) {
        history.pop(); def = history.pop();
      } else {
        if (qi >= queue.length) { queue = planLoop(); qi = 0; loops++; }
        def = queue[qi++];
      }
      if (!def) continue;
      var el = tryBuild(def);
      if (el) {
        history.push(def); if (history.length > 40) history.shift();
        show(def, el);
        return;
      }
      if (HOLD) return;
    }
  }

  function tick() {
    try {
      var t = performance.now();
      var dt = lastTick ? t - lastTick : 0; lastTick = t;
      var now = clock.now();
      clockEl.innerHTML = "<b>" + T.msClock(now) + "</b> ET";
      if (!curDef) return;
      if (!paused) elapsed += dt * SPEED;
      var dur = curDef.dur * 1000;
      progressEl.style.width = Math.min(100, 100 * elapsed / dur) + "%";
      if (curEl && curEl._target) SL.tickCountdown(curEl, curEl._target, ctx);
      if (curEl && curEl._page && elapsed - lastPage >= curEl._pageEvery) {
        lastPage = elapsed;
        var ce = curEl, list = ce.querySelector("[data-list]");
        if (list && !STATIC) { list.style.transition = "opacity 500ms"; list.style.opacity = 0; setTimeout(function () { try { if (ce.isConnected) ce._page(); list.style.opacity = 1; } catch (e) { note(e.message); } }, 520); }
        else ce._page();
      }
      if (!paused && elapsed >= dur) {
        if (HOLD) { // rebuild the held slide so live content stays current
          if (elapsed >= Math.max(dur, 30000)) next();
        } else next();
      }
      if (Date.now() - startedAt > RELOAD_MS) reloadDue = true;
      if (DEBUG && Math.floor(t / 1000) !== Math.floor((t - dt) / 1000)) renderDebug();
    } catch (e) { note("tick: " + e.message); }
  }

  function renderDebug() {
    if (!DEBUG || !debugEl) return;
    var st = ctx.state();
    debugEl.textContent = "slide " + (curDef && curDef.id) + "  " + qi + "/" + queue.length + "  loop " + loops +
      "\nphase " + st.phase + (st.mode ? " / " + st.mode : "") + (clock.fake ? "  (fake clock)" : "") + "  speed " + SPEED +
      "\npapers " + source.papers + " (" + data.papers.length + ")  program " + source.program + (log.length ? "\n" + log[log.length - 1].slice(0, 110) : "");
  }

  /* ---------- Layout, input, power ---------- */
  function fit() {
    var w = window.innerWidth, h = window.innerHeight, s = Math.min(w / 1920, h / 1080);
    var stage = document.getElementById("stage");
    stage.style.transform = "translate(" + ((w - 1920 * s) / 2) + "px," + ((h - 1080 * s) / 2) + "px) scale(" + s + ")";
  }
  var cursorTimer = null;
  function wake() {
    document.body.classList.remove("hide-cursor");
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () { document.body.classList.add("hide-cursor"); }, 3000);
  }
  function keys(e) {
    if (e.key === "ArrowRight") { next(); }
    else if (e.key === "ArrowLeft") { next(-1); }
    else if (e.key === " " || e.code === "Space") { paused = !paused; document.body.classList.toggle("paused", paused); e.preventDefault(); }
    else if (e.key === "f" || e.key === "F") {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(function () {});
      } catch (err) { note("fullscreen: " + err.message); }
    }
  }
  var lock = null;
  function wakeLock() {
    try {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(function (l) { lock = l; }).catch(function (e) { note("wakelock: " + e.message); });
    } catch (e) { note("wakelock: " + e.message); }
  }

  function start() {
    slidesEl = document.getElementById("slides");
    progressEl = document.querySelector("#progress i");
    debugEl = document.getElementById("debug");
    clockEl = document.getElementById("clock");
    if (DEBUG) document.body.classList.add("debug");
    fit();
    window.addEventListener("resize", fit);
    document.addEventListener("keydown", keys);
    document.addEventListener("mousemove", wake);
    wake();
    wakeLock();
    document.addEventListener("visibilitychange", wakeLock);

    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    loadSnapshots().then(function () {
      updateDot();
      return Promise.race([refreshLive(), new Promise(function (r) { setTimeout(r, 4000); })]);
    }).then(function () { return Promise.race([fonts, new Promise(function (r) { setTimeout(r, 3000); })]); })
      .then(function () {
        next();
        setInterval(tick, STATIC ? 1000 : 200);
        setInterval(function () { refreshLive().then(renderDebug); }, REFRESH_MS);
        document.body.classList.add("ready");
      }).catch(function (e) { note("start: " + e.message); setTimeout(function () { location.reload(); }, 30000); });

    window.__show = {
      catalog: function () { return catalog().filter(valid).map(function (d) { return d.id; }); },
      plan: function () { return planLoop().map(function (d) { return d.id; }); },
      state: function () { return ctx.state(); },
      source: function () { return source; },
      log: function () { return log.slice(); },
      current: function () { return curDef && curDef.id; },
      loops: function () { return loops; },
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
