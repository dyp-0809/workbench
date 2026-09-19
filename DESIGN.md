---
name: Personal Workbench
description: 本地优先的个人工作流中枢
colors:
  system-indigo: "oklch(62.31% 0.188 259.81)"
  system-indigo-subtle: "oklch(62.31% 0.188 259.81 / 10%)"
  system-indigo-soft: "oklch(62.31% 0.188 259.81 / 20%)"
  system-indigo-muted: "oklch(70.86% 0.1652 259.81)"
  system-indigo-strong: "oklch(55.07% 0.1846 259.81)"
  neutral-canvas: "oklch(99% 0 0)"
  neutral-card: "oklch(100% 0 0)"
  neutral-ink: "oklch(20% 0 0)"
  neutral-border: "oklch(90% 0 0)"
  dark-canvas: "oklch(15% 0 0)"
  dark-card: "oklch(18% 0 0)"
  dark-border: "oklch(28% 0 0)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "clamp(30px, 3vw, 44px)"
    fontWeight: 760
    lineHeight: 1.05
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "30px"
    fontWeight: 760
    lineHeight: 1.15
    letterSpacing: "-0.045em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0.14em"
rounded:
  base: "0.625rem"
  md: "var(--radius-md)"
  lg: "var(--radius-lg)"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.system-indigo}"
    textColor: "{colors.neutral-card}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.base}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.base}"
    padding: "16px"
  input:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Personal Workbench

## Overview

**Creative North Star: “Personal Operating System”**

Personal Workbench is a personal operating system for independent work: modules are not isolated destinations, but instruments in one continuous working context. The interface should feel like a capable system surface—clear enough to operate quickly, expressive enough to show what matters now, and calm enough to stay open all day.

The incumbent visual language combines an editorial rhythm with semantic UI discipline. Strong headlines, numbered or labeled sections, visible state changes, and deliberate card groupings give content a point of view without turning the product into a marketing surface. The system is layered rather than ornamental: the canvas, cards, borders, and indigo signals explain hierarchy before decoration does.

**Key Characteristics:**
- Personal operating system rather than a collection of dashboards.
- Editorial hierarchy for content-heavy workflows.
- System Indigo as an action and state signal, not a decorative wash.
- Neutral Canvas surfaces with tonal separation.
- Tactile, confident controls with immediate state feedback.

## Colors

The palette is System Indigo + Neutral Canvas: a cool, high-contrast work surface with one recognizable action color and semantic status colors supplied by the application theme.

### Primary
- **System Indigo** (`oklch(62.31% 0.188 259.81)`): Primary actions, active navigation, selected states, focus emphasis, and workflow progress.
- **System Indigo Subtle** (`oklch(62.31% 0.188 259.81 / 10%)`): Low-intensity selection surfaces, icon tiles, and highlighted containers.
- **System Indigo Soft** (`oklch(62.31% 0.188 259.81 / 20%)`): Ambient brand glow and stronger tonal emphasis.
- **System Indigo Muted** (`oklch(70.86% 0.1652 259.81)`): Secondary primary states where contrast must remain quieter.
- **System Indigo Strong** (`oklch(55.07% 0.1846 259.81)`): High-contrast primary variant.

### Neutral
- **Neutral Canvas** (`oklch(99% 0 0)`): Light application background.
- **Neutral Card** (`oklch(100% 0 0)`): Raised content surfaces and form fields.
- **Neutral Ink** (`oklch(20% 0 0)`): Primary text and strong headings.
- **Neutral Border** (`oklch(90% 0 0)`): Dividers, field strokes, and structural boundaries.
- **Dark Canvas** (`oklch(15% 0 0)`): Dark application background.
- **Dark Card** (`oklch(18% 0 0)`): Dark raised surfaces.
- **Dark Border** (`oklch(28% 0 0)`): Dark structural boundaries.

### Named Rules
**The Signal Indigo Rule.** Use System Indigo to communicate action, selection, progress, or focus. Do not spend it uniformly across every surface; its meaning depends on contrast with the neutral canvas.

## Typography

**Display Font:** System UI stack with PingFang SC and Microsoft YaHei fallbacks.

**Body Font:** System UI stack with PingFang SC and Microsoft YaHei fallbacks.

**Label/Mono Font:** Maple Mono NF for code, preformatted content, and fixed-width data; labels remain in the UI font.

**Character:** The type system is compact and operational, with editorial weight reserved for page identity and section hierarchy. Chinese copy stays readable at body sizes while labels use tracked uppercase Latin when they act as system coordinates.

### Hierarchy
- **Display** (760, `clamp(30px, 3vw, 44px)`, `1.05`): Page identity and major editorial titles.
- **Headline** (760, `30px`, approximately `1.15`): Shell page headers.
- **Title** (700, `17px`, `1.35`): Card and section titles.
- **Body** (400, `14px`, `1.6`): Descriptions, content, and supporting instructions.
- **Label** (800, `11px`, `1.3`, tracked `0.14em`): Eyebrows, module coordinates, and workflow stage labels.

### Named Rules
**The Hierarchy Before Decoration Rule.** Use weight, size, spacing, and labels to make a workflow scannable before adding visual effects.

