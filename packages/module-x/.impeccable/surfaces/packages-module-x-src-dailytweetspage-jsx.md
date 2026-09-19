---
version: 1
slug: "packages-module-x-src-dailytweetspage-jsx"
primary_target: "packages/module-x/src/DailyTweetsPage.jsx"
related_targets: []
---

# Daily Tweets Surface Brief

## Direction contract

SEED: daily-tweets-three-column-control-room

THESIS: Make the generation pipeline feel like one operating surface: edit the source on the left, tune the language in the middle, and inspect the final output on the right. Refuse the incumbent split where the prompt panel dominates a narrow left rail while the result waits in a disconnected column.

OWN-WORLD: Preserve Personal Workbench's restrained neutral canvas, System Indigo as the workflow signal, compact system typography, quiet borders, and tonal cards. The three columns are structural zones, not decorative panels; the active generation state owns the strongest indigo emphasis.

STORY: The operator reads left to right. They refine a maintained prompt, choose count and language, generate once, then review and copy final drafts without losing the source context. Empty, loading, dirty, error, and generated states keep the same column ownership.

FIRST VIEWPORT: Keep the page title and compressed three-step pipeline above the workbench. Below it, show one aligned three-column work area: left prompt editor, center generation controls with the primary action, right output canvas. On narrow screens, stack the same zones in source/settings/output order with no horizontal scrolling.

FORM: Use a 3-column grid with a wider source and output region and a compact middle control rail. Keep each zone's heading, helper copy, and actions grouped by proximity. Let the output column own the largest readable text measure; keep the prompt textarea scrollable within its zone. Preserve existing Appica controls, labels, empty state, and copy behavior.

RISK: Three columns can become cramped at intermediate widths and the center rail can look like a detached form. Collapse to a single linear flow before controls become compressed; use shared borders and aligned headings to make the three zones read as one workbench rather than nested cards.
