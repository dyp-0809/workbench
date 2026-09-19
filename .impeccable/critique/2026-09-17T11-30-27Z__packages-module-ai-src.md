---
target: 当前 AI 目录下所有页面的布局 UI问题
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/duanyipeng/Projects/workbench/packages/module-ai/src"
timestamp: 2026-09-17T11-30-27Z
slug: packages-module-ai-src
---
## AI directory critique

Target: `packages/module-ai/src` — routes `/ai`, `/ai/prompts`, `/ai/skills`.

### Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Loading skeletons, live notices, retryable alerts, and model/local status are present; lower-level toggle/delete failures rely on a global toast. |
| 2 | Match System / Real World | 3/4 | Chinese action copy and local framing fit; `SKILL.md`, `Agent`, `SQLite`, and `API Key` expose implementation terms before explaining user value. |
| 3 | User Control and Freedom | 3/4 | Cancel, destructive confirmation, unsaved-note discard protection, and URL-persisted filters work; no clear-all filter or undo after deletion. |
| 4 | Consistency and Standards | 3/4 | Shared hero, card, token, motion, and responsive grammar is coherent across all three surfaces; action hierarchy is still too flat. |
| 5 | Error Prevention | 3/4 | Save gating and destructive confirmations are good; enable/disable actions have less local context when they fail. |
| 6 | Recognition Rather Than Recall | 3/4 | Search, status, category, count, and named actions are visible; technical distinctions and repeated controls still require inference. |
| 7 | Flexibility and Efficiency | 2/4 | Deep-linkable filters help, but a 410-skill library has no bulk triage, recent-use/favorites, command path, or keyboard accelerators. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Calm tonal layering and restrained indigo work; five peer-level actions per full prompt create repeated control noise. |
| 9 | Error Recovery | 3/4 | Load/clipboard errors identify recovery actions; toggle/delete failures do not stay anchored to the affected card. |
| 10 | Help and Documentation | 1/4 | Empty states provide CTAs, but there is no first-use explanation of prompts vs skills, sources, safe use, or action choices. |
| **Total** |  | **27/40** | **Acceptable; significant improvements needed. Operate UI: all ten heuristics apply.** |

### Design Specificity Verdict

**Partly authored, not yet fully Personal Operating System.** The AI area has the right material vocabulary—editorial eyebrow/title, neutral tonal layers, indigo for action/focus, and local-first status—but its organizing idea remains a conventional asset library: counts, filters, cards, and repeated “查看全部.” It shows what exists more strongly than what the user should do next in current work.

**Deterministic scan:** Assessment B ran `/Users/duanyipeng/.agents/skills/impeccable/scripts/impeccable detect --json packages/module-ai/src`. Result: `[]`, 0 findings. No detector false positives. This is a clean rule-level scan, not evidence that hierarchy or task fit is optimal; the detector does not assess live visual hierarchy or route state.

**Browser evidence:** Fresh tabs inspected `/ai`, `/ai/prompts`, and `/ai/skills` at `http://127.0.0.1:5173`, desktop viewport 1440×1000 CSS px, device scale factor 1.25. All three rendered without horizontal overflow. `/ai` showed the hero, two actions, five metrics, quick-start panel, recent prompts, skills panel, with the model/status panel starting below the first viewport. `/ai/prompts` showed the short-prompt card, search/filter controls, and full-prompt collection. `/ai/skills` showed 410 indexed skills, agent tabs, search, two-column cards, and a working details dialog for `archify` with path/content/note controls.

**Visual overlay:** No reliable user-visible overlay is available. Injection was attempted but failed because the live page could not fetch `http://localhost:8400/detect.js` (`TypeError: Failed to fetch`); no helper server was started and no code/config/CSP was changed.

### Overall Impression

The surfaces are visually composed and operationally careful, but the overview and libraries currently optimize for inventory management rather than helping someone choose and apply the next capability. The single biggest opportunity is to make intent and recency outrank counts and card catalogs, then demote secondary actions behind progressive disclosure.

### What’s Working

- The shared hero grammar is specific and disciplined: compact indigo eyebrow, high-contrast editorial title, restrained ambient color, and clear primary/secondary actions align with the product’s hierarchy-before-decoration and tonal-first rules.
- State handling is unusually complete for these library pages: loading skeletons use `aria-live`/`aria-busy`, success notices use `role=status`, failures expose retry, and unsaved Skill notes get a discard confirmation.
- Responsive source strategy is coherent: grids collapse at 900px and stack at 620px; full-width controls appear where needed; Motion and CSS transitions respect reduced-motion preferences.

### Priority Issues

