/*!
 * Atlas Live CSS Editor (mobile-friendly)
 * Repo: AWildBeef/atlas-live-css
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/gh/AWildBeef/atlas-live-css@v1.0.0/live-css.js"></script>
 *   <script>AtlasLiveCSS.init({ queryParam: "livecss", enabledOnParam: true });</script>
 */
 
 (function () {
  function isSameOrigin(sheet) {
    try {
      // accessing cssRules will throw on cross-origin stylesheets
      void sheet.cssRules;
      return true;
    } catch {
      return false;
    }
  }

  function declText(style) {
    // style is CSSStyleDeclaration
    const out = [];
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      const val = style.getPropertyValue(prop);
      const prio = style.getPropertyPriority(prop);
      out.push(`  ${prop}: ${val}${prio ? " !important" : ""};`);
    }
    return out.join("\n");
  }

  function safeMatches(el, selector) {
    // Skip pseudo-elements which always throw
    if (selector.includes("::")) return false;

    // Some selectors can throw (unknown pseudo-class etc). Just ignore them.
    try {
      return el.matches(selector);
    } catch {
      return false;
    }
  }

  function ruleMatchesEl(rule, el) {
    const sel = rule.selectorText;
    if (!sel) return false;

    // selectorText can be "a, b, c" – test each part
    const parts = sel.split(",").map(s => s.trim()).filter(Boolean);
    return parts.some(s => safeMatches(el, s));
  }

  async function copyMatchedRules(el, opts = {}) {
    const {
      include = [/style\.css(\?|$)/i],  // regex list to include sheets by href (default: style.css)
      exclude = [],                    // regex list to exclude
      includeInline = true,            // also include <style> blocks (href == null)
      maxRules = 200,                  // safety cap
    } = opts;

    if (!el) throw new Error("copyMatchedRules(el): element is required");

    const chunks = [];
    let count = 0;

    for (const sheet of Array.from(document.styleSheets)) {
      if (!isSameOrigin(sheet)) continue;

      const href = sheet.href || "";
      const isInline = !sheet.href;

      if (!includeInline && isInline) continue;

      if (!isInline) {
        if (exclude.some(r => r.test(href))) continue;
        if (include.length && !include.some(r => r.test(href))) continue;
      }

      for (const rule of Array.from(sheet.cssRules)) {
        if (count >= maxRules) break;

        // Only normal style rules (ignore @media for now; see note below)
        if (rule.type !== CSSRule.STYLE_RULE) continue;

        if (ruleMatchesEl(rule, el)) {
          const body = declText(rule.style);
          if (body.trim()) {
            chunks.push(`${rule.selectorText} {\n${body}\n}`);
            count++;
          }
        }
      }
    }

    const out = chunks.join("\n\n") || "/* No matching STYLE_RULE rules found (or sheet not accessible). */";
    await navigator.clipboard.writeText(out);
    return out;
  }

  // Expose globally (nice for Eruda console)
  window.copyMatchedRules = copyMatchedRules;
})();

