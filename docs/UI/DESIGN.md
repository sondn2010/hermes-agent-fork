---
name: Synthetic Nexus
colors:
  surface: '#121416'
  surface-dim: '#121416'
  surface-bright: '#37393b'
  surface-container-lowest: '#0c0e10'
  surface-container-low: '#1a1c1e'
  surface-container: '#1e2022'
  surface-container-high: '#282a2c'
  surface-container-highest: '#333537'
  on-surface: '#e2e2e5'
  on-surface-variant: '#bdc8d1'
  inverse-surface: '#e2e2e5'
  inverse-on-surface: '#2f3133'
  outline: '#87929b'
  outline-variant: '#3e4850'
  surface-tint: '#83cfff'
  primary: '#83cfff'
  on-primary: '#00344b'
  primary-container: '#00adef'
  on-primary-container: '#003d57'
  inverse-primary: '#00658d'
  secondary: '#bac3ff'
  on-secondary: '#08218a'
  secondary-container: '#2c3ea3'
  on-secondary-container: '#a8b4ff'
  tertiary: '#a6d64d'
  on-tertiary: '#243600'
  tertiary-container: '#83b02a'
  on-tertiary-container: '#2a3f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c6e7ff'
  primary-fixed-dim: '#83cfff'
  on-primary-fixed: '#001e2e'
  on-primary-fixed-variant: '#004c6c'
  secondary-fixed: '#dee0ff'
  secondary-fixed-dim: '#bac3ff'
  on-secondary-fixed: '#00105c'
  on-secondary-fixed-variant: '#293ca0'
  tertiary-fixed: '#c2f366'
  tertiary-fixed-dim: '#a6d64d'
  on-tertiary-fixed: '#131f00'
  on-tertiary-fixed-variant: '#364e00'
  background: '#121416'
  on-background: '#e2e2e5'
  surface-variant: '#333537'
typography:
  headline-xl:
    fontFamily: Be Vietnam Pro
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 1.375rem
    fontWeight: '600'
    lineHeight: 1.875rem
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 1.25rem
    fontWeight: '500'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.5rem
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.625rem
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.25rem
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes a high-performance, utilitarian AI workbench tailored for engineers, researchers, and power users. Balancing technical precision with rapid conversational flow, the visual language draws inspiration from modern terminal interfaces and advanced developer cockpits while remaining refined, focused, and free of visual clutter.

The aesthetic fuses **Corporate / Modern** discipline with subtle **Dark-Mode Utility**. Surfaces favor dark slate and charcoal tones to eliminate visual fatigue during intensive prompt engineering, multi-turn reasoning analysis, and code synthesis sessions. Primary electric cyan accents signal active computation, interactive focus, and directional intent, grounded by deep indigo structures and punctuated by decisive lime status markers. The emotional resonance is calm, hyper-focused, capable, and instantly dependable.

## Colors

The palette is engineered specifically for deep-contrast low-light terminal and workspace productivity:

- **Primary (`#00ADEF`)**: Electric cyan acts as the system's active pulse. It is applied to primary action buttons, active navigation markers, user query callouts, input focus rings, and real-time generation indicators.
- **Secondary (`#3F51B5`)**: Deep tech indigo serves as structural ballast. It provides subtle contextual framing, model selection badges, agent tool invoke surfaces, and secondary elevated card borders.
- **Tertiary (`#A2D149`)**: High-visibility lime green is reserved strictly for semantic validation: token generation completion, agent thought resolution, live API status pings, and positive benchmark metrics.
- **Neutral (`#1A1C1E`)**: Foundational slate charcoal. Layered surface tokens scale from `#0E1012` (deep canvas backdrop) through `#1A1C1E` (base surface), `#212428` (elevated workbench panels and collapsible sidebar), to `#282B30` (floating menus and interactive tooltips). Text hierarchy leverages `#F0F4F8` for primary conversational text and `#94A3B8` for secondary system telemetry, timestamps, and parameters.

## Typography

The design system relies entirely on Be Vietnam Pro across display titles, conversational streams, and dense functional telemetry. Be Vietnam Pro is purpose-built for Vietnamese: stacked diacritics (ầ, ặ, ữ…) stay legible at 12–14px desktop sizes while keeping consistent vertical metrics and open counters for rapid comprehension. It ships with the app (static Regular/Italic/Medium/SemiBold/Bold, SIL OFL) because Qt does not reliably honor weight axes of variable fonts. Emoji and symbols fall back to the system emoji font (Segoe UI Emoji on Windows).

Text styles prioritize line-height balance to prevent ocular drift during long markdown outputs. Monospace code snippets fall back automatically to standard system developer fonts (`ui-monospace`, `SFMono-Regular`, `Consolas`), while maintaining equivalent baseline heights to `body-md`. Titles feature tight letter-spacing to emphasize authority without unnecessary decoration.

## Layout & Spacing

The interface implements a fluid two-tier workbench architecture:

