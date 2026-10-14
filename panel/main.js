"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // node_modules/@openchamber/sdk/dist/ui/theme.js
  var TOKEN_VARS = [
    ["--oc-bg", "background"],
    ["--oc-elevated", "elevated"],
    ["--oc-fg", "foreground"],
    ["--oc-muted", "muted"],
    ["--oc-subtle", "subtle"],
    ["--oc-border", "border"],
    ["--oc-hover", "hover"],
    ["--oc-selection", "selection"],
    ["--oc-focus", "focus"],
    ["--oc-primary", "primary"],
    ["--oc-muted-surface", "mutedSurface"],
    ["--oc-elevated-fg", "elevatedForeground"],
    ["--oc-active", "active"],
    ["--oc-selection-fg", "selectionForeground"],
    ["--oc-primary-fg", "primaryForeground"],
    ["--oc-primary-text", "primaryText"],
    ["--oc-success-text", "successText"],
    ["--oc-warning-text", "warningText"],
    ["--oc-error-text", "errorText"],
    ["--oc-info-text", "infoText"],
    ["--oc-success", "success"],
    ["--oc-warning", "warning"],
    ["--oc-error", "error"],
    ["--oc-info", "info"],
    ["--oc-font", "font"],
    ["--oc-mono", "mono"],
    ["--oc-radius", "radius"],
    ["--surface-background", "background"],
    ["--surface-elevated", "elevated"],
    ["--surface-foreground", "foreground"],
    ["--surface-muted-foreground", "muted"],
    ["--surface-subtle", "subtle"],
    ["--interactive-border", "border"],
    ["--interactive-hover", "hover"],
    ["--interactive-selection", "selection"],
    ["--interactive-focus-ring", "focus"],
    ["--primary", "primary"],
    ["--surface-muted", "mutedSurface"],
    ["--surface-elevated-foreground", "elevatedForeground"],
    ["--interactive-active", "active"],
    ["--interactive-selection-foreground", "selectionForeground"],
    ["--primary-foreground", "primaryForeground"],
    ["--primary-text", "primaryText"],
    ["--success-text", "successText"],
    ["--warning-text", "warningText"],
    ["--error-text", "errorText"],
    ["--info-text", "infoText"],
    ["--status-success", "success"],
    ["--status-warning", "warning"],
    ["--status-error", "error"],
    ["--status-info", "info"],
    ["--font-sans", "font"],
    ["--font-mono", "mono"],
    ["--radius", "radius"]
  ];
  var SYNTAX_TOKEN_VARS = [
    ["--oc-syntax-keyword", "--syntax-keyword", "syntaxKeyword"],
    ["--oc-syntax-string", "--syntax-string", "syntaxString"],
    ["--oc-syntax-number", "--syntax-number", "syntaxNumber"],
    ["--oc-syntax-function", "--syntax-function", "syntaxFunction"],
    ["--oc-syntax-type", "--syntax-type", "syntaxType"],
    ["--oc-syntax-comment", "--syntax-comment", "syntaxComment"],
    ["--oc-syntax-variable", "--syntax-variable", "syntaxVariable"],
    ["--oc-syntax-operator", "--syntax-operator", "syntaxOperator"]
  ];
  var applyHostTheme = (theme, root) => {
    root.style.colorScheme = theme.mode;
    for (const [name, key] of TOKEN_VARS) {
      root.style.setProperty(name, theme.tokens[key]);
    }
    for (const [alias, hostName, key] of SYNTAX_TOKEN_VARS) {
      const value = theme.tokens[key] ?? "";
      root.style.setProperty(alias, value);
      root.style.setProperty(hostName, value);
    }
    root.style.setProperty("font-family", theme.tokens.font);
    root.style.setProperty("font-size", "0.875rem");
    root.style.setProperty("line-height", "1.45");
    root.style.setProperty("color", theme.tokens.foreground);
  };
  var applyHostReady = (ctx, root) => {
    applyHostTheme(ctx.theme, root);
    if (root.dataset) {
      root.dataset.ocSurface = ctx.surface;
      root.dataset.ocTheme = ctx.theme.mode;
    }
  };

  // node_modules/@openchamber/sdk/dist/scrollbar-style.js
  var GUEST_SCROLLING_ATTRIBUTE = "data-oc-scrolling";
  var GUEST_SCROLLBAR_CSS = `
:root {
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 40%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 65%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${GUEST_SCROLLING_ATTRIBUTE}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${GUEST_SCROLLING_ATTRIBUTE}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;
  function installGuestScrollbarActivity(doc) {
    const root = doc.documentElement;
    if (root.hasAttribute("data-oc-scrollbar-activity"))
      return;
    root.setAttribute("data-oc-scrollbar-activity", "");
    const timers = /* @__PURE__ */ new WeakMap();
    doc.addEventListener("scroll", (event) => {
      const target = event.target === doc ? root : event.target;
      if (!(target instanceof Element))
        return;
      if (!target.hasAttribute("data-oc-scrolling"))
        target.setAttribute("data-oc-scrolling", "");
      const pending = timers.get(target);
      if (pending !== void 0)
        clearTimeout(pending);
      timers.set(target, setTimeout(() => {
        timers.delete(target);
        target.removeAttribute("data-oc-scrolling");
      }, 1e3));
    }, { capture: true, passive: true });
  }
  var GUEST_SCROLLBAR_SCRIPT = `(${installGuestScrollbarActivity.toString()})(document);`;

  // node_modules/@openchamber/sdk/dist/ui/style.js
  var OC_ALIAS = {
    "surface-background": "bg",
    "surface-elevated": "elevated",
    "surface-elevated-foreground": "elevated-fg",
    "surface-foreground": "fg",
    "surface-muted-foreground": "muted",
    "surface-muted": "muted-surface",
    "surface-subtle": "subtle",
    "interactive-border": "border",
    "interactive-hover": "hover",
    "interactive-active": "active",
    "interactive-selection": "selection",
    "interactive-selection-foreground": "selection-fg",
    "interactive-focus-ring": "focus",
    "primary": "primary",
    "primary-foreground": "primary-fg",
    "primary-text": "primary-text",
    "success-text": "success-text",
    "warning-text": "warning-text",
    "error-text": "error-text",
    "info-text": "info-text",
    "status-success": "success",
    "status-warning": "warning",
    "status-error": "error",
    "status-info": "info",
    "font-sans": "font",
    "font-mono": "mono",
    "radius": "radius"
  };
  var v = (name, fallback) => `var(--${name}, var(--oc-${OC_ALIAS[name]}, ${fallback}))`;
  var bg = v("surface-background", "transparent");
  var elevated = v("surface-elevated", "transparent");
  var elevatedFg = v("surface-elevated-foreground", "inherit");
  var fg = v("surface-foreground", "inherit");
  var muted = v("surface-muted-foreground", "gray");
  var secondary = v("surface-muted", "transparent");
  var border = v("interactive-border", "currentColor");
  var hover = v("interactive-hover", "transparent");
  var active = v("interactive-active", "transparent");
  var selection = v("interactive-selection", "transparent");
  var selectionFg = v("interactive-selection-foreground", "inherit");
  var focus = v("interactive-focus-ring", "currentColor");
  var primary = v("primary", "currentColor");
  var primaryText = v("primary-text", "inherit");
  var errorText = v("error-text", "inherit");
  var font = v("font-sans", "inherit");
  var mono = v("font-mono", "monospace");
  var radius = v("radius", "9px");
  var mix = (color, pct, base = "transparent") => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
  var focusRing = `box-shadow: 0 0 0 2px ${focus};`;
  var tone = (name) => {
    const color = v(`status-${name}`, "currentColor");
    return `
.oc-sdk[data-tone="${name}"], .oc-sdk [data-tone="${name}"] { --oc-sdk-tone: ${color}; --oc-sdk-tone-text: ${v(`${name}-text`, "inherit")}; }`;
  };
  var UI_CSS = `