(function () {
  const DEFAULTS = {
    // Enable conditions
    enabledByDefault: false,       // always on (not recommended for prod)
    enabledOnLocalhost: true,      // auto-enable on localhost
    enabledOnParam: true,          // enable with ?livecss=1
    queryParam: "livecss",         // param name

    // Storage keys (per-project override recommended)
    storageKey: "atlas_live_css_v1",
    storagePosKey: "atlas_live_css_pos_v1",
    storageSizeKey: "atlas_live_css_size_v1",
    storageOpenKey: "atlas_live_css_open_v1",

    // UI
    fabText: "🎨",
    titleText: "Live CSS",
    minWidth: 240,
    minHeight: 180,
    maxWidthPct: 0.95,
    maxHeightPct: 0.75,

    // Helpers
    threeFingerOpen: true,
    startOpen: false,              // only used if no saved open state
  };

  function truthyParam(val) {
    if (val == null) return false;
    const s = String(val).toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  }

  function shouldEnable(cfg) {
    if (cfg.enabledByDefault) return true;
    const isLocal =
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname === "[::1]";
    if (cfg.enabledOnLocalhost && isLocal) return true;

    if (cfg.enabledOnParam) {
      const params = new URLSearchParams(location.search);
      if (params.has(cfg.queryParam)) return truthyParam(params.get(cfg.queryParam));
    }
    return false;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function cssEscape(s) {
    return (s || "").replace(/[^\w-]/g, "_");
  }

  function init(userCfg = {}) {
    const cfg = { ...DEFAULTS, ...userCfg };

    // If not enabled, bail early
    if (!shouldEnable(cfg)) return;

    const LS_KEY = cfg.storageKey;
    const LS_POS = cfg.storagePosKey;
    const LS_SIZE = cfg.storageSizeKey;
    const LS_OPEN = cfg.storageOpenKey;

    // Inject live style tag (override layer)
    const styleTag = document.createElement("style");
    styleTag.id = "atlas-live-css-style-" + cssEscape(LS_KEY);
    document.head.appendChild(styleTag);

    // Root overlay
    const wrap = document.createElement("div");
    wrap.id = "atlas-live-css";
    wrap.innerHTML = `
      <button class="alc-fab" type="button" aria-label="Open CSS editor">${cfg.fabText}</button>
      <div class="alc-panel" role="dialog" aria-label="Live CSS editor">
        <div class="alc-bar">
          <div class="alc-title">${cfg.titleText}</div>
          <div class="alc-actions">
            <button class="alc-btn" data-act="copy" type="button">Copy</button>
            <button class="alc-btn" data-act="reset-css" type="button">Reset CSS</button>
            <button class="alc-btn" data-act="reset-ui" type="button">Reset UI</button>
            <button class="alc-btn" data-act="close" type="button">✕</button>
          </div>
        </div>
        <textarea class="alc-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"
          placeholder="Paste CSS here…"></textarea>
        <div class="alc-hint">Saved on this device (localStorage). Add <b>?${cfg.queryParam}=1</b> to enable.</div>
        <div class="alc-resize" aria-hidden="true"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    // Overlay CSS (isolated + high z-index)
    const overlayCss = document.createElement("style");
    overlayCss.textContent = `
      #atlas-live-css{
        position:fixed;
        inset:auto 14px 14px auto;
        z-index:2147483647;
        font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        -webkit-font-smoothing: antialiased;
        user-select:none;
        touch-action:none;
      }
      #atlas-live-css *{ box-sizing:border-box; }

      #atlas-live-css .alc-fab{
        width:46px;height:46px;border-radius:14px;
        border:1px solid rgba(255,255,255,.18);
        background:rgba(30,30,30,.88);
        color:#fff;font-size:18px;
        box-shadow: 0 10px 26px rgba(0,0,0,.45);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;
        touch-action:manipulation;
      }
      #atlas-live-css .alc-fab:active{ transform: translateY(1px); }

      #atlas-live-css .alc-panel{
        position:absolute;
        right:0;
        bottom:56px;
        width:min(92vw, 420px);
        height:min(55vh, 420px);
        display:none;
        border-radius:14px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(20,22,25,.92);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        box-shadow: 0 16px 40px rgba(0,0,0,.6);
        overflow:hidden;
        touch-action:none;
      }
      #atlas-live-css.is-open .alc-panel{ display:flex; flex-direction:column; }
      #atlas-live-css.is-open .alc-fab{ opacity:.95; }

      #atlas-live-css .alc-bar{
        display:flex; align-items:center; justify-content:space-between;
        gap:10px;
        padding:10px 10px;
        border-bottom:1px solid rgba(255,255,255,.10);
        cursor:grab;
        touch-action:none;
      }
      #atlas-live-css.dragging .alc-bar{ cursor:grabbing; }
      #atlas-live-css .alc-title{
        color:rgba(255,255,255,.85);
        font-weight:650;
        letter-spacing:.2px;
        font-size:13px;
      }
      #atlas-live-css .alc-actions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      #atlas-live-css .alc-btn{
        padding:6px 9px;
        border-radius:10px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(0,0,0,.22);
        color:#fff;
        font-size:12px;
        cursor:pointer;
        touch-action:manipulation;
      }

      #atlas-live-css .alc-ta{
        flex:1 1 auto;
        width:100%;
        padding:10px;
        border:0;
        outline:none;
        resize:none;
        background:rgba(0,0,0,.22);
        color:rgba(255,255,255,.92);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size:12px;
        line-height:1.35;
        -webkit-text-size-adjust: 100%;
        touch-action:manipulation;
      }
      #atlas-live-css .alc-hint{
        padding:8px 10px;
        font-size:11px;
        color:rgba(255,255,255,.55);
        border-top:1px solid rgba(255,255,255,.08);
      }

      #atlas-live-css .alc-resize{
        position:absolute;
        right:0; bottom:0;
        width:22px; height:22px;
        cursor:nwse-resize;
        background: linear-gradient(135deg, transparent 55%, rgba(255,255,255,.18) 56%, rgba(255,255,255,.18) 70%, transparent 71%);
        touch-action:none;
      }

      /* iOS zoom prevention: textarea focus font >= 16px */
      @supports (-webkit-touch-callout: none){
        #atlas-live-css .alc-ta:focus{ font-size:16px; }
      }
    `;
    document.head.appendChild(overlayCss);

    const fab = wrap.querySelector(".alc-fab");
    const panel = wrap.querySelector(".alc-panel");
    const ta = wrap.querySelector(".alc-ta");
    const bar = wrap.querySelector(".alc-bar");
    const handle = wrap.querySelector(".alc-resize");

    // Load saved CSS
    const saved = localStorage.getItem(LS_KEY) || "";
    ta.value = saved;
    styleTag.textContent = saved;

    // Open state (saved beats default)
    const openSaved = localStorage.getItem(LS_OPEN);
    if (openSaved === "1" || (openSaved == null && cfg.startOpen)) {
      wrap.classList.add("is-open");
    }

    // Restore position / size
    (function applyPos() {
      const raw = localStorage.getItem(LS_POS);
      if (!raw) return;
      try {
        const { right, bottom } = JSON.parse(raw);
        wrap.style.right = right;
        wrap.style.bottom = bottom;
        wrap.style.left = "auto";
        wrap.style.top = "auto";
      } catch {}
    })();

    (function applySize() {
      const raw = localStorage.getItem(LS_SIZE);
      if (!raw) return;
      try {
        const { w, h } = JSON.parse(raw);
        panel.style.width = w;
        panel.style.height = h;
      } catch {}
    })();

    function setOpen(isOpen) {
      wrap.classList.toggle("is-open", isOpen);
      localStorage.setItem(LS_OPEN, isOpen ? "1" : "0");
    }

    // Toggle open
    fab.addEventListener("click", () => setOpen(!wrap.classList.contains("is-open")));

    // Live apply
    ta.addEventListener("input", () => {
      const v = ta.value;
      styleTag.textContent = v;
      localStorage.setItem(LS_KEY, v);
    });

    // Buttons
    wrap.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");
      if (act === "close") setOpen(false);

      if (act === "reset-css") {
        ta.value = "";
        styleTag.textContent = "";
        localStorage.removeItem(LS_KEY);
      }

      if (act === "reset-ui") {
        // position + size + open state reset
        localStorage.removeItem(LS_POS);
        localStorage.removeItem(LS_SIZE);
        localStorage.removeItem(LS_OPEN);
        wrap.style.right = "14px";
        wrap.style.bottom = "14px";
        panel.style.width = "";
        panel.style.height = "";
        wrap.classList.remove("is-open");
      }

      if (act === "copy") {
        try {
          await navigator.clipboard.writeText(ta.value);
          btn.textContent = "Copied!";
          setTimeout(() => (btn.textContent = "Copy"), 900);
        } catch {
          ta.focus();
          ta.select();
          document.execCommand("copy");
          btn.textContent = "Copied!";
          setTimeout(() => (btn.textContent = "Copy"), 900);
        }
      }
    });

    // Stop gestures from hitting Leaflet / page behind it
    ["touchstart","touchmove","touchend","pointerdown","pointermove","pointerup","wheel"].forEach(evt => {
      wrap.addEventListener(evt, (e) => {
        e.stopPropagation();
      }, { passive: false });
    });

    // Drag widget by bar (anchored to right/bottom)
    let drag = null;
    bar.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      wrap.classList.add("dragging");
      wrap.setPointerCapture(e.pointerId);

      const rect = wrap.getBoundingClientRect();
      drag = {
        startX: e.clientX,
        startY: e.clientY,
        startRight: window.innerWidth - rect.right,
        startBottom: window.innerHeight - rect.bottom
      };
    });

    window.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      let right = drag.startRight - dx;
      let bottom = drag.startBottom - dy;

      right = clamp(right, 6, window.innerWidth - 56);
      bottom = clamp(bottom, 6, window.innerHeight - 56);

      wrap.style.right = right + "px";
      wrap.style.bottom = bottom + "px";
      wrap.style.left = "auto";
      wrap.style.top = "auto";
    }, { passive: false });

    window.addEventListener("pointerup", () => {
      if (!drag) return;
      wrap.classList.remove("dragging");
      localStorage.setItem(LS_POS, JSON.stringify({
        right: wrap.style.right || "14px",
        bottom: wrap.style.bottom || "14px"
      }));
      drag = null;
    });

    // Resize panel
    let resize = null;
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      wrap.setPointerCapture(e.pointerId);

      const r = panel.getBoundingClientRect();
      resize = { startX: e.clientX, startY: e.clientY, startW: r.width, startH: r.height };
    });

    window.addEventListener("pointermove", (e) => {
      if (!resize) return;
      const dx = e.clientX - resize.startX;
      const dy = e.clientY - resize.startY;

      let w = resize.startW + dx;
      let h = resize.startH + dy;

      w = clamp(w, cfg.minWidth, window.innerWidth * cfg.maxWidthPct);
      h = clamp(h, cfg.minHeight, window.innerHeight * cfg.maxHeightPct);

      panel.style.width = w + "px";
      panel.style.height = h + "px";
    }, { passive: false });

    window.addEventListener("pointerup", () => {
      if (!resize) return;
      localStorage.setItem(LS_SIZE, JSON.stringify({
        w: panel.style.width || "420px",
        h: panel.style.height || "420px"
      }));
      resize = null;
    });

    // Optional: 3-finger open
    if (cfg.threeFingerOpen) {
      window.addEventListener("touchstart", (e) => {
        if (e.touches && e.touches.length === 3) setOpen(true);
      }, { passive: true });
    }

    // Expose helpers
    return {
      open: () => setOpen(true),
      close: () => setOpen(false),
      resetCSS: () => {
        ta.value = "";
        styleTag.textContent = "";
        localStorage.removeItem(LS_KEY);
      },
      resetUI: () => {
        localStorage.removeItem(LS_POS);
        localStorage.removeItem(LS_SIZE);
        localStorage.removeItem(LS_OPEN);
        wrap.style.right = "14px";
        wrap.style.bottom = "14px";
        panel.style.width = "";
        panel.style.height = "";
        wrap.classList.remove("is-open");
      },
      getCSS: () => ta.value,
      setCSS: (css) => {
        ta.value = css || "";
        styleTag.textContent = ta.value;
        localStorage.setItem(LS_KEY, ta.value);
      }
    };
  }

  // Global API
  window.AtlasLiveCSS = {
    init(cfg) {
      // prevent double-init
      if (window.__atlasLiveCssInitialized) return;
      window.__atlasLiveCssInitialized = true;
      window.__atlasLiveCssApi = init(cfg) || null;
      return window.__atlasLiveCssApi;
    }
  };
})();