## Layout

The application uses a fixed desktop navigation rail with a flexible content workspace. The shell sidebar is `248px` wide on desktop, reduces to `208px` around `900px`, and becomes a `64px` icon rail around `620px`. Main content remains `min-width: 0` so dense cards and long user content can shrink safely.

The spacing rhythm is built from `4 / 8 / 12 / 16 / 20 / 24px` steps. Dashboard and editor surfaces use grid layouts with `16–20px` gaps. Content-heavy pages use a page-level vertical rhythm, a strong header boundary, and cards that align to the same outer grid.

Responsive behavior prioritizes task continuity: multi-column work areas collapse to one column at `900px`, dense settings and bilingual content stack at `620px`, and controls expand to full width where a narrow viewport would otherwise create cramped targets.

## Elevation & Depth

The default elevation philosophy is tonal layering. Background, card, border, and subtle primary surfaces establish depth without requiring constant shadows. Shadows are reserved for stateful or structurally elevated surfaces such as expanded navigation groups, interactive AI cards, and active workflow controls. Transparent color mixing is used to keep layers connected to the active light or dark theme.

### Shadow Vocabulary
- **Expanded structural lift** (`0 10px 28px color-mix(in oklch, var(--foreground) 5%, transparent)`): Open navigation groups and similar expanded containers.
- **Interactive ambient lift** (`0 10px 30px color-mix(in oklch, var(--foreground) 4%, transparent)`): Interactive cards at rest or hover.
- **Primary state lift** (`0 10px 24px color-mix(in oklch, var(--primary) 10%, transparent)`): Active workflow steps.

### Named Rules
**The Tonal-First Rule.** A component should still read correctly when its shadow is removed; shadow confirms hierarchy rather than creating it.

## Shapes

The form language is compact, rounded, and structural. The base radius is `0.625rem`, with Appica `md` and `lg` radius tokens used for cards, fields, and workflow surfaces. Pills use `999px` only for status and compact semantic badges. Borders are quiet one-pixel structural lines, while active states shift border color toward System Indigo instead of adding heavy ornament.

## Components

### Buttons
- **Shape:** Rounded base silhouette, using the Appica button variants and a minimum comfortable touch target.
- **Primary:** System Indigo background with primary-foreground text; used for the next meaningful action.
- **Hover / Focus:** Explicit border, background, and focus-visible changes; do not use unbounded `transition: all`.
- **Secondary / Ghost / Tertiary:** Neutral or transparent surfaces with semantic text and border contrast; use for supporting actions, refresh, copy, and navigation.

### Chips
- **Style:** Compact rounded status surfaces using semantic background and foreground roles.
- **State:** Outline for expectation or neutral metadata; soft/primary treatment for active language, output, success, or emphasis states.

### Cards / Containers
- **Corner Style:** Appica `md`/`lg` radius tokens; no one-off corner language.
- **Background:** Neutral Card or a transparent tonal mix over Neutral Canvas.
- **Shadow Strategy:** Tonal layering by default; state-specific ambient lift only when it communicates interaction or expansion.
- **Border:** One-pixel `var(--border)` structure, with primary-mixed borders for active or branded surfaces.
- **Internal Padding:** Usually `16px`; editor containers may use `20px` for breathing room.

**The Shared Visual Grammar Rule.** 同一操作层级的区域共享外壳、边框、圆角、内边距与标题对齐；连续步骤用明确间距和连接线表达关系，避免相邻边框粘连。

### Inputs / Fields
- **Style:** Labeled controls on neutral card surfaces, with semantic border and background tokens.
- **Focus:** Visible focus-visible treatment or primary border shift.
- **Error / Disabled:** Inline error surfaces and semantic warning/error colors; disabled actions remain visibly unavailable without removing context.

### Navigation
- **Style:** Fixed left rail on desktop, icon rail on narrow screens, with grouped module navigation.
- **Default / Hover / Active:** Muted default text, tonal hover surface, and System Indigo or primary-subtle active state.
- **Mobile Treatment:** Collapse labels while preserving icons and accessible labels.

### Workflow Stage Rail
The stage rail is the signature system component for process-heavy pages. It uses numbered or checked nodes, a connecting rule, explicit status text, and responsive vertical stacking. It should make the current step and the next action obvious without requiring a separate explanation.

## Do's and Don'ts

### Do:
- **Do** use semantic theme tokens instead of hardcoded role colors.
- **Do** make the current state, next action, and completion state visible in the component itself.
- **Do** keep labels and supporting text concise, with `min-width: 0` on shrinking flex/grid children.
- **Do** preserve light and dark theme contrast using the same semantic roles.
- **Do** use the existing Appica UI variants before introducing a new control silhouette.
- **Do** provide full-width controls and stacked layouts at narrow breakpoints.

### Don't:
- **Don't** flatten a workflow into an undifferentiated list of cards.
- **Don't** use System Indigo as decoration when it should communicate action or state.
- **Don't** introduce arbitrary radii, shadows, or spacing values without a system-level reason.
- **Don't** hide important status or error information in hover-only affordances.
- **Don't** trade keyboard access, focus visibility, or touch target size for visual density.
