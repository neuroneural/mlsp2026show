/* Slide builders. Each slide: {id, kind, dur, build(ctx) -> HTMLElement|null,
   tick?(el, ctx), show?(el, ctx)}. A builder that throws or returns null is skipped. */
(function (root) {
  "use strict";
  var T = root.ShowTime, S = root.ShowState, U = root.ShowUtil;
  var esc = U.esc;

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function dayLabel(dateStr) {
    var ms = T.parseLocal(dateStr), d = new Date(ms);
    return T.weekday(ms) + ", " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
  }
  function shortDay(ms) { return T.weekday(ms).slice(0, 3); }
  function range(ev) { return T.msClock(ev.start) + " to " + T.msClock(ev.end); }

  function el(html, cls) {
    var d = document.createElement("section");
    d.className = "slide" + (cls ? " " + cls : "");
    d.innerHTML = html;
    return d;
  }
  function noDr(n) { return String(n || "").replace(/^(Dr\.|Prof\.)\s+/, ""); }
  function presenterNames(ev) {
    return (ev.presenters || []).map(function (p) { return p.split(" · ")[0].replace(/,\s*(Ph\.D\.|MS|M\.S\.)$/, ""); });
  }
  function eventWho(ev) {
    if (!ev) return "";
    if (ev.kind === "keynote") return esc(noDr(ev.speaker)) + (ev.talkTitle ? "<br>“" + esc(ev.talkTitle) + "”" : "");
    if (ev.kind === "tutorial") return esc(ev.detail) + '<br><span class="muted">' + esc(presenterNames(ev).join(", ")) + "</span>";
    if (ev.kind === "oral") {
      var c = ev.chairs && ev.chairs[0];
      return esc(ev.detail) + (c ? "<br>Chair: " + esc(c.name) + ", " + esc(c.affiliation) : "");
    }
    if (ev.kind === "social") return esc(venueLine(ev));
    return esc(ev.detail || "");
  }
  function eventWhat(ev) {
    return esc(ev.title);
  }
  var VENUES = {};
  function venueLine(ev) {
    var v = VENUES[ev.title];
    return v ? v.place + ", " + v.address : "";
  }
  function card(ev, label, cls) {
    if (!ev) return "";
    return '<div class="nowcard ' + (cls || "") + '"><div class="when">' + esc(label || (shortDay(ev.start) + " " + range(ev))) + "</div>" +
      '<div class="what">' + eventWhat(ev) + "</div>" +
      (eventWho(ev) ? '<div class="who">' + eventWho(ev) + "</div>" : "") + "</div>";
  }
  function cdHTML(ms, cls) {
    var c = T.countdown(ms);
    return '<div class="countdown ' + (cls || "") + '"><span data-cd>' + esc(c.big) + '</span>' +
      '<span class="cd-small" data-cd-small>' + esc(c.small ? "and " + c.small : "") + "</span></div>";
  }
  function tickCountdown(el, target, ctx) {
    if (!target) return;
    var c = T.countdown(target - ctx.now());
    var n = el.querySelector("[data-cd]"), m = el.querySelector("[data-cd-small]");
    if (n) n.textContent = c.big;
    if (m) m.textContent = c.small ? "and " + c.small : "";
  }

  function talksHTML(talks, now, withTitles) {
    return '<div class="talks">' + talks.map(function (t) {
      var cls = now >= t.end ? "done" : (now >= t.start ? "cur" : "");
      return '<div class="talk ' + cls + '"><div class="t">' + T.msClock(t.start).replace(" ", " ") + '</div><div class="a">' + esc(U.smartName(t.firstAuthor)) + "</div>" +
        (withTitles ? '<div class="ti">' + esc(U.smartTitle(t.title)) + "</div>" : "") + "</div>";
    }).join("") + "</div>";
  }

  /* ---------- Now and next ---------- */
  function buildNow(ctx) {
    var st = ctx.state();
    var now = st.now;
    if (st.phase === "before") {
      var tuts = st.highlights.filter(function (e) { return e.kind === "tutorial"; });
      var items = [];
      if (tuts.length) {
        var nT = {}; tuts.forEach(function (e) { nT[e.detail] = 1; });
        items.push([tuts[0].start, Object.keys(nT).length + " tutorials, all day"]);
      }
      st.highlights.forEach(function (e) {
        if (e.kind === "keynote") items.push([e.start, "Special keynote: " + noDr(e.speaker)]);
        if (e.kind === "social") items.push([e.start, e.title]);
      });
      var cd0 = T.countdown(st.target.start - now);
      var s = el(
        '<p class="eyebrow">MLSP 2026 starts in</p>' +
        '<div>' + cdHTML(st.target.start - now, "xl") + '<div class="countdown-sub">' + esc(st.target.title) + " opens " + esc(dayLabel(st.target.date)) + ", " + T.msClock(st.target.start) + ".<br>Tutorials Monday. Talks and posters Tuesday to Thursday.</div></div>" +
        '<p class="eyebrow" style="margin-top:36px">Monday highlights</p><div class="list">' +
        items.slice(0, 4).map(function (it) {
          return '<div class="li"><div class="t">' + T.msClock(it[0]) + '</div><div class="x">' + esc(it[1]) + "</div></div>";
        }).join("") + "</div>", "now");
      s._target = st.target.start;
      return s;
    }
    if (st.phase === "after") return buildThanksAll(ctx);
    var m = st.mode;
    if (m === "break") {
      var nx = st.next;
      var label = st.registrationOpen ? "Registration is open" : (st.current ? esc(st.current.title) + " until " + T.msClock(st.current.end) : "Up next");
      var html = '<p class="eyebrow">' + label + "</p>";
      if (nx.kind === "oral" && st.nextTalks && st.nextTalks.length) {
        var c = nx.chairs && nx.chairs[0];
        html += '<div class="now-top"><div style="min-width:0"><h2 style="margin:0">' + esc(nx.title) + '</h2>' +
          '<div class="body" style="margin-top:10px;color:#fff">' + esc(nx.detail) + '</div>' +
          (c ? '<div class="body" style="margin-top:6px">Chair: ' + esc(c.name) + ", " + esc(c.affiliation) + "</div>" : "") + "</div>" +
          '<div style="text-align:right;flex:0 0 auto"><div class="countdown-sub" style="margin:0 0 6px">Starts in</div>' + cdHTML(nx.start - now, "md") + "</div></div>" +
          talksHTML(st.nextTalks, now, false);
      } else {
        html += '<div class="now-top"><div><div class="countdown-sub" style="margin:0 0 10px">Next up in</div>' + cdHTML(nx.start - now) + "</div></div>" +
          (nx.kind === "keynote" && kPhoto(ctx, nx.speaker) ? '<div class="kn-now" style="margin-top:30px"><img src="' + esc(kPhoto(ctx, nx.speaker)) + '" alt="">' + card(nx, T.msClock(nx.start) + " to " + T.msClock(nx.end), "accent") + "</div>" : card(nx, T.msClock(nx.start) + " to " + T.msClock(nx.end), "accent"));
      }
      var sb = el(html, "now");
      sb._target = nx.start;
      return sb;
    }
    if (m === "oral") {
      var ev = st.current, t = st.currentTalk, nt = st.nextTalk, ch = ev.chairs && ev.chairs[0];
      var h = '<p class="eyebrow">' + esc(ev.title) + ": " + esc(ev.detail) + "</p>";
      if (t) {
        h += '<div><span class="onair">NOW · TALK ' + t.order + " OF " + st.talks.length + "</span></div>" +
          '<div class="talk-title">' + esc(U.smartTitle(t.title)) + "</div>" +
          '<div class="talk-author">' + esc(U.smartName(t.firstAuthor)) + " · until " + T.msClock(t.end) + "</div>";
      } else if (nt) {
        h += '<div><span class="onair">NEXT TALK AT ' + T.msClock(nt.start) + "</span></div>" +
          '<div class="talk-title">' + esc(U.smartTitle(nt.title)) + '</div><div class="talk-author">' + esc(U.smartName(nt.firstAuthor)) + "</div>";
        nt = st.talks.filter(function (x) { return x.start > nt.start; })[0];
      }
      h += '<div class="grow"></div>';
      if (nt) h += '<div class="nextline"><span class="cyan">Next at ' + T.msClock(nt.start) + ":</span> <b>" + esc(U.smartName(nt.firstAuthor)) + '</b><span class="ti">' + esc(U.smartTitle(nt.title)) + "</span></div>";
      else if (st.next) h += '<div class="nextline"><span class="cyan">Next at ' + T.msClock(st.next.start) + ":</span> <b>" + esc(st.next.title) + "</b></div>";
      if (ch) h += '<div class="body" style="margin-top:24px">Session chair: <b style="color:#fff">' + esc(ch.name) + "</b>, " + esc(ch.affiliation) + "</div>";
      return el(h, "now");
    }
    if (m === "poster") {
      var p = st.poster, ev2 = st.current;
      var maxv = p.themes.length ? p.themes[0][1] : 1;
      var sp = el(
        '<p class="eyebrow">On now</p><h1>Poster Session ' + esc(p.number) + " is on now until " + T.msClock(ev2.end) + "</h1>" +
        '<div class="row" style="align-items:flex-start;gap:90px;margin-top:10px"><div><div class="big md" data-count="' + p.count + '">' + p.count + '</div><div class="body">posters</div></div>' +
        '<div class="bars grow" style="gap:18px">' + p.themes.map(function (th) {
          return '<div class="bar" style="grid-template-columns:560px 1fr 90px"><div class="name">' + esc(U.shortTheme(th[0])) + '</div><div class="track"><div class="fill" data-w="' + (100 * th[1] / maxv) + '"></div></div><div class="val">' + th[1] + "</div></div>";
        }).join("") + "</div></div>" +
        (st.next ? '<div class="grow"></div><div class="body">Next: <b style="color:#fff">' + esc(st.next.title) + "</b> at " + T.msClock(st.next.start) + "</div>" : ""),
        "now");
      return sp;
    }
    if (m === "social") {
      var e = st.current, v = VENUES[e.title];
      var up = st.upcoming;
      var hs = '<p class="eyebrow">Tonight</p><h1>' + esc(e.title) + "</h1>" +
        '<div class="lead">' + range(e) + "</div>" +
        (v ? '<div class="lead cyan" style="margin-top:14px">' + esc(v.place) + '</div><div class="body">' + esc(v.address) + "</div>" + (v.note ? '<div class="body" style="margin-top:14px;color:#fff">' + esc(v.note) + "</div>" : "") : "");
      if (up && up.events.length) {
        hs += '<div class="grow"></div><div class="nextline"><span class="cyan">Tomorrow:</span> ' + up.events.slice(0, 2).map(function (e) {
          return "<b>" + T.msClock(e.start) + "</b> " + esc(e.title);
        }).join(" \u00b7 ") + "</div>";
      }
      return el(hs, "now");
    }
    if (m === "overnight") {
      var u = st.upcoming;
      var ho = '<p class="eyebrow">' + (st.isTomorrow ? "Tomorrow at MLSP" : "Today at MLSP") + "</p><h1>" + esc(dayLabel(st.upcomingDate)) + "</h1>" +
        (!st.isTomorrow ? '<div class="countdown-sub" style="margin-bottom:10px">Starts in</div>' + cdHTML(st.next.start - now, "md") : "") +
        '<div class="list" style="margin-top:40px">' + (u.registration ? li(u.registration) : "") + u.events.map(li).join("") + "</div>";
      var so = el(ho, "now");
      so._target = st.isTomorrow ? null : st.next.start;
      return so;
    }
    // keynote, tutorial, closing, anything else that is on now
    var cur = st.current;
    var hk = '<p class="eyebrow">On now until ' + T.msClock(cur.end) + "</p>";
    if (cur.kind === "keynote") {
      var kp = kPhoto(ctx, cur.speaker);
      hk += '<div class="kn-now">' + (kp ? '<img src="' + esc(kp) + '" alt="">' : "") + '<div><h1 style="font-size:80px">' + esc(cur.title) + ": " + esc(noDr(cur.speaker)) + '</h1><div class="lead">\u201c' + esc(cur.talkTitle) + "\u201d</div></div></div>";
    } else if (cur.kind === "tutorial") {
      hk += '<h1 style="font-size:80px">' + esc(cur.title) + '</h1><div class="lead">' + esc(cur.detail) + '</div><div class="body" style="margin-top:20px">' + esc(presenterNames(cur).join(", ")) + "</div>";
    } else {
      hk += "<h1>" + esc(cur.title) + "</h1>" + (cur.detail ? '<div class="lead">' + esc(cur.detail) + "</div>" : "");
    }
    hk += '<div class="grow"></div>';
    if (st.next) hk += card(st.next, "Next at " + T.msClock(st.next.start));
    if (st.next && st.next.kind === "break" && st.nextMain) hk += '<div class="body" style="margin-top:22px">Then ' + esc(st.nextMain.title) + " at " + T.msClock(st.nextMain.start) + "</div>";
    return el(hk, "now");
  }
  function li(e) {
    var x = e.kind === "keynote" ? esc(e.title) + "<small>" + esc(noDr(e.speaker)) + "</small>" :
      e.kind === "oral" ? esc(e.title) + "<small>" + esc(e.detail) + "</small>" :
      e.kind === "tutorial" ? esc(e.title) + "<small>" + clip(esc(e.detail), 64) + "</small>" : esc(e.title);
    return '<div class="li"><div class="t">' + T.msClock(e.start) + '</div><div class="x">' + x + "</div></div>";
  }
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1).replace(/[\s,:;]+\S*$/, "") + "…" : s; }

  function buildThanksAll(ctx) {
    var f = ctx.facts.mlsp2027;
    return el('<div class="vcenter"><p class="eyebrow">MLSP 2026 is a wrap</p><h1 style="font-size:130px">Thank you<br>for coming.</h1><div class="rule"></div>' +
      '<div class="lead">' + esc(f ? f.text : "See you at MLSP 2027.") + "</div></div>", "now");
  }

  /* ---------- Poster rotator ---------- */
  var posterCursor = {};
  function buildPosters(ctx) {
    var st = ctx.state();
    if (st.mode !== "poster") return null;
    var p = st.poster, list = p.papers.slice().sort(function (a, b) { return a.submissionNumber - b.submissionNumber; });
    if (!list.length) return null;
    var key = st.current.sessionId;
    var s = el('<div class="row" style="justify-content:space-between;align-items:baseline"><p class="eyebrow">Poster Session ' + esc(p.number) + ' \u00b7 on now until ' + T.msClock(st.current.end) + '</p><div class="pagedots" data-pg></div></div><div class="posters" data-list></div>', "posters");
    var per = 3, shownAt = 0;
    function renderAt(start) {
      start = start % list.length;
      shownAt = start;
      var items = [];
      for (var i = 0; i < per && i < list.length; i++) items.push(list[(start + i) % list.length]);
      s.querySelector("[data-list]").innerHTML = items.map(function (x) {
        return '<div class="poster"><div class="pt">' + esc(U.smartTitle(x.title)) + '</div><div class="pa"><b>' + esc(U.shortTheme(x.theme)) + "</b> \u00b7 " + esc(U.authorLine(x, 4)) + "</div></div>";
      }).join("");
      var a = start + 1, b = Math.min(start + per, list.length);
      s.querySelector("[data-pg]").textContent = "Posters " + a + "\u2013" + b + " of " + list.length;
    }
    function commit() { posterCursor[key] = shownAt + per >= list.length ? 0 : shownAt + per; }
    renderAt(posterCursor[key] || 0);
    s._onShow = commit;
    s._page = function () { renderAt(posterCursor[key] || 0); commit(); };
    s._pageEvery = 8000;
    return s;
  }

  /* ---------- Program ---------- */
  function upcomingKeynotes(ctx) {
    var st = ctx.state(), now = st.now;
    return ctx.timeline().filter(function (e) { return e.kind === "keynote" && e.end > now; });
  }
  function kPhoto(ctx, speaker) {
    var m = (ctx.stats && ctx.stats.keynotePhotos) || {};
    return m[noDr(speaker)] || "";
  }
  function keynotePage(i) {
    return function (ctx) {
      var ks = upcomingKeynotes(ctx).slice(i * 2, i * 2 + 2);
      if (!ks.length) return null;
      // Photos only when every speaker on this slide has one.
      var photos = ks.every(function (k) { return kPhoto(ctx, k.speaker); });
      return el('<p class="eyebrow">Keynote speakers</p><div class="keynotes' + (photos ? " with-photos" : "") + '">' + ks.map(function (k) {
        var text = '<div class="when">' + esc(k.day) + " " + T.msClock(k.start) + " \u00b7 " + esc(k.title) + '</div><div class="sp">' + esc(noDr(k.speaker)) + '</div><div class="tt">\u201c' + esc(k.talkTitle) + "\u201d</div>";
        return photos ? '<div class="kn"><img src="' + esc(kPhoto(ctx, k.speaker)) + '" alt="" onerror="this.style.visibility=\'hidden\'"><div>' + text + "</div></div>" : '<div class="kn">' + text + "</div>";
      }).join("") + "</div>");
    };
  }
  function buildTutorials(ctx) {
    var st = ctx.state();
    var tl = ctx.timeline().filter(function (e) { return e.kind === "tutorial"; });
    if (!tl.length) return null;
    var lastEnd = tl[tl.length - 1].end;
    if (st.phase !== "before" && st.now >= lastEnd) return null;
    var groups = [];
    tl.forEach(function (e) {
      var g = groups.filter(function (x) { return x.detail === e.detail; })[0];
      if (g) g.end = e.end; else groups.push({ detail: e.detail, start: e.start, end: e.end, ev: e, n: (/Tutorial (\d)/.exec(e.title) || [])[1] });
    });
    return el('<p class="eyebrow">Monday, September 28</p><h1>Tutorials</h1><div class="list" style="gap:34px">' + groups.map(function (g) {
      return '<div class="li" style="grid-template-columns:300px 1fr"><div class="t">' + T.msClock(g.start) + '</div><div class="x">' + clip(esc(g.detail), 84) + "<small>" + esc(presenterNames(g.ev).join(", ")) + "</small></div></div>";
    }).join("") + "</div>");
  }
  function qrSVG(text) {
    var q = root.qrcode(0, "M");
    q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  }
  function buildQR(ctx) {
    var url = ctx.scheduleURL;
    return el('<div class="qrwrap"><div class="qr">' + qrSVG(url) + '</div><div><p class="eyebrow">Full schedule</p><h1>Find any paper and its poster and talk time.</h1><div class="lead muted">Scan with your phone camera.</div><div class="url">' + esc(url.replace(/^https?:\/\//, "")) + "</div></div></div>");
  }

  /* ---------- Conference facts (from the deck) ---------- */
  function statReview(ctx) {
    var r = ctx.stats.review, max = r.accepted;
    return el('<p class="eyebrow">Peer review</p><div class="hero-stat"><div class="big xl" data-count="' + r.entered + '">' + r.entered + '</div><div class="lbl">papers entered review</div></div>' +
      '<div class="bars" style="margin-top:50px">' + [["Accepted", r.accepted, "hi"], ["Rejected", r.rejected, ""], ["Withdrawn", r.withdrawn, ""]].map(function (b) {
        return '<div class="bar ' + b[2] + '" style="grid-template-columns:320px 1fr 150px"><div class="name">' + b[0] + '</div><div class="track"><div class="fill" data-w="' + (100 * b[1] / max) + '"></div></div><div class="val">' + b[1] + "</div></div>";
      }).join("") + "</div>", "stat");
  }
  function statAccept(ctx) {
    var r = ctx.stats.review;
    return el('<div class="vcenter"><p class="eyebrow">Acceptance</p><div class="big xl" data-count="' + r.acceptancePct + '" data-dec="1" data-suffix="%">' + r.acceptancePct + '%</div><div class="lead" style="margin-top:30px">of decided papers were accepted: ' + r.accepted + " of " + (r.accepted + r.rejected) + ".</div></div>", "stat");
  }
  function statReviews(ctx) {
    var v = ctx.stats.reviews;
    return el('<p class="eyebrow">Reviews</p><h1>' + v.total + " reviews made this program.</h1>" +
      '<div class="statgrid" style="margin-top:60px">' +
      '<div class="stat"><div class="num" data-count="' + v.total + '">' + v.total + '</div><div class="lbl">reviews</div></div>' +
      '<div class="stat"><div class="num" data-count="' + v.reviewers + '">' + v.reviewers + '</div><div class="lbl">reviewers</div></div>' +
      '<div class="stat"><div class="num" data-count="' + v.areaChairs + '">' + v.areaChairs + '</div><div class="lbl">area chairs</div></div></div>', "stat");
  }
  function statRatios(ctx) {
    var v = ctx.stats.reviews;
    return el('<p class="eyebrow">Review load</p>' +
      '<div class="statgrid" style="margin-top:40px">' +
      '<div class="stat"><div class="num" data-count="' + v.perPaper + '" data-dec="1">' + v.perPaper + '</div><div class="lbl">reviews per paper</div></div>' +
      '<div class="stat"><div class="num" data-count="' + v.perReviewer + '" data-dec="1">' + v.perReviewer + '</div><div class="lbl">reviews per reviewer</div></div>' +
      '<div class="stat"><div class="num" data-count="' + v.papersPerAC + '" data-dec="1">' + v.papersPerAC + '</div><div class="lbl">papers per area chair</div></div></div>' +
      '<div class="grow"></div><div class="lead">Every paper that reached final review had at least ' + v.minReviews + " reviews.</div>", "stat");
  }
  function statProgram(ctx) {
    var p = ctx.stats.program;
    return el('<p class="eyebrow">The program</p><h1>Every paper gets a poster.</h1>' +
      '<div class="statgrid" style="margin-top:50px">' +
      '<div class="stat"><div class="num" data-count="' + p.orals + '">' + p.orals + '</div><div class="lbl">oral talks in ' + p.oralSessions + ' sessions</div></div>' +
      '<div class="stat"><div class="num" data-count="' + p.posters + '">' + p.posters + '</div><div class="lbl">posters in ' + p.posterSessions + ' sessions</div></div>' +
      '<div class="stat"><div class="num">~<span data-count="' + p.postersPerSession + '">' + p.postersPerSession + '</span></div><div class="lbl">posters per session</div></div></div>', "stat");
  }
  function statThemes(ctx) {
    var tc = U.themeCounts(ctx.papers()), max = Math.max.apply(null, tc.map(function (x) { return x[1]; }));
    var total = tc.reduce(function (a, b) { return a + b[1]; }, 0);
    return el('<p class="eyebrow">Papers by theme</p><h2>' + total + " accepted papers</h2>" +
      '<div class="bars" style="gap:22px;margin-top:20px">' + tc.map(function (t, i) {
        return '<div class="bar ' + (i === 0 ? "hi" : "") + '"><div class="name">' + esc(U.shortTheme(t[0])) + '</div><div class="track"><div class="fill" data-w="' + (100 * t[1] / max) + '"></div></div><div class="val">' + t[1] + "</div></div>";
      }).join("") + "</div>", "stat");
  }
  function statWords(ctx) {
    var w = U.topWords(ctx.papers(), 20);
    if (w.length < 8) return null;
    var max = w[0][1], min = w[w.length - 1][1];
    // Shuffle deterministically so big words spread out.
    var order = w.map(function (x, i) { return [x, (i * 7919) % 23]; }).sort(function (a, b) { return a[1] - b[1]; }).map(function (x) { return x[0]; });
    var html = order.map(function (x, i) {
      var f = max === min ? 1 : (x[1] - min) / (max - min);
      var size = Math.round(48 + f * 84);
      var color = f > 0.6 ? "var(--accent)" : f > 0.25 ? "var(--cyan)" : "var(--white)";
      return '<span style="font-size:' + size + "px;color:" + color + ";transition-delay:" + (i * 60) + 'ms">' + esc(x[0]) + "</span>";
    }).join("");
    return el('<p class="eyebrow">Top words in paper titles</p><div class="cloud">' + html + "</div>", "stat");
  }
  function statReg(ctx) {
    var r = ctx.stats.registrations;
    return el('<p class="eyebrow">Who came</p>' +
      '<div class="hero-stat"><div class="big xl" data-count="' + r.total + '">' + r.total + '</div><div class="lbl">registrations from ' + r.countries + " countries</div></div>" +
      '<div class="statgrid" style="grid-template-columns:1fr 1fr;margin-top:60px">' +
      '<div class="stat"><div class="num small" data-count="' + r.us + '">' + r.us + '</div><div class="lbl">from the U.S.</div></div>' +
      '<div class="stat"><div class="num small" data-count="' + r.abroad + '">' + r.abroad + '</div><div class="lbl">from abroad</div></div></div>', "stat");
  }
  function statRegions(ctx) {
    var rg = ctx.stats.registrations.regions, max = rg[0][1];
    return el('<p class="eyebrow">Registrations by region</p><h2>People came from five regions.</h2>' +
      '<div class="bars" style="margin-top:30px">' + rg.map(function (t, i) {
        return '<div class="bar ' + (i === 0 ? "hi" : "") + '" style="grid-template-columns:440px 1fr 150px"><div class="name">' + esc(t[0]) + '</div><div class="track"><div class="fill" data-w="' + Math.max(1.5, 100 * t[1] / max) + '"></div></div><div class="val">' + t[1] + "</div></div>";
      }).join("") + "</div>", "stat");
  }

  /* ---------- Thank you ---------- */
  function peopleHTML(list) {
    return list.map(function (p, i) {
      var alt = /Co-Chair$/.test(p.role) && /Conference|Technical/.test(p.role) ? "" : "alt";
      return '<div class="person ' + alt + '"><img src="' + esc(p.photo) + '" alt="" onerror="this.style.visibility=\'hidden\'"><div class="n">' + esc(p.name) + '</div><div class="r">' + esc(p.role) + "</div></div>";
    }).join("");
  }
  function committee(part) {
    return function (ctx) {
      var c = ctx.stats.committee;
      var list = part === 1 ? c.slice(0, 6) : part === 2 ? c.slice(6, 11) : c.slice(11);
      if (!list.length) return null;
      return el('<h2>Thank you, organizing committee</h2><div class="people ' + (list.length === 4 ? "four" : "") + '">' + peopleHTML(list) + "</div>", "thanks");
    };
  }
  function buildChairs(ctx) {
    var orals = ctx.timeline().filter(function (e) { return e.kind === "oral"; });
    if (!orals.length) return null;
    var photos = (ctx.stats && ctx.stats.chairPhotos) || {};
    var all = orals.every(function (e) { return e.chairs[0] && photos[e.chairs[0].name]; });
    if (all) {
      // Photo layout only when every chair has a photo, so the row looks even.
      return el('<h2>Thank you, oral session chairs</h2><div class="people five">' + orals.map(function (e) {
        var c = e.chairs[0];
        return '<div class="person"><img src="' + esc(photos[c.name]) + '" alt="" onerror="this.style.visibility=\'hidden\'"><div class="n">' + esc(c.name) + '</div><div class="r">' + esc(c.affiliation) + '</div><div class="r cyan">' + esc(e.title.replace("Oral Session ", "Session ")) + " \u00b7 " + esc(e.day.slice(0, 3)) + "</div></div>";
      }).join("") + "</div>", "thanks");
    }
    return el('<h2>Thank you, oral session chairs</h2><div class="chairs">' + orals.map(function (e) {
      var c = e.chairs[0] || { name: "", affiliation: "" };
      return '<div class="chair"><div class="s">' + esc(e.title.replace("Oral Session ", "Session ")) + '</div><div class="n">' + esc(c.name) + "<small>" + esc(c.affiliation) + '</small></div></div>';
    }).join("") + "</div>", "thanks");
  }
  function buildACs(ctx) {
    var a = ctx.stats.areaChairs;
    return el('<h2>Thank you, area chairs</h2><div class="names">' + a.map(function (n) { return "<div>" + esc(n) + "</div>"; }).join("") + "</div>", "thanks");
  }
  function reviewerPage(i) {
    return function (ctx) {
      var r = ctx.reviewers();
      if (!r || !r.length) return null;
      var per = 48;
      var page = r.slice(i * per, (i + 1) * per);
      if (!page.length) return null;
      var pages = Math.ceil(r.length / per);
      return el('<h2>Thank you, all ' + r.length + " reviewers" + (pages > 1 ? " (" + (i + 1) + " of " + pages + ")" : "") + '</h2><div class="names four dense">' + page.map(function (n) { return "<div>" + esc(n) + "</div>"; }).join("") + "</div>", "thanks");
    };
  }

  /* ---------- Facts ---------- */
  var GROUP_LABEL = { "atlanta-fun": "Atlanta", "atlanta-engineering": "Atlanta builds", "mlsp-community": "The MLSP community" };
  function factSlide(f) {
    return function () {
      if (!f || !f.text) return null;
      var inner;
      if (f.list) {
        inner = '<p class="eyebrow">' + esc(GROUP_LABEL[f.group] || "") + "</p><h1>" + esc(f.headline) + '</h1><div class="hosts">' + f.list.map(function (x) {
          var m = /^(\d{4})\s+(.*)$/.exec(x) || [x, "", x];
          return '<div class="' + (/Atlanta/.test(x) ? "here" : "") + '"><b>' + esc(m[1]) + "</b>" + esc(m[2]) + "</div>";
        }).join("") + "</div>";
      } else {
        var bigSize = String(f.big || "").length > 7 ? "md" : "";
        inner = '<div class="vcenter"><p class="eyebrow">' + esc(GROUP_LABEL[f.group] || "") + " · " + esc(f.headline) + "</p>" +
          (f.big ? '<div class="big ' + bigSize + '">' + esc(f.big) + "</div>" : "") +
          '<div class="lead">' + esc(f.text) + "</div></div>";
      }
      return el(inner, "fact");
    };
  }
  function triviaQ(q) {
    return function () {
      return el('<div class="vcenter trivia"><p class="eyebrow">Trivia</p><div class="q">' + esc(q.question) + '</div><div class="hint">Answer in two slides.</div></div>', "trivia");
    };
  }
  function triviaA(q) {
    return function () {
      return el('<div class="vcenter trivia"><p class="eyebrow">Trivia answer</p><div class="body" style="margin-bottom:26px">' + esc(q.question) + '</div><div class="q accent">' + esc(q.answer) + "</div></div>", "trivia");
    };
  }
  function buildSources(ctx) {
    var all = ctx.facts.facts.concat(ctx.facts.trivia || []);
    if (ctx.facts.mlsp2027) all.push({ id: "mlsp2027", source_title: ctx.facts.mlsp2027.source_title, source_url: ctx.facts.mlsp2027.source_url });
    var seen = {}, rows = [];
    all.forEach(function (f) {
      if (seen[f.source_url]) return; seen[f.source_url] = 1;
      rows.push("<div><b>" + esc(f.source_title) + "</b> " + esc(String(f.source_url).replace(/^https?:\/\/(www\.)?/, "").split("/")[0]) + "</div>");
    });
    rows.push("<div><b>Conference numbers:</b> MLSP 2026 organizing committee. Papers and schedule: neuroneural.net/mlsp2026schedule</div>");
    return el('<div class="row" style="gap:70px;flex:1 1 auto;min-height:0"><div style="flex:1 1 auto;min-width:0"><p class="eyebrow">Sources</p><div class="sources">' + rows.join("") + "</div></div>" +
      '<div style="flex:0 0 360px;text-align:center"><div class="qr sm" style="margin:60px auto 20px">' + qrSVG(ctx.sourcesURL) + '</div><div class="body" style="font-size:40px">All sources</div></div></div>', "sources");
  }

  // A ready-made image shown as its own slide, e.g. the gala flyer.
  // Shows until im.until (Atlanta time, "YYYY-MM-DDTHH:MM"), if set.
  function imageSlide(im) {
    return function (ctx) {
      if (!im || !im.src) return null;
      if (im.until && ctx.now() >= T.parseLocal(im.until)) return null;
      return el('<div class="imgslide"><img src="' + esc(im.src) + '" alt="' + esc(im.alt || "") + '"></div>', "image");
    };
  }
  var ICONS = {
    calendar: '<rect x="4" y="6" width="24" height="22" rx="4"/><path d="M4 13h24M11 3v6M21 3v6"/><circle cx="11" cy="19" r="1.4"/><circle cx="16" cy="19" r="1.4"/><circle cx="21" cy="19" r="1.4"/><circle cx="11" cy="24" r="1.4"/><circle cx="16" cy="24" r="1.4"/>',
    pin: '<path d="M16 29s-9-9.2-9-16a9 9 0 0 1 18 0c0 6.8-9 16-9 16z"/><circle cx="16" cy="13" r="3.4"/>',
    bus: '<rect x="6" y="4" width="20" height="21" rx="4"/><path d="M6 15h20M10 25v3M22 25v3"/><circle cx="11" cy="20" r="1.4"/><circle cx="21" cy="20" r="1.4"/>',
    ticket: '<path d="M5 11a3 3 0 0 0 0 6v6h22v-6a3 3 0 0 1 0-6V5H5z" transform="rotate(-30 16 16)"/>',
    mic: '<rect x="12" y="4" width="8" height="15" rx="4"/><path d="M8 15a8 8 0 0 0 16 0M16 23v5M11 28h10"/>',
  };
  function icon(name) {
    return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }
  // Gala slide built from the organizers' art, with our own text.
  function buildGala(ctx) {
    var g = ctx.stats && ctx.stats.gala;
    if (!g) return null;
    if (g.until && ctx.now() >= T.parseLocal(g.until)) return null;
    var k = g.keynote, sp = g.sponsor;
    var rows = (g.rows || []).map(function (r) {
      return '<div class="g-row"><div class="g-ic">' + icon(r.icon) + '</div><div class="g-tx">' + esc(r.text) + (r.hi ? '<span class="cyan"> ' + esc(r.hi) + "</span>" : "") + "</div></div>";
    }).join("");
    var kn = k ? '<div class="g-kn"><img class="g-face" src="' + esc(k.photo) + '" alt=""><div class="g-kt"><div class="g-badge">' + icon("mic") + " Keynote \u00b7 " + esc(k.time) + '</div><div class="g-name">' + esc(k.name) + '</div><div class="g-role">' + esc(k.role) + "</div></div>" +
      (sp ? '<div class="g-sp"><div>' + esc(sp.label) + '</div><img src="' + esc(sp.logo) + '" alt="' + esc(sp.alt || "") + '"></div>' : "") + "</div>" : "";
    return el('<div class="gala"><div class="g-left">' + (g.eyebrow ? '<p class="eyebrow">' + esc(g.eyebrow) + "</p>" : "") + '<h1 class="g-title">' + esc(g.title1) + "<br>" + esc(g.title2a) + '<span class="cyan">' + esc(g.title2b) + "</span></h1>" +
      '<div class="g-rows">' + rows + "</div>" + kn + '</div></div><div class="g-bg"></div><div class="g-art"><img src="' + esc(g.art) + '" alt=""></div>', "gala-slide");
  }
  function setVenues(v) { VENUES = v || {}; }

  root.ShowSlides = {
    buildNow: buildNow, buildPosters: buildPosters, keynotePage: keynotePage, buildTutorials: buildTutorials, buildQR: buildQR,
    statReview: statReview, statAccept: statAccept, statReviews: statReviews, statRatios: statRatios, statProgram: statProgram,
    statThemes: statThemes, statWords: statWords, statReg: statReg, statRegions: statRegions,
    committee: committee, buildChairs: buildChairs, buildACs: buildACs, reviewerPage: reviewerPage,
    factSlide: factSlide, triviaQ: triviaQ, triviaA: triviaA, buildSources: buildSources,
    tickCountdown: tickCountdown, setVenues: setVenues, imageSlide: imageSlide, buildGala: buildGala, qrSVG: qrSVG,
  };
})(this);