1. **[P1] Every prompt card exposes too many peer-level operations.**
   - **Where:** `PromptPage.jsx:176-193` and `:229-247`; mobile equalization in `packages/shell/src/styles.css:1079-1081` and `:1232-1243`.
   - **Why it matters:** Copy, preview, edit, enable/disable, and delete force a five-way decision on every card. On narrow screens the buttons gain similar visual weight, so the highest-frequency action—copy—is not dominant.
   - **Fix:** Keep Copy as the one visible primary action. Move Preview/Edit/Enable/Delete into a labeled overflow menu with an accessible name and destructive confirmation; let card click open preview/detail.
   - **Suggested command:** `$impeccable distill`

2. **[P1] The 410-skill index is a generic card catalog, not an operational navigator.**
   - **Where:** `SkillsPage.jsx:341-372`, `SkillsPage.jsx:110-115`, and `styles.css:762-781`, `:1284-1289`.
   - **Why it matters:** Users must read hundreds of truncated descriptions to find a capability. `content-visibility` lowers rendering cost, not cognitive cost.
   - **Fix:** Add an intent-first layer with task/use-case categories, recently used, and saved skills; show a visible result/sort strategy; use dense list rows for broad results and reserve cards for curated/recommended skills.
   - **Suggested command:** `$impeccable shape`

3. **[P2] Five equally weighted metric cards dominate the overview before an actionable workflow.**
   - **Where:** `AIDashboardPage.jsx:256-261`, `styles.css:1321-1396`; confirmed in the live `/ai` first viewport.
   - **Why it matters:** “410 skills / 1 agent type” communicates inventory volume but competes with the two work-start actions. The overview feels like a status dashboard instead of a continuation surface.
   - **Fix:** Reduce the strip to 2–3 decision-relevant signals such as active prompts, model readiness, and unread index issues. Elevate recent-use or current-task actions; leave descriptive counts to library pages.
   - **Suggested command:** `$impeccable layout`

4. **[P2] Secondary panel and row actions are visibly compact at 32px.**
   - **Where:** `AIDashboardPage.jsx:269`, `:287`, `:302`; `.ai-page-hero-action` is the only explicit 44px control in `styles.css:668-671`.
   - **Why it matters:** Desktop measurements found “管理短提示词,” “查看全部,” and row-level Copy at 32px. That is below a comfortable touch target and creates a mobile motor-access risk.
   - **Fix:** Give touch-critical panel/row controls a 44px hit area at narrow widths (compact visual chrome is fine), preserve visible focus, and keep adjacent controls at least 8px apart.
   - **Suggested command:** `$impeccable harden`

5. **[P2] Implementation vocabulary leads before user-facing explanation.**
   - **Where:** `AIDashboardPage.jsx:241-245`, `:309`, `:323`; `SkillsPage.jsx:323-325`, `:350-352`.
   - **Why it matters:** “SQLite 持久化,” “SKILL.md,” and “Agent” reassure a technical owner but leave first-time users unsure what is safe, actionable, or different about prompts versus skills.
   - **Fix:** Keep implementation detail as secondary metadata. Lead with “仅保存在这台设备” and “按工具来源浏览能力,” then add one sentence explaining how prompts and skills support work together.
   - **Suggested command:** `$impeccable clarify`

### Persona Red Flags

- **Alex — Power User:** A 410-skill route has no bulk collection/management, recent-use collection, saved list, keyboard shortcut reference, or command-style jump path. Prompt work remains one-item-at-a-time, with repeated five-action scanning.
- **Jordan — First-Timer:** The overview names SQLite and `SKILL.md` before explaining the practical difference between a reusable prompt and an installed capability. Populated libraries do not explain when to copy, preview, edit, enable, or use a skill.
- **Sam — Accessibility-Dependent User:** Structure and live announcements are good, but measured 32px panel/row actions are compact for touch. A complete keyboard-only or 200% zoom walkthrough was not executed, so release readiness is not established.

### Minor Observations

- `/ai` repeats “模型与本机状态” as both kicker and title, and repeats “本机数据” in the hero and lower note.
- `FileText` represents the AI overview, prompts, and skills in module registration; Skills would benefit from a distinct capability/tool glyph.
- Full prompt content is clamped to three lines (`styles.css:970-981`), so long and short prompts can look similar until Preview; show an excerpt/length cue or clearer detail affordance.
- Loading, populated, empty, partial-warning, and retry/error states are source-supported, but the live pass captured only populated `/ai`; empty/error/loading were not induced.
- Dark theme and reduced-motion behavior are token/source-supported but were not browser-preference checked.

### Questions to Consider

- Is the AI directory primarily an inventory of local assets, or should it help choose and apply the next capability from a current task?
- For a 410-skill catalog, what should be the trusted selection signal: task type, recent use, favorites, agent source, or project-specific recommendation?
- Should “提示词” and “Skills” remain technical categories, or should the UI lead with “reusable instructions” and “installed capabilities” while retaining technical labels as metadata?
