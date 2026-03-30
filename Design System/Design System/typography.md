# GetBackplate — Typography Reference

## Font

**Plus Jakarta Sans** — used exclusively throughout the entire product.

```css
font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
```

Import via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
```

---

## Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Light | 300 | Decorative separators only |
| Regular | 400 | Long-form body copy |
| Medium | 500 | Nav links, secondary labels |
| Semibold | 600 | Body emphasis, module names |
| Bold | 700 | Buttons, list items, sub-labels |
| Extrabold | 800 | All headlines, prices, numbers |

---

## Scale

| Name | Size | Weight | Tracking | Usage |
|------|------|--------|----------|-------|
| Hero | clamp(42px, 5.5vw, 72px) | 800 | -0.03em | Landing hero H1 only |
| Display | clamp(34px, 4vw, 52px) | 800 | -0.03em | Large section headlines |
| H2 | clamp(26px, 3vw, 40px) | 800 | -0.03em | Section headings |
| H3 | 22px | 800 | -0.02em | Card titles, modal headings |
| H4 | 18–20px | 800 | -0.02em | Sub-section headings |
| Large | 17px | 600–700 | 0 | Feature names, nav items |
| Body | 15px | 400–500 | 0 | Primary body text |
| Body SM | 14px | 400–500 | 0 | Secondary body, card descriptions |
| Small | 13px | 500–600 | 0 | UI labels, nav links |
| XS | 11px | 700 | 0.08em | Uppercase labels (always uppercase) |
| XXS | 10px | 700 | 0.1–0.12em | Badges, tiny labels (always uppercase) |

---

## Letter Spacing Rules

- **Headlines (-0.03em):** All H1–H3. Tight tracking makes large text feel intentional.
- **Normal (0):** Body, buttons, anything 14px and below.
- **Wide (+0.08em):** Label text ONLY when uppercase. Never apply to lowercase body.
- **Widest (+0.12em):** Section dividers and ultra-small uppercase labels only.

```css
/* ✅ Correct — uppercase label */
font-size: 11px;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.1em;

/* ✅ Correct — headline */
font-size: 40px;
font-weight: 800;
letter-spacing: -0.03em;
line-height: 1.1;

/* ❌ Wrong — never wide tracking on body */
font-size: 15px;
letter-spacing: 0.08em; /* Don't do this */
```

---

## Line Heights

| Context | Value | Notes |
|---------|-------|-------|
| Display/Hero | 0.9–1.05 | Very tight for large type |
| Headlines | 1.1 | Standard for H2/H3 |
| UI labels | 1.3 | Buttons, pills, nav |
| Body | 1.6–1.75 | Standard reading |
| Long-form | 1.8 | FAQ answers, paragraphs |

---

## Animated Gradient Text

Three gradient classes available for accent text in headlines:

```jsx
// Orange — operations/features
<span className="grad-orange">First</span>

// Violet — AI ONLY
<span className="grad-violet">never clocks out.</span>

// Mixed — both brand colors, use sparingly
<span className="grad-mixed">GetBackplate</span>
```

**Rule:** Never use `grad-violet` for non-AI content. The violet gradient is reserved exclusively for AI Intelligence references.

---

## Practical Examples

```jsx
// Section eyebrow + headline pattern
<TagPill>Platform Modules</TagPill>
<h2 className="section-h2 mt-3.5">
  Every system your restaurant<br />
  has been running <span className="grad-orange">without.</span>
</h2>

// Hero headline
<h1 className="text-[clamp(42px,5.5vw,72px)] font-extrabold tracking-tightest leading-[1.0]">
  You're invited<br />
  to the <span className="grad-orange">First</span><br />
  Table.
</h1>

// Uppercase label
<span className="text-xxs font-extrabold uppercase tracking-label text-gbp-muted">
  Day Shift
</span>
```