${GUEST_SCROLLBAR_CSS}
.oc-sdk { box-sizing: border-box; color: ${fg}; font-family: ${font}; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }
.oc-sdk :focus-visible { outline: none; ${focusRing} }
.oc-sdk-mono { font-family: ${mono}; }
.oc-sdk-muted { color: ${muted}; }
${tone("success")}${tone("warning")}${tone("error")}${tone("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${primary}; --oc-sdk-tone-text: ${primaryText}; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border: 1px solid transparent; border-radius: ${radius}; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="sm"] { height: 32px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { height: 24px; padding: 0 8px; font-size: 0.75rem; border-radius: 6px; }
.oc-sdk-btn[data-variant="default"] { color: ${primaryText}; background: ${mix(primary, 10, bg)}; border-color: ${mix(primary, 12)}; }
.oc-sdk-btn[data-variant="default"]:hover { background: ${mix(primary, 16, bg)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${mix(primary, 22, bg)}; }
.oc-sdk-btn[data-variant="secondary"] { background: ${secondary}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-btn[data-variant="outline"] { background: ${elevated}; color: ${elevatedFg}; border-color: ${border}; }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${hover}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${active}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${v("status-error", "red")}; color: ${errorText}; background: ${mix("var(--oc-sdk-tone)", 7, bg)}; border-color: ${mix("var(--oc-sdk-tone)", 12)}; }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${mix("var(--oc-sdk-tone)", 9, bg)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${mix("var(--oc-sdk-tone)", 11, bg)}; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; color: ${muted}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${errorText}; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 36px; padding: 0 12px; border: 0; border-radius: ${radius}; background: ${elevated}; color: ${elevatedFg}; font-size: 0.875rem; line-height: 1.45; appearance: none; box-shadow: inset 0 0 0 1px ${mix(border, 60)}; transition: background 150ms ease-out, box-shadow 150ms ease-out; }
textarea.oc-sdk-input { height: auto; padding: 8px 12px; resize: vertical; }
.oc-sdk-input::placeholder { color: ${muted}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { box-shadow: inset 0 0 0 2px ${focus}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input { box-shadow: inset 0 0 0 1px ${v("status-error", "red")}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { box-shadow: inset 0 0 0 2px ${v("status-error", "red")}; }
.oc-sdk-input[data-mono="true"] { font-family: ${mono}; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: ${muted}; pointer-events: none; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${primary}; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; color: ${muted}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }
.oc-sdk-search-clear:hover { background: ${hover}; color: ${fg}; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; width: 100%; min-width: 0; height: 32px; padding: 0 8px 0 10px; border: 1px solid ${border}; border-radius: 6px; background: ${elevated}; color: ${elevatedFg}; font-size: 0.8125rem; text-align: left; transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-value[data-empty="true"] { color: ${muted}; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; color: ${muted}; }
.oc-sdk-popup { --surface-foreground: ${elevatedFg}; position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid ${mix(border, 60)}; border-radius: 12px; background: ${elevated}; color: ${elevatedFg}; box-shadow: 0 8px 24px ${mix(fg, 12)}; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 32px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option[data-active="true"] { background: ${hover}; }
.oc-sdk-option[aria-selected="true"] { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-option[data-destructive="true"] { color: ${errorText}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${mix(v("status-error", "red"), 10)}; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; color: ${muted}; }
.oc-sdk-option-check { flex: 0 0 auto; width: 12px; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; color: ${muted}; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid ${border}; border-radius: 4px; color: ${primary}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${mix(primary, 65, border)}; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; border-radius: 9999px; background: ${border}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 9999px; background: ${bg}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${primary}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${focusRing} }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; color: ${muted}; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; max-width: 100%; overflow: auto; }
.oc-sdk-tabs[data-track="true"] { background: ${mix(fg, 4)}; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; font-size: 0.8125rem; font-weight: 500; color: ${muted}; white-space: nowrap; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${fg}; }
.oc-sdk-tab[aria-selected="true"] { color: ${selectionFg}; background: ${selection}; border-color: ${border}; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; color: ${muted}; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 9999px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; background: ${hover}; color: ${muted}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${mix("var(--oc-sdk-tone)", 15)}; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 6px; text-align: left; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${hover}; }
.oc-sdk-row[aria-selected="true"] { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ${mono}; font-size: 0.75rem; color: ${muted}; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: ${muted}; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; color: ${muted}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; color: ${muted}; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; color: ${muted}; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; color: ${muted}; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid ${border}; border-top-color: ${primary}; border-radius: 9999px; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid ${mix("var(--oc-sdk-tone)", 40)}; border-radius: 8px; background: ${mix("var(--oc-sdk-tone)", 10)}; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { font-size: 0.8125rem; color: ${muted}; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; color: ${muted}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; background: ${mix(border, 40)}; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; color: ${muted}; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; border-radius: 9999px; background: ${border}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; border-radius: 9999px; background: var(--oc-sdk-tone, ${primary}); transform-origin: left; transition: transform 200ms ease-out; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text a { color: ${primaryText}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; border-radius: 8px; border: 1px solid ${mix(border, 60)}; }
`;

  // node_modules/@openchamber/sdk/dist/api-version.js
  var OPENCHAMBER_SDK_CHANNEL = "openchamber.sdk";
  var OPENCHAMBER_SDK_API_VERSION = 1;

  // node_modules/@openchamber/sdk/dist/workspace.js
  var GUEST_STORAGE_KEY_MAX = 128;
  var GUEST_STORAGE_VALUE_BYTES = 65536;

  // node_modules/@openchamber/sdk/dist/shells.js
  var GUEST_SHELL_ID_MAX = 128;
  var GUEST_SHELL_OUTPUT_TAIL_MAX = 65536;

  // node_modules/@openchamber/sdk/dist/status-controls.js
  var GUEST_STATUS_CONTROLS_MAX = 4;
  var GUEST_STATUS_CONTROL_ID = /^[a-z][a-z0-9-]{0,39}$/;
  var GUEST_STATUS_CONTROL_LABEL_MAX = 60;
  var GUEST_STATUS_CONTROL_OPTIONS_MAX = 16;
  var GUEST_STATUS_CONTROL_VALUE_MAX = 80;
  var isControlObject = (value) => Object(value) === value && !Array.isArray(value);
  var hasOnlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
  var isLabel = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_LABEL_MAX;
  var isValue = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_VALUE_MAX;
  var isGuestStatusControls = (controls) => {
    if (!Array.isArray(controls) || controls.length > GUEST_STATUS_CONTROLS_MAX)
      return false;
    const ids = /* @__PURE__ */ new Set();
    for (const control of controls) {
      if (!isControlObject(control) || !GUEST_STATUS_CONTROL_ID.test(control.id) || !isLabel(control.label))
        return false;
      if (control.disabled !== void 0 && control.disabled !== true && control.disabled !== false)
        return false;
      if (ids.has(control.id))
        return false;
      ids.add(control.id);
      if (control.kind === "button") {
        if (!hasOnlyKeys(control, ["kind", "id", "label", "disabled"]))
          return false;
        continue;
      }
      if (control.kind !== "select" || !hasOnlyKeys(control, ["kind", "id", "label", "value", "options", "disabled"]))
        return false;
      if (!isValue(control.value) || !Array.isArray(control.options) || control.options.length < 1 || control.options.length > GUEST_STATUS_CONTROL_OPTIONS_MAX)
        return false;
      const values = /* @__PURE__ */ new Set();
      for (const option2 of control.options) {
        if (!isControlObject(option2) || !hasOnlyKeys(option2, ["value", "label"]) || !isValue(option2.value) || !isLabel(option2.label) || values.has(option2.value))
          return false;
        values.add(option2.value);
      }
      if (!values.has(control.value))
        return false;
    }
    return true;
  };

  // node_modules/@openchamber/sdk/dist/file-editor.js
  var GUEST_FILE_EDITOR_CONTENT_MAX = 2e7;
  var GUEST_FILE_EDITOR_VERSION_MAX = 256;
  var fileEditorPayloadSize = (value) => "bytes" in value ? value.bytes.byteLength : value.content.length;
  var sameFileEditorDocument = (left, right) => {
    if (left.path !== right.path || left.readOnly !== right.readOnly)
      return false;
    if (left.encoding === "text" || right.encoding === "text") {
      return left.encoding === "text" && right.encoding === "text" && left.content === right.content;
    }
    if (left.bytes.byteLength !== right.bytes.byteLength)
      return false;
    for (let index = 0; index < left.bytes.byteLength; index += 1) {
      if (left.bytes[index] !== right.bytes[index])
        return false;
    }
    return true;
  };

  // node_modules/@openchamber/sdk/dist/popover.js
  var GUEST_POPOVER_ID = /^[A-Za-z0-9_-]{1,80}$/;
  var GUEST_POPOVER_COORDINATE_MAX = 1e5;
  var GUEST_POPOVER_WIDTH_MIN = 160;
  var GUEST_POPOVER_WIDTH_MAX = 640;
  var GUEST_POPOVER_HEIGHT_MIN = 48;
  var GUEST_POPOVER_HEIGHT_MAX = 480;
  var GUEST_POPOVER_DATA_MAX = 16e3;
  var GUEST_POPOVER_DATA_DEPTH_MAX = 32;
  var GUEST_POPOVER_SIDES = ["left", "right", "top", "bottom"];
  var hasBoundedJsonTree = (value, depth = 0, budget = { remaining: GUEST_POPOVER_DATA_MAX }) => {
    if (--budget.remaining < 0 || depth >= GUEST_POPOVER_DATA_DEPTH_MAX)
      return false;
    if (value === null)
      return true;
    const children = Array.isArray(value) ? value : Object(value) === value ? Object.values(value) : [];
    for (const item of children) {
      if (!hasBoundedJsonTree(item, depth + 1, budget))
        return false;
    }
    return true;
  };
  var isFiniteJson = (value) => {
    if (value === null || value === true || value === false)
      return true;
    if (Array.isArray(value))
      return Object.keys(value).every((key) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) && value.every(isFiniteJson);
    if (Object(value) === value) {
      const prototype = Object.getPrototypeOf(value);
      return (prototype === null || prototype === Object.prototype) && Object.values(value).every(isFiniteJson);
    }
    return String(value) === value || Number.isFinite(value);
  };
  var isGuestPopoverRequest = (request) => {
    try {
      if (String(request.id) !== request.id || !GUEST_POPOVER_ID.test(request.id) || !Number.isFinite(request.anchor.x) || Math.abs(request.anchor.x) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.y) || Math.abs(request.anchor.y) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.width) || !Number.isFinite(request.anchor.height) || request.anchor.width <= 0 || request.anchor.height <= 0 || request.anchor.width > GUEST_POPOVER_COORDINATE_MAX || request.anchor.height > GUEST_POPOVER_COORDINATE_MAX || !Number.isInteger(request.width) || request.width < GUEST_POPOVER_WIDTH_MIN || request.width > GUEST_POPOVER_WIDTH_MAX || !Number.isInteger(request.height) || request.height < GUEST_POPOVER_HEIGHT_MIN || request.height > GUEST_POPOVER_HEIGHT_MAX || request.side !== void 0 && !GUEST_POPOVER_SIDES.includes(request.side) || request.focus !== void 0 && request.focus !== true && request.focus !== false || !hasBoundedJsonTree(request.data) || !isFiniteJson(request.data))
        return false;
      return JSON.stringify(request.data).length <= GUEST_POPOVER_DATA_MAX;
    } catch {
      return false;
    }
  };

  // node_modules/@openchamber/sdk/dist/contract.js
  var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
  var isStartSessionResult = (value) => Boolean(value && "sessionId" in value);
  var isPromptResult = (value) => Boolean(value && "sent" in value && !("sessionId" in value));
  var GUEST_COMMIT_SHA = /^[0-9a-f]{7,64}$/i;
  var isGuestCommitSha = (value) => GUEST_COMMIT_SHA.test(value);
  var GUEST_TOAST_MAX = 500;
  var GUEST_CLIPBOARD_TEXT_MAX = 32e3;
  var GUEST_COMPOSE_TEXT_MAX = 16e3;
  var GUEST_ATTACH_ID_MAX = 128;
  var GUEST_ATTACH_TITLE_MAX = 200;
  var GUEST_ATTACH_URL_MAX = 2e3;
  var GUEST_ATTACH_TEXT_MAX = 16e3;
  var GUEST_ATTACH_AUTHOR_MAX = 80;
  var GUEST_ATTACH_BRANCH_MAX = 200;
  var GUEST_ATTACH_DATA_MAX = 16e3;
  var GUEST_REQUEST_PATH_MAX = 2e3;
  var GUEST_REQUEST_TIMEOUT_MS = 2e4;
  var GUEST_FILE_PATH_MAX = 1024;
  var GUEST_FILE_CONTENT_MAX = 2e6;
  var GUEST_GENERATE_PROMPT_MAX = 64e3;
  var GUEST_GENERATE_SYSTEM_MAX = 8e3;
  var GUEST_GENERATE_OUTPUT_TOKENS_MAX = 4e3;
  var GUEST_GENERATE_TIMEOUT_MS = 9e4;
  var GUEST_BADGE_MAX = 999;
  var GUEST_FRAME_HEIGHT_MAX = 1e4;
  var GUEST_RESOLVE_ERROR_MAX = 500;
  var HOST_REQUEST_ERROR_CODES = [
    "HOST_UNAVAILABLE",
    "HOST_TIMEOUT",
    "HOST_REJECTED",
    "DISCONNECTED",
    "DISABLED",
    "BAD_PATH",
    "NO_INTEGRATION",
    "NO_SERVICE",
    "SERVICE_FAILED",
    "NO_SESSION",
    "SESSION_BUSY",
    "NOT_GRANTED",
    "NO_DIRECTORY",
    "NOT_FOUND",
    "FILE_TOO_LARGE",
    "DENIED",
    "NO_MODEL",
    "MODEL_FAILED",
    "UNSUPPORTED"
  ];
  var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
  var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
  var isHostRequestErrorCode = (value) => hostRequestErrorCodeSet.has(value);
  var resolveHostRequestErrorCode = (value) => value && isHostRequestErrorCode(value) ? value : "HOST_REJECTED";
  var isJsonValue = (value) => {
    if (value === void 0)
      return false;
    if (value === null || value === true || value === false)
      return true;
    if (String(value) === value)
      return true;
    if (Number(value) === value)
      return Number.isFinite(value);
    if (Array.isArray(value))
      return value.every(isJsonValue);
    if (Object(value) === value)
      return Object.values(value).every(isJsonValue);
    return false;
  };
  var isAttachData = (value) => isJsonValue(value) && JSON.stringify(value).length <= GUEST_ATTACH_DATA_MAX;
  var clampBranch = (value) => value?.trim().slice(0, GUEST_ATTACH_BRANCH_MAX) ?? "";
  var clampAttachRequest = (request) => {
    const id = request.id.trim().slice(0, GUEST_ATTACH_ID_MAX);
    const title = request.title.trim().slice(0, GUEST_ATTACH_TITLE_MAX);
    const url = request.url.trim().slice(0, GUEST_ATTACH_URL_MAX);
    const text = request.text?.trim().slice(0, GUEST_ATTACH_TEXT_MAX);
    const author = request.author?.trim().slice(0, GUEST_ATTACH_AUTHOR_MAX);
    const kind = request.kind === "pull" ? "pull" : "issue";
    const next = {
      providerId: request.providerId.trim(),
      id,
      title: title || id,
      url,
      kind
    };
    if (text) {
      next.text = text;
    }
    if (author) {
      next.author = author;
    }
    if (kind === "pull") {
      const head = clampBranch(request.branches?.head);
      const base = clampBranch(request.branches?.base);
      if (head && base) {
        next.branches = { head, base };
      }
    }
    if (isAttachData(request.data)) {
      next.data = request.data;
    }
    return next;
  };
  var clampStartSessionRequest = (request) => {
    const next = clampAttachRequest(request);
    if (request.projectId)
      next.projectId = request.projectId;
    if (request.navigation)
      next.navigation = request.navigation;
    if (request.worktree) {
      next.worktree = request.worktree;
    }
    return next;
  };
  var clampPromptRequest = (request) => {
    const next = {
      text: request.text.trim().slice(0, GUEST_COMPOSE_TEXT_MAX)
    };
    if (request.send) {
      next.send = true;
    }
    return next;
  };
  var clampBadgeCount = (count) => {
    if (count === null || !Number.isFinite(count))
      return null;
    return Math.min(GUEST_BADGE_MAX, Math.max(0, Math.round(count)));
  };
  var clampFrameHeight = (height) => {
    if (!Number.isFinite(height))
      return 0;
    return Math.min(GUEST_FRAME_HEIGHT_MAX, Math.max(0, Math.ceil(height)));
  };
  var isGuestFilePath = (value) => value.length > 0 && value.length <= GUEST_FILE_PATH_MAX && !value.includes("\0") && !value.includes("\\");
  var isGuestRequestPath = (value) => {
    if (!value.startsWith("/") || value.includes("\0") || value.includes("\\") || value.includes("://")) {
      return false;
    }
    if (value.length > GUEST_REQUEST_PATH_MAX) {
      return false;
    }
    const segments = value.split("/");
    return !segments.some((segment) => segment === "." || segment === "..");
  };
  var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
  var isServiceStatusResult = (value) => Boolean(value && "status" in value && serviceStatusSet.has(String(value.status)) && !("body" in value));
  var isGuestRequestResult = (value) => Boolean(value && "status" in value && "body" in value && Number.isInteger(value.status));
  var isFileReadResult = (value) => Boolean(value && "content" in value && String(value.content) === value.content);
  var isFileWriteResult = (value) => Boolean(value && "written" in value && value.written === true);
  var isFileListResult = (value) => Boolean(value && "entries" in value && Array.isArray(value.entries));
  var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);
  var isFileStatResult = (value) => Boolean(value && "kind" in value && "size" in value && fileStatKindSet.has(String(value.kind)) && Number.isFinite(value.size));
  var isGenerateResult = (value) => Boolean(value && "text" in value && String(value.text) === value.text && !("status" in value));
  var HOST_PUSH_TYPES = /* @__PURE__ */ new Set([
    "workspace",
    "shells",
    "ready",
    "directory",
    "session",
    "connection",
    "settings",
    "session-lifecycle",
    "item",
    "resolve",
    "action",
    "status-control-event",
    "popover-closed",
    "file-open",
    "file-snapshot",
    "file-saved"
  ]);
  var asWireRecord = (data) => Object(data) === data ? data : null;
  var isNonEmptyString = (value) => String(value) === value && value.length > 0;
  var readResultMessage = (wire) => {
    if (!isNonEmptyString(wire.id))
      return null;
    if (wire.ok === true) {
      const message = {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: true
      };
      if (Object(wire.payload) === wire.payload) {
        message.payload = wire.payload;
      }
      return message;
    }
    if (wire.ok === false && isNonEmptyString(wire.error)) {
      return {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: false,
        error: wire.error,
        code: resolveHostRequestErrorCode(isNonEmptyString(wire.code) ? wire.code : void 0)
      };
    }
    return null;
  };
  var readHostMessage = (data) => {
    const wire = asWireRecord(data);
    if (!wire || wire.channel !== OPENCHAMBER_SDK_CHANNEL || wire.v !== OPENCHAMBER_SDK_API_VERSION)
      return null;
    if (wire.type === "result")
      return readResultMessage(wire);
    if (!HOST_PUSH_TYPES.has(String(wire.type)) || Object(wire.payload) !== wire.payload)
      return null;
    return wire;
  };

  // node_modules/@openchamber/sdk/dist/host.js
  var isKeyEvent = (event) => "key" in event && "metaKey" in event && "ctrlKey" in event;
  var isSaveShortcut = (event) => (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s";
  var HostRequestError = class extends Error {
    constructor(code, message) {
      super(message);
      __publicField(this, "code");
      this.name = "HostRequestError";
      this.code = code;
    }
  };
  var rejectBadPath = () => Promise.reject(new HostRequestError("BAD_PATH", 'Request path must start with "/" and stay on the declared origin.'));
  var rejectBadFilePath = () => Promise.reject(new HostRequestError("BAD_PATH", `File path must be 1 to ${GUEST_FILE_PATH_MAX} characters without NUL or backslash.`));
  var deviceStorageScope = (options) => {
    if (options === void 0)
      return void 0;
    if (Object(options) !== options || Array.isArray(options) || options.scope !== void 0 && options.scope !== "instance" && options.scope !== "device") {
      throw new HostRequestError("HOST_REJECTED", 'Storage scope must be "instance" or "device".');
    }
    return options.scope === "device" ? "device" : void 0;
  };
  var nextId = (n) => {
    n.value += 1;
    return `oc-${n.value}`;
  };
  var connectHost = (options = {}) => {
    const target = options.target ?? ("window" in globalThis ? window : null);
    if (!target) {
      throw new HostRequestError("HOST_UNAVAILABLE", "No window. connectHost runs in a browser frame.");
    }
    const acceptSource = options.acceptSource ?? ((source) => source === target.parent);
    const requestTimeoutMs = options.requestTimeoutMs ?? GUEST_REQUEST_TIMEOUT_MS;
    const readyListeners = /* @__PURE__ */ new Set();
    const directoryListeners = /* @__PURE__ */ new Set();
    const sessionListeners = /* @__PURE__ */ new Set();
    const lifecycleListeners = /* @__PURE__ */ new Set();
    const connectionListeners = /* @__PURE__ */ new Set();
    const settingsListeners = /* @__PURE__ */ new Set();
    const itemListeners = /* @__PURE__ */ new Set();
    const statusControlListeners = /* @__PURE__ */ new Set();
    const popoverClosedListeners = /* @__PURE__ */ new Set();
    let resolveHandler = null;
    let actionHandler = null;
    const fileOpenListeners = /* @__PURE__ */ new Set();
    const fileSavedListeners = /* @__PURE__ */ new Set();
    let fileSnapshotHandler = null;
    let lastFile = null;
    let saveShortcutInstalled = false;
    const pending = /* @__PURE__ */ new Map();
    const workspaceListeners = /* @__PURE__ */ new Map();
    const shellsListeners = /* @__PURE__ */ new Map();
    let disposed = false;
    const ids = { value: 0 };
    let lastReady = null;
    let lastLifecycle = null;
    let popoverPointerActive = false;
    let popoverFocusActive = false;
    let popoverActivityReported = null;
    const lifecycleFromSession = (session) => {
      if (!session)
        return null;
      return {
        sessionId: session.id,
        phase: session.busy ? "started" : "completed"
      };
    };
    const post = (message) => {
      target.parent.postMessage(message, "*");
    };
    const emit = (listeners, value) => {
      for (const listener of listeners) {
        try {
          listener(value);
        } catch (error) {
          console.error(error);
        }
      }
    };
    const onMessage = (event) => {
      if (!(event instanceof MessageEvent))
        return;
      if (!acceptSource(event.source))
        return;
      const message = readHostMessage(event.data);
      if (!message)
        return;
      if (message.type === "workspace") {
        const listener = workspaceListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "shells") {
        const listener = shellsListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "ready") {
        lastReady = message.payload;
        lastLifecycle = lifecycleFromSession(message.payload.session);
        emit(readyListeners, message.payload);
        emit(directoryListeners, message.payload.directory);
        emit(sessionListeners, message.payload.session);
        if (lastLifecycle) {
          emit(lifecycleListeners, lastLifecycle);
        }
        emit(connectionListeners, message.payload.connection);
        emit(settingsListeners, message.payload.settings);
        emit(itemListeners, message.payload.item);
        return;
      }
      if (message.type === "directory") {
        if (lastReady) {
          lastReady = { ...lastReady, directory: message.payload.directory };
        }
        emit(directoryListeners, message.payload.directory);
        return;
      }
      if (message.type === "session") {
        if (lastReady) {
          lastReady = { ...lastReady, session: message.payload.session };
        }
        if (!message.payload.session) {
          lastLifecycle = null;
        } else if (lastLifecycle?.sessionId !== message.payload.session.id) {
          lastLifecycle = lifecycleFromSession(message.payload.session);
        }
        emit(sessionListeners, message.payload.session);
        return;
      }
      if (message.type === "session-lifecycle") {
        lastLifecycle = message.payload;
        emit(lifecycleListeners, message.payload);
        return;
      }
      if (message.type === "connection") {
        if (lastReady) {
          lastReady = { ...lastReady, connection: message.payload.connection };
        }
        emit(connectionListeners, message.payload.connection);
        return;
      }
      if (message.type === "settings") {
        if (lastReady) {
          lastReady = { ...lastReady, settings: message.payload.settings };
        }
        emit(settingsListeners, message.payload.settings);
        return;
      }
      if (message.type === "item") {
        if (lastReady) {
          lastReady = { ...lastReady, item: message.payload.item };
        }
        emit(itemListeners, message.payload.item);
        return;
      }
      if (message.type === "status-control-event") {
        emit(statusControlListeners, message.payload);
        return;
      }
      if (message.type === "popover-closed") {
        emit(popoverClosedListeners, message.payload);
        return;
      }
      if (message.type === "action") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "action-result",
              id: message.id,
              payload
            });
        };
        const handler = actionHandler;
        if (!handler) {
          answer({ ok: false, error: "This extension does not handle background actions." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then(() => answer({ ok: true }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ ok: false, error: (text || "Action failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      if (message.type === "file-open") {
        const next = message.payload;
        if (lastFile && sameFileEditorDocument(lastFile, next))
          return;
        lastFile = next;
        emit(fileOpenListeners, message.payload);
        return;
      }
      if (message.type === "file-saved") {
        emit(fileSavedListeners, message.payload.version);
        return;
      }
      if (message.type === "file-snapshot") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "file-snapshot-result",
              id: message.id,
              payload
            });
        };
        const fail = (text) => answer({ error: (text.trim() || "Could not read the edited file.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        const handler = fileSnapshotHandler;
        if (!handler) {
          fail("This extension does not edit files.");
          return;
        }
        Promise.resolve().then(() => handler(message.payload.purpose)).then((snapshot) => {
          if (fileEditorPayloadSize(snapshot) > GUEST_FILE_EDITOR_CONTENT_MAX) {
            fail(`The file is over ${GUEST_FILE_EDITOR_CONTENT_MAX} ${"bytes" in snapshot ? "bytes" : "characters"}.`);
            return;
          }
          if (snapshot.version.length > GUEST_FILE_EDITOR_VERSION_MAX) {
            fail(`The snapshot version is over ${GUEST_FILE_EDITOR_VERSION_MAX} characters.`);
            return;
          }
          answer({ snapshot: "bytes" in snapshot ? { bytes: snapshot.bytes, version: snapshot.version } : { content: snapshot.content, version: snapshot.version } });
        }, (error) => fail(error instanceof Error ? error.message : String(error)));
        return;
      }
      if (message.type === "resolve") {
        const answer = (payload) => {
          post({
            channel: OPENCHAMBER_SDK_CHANNEL,
            v: OPENCHAMBER_SDK_API_VERSION,
            type: "resolve-result",
            id: message.id,
            payload
          });
        };
        const handler = resolveHandler;
        if (!handler) {
          answer({ error: "This extension does not resolve commands." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then((item) => answer({ item: item ? clampAttachRequest(item) : null }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ error: (text || "Command failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      const waiter = pending.get(message.id);
      if (!waiter)
        return;
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      if (message.ok) {
        waiter.resolve(message.payload);
        return;
      }
      waiter.reject(new HostRequestError(message.code, message.error));
    };
    target.addEventListener("message", onMessage);
    post({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: "hello"
    });
    const send = (message, timeoutMs = requestTimeoutMs) => {
      if (disposed || target.parent === target) {
        return Promise.reject(new HostRequestError("HOST_UNAVAILABLE", "No host frame. This page is not in an iframe."));
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(message.id);
          reject(new HostRequestError("HOST_TIMEOUT", "Host did not answer in time."));
        }, timeoutMs);
        pending.set(message.id, { resolve, reject, timer });
        post(message);
      });
    };
    const request = (message) => send(message).then(() => void 0);
    const envelope = { channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION };
    const notify = (message) => {
      if (!disposed && target.parent !== target)
        post(message);
    };
    const requestFileSave = () => notify({ ...envelope, type: "file-save" });
    const onSaveShortcut = (event) => {
      if (!isKeyEvent(event) || !isSaveShortcut(event))
        return;
      event.preventDefault();
      requestFileSave();
    };
    const onPopoverEscape = (event) => {
      if (!isKeyEvent(event) || event.key !== "Escape" || lastReady?.surface !== "popover" || !lastReady.popover)
        return;
      event.preventDefault();
      void closePopover(lastReady.popover.id, "escape").catch(() => void 0);
    };
    const reportPopoverActivity = () => {
      const popover = lastReady?.surface === "popover" ? lastReady.popover : void 0;
      if (!popover)
        return;
      const active2 = popoverPointerActive || popoverFocusActive;
      if (popoverActivityReported === active2)
        return;
      popoverActivityReported = active2;
      void setPopoverAnchorActive(popover.id, active2).catch(() => void 0);
    };
    const onPopoverPointerOver = () => {
      if (lastReady?.surface !== "popover" || popoverPointerActive)
        return;
      popoverPointerActive = true;
      reportPopoverActivity();
    };
    const onPopoverPointerOut = (event) => {
      if (lastReady?.surface !== "popover" || event.relatedTarget !== null || !popoverPointerActive)
        return;
      popoverPointerActive = false;
      reportPopoverActivity();
    };
    const onPopoverFocus = () => {
      if (lastReady?.surface !== "popover" || popoverFocusActive)
        return;
      popoverFocusActive = true;
      reportPopoverActivity();
    };
    const onPopoverBlur = () => {
      if (lastReady?.surface !== "popover" || !popoverFocusActive)
        return;
      popoverFocusActive = false;
      reportPopoverActivity();
    };
    const requireIdentity = (value, maximum = 1024) => {
      if (!value.trim() || value.length > maximum)
        throw new HostRequestError("HOST_REJECTED", `Identity must contain 1 to ${maximum} characters.`);
    };
    const readWorkspace = async (query) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const result = await send({ ...envelope, type: "workspace-read", id: nextId(ids), payload: query });
      if (!result || !("kind" in result) || !("state" in result) || result.kind !== query.kind) {
        throw new HostRequestError("HOST_REJECTED", "Host did not return workspace data.");
      }
      return result;
    };
    const subscribeWorkspace = async (query, listener) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const subscriptionId = nextId(ids);
      workspaceListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "workspace-subscribe", id: nextId(ids), payload: { subscriptionId, query } });
      } catch (error) {
        workspaceListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!workspaceListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const subscribeShells = async (scope, listener) => {
      if (scope.kind === "session")
        requireIdentity(scope.sessionId);
      if (scope.kind === "project")
        requireIdentity(scope.projectId);
      const subscriptionId = nextId(ids);
      shellsListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "shells-subscribe", id: nextId(ids), payload: { subscriptionId, scope } });
      } catch (error) {
        shellsListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!shellsListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const storage = async (payload) => {
      if ("key" in payload && (payload.key.length === 0 || payload.key.length > GUEST_STORAGE_KEY_MAX)) {
        throw new HostRequestError("HOST_REJECTED", "Storage key must contain 1 to 128 characters.");
      }
      if (payload.op === "set" && !isJsonValue(payload.value)) {
        throw new HostRequestError("HOST_REJECTED", "Storage values must be JSON.");
      }
      if (payload.op === "set" && new TextEncoder().encode(JSON.stringify(payload.value)).length > GUEST_STORAGE_VALUE_BYTES) {
        throw new HostRequestError("HOST_REJECTED", "Storage value exceeds 64 KiB.");
      }
      if (payload.scope === "device" && lastReady?.features?.deviceStorage !== true) {
        throw new HostRequestError("UNSUPPORTED", "This host does not support device storage.");
      }
      const result = await send({ ...envelope, type: "storage", id: nextId(ids), payload });
      if (!result || !("storage" in result) || result.op !== payload.op)
        throw new HostRequestError("HOST_REJECTED", "Host did not return storage data.");
      return result;
    };
    const closePopover = (id, reason) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-close", id: nextId(ids), payload: reason ? { id, reason } : { id } });
    const setPopoverAnchorActive = (id, active2) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-anchor", id: nextId(ids), payload: { id, active: active2 } });
    target.addEventListener("keydown", onPopoverEscape, true);
    target.addEventListener("pointerover", onPopoverPointerOver);
    target.addEventListener("pointermove", onPopoverPointerOver);
    target.addEventListener("pointerout", onPopoverPointerOut);
    target.addEventListener("focus", onPopoverFocus);
    target.addEventListener("blur", onPopoverBlur);
    return {
      onAction: (handler) => {
        actionHandler = handler;
        return () => {
          if (actionHandler === handler)
            actionHandler = null;
        };
      },
      listProjects: async () => {
        const result = await readWorkspace({ kind: "projects" });
        if (result.kind !== "projects")
          throw new HostRequestError("HOST_REJECTED", "Expected projects.");
        return result;
      },
      listWorktrees: async (projectId) => {
        const result = await readWorkspace({ kind: "worktrees", projectId });
        if (result.kind !== "worktrees")
          throw new HostRequestError("HOST_REJECTED", "Expected worktrees.");
        return result;
      },
      listSessions: async (projectId) => {
        const result = await readWorkspace({ kind: "sessions", projectId });
        if (result.kind !== "sessions")
          throw new HostRequestError("HOST_REJECTED", "Expected sessions.");
        return result;
      },
      onProjects: (listener) => subscribeWorkspace({ kind: "projects" }, (snapshot) => {
        if (snapshot.kind === "projects")
          listener(snapshot);
      }),
      onWorktrees: (projectId, listener) => subscribeWorkspace({ kind: "worktrees", projectId }, (snapshot) => {
        if (snapshot.kind === "worktrees")
          listener(snapshot);
      }),
      onSessions: (projectId, listener) => subscribeWorkspace({ kind: "sessions", projectId }, (snapshot) => {
        if (snapshot.kind === "sessions")
          listener(snapshot);
      }),
      onRunningShells: (scope, listener) => subscribeShells(scope, listener),
      readShellOutput: async (shellId, options2) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const cursor = options2?.cursor;
        if (cursor !== void 0 && (!Number.isInteger(cursor) || cursor < 0)) {
          throw new HostRequestError("HOST_REJECTED", "Shell output cursor must be a non-negative integer.");
        }
        const tailBytes = options2?.tailBytes;
        if (tailBytes !== void 0 && (!Number.isInteger(tailBytes) || tailBytes < 1 || tailBytes > GUEST_SHELL_OUTPUT_TAIL_MAX)) {
          throw new HostRequestError("HOST_REJECTED", `Shell output tailBytes must be an integer between 1 and ${GUEST_SHELL_OUTPUT_TAIL_MAX}.`);
        }
        const result = await send({ ...envelope, type: "shell-output", id: nextId(ids), payload: { shellId, cursor, tailBytes } });
        const output = result;
        if (!output || typeof output.output !== "string" || !Number.isFinite(output.cursor)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return shell output.");
        }
        return output;
      },
      stopShell: async (shellId) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const result = await send({ ...envelope, type: "shell-stop", id: nextId(ids), payload: { shellId } });
        if (result?.stopped !== true)
          throw new HostRequestError("HOST_REJECTED", "Host did not stop the shell.");
        return { stopped: true };
      },
      openSession: async (sessionId) => {
        requireIdentity(sessionId);
        await request({ ...envelope, type: "open-session", id: nextId(ids), payload: { sessionId } });
      },
      storage: {
        get: async (key, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "get", key };
          if (scope)
            payload.scope = scope;
          const result = await storage(payload);
          return result.op === "get" && result.found ? result.value : void 0;
        },
        set: async (key, value, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "set", key, value };
          if (scope)
            payload.scope = scope;
          await storage(payload);
        },
        delete: async (key, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "delete", key };
          if (scope)
            payload.scope = scope;
          await storage(payload);
        },
        keys: async (options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "keys" };
          if (scope)
            payload.scope = scope;
          const result = await storage(payload);
          if (result.op !== "keys")
            throw new HostRequestError("HOST_REJECTED", "Expected storage keys.");
          return result.keys;
        }
      },
      onReady: (listener) => {
        readyListeners.add(listener);
        if (lastReady)
          listener(lastReady);
        return () => {
          readyListeners.delete(listener);
        };
      },
      onDirectory: (listener) => {
        directoryListeners.add(listener);
        if (lastReady)
          listener(lastReady.directory);
        return () => {
          directoryListeners.delete(listener);
        };
      },
      onSession: (listener) => {
        sessionListeners.add(listener);
        if (lastReady)
          listener(lastReady.session);
        return () => {
          sessionListeners.delete(listener);
        };
      },
      onSessionLifecycle: (listener) => {
        lifecycleListeners.add(listener);
        if (lastLifecycle)
          listener(lastLifecycle);
        return () => {
          lifecycleListeners.delete(listener);
        };
      },
      onConnection: (listener) => {
        connectionListeners.add(listener);
        if (lastReady)
          listener(lastReady.connection);
        return () => {
          connectionListeners.delete(listener);
        };
      },
      onSettings: (listener) => {
        settingsListeners.add(listener);
        if (lastReady)
          listener(lastReady.settings);
        return () => {
          settingsListeners.delete(listener);
        };
      },
      onItem: (listener) => {
        itemListeners.add(listener);
        if (lastReady)
          listener(lastReady.item);
        return () => {
          itemListeners.delete(listener);
        };
      },
      onStatusControl: (listener) => {
        statusControlListeners.add(listener);
        return () => {
          statusControlListeners.delete(listener);
        };
      },
      onPopoverClosed: (listener) => {
        popoverClosedListeners.add(listener);
        return () => {
          popoverClosedListeners.delete(listener);
        };
      },
      setStatusControls: (controls) => {
        if (lastReady?.features?.statusControls !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support status controls."));
        }
        if (!isGuestStatusControls(controls)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Status controls must have unique bounded ids and valid selected options."));
        }
        return request({ ...envelope, type: "status-controls", id: nextId(ids), payload: { controls } });
      },
      openPopover: (payload) => {
        if (lastReady?.features?.popovers !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers."));
        }
        if (!isGuestPopoverRequest(payload)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Popover requests need bounded geometry and JSON data."));
        }
        return request({ ...envelope, type: "popover-open", id: nextId(ids), payload });
      },
      closePopover,
      setPopoverAnchorActive,
      onResolve: (handler) => {
        resolveHandler = handler;
        return () => {
          if (resolveHandler === handler)
            resolveHandler = null;
        };
      },
      toast: (payload) => {
        const message = payload.message.trim();
        if (!message || message.length > GUEST_TOAST_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast message must contain 1 to ${GUEST_TOAST_MAX} characters.`));
        }
        if (payload.copy && payload.copy !== true && (!payload.copy.text.length || payload.copy.text.length > GUEST_CLIPBOARD_TEXT_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast copy text must contain 1 to ${GUEST_CLIPBOARD_TEXT_MAX} characters.`));
        }
        return request({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "toast",
          id: nextId(ids),
          payload: { ...payload, message }
        });
      },
      openUrl: (url) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-url",
        id: nextId(ids),
        payload: { url }
      }),
      openCommit: (sha) => isGuestCommitSha(sha) ? request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-commit",
        id: nextId(ids),
        payload: { sha }
      }) : Promise.reject(new HostRequestError("HOST_REJECTED", "Commit id must be 7 to 64 hex characters.")),
      openSurface: (surfaceId) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-surface",
        id: nextId(ids),
        payload: { surfaceId }
      }),
      writeClipboard: (text) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "clipboard-write",
        id: nextId(ids),
        payload: { text }
      }),
      compose: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "compose",
        id: nextId(ids),
        payload
      }),
      attach: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "attach",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      startSession: async (payload) => {
        if (payload.projectId !== void 0)
          requireIdentity(payload.projectId);
        const worktree = payload.worktree;
        if (worktree && worktree !== true) {
          if (worktree.kind === "existing")
            requireIdentity(worktree.directory);
          else {
            if (worktree.name !== void 0)
              requireIdentity(worktree.name, 200);
            if (worktree.baseBranch !== void 0)
              requireIdentity(worktree.baseBranch, 200);
          }
        }
        const result = await send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "start-session",
          id: nextId(ids),
          payload: clampStartSessionRequest(payload)
        }, options.requestTimeoutMs ?? 18e4);
        if (!isStartSessionResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a session.");
        }
        return result;
      },
      prompt: (payload) => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "prompt",
        id: nextId(ids),
        payload: clampPromptRequest(payload)
      }).then((result) => {
        if (!isPromptResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a prompt result.");
        }
        return result;
      }),
      sessionLink: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "session-link",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      close: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "close",
        id: nextId(ids)
      }),
      oauthStart: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-start",
        id: nextId(ids)
      }),
      oauthDisconnect: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-disconnect",
        id: nextId(ids)
      }),
      request: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host request result was empty.");
        }
        return result;
      }),
      serviceRequest: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host service request result was empty.");
        }
        return result;
      }),
      serviceStatus: () => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-status",
        id: nextId(ids)
      }).then((result) => {
        if (!isServiceStatusResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return service status.");
        }
        return result;
      }),
      readFile: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-read",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileReadResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file content.");
        }
        return result;
      }),
      writeFile: (path, content) => {
        if (!isGuestFilePath(path)) {
          return rejectBadFilePath();
        }
        if (content.length > GUEST_FILE_CONTENT_MAX) {
          return Promise.reject(new HostRequestError("FILE_TOO_LARGE", `Content is over ${GUEST_FILE_CONTENT_MAX} characters.`));
        }
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "file-write",
          id: nextId(ids),
          payload: { path, content }
        }).then((result) => {
          if (!isFileWriteResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not confirm the write.");
          }
          return result;
        });
      },
      listDir: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-list",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileListResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return directory entries.");
        }
        return result;
      }),
      stat: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-stat",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileStatResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file status.");
        }
        return result;
      }),
      generate: (input) => {
        const prompt = input.prompt.trim();
        const system = input.system?.trim();
        if (prompt.length === 0 || prompt.length > GUEST_GENERATE_PROMPT_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Prompt must be 1 to ${GUEST_GENERATE_PROMPT_MAX} characters.`));
        }
        if (system !== void 0 && (system.length === 0 || system.length > GUEST_GENERATE_SYSTEM_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `System prompt must be 1 to ${GUEST_GENERATE_SYSTEM_MAX} characters.`));
        }
        const maxOutputTokens = input.maxOutputTokens === void 0 ? void 0 : Math.min(GUEST_GENERATE_OUTPUT_TOKENS_MAX, Math.max(1, Math.floor(input.maxOutputTokens)));
        if (maxOutputTokens !== void 0 && !Number.isFinite(maxOutputTokens)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "maxOutputTokens must be a number."));
        }
        const payload = { prompt };
        if (system !== void 0)
          payload.system = system;
        if (maxOutputTokens !== void 0)
          payload.maxOutputTokens = maxOutputTokens;
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "generate",
          id: nextId(ids),
          payload
        }, options.requestTimeoutMs ?? GUEST_GENERATE_TIMEOUT_MS).then((result) => {
          if (!isGenerateResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not return generated text.");
          }
          return result;
        });
      },
      setBadge: (count) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "badge",
        id: nextId(ids),
        payload: { count: clampBadgeCount(count) }
      }),
      setHeight: (height) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "resize",
        id: nextId(ids),
        payload: { height: clampFrameHeight(height) }
      }),
      onFileOpen: (listener) => {
        fileOpenListeners.add(listener);
        if (!saveShortcutInstalled) {
          saveShortcutInstalled = true;
          target.addEventListener("keydown", onSaveShortcut, true);
        }
        if (lastFile)
          listener(lastFile);
        return () => {
          fileOpenListeners.delete(listener);
        };
      },
      onFileSnapshot: (handler) => {
        fileSnapshotHandler = handler;
        return () => {
          if (fileSnapshotHandler === handler)
            fileSnapshotHandler = null;
        };
      },
      onFileSaved: (listener) => {
        fileSavedListeners.add(listener);
        return () => {
          fileSavedListeners.delete(listener);
        };
      },
      reportFileChange: (change) => notify({ ...envelope, type: "file-change", payload: { dirty: change.dirty, edited: change.edited } }),
      requestFileSave,
      reportFileUnsupported: () => notify({ ...envelope, type: "file-unsupported" }),
      dispose: () => {
        for (const subscriptionId of workspaceListeners.keys()) {
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        workspaceListeners.clear();
        for (const subscriptionId of shellsListeners.keys()) {
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        shellsListeners.clear();
        disposed = true;
        resolveHandler = null;
        actionHandler = null;
        fileSnapshotHandler = null;
        fileOpenListeners.clear();
        fileSavedListeners.clear();
        if (saveShortcutInstalled)
          target.removeEventListener("keydown", onSaveShortcut, true);
        target.removeEventListener("message", onMessage);
        target.removeEventListener("keydown", onPopoverEscape, true);
        target.removeEventListener("pointerover", onPopoverPointerOver);
        target.removeEventListener("pointermove", onPopoverPointerOver);
        target.removeEventListener("pointerout", onPopoverPointerOut);
        target.removeEventListener("focus", onPopoverFocus);
        target.removeEventListener("blur", onPopoverBlur);
        for (const waiter of pending.values()) {
          clearTimeout(waiter.timer);
          waiter.reject(new HostRequestError("HOST_UNAVAILABLE", "Host client was disposed."));
        }
        pending.clear();
        readyListeners.clear();
        directoryListeners.clear();
        sessionListeners.clear();
        lifecycleListeners.clear();
        connectionListeners.clear();
        settingsListeners.clear();
        itemListeners.clear();
        statusControlListeners.clear();
        popoverClosedListeners.clear();
      }
    };
  };

  // node_modules/@openchamber/sdk/dist/service-providers.js
  var BROWSER_CONTROL_ACTIONS = [
    "browser.open",
    "browser.snapshot",
    "browser.click",
    "browser.type",
    "browser.scroll",
    "browser.back",
    "browser.forward",
    "browser.inspect",
    "browser.capture",
    "browser.resize"
  ];
  var BROWSER_PROVIDER_IDLE_MS = 10 * 6e4;
  var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);

  // node_modules/@openchamber/sdk/dist/service-surface.js
  var SURFACE_CONTROLLERS = ["none", "agent", "user"];
  var CONTROLLERS = new Set(SURFACE_CONTROLLERS);

  // panel/api.ts
  var host = connectHost();
  var ServiceUnavailable = class extends Error {
    constructor(message) {
      super(message);
      this.name = "ServiceUnavailable";
    }
  };
  function describe(error) {
    if (error instanceof HostRequestError) return `${error.code}: ${error.message}`;
    if (error instanceof Error) return error.message;
    return String(error);
  }
  async function callService(path, query, method = "GET", body) {
    let result;
    try {
      result = await host.serviceRequest({ method, path, query, body });
    } catch (error) {
      throw new ServiceUnavailable(describe(error));
    }
    if (result.status !== 200) {
      let detail = `HTTP ${result.status}`;
      try {
        const parsed = JSON.parse(result.body);
        if (parsed.error) detail = parsed.error;
      } catch {
      }
      throw new ServiceUnavailable(detail);
    }
    return JSON.parse(result.body);
  }
  var OPENING_STATUS = "Starting dev server\u2026";
  function openLive(url, dir) {
    return callService("/open", void 0, "POST", JSON.stringify(dir ? { url, dir } : { url }));
  }
  function closeLive() {
    return callService("/close", void 0, "POST");
  }
  function stopDevServer(dir) {
    return callService("/server/stop", void 0, "POST", JSON.stringify({ dir }));
  }
  function startDevServer(dir, url) {
    return callService("/server/start", void 0, "POST", JSON.stringify({ dir, url }));
  }
  function getServerStatus(dir) {
    return callService("/server/status", { dir });
  }
  function getState() {
    return callService("/state");
  }
  function focusLive() {
    return callService("/focus", void 0, "POST");
  }
  function getConfig(dir) {
    return callService("/config", { dir });
  }
  function validateReferencePath(dir, path) {
    return callService("/reference", void 0, "POST", JSON.stringify({ dir, path }));
  }
  function ensureHarness(dir) {
    return callService("/harness", void 0, "POST", JSON.stringify({ dir }));
  }
  function isDesignWorkspaceDir(dir) {
    return /(^|[\\/])designs([\\/]|$)/.test(String(dir ?? ""));
  }
  function scaffoldProject(dir, spec) {
    return callService("/scaffold", void 0, "POST", JSON.stringify({ dir, ...spec }));
  }
  function projectRows(snapshot, configs = {}) {
    if (snapshot.state === "loading") return { kind: "loading" };
    if (snapshot.state === "error") return { kind: "error", message: "Could not load projects." };
    const rows = [];
    for (const project of snapshot.projects) {
      const read = configs[project.directory];
      if (read && read.config === null && !read.error) continue;
      rows.push({
        id: project.id,
        name: project.name,
        directory: project.directory,
        config: read?.config ?? null,
        configError: read?.error ?? null
      });
    }
    if (rows.length === 0) return { kind: "empty" };
    return { kind: "list", rows };
  }
  var DESIGN_READY_BADGE = "Design ready";
  var NO_CONFIG_BADGE = "No config yet";
  var NO_DESIGN_WORK_MESSAGE = "No design work yet. Create one above.";
  var PANEL_SIDEBAR_HINT = "Design Studio opens from the sidebar.";
  function modeSessionIdFromKey(key) {
    const prefix = "mode/";
    return key.startsWith(prefix) && key.length > prefix.length ? key.slice(prefix.length) : null;
  }
  function designChatLabel(session) {
    const title = session.title?.trim();
    return title ? title : session.id.slice(0, 8);
  }
  function projectMeta(row) {
    if (!row.config) return row.directory;
    const type = row.config.type?.trim() || "custom";
    const url = row.config.url?.trim();
    return url ? `${type} \xB7 ${url}` : type;
  }
  function designChatMeta(row) {
    if (!row.config) return row.directory || row.projectName;
    const type = row.config.type?.trim() || "custom";
    const url = row.config.url?.trim();
    return url ? `${type} \xB7 ${url}` : type;
  }
  function allProjectsFromSnapshot(snapshot) {
    if (snapshot.state !== "ready") return [];
    return snapshot.projects.map((project) => ({ id: project.id, name: project.name, directory: project.directory }));
  }
  var NEEDS_PROJECT_MESSAGE = "Add this folder to OpenChamber as a project first \u2014 design sessions live in registered projects.";
  function pathContains(root, dir) {
    return dir === root || dir.startsWith(`${root}/`);
  }
  function resolveDesignTarget(input) {
    const picked = input.selectedProjectId ? input.projects.find((project) => project.id === input.selectedProjectId) : void 0;
    if (picked) return projectTarget(picked, input.rows);
    if (input.directory) {
      const exact = input.projects.find((project) => project.directory === input.directory);
      if (exact) return projectTarget(exact, input.rows);
      let containing;
      for (const project of input.projects) {
        if (pathContains(project.directory, input.directory) && (!containing || project.directory.length > containing.directory.length)) {
          containing = project;
        }
      }
      if (containing) {
        if (isDesignWorkspaceDir(input.directory)) {
          return { kind: "project", dir: input.directory, projectId: containing.id, config: configForDir(input.rows, input.directory) };
        }
        return projectTarget(containing, input.rows);
      }
    }
    return { kind: "needs-project", dir: input.directory };
  }
  function projectTarget(project, rows) {
    const row = rows.find((candidate) => candidate.directory === project.directory);
    return { kind: "project", dir: project.directory, projectId: project.id, config: row?.config ?? null };
  }
  function configForDir(rows, dir) {
    return rows.find((row) => row.directory === dir)?.config ?? null;
  }
  function isModeChipData(data) {
    if (!data || typeof data !== "object") return false;
    const mode = data.mode;
    return Boolean(mode && typeof mode === "object" && mode.on === true);
  }
  function sessionShowsDesignMode(session) {
    return Array.isArray(session.items) && session.items.some((item) => isModeChipData(item.data));
  }
  function isDesignSession(session, onSessionIds, markerSessionIds, modeKeySessionIds) {
    return sessionShowsDesignMode(session) || onSessionIds.has(session.id) || Boolean(markerSessionIds?.has(session.id)) || Boolean(modeKeySessionIds?.has(session.id));
  }
  function designChatRows(listings, onSessionIds, markerSessionIds, modeKeySessionIds) {
    if (listings.length === 0) return { kind: "empty" };
    const failed = [];
    const rows = [];
    let loading = false;
    for (const listing of listings) {
      if (listing.snapshot.state === "error") {
        failed.push(listing.projectName);
        continue;
      }
      if (listing.snapshot.state === "loading") {
        loading = true;
        continue;
      }
      for (const session of listing.snapshot.sessions) {
        if (session.archivedAt) continue;
        if (!isDesignSession(session, onSessionIds, markerSessionIds, modeKeySessionIds)) continue;
        rows.push({
          sessionId: session.id,
          projectId: listing.projectId,
          projectName: listing.projectName,
          title: designChatLabel(session),
          // The chat resolves its config from its OWN directory, so an isolated
          // `designs/<slug>` chat still reads as a design chat with its config.
          directory: session.directory ?? "",
          config: null,
          configError: null,
          updatedAt: session.updatedAt
        });
      }
    }
    if (loading) return { kind: "loading" };
    if (rows.length === 0 && failed.length > 0) {
      return { kind: "error", message: `Could not load design chats for ${failed.join(", ")}.` };
    }
    if (rows.length === 0) return { kind: "empty" };
    return { kind: "list", rows };
  }
  function designWorkRows(projects, chats, options = {}) {
    if (projects.kind === "loading" || chats.kind === "loading") return { kind: "loading" };
    if (projects.kind === "error") return { kind: "error", message: projects.message };
    if (chats.kind === "error") return { kind: "error", message: chats.message };
    const omit = options.omitChatProjectIds ?? null;
    const rows = [];
    if (projects.kind === "list") for (const project of projects.rows) rows.push({ kind: "project", project });
    if (chats.kind === "list") {
      const ordered = [...chats.rows].sort((a, b) => b.updatedAt - a.updatedAt);
      for (const chat of ordered) {
        if (omit?.has(chat.projectId)) continue;
        rows.push({ kind: "chat", chat });
      }
    }
    if (rows.length === 0) return { kind: "empty" };
    return { kind: "list", rows };
  }
  var PICK_HINT = "\u2318-click an element to add a reference";
  function pickHintActive(state2) {
    return state2.windowOpen;
  }
  function formatOpenStatus(result) {
    if (result.ok) return result.started ? "Dev server started \xB7 window open" : "Window open";
    return result.error ?? "Could not open the window";
  }
  function shouldStopDevServer(input) {
    return input.startedByUs && !input.busy && input.otherActiveDesignSessions === 0;
  }
  function countOtherActiveDesignSessions(sessions, currentSessionId, markerSessionIds) {
    let count = 0;
    for (const session of sessions) {
      if (currentSessionId && session.id === currentSessionId) continue;
      const isDesign = markerSessionIds.has(session.id) || sessionShowsDesignMode(session);
      if (isDesign && session.activity !== "idle") count += 1;
    }
    return count;
  }
  function designSessionStatus(state2) {
    if (!state2.modeOn) return "Design mode is off \u2014 start a design session to pick elements";
    const url = state2.configUrl?.trim();
    return url ? `Design session \xB7 .design-studio.json found \xB7 ${url}` : "Design session \xB7 no .design-studio.json url yet";
  }
  var NO_PROJECT_URL_MESSAGE = "No .design-studio.json url for this project \u2014 add one, or turn the dev server on first";
  var ATTACH_NEEDS_URL = "References need an http(s) url from .design-studio.json.";
  var NO_PROJECT_CONFIG_MESSAGE = "No .design-studio.json here \u2014 Design Studio isn't set up in this project.";
  function projectReady(config) {
    return Boolean(config?.url?.trim());
  }
  function isLoopbackUrl(raw) {
    try {
      const host2 = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, "");
      return host2 === "localhost" || host2 === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host2);
    } catch {
      return false;
    }
  }
  function decideProjectOpen(config, projectDir) {
    const url = config?.url?.trim();
    if (!url) return { kind: "message", message: NO_PROJECT_URL_MESSAGE };
    return projectDir && isLoopbackUrl(url) ? { kind: "open", url, dir: projectDir } : { kind: "open", url };
  }
  var PICK_STYLE_KEYS = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textAlign",
    "color",
    "backgroundColor",
    "borderTopWidth",
    "borderStyle",
    "borderColor",
    "borderRadius",
    "padding",
    "margin",
    "display",
    "gap",
    "width",
    "height"
  ];
  function localTimeOf(day) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(day.getHours())}:${pad(day.getMinutes())}:${pad(day.getSeconds())}`;
  }
  function referenceText(pick, url, pickedAt) {
    const styles = PICK_STYLE_KEYS.filter((key) => pick.styles[key] && pick.styles[key] !== "normal" && pick.styles[key] !== "none").map((key) => `  ${key}: ${pick.styles[key]};`).join("\n");
    return [
      "Reference from Design Studio",
      ...pickedAt ? [`Picked at ${localTimeOf(pickedAt)}`] : [],
      `URL: ${url}`,
      `Selector: ${pick.selector}`,
      `Tag: ${pick.tag}${pick.classes ? `  Classes: ${pick.classes}` : ""}`,
      pick.text ? `Text: ${JSON.stringify(pick.text)}` : "Text: (empty)",
      "Current styles:",
      styles || "  (none of note)",
      "Markup:",
      "```html",
      pick.outerHTML,
      "```"
    ].join("\n");
  }

  // shared/harness-text.ts
  var CRAFT_RULES = {
    typography: [
      "- Build one modular scale (base \xD71.2, or \xD71.25 for airier layouts) and take every size from it.",
      "- Ship 6\u20138 sizes total; do not invent a new size per section.",
      "- Pair a distinct display face with a readable body face, and keep each role to one family.",
      "- Set body line-height near 1.5 and tighten only display text.",
      "- Keep body measure to roughly 45\u201375 characters per line.",
      "- Let weight, size and color carry hierarchy before you reach for decoration.",
      "- Use tabular numerals for tables, prices, timers and any aligned data.",
      "- Limit to two or three weights per family; resist faux-bold."
    ].join("\n"),
    color: [
      "- Keep 70\u201390% of the palette neutral; let structure do the work.",
      "- Spend one accent on 5\u201310% of a screen, used at most twice as a fill or emphasis.",
      "- Reserve semantic colors (success/warn/danger/info) for 0\u20135% and only for meaning.",
      "- Guarantee contrast of 4.5:1 for body text and 3:1 for large text and UI edges.",
      "- Never encode meaning in color alone; add an icon, label or weight change.",
      "- Derive surfaces from one neutral ramp rather than stacking unrelated grays.",
      "- Test the palette in both light and dark before committing.",
      "- Choose an accent that fits the direction; do not fall back to framework default."
    ].join("\n"),
    "anti-slop": [
      "- Do not use the default indigo/violet accent that every starter kit ships.",
      "- Do not build hero sections from two-stop gradient backgrounds.",
      "- Do not use emoji as icons; draw or pick a coherent icon set.",
      "- Do not invent metrics, testimonials or logos the brief did not supply.",
      '- Do not pad copy with filler like "lorem ipsum" or "seamless, powerful solution".',
      "- Avoid the generic card with a colored left border and a shadow.",
      "- Avoid stock centered-everything layouts with no alignment logic.",
      "- If a pattern feels like a template default, redesign it deliberately."
    ].join("\n"),
    states: [
      "- Render every data surface in all five states: Loading, Empty, Error, Populated, Edge.",
      "- Give Loading a skeleton or spinner, and a fallback message after ~15s.",
      "- Make Empty states explain what belongs here and how to fill it.",
      "- Make Error states say what failed and offer the next action.",
      "- Cover Edge cases: one item, many items, very long strings, missing fields.",
      "- Give forms explicit Untouched, Dirty and Submitted-pending states.",
      "- Disable or show progress on submit, then confirm success or surface failure.",
      "- Validate on blur, not on every keystroke."
    ].join("\n"),
    motion: [
      "- Animate only to explain change, never as decoration.",
      "- Keep UI transitions under 300ms; longer motion needs a reason.",
      "- Make motion interruptible: a new input cancels the running one.",
      "- Honor prefers-reduced-motion and provide a static equivalent.",
      "- Move along a clear path; avoid bounce and overshoot on functional elements.",
      "- Stagger lists slightly, but never block reading on animation completion."
    ].join("\n"),
    accessibility: [
      "- Give every interactive element a visible :focus-visible treatment.",
      "- Label every input; a placeholder is not a label.",
      "- Provide a complete keyboard path, with no focus traps.",
      "- Use semantic elements first and ARIA only to fill the gaps.",
      "- Keep contrast at AA: 4.5:1 body, 3:1 large text and UI.",
      "- Give images meaningful alt text, and decorative images an empty alt.",
      "- Announce dynamic updates through a live region."
    ].join("\n"),
    "laws-of-ux": [
      "- Hick: cut the number of simultaneous choices; group or defer the rest.",
      "- Miller: keep working sets near 7\xB12, and lean toward ~4 for menus.",
      "- Fitts: make primary targets large and near where the pointer already is.",
      "- von Restorff: style the one thing that must stand out; mute the rest.",
      "- Peak-End: invest in the strongest moment and the final step.",
      "- Tesler: absorb complexity in the product so the user faces less of it."
    ].join("\n"),
    responsive: [
      "- Define named breakpoints (e.g. sm/md/lg/xl) and reuse them everywhere.",
      "- Reflow, do not merely shrink: change column counts and stacking per breakpoint.",
      "- Test the awkward widths, not just the presets: 320, 375, 768, 1024, 1440.",
      "- Keep tap targets at least 44px on touch layouts.",
      "- Clamp fluid type and spacing so extremes stay legible.",
      "- Never let horizontal scroll appear on a normal content page."
    ].join("\n"),
    verification: [
      "- Never call a change done until you have seen it render at every breakpoint: mobile 390, desktop 1280, wide 2048.",
      "- Also check the awkward widths where relevant: 320, 375, 1024, 1440.",
      "- Horizontal scroll on a normal content page is a defect, not a style choice.",
      "- Fix the cheapest deterministic failure first; never restyle to hide an overflow or a contrast error.",
      "- Use only tokens from tokens.css / DESIGN.md; a hardcoded colour or spacing value is a defect.",
      "- Keep tap targets at least 24px (44px on touch), headings in order, every control labelled.",
      "- Done means the gates pass at every breakpoint \u2014 not that it looks right at one width."
    ].join("\n")
  };
  var VERIFY_PROTOCOL = [
    "Before editing, state the change's acceptance criteria in one line.",
    "After each edit verify in this order (cheap/deterministic first): overflow \u2192 design tokens \u2192 accessibility \u2192 semantics \u2192 layout. Use the browser tool: `browser.capture` / `browser.open` returns a `verification` block covering every viewport (mobile, tablet, desktop, wide) with each gate's status.",
    "Fix every P0 before starting a new gate tier; re-run the same gates after a fix.",
    "Budget: at most 5 fix/verify iterations OR 10 minutes, whichever comes first. Then stop and report.",
    "Never mark the work done while any P0 remains. Report the gate table and state the breakpoints you checked.",
    "Oscillation: if a finding you already fixed reappears, or a gate flips across two iterations, STOP and hand back with both states. Do not keep looping.",
    "The 0\u201310 critique is advisory only; never treat it as pass/fail and never optimise for it."
  ].join("\n");
  var DESIGN_AUTHORITY = [
    "DESIGN.md and tokens.css (when present) are the project design system and are",
    "authoritative: follow them over any conflicting instinct, and do not invent colours,",
    "spacing or type values outside them. A hardcoded value that a token already covers is a defect."
  ].join(" ");
  var DESIGN_WORKSPACE_NOTE = [
    "The selected registered design project itself is the workspace for new design sessions.",
    "Keep the current session directory: do not create a per-chat child workspace or move the session automatically.",
    "Inspect and reuse the existing app, design system and .design-studio.json; do not assume the workspace is empty or scaffold over existing work.",
    "Existing sessions already in legacy child directories stay there unless the user explicitly requests a move."
  ].join(" ");
  var VERIFY_MANDATE = [
    "Verify at every stage, not only at the end: after each edit, before showing work, and before calling",
    "anything done. Run the cheap deterministic gates first and never claim success without having seen the",
    "page render at the breakpoints the protocol names."
  ].join(" ");

  // panel/craft.ts
  var DIRECTIONS = {
    editorial: {
      id: "editorial",
      name: "Editorial",
      when: "long-form reading, blogs, articles, magazines, brand storytelling with a voice",
      displayFont: 'a high-contrast serif (e.g. "Fraunces", "Playfair Display")',
      bodyFont: 'a companion serif or a quiet grotesque (e.g. "Source Serif 4", "Inter")',
      tokens: {
        "--bg": "#faf7f2",
        "--surface": "#f2ece3",
        "--fg": "#1c1a17",
        "--muted": "#6b6459",
        "--border": "#ded5c8",
        "--accent": "#a3341f"
      },
      posture: [
        "Lead with type, not chrome: generous measure, real hierarchy.",
        "Use an eyebrow label above headlines and a drop cap or standfirst where it helps.",
        "Let off-white paper tones and one warm accent carry the mood.",
        "Favor asymmetry and pull quotes over centered bland blocks.",
        "Keep rules, borders and shadows restrained; let whitespace separate."
      ]
    },
    "modern-minimal": {
      id: "modern-minimal",
      name: "Modern Minimal",
      when: "SaaS products, marketing and landing pages, developer tools with a crisp brand",
      displayFont: 'a tight geometric sans (e.g. "Inter Tight", "Geist")',
      bodyFont: 'the same family at body weight (e.g. "Inter")',
      tokens: {
        "--bg": "#ffffff",
        "--surface": "#f7f8f8",
        "--fg": "#0a0a0a",
        "--muted": "#6b7280",
        "--border": "#e5e7eb",
        "--accent": "#2563eb"
      },
      posture: [
        "Precise spacing on a consistent 4/8px rhythm.",
        "One crisp accent; everything else neutral and calm.",
        "Thin borders and subtle shadows, never heavy elevation.",
        "Strong typographic hierarchy with restrained color.",
        "Confident use of whitespace over decorative filler."
      ]
    },
    human: {
      id: "human",
      name: "Human",
      when: "consumer apps, kids and wellness, community, marketplaces and social products",
      displayFont: 'a friendly rounded face (e.g. "Nunito", "Baloo 2")',
      bodyFont: 'a warm readable sans (e.g. "Nunito Sans", "Inter")',
      tokens: {
        "--bg": "#fffdf9",
        "--surface": "#fff3e6",
        "--fg": "#2b2320",
        "--muted": "#8a7d74",
        "--border": "#f0e2d3",
        "--accent": "#ff6b52"
      },
      posture: [
        "Rounded corners and roomy padding throughout.",
        "Warm, saturated accent used sparingly for delight.",
        "Illustration and friendly microcopy over corporate tone.",
        "Clear, encouraging states for every step.",
        "Comfortable, touch-first tap targets."
      ]
    },
    "tech-utility": {
      id: "tech-utility",
      name: "Tech Utility",
      when: "dashboards, admin consoles, data and API tools, developer and ops products",
      displayFont: 'a neutral UI sans (e.g. "Inter", "IBM Plex Sans")',
      bodyFont: 'the same family, with a mono for code (e.g. "JetBrains Mono")',
      tokens: {
        "--bg": "#0e1116",
        "--surface": "#161b22",
        "--fg": "#e6edf3",
        "--muted": "#8b949e",
        "--border": "#30363d",
        "--accent": "#2f81f7"
      },
      posture: [
        "Density is a feature: compact rows, aligned columns, tabular numerals.",
        "Status color carries meaning and nothing else.",
        "Monospace for identifiers, values and code.",
        "Dark-first surfaces with clear separators, no decorative flourish.",
        "Every control reachable and legible at scale."
      ]
    }
  };

  // shared/design-systems.ts
  var DESIGN_SYSTEMS = [
    {
      id: "apple",
      name: "Apple",
      category: "Media & Consumer",
      description: "Consumer electronics. Premium white space, SF Pro, cinematic imagery.",
      tokens: {
        "--bg": "#ffffff",
        "--surface": "#f5f5f7",
        "--surface-warm": "#fbfbfd",
        "--fg": "#1d1d1f",
        "--fg-2": "#424245",
        "--muted": "#6e6e73",
        "--meta": "#86868b",
        "--border": "#d2d2d7",
        "--border-soft": "#e8e8ed",
        "--accent": "#0071e3",
        "--accent-on": "#ffffff",
        "--accent-hover": "#0077ed",
        "--accent-active": "#0066cc",
        "--success": "#16a34a",
        "--warn": "#eab308",
        "--danger": "#dc2626",
        "--font-display": '"SF Pro Display", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif',
        "--font-body": '"SF Pro Text", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif',
        "--font-mono": '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "17px",
        "--text-lg": "21px",
        "--text-xl": "28px",
        "--text-2xl": "40px",
        "--text-3xl": "56px",
        "--text-4xl": "80px",
        "--leading-body": "1.47",
        "--leading-tight": "1.05",
        "--tracking-display": "-0.015em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "100px",
        "--section-y-tablet": "64px",
        "--section-y-phone": "40px",
        "--radius-sm": "8px",
        "--radius-md": "12px",
        "--radius-lg": "18px",
        "--radius-pill": "980px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 12px 32px rgba(0, 0, 0, 0.08)",
        "--focus-ring": "0 0 0 4px color-mix(in oklab, var(--accent), transparent 65%)",
        "--motion-fast": "150ms",
        "--motion-base": "220ms",
        "--ease-standard": "cubic-bezier(0.28, 0, 0.22, 1)",
        "--container-max": "1024px",
        "--container-gutter-desktop": "22px",
        "--container-gutter-tablet": "18px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Apple\n\n> Category: Media & Consumer\n> Consumer electronics. Premium white space, SF Pro, cinematic imagery.\n\n## 1. Visual Theme & Atmosphere\n\nApple's web language is a precision editorial system that alternates between gallery-like calm and retail-density information blocks. The visual tone stays restrained: broad neutral canvases, quiet chrome, and product imagery given almost all of the expressive weight. The interface is engineered to disappear so hardware, materials, and finish options become the narrative foreground.\n\nAcross the five analyzed pages, the rhythm is consistent but not monolithic. Marketing surfaces (homepage and Environment) use cinematic black-and-light chaptering, while commerce surfaces (Store and Shop flows) introduce tighter spacing, more utility controls, and denser card stacks without breaking the core brand grammar. The result is one system with two gears: showcase mode and transaction mode."
    },
    {
      id: "linear-app",
      name: "Linear",
      category: "Productivity & SaaS",
      description: "Project management. Ultra-minimal, precise, purple accent.",
      tokens: {
        "--bg": "#08090a",
        "--surface": "#191a1b",
        "--surface-warm": "var(--surface)",
        "--fg": "#f7f8f8",
        "--fg-2": "#d0d6e0",
        "--muted": "#8a8f98",
        "--meta": "#62666d",
        "--border": "rgba(255, 255, 255, 0.08)",
        "--border-soft": "rgba(255, 255, 255, 0.05)",
        "--accent": "#5e6ad2",
        "--accent-on": "#ffffff",
        "--accent-hover": "#828fff",
        "--accent-active": "#4752c4",
        "--success": "#27a644",
        "--warn": "#eab308",
        "--danger": "#dc2626",
        "--font-display": '"Inter Variable", "Inter", "SF Pro Display", -apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
        "--font-body": '"Inter Variable", "Inter", "SF Pro Display", -apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
        "--font-mono": '"Berkeley Mono", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "24px",
        "--text-2xl": "32px",
        "--text-3xl": "48px",
        "--text-4xl": "72px",
        "--leading-body": "1.5",
        "--leading-tight": "1.00",
        "--tracking-display": "-0.022em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "80px",
        "--section-y-tablet": "48px",
        "--section-y-phone": "32px",
        "--radius-sm": "6px",
        "--radius-md": "8px",
        "--radius-lg": "12px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "rgba(0, 0, 0, 0.4) 0px 2px 4px, 0 0 0 1px rgba(255, 255, 255, 0.05)",
        "--focus-ring": "0 0 0 2px color-mix(in oklab, var(--accent), transparent 30%), 0 4px 12px rgba(0, 0, 0, 0.1)",
        "--motion-fast": "150ms",
        "--motion-base": "200ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1200px",
        "--container-gutter-desktop": "24px",
        "--container-gutter-tablet": "16px",
        "--container-gutter-phone": "12px"
      },
      designMd: "# Design System Inspired by Linear\n\n> Category: Productivity & SaaS\n> Project management. Ultra-minimal, precise, purple accent.\n\n## 1. Visual Theme & Atmosphere\n\nLinear's website is a masterclass in dark-mode-first product design \u2014 a near-black canvas (`#08090a`) where content emerges from darkness like starlight. The overall impression is one of extreme precision engineering: every element exists in a carefully calibrated hierarchy of luminance, from barely-visible borders (`rgba(255,255,255,0.05)`) to soft, luminous text (`#f7f8f8`). This is not a dark theme applied to a light design \u2014 it is darkness as the native medium, where information density is managed through subtle gradations of white opacity rather than color variation."
    },
    {
      id: "stripe",
      name: "Stripe",
      category: "Fintech & Crypto",
      description: "Payment infrastructure. Signature purple gradients, weight-300 elegance.",
      tokens: {
        "--bg": "#ffffff",
        "--surface": "#ffffff",
        "--surface-warm": "#f6f9fc",
        "--fg": "#061b31",
        "--fg-2": "#273951",
        "--muted": "#64748d",
        "--meta": "var(--muted)",
        "--border": "#e5edf5",
        "--border-soft": "var(--border)",
        "--accent": "#533afd",
        "--accent-on": "#ffffff",
        "--accent-hover": "#4434d4",
        "--accent-active": "#2e2b8c",
        "--success": "#15be53",
        "--warn": "#9b6829",
        "--danger": "#ea2261",
        "--font-display": '"sohne-var", "S\xF6hne", "Sohne", "SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", Arial, sans-serif',
        "--font-body": '"sohne-var", "S\xF6hne", "Sohne", "SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", Arial, sans-serif',
        "--font-mono": '"SourceCodePro", "Source Code Pro", ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "22px",
        "--text-2xl": "32px",
        "--text-3xl": "48px",
        "--text-4xl": "56px",
        "--leading-body": "1.40",
        "--leading-tight": "1.10",
        "--tracking-display": "-0.02em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "96px",
        "--section-y-tablet": "64px",
        "--section-y-phone": "40px",
        "--radius-sm": "4px",
        "--radius-md": "6px",
        "--radius-lg": "8px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "rgba(50, 50, 93, 0.25) 0px 30px 45px -30px, rgba(0, 0, 0, 0.10) 0px 18px 36px -18px",
        "--focus-ring": "0 0 0 2px var(--accent), 0 0 0 5px color-mix(in oklab, var(--accent), transparent 75%)",
        "--motion-fast": "150ms",
        "--motion-base": "200ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1080px",
        "--container-gutter-desktop": "32px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Stripe\n\n> Category: Fintech & Crypto\n> Payment infrastructure. Signature purple gradients, weight-300 elegance.\n\n## 1. Visual Theme & Atmosphere\n\nStripe's website is the gold standard of fintech design -- a system that manages to feel simultaneously technical and luxurious, precise and warm. The page opens on a clean white canvas (`#ffffff`) with deep navy headings (`#061b31`) and a signature purple (`#533afd`) that functions as both brand anchor and interactive accent. This isn't the cold, clinical purple of enterprise software; it's a rich, saturated violet that reads as confident and premium. The overall impression is of a financial institution redesigned by a world-class type foundry."
    },
    {
      id: "vercel",
      name: "Vercel",
      category: "Developer Tools",
      description: "Frontend deployment. Black and white precision, Geist font.",
      tokens: {
        "--bg": "#ffffff",
        "--surface": "#ffffff",
        "--surface-warm": "var(--surface)",
        "--fg": "#171717",
        "--fg-2": "#4d4d4d",
        "--muted": "#666666",
        "--meta": "#808080",
        "--border": "rgba(0, 0, 0, 0.08)",
        "--border-soft": "rgba(0, 0, 0, 0.04)",
        "--accent": "#0070f3",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#16a34a",
        "--warn": "#eab308",
        "--danger": "#dc2626",
        "--font-display": '"Geist", "Geist Sans", -apple-system, "Segoe UI", Arial, sans-serif',
        "--font-body": '"Geist", "Geist Sans", -apple-system, "Segoe UI", Arial, sans-serif',
        "--font-mono": '"Geist Mono", ui-monospace, "SF Mono", "Roboto Mono", Menlo, Monaco, "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "20px",
        "--text-xl": "24px",
        "--text-2xl": "32px",
        "--text-3xl": "40px",
        "--text-4xl": "48px",
        "--leading-body": "1.5",
        "--leading-tight": "1.1",
        "--tracking-display": "-0.05em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "96px",
        "--section-y-tablet": "64px",
        "--section-y-phone": "48px",
        "--radius-sm": "6px",
        "--radius-md": "8px",
        "--radius-lg": "12px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 2px rgba(0, 0, 0, 0.04), 0 8px 8px -8px rgba(0, 0, 0, 0.04), 0 0 0 1px #fafafa",
        "--focus-ring": "0 0 0 2px var(--accent)",
        "--motion-fast": "150ms",
        "--motion-base": "200ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1200px",
        "--container-gutter-desktop": "24px",
        "--container-gutter-tablet": "16px",
        "--container-gutter-phone": "12px"
      },
      designMd: "# Design System Inspired by Vercel\n\n> Category: Developer Tools\n> Frontend deployment. Black and white precision, Geist font.\n\n## 1. Visual Theme & Atmosphere\n\nVercel's website is the visual thesis of developer infrastructure made invisible \u2014 a design system so restrained it borders on philosophical. The page is overwhelmingly white (`#ffffff`) with near-black (`#171717`) text, creating a gallery-like emptiness where every element earns its pixel. This isn't minimalism as decoration; it's minimalism as engineering principle. The Geist design system treats the interface like a compiler treats code \u2014 every unnecessary token is stripped away until only structure remains."
    },
    {
      id: "notion",
      name: "Notion",
      category: "Productivity & SaaS",
      description: "All-in-one workspace. Warm minimalism, serif headings, soft surfaces.",
      tokens: {
        "--bg": "#ffffff",
        "--surface": "#f6f5f4",
        "--surface-warm": "var(--surface)",
        "--fg": "rgba(0, 0, 0, 0.95)",
        "--fg-2": "#31302e",
        "--muted": "#615d59",
        "--meta": "#a39e98",
        "--border": "rgba(0, 0, 0, 0.1)",
        "--border-soft": "rgba(0, 0, 0, 0.06)",
        "--accent": "#0075de",
        "--accent-on": "#ffffff",
        "--accent-hover": "#005bab",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#1aae39",
        "--warn": "#dd5b00",
        "--danger": "#dc2626",
        "--font-display": '"NotionInter", "Inter", -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
        "--font-body": '"NotionInter", "Inter", -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
        "--font-mono": 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "20px",
        "--text-xl": "26px",
        "--text-2xl": "40px",
        "--text-3xl": "48px",
        "--text-4xl": "64px",
        "--leading-body": "1.5",
        "--leading-tight": "1.00",
        "--tracking-display": "-0.033em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "80px",
        "--section-y-tablet": "48px",
        "--section-y-phone": "32px",
        "--radius-sm": "4px",
        "--radius-md": "8px",
        "--radius-lg": "12px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "rgba(0, 0, 0, 0.04) 0px 4px 18px, rgba(0, 0, 0, 0.027) 0px 2px 7.85px, rgba(0, 0, 0, 0.02) 0px 0.8px 2.93px, rgba(0, 0, 0, 0.01) 0px 0.175px 1.04px",
        "--focus-ring": "0 0 0 3px rgba(9, 127, 232, 0.3)",
        "--motion-fast": "150ms",
        "--motion-base": "200ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1200px",
        "--container-gutter-desktop": "24px",
        "--container-gutter-tablet": "16px",
        "--container-gutter-phone": "12px"
      },
      designMd: "# Design System Inspired by Notion\n\n> Category: Productivity & SaaS\n> All-in-one workspace. Warm minimalism, serif headings, soft surfaces.\n\n## 1. Visual Theme & Atmosphere\n\nNotion's website embodies the philosophy of the tool itself: a blank canvas that gets out of your way. The design system is built on warm neutrals rather than cold grays, creating a distinctly approachable minimalism that feels like quality paper rather than sterile glass. The page canvas is pure white (`#ffffff`) but the text isn't pure black -- it's a warm near-black (`rgba(0,0,0,0.95)`) that softens the reading experience imperceptibly. The warm gray scale (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) carries subtle yellow-brown undertones, giving the interface a tactile, almost analog warmth."
    },
    {
      id: "shadcn",
      name: "Shadcn",
      category: "Modern & Minimal",
      description: "Shadcn/ui-inspired design with minimal, clean components, monochrome palette, and utility-first patterns.",
      tokens: {
        "--bg": "#ffffff",
        "--surface": "#ffffff",
        "--surface-warm": "var(--surface)",
        "--fg": "#111827",
        "--fg-2": "var(--fg)",
        "--muted": "#64748b",
        "--meta": "var(--muted)",
        "--border": "#e5e7eb",
        "--border-soft": "var(--border)",
        "--accent": "#000000",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), white 10%)",
        "--accent-active": "color-mix(in oklab, var(--accent), white 18%)",
        "--success": "#16a34a",
        "--warn": "#d97706",
        "--danger": "#dc2626",
        "--font-display": '"Geist", "Geist Sans", -apple-system, system-ui, "Segoe UI", Arial, sans-serif',
        "--font-body": '"Geist", "Geist Sans", -apple-system, system-ui, "Segoe UI", Arial, sans-serif',
        "--font-mono": '"Fira Code", ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "20px",
        "--text-xl": "24px",
        "--text-2xl": "32px",
        "--text-3xl": "40px",
        "--text-4xl": "48px",
        "--leading-body": "1.5",
        "--leading-tight": "1.2",
        "--tracking-display": "-0.02em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "96px",
        "--section-y-tablet": "64px",
        "--section-y-phone": "48px",
        "--radius-sm": "6px",
        "--radius-md": "8px",
        "--radius-lg": "12px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 1px 2px 0 color-mix(in oklab, var(--fg), transparent 92%), 0 1px 3px 0 color-mix(in oklab, var(--fg), transparent 88%)",
        "--focus-ring": "0 0 0 2px var(--bg), 0 0 0 4px var(--accent)",
        "--motion-fast": "150ms",
        "--motion-base": "200ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1280px",
        "--container-gutter-desktop": "24px",
        "--container-gutter-tablet": "16px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Shadcn\n\n> Category: Modern & Minimal\n> Shadcn/ui-inspired design with minimal, clean components, monochrome palette, and utility-first patterns.\n\n## 1. Visual Theme & Atmosphere\n\nShadcn/ui-inspired design with minimal, clean components, monochrome palette, and utility-first patterns.\n\n- **Visual style:** minimal, clean\n- **Color stance:** primary, secondary\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#000000` \u2014 Token from style foundations.\n- **Secondary:** `#111111` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#000000) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards.\n- Keep body copy on Text (#111827) for legibility.\n\n## 3. Typography"
    },
    {
      id: "material",
      name: "Material",
      category: "Professional & Corporate",
      description: "Google's Material Design with layered surfaces, dynamic theming, built-in motion, and responsive cross-platform patterns.",
      tokens: {
        "--bg": "#f8fafd",
        "--surface": "#ffffff",
        "--surface-warm": "#e8f0fe",
        "--fg": "#202124",
        "--fg-2": "#3c4043",
        "--muted": "#5f6368",
        "--meta": "#1a73e8",
        "--border": "#dadce0",
        "--border-soft": "#edf0f2",
        "--accent": "#1a73e8",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#188038",
        "--warn": "#f9ab00",
        "--danger": "#d93025",
        "--font-display": '"Google Sans", Roboto, Arial, sans-serif',
        "--font-body": "Roboto, Arial, sans-serif",
        "--font-mono": '"Roboto Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "24px",
        "--text-2xl": "32px",
        "--text-3xl": "48px",
        "--text-4xl": "64px",
        "--leading-body": "1.5",
        "--leading-tight": "1.12",
        "--tracking-display": "0",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "96px",
        "--section-y-tablet": "68px",
        "--section-y-phone": "48px",
        "--radius-sm": "4px",
        "--radius-md": "12px",
        "--radius-lg": "24px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 3px 8px rgba(60, 64, 67, 0.18)",
        "--focus-ring": "0 0 0 4px rgba(26, 115, 232, 0.24)",
        "--motion-fast": "150ms",
        "--motion-base": "250ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1200px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Material\n\n> Category: Professional & Corporate\n> Google's Material Design with layered surfaces, dynamic theming, built-in motion, and responsive cross-platform patterns.\n\n## 1. Visual Theme & Atmosphere\n\nGoogle's Material Design with layered surfaces, dynamic theming, built-in motion, and responsive cross-platform patterns.\n\n- **Visual style:** modern, minimal, clean\n- **Color stance:** primary, secondary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#6442D6` \u2014 Token from style foundations.\n- **Secondary:** `#C8B3FD` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#6442D6) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
    },
    {
      id: "github",
      name: "GitHub",
      category: "Developer Tools",
      description: "Code-forward platform. Functional density, blue-on-white precision, Primer foundations.",
      tokens: {
        "--bg": "#ffffff",
        "--surface": "#f6f8fa",
        "--surface-warm": "var(--surface)",
        "--fg": "#1f2328",
        "--fg-2": "#1f2328",
        "--muted": "#656d76",
        "--meta": "#656d76",
        "--border": "#d0d7de",
        "--border-soft": "#d8dee4",
        "--accent": "#0969da",
        "--accent-on": "#ffffff",
        "--accent-hover": "#0550ae",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#1a7f37",
        "--warn": "#9a6700",
        "--danger": "#cf222e",
        "--font-display": '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
        "--font-body": '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
        "--font-mono": 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "14px",
        "--text-lg": "16px",
        "--text-xl": "20px",
        "--text-2xl": "24px",
        "--text-3xl": "28px",
        "--text-4xl": "32px",
        "--leading-body": "1.5",
        "--leading-tight": "1.25",
        "--tracking-display": "-0.01em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "64px",
        "--section-y-tablet": "48px",
        "--section-y-phone": "32px",
        "--radius-sm": "6px",
        "--radius-md": "6px",
        "--radius-lg": "12px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 1px 3px rgba(31, 35, 40, 0.12), 0 8px 24px rgba(66, 74, 83, 0.12)",
        "--focus-ring": "0 0 0 3px rgba(9, 105, 218, 0.3)",
        "--motion-fast": "80ms",
        "--motion-base": "200ms",
        "--ease-standard": "ease-out",
        "--container-max": "1280px",
        "--container-gutter-desktop": "24px",
        "--container-gutter-tablet": "16px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by GitHub\n\n> Category: Developer Tools\n> Code-forward platform. Functional density, blue-on-white precision, Primer foundations.\n\n## 1. Visual Theme & Atmosphere\n\nGitHub's surface is engineered, not decorated. Every pixel announces a stance: this is a tool for people who care about diffs, builds, and pull requests. The page background is a clean `#ffffff` (light) or `#0d1117` (dark), with content arranged on dense rectangular panes separated by hairline borders rather than negative space. Information density is the brand \u2014 list rows, code lines, repository headers, and notification cards are all packed close together so a power user can scan a hundred items without scrolling.\n\nThe signature accents are the **Primer blue** (`#0969da`) for links and primary actions, and **GitHub green** (`#1a7f37`) for merged states, success, and the merge button itself. Both feel slightly muted compared to consumer-product blues and greens \u2014 saturated enough to read against the dense gray text, restrained enough to disappear into the background when several appear in one viewport."
    },
    {
      id: "bento",
      name: "Bento",
      category: "Layout & Structure",
      description: "Modular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.",
      tokens: {
        "--bg": "#f5f8ff",
        "--surface": "#ffffff",
        "--surface-warm": "#eaf1ff",
        "--fg": "#101828",
        "--fg-2": "#344054",
        "--muted": "#667085",
        "--meta": "#2563eb",
        "--border": "#d7e0ef",
        "--border-soft": "#edf2f8",
        "--accent": "#2563eb",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#16a34a",
        "--warn": "#f59e0b",
        "--danger": "#ef4444",
        "--font-display": "Inter, system-ui, sans-serif",
        "--font-body": "Inter, system-ui, sans-serif",
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "24px",
        "--text-2xl": "36px",
        "--text-3xl": "54px",
        "--text-4xl": "76px",
        "--leading-body": "1.52",
        "--leading-tight": "1.06",
        "--tracking-display": "-0.025em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "96px",
        "--section-y-tablet": "68px",
        "--section-y-phone": "48px",
        "--radius-sm": "10px",
        "--radius-md": "16px",
        "--radius-lg": "24px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 20px 52px rgba(16, 24, 40, 0.11)",
        "--focus-ring": "0 0 0 4px rgba(37, 99, 235, 0.22)",
        "--motion-fast": "150ms",
        "--motion-base": "240ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1180px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Bento\n\n> Category: Layout & Structure\n> Modular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.\n\n## 1. Visual Theme & Atmosphere\n\nModular grid layout with card-like blocks, clear hierarchy, soft spacing, and subtle visual contrast for organized, scannable interfaces.\n\n- **Visual style:** modern, clean\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#FAD4C0` \u2014 Token from style foundations.\n- **Secondary:** `#80A1C1` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFF5E6` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFF5E6` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#FAD4C0) for CTA emphasis.\n- Use Surface (#FFF5E6) for large backgrounds and cards."
    },
    {
      id: "editorial",
      name: "Editorial",
      category: "Creative & Artistic",
      description: "Magazine-inspired editorial layout with refined serif typography, structured grids, and elegant reading experiences.",
      tokens: {
        "--bg": "#fbf7f0",
        "--surface": "#fffdf8",
        "--surface-warm": "#f1e6d6",
        "--fg": "#1f1a16",
        "--fg-2": "#4b4038",
        "--muted": "#7d7168",
        "--meta": "#9a5a2f",
        "--border": "#ded3c5",
        "--border-soft": "#eee5da",
        "--accent": "#9a5a2f",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#4f8a4f",
        "--warn": "#c9822f",
        "--danger": "#b33a3a",
        "--font-display": 'Georgia, "Times New Roman", serif',
        "--font-body": '"Source Serif Pro", Georgia, serif',
        "--font-mono": '"IBM Plex Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "18px",
        "--text-lg": "21px",
        "--text-xl": "30px",
        "--text-2xl": "44px",
        "--text-3xl": "66px",
        "--text-4xl": "92px",
        "--leading-body": "1.65",
        "--leading-tight": "1",
        "--tracking-display": "-0.02em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "112px",
        "--section-y-tablet": "80px",
        "--section-y-phone": "56px",
        "--radius-sm": "4px",
        "--radius-md": "8px",
        "--radius-lg": "12px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 20px 50px rgba(31, 26, 22, 0.12)",
        "--focus-ring": "0 0 0 4px rgba(154, 90, 47, 0.24)",
        "--motion-fast": "180ms",
        "--motion-base": "280ms",
        "--ease-standard": "cubic-bezier(0.22, 1, 0.36, 1)",
        "--container-max": "1120px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Editorial\n\n> Category: Creative & Artistic\n> Magazine-inspired editorial layout with refined serif typography, structured grids, and elegant reading experiences.\n\n## 1. Visual Theme & Atmosphere\n\nMagazine-inspired editorial layout with refined serif typography, structured grids, and elegant reading experiences.\n\n- **Visual style:** modern, editorial\n- **Color stance:** primary, secondary, neutral, success\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#111111` \u2014 Token from style foundations.\n- **Secondary:** `#F1F1F1` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#111111) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
    },
    {
      id: "warm-editorial",
      name: "Warm Editorial",
      category: "Starter",
      description: "A serif-led magazine aesthetic. Terracotta accent on warm off-white paper \u2014",
      tokens: {
        "--bg": "#fbf6ee",
        "--surface": "#fffdf8",
        "--surface-warm": "#f1e3cf",
        "--fg": "#201914",
        "--fg-2": "#4c4037",
        "--muted": "#7a6d63",
        "--meta": "#9b5b32",
        "--border": "#ded2c3",
        "--border-soft": "#eee4d7",
        "--accent": "#9b5b32",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#4f8a4f",
        "--warn": "#c9822f",
        "--danger": "#b33a3a",
        "--font-display": 'Georgia, "Times New Roman", serif',
        "--font-body": "Inter, system-ui, sans-serif",
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "17px",
        "--text-lg": "20px",
        "--text-xl": "28px",
        "--text-2xl": "42px",
        "--text-3xl": "64px",
        "--text-4xl": "88px",
        "--leading-body": "1.62",
        "--leading-tight": "1",
        "--tracking-display": "-0.025em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "112px",
        "--section-y-tablet": "80px",
        "--section-y-phone": "56px",
        "--radius-sm": "10px",
        "--radius-md": "16px",
        "--radius-lg": "24px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 20px 52px rgba(32, 25, 20, 0.12)",
        "--focus-ring": "0 0 0 4px rgba(155, 91, 50, 0.24)",
        "--motion-fast": "150ms",
        "--motion-base": "240ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1180px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Warm Editorial\n\n> Category: Starter\n> A serif-led magazine aesthetic. Terracotta accent on warm off-white paper \u2014\n> good for long-form, editorial, and brand-led marketing pages.\n\n## Visual Theme & Atmosphere\nWarm, unhurried, magazine-like. Think \"a New Yorker interview column online.\" Generous whitespace, long-form readability, restrained chrome. Playful but never novelty.\n\n## Color Palette & Roles\n- **Background:** `#FAF7F2` (warm off-white paper)\n- **Foreground:** `#1C1A17` (near-black, slightly warm)\n- **Accent (primary):** `#C0512F` (terracotta) \u2014 used for links, primary CTAs, 1 hero element max per page\n- **Accent (secondary):** `#2F5B4F` (forest) \u2014 section dividers, tags\n- **Muted:** `#8A817A` (mid-warm-grey) \u2014 timestamps, metadata\n- **Surface:** `#FFFFFF` \u2014 elevated cards only\nNever use pure black or pure white anywhere user-facing.\n\n## Typography Rules\n- **Display / headings:** \"GT Sectra\" or fallback serif (`'GT Sectra', 'Times New Roman', serif`)\n- **Body:** \"S\xF6hne\" or fallback sans (`'S\xF6hne', -apple-system, system-ui, sans-serif`)\n- **Mono:** `'JetBrains Mono', ui-monospace, monospace` for code only\n- Scale (px): 12 \xB7 14 \xB7 16 \xB7 20 \xB7 28 \xB7 40 \xB7 56 \xB7 80"
    },
    {
      id: "paper",
      name: "Paper",
      category: "Retro & Nostalgic",
      description: "Paper-textured, print-inspired design with minimal colors, clean serif/sans typography, and tactile surface qualities.",
      tokens: {
        "--bg": "#faf3df",
        "--surface": "#fffaf0",
        "--surface-warm": "#efe0bd",
        "--fg": "#211b12",
        "--fg-2": "#504737",
        "--muted": "#7c7160",
        "--meta": "#8f5d24",
        "--border": "#ddd0b4",
        "--border-soft": "#eee3cd",
        "--accent": "#8f5d24",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#5b8d42",
        "--warn": "#c27b22",
        "--danger": "#a64036",
        "--font-display": 'Georgia, "Times New Roman", serif',
        "--font-body": "Inter, system-ui, sans-serif",
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "17px",
        "--text-lg": "20px",
        "--text-xl": "28px",
        "--text-2xl": "42px",
        "--text-3xl": "64px",
        "--text-4xl": "88px",
        "--leading-body": "1.62",
        "--leading-tight": "1",
        "--tracking-display": "-0.025em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "112px",
        "--section-y-tablet": "80px",
        "--section-y-phone": "56px",
        "--radius-sm": "10px",
        "--radius-md": "16px",
        "--radius-lg": "24px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 18px 42px rgba(33, 27, 18, 0.12)",
        "--focus-ring": "0 0 0 4px rgba(143, 93, 36, 0.24)",
        "--motion-fast": "150ms",
        "--motion-base": "240ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1180px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Paper\n\n> Category: Retro & Nostalgic\n> Paper-textured, print-inspired design with minimal colors, clean serif/sans typography, and tactile surface qualities.\n\n## 1. Visual Theme & Atmosphere\n\nPaper-textured, print-inspired design with minimal colors, clean serif/sans typography, and tactile surface qualities.\n\n- **Visual style:** minimal, clean\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#111111` \u2014 Token from style foundations.\n- **Secondary:** `#8B5CF6` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#111111) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
    },
    {
      id: "brutalism",
      name: "Brutalism",
      category: "Bold & Expressive",
      description: "Raw, anti-design aesthetic inspired by concrete architecture with unadorned elements, jarring layouts, and functional minimalism.",
      tokens: {
        "--bg": "#f5f1e8",
        "--surface": "#ffffff",
        "--surface-warm": "#ffef5a",
        "--fg": "#000000",
        "--fg-2": "#222222",
        "--muted": "#555555",
        "--meta": "#000000",
        "--border": "#000000",
        "--border-soft": "#000000",
        "--accent": "#ffef5a",
        "--accent-on": "#000000",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#00b050",
        "--warn": "#ff8c00",
        "--danger": "#ff2b2b",
        "--font-display": "Arial Black, Impact, sans-serif",
        "--font-body": "Arial, Helvetica, sans-serif",
        "--font-mono": '"Courier New", ui-monospace, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "17px",
        "--text-lg": "20px",
        "--text-xl": "28px",
        "--text-2xl": "42px",
        "--text-3xl": "64px",
        "--text-4xl": "88px",
        "--leading-body": "1.35",
        "--leading-tight": "0.98",
        "--tracking-display": "0",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "88px",
        "--section-y-tablet": "64px",
        "--section-y-phone": "44px",
        "--radius-sm": "0px",
        "--radius-md": "0px",
        "--radius-lg": "0px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "8px 8px 0 #000000",
        "--focus-ring": "0 0 0 4px #000000, 0 0 0 8px #ffef5a",
        "--motion-fast": "90ms",
        "--motion-base": "140ms",
        "--ease-standard": "steps(2, end)",
        "--container-max": "1160px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Brutalism\n\n> Category: Bold & Expressive\n> Raw, anti-design aesthetic inspired by concrete architecture with unadorned elements, jarring layouts, and functional minimalism.\n\n## 1. Visual Theme & Atmosphere\n\nRaw, anti-design aesthetic inspired by concrete architecture with unadorned elements, jarring layouts, and functional minimalism.\n\n- **Visual style:** bold\n- **Color stance:** primary, secondary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#DD614C` \u2014 Token from style foundations.\n- **Secondary:** `#DAA144` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#DD614C) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
    },
    {
      id: "neobrutalism",
      name: "Neobrutalism",
      category: "Bold & Expressive",
      description: "Modern take on brutalism with bold borders, vivid accent colors, and raw, high-contrast layouts on warm surfaces.",
      tokens: {
        "--bg": "#fff4cf",
        "--surface": "#fffaf0",
        "--surface-warm": "#ffdca8",
        "--fg": "#2a1810",
        "--fg-2": "#593625",
        "--muted": "#8a6652",
        "--meta": "#d24b1f",
        "--border": "#d9aa7a",
        "--border-soft": "#efd0ab",
        "--accent": "#d24b1f",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#3d8f4f",
        "--warn": "#f2a93b",
        "--danger": "#b83a2f",
        "--font-display": "Arial Black, Impact, sans-serif",
        "--font-body": "Inter, system-ui, sans-serif",
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "24px",
        "--text-2xl": "36px",
        "--text-3xl": "54px",
        "--text-4xl": "76px",
        "--leading-body": "1.52",
        "--leading-tight": "1.06",
        "--tracking-display": "0",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "96px",
        "--section-y-tablet": "68px",
        "--section-y-phone": "48px",
        "--radius-sm": "4px",
        "--radius-md": "8px",
        "--radius-lg": "12px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "6px 6px 0 rgba(42, 24, 16, 0.26)",
        "--focus-ring": "0 0 0 4px rgba(210, 75, 31, 0.28)",
        "--motion-fast": "150ms",
        "--motion-base": "240ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1180px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Neobrutalism\n\n> Category: Bold & Expressive\n> Modern take on brutalism with bold borders, vivid accent colors, and raw, high-contrast layouts on warm surfaces.\n\n## 1. Visual Theme & Atmosphere\n\nModern take on brutalism with bold borders, vivid accent colors, and raw, high-contrast layouts on warm surfaces.\n\n- **Visual style:** modern, clean, high-contrast\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#FDC800` \u2014 Token from style foundations.\n- **Secondary:** `#432DD7` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FBFBF9` \u2014 Token from style foundations.\n- **Text:** `#1C293C` \u2014 Token from style foundations.\n- **Neutral:** `#FBFBF9` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#FDC800) for CTA emphasis.\n- Use Surface (#FBFBF9) for large backgrounds and cards."
    },
    {
      id: "mono",
      name: "Mono",
      category: "Modern & Minimal",
      description: "Monospace-driven, matrix-inspired design with high-contrast elements, compact density, and a hacker-chic aesthetic.",
      tokens: {
        "--bg": "#ffffff",
        "--surface": "#f7f7f7",
        "--surface-warm": "#eeeeee",
        "--fg": "#111111",
        "--fg-2": "#3a3a3a",
        "--muted": "#707070",
        "--meta": "#111111",
        "--border": "#d9d9d9",
        "--border-soft": "#eeeeee",
        "--accent": "#111111",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#168a46",
        "--warn": "#b7791f",
        "--danger": "#c53030",
        "--font-display": '"IBM Plex Mono", ui-monospace, monospace',
        "--font-body": '"IBM Plex Mono", ui-monospace, monospace',
        "--font-mono": '"IBM Plex Mono", ui-monospace, monospace',
        "--text-xs": "11px",
        "--text-sm": "12px",
        "--text-base": "14px",
        "--text-lg": "16px",
        "--text-xl": "20px",
        "--text-2xl": "28px",
        "--text-3xl": "40px",
        "--text-4xl": "56px",
        "--leading-body": "1.45",
        "--leading-tight": "1.06",
        "--tracking-display": "-0.025em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "80px",
        "--section-y-tablet": "60px",
        "--section-y-phone": "42px",
        "--radius-sm": "4px",
        "--radius-md": "8px",
        "--radius-lg": "12px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 16px 40px rgba(0, 0, 0, 0.10)",
        "--focus-ring": "0 0 0 3px rgba(17, 17, 17, 0.18)",
        "--motion-fast": "100ms",
        "--motion-base": "180ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1280px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Mono\n\n> Category: Modern & Minimal\n> Monospace-driven, matrix-inspired design with high-contrast elements, compact density, and a hacker-chic aesthetic.\n\n## 1. Visual Theme & Atmosphere\n\nMonospace-driven, matrix-inspired design with high-contrast elements, compact density, and a hacker-chic aesthetic.\n\n- **Visual style:** minimal, clean, high-contrast, playful, matrix\n- **Color stance:** primary, secondary, success, warning, danger, info\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#37F712` \u2014 Token from style foundations.\n- **Secondary:** `#00A6F4` \u2014 Token from style foundations.\n- **Success:** `#00A63D` \u2014 Token from style foundations.\n- **Warning:** `#FE9900` \u2014 Token from style foundations.\n- **Danger:** `#FF2157` \u2014 Token from style foundations.\n- **Surface:** `#E7E5E4` \u2014 Token from style foundations.\n- **Text:** `#78716B` \u2014 Token from style foundations.\n- **Neutral:** `#E7E5E4` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#37F712) for CTA emphasis.\n- Use Surface (#E7E5E4) for large backgrounds and cards."
    },
    {
      id: "minimal",
      name: "Minimal",
      category: "Modern & Minimal",
      description: "Stripped-back design emphasizing whitespace, clean typography, and restrained color for maximum clarity and focus.",
      tokens: {
        "--bg": "#ffffff",
        "--surface": "#fafafa",
        "--surface-warm": "#f5f5f5",
        "--fg": "#111111",
        "--fg-2": "#3a3a3a",
        "--muted": "#777777",
        "--meta": "#111111",
        "--border": "#e2e2e2",
        "--border-soft": "#eeeeee",
        "--accent": "#111111",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#168a46",
        "--warn": "#b7791f",
        "--danger": "#c53030",
        "--font-display": "Inter, system-ui, sans-serif",
        "--font-body": "Inter, system-ui, sans-serif",
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "22px",
        "--text-2xl": "32px",
        "--text-3xl": "48px",
        "--text-4xl": "64px",
        "--leading-body": "1.55",
        "--leading-tight": "1.08",
        "--tracking-display": "-0.02em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "112px",
        "--section-y-tablet": "80px",
        "--section-y-phone": "56px",
        "--radius-sm": "2px",
        "--radius-md": "4px",
        "--radius-lg": "8px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 12px 30px rgba(0, 0, 0, 0.08)",
        "--focus-ring": "0 0 0 3px rgba(17, 17, 17, 0.18)",
        "--motion-fast": "140ms",
        "--motion-base": "220ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1120px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Minimal\n\n> Category: Modern & Minimal\n> Stripped-back design emphasizing whitespace, clean typography, and restrained color for maximum clarity and focus.\n\n## 1. Visual Theme & Atmosphere\n\nStripped-back design emphasizing whitespace, clean typography, and restrained color for maximum clarity and focus.\n\n- **Visual style:** minimal, clean, bold\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#0C0C09` \u2014 Token from style foundations.\n- **Secondary:** `#312C85` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#F4F4F1` \u2014 Token from style foundations.\n- **Text:** `#0C0C09` \u2014 Token from style foundations.\n- **Neutral:** `#F4F4F1` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#0C0C09) for CTA emphasis.\n- Use Surface (#F4F4F1) for large backgrounds and cards."
    },
    {
      id: "glassmorphism",
      name: "Glassmorphism",
      category: "Morphism & Effects",
      description: "Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.",
      tokens: {
        "--bg": "#eef6ff",
        "--surface": "rgba(255, 255, 255, 0.74)",
        "--surface-warm": "rgba(238, 246, 255, 0.72)",
        "--fg": "#102033",
        "--fg-2": "#34465f",
        "--muted": "#60708a",
        "--meta": "#4f8cff",
        "--border": "rgba(255, 255, 255, 0.64)",
        "--border-soft": "rgba(255, 255, 255, 0.38)",
        "--accent": "#4f8cff",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#22c55e",
        "--warn": "#f59e0b",
        "--danger": "#ef4444",
        "--font-display": "Inter, system-ui, sans-serif",
        "--font-body": "Inter, system-ui, sans-serif",
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "24px",
        "--text-2xl": "36px",
        "--text-3xl": "54px",
        "--text-4xl": "76px",
        "--leading-body": "1.55",
        "--leading-tight": "1.04",
        "--tracking-display": "-0.025em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "104px",
        "--section-y-tablet": "72px",
        "--section-y-phone": "52px",
        "--radius-sm": "16px",
        "--radius-md": "24px",
        "--radius-lg": "36px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 24px 80px rgba(79, 140, 255, 0.18)",
        "--focus-ring": "0 0 0 4px rgba(79, 140, 255, 0.28)",
        "--motion-fast": "180ms",
        "--motion-base": "280ms",
        "--ease-standard": "cubic-bezier(0.22, 1, 0.36, 1)",
        "--container-max": "1180px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Glassmorphism\n\n> Category: Morphism & Effects\n> Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.\n\n## 1. Visual Theme & Atmosphere\n\nFrosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.\n\n- **Visual style:** clean, high-contrast, bold, enterprise, liquidglass effect, glassmorphism\n- **Color stance:** primary, neutral, success, warning, danger, info, surface/subtle layers\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#1856FF` \u2014 Token from style foundations.\n- **Secondary:** `#3A344E` \u2014 Token from style foundations.\n- **Success:** `#07CA6B` \u2014 Token from style foundations.\n- **Warning:** `#E89558` \u2014 Token from style foundations.\n- **Danger:** `#EA2143` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#141414` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#1856FF) for CTA emphasis."
    },
    {
      id: "luxury",
      name: "Luxury",
      category: "Professional & Corporate",
      description: "High-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.",
      tokens: {
        "--bg": "#080706",
        "--surface": "#151310",
        "--surface-warm": "#241e14",
        "--fg": "#fff8ea",
        "--fg-2": "#d8cdb7",
        "--muted": "#9f927c",
        "--meta": "#c6a15b",
        "--border": "#3a3020",
        "--border-soft": "#282217",
        "--accent": "#c6a15b",
        "--accent-on": "#080706",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#5fa36a",
        "--warn": "#d8a94f",
        "--danger": "#d85a52",
        "--font-display": '"Didot", "Bodoni 72", Georgia, serif',
        "--font-body": '"Avenir Next", Inter, sans-serif',
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "19px",
        "--text-xl": "28px",
        "--text-2xl": "44px",
        "--text-3xl": "68px",
        "--text-4xl": "96px",
        "--leading-body": "1.6",
        "--leading-tight": "0.98",
        "--tracking-display": "-0.015em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "120px",
        "--section-y-tablet": "84px",
        "--section-y-phone": "60px",
        "--radius-sm": "8px",
        "--radius-md": "14px",
        "--radius-lg": "24px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 30px 90px rgba(0, 0, 0, 0.52)",
        "--focus-ring": "0 0 0 4px rgba(198, 161, 91, 0.30)",
        "--motion-fast": "180ms",
        "--motion-base": "300ms",
        "--ease-standard": "cubic-bezier(0.16, 1, 0.3, 1)",
        "--container-max": "1160px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Luxury\n\n> Category: Professional & Corporate\n> High-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.\n\n## 1. Visual Theme & Atmosphere\n\nHigh-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.\n\n- **Visual style:** modern, bold, big headings\n- **Color stance:** primary\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#FAFAFA` \u2014 Token from style foundations.\n- **Secondary:** `#FAFAFA` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#000000` \u2014 Token from style foundations.\n- **Text:** `#FFFFFF` \u2014 Token from style foundations.\n- **Neutral:** `#000000` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#FAFAFA) for CTA emphasis.\n- Use Surface (#000000) for large backgrounds and cards.\n- Keep body copy on Text (#FFFFFF) for legibility.\n\n## 3. Typography"
    },
    {
      id: "doodle",
      name: "Doodle",
      category: "Creative & Artistic",
      description: "Hand-drawn, sketch-like style with doodles, handwritten fonts, and imperfect lines for a playful, informal feel.",
      tokens: {
        "--bg": "#fff8d7",
        "--surface": "#ffffff",
        "--surface-warm": "#ffef9f",
        "--fg": "#1d1836",
        "--fg-2": "#4c426c",
        "--muted": "#796f91",
        "--meta": "#ff6b00",
        "--border": "#eadfba",
        "--border-soft": "#f5eccd",
        "--accent": "#ff6b00",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#2e9d57",
        "--warn": "#ffb020",
        "--danger": "#e5484d",
        "--font-display": '"Comic Sans MS", "Trebuchet MS", sans-serif',
        "--font-body": '"Comic Sans MS", "Trebuchet MS", sans-serif',
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "24px",
        "--text-2xl": "36px",
        "--text-3xl": "54px",
        "--text-4xl": "76px",
        "--leading-body": "1.52",
        "--leading-tight": "1.06",
        "--tracking-display": "-0.025em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "96px",
        "--section-y-tablet": "68px",
        "--section-y-phone": "48px",
        "--radius-sm": "10px",
        "--radius-md": "16px",
        "--radius-lg": "24px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 18px 44px rgba(29, 24, 54, 0.14)",
        "--focus-ring": "0 0 0 4px rgba(255, 107, 0, 0.26)",
        "--motion-fast": "150ms",
        "--motion-base": "240ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1180px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Doodle\n\n> Category: Creative & Artistic\n> Hand-drawn, sketch-like style with doodles, handwritten fonts, and imperfect lines for a playful, informal feel.\n\n## 1. Visual Theme & Atmosphere\n\nHand-drawn, sketch-like style with doodles, handwritten fonts, and imperfect lines for a playful, informal feel.\n\n- **Visual style:** playful\n- **Color stance:** primary, secondary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#49B6E5` \u2014 Token from style foundations.\n- **Secondary:** `#263D5B` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#49B6E5) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
    },
    {
      id: "trading-terminal",
      name: "Trading Terminal Design System",
      category: "Themed & Unique",
      description: "Bloomberg-style financial trading terminal. Dark-only, data-dense, cyan/coral buy/sell signals. Everything readable at a glance from two meters away.",
      tokens: {
        "--bg": "#070b12",
        "--surface": "#101826",
        "--surface-warm": "#162238",
        "--fg": "#f8fafc",
        "--fg-2": "#cbd5e1",
        "--muted": "#8492a6",
        "--meta": "#38bdf8",
        "--border": "#263246",
        "--border-soft": "#1c2638",
        "--accent": "#38bdf8",
        "--accent-on": "#03111a",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#22c55e",
        "--warn": "#f59e0b",
        "--danger": "#ef4444",
        "--font-display": "Inter, system-ui, sans-serif",
        "--font-body": "Inter, system-ui, sans-serif",
        "--font-mono": '"Roboto Mono", "SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "11px",
        "--text-sm": "12px",
        "--text-base": "14px",
        "--text-lg": "16px",
        "--text-xl": "20px",
        "--text-2xl": "28px",
        "--text-3xl": "40px",
        "--text-4xl": "56px",
        "--leading-body": "1.45",
        "--leading-tight": "1.08",
        "--tracking-display": "-0.01em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "80px",
        "--section-y-tablet": "60px",
        "--section-y-phone": "42px",
        "--radius-sm": "4px",
        "--radius-md": "8px",
        "--radius-lg": "12px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 24px 80px rgba(0, 0, 0, 0.42)",
        "--focus-ring": "0 0 0 4px rgba(56, 189, 248, 0.28)",
        "--motion-fast": "90ms",
        "--motion-base": "160ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1320px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Trading Terminal Design System\n\n> Category: Themed & Unique\n> Bloomberg-style financial trading terminal. Dark-only, data-dense, cyan/coral buy/sell signals. Everything readable at a glance from two meters away.\n\n## 1. Visual Theme & Atmosphere\n\nA professional-grade financial data terminal. Dense, information-rich layouts designed for traders who need to monitor multiple markets simultaneously. Dark surfaces reduce eye strain during long sessions. Cyan accent (#00D4AA) signals positive/buy, coral (#FF4757) signals negative/sell. Everything readable at a glance from two meters away.\n\n- **Visual style:** dense, data-first, professional\n- **Color stance:** dark surfaces with high-contrast data colors\n- **Design intent:** keep outputs recognizable to this style family while preserving usability and readability\n\n### Prior Art\n\nBloomberg Terminal, Refinitiv Eikon, FactSet, TradingView Pro. All share: dark-only surfaces, monospace data fonts, tabular layouts with no decorative spacing, and color-coded buy/sell signals.\n\n## 2. Color Palette & Roles\n\n### Surface Palette\n\n| Token | Hex | Usage |\n|-------|-----|-------|\n| Background | `#0D0D0D` | Primary canvas |"
    },
    {
      id: "corporate",
      name: "Corporate",
      category: "Professional & Corporate",
      description: "Professional, brand-aligned design with structured grids, minimalist layouts, and consistent enterprise patterns.",
      tokens: {
        "--bg": "#f5f8ff",
        "--surface": "#ffffff",
        "--surface-warm": "#eaf1ff",
        "--fg": "#101828",
        "--fg-2": "#344054",
        "--muted": "#667085",
        "--meta": "#2563eb",
        "--border": "#d7e0ef",
        "--border-soft": "#edf2f8",
        "--accent": "#2563eb",
        "--accent-on": "#ffffff",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#16a34a",
        "--warn": "#f59e0b",
        "--danger": "#ef4444",
        "--font-display": "Inter, system-ui, sans-serif",
        "--font-body": "Inter, system-ui, sans-serif",
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "24px",
        "--text-2xl": "36px",
        "--text-3xl": "54px",
        "--text-4xl": "76px",
        "--leading-body": "1.52",
        "--leading-tight": "1.06",
        "--tracking-display": "-0.025em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "96px",
        "--section-y-tablet": "68px",
        "--section-y-phone": "48px",
        "--radius-sm": "10px",
        "--radius-md": "16px",
        "--radius-lg": "24px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 20px 52px rgba(16, 24, 40, 0.11)",
        "--focus-ring": "0 0 0 4px rgba(37, 99, 235, 0.22)",
        "--motion-fast": "150ms",
        "--motion-base": "240ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1180px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Corporate\n\n> Category: Professional & Corporate\n> Professional, brand-aligned design with structured grids, minimalist layouts, and consistent enterprise patterns.\n\n## 1. Visual Theme & Atmosphere\n\nProfessional, brand-aligned design with structured grids, minimalist layouts, and consistent enterprise patterns.\n\n- **Visual style:** enterprise, premium\n- **Color stance:** primary, neutral, success, warning, danger\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#3B82F6` \u2014 Token from style foundations.\n- **Secondary:** `#8B5CF6` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#3B82F6) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards."
    },
    {
      id: "neon",
      name: "Neon",
      category: "Morphism & Effects",
      description: "Electric neon glow effects with high-contrast color pairings for bold, attention-grabbing interfaces.",
      tokens: {
        "--bg": "#070711",
        "--surface": "#111126",
        "--surface-warm": "#1e1540",
        "--fg": "#f8f7ff",
        "--fg-2": "#d6ccff",
        "--muted": "#9d8ad4",
        "--meta": "#c084fc",
        "--border": "#34265e",
        "--border-soft": "#241c42",
        "--accent": "#c084fc",
        "--accent-on": "#13051f",
        "--accent-hover": "color-mix(in oklab, var(--accent), black 8%)",
        "--accent-active": "color-mix(in oklab, var(--accent), black 14%)",
        "--success": "#39ff88",
        "--warn": "#fff34d",
        "--danger": "#ff4d8d",
        "--font-display": "Inter, system-ui, sans-serif",
        "--font-body": "Inter, system-ui, sans-serif",
        "--font-mono": '"SF Mono", ui-monospace, Menlo, monospace',
        "--text-xs": "12px",
        "--text-sm": "14px",
        "--text-base": "16px",
        "--text-lg": "18px",
        "--text-xl": "24px",
        "--text-2xl": "36px",
        "--text-3xl": "54px",
        "--text-4xl": "76px",
        "--leading-body": "1.52",
        "--leading-tight": "1.06",
        "--tracking-display": "-0.025em",
        "--space-1": "4px",
        "--space-2": "8px",
        "--space-3": "12px",
        "--space-4": "16px",
        "--space-5": "20px",
        "--space-6": "24px",
        "--space-8": "32px",
        "--space-12": "48px",
        "--section-y-desktop": "96px",
        "--section-y-tablet": "68px",
        "--section-y-phone": "48px",
        "--radius-sm": "10px",
        "--radius-md": "16px",
        "--radius-lg": "24px",
        "--radius-pill": "9999px",
        "--elev-flat": "none",
        "--elev-ring": "0 0 0 1px var(--border)",
        "--elev-raised": "0 24px 80px rgba(192, 132, 252, 0.22)",
        "--focus-ring": "0 0 0 4px rgba(192, 132, 252, 0.32)",
        "--motion-fast": "150ms",
        "--motion-base": "240ms",
        "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "--container-max": "1180px",
        "--container-gutter-desktop": "36px",
        "--container-gutter-tablet": "24px",
        "--container-gutter-phone": "16px"
      },
      designMd: "# Design System Inspired by Neon\n\n> Category: Morphism & Effects\n> Electric neon glow effects with high-contrast color pairings for bold, attention-grabbing interfaces.\n\n## 1. Visual Theme & Atmosphere\n\nElectric neon glow effects with high-contrast color pairings for bold, attention-grabbing interfaces.\n\n- **Visual style:** high-contrast\n- **Color stance:** primary, secondary\n- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.\n\n## 2. Color\n\n- **Primary:** `#BBF351` \u2014 Token from style foundations.\n- **Secondary:** `#00BCFF` \u2014 Token from style foundations.\n- **Success:** `#16A34A` \u2014 Token from style foundations.\n- **Warning:** `#D97706` \u2014 Token from style foundations.\n- **Danger:** `#DC2626` \u2014 Token from style foundations.\n- **Surface:** `#FFFFFF` \u2014 Token from style foundations.\n- **Text:** `#111827` \u2014 Token from style foundations.\n- **Neutral:** `#FFFFFF` \u2014 Derived from the surface token for official format compatibility.\n\n- Favor Primary (#BBF351) for CTA emphasis.\n- Use Surface (#FFFFFF) for large backgrounds and cards.\n- Keep body copy on Text (#111827) for legibility.\n\n## 3. Typography\n\n- **Scale:** 14/16/18/24/32/40"
    }
  ];

  // panel/mode.ts
  var DESIGN_TYPES = ["wireframe", "hi-fi", "prototype", "deck", "custom"];
  var TYPE_HINT = {
    wireframe: "structure and navigation only \u2014 no final colour, type or copy",
    "hi-fi": "static screens with the full design system (tokens, type, colour)",
    prototype: "a real, interactive app with a dev server, all five states and motion",
    deck: "a presentation deck (HTML slides) with its own nav and print layout",
    custom: "ask what is being made, then choose the closest approach"
  };
  var FIDELITIES = ["wireframe", "hi-fi", "interactive"];
  var FIDELITY_HINT = {
    wireframe: "low fidelity: boxes, flows and labels, no polish",
    "hi-fi": "final visual quality: tokens, type, colour, spacing",
    interactive: "hi-fi plus working interactions and transitions"
  };
  var FIDELITY_OPTIONS = [
    ["hi-fi", "Hi-fi"],
    ["wireframe", "Wireframe"],
    ["interactive", "Interactive"]
  ];
  var NO_DESIGN_SYSTEM = "No design system";
  function findDesignSystem(id) {
    if (!id) return null;
    return DESIGN_SYSTEMS.find((preset) => preset.id === id) ?? null;
  }
  function designSystemLabel(id) {
    return findDesignSystem(id)?.name ?? NO_DESIGN_SYSTEM;
  }
  function filterDesignSystems(query, presets = DESIGN_SYSTEMS) {
    const needle = query.trim().toLowerCase();
    if (!needle) return presets.slice();
    return presets.filter(
      (preset) => preset.name.toLowerCase().includes(needle) || preset.category.toLowerCase().includes(needle) || preset.description.toLowerCase().includes(needle)
    );
  }
  function designSystemGroups(presets) {
    const order = [];
    const groups = /* @__PURE__ */ new Map();
    for (const preset of presets) {
      let bucket = groups.get(preset.category);
      if (!bucket) {
        bucket = [];
        groups.set(preset.category, bucket);
        order.push(preset.category);
      }
      bucket.push(preset);
    }
    return order.map((category) => ({ category, presets: groups.get(category) }));
  }
  var SWATCH_TOKEN_ORDER = [
    "--bg",
    "--surface",
    "--surface-warm",
    "--accent",
    "--accent-hover",
    "--accent-active",
    "--fg",
    "--muted",
    "--border",
    "--success",
    "--warn",
    "--danger"
  ];
  function isColorTokenValue(value) {
    const text = value.trim().toLowerCase();
    return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(text) || /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/.test(text);
  }
  function designSystemSwatches(preset, max = 8) {
    const preferred = SWATCH_TOKEN_ORDER.filter((name) => isColorTokenValue(preset.tokens[name] ?? ""));
    const extras = Object.keys(preset.tokens).filter(
      (name) => !SWATCH_TOKEN_ORDER.includes(name) && isColorTokenValue(preset.tokens[name])
    );
    return [...preferred, ...extras].slice(0, max).map((name) => ({ name, value: preset.tokens[name] }));
  }
  var DEFAULT_MODE = { on: false, type: "hi-fi", direction: "auto", fidelity: "hi-fi", brief: "" };
  function parseDesignArgs(raw) {
    const text = raw.trim();
    const [first = "", ...rest] = text.split(/\s+/);
    const brief = rest.join(" ");
    if (/^off$/i.test(first)) return { on: false, type: null, brief };
    if (first === "" || /^on$/i.test(first)) return { on: true, type: null, brief };
    const type = DESIGN_TYPES.find((candidate) => candidate === first.toLowerCase());
    if (type) return { on: true, type, brief };
    return { on: true, type: null, brief: text };
  }
  function modeStorageKey(sessionId) {
    return sessionId ? `mode/${sessionId}` : null;
  }
  function designMarkerKey(sessionId) {
    return sessionId ? `design/${sessionId}` : null;
  }
  function designMarkerValue(at = /* @__PURE__ */ new Date()) {
    return { on: true, at: at.toISOString() };
  }
  function designSessionIdFromKey(key) {
    const prefix = "design/";
    return key.startsWith(prefix) && key.length > prefix.length ? key.slice(prefix.length) : null;
  }
  var PLACEHOLDER_URL = "https://design.local/session";
  function isHttpUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }
  function attachUrl(value) {
    return isHttpUrl(value) ? value : PLACEHOLDER_URL;
  }
  function fileBaseName(path) {
    const trimmed = path.replace(/[\\/]+$/, "");
    return trimmed.split(/[\\/]/).pop() || path;
  }
  function projectHttpUrl(config) {
    const url = config?.url?.trim();
    return isHttpUrl(url) ? url : null;
  }
  function projectReferenceChip(input) {
    const handle = input.projectId?.trim() || fileBaseName(input.dir);
    return {
      providerId: "design-studio",
      id: `project-${handle}`.slice(0, 110),
      title: input.name,
      url: input.url,
      text: `Project reference: ${input.dir}`
    };
  }
  function fileReferenceChip(input) {
    const base = fileBaseName(input.path);
    return {
      providerId: "design-studio",
      id: `file-${base}`.slice(0, 128),
      title: base,
      url: input.url,
      text: input.dropped ? `File reference: ${base} (dropped into Design Studio)` : `File reference: ${input.path}`
    };
  }
  function popoverStep(current, count, delta) {
    if (count <= 0) return -1;
    if (current < 0) return delta > 0 ? 0 : count - 1;
    return (current + delta + count) % count;
  }
  function seedModeValue(type, brief) {
    return { on: true, type, brief: brief.slice(0, 2e3) };
  }
  function seedSessionData(type, brief) {
    return { mode: seedModeValue(type, brief) };
  }
  function directionLabel(value) {
    return value === "auto" ? "Auto (infer from the brief)" : DIRECTIONS[value].name;
  }
  function designSessionPrompt(spec, config) {
    const brief = spec.brief.trim();
    const preset = findDesignSystem(spec.designSystemId);
    const lines = [
      `Design brief \u2014 ${spec.type}: ${TYPE_HINT[spec.type]}`,
      `Visual direction: ${directionLabel(spec.direction)}. Lock it before building.`,
      `Fidelity: ${spec.fidelity} \u2014 ${FIDELITY_HINT[spec.fidelity]}.`,
      brief ? `Brief: ${brief}` : "Brief: none given \u2014 ask at most 5 questions with sensible defaults, then proceed."
    ];
    if (preset) {
      lines.push(
        `Design system: ${preset.name} (${preset.category}) \u2014 its tokens and DESIGN.md are authoritative; use them as given and keep every screen inside the system.`
      );
    }
    lines.push("");
    if (config) {
      lines.push(
        `Project: ${config.name ?? "(unnamed)"}${config.url ? ` at ${config.url}` : ""}.`,
        config.url ? "Open it in the Design Studio browser before anything else." : "Open the project in the Design Studio browser before anything else.",
        "Design system: the project's DESIGN.md / tokens.css are authoritative; keep every screen inside them."
      );
    } else {
      lines.push(
        "No .design-studio.json yet \u2014 create the project and its design system as part of this first build:",
        "1. Scaffold the project for this type: create the files and scripts it needs (for prototype/interactive, a real app with a dev server; for a deck, HTML slides).",
        '2. Write `.design-studio.json` at the project root: { "version": 1, "name": "...", "type": "...", "url": "<the URL it will be served on>", "command": "<dev command>", "harness": { "direction": "...", "fidelity": "..." } }.',
        '3. Install dependencies and start it BOUND TO ALL INTERFACES (for Vite: `vite --host`), then report the URL. The in-app headless browser resolves localhost to IPv4, so an IPv6-only server shows "This site can\'t be reached".',
        "Keep every screen inside DESIGN.md / tokens.css once created."
      );
    }
    lines.push(
      "Workflow: the user points at elements in the live browser; each click arrives as a reference chip. Apply what it asks for and keep the system consistent.",
      "",
      VERIFY_PROTOCOL
    );
    return lines.join("\n");
  }
  function buildModeChip(sessionId, mode, config) {
    const id = `design-mode-${(sessionId || "adhoc").slice(0, 110)}`;
    const lines = [
      "Design Mode: ON",
      `Artifact type: ${mode.type} \u2014 ${TYPE_HINT[mode.type]}`,
      `Visual direction: ${directionLabel(mode.direction)} \xB7 Fidelity: ${mode.fidelity}`,
      mode.brief ? `Brief: ${mode.brief}` : "Brief: the user will say or type it next.",
      config ? `Project: ${config.name ?? "(unnamed)"}${config.url ? ` \xB7 ${config.url}` : ""} \xB7 configured type: ${config.type ?? mode.type}` : "Project: no .design-studio.json yet \u2014 scaffold the project and write one.",
      "Design system: DESIGN.md and tokens.css are authoritative when present; keep every screen inside them.",
      "Workflow: the user clicks elements in the live browser; each click arrives as a reference chip. Apply the change they ask for and keep the system consistent.",
      VERIFY_PROTOCOL
    ];
    return {
      providerId: "design-studio",
      id,
      title: `Design Mode \xB7 ${mode.type}`,
      url: attachUrl(config?.url),
      text: lines.join("\n").slice(0, 16e3),
      data: {
        mode: { on: true, type: mode.type, direction: mode.direction, fidelity: mode.fidelity, brief: mode.brief.slice(0, 2e3) },
        project: config ? { name: config.name ?? null, type: config.type ?? null, url: config.url ?? null } : null
      }
    };
  }

  // panel/reference-draft.ts
  function addDraftReference(existing, reference) {
    if (existing.some((item) => item.kind === reference.kind && item.path === reference.path)) return [...existing];
    return [...existing, { ...reference }];
  }
  function removeDraftReference(existing, id) {
    return existing.filter((item) => item.id !== id);
  }
  var PAYLOAD_LIMIT = 16e3;
  function buildReferenceSubmission(text, data, references) {
    let submittedText = text;
    let submittedData = data;
    if (references.length > 0) {
      const retained = references.map((reference) => ({ ...reference }));
      submittedText += "\n\nDesign Studio references (paths only; no file contents uploaded):\n" + retained.map(
        (reference) => `- ${reference.kind}: ${JSON.stringify(reference.path)}; source directory: ${JSON.stringify(reference.sourceDirectory)}; label: ${JSON.stringify(reference.label)}`
      ).join("\n");
      submittedData = data !== null && typeof data === "object" && !Array.isArray(data) ? { ...data, references: retained } : { ...data === void 0 ? {} : { baseData: data }, references: retained };
    }
    if (submittedText.length > PAYLOAD_LIMIT) {
      throw new Error("Design prompt exceeds 16000 characters. Shorten the brief or remove references before sending.");
    }
    let serialized;
    try {
      serialized = JSON.stringify(submittedData);
    } catch {
      throw new Error("Design metadata must be serializable JSON. Remove invalid reference metadata before sending.");
    }
    if (serialized !== void 0 && serialized.length > PAYLOAD_LIMIT) {
      throw new Error("Design metadata exceeds 16000 JSON characters. Shorten the brief or remove references before sending.");
    }
    return { text: submittedText, data: submittedData };
  }

  // panel/main.ts
  var POLL_MS = 900;
  var PAGE_TYPE_LABELS = {
    wireframe: "Wireframe",
    "hi-fi": "Hi-fi screens",
    prototype: "Prototype",
    deck: "Slide deck",
    custom: "Custom"
  };
  var IDEAS = {
    prototype: [
      { title: "Gamified Habit App", description: "Daily streaks with playful rewards", prompt: "A gamified habit-tracking app with daily streaks, points, and playful rewards." },
      { title: "Interactive Dashboard", description: "Live metrics, filters and charts", prompt: "An interactive dashboard with live metrics, filters, and charts." },
      { title: "Booking Flow", description: "Pick a slot, confirm, pay", prompt: "An interactive booking flow: choose a date and slot, confirm the details, and pay." }
    ],
    "hi-fi": [
      { title: "Luxury Property Website", description: "Elegant listings and detail pages", prompt: "A luxury property website with elegant listings, a photo gallery, and property detail pages." },
      { title: "Product Pricing Page", description: "Three tiers, clear comparison", prompt: "A product pricing page with three tiers and a clear feature comparison." },
      { title: "Marketing Landing Page", description: "Hero, features and a call to action", prompt: "A marketing landing page with a hero, feature highlights, and a strong call to action." }
    ],
    deck: [
      { title: "New Hire Onboarding Guide", description: "A welcome deck for the first week", prompt: "A new-hire onboarding deck covering the first week, the tools, and the team." },
      { title: "Q3 Product Review", description: "Results, learnings and next bets", prompt: "A Q3 product review deck: results, learnings, and the next bets." },
      { title: "Sales Pitch", description: "Problem, solution, proof, pricing", prompt: "A sales pitch deck: problem, solution, proof, and pricing." }
    ],
    wireframe: [
      { title: "Checkout Flow", description: "Cart to confirmation, boxes only", prompt: "A wireframe of the checkout flow from cart to confirmation, boxes and labels only." },
      { title: "Onboarding Steps", description: "Sign-up to first value", prompt: "A wireframe of the onboarding steps from sign-up to first value." },
      { title: "App Navigation", description: "Tabs, menus and top-level screens", prompt: "A wireframe of the app navigation: tabs, menus, and the top-level screens." }
    ],
    custom: [
      { title: "Marketing Page", description: "A single page that sells", prompt: "A single marketing page that explains the product and asks for one clear action." },
      { title: "Mobile App", description: "A multi-screen product", prompt: "A multi-screen mobile app for the core flow." },
      { title: "Data Tool", description: "A dashboard or console", prompt: "A data tool: a dashboard or console for the team to read at a glance." }
    ]
  };
  var state = {
    surface: "panel",
    directory: null,
    sessionId: null,
    mode: { ...DEFAULT_MODE },
    resolveAllowed: false,
    config: null,
    configPath: null,
    /**
     * The directory `config` was read for. `onDirectory` keeps the last config
     * until the fresh read resolves, so a stale cached config is only ever used
     * when it belongs to the CURRENT directory (`currentConfig()`).
     */
    configDir: null,
    url: "about:blank",
    title: "",
    windowOpen: false,
    /**
     * True while OUR side is bringing the window up: an open in flight, or the
     * whole Design Mode ON transition (which awaits the persist and the marker
     * writes before it opens). The close-detection below flips Design Mode OFF
     * when `/state` reports `windowOpen:false` while the mode is ON — but not
     * while we are the ones opening the window, so this gates it. Nothing else
     * consults it: it never suppresses an explicit user open.
     */
    pendingOpen: false,
    lastSeq: 0,
    /** The current session's live `SessionSnapshot.busy`, from `host.onSession`. */
    sessionBusy: false,
    /** Project dirs whose dev server THIS panel started (`/open` reported `started`). */
    startedServers: /* @__PURE__ */ new Set(),
    /**
     * A stop waiting for the session to go idle (Design Mode OFF happened while
     * busy). The queued REQUEST — its directory and manual mode — is preserved,
     * so honouring it later neither loses the manual flag (an empty ownership
     * set would then refuse it forever) nor targets the wrong directory.
     */
    pendingStop: null,
    /**
     * Current preview-dev-server reachability for the row's Start/Stop control.
     * `null` = unknown: nothing has been read yet (or a start answer carried no
     * `up`), and the icon must render as checking — never masquerade as stopped.
     */
    serverStatus: null,
    /** True while a manual start/stop is in flight. */
    serverPending: false,
    /** Last error from a server start/status action (for screen-reader announcement). */
    serverError: null,
    // ---- full-page creation surface ----
    /** The registered projects, as the working-directory selector renders them. */
    projects: null,
    /** The selected creation type; drives the headline, chip and the idea cards. */
    pageType: "hi-fi",
    pageDirection: "auto",
    pageFidelity: "hi-fi",
    prompt: "",
    references: [],
    /** An actionable error from a failed scaffold (the session still starts). */
    pageError: "",
    pageBusy: false,
    /** The chosen registered project; `null` means the current project. */
    selectedProjectId: null,
    typeMenuOpen: false,
    dirMenuOpen: false,
    /** The `+` attach overlay: its open state. */
    attachMenuOpen: false,
    /** The design-system picker panel open in the composer. */
    dsMenuOpen: false,
    /** The chosen design-system preset id, or null for "No design system". */
    pageDesignSystemId: null,
    // ---- design projects & chats (the lists below the composer) ----
    /** The design-chats list: sessions across the projects whose Design Mode is ON. */
    designChats: null,
    /**
     * The id of the project whose chats the merged list is filtered to, or null
     * for the full list. Set by clicking a project row (which also makes it the
     * working target); cleared by `Show all`. It NEVER starts a session.
     */
    projectFilter: null
  };
  var hintEl;
  var sessionLineEl = null;
  var pageBody = null;
  var statusRoot = null;
  var modeToggleBtn = null;
  var barEl = null;
  var serverBtn = null;
  var serverAnnounceEl = null;
  var promptEl = null;
  var sendEl = null;
  var accentFillEl = null;
  var pageEnter = true;
  var dsQuery = "";
  var dsHighlight = null;
  var attachPathDraft = "";
  var referenceError = "";
  var referencePending = false;
  var referenceSlow = false;
  var referenceRequest = 0;
  var referenceLiveEl = null;
  var referenceFocusId = null;
  var DROP_PATH_MESSAGE = "Paste an accessible file path using + \u2192 File path. Dropped filenames do not include their filesystem path.";
  function announceReference(message) {
    if (!referenceLiveEl) return;
    referenceLiveEl.textContent = "";
    queueMicrotask(() => {
      if (referenceLiveEl) referenceLiveEl.textContent = message;
    });
  }
  function cancelReferenceValidation() {
    referenceRequest += 1;
    referencePending = false;
    referenceSlow = false;
  }
  var configReadInFlight = false;
  var chatProjects = [];
  var allProjects = [];
  var chatSnapshots = /* @__PURE__ */ new Map();
  var chatOnIds = /* @__PURE__ */ new Set();
  var chatMarkerIds = /* @__PURE__ */ new Set();
  var chatModeKeyIds = /* @__PURE__ */ new Set();
  var chatUnsubscribes = [];
  function q(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function option(value, label) {
    const node = q("option");
    node.value = value;
    node.textContent = label;
    return node;
  }
  var lastStatus = "";
  function setStatus(message, kind = "info") {
    if (kind === "info") return;
    if (message === lastStatus) return;
    lastStatus = message;
    void host.toast({ kind: kind === "error" ? "error" : "info", message });
  }
  function lastUrlKey(dir) {
    return dir ? `lastUrl/${dir}` : null;
  }
  async function loadLastUrl(dir) {
    const key = lastUrlKey(dir);
    if (!key) return null;
    try {
      const value = await host.storage.get(key);
      return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    } catch {
      return null;
    }
  }
  async function saveLastUrl(dir, url) {
    const key = lastUrlKey(dir);
    if (!key) return;
    try {
      await host.storage.set(key, url);
    } catch {
    }
  }
  function modeStoragePayload() {
    return {
      on: state.mode.on,
      type: state.mode.type,
      direction: state.mode.direction,
      fidelity: state.mode.fidelity,
      brief: state.mode.brief.slice(0, 2e3)
    };
  }
  async function saveMode() {
    const key = modeStorageKey(state.sessionId);
    if (!key) return;
    try {
      await host.storage.set(key, modeStoragePayload());
    } catch {
    }
  }
  async function writeDesignMarker() {
    const key = designMarkerKey(state.sessionId);
    if (!key) return;
    try {
      await host.storage.set(key, designMarkerValue());
    } catch {
    }
  }
  async function loadMode() {
    const key = modeStorageKey(state.sessionId);
    if (!key) return;
    try {
      const stored = await host.storage.get(key);
      if (stored && typeof stored === "object") {
        state.mode.on = Boolean(stored.on);
        if (DESIGN_TYPES.includes(stored.type)) state.mode.type = stored.type;
        if (stored.direction !== void 0 && (stored.direction === "auto" || stored.direction in DIRECTIONS)) state.mode.direction = stored.direction;
        if (FIDELITIES.includes(stored.fidelity)) state.mode.fidelity = stored.fidelity;
        state.mode.brief = typeof stored.brief === "string" ? stored.brief : "";
      }
    } catch {
    }
    renderModeUi();
  }
  var pendingOpenHoldSeq = 0;
  async function toggleMode(next, type, brief) {
    const wasOn = state.mode.on;
    state.mode.on = next;
    if (type) state.mode.type = type;
    if (brief !== void 0 && brief !== "") state.mode.brief = brief;
    const hold = next ? ++pendingOpenHoldSeq : 0;
    if (hold) state.pendingOpen = true;
    try {
      await saveMode();
      if (next && !wasOn) await writeDesignMarker();
      renderModeUi();
      if (next) {
        if (state.windowOpen) {
          try {
            await focusLive();
          } catch (error) {
            setStatus(`Focus failed: ${error instanceof Error ? error.message : String(error)}`, "error");
          }
        } else {
          await openCurrentProjectWindow(false);
        }
      } else {
        try {
          await closeLive();
        } catch {
        }
        try {
          await requestDevServerStop();
        } catch {
        }
      }
    } finally {
      if (hold && hold === pendingOpenHoldSeq) state.pendingOpen = false;
    }
  }
  async function resolveDesignCommand(args) {
    if (!state.resolveAllowed) return null;
    const parsed = parseDesignArgs(args);
    if (!parsed.on) {
      await toggleMode(false);
      await host.toast({ kind: "info", message: "Design Mode is off." });
      return null;
    }
    if (parsed.brief.trim() !== "") {
      if (pageTarget().kind === "needs-project") {
        state.pageError = NEEDS_PROJECT_MESSAGE;
        rerender();
        await host.toast({ kind: "error", message: NEEDS_PROJECT_MESSAGE });
        return null;
      }
      if (state.directory && !projectReady(state.config)) {
        const spec = {
          type: parsed.type ?? state.mode.type,
          direction: state.mode.direction,
          fidelity: state.mode.fidelity,
          brief: parsed.brief,
          designSystemId: state.pageDesignSystemId
        };
        if (await scaffoldCurrentProject(spec)) return null;
      }
    }
    await toggleMode(true, parsed.type, parsed.brief || void 0);
    return buildModeChip(state.sessionId, state.mode, state.config);
  }
  async function startDesignSession(spec) {
    state.pageBusy = true;
    rerender();
    try {
      const data = seedSessionData(spec.type, spec.brief);
      const submission = spec.references !== void 0 ? buildReferenceSubmission(spec.text, data, spec.references) : { text: spec.text, data };
      const result = await host.startSession({
        providerId: "design-studio",
        id: spec.id,
        title: spec.title,
        url: attachUrl(spec.url),
        text: submission.text,
        projectId: spec.projectId,
        navigation: "preserve",
        data: submission.data
      });
      if (!result.sessionId || result.sent !== "sent") {
        const failure = "failure" in result ? result.failure : void 0;
        const message = result.sent === "no-model" ? "The design brief was not sent. Choose a model in OpenChamber, then try again. Your draft is unchanged." : `The design brief was not sent (${result.sent}${failure ? `: ${failure}` : ""}). Your draft is unchanged; try again.`;
        state.pageError = message;
        await host.toast({ kind: "error", message });
        return false;
      }
      if (spec.references !== void 0) {
        cancelReferenceValidation();
        state.references = [];
        state.prompt = "";
        attachPathDraft = "";
        referenceError = "";
      }
      try {
        await host.storage.set(modeStorageKey(result.sessionId), seedModeValue(spec.type, spec.brief));
        await host.storage.set(designMarkerKey(result.sessionId), designMarkerValue());
      } catch {
      }
      try {
        await ensureHarness(spec.dir);
      } catch {
      }
      try {
        await host.toast({ kind: "success", message: "Design session started \u2014 its controls are in Work Status." });
      } catch {
      }
      if (state.surface === "page") void loadDesignHome();
      try {
        await host.openSession(result.sessionId);
      } catch (error) {
        state.pageError = `The brief was sent, but the chat could not open. Open it from Your design work. ${error instanceof Error ? error.message : String(error)}`;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.pageError = message;
      await host.toast({ kind: "error", message: `Could not start session: ${message}` });
      return false;
    } finally {
      state.pageBusy = false;
      rerender();
    }
  }
  function pageTarget() {
    return resolveDesignTarget({
      directory: state.directory,
      selectedProjectId: state.selectedProjectId,
      projects: allProjects,
      rows: state.projects?.kind === "list" ? state.projects.rows : []
    });
  }
  async function prepareProject(spec, target) {
    if (projectReady(target.config)) {
      return { config: target.config, url: target.config?.url ?? "", scaffolded: false, failed: false, error: "" };
    }
    let result;
    try {
      result = await scaffoldProject(target.dir, {
        type: spec.type,
        direction: spec.direction,
        fidelity: spec.fidelity,
        brief: spec.brief,
        // Omitted for "No design system" so the request stays as before.
        designSystemId: spec.designSystemId ?? void 0
      });
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (!result.ok) {
      await host.toast({ kind: "error", message: result.error });
      return { config: target.config, url: target.config?.url ?? "", scaffolded: false, failed: true, error: result.error };
    }
    await host.toast({ kind: "success", message: `Project scaffolded at ${result.url}` });
    let config = target.config;
    try {
      config = (await getConfig(target.dir)).config;
      if (target.dir === state.directory) {
        state.config = config;
        state.configDir = target.dir;
      }
    } catch {
    }
    return { config, url: result.url || config?.url || "", scaffolded: true, failed: false, error: "" };
  }
  async function pageTargetFresh() {
    const first = pageTarget();
    const pickedUnknown = state.selectedProjectId !== null && (first.kind === "needs-project" || first.kind === "project" && first.projectId !== state.selectedProjectId);
    if (!state.projects || state.projects.kind === "loading" || first.kind === "needs-project" || pickedUnknown) {
      await loadProjects();
      return pageTarget();
    }
    return first;
  }
  async function scaffoldCurrentProject(spec) {
    const target = await pageTargetFresh();
    if (target.kind === "needs-project") {
      state.pageError = NEEDS_PROJECT_MESSAGE;
      rerender();
      await host.toast({ kind: "error", message: NEEDS_PROJECT_MESSAGE });
      return false;
    }
    state.pageError = "";
    state.pageBusy = true;
    rerender();
    const prep = await prepareProject(spec, target);
    state.pageBusy = false;
    if (prep.failed) {
      state.pageError = prep.error;
      rerender();
      return false;
    }
    return startDesignSession({
      id: `new-design:${Date.now()}`,
      title: `New design \xB7 ${spec.type}`,
      url: prep.url,
      type: spec.type,
      brief: spec.brief,
      projectId: target.projectId,
      dir: target.dir,
      text: designSessionPrompt(spec, prep.config)
    });
  }
  async function startNewDesign() {
    if (state.pageBusy || referencePending) return;
    state.pageBusy = true;
    state.pageError = "";
    const spec = {
      type: state.pageType,
      direction: state.pageDirection,
      fidelity: state.pageFidelity,
      brief: state.prompt.trim(),
      designSystemId: state.pageDesignSystemId
    };
    const references = state.surface === "page" ? [...state.references] : void 0;
    rerender();
    try {
      const target = await pageTargetFresh();
      if (target.kind === "needs-project") {
        state.pageError = NEEDS_PROJECT_MESSAGE;
        rerender();
        await host.toast({ kind: "error", message: NEEDS_PROJECT_MESSAGE });
        return;
      }
      const prep = await prepareProject(spec, target);
      if (prep.failed) {
        state.pageError = prep.error;
        rerender();
      }
      await startDesignSession({
        id: `new-design:${Date.now()}`,
        title: `New design \xB7 ${spec.type}`,
        url: prep.url,
        type: spec.type,
        brief: spec.brief,
        projectId: target.projectId,
        dir: target.dir,
        text: designSessionPrompt(spec, prep.config),
        references
      });
    } catch (error) {
      state.pageError = `Could not start session: ${error instanceof Error ? error.message : String(error)}`;
      await host.toast({ kind: "error", message: state.pageError });
    } finally {
      state.pageBusy = false;
      rerender();
    }
  }
  async function addToChat(pick) {
    try {
      await host.attach({
        providerId: "design-studio",
        id: `element-${pick.seq}`,
        title: pick.selector,
        url: pick.url,
        text: referenceText(pick, pick.url, pick.pickedAt),
        data: { selector: pick.selector, tag: pick.tag, classes: pick.classes, snippet: pick.outerHTML, styles: pick.styles, url: pick.url }
      });
      await host.toast({ kind: "success", message: "Reference added to the chat composer." });
    } catch (error) {
      await host.toast({ kind: "error", message: `Could not attach: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  function openStatus(message, kind = "info") {
    setStatus(message, kind);
  }
  async function openProjectWindow(config, dir, notify) {
    const decision = decideProjectOpen(config, dir);
    if (decision.kind === "message") {
      if (notify) await host.toast({ kind: "error", message: decision.message });
      return;
    }
    state.pendingOpen = true;
    openStatus(OPENING_STATUS);
    try {
      const result = await openLive(decision.url, decision.dir);
      if (result.ok) await saveLastUrl(state.directory, decision.url);
      if (result.ok && result.started && decision.dir) markServerStartedByUs(decision.dir);
      if (result.ok && dir) {
        void ensureHarness(dir).catch(() => {
        });
      }
      openStatus(formatOpenStatus(result), result.ok ? "info" : "error");
    } catch (error) {
      openStatus(`Could not open ${decision.url}: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      state.pendingOpen = false;
    }
  }
  async function resolveOpenUrl() {
    const dir = state.directory;
    if (dir) {
      try {
        const read = await getConfig(dir);
        if (state.directory === dir) {
          state.config = read.config;
          state.configPath = read.path;
          state.configDir = dir;
        }
        const url = read.config?.url?.trim();
        if (url) return { url, dir };
      } catch {
      }
    }
    const cached = currentConfig()?.url?.trim();
    if (cached) return { url: cached, dir };
    const last = await loadLastUrl(dir);
    if (last) return { url: last, dir };
    return null;
  }
  async function openCurrentProjectWindow(notify) {
    state.pendingOpen = true;
    try {
      const resolved = await resolveOpenUrl();
      if (!resolved) {
        if (notify) await host.toast({ kind: "error", message: NO_PROJECT_URL_MESSAGE });
        return;
      }
      await openProjectWindow({ url: resolved.url }, resolved.dir, notify);
    } finally {
      state.pendingOpen = false;
    }
  }
  var directoryGeneration = 0;
  var serverActionSeq = 0;
  function directoryMovedSince(dir, gen) {
    return state.directory !== dir || directoryGeneration !== gen;
  }
  function markServerStartedByUs(dir) {
    if (dir) state.startedServers.add(dir);
  }
  async function resolveProjectId(dir) {
    const rows = state.projects?.kind === "list" ? state.projects.rows : [];
    const cached = rows.find((row) => row.directory === dir);
    if (cached) return { kind: "id", id: cached.id };
    let snapshot;
    try {
      snapshot = await host.listProjects();
    } catch {
      return { kind: "unknown" };
    }
    if (snapshot.state !== "ready") return { kind: "unknown" };
    const project = snapshot.projects.find((candidate) => candidate.directory === dir);
    return project ? { kind: "id", id: project.id } : { kind: "unregistered" };
  }
  async function countActiveDesignSessions(dir) {
    const resolved = await resolveProjectId(dir);
    if (resolved.kind === "unknown") return null;
    if (resolved.kind === "unregistered") return 0;
    let snapshot;
    try {
      snapshot = await host.listSessions(resolved.id);
    } catch {
      return null;
    }
    if (snapshot.state !== "ready") return null;
    const markerIds = await readDesignMarkerSessionIds();
    return countOtherActiveDesignSessions(snapshot.sessions, state.sessionId, markerIds);
  }
  async function tryStopDevServer(dir) {
    const result = await stopDevServer(dir);
    if (result.ok && result.stopped) {
      state.startedServers.delete(dir);
      if (state.pendingStop?.dir === dir) state.pendingStop = null;
      return { stopped: true };
    }
    return { stopped: false, error: result.error };
  }
  async function requestDevServerStop(options = {}) {
    const dir = options.dir ?? state.directory;
    if (!dir) return { stopped: false, held: false, blocked: false };
    const manual = options.manual ?? false;
    const gen = directoryGeneration;
    if (!manual && !state.startedServers.has(dir)) return { stopped: false, held: false, blocked: false };
    const otherActiveDesignSessions = await countActiveDesignSessions(dir);
    if (state.sessionBusy) {
      state.pendingStop = { dir, manual };
      return { stopped: false, held: true, blocked: false };
    }
    if (otherActiveDesignSessions === null) {
      return { stopped: false, held: false, blocked: false, unknown: true };
    }
    if (options.dir === void 0 && directoryMovedSince(dir, gen)) {
      return { stopped: false, held: false, blocked: false };
    }
    if (shouldStopDevServer({ busy: state.sessionBusy, otherActiveDesignSessions, startedByUs: true })) {
      try {
        const outcome = await tryStopDevServer(dir);
        const result = {
          stopped: outcome.stopped,
          held: false,
          blocked: false
        };
        if (outcome.error) result.error = outcome.error;
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Could not stop the preview: ${message}`, "error");
        return { stopped: false, held: false, blocked: false, error: message };
      }
    }
    return { stopped: false, held: false, blocked: true };
  }
  async function manualStopRefusalMessage(dir) {
    try {
      const status = await getServerStatus(dir);
      if (status.error) return status.error;
      return status.pid ? "No preview dev server to stop." : "The service did not record this server; it was not started by Design Studio.";
    } catch {
      return "No preview dev server to stop.";
    }
  }
  function reportHonouredStop(result, dir) {
    if (result.stopped) {
      if (state.directory === dir) {
        state.serverStatus = false;
        state.serverError = null;
        renderServerControl();
      }
      announceServer("Preview dev server stopped.");
    } else if (result.blocked) {
      announceServer("Another active design session is using this preview server.");
    } else if (result.unknown) {
      announceServer("Could not verify other design sessions \u2014 the queued stop stays pending.");
    }
  }
  async function applySessionSnapshot(session) {
    state.sessionId = session?.id ?? null;
    state.sessionBusy = session?.busy ?? false;
    if (state.sessionBusy) {
      if (state.pendingStop) {
        state.pendingStop = null;
        announceServer("Session is busy again \u2014 the queued stop was cancelled.");
      }
    } else if (state.pendingStop) {
      const request = state.pendingStop;
      const result = await requestDevServerStop({ manual: request.manual, dir: request.dir });
      reportHonouredStop(result, request.dir);
    }
    await loadMode();
  }
  async function handleSessionLifecycle(event) {
    if (event.phase === "completed" && state.pendingStop && !state.sessionBusy) {
      const request = state.pendingStop;
      const result = await requestDevServerStop({ manual: request.manual, dir: request.dir });
      reportHonouredStop(result, request.dir);
    }
  }
  var serverAnnouncements = [];
  function announceServer(message) {
    serverAnnouncements.push(message);
    if (!serverAnnounceEl) return;
    serverAnnounceEl.textContent = "";
    queueMicrotask(() => {
      if (serverAnnounceEl) serverAnnounceEl.textContent = message;
    });
  }
  function focusInside(el2) {
    const active2 = document.activeElement;
    if (!el2 || !active2 || typeof el2.contains !== "function") return false;
    return active2 === el2 || el2.contains(active2);
  }
  function focusSessionLine() {
    if (!sessionLineEl) return;
    sessionLineEl.tabIndex = -1;
    sessionLineEl.focus();
  }
  var serverStatusRead = 0;
  function serverRenderState() {
    if (state.serverPending) return "loading";
    if (state.serverError) return "error";
    if (state.serverStatus === null) return "checking";
    return state.serverStatus ? "running" : "stopped";
  }
  function announceServerTransition(before) {
    const after = serverRenderState();
    if (after === before) return;
    if (after === "running") announceServer("Preview dev server is running.");
    else if (after === "stopped" && before !== "checking") announceServer("Preview dev server stopped.");
    else if (after === "error") announceServer("Preview dev server status unavailable \u2014 click to retry.");
  }
  async function refreshServerStatus() {
    if (state.serverPending || !state.directory) return;
    const dir = state.directory;
    const token = ++serverStatusRead;
    const superseded = () => token !== serverStatusRead || state.serverPending || state.directory !== dir;
    try {
      const status = await getServerStatus(dir);
      if (superseded()) return;
      const before = serverRenderState();
      if (status.error) {
        state.serverError = status.error;
      } else {
        state.serverStatus = status.up;
        state.serverError = null;
      }
      announceServerTransition(before);
    } catch (error) {
      if (superseded()) return;
      const before = serverRenderState();
      state.serverError = error instanceof Error ? error.message : String(error);
      announceServerTransition(before);
    }
    renderServerControl();
  }
  function renderServerControl() {
    if (!barEl || !serverBtn) return;
    const url = state.config?.url?.trim();
    const ready = projectReady(state.config) && url !== void 0 && isLoopbackUrl(url);
    if (!ready) {
      const hadFocus = focusInside(serverBtn);
      serverBtn.hidden = true;
      if (hadFocus) focusSessionLine();
      return;
    }
    serverBtn.hidden = false;
    serverBtn.disabled = state.serverPending;
    serverBtn.classList.remove("is-stopped", "is-running", "is-loading", "is-error");
    let stateClass;
    if (state.serverPending) {
      stateClass = "is-loading";
    } else if (state.serverError) {
      stateClass = "is-error";
    } else if (state.serverStatus === null) {
      stateClass = "is-loading";
    } else if (state.serverStatus) {
      stateClass = "is-running";
    } else {
      stateClass = "is-stopped";
    }
    serverBtn.classList.add(stateClass);
    serverBtn.title = state.serverPending ? "Working\u2026" : state.serverError ? "Preview dev server error \u2014 click to retry" : state.serverStatus === null ? "Checking the preview dev server\u2026" : state.serverStatus ? "Stop preview dev server" : "Start preview dev server";
    serverBtn.setAttribute("aria-label", serverBtn.title);
    const icon2 = q("span", "ds-server-icon");
    serverBtn.replaceChildren(icon2);
  }
  function currentConfig() {
    return state.configDir === state.directory ? state.config : null;
  }
  async function onServerControlClick() {
    if (state.serverPending || !state.directory) return;
    const url = currentConfig()?.url?.trim();
    if (!url || !isLoopbackUrl(url)) return;
    if (state.serverStatus && !state.serverError) {
      await stopCurrentServer();
    } else {
      await startCurrentServer();
    }
  }
  async function startCurrentServer() {
    const dir = state.directory;
    if (!dir) return;
    const url = currentConfig()?.url?.trim();
    if (!url || !isLoopbackUrl(url)) return;
    const gen = directoryGeneration;
    const action = ++serverActionSeq;
    state.serverPending = true;
    state.serverError = null;
    renderServerControl();
    try {
      const result = await startDevServer(dir, url);
      if (result.ok && result.up && result.started) markServerStartedByUs(dir);
      if (directoryMovedSince(dir, gen)) return;
      state.serverStatus = result.up ?? null;
      state.serverError = result.error ?? null;
      if (result.ok && result.started) {
        announceServer("Preview dev server started.");
      } else if (result.ok && result.up) {
        announceServer("Preview dev server is running.");
      } else {
        announceServer(result.error ?? "Could not start the preview dev server.");
      }
    } catch (error) {
      if (directoryMovedSince(dir, gen)) return;
      state.serverError = error instanceof Error ? error.message : String(error);
      announceServer(`Could not start the preview dev server: ${state.serverError}`);
    } finally {
      if (action === serverActionSeq) state.serverPending = false;
      renderServerControl();
      void refreshServerStatus();
    }
  }
  async function stopCurrentServer() {
    const dir = state.directory;
    if (!dir) return;
    const gen = directoryGeneration;
    const action = ++serverActionSeq;
    state.serverPending = true;
    state.serverError = null;
    renderServerControl();
    try {
      const result = await requestDevServerStop({ manual: true });
      if (directoryMovedSince(dir, gen)) return;
      if (result.stopped) {
        state.serverStatus = false;
        state.serverError = null;
        announceServer("Preview dev server stopped.");
      } else if (result.held) {
        state.serverError = null;
        announceServer("Session is busy \u2014 stop queued for when it becomes idle.");
      } else if (result.unknown) {
        state.serverError = null;
        announceServer("Could not verify other design sessions \u2014 the preview server was left running.");
      } else if (result.blocked) {
        state.serverError = null;
        announceServer("Another active design session is using this preview server.");
      } else {
        announceServer(result.error ?? await manualStopRefusalMessage(dir));
      }
    } catch (error) {
      if (directoryMovedSince(dir, gen)) return;
      state.serverError = error instanceof Error ? error.message : String(error);
      announceServer(`Could not stop the preview dev server: ${state.serverError}`);
    } finally {
      if (action === serverActionSeq) state.serverPending = false;
      renderServerControl();
      void refreshServerStatus();
    }
  }
  async function readStudioConfig(reportErrors) {
    const dir = state.directory;
    if (!dir) return;
    if (configReadInFlight) return;
    configReadInFlight = true;
    try {
      const { config, path } = await getConfig(dir);
      if (state.directory !== dir) return;
      state.config = config;
      state.configPath = path;
      state.configDir = dir;
      renderRow();
    } catch (error) {
      if (reportErrors) {
        setStatus(error instanceof ServiceUnavailable ? `Local service not ready: ${error.message}` : `Config error: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    } finally {
      configReadInFlight = false;
    }
  }
  async function loadStudioConfig() {
    await readStudioConfig(true);
  }
  function rerender() {
    if (state.surface === "page") renderPage();
  }
  async function loadProjects() {
    state.projects = { kind: "loading" };
    rerender();
    let snapshot;
    try {
      snapshot = await host.listProjects();
    } catch (error) {
      allProjects = [];
      state.projects = { kind: "error", message: error instanceof Error ? error.message : String(error) };
      rerender();
      return;
    }
    allProjects = allProjectsFromSnapshot(snapshot);
    const configs = {};
    if (snapshot.state === "ready") {
      await Promise.all(
        snapshot.projects.map(async (project) => {
          try {
            const read = await getConfig(project.directory);
            configs[project.directory] = { config: read.config, error: null };
          } catch (error) {
            configs[project.directory] = { config: null, error: error instanceof Error ? error.message : String(error) };
          }
        })
      );
    }
    state.projects = projectRows(snapshot, configs);
    rerender();
  }
  async function loadDesignHome() {
    await loadProjects();
    await loadDesignChats();
  }
  async function readDesignModeSessionIds() {
    const on = /* @__PURE__ */ new Set();
    let keys;
    try {
      keys = await host.storage.keys();
    } catch {
      return on;
    }
    const candidates = keys.map(modeSessionIdFromKey).filter((id) => id !== null);
    await Promise.all(
      candidates.map(async (id) => {
        try {
          const value = await host.storage.get(modeStorageKey(id));
          if (value && typeof value === "object" && value.on === true) on.add(id);
        } catch {
        }
      })
    );
    return on;
  }
  async function readDesignMarkerSessionIds() {
    const marked = /* @__PURE__ */ new Set();
    let keys;
    try {
      keys = await host.storage.keys();
    } catch {
      return marked;
    }
    for (const key of keys) {
      const id = designSessionIdFromKey(key);
      if (id !== null) marked.add(id);
    }
    return marked;
  }
  async function readDesignModeKeySessionIds() {
    const used = /* @__PURE__ */ new Set();
    let keys;
    try {
      keys = await host.storage.keys();
    } catch {
      return used;
    }
    for (const key of keys) {
      const id = modeSessionIdFromKey(key);
      if (id !== null) used.add(id);
    }
    return used;
  }
  async function loadDesignChats() {
    const view = state.projects;
    if (!view || view.kind === "loading") {
      state.designChats = { kind: "loading" };
      rerender();
      return;
    }
    if (view.kind === "error") {
      state.designChats = { kind: "error", message: view.message };
      rerender();
      return;
    }
    chatProjects = allProjects;
    chatOnIds = await readDesignModeSessionIds();
    chatMarkerIds = await readDesignMarkerSessionIds();
    chatModeKeyIds = await readDesignModeKeySessionIds();
    chatSnapshots = /* @__PURE__ */ new Map();
    await Promise.all(
      chatProjects.map(async (project) => {
        try {
          chatSnapshots.set(project.id, await host.listSessions(project.id));
        } catch {
          chatSnapshots.set(project.id, { kind: "sessions", projectId: project.id, state: "error", coverage: [], sessions: [] });
        }
      })
    );
    await recomputeDesignChats();
    await subscribeDesignChats();
  }
  async function recomputeDesignChats() {
    const listings = chatProjects.map((project) => ({
      projectId: project.id,
      projectName: project.name,
      snapshot: chatSnapshots.get(project.id) ?? { kind: "sessions", projectId: project.id, state: "loading", coverage: [], sessions: [] }
    }));
    const view = designChatRows(listings, chatOnIds, chatMarkerIds, chatModeKeyIds);
    state.designChats = view;
    rerender();
    if (view.kind !== "list") return;
    const enriched = await withChatConfigs(view.rows);
    if (state.designChats === view) {
      state.designChats = { kind: "list", rows: enriched };
      rerender();
    }
  }
  async function withChatConfigs(rows) {
    return Promise.all(
      rows.map(async (row) => {
        if (!row.directory) return row;
        try {
          const read = await getConfig(row.directory);
          return { ...row, config: read.config, configError: null };
        } catch (error) {
          return { ...row, config: row.config ?? null, configError: error instanceof Error ? error.message : String(error) };
        }
      })
    );
  }
  function clearChatSubscriptions() {
    for (const off of chatUnsubscribes) {
      try {
        off();
      } catch {
      }
    }
    chatUnsubscribes = [];
  }
  async function subscribeDesignChats() {
    clearChatSubscriptions();
    await Promise.all(
      chatProjects.map(async (project) => {
        try {
          const off = await host.onSessions(project.id, (snapshot) => {
            chatSnapshots.set(project.id, snapshot);
            void recomputeDesignChats();
          });
          chatUnsubscribes.push(off);
        } catch {
        }
      })
    );
  }
  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgIcon(paths, size = 18) {
    const svg = document.createElementNS(SVG_NS, "svg");
    for (const [name, value] of Object.entries({
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true"
    })) {
      svg.setAttribute(name, String(value));
    }
    svg.innerHTML = paths;
    return svg;
  }
  function ideaThumb(variant) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 56 40");
    svg.setAttribute("width", "56");
    svg.setAttribute("height", "40");
    svg.setAttribute("aria-hidden", "true");
    const add = (tag, attrs) => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
      svg.append(node);
    };
    add("rect", { x: 0, y: 0, width: 56, height: 40, rx: 7, class: "ds-thumb-bg" });
    if (variant === 0) {
      add("rect", { x: 8, y: 8, width: 22, height: 4, rx: 2, class: "ds-thumb-accent" });
      add("rect", { x: 8, y: 16, width: 40, height: 8, rx: 2, class: "ds-thumb-line" });
      add("rect", { x: 8, y: 28, width: 18, height: 5, rx: 2, class: "ds-thumb-line" });
      add("rect", { x: 30, y: 28, width: 18, height: 5, rx: 2, class: "ds-thumb-line" });
    } else if (variant === 1) {
      add("rect", { x: 8, y: 7, width: 40, height: 5, rx: 2, class: "ds-thumb-line" });
      add("rect", { x: 8, y: 16, width: 19, height: 16, rx: 3, class: "ds-thumb-accent" });
      add("rect", { x: 29, y: 16, width: 19, height: 7, rx: 2, class: "ds-thumb-line" });
      add("rect", { x: 29, y: 25, width: 19, height: 7, rx: 2, class: "ds-thumb-line" });
    } else if (variant === 2) {
      add("rect", { x: 8, y: 8, width: 12, height: 24, rx: 3, class: "ds-thumb-accent" });
      add("rect", { x: 24, y: 9, width: 24, height: 4, rx: 2, class: "ds-thumb-line" });
      add("rect", { x: 24, y: 17, width: 24, height: 4, rx: 2, class: "ds-thumb-line" });
      add("rect", { x: 24, y: 25, width: 16, height: 4, rx: 2, class: "ds-thumb-line" });
    } else {
      add("rect", { x: 8, y: 12, width: 12, height: 16, rx: 3, class: "ds-thumb-line" });
      add("rect", { x: 22, y: 12, width: 12, height: 16, rx: 3, class: "ds-thumb-accent" });
      add("rect", { x: 36, y: 12, width: 12, height: 16, rx: 3, class: "ds-thumb-line" });
    }
    return svg;
  }
  function canSend() {
    return !state.pageBusy && !referencePending && state.prompt.trim() !== "";
  }
  function updateComposerState() {
    const ready = canSend();
    if (sendEl) {
      sendEl.disabled = !ready;
      sendEl.classList.toggle("ready", ready);
      sendEl.classList.toggle("busy", state.pageBusy);
      sendEl.setAttribute("aria-busy", String(state.pageBusy));
      sendEl.title = state.pageBusy ? "Starting the design session\u2026" : referencePending ? "Wait for the reference to finish checking" : "Start the design session";
    }
    if (accentFillEl) {
      const progress = Math.min(1, state.prompt.trim().length / 140);
      accentFillEl.style.width = `${6 + progress * 94}%`;
    }
  }
  function nextOverlayState(current, triggerId) {
    return current === triggerId ? null : triggerId;
  }
  function currentOverlay() {
    if (state.typeMenuOpen) return "type";
    if (state.dirMenuOpen) return "dir";
    if (state.attachMenuOpen) return "attach";
    if (state.dsMenuOpen) return "ds";
    return null;
  }
  var refocusOverlayTrigger = null;
  function toggleMenu(which) {
    if (currentOverlay() === "attach") cancelReferenceValidation();
    const next = nextOverlayState(currentOverlay(), which);
    state.typeMenuOpen = next === "type";
    state.dirMenuOpen = next === "dir";
    state.attachMenuOpen = next === "attach";
    state.dsMenuOpen = next === "ds";
    if (next === "ds") {
      dsQuery = "";
      dsHighlight = state.pageDesignSystemId;
    }
    refocusOverlayTrigger = next === null ? which : null;
    renderPage();
  }
  function closeMenus(refocus = false) {
    const open = currentOverlay();
    if (!open) return;
    if (open === "attach") cancelReferenceValidation();
    state.typeMenuOpen = false;
    state.dirMenuOpen = false;
    state.attachMenuOpen = false;
    state.dsMenuOpen = false;
    refocusOverlayTrigger = refocus ? open : null;
    renderPage();
  }
  function closeActiveOverlay(id) {
    if (id === "attach") cancelReferenceValidation();
    state.typeMenuOpen = false;
    state.dirMenuOpen = false;
    state.attachMenuOpen = false;
    state.dsMenuOpen = false;
    refocusOverlayTrigger = id;
    renderPage();
  }
  function onPageWindowClick(event) {
    const target = event.target;
    if (target?.closest(".ds-ds-panel, .ds-menu, .ds-menu-trigger")) return;
    closeMenus();
  }
  function onPageKeydown(event) {
    if (event.key !== "Escape") return;
    if (!currentOverlay()) return;
    event.preventDefault();
    closeMenus(true);
  }
  function currentDirLabel() {
    const view = state.projects;
    if (!view || view.kind === "loading") return "Loading\u2026";
    const target = pageTarget();
    if (target.kind === "project") {
      const project = allProjects.find((candidate) => candidate.id === target.projectId);
      return project?.name ?? fileBaseName(target.dir);
    }
    return state.directory ? "Not a registered project" : "No project open";
  }
  function renderPage() {
    if (!pageBody || state.surface !== "page") return;
    pageBody.replaceChildren();
    promptEl = null;
    sendEl = null;
    accentFillEl = null;
    const shell = q("div", "ds-home");
    if (pageEnter) {
      shell.classList.add("ds-enter");
      pageEnter = false;
    }
    shell.append(renderHero(), renderComposer(), renderDirRow(), renderIdeas(), renderDesignSection(), renderFooter());
    pageBody.append(shell);
    updateComposerState();
    focusPendingTrigger();
    if (referenceFocusId) {
      const target = Array.from(pageBody.querySelectorAll(".ds-reference-remove")).find((button2) => button2.dataset.referenceId === referenceFocusId);
      referenceFocusId = null;
      target?.focus();
    }
  }
  function focusPendingTrigger() {
    const id = refocusOverlayTrigger;
    if (!id) return;
    refocusOverlayTrigger = null;
    pageBody?.querySelector(`[data-overlay-trigger="${id}"]`)?.focus();
  }
  function renderHero() {
    const hero = q("header", "ds-hero");
    const title = q("h1", "ds-hero-title");
    title.append(document.createTextNode("Let's create "));
    title.append(q("span", "ds-hero-type", PAGE_TYPE_LABELS[state.pageType]));
    hero.append(title);
    hero.append(q("p", "ds-hero-sub", "Good work starts here"));
    if (state.pageError) {
      const error = q("div", "ds-home-warn", state.pageError);
      error.setAttribute("role", "alert");
      hero.append(error);
    }
    return hero;
  }
  function anchoredPopover(options) {
    const anchor = q("div", "ds-ds-anchor");
    anchor.append(options.trigger);
    if (!options.open) return anchor;
    options.panel.setAttribute("role", "dialog");
    options.panel.setAttribute("aria-label", options.label);
    anchor.append(q("div", "ds-ds-backdrop"));
    anchor.append(options.panel);
    options.panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        options.onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const active2 = document.activeElement;
      if (active2?.tagName === "SELECT") return;
      const items = Array.from(options.panel.querySelectorAll(options.optionSelector));
      if (items.length === 0) return;
      event.preventDefault();
      const current = active2 ? items.indexOf(active2) : -1;
      const next = items[popoverStep(current, items.length, event.key === "ArrowDown" ? 1 : -1)];
      next?.focus();
    });
    return anchor;
  }
  function renderComposer() {
    const box = q("div", "ds-composer");
    const area = q("textarea", "ds-composer-input");
    area.rows = 3;
    area.placeholder = "Describe the design you want\u2026";
    area.value = state.prompt;
    area.setAttribute("aria-label", "Design brief");
    area.disabled = state.pageBusy;
    area.addEventListener("input", () => {
      state.prompt = area.value;
      updateComposerState();
    });
    area.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (canSend()) void startNewDesign();
      }
    });
    promptEl = area;
    const bar = q("div", "ds-composer-bar");
    const plus = q("button", "ds-plus ds-menu-trigger");
    plus.dataset.overlayTrigger = "attach";
    plus.append(svgIcon('<path d="M12 5v14"/><path d="M5 12h14"/>'));
    plus.title = "Add a reference";
    plus.setAttribute("aria-label", "Add a reference");
    plus.disabled = state.pageBusy || pageTarget().kind !== "project";
    if (pageTarget().kind !== "project") plus.title = "Register or select a project to add references";
    plus.setAttribute("aria-expanded", String(state.attachMenuOpen));
    plus.addEventListener("click", () => toggleMenu("attach"));
    const attachAnchor = anchoredPopover({
      open: state.attachMenuOpen,
      trigger: plus,
      panel: renderAttachPanel(),
      label: "Add a reference",
      optionSelector: ".ds-menu-item",
      onClose: () => closeMenus(true)
    });
    const designSystem = q("button", "ds-chip ds-ds-trigger ds-menu-trigger");
    designSystem.dataset.overlayTrigger = "ds";
    designSystem.append(designSystemIcon());
    designSystem.append(q("span", "ds-chip-label", designSystemLabel(state.pageDesignSystemId)));
    designSystem.append(svgIcon('<path d="M6 9l6 6 6-6"/>', 14));
    designSystem.title = "Choose a design system";
    designSystem.setAttribute("aria-label", `Design system: ${designSystemLabel(state.pageDesignSystemId)}`);
    designSystem.disabled = state.pageBusy;
    designSystem.addEventListener("click", () => toggleMenu("ds"));
    const chip = q("button", "ds-chip ds-menu-trigger");
    chip.dataset.overlayTrigger = "type";
    chip.append(q("span", "ds-chip-label", PAGE_TYPE_LABELS[state.pageType]));
    chip.append(svgIcon('<path d="M6 9l6 6 6-6"/>', 14));
    chip.title = "Choose the design type";
    chip.setAttribute("aria-label", "Choose the design type");
    chip.disabled = state.pageBusy;
    chip.addEventListener("click", () => toggleMenu("type"));
    const spacer = q("div", "ds-composer-spacer");
    const send = q("button", "ds-send");
    send.append(svgIcon('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>', 20));
    send.title = "Start the design session";
    send.setAttribute("aria-label", "Start the design session");
    send.addEventListener("click", () => {
      if (canSend()) void startNewDesign();
    });
    sendEl = send;
    const dsAnchor = anchoredPopover({
      open: state.dsMenuOpen,
      trigger: designSystem,
      panel: renderDesignSystemPanel(),
      label: "Choose a design system",
      optionSelector: ".ds-ds-item",
      onClose: () => closeMenus(true)
    });
    const typeAnchor = anchoredPopover({
      open: state.typeMenuOpen,
      trigger: chip,
      panel: renderTypeMenu(),
      label: "Choose the design type",
      optionSelector: ".ds-menu-item",
      onClose: () => closeMenus(true)
    });
    const children = [];
    children.push(attachAnchor);
    children.push(dsAnchor, typeAnchor, spacer, send);
    bar.append(...children);
    box.append(area, renderReferenceDraft(), bar);
    box.classList.toggle("ds-overlay-open", state.attachMenuOpen || state.dsMenuOpen || state.typeMenuOpen);
    const track = q("div", "ds-composer-accent");
    accentFillEl = q("div", "ds-composer-accent-fill");
    track.append(accentFillEl);
    box.append(track);
    return box;
  }
  function referenceDisplayLabel(reference) {
    const parts = reference.path.split("/").filter(Boolean);
    let count = Math.min(2, parts.length);
    const others = state.references.filter((candidate) => candidate.id !== reference.id);
    while (count < parts.length && others.some((candidate) => candidate.path.split("/").filter(Boolean).slice(-count).join("/") === parts.slice(-count).join("/"))) count += 1;
    return `${fileBaseName(reference.sourceDirectory)} \xB7 ${parts.slice(-count).join("/")}`;
  }
  function renderReferenceDraft() {
    const list = q("ul", "ds-reference-list");
    list.setAttribute("aria-label", "References included with this design brief");
    list.hidden = state.references.length === 0;
    for (const reference of state.references) {
      const item = q("li", "ds-reference-chip");
      item.append(svgIcon(reference.kind === "project" ? '<path d="M3 7h6l2 2h10v11H3z"/>' : '<path d="M14 2H6v20h12V6z"/><path d="M14 2v6h6"/>', 14));
      const details = q("details", "ds-reference-details");
      const summary = q("summary");
      summary.setAttribute("aria-label", `${reference.path}; source: ${reference.sourceDirectory}. Show full path`);
      const label = q("span", "ds-reference-label", referenceDisplayLabel(reference));
      label.title = `${reference.path}
Source: ${reference.sourceDirectory}`;
      summary.append(label);
      details.append(summary, q("span", "ds-reference-path", reference.path), q("span", "ds-reference-source", `Source: ${reference.sourceDirectory}`));
      const remove = q("button", "ds-reference-remove");
      remove.type = "button";
      remove.dataset.referenceId = reference.id;
      remove.setAttribute("aria-label", `Remove ${reference.path}`);
      remove.title = `Remove ${reference.path}`;
      remove.disabled = state.pageBusy;
      remove.append(svgIcon('<path d="m6 6 12 12M18 6 6 18"/>', 14));
      remove.addEventListener("click", () => removePageReference(reference.id));
      item.append(details, remove);
      list.append(item);
    }
    return list;
  }
  function removePageReference(id) {
    if (state.pageBusy) return;
    const index = state.references.findIndex((reference) => reference.id === id);
    if (index < 0) return;
    const removed = state.references[index];
    state.references = removeDraftReference(state.references, id);
    referenceFocusId = state.references[index]?.id ?? state.references[index - 1]?.id ?? null;
    if (!referenceFocusId) refocusOverlayTrigger = "attach";
    announceReference(`Removed ${removed.path}.`);
    renderPage();
  }
  function renderTypeMenu() {
    const panel = q("div", "ds-ds-panel ds-type-panel");
    const list = q("div", "ds-ds-list ds-type-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Design types");
    for (const type of DESIGN_TYPES) {
      const on = type === state.pageType;
      const item = q("button", `ds-menu-item${on ? " on" : ""}`);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", on ? "true" : "false");
      const main2 = q("span", "ds-menu-main");
      main2.append(q("strong", void 0, PAGE_TYPE_LABELS[type]));
      main2.append(q("span", "ds-menu-hint", TYPE_HINT[type]));
      item.append(main2);
      if (on) item.append(svgIcon('<path d="M20 6L9 17l-5-5"/>', 16));
      item.addEventListener("click", () => {
        state.pageType = type;
        closeActiveOverlay("type");
      });
      list.append(item);
    }
    panel.append(list, renderOptions());
    if (state.typeMenuOpen) queueMicrotask(() => panel.querySelector(".ds-menu-item")?.focus());
    return panel;
  }
  function renderOptions() {
    const row = q("div", "ds-options");
    const direction = q("select");
    direction.append(option("auto", "Auto (infer from the brief)"));
    for (const id of Object.keys(DIRECTIONS)) direction.append(option(id, DIRECTIONS[id].name));
    direction.value = state.pageDirection;
    direction.addEventListener("change", () => {
      state.pageDirection = direction.value;
    });
    const fidelity = q("select");
    for (const [value, label] of FIDELITY_OPTIONS) fidelity.append(option(value, label));
    fidelity.value = state.pageFidelity;
    fidelity.addEventListener("change", () => {
      state.pageFidelity = fidelity.value;
    });
    row.append(field("Direction", direction), field("Fidelity", fidelity));
    return row;
  }
  function field(label, control) {
    const wrap = q("label", "ds-field");
    wrap.append(q("span", "ds-field-label", label), control);
    return wrap;
  }
  function attachProject() {
    const target = pageTarget();
    const config = target.kind === "project" ? target.config ?? (target.dir === state.directory ? state.config : null) : state.config;
    const dir = target.kind === "project" ? target.dir : state.directory ?? "";
    const name = config?.name?.trim() || (dir ? fileBaseName(dir) : "Project");
    return { dir, projectId: target.kind === "project" ? target.projectId : void 0, name, config };
  }
  async function attachProjectReference() {
    const project = attachProject();
    if (state.surface === "page") {
      if (state.pageBusy || referencePending) return;
      if (pageTarget().kind !== "project") {
        referenceError = "Register or select a project to add references.";
        renderPage();
        return;
      }
      stagePageReference({ id: `project:${project.dir}`, kind: "project", path: project.dir, sourceDirectory: project.dir, label: project.name });
      closeActiveOverlay("attach");
      return;
    }
    const url = projectHttpUrl(project.config);
    if (!url) {
      await host.toast({ kind: "error", message: ATTACH_NEEDS_URL });
      return;
    }
    try {
      const chip = projectReferenceChip({ projectId: project.projectId, dir: project.dir, name: project.name, url });
      await host.attach(chip);
      await host.toast({ kind: "success", message: "Project reference added to the composer." });
    } catch (error) {
      await host.toast({ kind: "error", message: `Could not attach: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  async function attachProjectPath(path) {
    const project = attachProject();
    if (state.surface === "page") {
      if (state.pageBusy || referencePending) return;
      attachPathDraft = path;
      referenceError = "";
      if (pageTarget().kind !== "project") {
        referenceError = "Register or select a project, then paste the file path again.";
        renderPage();
        announceReference(referenceError);
        return;
      }
      if (!path.trim()) {
        referenceError = "Paste a project-relative or full file path.";
        renderPage();
        return;
      }
      const request = ++referenceRequest;
      referencePending = true;
      referenceSlow = false;
      renderPage();
      announceReference("Checking that the file is accessible\u2026");
      const slowTimer = setTimeout(() => {
        if (request !== referenceRequest) return;
        referenceSlow = true;
        renderPage();
        announceReference("This is taking longer than expected. Close the reference menu to cancel, then retry.");
      }, 15e3);
      try {
        const resolved = await validateReferencePath(project.dir, path.trim());
        if (request !== referenceRequest || state.surface !== "page") return;
        stagePageReference({ id: `file:${resolved.path}`, kind: "file", path: resolved.path, sourceDirectory: resolved.sourceDirectory, label: fileBaseName(resolved.path) });
        attachPathDraft = "";
        referencePending = false;
        closeActiveOverlay("attach");
      } catch (error) {
        if (request !== referenceRequest) return;
        referenceError = `${error instanceof Error ? error.message : String(error)} Paste an accessible file path and try again.`;
        announceReference(referenceError);
      } finally {
        clearTimeout(slowTimer);
        if (request === referenceRequest) {
          referencePending = false;
          referenceSlow = false;
          renderPage();
        }
      }
      return;
    }
    const url = projectHttpUrl(project.config);
    if (!url) {
      await host.toast({ kind: "error", message: ATTACH_NEEDS_URL });
      return;
    }
    try {
      const chip = fileReferenceChip({ path, url });
      await host.attach(chip);
      await host.toast({ kind: "success", message: "File reference added to the composer." });
    } catch (error) {
      await host.toast({ kind: "error", message: `Could not attach: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  function dragHasFiles(event) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }
  var dragDepth = 0;
  function onPageDragEnter(event) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    pageBody?.classList.add("ds-drop");
  }
  function onPageDragOver(event) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }
  function onPageDragLeave(event) {
    if (!dragHasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) pageBody?.classList.remove("ds-drop");
  }
  function onPageDrop(event) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    pageBody?.classList.remove("ds-drop");
    void attachDroppedFiles(event);
  }
  async function attachDroppedFiles(event) {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    announceReference(DROP_PATH_MESSAGE);
    await host.toast({ kind: "info", message: DROP_PATH_MESSAGE });
  }
  function stagePageReference(reference) {
    const duplicate = state.references.some((existing) => existing.kind === reference.kind && existing.path === reference.path);
    state.references = addDraftReference(state.references, reference);
    referenceError = "";
    announceReference(duplicate ? `Already added: ${reference.path}.` : `Added ${reference.path}.`);
  }
  function attachOption(title, hint, disabled, onClick) {
    const item = q("button", "ds-menu-item");
    item.disabled = disabled;
    const main2 = q("span", "ds-menu-main");
    main2.append(q("strong", void 0, title));
    main2.append(q("span", "ds-menu-hint", hint));
    item.append(main2);
    if (!disabled) item.addEventListener("click", onClick);
    return item;
  }
  function renderAttachPanel() {
    const panel = q("div", "ds-ds-panel ds-attach-panel");
    const project = attachProject();
    const usable = pageTarget().kind === "project";
    const list = q("div", "ds-ds-list ds-attach-list");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Add a reference");
    const projectHint = usable ? project.dir || project.name : "Register or select a project to add references.";
    list.append(
      attachOption("Reference the project", projectHint, !usable || referencePending || state.pageBusy, () => {
        void attachProjectReference();
      })
    );
    panel.append(list);
    if (usable) {
      const form = q("form", "ds-attach-paste");
      form.dataset.state = referencePending ? "submitted-pending" : attachPathDraft ? "dirty" : "untouched";
      form.setAttribute("aria-busy", String(referencePending));
      const label = q("label", "ds-attach-paste-field");
      label.append(q("span", "ds-attach-paste-label", "File path"));
      const input = q("input", "ds-attach-paste-input");
      input.type = "text";
      input.name = "path";
      input.placeholder = "src/styles.css";
      input.spellcheck = false;
      input.autocomplete = "off";
      input.required = true;
      input.value = attachPathDraft;
      input.readOnly = referencePending;
      input.disabled = state.pageBusy;
      input.setAttribute("aria-describedby", "ds-reference-feedback");
      input.setAttribute("aria-invalid", String(Boolean(referenceError)));
      label.append(input);
      const add = q("button", "ds-attach-paste-add", "Add");
      add.type = "submit";
      add.disabled = referencePending || state.pageBusy || !attachPathDraft.trim();
      add.textContent = referencePending ? "Checking\u2026" : "Add";
      form.append(label, add);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const path = input.value.trim();
        if (!path) return;
        void attachProjectPath(path);
      });
      input.addEventListener("input", () => {
        attachPathDraft = input.value;
        form.dataset.state = input.value ? "dirty" : "untouched";
        add.disabled = referencePending || state.pageBusy || !input.value.trim();
      });
      input.addEventListener("blur", () => {
        if (!input.value.trim() && input.value.length > 0) {
          referenceError = "Paste a project-relative or full file path.";
          input.setAttribute("aria-invalid", "true");
          feedback.textContent = referenceError;
          feedback.classList.add("error");
        }
      });
      panel.append(form);
      const feedback = q("div", `ds-attach-note${referenceError ? " error" : ""}`, referencePending ? referenceSlow ? "Still checking. Close this menu to cancel, then retry." : "Checking that the file is accessible\u2026" : referenceError || "Paste a project-relative or full path. Files are referenced, never uploaded.");
      feedback.id = "ds-reference-feedback";
      feedback.setAttribute("role", "status");
      if (referencePending) {
        const spinner = svgIcon('<path d="M20 12a8 8 0 1 1-8-8"/>', 14);
        spinner.classList.add("ds-reference-spinner");
        feedback.prepend(spinner);
      }
      panel.append(feedback);
      if (state.attachMenuOpen) queueMicrotask(() => input.focus());
    } else {
      panel.append(q("div", "ds-attach-note", projectHint));
    }
    return panel;
  }
  function designSystemIcon() {
    return svgIcon(
      '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
      15
    );
  }
  function applyDesignSystem(id) {
    state.pageDesignSystemId = findDesignSystem(id)?.id ?? null;
    closeActiveOverlay("ds");
  }
  function renderDesignSystemDetail(detail, id) {
    detail.replaceChildren();
    const preset = findDesignSystem(id);
    if (!preset) {
      detail.append(q("div", "ds-ds-detail-name", NO_DESIGN_SYSTEM));
      detail.append(q("p", "ds-ds-detail-desc", "Start from scratch \u2014 no preset. The design system comes out of the brief."));
      return;
    }
    detail.append(q("div", "ds-ds-detail-name", preset.name));
    detail.append(q("div", "ds-ds-detail-cat", preset.category));
    detail.append(q("p", "ds-ds-detail-desc", preset.description));
    const swatches = designSystemSwatches(preset);
    if (swatches.length > 0) {
      const strip = q("div", "ds-ds-swatches");
      for (const token of swatches) {
        const swatch = q("span", "ds-ds-swatch");
        swatch.style.background = token.value;
        swatch.title = `${token.name} ${token.value}`;
        swatch.setAttribute("aria-label", `${token.name} ${token.value}`);
        strip.append(swatch);
      }
      detail.append(strip);
    }
  }
  function renderDesignSystemPanel() {
    const panel = q("div", "ds-ds-panel");
    const toolbar = q("div", "ds-ds-toolbar");
    const search = q("input", "ds-ds-search");
    search.type = "search";
    search.placeholder = "Search design systems";
    search.setAttribute("aria-label", "Search design systems");
    search.value = dsQuery;
    const create = q("button", "ds-ds-create", "+ Create");
    create.title = "Custom design systems are not available yet";
    create.setAttribute("aria-label", "Create a design system");
    create.disabled = true;
    toolbar.append(search, create);
    const body = q("div", "ds-ds-body");
    const list = q("div", "ds-ds-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Design systems");
    const detail = q("div", "ds-ds-detail");
    body.append(list, detail);
    const actions = q("div", "ds-ds-foot");
    const clear = q("button", "ds-ds-clear", "Clear");
    clear.addEventListener("click", () => applyDesignSystem(null));
    actions.append(clear);
    panel.append(toolbar, body, actions);
    const itemRefs = [];
    const setHighlight = (id) => {
      if (dsHighlight === id) return;
      dsHighlight = id;
      for (const ref of itemRefs) {
        const on = ref.id === dsHighlight;
        ref.el.classList.toggle("on", on);
        ref.el.setAttribute("aria-selected", on ? "true" : "false");
      }
      renderDesignSystemDetail(detail, dsHighlight);
    };
    const buildList = () => {
      itemRefs.length = 0;
      list.replaceChildren();
      const add = (preset) => {
        const id = preset?.id ?? null;
        const on = dsHighlight === id;
        const item = q("button", `ds-ds-item${on ? " on" : ""}`);
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", on ? "true" : "false");
        const main2 = q("div", "ds-ds-item-main");
        main2.append(q("span", "ds-ds-item-name", preset ? preset.name : NO_DESIGN_SYSTEM));
        if (preset) main2.append(q("span", "ds-ds-item-cat", preset.category));
        item.append(main2);
        const check = q("span", "ds-ds-check");
        check.append(svgIcon('<path d="M20 6L9 17l-5-5"/>', 16));
        item.append(check);
        item.addEventListener("click", () => applyDesignSystem(id));
        item.addEventListener("mouseenter", () => setHighlight(id));
        item.addEventListener("focus", () => setHighlight(id));
        itemRefs.push({ id, el: item });
        list.append(item);
      };
      add(null);
      const shown = filterDesignSystems(dsQuery);
      for (const group of designSystemGroups(shown)) {
        list.append(q("div", "ds-ds-group", group.category));
        for (const preset of group.presets) add(preset);
      }
      if (shown.length === 0) list.append(q("div", "ds-ds-empty", "No design systems match your search."));
    };
    buildList();
    renderDesignSystemDetail(detail, dsHighlight);
    search.addEventListener("input", () => {
      dsQuery = search.value;
      if (dsHighlight !== null && !filterDesignSystems(dsQuery).some((preset) => preset.id === dsHighlight)) {
        dsHighlight = null;
      }
      buildList();
      renderDesignSystemDetail(detail, dsHighlight);
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target !== create) {
        event.preventDefault();
        applyDesignSystem(dsHighlight);
      }
    });
    queueMicrotask(() => search.focus());
    return panel;
  }
  function renderDirRow() {
    const row = q("div", "ds-dir");
    const trigger = q("button", "ds-dir-trigger ds-menu-trigger");
    trigger.dataset.overlayTrigger = "dir";
    trigger.append(q("span", "ds-dir-label", "Working directory"));
    trigger.append(q("span", "ds-dir-value", currentDirLabel()));
    trigger.append(svgIcon('<path d="M6 9l6 6 6-6"/>', 16));
    trigger.setAttribute("aria-label", "Choose the working directory");
    trigger.addEventListener("click", () => toggleMenu("dir"));
    row.append(trigger);
    const view = state.projects;
    if (view && view.kind !== "loading" && pageTarget().kind === "needs-project") {
      row.append(q("div", "ds-dir-note", NEEDS_PROJECT_MESSAGE));
    }
    if (state.dirMenuOpen) row.append(renderDirMenu());
    return row;
  }
  function renderDirMenu() {
    const menu = q("div", "ds-menu");
    const view = state.projects;
    if (!view || view.kind === "loading") {
      menu.append(q("div", "ds-menu-note", "Loading projects\u2026"));
      return menu;
    }
    if (view.kind === "error") {
      menu.append(q("div", "ds-menu-note error", `Could not list projects: ${view.message}`));
      const retry = q("button", "ds-menu-retry", "Retry");
      retry.addEventListener("click", () => void loadProjects());
      menu.append(retry);
      return menu;
    }
    const configRows = view.kind === "list" ? view.rows : [];
    const currentRow = allProjects.find((project) => project.directory === state.directory);
    const effectiveId = state.selectedProjectId ?? currentRow?.id ?? null;
    if (allProjects.length === 0) {
      menu.append(q("div", "ds-menu-note", "No registered projects yet."));
    }
    for (const project of allProjects) {
      const matched = configRows.find((candidate) => candidate.directory === project.directory);
      const config = matched?.config ?? null;
      const sub = config?.url ? `${config.type ?? "custom"} \xB7 ${config.url}` : project.directory;
      menu.append(dirOption(project.name, sub, project.id === effectiveId, project.id, projectReady(config) ? void 0 : NO_CONFIG_BADGE));
    }
    return menu;
  }
  function dirOption(title, subtitle, on, id, badge) {
    const item = q("button", `ds-menu-item${on ? " on" : ""}`);
    const main2 = q("span", "ds-menu-main");
    const titleLine = q("span", "ds-menu-title");
    titleLine.append(q("strong", void 0, title));
    if (badge) titleLine.append(q("span", "ds-badge", badge));
    main2.append(titleLine);
    main2.append(q("span", "ds-menu-hint", subtitle));
    item.append(main2);
    if (on) item.append(svgIcon('<path d="M20 6L9 17l-5-5"/>', 16));
    item.addEventListener("click", () => {
      state.selectedProjectId = id;
      closeActiveOverlay("dir");
    });
    return item;
  }
  function renderIdeas() {
    const wrap = q("div", "ds-ideas");
    wrap.append(q("div", "ds-ideas-label", "Ideas"));
    const list = q("div", "ds-idea-list");
    IDEAS[state.pageType].forEach((idea, index) => {
      const card = q("button", "ds-idea");
      card.disabled = state.pageBusy;
      card.append(ideaThumb(index % 4));
      const body = q("div", "ds-idea-body");
      body.append(q("strong", "ds-idea-title", idea.title));
      body.append(q("span", "ds-idea-desc", idea.description));
      card.append(body);
      card.addEventListener("click", () => {
        if (state.pageBusy) return;
        state.prompt = idea.prompt;
        if (promptEl) promptEl.value = idea.prompt;
        updateComposerState();
        promptEl?.focus();
      });
      list.append(card);
    });
    wrap.append(list);
    return wrap;
  }
  function renderFooter() {
    const footer = q("footer", "ds-footer");
    footer.append(q("span", "ds-footer-name", "Design Studio"));
    footer.append(q("span", "ds-footer-hint", "Add references by \u2318-clicking an element in the live preview window."));
    return footer;
  }
  var PROJECT_ROW_ICON = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>';
  var CHAT_ROW_ICON = '<path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-5 3.5V6a2.5 2.5 0 0 1 2.5-2.5h12A2.5 2.5 0 0 1 20 6z"/>';
  function rowIcon(paths) {
    const span = q("span", "ds-list-icon");
    span.setAttribute("aria-hidden", "true");
    span.append(svgIcon(paths, 15));
    return span;
  }
  function listNote(message, kind = "info") {
    const note = q("div", `ds-list-note${kind === "error" ? " error" : ""}`);
    note.append(q("span", void 0, message));
    if (kind === "error") {
      const retry = q("button", "ds-list-retry", "Retry");
      retry.addEventListener("click", () => void loadDesignHome());
      note.append(retry);
    }
    return note;
  }
  function renderDesignSection() {
    const section = q("section", "ds-section");
    const head = q("div", "ds-section-head");
    head.append(q("div", "ds-section-label", "Your design work"));
    if (state.projectFilter) {
      const showAll = q("button", "ds-section-reset", "Show all");
      showAll.title = "Show every design project and chat";
      showAll.addEventListener("click", () => {
        state.projectFilter = null;
        rerender();
      });
      head.append(showAll);
    }
    section.append(head);
    const list = q("div", "ds-list");
    const listedIds = state.projects?.kind === "list" ? new Set(state.projects.rows.map((row) => row.id)) : /* @__PURE__ */ new Set();
    const view = designWorkRows(
      state.projects ?? { kind: "loading" },
      state.designChats ?? { kind: "loading" },
      state.projectFilter ? void 0 : { omitChatProjectIds: listedIds }
    );
    if (view.kind === "loading") {
      list.append(listNote("Loading\u2026"));
    } else if (view.kind === "error") {
      list.append(listNote(view.message, "error"));
    } else if (view.kind === "empty") {
      list.append(listNote(NO_DESIGN_WORK_MESSAGE));
    } else {
      const filter = state.projectFilter;
      const rows = filter ? view.rows.filter((row) => row.kind === "project" ? row.project.id === filter : row.chat.projectId === filter) : view.rows;
      for (const row of rows) {
        list.append(row.kind === "project" ? renderProjectRow(row.project) : renderChatRow(row.chat));
      }
      if (filter && !rows.some((row) => row.kind === "chat")) {
        list.append(listNote("No design sessions in this project yet."));
      }
    }
    section.append(list);
    return section;
  }
  function renderProjectRow(row) {
    const ready = projectReady(row.config);
    const item = q("div", "ds-list-row");
    const open = q("button", "ds-list-open");
    open.setAttribute("aria-label", `Show the design sessions in ${row.name}`);
    open.append(rowIcon(PROJECT_ROW_ICON));
    const main2 = q("div", "ds-list-main");
    const titleLine = q("div", "ds-list-title");
    titleLine.append(q("span", "ds-list-name", row.name));
    titleLine.append(q("span", `ds-badge${ready ? " ready" : ""}`, ready ? DESIGN_READY_BADGE : NO_CONFIG_BADGE));
    main2.append(titleLine);
    main2.append(q("div", "ds-list-meta", projectMeta(row)));
    if (row.configError) main2.append(q("div", "ds-list-warn", `Could not read .design-studio.json: ${row.configError}`));
    open.append(main2);
    open.append(q("span", "ds-list-go", state.projectFilter === row.id ? "Showing" : "Open sessions"));
    open.addEventListener("click", () => openProjectSessions(row));
    item.append(open);
    if (ready) {
      const preview = q("button", "ds-list-preview", "Preview");
      preview.title = `Open the ${row.name} preview`;
      preview.setAttribute("aria-label", `Open the ${row.name} preview`);
      preview.addEventListener("click", () => void previewProject(row));
      item.append(preview);
    }
    return item;
  }
  function openProjectSessions(row) {
    state.selectedProjectId = row.id;
    state.projectFilter = row.id;
    rerender();
    scrollDesignSectionIntoView();
  }
  function scrollDesignSectionIntoView() {
    const section = pageBody?.querySelector(".ds-section");
    if (!section || typeof section.scrollIntoView !== "function") return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }
  async function previewProject(row) {
    const url = row.config?.url?.trim();
    if (!url) {
      await host.toast({ kind: "error", message: NO_PROJECT_URL_MESSAGE });
      return;
    }
    await openProjectWindow({ url }, row.directory, true);
  }
  function renderChatRow(row) {
    const ready = projectReady(row.config);
    const item = q("div", "ds-list-row");
    const open = q("button", "ds-list-open");
    open.setAttribute("aria-label", `Open the design chat ${row.title} in ${row.projectName}`);
    open.append(rowIcon(CHAT_ROW_ICON));
    const main2 = q("div", "ds-list-main");
    const titleLine = q("div", "ds-list-title");
    titleLine.append(q("span", "ds-list-name", row.title));
    titleLine.append(q("span", `ds-badge${ready ? " ready" : ""}`, ready ? DESIGN_READY_BADGE : NO_CONFIG_BADGE));
    main2.append(titleLine);
    main2.append(q("div", "ds-list-meta", designChatMeta(row)));
    if (row.configError) main2.append(q("div", "ds-list-warn", `Could not read .design-studio.json: ${row.configError}`));
    open.append(main2);
    open.append(q("span", "ds-list-go", "Open"));
    open.addEventListener("click", () => void openDesignChat(row));
    item.append(open);
    return item;
  }
  async function openDesignChat(row) {
    try {
      await host.openSession(row.sessionId);
    } catch (error) {
      await host.toast({ kind: "error", message: `Could not open the design chat: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    const url = row.config?.url?.trim();
    if (url) await openProjectWindow({ url }, row.directory || state.directory, false);
  }
  function renderWindowStatus() {
    if (hintEl) {
      hintEl.textContent = PICK_HINT;
      hintEl.classList.toggle("active", pickHintActive(state));
      hintEl.classList.toggle("idle", !pickHintActive(state));
    }
    renderSessionStatus();
  }
  function renderSessionStatus() {
    if (!sessionLineEl) return;
    if (!projectReady(state.config)) {
      sessionLineEl.textContent = NO_PROJECT_CONFIG_MESSAGE;
      sessionLineEl.classList.add("off");
      return;
    }
    sessionLineEl.textContent = designSessionStatus({ modeOn: state.mode.on, configUrl: state.config?.url ?? null });
    sessionLineEl.classList.toggle("off", !state.mode.on);
  }
  function renderRow() {
    const ready = projectReady(state.config);
    if (barEl) barEl.classList.toggle("hidden", !ready);
    if (hintEl) hintEl.classList.toggle("hidden", !ready);
    if (!ready && (focusInside(barEl) || focusInside(hintEl))) focusSessionLine();
    renderServerControl();
    renderWindowStatus();
  }
  async function applyState(stateData) {
    state.url = stateData.url;
    state.title = stateData.title;
    state.windowOpen = stateData.windowOpen;
    if (stateData.lastPick && stateData.pickSeq > state.lastSeq) {
      state.lastSeq = stateData.pickSeq;
      const pick = { ...stateData.lastPick, seq: stateData.pickSeq, url: stateData.url, pickedAt: /* @__PURE__ */ new Date() };
      if (state.mode.on) void addToChat(pick);
    }
    renderWindowStatus();
    if (!state.windowOpen && state.mode.on && !state.pendingOpen) {
      await turnModeOffByWindowClose();
    }
  }
  async function turnModeOffByWindowClose() {
    if (!state.mode.on) return;
    state.mode.on = false;
    state.pendingOpen = false;
    await saveMode();
    renderModeUi();
    try {
      await requestDevServerStop();
    } catch {
    }
  }
  async function poll() {
    if (document.visibilityState !== "visible") return;
    void readStudioConfig(false);
    try {
      await applyState(await getState());
    } catch (error) {
      setStatus(error instanceof ServiceUnavailable ? `Local service not ready: ${error.message}` : `Live window error: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
    void refreshServerStatus();
  }
  function renderModeUi() {
    if (modeToggleBtn) {
      modeToggleBtn.textContent = state.mode.on ? "Design Mode: ON" : "Design Mode: OFF";
      modeToggleBtn.title = state.mode.on ? "Design Mode is on \u2014 click to turn it off" : "Design Mode is off \u2014 click to turn it on";
      modeToggleBtn.classList.toggle("on", state.mode.on);
    }
    renderSessionStatus();
  }
  function surfaceKind(surface) {
    if (surface === "status") return "row";
    if (surface === "panel") return "note";
    if (surface === "page") return "page";
    return "none";
  }
  function setSurfaceHeight(height) {
    if (state.surface !== "status") return;
    void host.setHeight(height).catch(() => {
    });
  }
  var reportedStatusHeight = 0;
  var statusHeightObserver = null;
  var statusHeightGeneration = 0;
  function reportContentHeight(content, generation) {
    if (content !== statusRoot || generation !== statusHeightGeneration || state.surface !== "status") return;
    const verticalMargins = (element) => {
      const style = window.getComputedStyle(element);
      return (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
    };
    const height = Math.ceil(content.getBoundingClientRect().height + verticalMargins(content) + verticalMargins(document.body));
    if (height <= 0 || Math.abs(height - reportedStatusHeight) <= 1) return;
    reportedStatusHeight = height;
    setSurfaceHeight(height);
  }
  function observeRowHeight() {
    statusHeightObserver?.disconnect();
    statusHeightObserver = null;
    const generation = ++statusHeightGeneration;
    reportedStatusHeight = 0;
    const content = statusRoot;
    if (!content || state.surface !== "status") return;
    if (typeof ResizeObserver === "undefined") {
      reportContentHeight(content, generation);
      return;
    }
    statusHeightObserver = new ResizeObserver(() => reportContentHeight(content, generation));
    statusHeightObserver.observe(content);
    reportContentHeight(content, generation);
  }
  function buildRow(root) {
    statusRoot = q("div", "ds-statusmode");
    const bar = q("div", "ds-rowline");
    serverBtn = q("button", "ds-server-control");
    serverBtn.addEventListener("click", () => void onServerControlClick());
    serverBtn.hidden = true;
    modeToggleBtn = q("button", "primary");
    modeToggleBtn.addEventListener("click", () => {
      void toggleMode(!state.mode.on);
    });
    bar.append(serverBtn, modeToggleBtn);
    barEl = bar;
    sessionLineEl = q("div", "ds-sessionline");
    hintEl = q("span", "ds-hintline");
    serverAnnounceEl = q("div", "ds-server-announce");
    serverAnnounceEl.setAttribute("aria-live", "polite");
    serverAnnounceEl.setAttribute("aria-atomic", "true");
    statusRoot.append(bar, sessionLineEl, hintEl, serverAnnounceEl);
    root.append(statusRoot);
    renderRow();
    observeRowHeight();
  }
  function buildPage(root) {
    const wrap = q("div", "ds ds-page");
    pageBody = q("div", "ds-page-body");
    referenceLiveEl = q("div", "ds-reference-announcement");
    referenceLiveEl.setAttribute("role", "status");
    referenceLiveEl.setAttribute("aria-live", "polite");
    referenceLiveEl.setAttribute("aria-atomic", "true");
    wrap.append(pageBody, referenceLiveEl);
    root.append(wrap);
    window.addEventListener("click", onPageWindowClick);
    window.addEventListener("keydown", onPageKeydown);
    wrap.addEventListener("dragenter", onPageDragEnter);
    wrap.addEventListener("dragover", onPageDragOver);
    wrap.addEventListener("dragleave", onPageDragLeave);
    wrap.addEventListener("drop", onPageDrop);
    window.addEventListener("dragover", onPageWindowDragOver);
    window.addEventListener("drop", onPageWindowDrop);
    renderPage();
    void loadDesignHome();
  }
  function onPageWindowDragOver(event) {
    if (dragHasFiles(event)) event.preventDefault();
  }
  function onPageWindowDrop(event) {
    if (dragHasFiles(event)) {
      event.preventDefault();
      dragDepth = 0;
      pageBody?.classList.remove("ds-drop");
    }
  }
  function build(root) {
    const kind = surfaceKind(state.surface);
    if (kind === "row") {
      buildRow(root);
      return;
    }
    if (kind === "note") {
      buildPanelNote(root);
      return;
    }
    if (kind === "page") {
      buildPage(root);
    }
  }
  function buildPanelNote(root) {
    const wrap = q("div", "ds ds-panel-note");
    wrap.append(q("p", "ds-panel-note-line", PANEL_SIDEBAR_HINT));
    root.append(wrap);
  }
  async function main() {
    const root = document.getElementById("root");
    if (!root) throw new Error("missing #root");
    host.onResolve((request) => resolveDesignCommand(request.args));
    let started = false;
    host.onReady((context) => {
      applyHostReady(context, document.documentElement);
      state.surface = context.surface;
      state.directory = context.directory;
      state.sessionId = context.session?.id ?? null;
      state.resolveAllowed = context.surface === "panel" || context.surface === "page";
      if (started) return;
      started = true;
      build(root);
      setStatus("Loading\u2026");
      void loadMode();
      void loadStudioConfig();
      const kind = surfaceKind(state.surface);
      if (kind === "row") {
        void poll();
        setInterval(() => void poll(), POLL_MS);
      }
    });
    host.onSession((session) => {
      void applySessionSnapshot(session);
    });
    host.onSessionLifecycle((event) => {
      void handleSessionLifecycle(event);
    });
    host.onDirectory((directory) => {
      state.directory = directory;
      state.serverStatus = null;
      state.serverPending = false;
      state.serverError = null;
      renderRow();
      rerender();
      void loadStudioConfig();
    });
  }
  function setProjectDirectory(dir) {
    state.directory = dir;
    directoryGeneration += 1;
    state.serverStatus = null;
    state.serverPending = false;
    state.serverError = null;
  }
  function setSurface(surface) {
    state.surface = surface;
  }
  function setPrompt(prompt) {
    state.prompt = prompt;
  }
  function getPageDraft() {
    return { prompt: state.prompt, references: state.references.map((reference) => ({ ...reference })), error: state.pageError, path: attachPathDraft, referenceError, pending: referencePending };
  }
  function resetReferenceDraft() {
    cancelReferenceValidation();
    state.references = [];
    attachPathDraft = "";
    referenceError = "";
  }
  function setSessionId(id) {
    state.sessionId = id;
  }
  function getModeState() {
    return { ...state.mode };
  }
  function getPendingOpen() {
    return state.pendingOpen;
  }
  function setDesignSystem(id) {
    state.pageDesignSystemId = id;
  }
  function allowResolve(value) {
    state.resolveAllowed = value;
  }
  function getAllProjects() {
    return [...allProjects];
  }
  function setSelectedProject(id) {
    state.selectedProjectId = id;
  }
  function setSessionBusy(busy) {
    state.sessionBusy = busy;
  }
  function resetStopState() {
    state.sessionBusy = false;
    state.pendingStop = null;
    state.startedServers.clear();
    state.serverStatus = null;
    state.serverPending = false;
    state.serverError = null;
  }
  function getStopState() {
    return {
      pendingStop: state.pendingStop !== null,
      pendingRequest: state.pendingStop ? { ...state.pendingStop } : null,
      sessionBusy: state.sessionBusy,
      startedServers: [...state.startedServers]
    };
  }
  function setStudioConfig(config) {
    state.config = config;
    state.configDir = state.directory;
  }
  function getServerControlState() {
    return { status: state.serverStatus, pending: state.serverPending, error: state.serverError };
  }
  function getServerAnnouncements() {
    return [...serverAnnouncements];
  }
  function resetServerAnnouncements() {
    serverAnnouncements.length = 0;
  }
  void main();
})();
