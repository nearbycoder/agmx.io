# AGMX design system

One product, one voice. Every screen — marketing, docs, dashboard, mail — follows these rules.
When in doubt: **fewer boxes, fewer colours, more whitespace, sharper type.**

## Principles

1. **Quiet chrome, loud content.** Borders are hairlines (`border-line`). No drop shadows on resting
   surfaces; shadows are only for things that float (menus, dialogs, toasts, the composer).
2. **Cards are for grouping, not decoration.** Don't wrap every block in a card. Prefer a titled
   section with a hairline divider. Never nest cards inside cards.
3. **One accent.** Lime (`accent`) marks the single most important thing on a screen: the unread
   dot, an extracted code, the active tab underline, a focus ring. Never for large fills, never for
   body text on light backgrounds (use `accent-ink`).
4. **Monospace means machine.** Use `font-mono` only for addresses, ids, keys, codes, HTTP and
   JSON. Never for labels, eyebrows or headings.
5. **Copy is plain and specific.** Sentence case everywhere. No marketing filler ("blazing",
   "seamless", "teammate-in-silicon"), no exclamation marks, no emoji in UI.

## Tokens

| | |
| --- | --- |
| Radius | `rounded-md` (6px) chips/kbd · `rounded-lg` (8px) buttons, inputs, menu items · `rounded-xl` (12px) cards, dialogs, panels · `rounded-full` avatars/dots only |
| Borders | `border-line` default, `border-line-strong` on hover/focus. 1px only. |
| Shadow | `shadow-pop` for floating layers only. Resting surfaces: none. |
| Surfaces | `bg` page · `surface` raised panel/card · `bg-subtle` wells, table headers, code-free insets |

### Type scale (Geist)

| Role | Classes |
| --- | --- |
| Marketing display | `text-5xl sm:text-6xl font-semibold tracking-[-0.04em] leading-[1.02]` |
| Marketing section title | `text-3xl sm:text-4xl font-semibold tracking-[-0.03em] leading-[1.1]` |
| Page title (app) | `text-[22px] font-semibold tracking-[-0.02em]` |
| Section / card title | `text-[14px] font-semibold` |
| Body | `text-[14px] text-ink-2 leading-relaxed` (marketing body `text-[16px]`) |
| Secondary | `text-[13px] text-muted` |
| Caption / meta | `text-[12px] text-muted` |
| Overline (rare) | `text-[11px] font-medium uppercase tracking-[0.08em] text-faint` — sans, never mono |

Numbers in tables/stats: `tabular-nums`.

### Spacing

4px grid. Inside cards `p-5`; between stacked sections `gap-8` (app) / `py-24 sm:py-32` (marketing).
App pages: `max-w-6xl`, `px-6 sm:px-8 py-8`. Forms and settings: `max-w-3xl` content column,
left-aligned with the page title (not centred in a wider page).

### Icons

lucide-react, `size-4` (16px) in UI, `size-[18px]` max in nav. Icons are `text-muted` unless
interactive-hover. No icons in coloured tiles; no icon-per-card feature grids.

## Components

- **Button** — `primary` (ink) for the one main action per view; `secondary` (bordered) for
  everything else; `ghost` for toolbars; `danger` only inside confirm dialogs. Heights: `sm` 30px,
  `md` 34px, `lg` 40px.
- **Badge** — `neutral` for metadata, `ok`/`warn`/`danger` for status. Status reads as a dot + word.
- **Stat** — label (13px muted), value (`text-2xl font-semibold tabular-nums`), optional meter and
  caption. Unlimited limits show "Unlimited" in the caption, never an empty or dashed meter.
- **Table** — header row `bg-subtle text-[12px] text-muted font-medium` (sentence case), rows
  `h-12`, hairline separators, row actions in a trailing `…` menu (not repeated red text).
- **Empty state** — one line title, one line explanation, one action. No illustrations in tiles.
- **Code** — dark panel (`#0d0d0f`) everywhere: docs, marketing and app. One radius (`rounded-xl`).

## Marketing pages

- Single background (`bg`) for the whole page; separate sections with whitespace and an
  occasional full-width hairline, not alternating tinted bands. At most one dark band per page.
- Headlines: one colour. No two-tone (black + grey) headings, no gradient text.
- No "eyebrow with a dash" above every section; an overline is allowed only where it adds meaning.
- Show the real product (actual UI components rendered with sample data) rather than abstract
  icon grids. Features are explained in prose + one concrete visual, 3–4 per section max.
