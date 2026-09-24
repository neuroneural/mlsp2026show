/* Small shared helpers: text cleanup, title case, word counts. */
(function (root) {
  "use strict";

  var SMALL = "a an and as at but by for from in into of on or over per the to under via vs with without".split(" ");
  var SPECIAL = {
    CNN: "CNN", ECG: "ECG", EMG: "EMG", EEG: "EEG", SSA: "SSA", RF: "RF", FNIRS: "fNIRS", MRI: "MRI", FMRI: "fMRI",
    "CNN-BILSTM": "CNN-BiLSTM", BILSTM: "BiLSTM", "X-RAY": "X-Ray", C2A: "C2A", DYLNC: "DyLNC", LISTEN: "LISTEN",
    ALAS: "ALAS", CARD: "CARD", COGNITIVETWIN: "CognitiveTwin", "ALZHEIMER'S": "Alzheimer's", LLM: "LLM", LLMS: "LLMs",
    AI: "AI", ML: "ML", GNN: "GNN", "3D": "3D", "2D": "2D", "MULTI-MODAL": "Multi-Modal",
  };
  function capWord(w, first) {
    var key = w.replace(/[:?,.]+$/, "");
    var tail = w.slice(key.length);
    if (SPECIAL[key]) return SPECIAL[key] + tail;
    if (key.indexOf("-") > 0) {
      return key.split("-").map(function (p, i) { return capWord(p, first && i === 0); }).join("-") + tail;
    }
    var lw = key.toLowerCase();
    if (!first && SMALL.indexOf(lw) >= 0) return lw + tail;
    return lw.charAt(0).toUpperCase() + lw.slice(1) + tail;
  }
  // Only rewrite titles typed in ALL CAPS.
  function smartTitle(t) {
    t = String(t || "").replace(/\s+/g, " ").trim();
    if (/[a-z]/.test(t)) return t;
    var words = t.split(" "), prevColon = true;
    return words.map(function (w) {
      var out = capWord(w, prevColon);
      prevColon = /[:?]$/.test(w);
      return out;
    }).join(" ");
  }

  var THEME_SHORT = {
    "Temporal & Sequential Signal Learning": "Temporal & Sequential",
    "ML for Neuroimaging, Neuroscience and Beyond": "Neuroimaging",
    "Foundation & Generative Models for Signals": "Foundation & Generative",
    "Agentic & Multimodal Learning": "Agentic & Multimodal",
    "Responsible, Causal & Federated Signal Intelligence": "Responsible, Causal & Federated",
    "Other": "Other",
  };
  function shortTheme(t) { return THEME_SHORT[t] || t; }

  function themeCounts(papers) {
    var c = {};
    (papers || []).forEach(function (p) { c[p.theme] = (c[p.theme] || 0) + 1; });
    return Object.keys(c).map(function (k) { return [k, c[k]]; })
      .sort(function (a, b) {
        if (a[0] === "Other") return 1; if (b[0] === "Other") return -1;
        return b[1] - a[1];
      });
  }

  var STOP = ("a an and are as at be by for from in into is it its of on or over that the their this to under up via vs we with without " +
    "learning based using via model models approach approaches toward towards new novel method methods framework frameworks " +
    "analysis study use through across beyond can do does how when what which all one two not than between efficient " +
    "improving improved improve large-scale case").split(" ");
  var PLURAL = { networks: "network", signals: "signal", transformers: "transformer", representations: "representation", graphs: "graph", dynamics: "dynamic", detectors: "detector", radars: "radar", series: "series" };
  function topWords(papers, n) {
    var c = {};
    (papers || []).forEach(function (p) {
      var words = String(p.title || "").toLowerCase()
        .replace(/[‘’]/g, "'")
        .replace(/time[ -]series/g, "time-series")
        .split(/[^a-z0-9'-]+/)
        .map(function (w) { return w.replace(/^[-']+|[-']+$/g, "").replace(/'s$/, ""); })
        .filter(function (w) { return w.length > 2 && STOP.indexOf(w) < 0 && !/^\d+$/.test(w); });
      var seen = {};
      words.forEach(function (w) {
        var k = PLURAL[w] || w;
        if (!seen[k]) { seen[k] = 1; c[k] = (c[k] || 0) + 1; }
      });
    });
    return Object.keys(c).map(function (k) { return [k, c[k]]; })
      .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
      .slice(0, n || 20);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function authorLine(p, max) {
    var names = (p.authors || []).map(function (a) { return smartName(a.name); }).filter(Boolean);
    max = max || 4;
    if (names.length > max) return names.slice(0, max).join(", ") + ", et al.";
    return names.join(", ");
  }

  function smartName(n) {
    n = String(n || "").trim();
    if (/[a-z]/.test(n)) return n;
    return n.toLowerCase().replace(/(^|[\s'-])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  var api = { smartName: smartName, smartTitle: smartTitle, shortTheme: shortTheme, themeCounts: themeCounts, topWords: topWords, esc: esc, authorLine: authorLine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ShowUtil = api;
})(this);
