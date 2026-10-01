import { ACCORDION_H, ACCORDION_MAX_H, ACCORDION_MIN_H, ROW_H } from './constants.js'

export const CSS = `
.gg-repository-workbench { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.gg-repository-workbench > .gg-workbench { flex: 1; min-height: 0; }
.gg-repository-picker { flex: none; position: relative; z-index: 12; padding: 5px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-repository-trigger { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 32px; padding: 5px 8px; text-align: left; font: inherit; font-size: 12px; border: 1px solid transparent; border-radius: 6px; color: var(--dsw-alias-label-primary); background: transparent; cursor: pointer; transition: background .12s; }
.gg-repository-trigger:hover, .gg-repository-trigger.is-open { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); }
.gg-repository-trigger:disabled { opacity: .5; cursor: default; }
.gg-repository-trigger-icon { flex: none; color: var(--dsw-alias-label-secondary); }
.gg-repository-caption { display: flex; align-items: baseline; gap: 7px; flex: 1; min-width: 0; white-space: nowrap; }
.gg-repository-workspace-name { max-width: 45%; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-secondary); }
.gg-repository-slash { opacity: .5; }
.gg-repository-name, .gg-repository-placeholder { overflow: hidden; text-overflow: ellipsis; }
.gg-repository-name { font-weight: 550; }
.gg-repository-placeholder { color: var(--dsw-alias-label-secondary); }
.gg-repository-chevron { flex: none; color: var(--dsw-alias-label-secondary); transition: transform .12s; }
.gg-repository-trigger.is-open .gg-repository-chevron { transform: rotate(180deg); }
.gg-repository-menu { position: absolute; top: calc(100% + 4px); left: 8px; width: min(420px, calc(100% - 16px)); max-height: min(520px, 70vh); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 32px color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent), 0 2px 8px color-mix(in srgb, var(--dsw-alias-bg-base) 40%, transparent); }
.gg-repository-search { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-repository-search-icon { flex: none; color: var(--dsw-alias-label-secondary); }
.gg-repository-search input { min-width: 0; flex: 1; height: 26px; border: 0; border-radius: 3px; padding: 0; font: inherit; font-size: 12px; background: transparent; color: var(--dsw-alias-label-primary); outline: none; }
.gg-repository-search input::placeholder { color: var(--dsw-alias-label-secondary); }
.gg-root .gg-repository-search input:focus-visible { outline: none; box-shadow: none; }
.gg-repository-rescan { flex: none; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 5px; color: var(--dsw-alias-label-secondary); background: transparent; cursor: pointer; }
.gg-repository-rescan:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.gg-repository-rescan:disabled { opacity: .4; cursor: default; }
.gg-repository-groups { overflow: auto; min-height: 0; padding: 6px; scrollbar-width: thin; }
.gg-repository-tree-row { display: flex; align-items: center; min-height: 32px; border-radius: 5px; }
.gg-repository-tree-row:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-repository-tree-row.is-selected { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, var(--dsw-alias-bg-base)); box-shadow: inset 2px 0 var(--dsw-alias-brand-primary); }
.gg-repository-expand { flex: none; display: grid; place-items: center; width: 25px; height: 28px; border: 0; border-radius: 4px; padding: 0; color: var(--dsw-alias-label-secondary); background: transparent; cursor: pointer; }
.gg-repository-expand svg { width: 13px; height: 13px; transform: rotate(-90deg); transition: transform .12s; }
.gg-repository-expand.is-expanded svg { transform: rotate(0deg); }
.gg-repository-expand:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); }
.gg-repository-option { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; min-height: 32px; border: 0; border-radius: 4px; padding: 5px 8px 5px 2px; font: inherit; font-size: 12px; text-align: left; color: inherit; background: transparent; cursor: pointer; }
.gg-repository-option:disabled, .gg-repository-expand:disabled { opacity: .5; cursor: default; }
.gg-repository-row-icon { flex: none; width: 15px; height: 15px; color: var(--dsw-alias-label-secondary); }
.gg-repository-row-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 18px; }
.gg-repository-current { flex: none; font-size: 10px; font-weight: 400; color: var(--dsw-alias-label-secondary); }
.gg-repository-tree-row.is-selected .gg-repository-row-icon, .gg-repository-check { color: var(--dsw-alias-brand-primary); }
.gg-repository-check { flex: none; width: 14px; height: 14px; }
.gg-repository-status { display: flex; align-items: center; gap: 7px; padding: 5px 9px; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.gg-repository-status.is-error { display: block; color: var(--dsw-alias-state-error-primary); }
.gg-repository-retry { margin-left: 6px; border: 0; padding: 0; font: inherit; text-decoration: underline; background: transparent; color: inherit; cursor: pointer; }
.gg-repository-empty { padding: 18px 12px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.gg-repository-trigger:focus-visible, .gg-repository-option:focus-visible, .gg-repository-expand:focus-visible, .gg-repository-rescan:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.gg-repository-search:focus-within { box-shadow: inset 0 -1px var(--dsw-alias-brand-primary); }

.gg-tab-title { display: inline-flex; align-items: center; gap: 5px; }
.gg-tab-icon { display: inline-flex; color: #ed7957; }
/* The guide capsule carries the tab chip's branch mark in the same ink. */
.gg-guide-icon { color: #ed7957; }
.gg-du-metadata { flex: none; max-height: 30%; overflow: auto; padding: 3px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 10px; }
.gg-du-metadata summary { cursor: pointer; }
.gg-du-metadata pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 5px 0; font: 10px/1.5 ui-monospace, monospace; }

/* The entire SVG is above row backgrounds, never above text or menus. */
.gg-graph-inner { isolation: isolate; }
.gg-canvas { z-index: 2; }
.gg-rows { z-index: 1; }
.gg-du-status[data-status='M'] { color: light-dark(#966100, #e5b454); }
.gg-du-status[data-status='A'], .gg-du-status[data-status='?'] { color: light-dark(#16733c, #78ce96); }
.gg-du-status[data-status='D'], .gg-du-status[data-status='U'] { color: light-dark(#ba3434, #f48787); }
.gg-du-status[data-status='R'], .gg-du-status[data-status='C'] { color: light-dark(#176eb0, #7cbbef); }
.gg-du-code .hljs-keyword, .gg-du-code .hljs-selector-tag, .gg-du-code .hljs-literal { color: light-dark(#9333a6, #c792ea); }
.gg-du-code .hljs-string, .gg-du-code .hljs-regexp, .gg-du-code .hljs-template-string { color: light-dark(#286536, #b5d990); }
.gg-du-code .hljs-comment, .gg-du-code .hljs-quote { color: light-dark(#667466, #8eaa88); font-style: italic; }
.gg-du-code .hljs-number, .gg-du-code .hljs-symbol, .gg-du-code .hljs-bullet { color: light-dark(#995300, #e6b577); }
.gg-du-code .hljs-title, .gg-du-code .hljs-section, .gg-du-code .hljs-built_in { color: light-dark(#175eab, #82baff); }
.gg-du-code .hljs-attr, .gg-du-code .hljs-attribute, .gg-du-code .hljs-property { color: light-dark(#924d12, #e8c07d); }
.gg-du-code .hljs-tag, .gg-du-code .hljs-name, .gg-du-code .hljs-type { color: light-dark(#006d76, #7fcfd7); }
.gg-du-code .hljs-meta { color: light-dark(#7a4b9c, #bba0d7); }

.gg-du-workspace > .gg-split-vertical { min-height: 360px; grid-template-rows: minmax(180px, var(--gg-ratio)) 7px minmax(130px, 1fr); }
.gg-du-workspace { overflow: auto !important; }
.gg-du-filepane .gg-du-controls { padding-block: 3px; }
.gg-du-filter { padding-block: 4px !important; }

/* Append to the existing plugin stylesheet. SplitPane owns responsive sizing. */
.gg-du-workspace { display: flex; flex: 1 1 0; min-width: 0; min-height: 0; overflow: hidden; }
.gg-du-workspace > * { flex: 1; min-width: 0; min-height: 0; }
.gg-du-panel, .gg-du-filepane { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; color: var(--dsw-alias-label-primary); font-family: inherit; font-size: var(--dsh-content-font-size, 14px); line-height: 1.45; }
.gg-du-title { padding: 8px 10px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 12px/1.5 ui-monospace, monospace; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-du-controls { position: relative; z-index: 8; display: flex; flex: none; align-items: center; flex-wrap: wrap; gap: 3px; min-height: 32px; padding: 4px 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-du-button { box-sizing: border-box; height: 24px; color: var(--dsw-alias-label-secondary); background: transparent; border: 1px solid transparent; border-radius: 3px; font: 12px/22px inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; }
.gg-du-dropdown { position: relative; height: 24px; flex: none; font-size: 12px; }
.gg-du-layout-select { width: 92px; }
.gg-du-context-select { width: 100px; }
.gg-du-dropdown-trigger { box-sizing: border-box; width: 100%; height: 24px; display: flex; align-items: center; gap: 5px; padding: 0 5px 0 7px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border: 1px solid transparent; border-radius: 3px; font: inherit; text-align: left; cursor: pointer; }
.gg-du-dropdown-trigger > span:first-child { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-du-dropdown-chevron { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1; transform: translateY(-1px); }
.gg-du-dropdown.is-open .gg-du-dropdown-chevron { transform: rotate(180deg) translateY(1px); }
.gg-du-dropdown-menu { position: absolute; top: calc(100% + 3px); left: 0; z-index: 30; min-width: 100%; width: max-content; max-width: 180px; padding: 3px; overflow: hidden; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base)); border: 1px solid var(--dsw-alias-border-l2); border-radius: 5px; box-shadow: 0 6px 18px rgba(0,0,0,.38); }
.gg-du-dropdown-option { box-sizing: border-box; width: 100%; min-width: 116px; height: 25px; display: flex; align-items: center; gap: 5px; padding: 0 8px 0 4px; color: inherit; background: transparent; border: 0; border-radius: 3px; font: inherit; text-align: left; white-space: nowrap; cursor: pointer; }
.gg-du-dropdown-option:hover, .gg-du-dropdown-option:focus-visible { background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-interactive-bg-hover)); outline: none; }
.gg-du-dropdown-option.is-selected { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.gg-du-dropdown-check { width: 13px; flex: none; color: var(--dsw-alias-brand-primary); text-align: center; }
.gg-du-icon-button { width: 24px; padding: 0; }
.gg-du-language { min-width: 30px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.gg-du-button:hover:not(:disabled), .gg-du-button[aria-pressed="true"], .gg-du-dropdown-trigger:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.gg-du-button[aria-pressed="true"] { color: var(--dsw-alias-brand-primary); }
.gg-du-button:disabled { opacity: .4; cursor: default; }
.gg-du-button:focus-visible, .gg-du-dropdown-trigger:focus-visible, .gg-du-file:focus-visible, .gg-du-filter input:focus-visible, .gg-du-scroll:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.gg-du-counts { white-space: nowrap; margin-inline-end: auto; padding: 0 4px; font: 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.gg-du-added { color: var(--dsw-alias-state-success-primary, #22863a); }
.gg-du-deleted { color: var(--dsw-alias-state-error-primary, #cb2431); }
.gg-du-position, .gg-du-summary { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.gg-du-summary { flex: none; padding: 5px 10px; overflow-wrap: anywhere; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-du-scroll { flex: 1 1 0; min-height: 0; min-width: 0; overflow: auto; overscroll-behavior: contain; position: relative; }
.gg-du-patch { width: max-content; min-width: 100%; font: var(--dsh-content-font-size, 14px)/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; tab-size: 4; }
.gg-du-line { display: grid; grid-template-columns: 5ch 5ch minmax(0, 1fr); min-height: 1.6em; }
.gg-du-split { min-width: 720px; }
.gg-du-split-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); min-height: 1.6em; }
.gg-du-side { display: grid; grid-template-columns: 5ch minmax(0, 1fr); min-width: 0; }
.gg-du-side.gg-du-old { border-right: 1px solid var(--dsw-alias-border-l1); }
.gg-du-side.gg-du-old.gg-du-del, .gg-du-side.gg-du-old.gg-du-replacement { background: rgba(248, 81, 73, .13); }
.gg-du-side.gg-du-new.gg-du-add, .gg-du-side.gg-du-new.gg-du-replacement { background: rgba(46, 160, 67, .13); }
.gg-du-side.is-empty { background: var(--dsw-alias-bg-layer-2); opacity: .4; }
.gg-du-split-row .gg-du-old .gg-du-code::first-letter { color: var(--dsw-alias-label-secondary); }
.gg-du-split-hunk { grid-column: 1 / -1; min-height: 1.6em; padding: 0 8px; background: rgba(76, 154, 255, .12); color: var(--dsw-alias-brand-primary); }
.gg-du-split-hunk.is-current { box-shadow: inset 3px 0 var(--dsw-alias-brand-primary); }
.gg-du-split-note { grid-column: 1 / -1; min-height: 1.6em; padding: 0 8px; color: var(--dsw-alias-label-secondary); font-style: italic; }
.gg-du-number { text-align: right; padding: 0 6px 0 2px; user-select: none; color: var(--dsw-alias-label-secondary); border-right: 1px solid var(--dsw-alias-border-l1); font-variant-numeric: tabular-nums; }
.gg-du-code { padding: 0 8px; white-space: pre; }
.gg-du-add { background: rgba(46, 160, 67, .13); }
.gg-du-del { background: rgba(248, 81, 73, .13); }
.gg-du-hunk { background: rgba(76, 154, 255, .12); color: var(--dsw-alias-brand-primary); }
.gg-du-hunk.is-current { box-shadow: inset 3px 0 var(--dsw-alias-brand-primary); }
.gg-du-meta, .gg-du-note { color: var(--dsw-alias-label-secondary); }
.gg-du-note { font-style: italic; }
.gg-du-patch.is-wrapped { width: 100%; }
.gg-du-split.is-wrapped { min-width: 100%; }
.gg-du-patch.is-wrapped .gg-du-code { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.gg-du-message { padding: 10px; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); line-height: 1.5; }
.gg-du-filter { padding: 8px; flex: none; }
.gg-du-filter input { box-sizing: border-box; width: 100%; min-width: 0; color: inherit; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); border-radius: 5px; padding: 6px 8px; font: inherit; }
.gg-du-filelist { overflow: auto; min-height: 0; flex: 1 1 0; overscroll-behavior: contain; }
.gg-du-group-title { position: sticky; top: 0; z-index: 1; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); margin: 0; padding: 7px 10px; font-size: 11px; font-weight: 600; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-du-file { display: flex; gap: 8px; align-items: center; width: 100%; box-sizing: border-box; padding: 7px 10px; border: 0; border-bottom: 1px solid var(--dsw-alias-border-l1); background: transparent; text-align: left; color: inherit; font: inherit; cursor: pointer; }
.gg-du-file:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-du-file.is-selected { background: rgba(76, 154, 255, .14); }
.gg-du-path { min-width: 0; overflow-wrap: anywhere; line-height: 1.5; }

/* Match the public VS Code Git Graph table: 24px rows, fixed graph gutter and 13px cells. */
.gg-section-heading.gg-column-heading, .gg-row { display: grid; grid-template-columns: var(--gg-lane-width, 100px) minmax(220px, 1fr) 150px 72px 72px; column-gap: 0; align-items: center; }
.gg-section-heading.gg-column-heading { min-height: 31px; padding: 0; background: transparent; border-block: 1px solid var(--dsw-alias-border-l1); font-size: inherit; font-weight: 600; line-height: 30px; }
.gg-column-heading > span { height: 30px; padding: 0 12px; border-right: 1px solid var(--dsw-alias-border-l1); text-align: center; }
.gg-column-heading > span:last-child { border-right: 0; }
/* The graph column's own controls: refresh and fetch are buttons, not a heading
   that happens to be clickable. */
.gg-column-actions { display: inline-flex; align-items: center; justify-content: center; gap: 2px; padding: 0 4px !important; }
.gg-column-btn { width: 22px; height: 22px; }
.gg-row { box-sizing: border-box; height: ${ROW_H}px; padding: 0 !important; border: 0; line-height: 26px; }
.gg-row > .gg-row-body { display: contents; }
.gg-row > .gg-row-body > .gg-description { grid-column: 2; grid-row: 1; display: flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; padding: 0 4px; }
.gg-row > .gg-row-body > .gg-row-meta { display: contents; }
.gg-row > .gg-row-body > .gg-row-meta > .gg-date { grid-column: 3; grid-row: 1; padding: 0 4px; }
.gg-row > .gg-row-body > .gg-row-meta > .gg-author { grid-column: 4; grid-row: 1; padding: 0 4px; }
.gg-row > .gg-row-body > .gg-row-meta > .gg-hash { grid-column: 5; grid-row: 1; padding: 0 4px; }
.gg-hash { font-family: inherit; color: var(--dsw-alias-label-secondary); }
.gg-row-stack { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: ${ROW_H}px; }
.gg-row-stack > .gg-row { flex: 0 0 ${ROW_H}px; }
.gg-row-stack > .gg-accordion { position: relative; z-index: 3; flex: 0 0 var(--gg-accordion-height, ${ACCORDION_H}px); }
.gg-accordion { display: grid; grid-template-columns: minmax(0, calc(var(--gg-accordion-split, 50%) - 3px)) 6px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 6px; height: var(--gg-accordion-height, ${ACCORDION_H}px); min-height: ${ACCORDION_MIN_H}px; max-height: ${ACCORDION_MAX_H}px; margin-left: var(--gg-lane-width, 100px); overflow: hidden; border-bottom: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 52%, var(--dsw-alias-bg-base)); }
.gg-accordion-meta, .gg-accordion-files { min-width: 0; min-height: 0; overflow: auto; padding: 10px; }
.gg-accordion-meta { grid-column: 1; grid-row: 1; }
.gg-accordion-files { grid-column: 3; grid-row: 1; }
.gg-accordion-column-resizer { grid-column: 2; grid-row: 1; position: relative; cursor: col-resize; background: var(--dsw-alias-border-l1); touch-action: none; }
.gg-accordion-column-resizer::after { content: ''; position: absolute; inset: 0 -3px; }
.gg-accordion-height-resizer { grid-column: 1 / -1; grid-row: 2; position: relative; cursor: row-resize; background: var(--dsw-alias-border-l1); touch-action: none; }
.gg-accordion-height-resizer::after { content: ''; position: absolute; inset: -3px 0; }
.gg-accordion-column-resizer:hover, .gg-accordion-column-resizer:focus-visible, .gg-accordion-height-resizer:hover, .gg-accordion-height-resizer:focus-visible { background: var(--dsw-alias-brand-primary); outline: none; }
.gg-accordion-state { grid-template-columns: 1fr; }
.gg-accordion-state-content { grid-column: 1; grid-row: 1; display: flex; align-items: flex-start; justify-content: flex-start; gap: 7px; padding: 10px; color: var(--dsw-alias-label-secondary); }
.gg-accordion-state-content > .gg-spinner { margin-top: 4px; }
.gg-accordion-state.is-error .gg-accordion-state-content { flex-direction: column; color: var(--dsw-alias-state-error-primary); }
.gg-accordion-state.is-error .gg-accordion-state-content span { max-width: min(560px, 80%); color: var(--dsw-alias-label-secondary); text-align: left; overflow-wrap: anywhere; }
.gg-accordion-message { margin: 22px 0 0; padding: 0; white-space: pre-wrap; color: var(--dsw-alias-label-primary); }
.gg-accordion .gg-meta { grid-template-columns: max-content minmax(0, 1fr); gap: 1px 4px; margin: 0; font-size: inherit; line-height: 1.4; }
.gg-accordion .gg-meta dt { color: var(--dsw-alias-label-primary); }
.gg-accordion-working { display: block; }
.gg-working-title { margin: 0 0 3px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.gg-tree { min-width: 0; }
.gg-tree-folder-name { display: flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary); font-weight: 600; min-height: 22px; padding: 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-tree-chevron { display: inline-block; width: 12px; color: var(--dsw-alias-label-secondary); }
.gg-tree-children { padding-left: 17px; }
.gg-tree-file { width: 100%; min-height: 22px; padding: 0 3px; border: 0; border-radius: 0; background: transparent; text-align: left; color: inherit; }
.gg-tree-file:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-tree-file .gg-path { flex: 1; }
.gg-file-counts { flex: none; display: inline-flex; gap: 4px; font-family: inherit; font-size: inherit; white-space: nowrap; }
.gg-file-added { color: #3fb950; }
.gg-file-removed { color: #f85149; }
.gg-working-group + .gg-working-group { margin-top: 9px; padding-top: 7px; border-top: 1px solid var(--dsw-alias-border-l1); }
@container (max-width: 760px) { .gg-section-heading.gg-column-heading, .gg-row { grid-template-columns: var(--gg-lane-width, 100px) minmax(0, 1fr) 112px; } .gg-column-heading span:nth-child(4), .gg-column-heading span:nth-child(5), .gg-row .gg-author, .gg-row .gg-hash { display: none; } .gg-column-heading span:nth-child(3), .gg-row .gg-date { grid-column: 3; } .gg-accordion { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) 6px; margin-left: var(--gg-lane-width, 100px); } .gg-accordion-meta { grid-column: 1; grid-row: 1; border-bottom: 1px solid var(--dsw-alias-border-l1); } .gg-accordion-files { grid-column: 1; grid-row: 2; } .gg-accordion-column-resizer { display: none; } .gg-accordion-height-resizer { grid-row: 3; } .gg-accordion-state { grid-template-rows: minmax(0, 1fr) 6px; } .gg-accordion-state .gg-accordion-height-resizer { grid-row: 2; } }

.gg-host { display: flex; flex-direction: column; height: 100%; min-height: 0;
  font-family: inherit; font-size: var(--dsh-content-font-size, 14px); line-height: 1.45; color: var(--dsw-alias-label-primary); }
.gg-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* The toolbar is one thin row: a name, a count, and icon buttons. */
.gg-toolbar { display: flex; align-items: center; gap: 4px; padding: 5px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); flex: none; min-width: 0; }
.gg-repo { font-weight: 600; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; min-width: 0; flex: 1; }
.gg-count { color: var(--dsw-alias-label-secondary); font-size: 11px; flex: none; }
.gg-mono { font-family: ui-monospace, monospace; font-weight: 500; }
.gg-icon-btn { flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0; cursor: pointer; border-radius: 6px;
  border: 1px solid transparent; background: transparent;
  color: var(--dsw-alias-label-secondary); }
.gg-icon-btn:hover { background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); }
.gg-icon-btn.is-on { background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-brand-primary); }
.gg-notice { flex: none; padding: 3px 10px; font-size: 11px;
  color: var(--dsw-alias-state-success-primary); }

/* The graph scrolls on its own so the toolbar stays put. */
.gg-graph { overflow: auto; flex: 1; min-height: 0; }
.gg-graph-inner { position: relative; }
.gg-canvas { position: absolute; left: 0; top: 0; pointer-events: none; }
.gg-rows { position: relative; }
.gg-row { height: ${ROW_H}px; cursor: pointer; min-width: 0; }
.gg-row:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-row.is-comparing { box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }
.gg-row-body { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
/* The subject is the only element allowed to shrink; everything else is fixed. */
.gg-subject { flex: 1 1 auto; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.gg-row-meta { display: flex; gap: 8px; flex: 0 0 auto; max-width: 45%;
  color: var(--dsw-alias-label-secondary); font-size: inherit; }
.gg-author { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A narrow timestamp must stay within its fixed-height grid row, even when
   the user's text size or locale makes the full date/time wider than the cell. */
.gg-date { flex: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.gg-refs { display: inline-flex; gap: 5px; flex: 0 1 auto; max-width: min(54%, 420px); overflow: hidden; }
.gg-ref { display: inline-flex; flex: 0 1 auto; min-width: 0; height: 20px; border-radius: 4px; line-height: 18px; white-space: nowrap; overflow: hidden; max-width: 210px; background: rgba(128,128,128,.15); border: 1px solid rgba(128,128,128,.7); }
.gg-ref-icon { display: inline-flex; align-items: center; justify-content: center; width: 19px; flex: none; margin: -1px 0 -1px -1px; color: var(--dsw-alias-bg-base); background: var(--gg-ref-color); }
.gg-ref-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; padding: 0 5px; color: var(--dsw-alias-label-primary); font-size: var(--dsh-content-font-size-secondary, 13px); }
/* The remote a branch is in sync with: same pill, one italic segment further.
   The branch name identifies the commit, so this segment yields its space first
   — it shrinks hard and is clipped, and only once it is spent does the name
   start ellipsizing. */
.gg-ref-remote-name { flex: 0 100 auto; min-width: 0; overflow: hidden; padding: 0 5px;
  border-left: 1px solid rgba(128,128,128,.45);
  font-style: italic; color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size-secondary, 13px); }
.gg-ref-head { border-color: var(--gg-ref-color); }
.gg-ref-head .gg-ref-name { font-weight: 600; }
.gg-ref-head .gg-ref-icon { color: white; }
.gg-history-status { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 30px; padding: 2px 10px 8px; color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size-secondary, 13px); }
.gg-spinner { box-sizing: border-box; width: 12px; height: 12px; flex: none; border: 1.5px solid color-mix(in srgb, currentColor 30%, transparent); border-top-color: currentColor; border-radius: 50%; animation: gg-spin .75s linear infinite; }
@keyframes gg-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gg-spinner { animation-duration: 1.8s; } }
.gg-more-btn { display: block; margin: 5px auto 10px; font: inherit; font-size: var(--dsh-content-font-size-secondary, 13px); padding: 3px 9px; cursor: pointer; border-radius: 3px; border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary); }
.gg-more-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }

.gg-scroll { overflow: auto; flex: 1; min-height: 0; }
.gg-detail-wrap { padding: 10px; }
.gg-msg { white-space: pre-wrap; margin: 0 0 10px; line-height: 1.45; }
.gg-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr);
  gap: 3px 10px; margin: 0 0 10px; font-size: 11px; }
.gg-meta dt { font-weight: 600; color: var(--dsw-alias-label-secondary); }
.gg-meta dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }
.gg-link { font: inherit; padding: 0; cursor: pointer; border: 0; background: none;
  color: var(--dsw-alias-brand-primary); text-decoration: underline; }
.gg-compare-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 5px 8px; margin-bottom: 8px; border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2); font-size: 11px; }
.gg-detail-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em;
  color: var(--dsw-alias-label-secondary); margin: 8px 0 4px; }
.gg-diff-summary { flex: none; padding: 4px 10px; font-size: 10.5px;
  color: var(--dsw-alias-label-secondary);
  border-bottom: 1px solid var(--dsw-alias-border-l1); }

.gg-files { display: flex; flex-direction: column; }
.gg-file { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border-radius: 4px; cursor: pointer; min-width: 0; }
.gg-file:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-file-icon { flex: none; width: 16px; height: 16px; fill: color-mix(in srgb, var(--dsw-alias-label-secondary) 22%, transparent); stroke: var(--dsw-alias-label-secondary); stroke-width: 1.2; stroke-linejoin: round; }
.gg-file-icon-folder { fill: light-dark(#d9a441, #dcb659); stroke: light-dark(#8d681e, #e6c46d); }
.gg-file-icon-js, .gg-file-icon-jsx { fill: #d7ba7d33; stroke: #d7ba7d; }
.gg-file-icon-ts, .gg-file-icon-tsx { fill: #519aba33; stroke: #519aba; }
.gg-file-icon-json { fill: #cbcb4133; stroke: #cbcb41; }
.gg-file-icon-md, .gg-file-icon-markdown { fill: #519aba33; stroke: #519aba; }
.gg-file-icon-css, .gg-file-icon-scss { fill: #42a5f533; stroke: #42a5f5; }
.gg-file-icon-html { fill: #e3793333; stroke: #e37933; }
.gg-file-icon-py { fill: #ffd43b33; stroke: #4b8bbe; }
.gg-file-icon-fold { fill: none; }
.gg-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; font: inherit; }
.gg-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.gg-file[data-status='M'], .gg-du-file[data-status='M'] { --gg-status-accent: #e2a93b; }
.gg-file[data-status='A'], .gg-file[data-status='?'], .gg-du-file[data-status='A'], .gg-du-file[data-status='?'] { --gg-status-accent: #3fb950; }
.gg-file[data-status='D'], .gg-file[data-status='U'], .gg-du-file[data-status='D'], .gg-du-file[data-status='U'] { --gg-status-accent: #f85149; }
.gg-file[data-status='R'], .gg-file[data-status='C'], .gg-du-file[data-status='R'], .gg-du-file[data-status='C'] { --gg-status-accent: #58a6ff; }
.gg-file[data-status] .gg-path, .gg-du-file[data-status] .gg-du-path { color: var(--gg-status-accent); }
.gg-group { padding: 0 10px 10px; }

/* The patch: one scroll container, one monospace column, no inner scrolling. */
.gg-diff { padding: 0; }
.gg-diff .gg-patch { border-radius: 0; background: transparent; padding: 4px 0; }
.gg-patch { font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.55;
  margin: 0; }
.gg-diff.is-wrapped .gg-line { white-space: pre-wrap; word-break: break-word; }
.gg-line { padding: 0 10px; white-space: pre; }
.gg-line-add { background: rgba(52,199,89,.14); color: #7ee2a8; }
.gg-line-del { background: rgba(255,69,58,.14); color: #ff9a94; }
.gg-line-hunk { color: var(--dsw-alias-brand-primary); background: rgba(76,154,255,.08); }
.gg-line-meta { color: var(--dsw-alias-label-secondary); }
.gg-line-note { color: var(--dsw-alias-label-secondary); font-style: italic; }

.gg-empty { padding: 10px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.gg-slim { padding: 4px 4px 6px; }
.gg-error { padding: 10px; color: var(--dsw-alias-state-error-primary); font-size: 11px; }
.gg-error-detail { white-space: pre-wrap; font-size: 10.5px; opacity: .85; margin: 6px 0 0; }
.gg-truncated { padding: 6px 10px; color: var(--dsw-alias-state-warn-primary);
  font-size: 10.5px; }

/* The context menu floats over the graph, so it is fixed to the viewport. */
.gg-menu { position: fixed; z-index: 940; min-width: 230px; padding: 5px;
  border-radius: 8px; background: var(--dsw-alias-bg-overlay, #2C2C2E);
  border: 1px solid var(--dsw-alias-border-l2); box-shadow: var(--dsw-shadow-lv3);
  display: flex; flex-direction: column; }
.gg-menu-item { font: inherit; font-size: 11.5px; text-align: left; padding: 5px 8px;
  cursor: pointer; border: 0; border-radius: 5px; background: none;
  color: var(--dsw-alias-label-primary); }
.gg-menu-item:hover { background: var(--dsw-alias-bg-layer-2); }
.gg-menu-note { padding: 4px 8px 2px; font-size: 10px;
  color: var(--dsw-alias-label-secondary); font-family: ui-monospace, monospace; }
.gg-host { min-width: 0; overflow: hidden; }
.gg-workbench { container-type: inline-size; }
.gg-root { min-width: 0; overflow: hidden; }
.gg-mode-content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.gg-mode-content[hidden] { display: none; }
.gg-split { display: grid; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.gg-split-horizontal { grid-template-columns: minmax(0, var(--gg-ratio)) 7px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
.gg-split-vertical { grid-template-rows: minmax(0, var(--gg-ratio)) 7px minmax(0, 1fr); grid-template-columns: minmax(0, 1fr); }
.gg-split-first, .gg-split-second { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.gg-divider { background: var(--dsw-alias-bg-layer-2); position: relative; touch-action: none; outline-offset: -2px; }
.gg-divider::after { content: ''; position: absolute; background: var(--dsw-alias-border-l2); border-radius: 2px; }
.gg-split-horizontal > .gg-divider { cursor: col-resize; }
.gg-split-horizontal > .gg-divider::after { width: 3px; height: 30px; top: calc(50% - 15px); left: 2px; }
.gg-split-vertical > .gg-divider { cursor: row-resize; }
.gg-split-vertical > .gg-divider::after { height: 3px; width: 30px; left: calc(50% - 15px); top: 2px; }
.gg-divider:hover::after, .gg-divider:focus-visible::after { background: var(--dsw-alias-brand-primary); }
.gg-section-heading { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 12px; letter-spacing: 0; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-readonly { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; padding: 2px 5px; }
.gg-row.is-selected, .gg-file.is-selected { background: rgba(128,128,128,.28); }
.gg-row[aria-pressed=true] .gg-subject { font-weight: 600; }
.gg-row:focus-visible, .gg-file:focus-visible, .gg-host button:focus-visible, .gg-host summary:focus-visible, .gg-host input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.gg-host button:disabled { opacity: .4; cursor: default; }
.gg-row .gg-refs { max-width: 34%; }
.gg-row .gg-subject { min-width: 55px; }
.gg-commit-summary { flex: none; max-height: 38%; overflow: auto; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-commit-summary summary { cursor: pointer; padding: 8px 10px; }
.gg-commit-subject { font-size: 12px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.gg-commit-caption { display: block; font-size: 10px; color: var(--dsw-alias-label-secondary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gg-commit-extra { padding: 0 10px 10px; font-size: 11px; overflow-wrap: anywhere; }
.gg-commit-extra .gg-link { margin: 4px 6px 0 0; }
@container (max-width: 350px) { .gg-readonly { display: none; } }

/* The find box and the branch filter sit in their own row, so the column
   heading above them keeps its grid. */
.gg-filter-bar { display: flex; flex: none; align-items: center; gap: 6px; padding: 4px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); }
.gg-branch-filter { width: 170px; flex: none; }
.gg-find { flex: 1 1 auto; min-width: 0; box-sizing: border-box; height: 24px; padding: 0 7px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; font: 12px/22px inherit; }
.gg-find:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.gg-find-count { flex: none; color: var(--dsw-alias-label-secondary); font-size: 11px; white-space: nowrap; }

/* A writing action is longer than the four read entries the menu used to hold,
   so it scrolls rather than running off the bottom of a short sidebar. */
.gg-menu { max-height: min(72vh, 560px); overflow: auto; }
.gg-menu-heading { padding: 5px 8px 2px; color: var(--dsw-alias-label-secondary);
  font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; }
.gg-menu-sep { height: 1px; margin: 4px 5px; background: var(--dsw-alias-border-l1); }
/* A destructive entry is marked by colour and by name; colour alone would be
   the only signal in a theme that renders it near the ordinary ink. */
.gg-menu-item.is-danger { color: var(--dsw-alias-state-error-primary, #cb2431); }

/* A half-finished operation owns the top of the graph: until it is resolved the
   host refuses every other write, so the way out is offered where the graph is. */
.gg-op-banner { display: flex; flex: none; align-items: center; flex-wrap: wrap; gap: 7px;
  padding: 5px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d29922) 14%, transparent);
  color: var(--dsw-alias-label-primary); font-size: 11px; }
.gg-op-banner .gg-op-text { margin-inline-end: auto; }

/* The confirmation dialog dims the graph so the decision is the only thing on
   screen; a press on the backdrop cancels it. */
.gg-modal { position: fixed; inset: 0; z-index: 960; display: flex; align-items: center;
  justify-content: center; padding: 16px; background: rgba(0, 0, 0, .42); }
.gg-dialog { display: flex; flex-direction: column; gap: 9px; width: min(430px, 100%);
  max-height: 100%; overflow: auto; padding: 14px; border-radius: 8px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2); box-shadow: var(--dsw-shadow-lv3);
  font-size: 12px; }
.gg-dialog.is-danger { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #cb2431) 55%, var(--dsw-alias-border-l2)); }
.gg-dialog-title { margin: 0; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.gg-dialog-note { margin: 0; color: var(--dsw-alias-label-secondary); }
.gg-dialog-state { margin: 0; padding: 4px 6px; border-radius: 4px; overflow-wrap: anywhere;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
  font: 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
.gg-dialog-review { display: flex; flex-direction: column; gap: 5px; }
.gg-field { display: flex; flex-direction: column; gap: 3px; }
.gg-field-label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.gg-field input[type=text] { box-sizing: border-box; width: 100%; height: 26px; padding: 0 7px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; font: 12px/24px inherit; }
.gg-field input[type=text]:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.gg-field-select { width: 100%; height: 26px; }
.gg-field-select .gg-du-dropdown-menu { max-width: none; }
.gg-field-check { flex-direction: row; align-items: center; gap: 6px; }
.gg-field-check .gg-field-help { flex-basis: 100%; }
.gg-field-help { color: var(--dsw-alias-label-secondary); font-size: 10.5px; }
.gg-argv { display: block; padding: 5px 7px; border-radius: 4px; overflow-wrap: anywhere;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
  font: 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
.gg-dialog-warnings { margin: 0; padding-left: 16px; font-size: 11px;
  color: var(--dsw-alias-state-warn-primary, #d29922); }
.gg-blocked { margin: 0; font-size: 11px; color: var(--dsw-alias-state-error-primary, #cb2431); }
.gg-dialog-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 3px; }
.gg-btn { height: 26px; padding: 0 11px; border-radius: 4px; cursor: pointer;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1); font: 12px/24px inherit; }
.gg-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.gg-btn:disabled { opacity: .45; cursor: default; }
.gg-btn.is-primary { font-weight: 600; border-color: transparent;
  color: var(--dsw-alias-bg-base); background: var(--dsw-alias-brand-primary); }
.gg-btn.is-primary.is-danger { background: var(--dsw-alias-state-error-primary, #cb2431); color: #fff; }

`