1. **Persistent / Collapsible Sidebar (Navigation & Session History)**: Fixed width of `16rem` (256px) on desktop, collapsing to an icon rail (`4rem` / 64px) or sliding off-canvas on mobile viewports (<768px).
2. **Central Conversational Canvas**: A fluid column constrained to a readable maximum width of `48rem` (768px) for chat dialogs, expanding to `64rem` (1024px) when multi-column artifacts or side-by-side model comparisons are rendered.

### Breakpoints & Adaptive Layout
- **Mobile (<768px)**: Canvas margins drop to `1rem`. Top navigation houses hamburger triggers and session title truncations. The input composer anchors persistently to the bottom viewport edge with safe-area spacing.
- **Tablet (768px - 1024px)**: Sidebar operates as an overlay layer. The conversational stream adopts `1.25rem` gutters.
- **Desktop (>1024px)**: Static side-by-side panes. Sidebar, canvas, and contextual parameter panels (system prompt, temperature settings) align with `gutter-desktop` (1.5rem) spatial distribution.

## Elevation & Depth

Visual hierarchy is constructed primarily through **Tonal Layering** and subtle **Low-Contrast Outlines**, avoiding heavy drop shadows that muddy dark themes:

- **Level 0 (Canvas Base - `#0E1012`)**: The foundational canvas beneath scroll regions.
- **Level 1 (Primary Surfaces - `#1A1C1E`)**: Conversational stream backdrop, sidebar container, and docked composer container. Outlined with `rgba(255, 255, 255, 0.06)`.
- **Level 2 (Interactive Modules - `#212428`)**: AI response cards, user message bubbles, collapsible reasoning containers, and code snippet blocks. Outlined with `rgba(255, 255, 255, 0.08)`.
- **Level 3 (Overlay & Menus - `#282B30`)**: Dropdowns, model picker modals, command palettes, and floating action toolbars. Elevated with crisp, low-intensity ambient diffusion (`0 8px 24px rgba(0, 0, 0, 0.45)`) and a subtle secondary tint ring (`rgba(63, 81, 181, 0.15)`).

Active prompt targets and focused input borders receive a high-clarity `1.5px` border glow tinted with Primary (`rgba(0, 173, 239, 0.4)`).

## Shapes

The design system enforces a disciplined geometric standard (`roundedness: 2`):

- **Default UI controls (`0.5rem` / 8px)**: Standard buttons, text inputs, chips, model pills, and dropdown selections.
- **Structural cards & surfaces (`1rem` / 16px)**: Agent thought disclosures, code display blocks, prompt container shells, and floating response artifacts.
- **Prominent canvases & dialogs (`1.5rem` / 24px)**: Main setup modals, model playground configuration panels, and onboarding sheets.
- **Pills / Circles (`9999px`)**: User avatars, prompt quick-action tags, execution status badges, and audio-stream waveform buttons.

## Components

### Buttons
- **Primary**: Solid `#00ADEF` background with `#0E1012` bold text. Subtle hover brightness (`#33BEF2`). Provides immediate clarity for prompt dispatch, session creation, and confirmation.
- **Secondary**: Surface-tinted `#212428` with an explicit border `rgba(63, 81, 181, 0.35)` and `#F0F4F8` text. Used for branch management, model tweaking, and session downloads.
- **Ghost / Icon**: Transparent fill with `#94A3B8` hover transition to `#F0F4F8` and background `rgba(255, 255, 255, 0.05)`. Used for message regeneration, clipboard copying, and branch forks.

### Conversational Elements
- **User Prompt Bubble**: Background `#212428` with a distinctive primary accent bar (`2px` border-left in `#00ADEF`), keeping prompt intent clearly separated from response output.
- **AI Response Card**: Borderless flat canvas integration on desktop; background `#1A1C1E` on tablet/mobile. Employs markdown-styled headings, bullet structures, and integrated code blocks.
- **Reasoning / Agent Thought Disclosure**: Collapsible accordion component with `#15181C` background, secondary tech border (`#3F51B5` at 25% opacity), italicized body text, and an animated Tertiary (`#A2D149`) pulse badge while thinking is ongoing.

### Chips & Model Pickers
- **Model Tag**: Compact chip with `0.5rem` radius, `#212428` background, `#00ADEF` micro-indicator dot, and uppercase `label-sm` font.
- **Status Indicator**: High-density pill featuring `#A2D149` dot denoting online inference latency and active context-window consumption.

### Inputs & Textarea Composer
- **Bottom Canvas Composer**: Anchored text area with dynamic auto-expanding vertical height. Background `#212428`, resting border `rgba(255, 255, 255, 0.08)`, focused border `#00ADEF` accompanied by subtle external glow (`0 0 0 3px rgba(0, 173, 239, 0.15)`). Contains direct file upload slots, web-search toggle pills, and an integrated primary dispatch icon button.

### Checkboxes, Radios, & Toggles
- Built with crisp `1.5px` borders in `#94A3B8`. Active states fill with `#00ADEF` (or `#A2D149` for system health configurations).