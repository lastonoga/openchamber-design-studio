// The in-page probe for the verifying harness.
//
// Why it lives here and why it is a plain string: it is installed with
// `Page.addScriptToEvaluateOnNewDocument` BEFORE navigation, so it must be a
// self-contained classic script — no imports, no ESM, nothing from the host.
// Keeping the source of truth in this module stops the panel and the service
// copies from drifting (same reason as shared/bridge-script.ts).
//
// It reports raw facts only (rects, computed styles, CLS); the gates in later
// lanes are what decide whether a fact is a finding.
export const PROBE_SCRIPT = String.raw`(function () {
  'use strict';

  // Layout-shift is cumulative over the page's life, so we keep the running
  // total on window and let __dsProbe read it whenever it is called.
  if (typeof window.__dsCls !== 'number') window.__dsCls = 0;
  try {
    var clsObserver = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        // Shifts the user caused (hover, click) are not layout instability.
        if (entry.hadRecentInput) continue;
        window.__dsCls += entry.value || 0;
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch (e) {
    // PerformanceObserver may be absent or reject the buffered layout-shift
    // option; CLS then simply stays 0 rather than breaking the load.
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (ch) { return '\\' + ch; });
  }

  // id wins outright; otherwise an nth-of-type path capped at 6 levels. Same
  // deterministic approach as service/browser.ts PICK_SCRIPT so selectors match.
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + cssEscape(el.id);
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var index = 0, count = 0;
        for (var i = 0; i < parent.children.length; i++) {
          var child = parent.children[i];
          if (child.tagName === node.tagName) {
            count++;
            if (child === node) index = count;
          }
        }
        if (count > 1) tag += ':nth-of-type(' + index + ')';
      }
      parts.unshift(tag);
      depth++;
      if (node.id) { parts[0] = '#' + cssEscape(node.id); break; }
      node = parent;
    }
    return parts.join(' > ');
  }

  // Accessible name, best-effort: aria-label beats a wrapping <label> beats
  // placeholder beats visible text.
  function labelFor(el) {
    var aria = el.getAttribute('aria-label');
    if (aria) return aria;
    if (el.id) {
      var forLabel = document.querySelector('label[for="' + cssEscape(el.id) + '"]');
      if (forLabel && forLabel.textContent) return forLabel.textContent.replace(/\s+/g, ' ').trim();
    }
    var wrapping = el.closest ? el.closest('label') : null;
    if (wrapping && wrapping.textContent) return wrapping.textContent.replace(/\s+/g, ' ').trim();
    var placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder;
    return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function describe(el) {
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var item = {
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      label: labelFor(el),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      styles: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        display: cs.display,
        position: cs.position
      }
    };
    if (el.getAttribute('aria-hidden') === 'true') item.ariaHidden = true;
    if (el.tagName === 'IMG') item.hasAlt = el.hasAttribute('alt');
    if (/^H[1-6]$/.test(el.tagName)) item.headingLevel = parseInt(el.tagName.charAt(1), 10);
    if (typeof el.tabIndex === 'number') item.tabIndex = el.tabIndex;
    return item;
  }

  var INTERACTIVE = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]';

  // The live window's pick feedback (service/browser.ts) paints a transient
  // outline marked data-ds-overlay. It is ours, not the page's: skip it and
  // anything nested under it so gates never see a highlight as a real element.
  function isDsOverlay(el) {
    return !!(el && el.nodeType === 1 && el.closest && el.closest('[data-ds-overlay]'));
  }

  function collect() {
    var out = [];
    var seen = new Set();
    function add(el) {
      if (!el || el.nodeType !== 1 || seen.has(el) || isDsOverlay(el)) return;
      seen.add(el);
      out.push(describe(el));
    }

    var i;
    var interactives = document.querySelectorAll(INTERACTIVE);
    for (i = 0; i < interactives.length; i++) add(interactives[i]);

    var headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (i = 0; i < headings.length; i++) add(headings[i]);

    var images = document.querySelectorAll('img');
    for (i = 0; i < images.length; i++) add(images[i]);

    // Anything whose box hangs past the document width is the raw material for
    // the overflow gate; keep its selector and rect so the gate can name it.
    var doc = document.documentElement;
    var docWidth = Math.max(doc ? doc.clientWidth : 0, window.innerWidth || 0);
    var all = document.body ? document.querySelectorAll('*') : [];
    for (i = 0; i < all.length; i++) {
      if (isDsOverlay(all[i])) continue;
      var rect = all[i].getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > docWidth + 1 || rect.left < -1) add(all[i]);
    }

    return out;
  }

  window.__dsProbe = function () {
    var doc = document.documentElement;
    return JSON.stringify({
      scrollWidth: doc ? doc.scrollWidth : 0,
      clientWidth: doc ? doc.clientWidth : 0,
      innerWidth: window.innerWidth || 0,
      innerHeight: window.innerHeight || 0,
      scrollHeight: doc ? doc.scrollHeight : 0,
      cls: window.__dsCls || 0,
      selectors: collect()
    });
  };
})();`;

/** The CDP `Runtime.evaluate` expression that calls the probe and yields its JSON. */
export const PROBE_EXPR = 'window.__dsProbe ? window.__dsProbe() : null';
