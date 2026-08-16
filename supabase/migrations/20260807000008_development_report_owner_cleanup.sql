ALTER TABLE public.development_ledger_reports DISABLE TRIGGER trg_prevent_development_report_mutation;
UPDATE public.development_ledger_reports
SET html_document = $development_report_20260807000008$<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GetBackplate · Registro de cambios jul–ago 2026 · BORRADOR</title>
<style>
  /* reset minimo — equivale al que aplica el runtime de Artifacts */
  *, *::before, *::after { box-sizing: border-box; }
  body, h1, h2, h3, h4, p, figure, blockquote, dl, dd, ol, ul { margin: 0; }
  img, picture, svg { max-width: 100%; display: block; }
</style>
<style>
  :root {
    color-scheme: light dark;

    --paper:      #f7f8fc;
    --paper-alt:  #eef0f7;
    --panel:      #ffffff;
    --panel-alt:  #f3f4fa;
    --ink:        #111827;
    --ink-2:      #47506b;
    --ink-muted:  #737d99;
    --rule:       #e2e5f0;
    --rule-2:     #ccd1e2;

    --integracion: #b4430f;
    --integracion-soft: #fbeee6;
    --plataforma:  #5a37e8;
    --plataforma-soft: #eeeaff;
    --transversal: #0d7f77;
    --transversal-soft: #e2f2f0;
    --alerta:      #9a5b06;
    --alerta-soft: #fbf0dd;

    --shadow: 0 1px 2px rgba(17,24,39,.05), 0 12px 28px -18px rgba(17,24,39,.28);

    --serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
    --sans: system-ui, "Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    --mono: ui-monospace, "Cascadia Mono", "Cascadia Code", Consolas, "SF Mono", Menlo, monospace;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --paper:      #0d0f14;
      --paper-alt:  #12141c;
      --panel:      #171a23;
      --panel-alt:  #1e2230;
      --ink:        #edf0ff;
      --ink-2:      #b6bed6;
      --ink-muted:  #808aa6;
      --rule:       #262a38;
      --rule-2:     #363b4d;

      --integracion: #ff8354;
      --integracion-soft: #2e1c14;
      --plataforma:  #9b85ff;
      --plataforma-soft: #1e1a33;
      --transversal: #35c3b6;
      --transversal-soft: #10262a;
      --alerta:      #e0a349;
      --alerta-soft: #2a2113;

      --shadow: 0 1px 2px rgba(0,0,0,.5), 0 16px 32px -22px rgba(0,0,0,.9);
    }
  }

  :root[data-theme="light"] {
    --paper: #f7f8fc; --paper-alt: #eef0f7; --panel: #ffffff; --panel-alt: #f3f4fa;
    --ink: #111827; --ink-2: #47506b; --ink-muted: #737d99;
    --rule: #e2e5f0; --rule-2: #ccd1e2;
    --integracion: #b4430f; --integracion-soft: #fbeee6;
    --plataforma: #5a37e8; --plataforma-soft: #eeeaff;
    --transversal: #0d7f77; --transversal-soft: #e2f2f0;
    --alerta: #9a5b06; --alerta-soft: #fbf0dd;
    --shadow: 0 1px 2px rgba(17,24,39,.05), 0 12px 28px -18px rgba(17,24,39,.28);
  }

  :root[data-theme="dark"] {
    --paper: #0d0f14; --paper-alt: #12141c; --panel: #171a23; --panel-alt: #1e2230;
    --ink: #edf0ff; --ink-2: #b6bed6; --ink-muted: #808aa6;
    --rule: #262a38; --rule-2: #363b4d;
    --integracion: #ff8354; --integracion-soft: #2e1c14;
    --plataforma: #9b85ff; --plataforma-soft: #1e1a33;
    --transversal: #35c3b6; --transversal-soft: #10262a;
    --alerta: #e0a349; --alerta-soft: #2a2113;
    --shadow: 0 1px 2px rgba(0,0,0,.5), 0 16px 32px -22px rgba(0,0,0,.9);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 16px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .wrap {
    max-width: 1220px;
    margin: 0 auto;
    padding: 0 clamp(1rem, 4vw, 2.75rem) 5rem;
  }

  /* ---------- Encabezado ---------- */

  .masthead {
    border-bottom: 1px solid var(--rule-2);
    padding: clamp(2.5rem, 6vw, 4.25rem) 0 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.15rem;
  }

  .eyebrow {
    font-family: var(--mono);
    font-size: .7rem;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: var(--ink-muted);
    margin: 0;
  }

  .masthead h1 {
    font-family: var(--serif);
    font-weight: 600;
    font-size: clamp(2.15rem, 5.4vw, 3.5rem);
    line-height: 1.08;
    letter-spacing: -.015em;
    text-wrap: balance;
    margin: 0;
  }

  .masthead h1 em {
    font-style: normal;
    color: var(--integracion);
  }

  .lede {
    font-size: clamp(1rem, 1.6vw, 1.1rem);
    color: var(--ink-2);
    max-width: 62ch;
    margin: 0;
  }

  .period {
    display: inline-flex;
    align-items: center;
    gap: .6rem;
    font-family: var(--mono);
    font-size: .78rem;
    color: var(--ink-2);
    background: var(--panel-alt);
    border: 1px solid var(--rule);
    border-radius: 999px;
    padding: .35rem .85rem;
    align-self: flex-start;
    font-variant-numeric: tabular-nums;
  }

  .period b { color: var(--ink); font-weight: 600; }

  /* ---------- Cifras ---------- */

  .figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1px;
    background: var(--rule);
    border: 1px solid var(--rule);
    border-radius: 10px;
    overflow: hidden;
    margin: 2.5rem 0 0;
  }

  .figure {
    background: var(--panel);
    padding: 1.15rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: .2rem;
  }

  .figure-n {
    font-family: var(--serif);
    font-size: 2.05rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.02em;
  }

  .figure-l {
    font-size: .78rem;
    color: var(--ink-muted);
    letter-spacing: .01em;
  }

  /* ---------- Gráfico de actividad ---------- */

  .activity {
    margin: 2.5rem 0 0;
    background: var(--panel);
    border: 1px solid var(--rule);
    border-radius: 10px;
    padding: 1.35rem 1.4rem 1.1rem;
    box-shadow: var(--shadow);
  }

  .activity h2 {
    font-family: var(--sans);
    font-size: .8rem;
    font-weight: 600;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--ink-2);
    margin: 0 0 .3rem;
  }

  .activity p.hint {
    margin: 0 0 1.15rem;
    font-size: .85rem;
    color: var(--ink-muted);
  }

  .plot-scroll { overflow-x: auto; padding-bottom: .3rem; }

  .plot {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 132px;
    min-width: 560px;
    border-bottom: 1px solid var(--rule-2);
    position: relative;
  }

  .plot::before {
    content: "";
    position: absolute;
    inset-inline: 0;
    top: 0;
    border-top: 1px dashed var(--rule);
  }

  .bar {
    flex: 1 1 0;
    position: relative;
    display: flex;
    align-items: flex-end;
    height: 100%;
    min-width: 0;
  }

  .bar i {
    display: block;
    width: 100%;
    background: var(--integracion);
    border-radius: 4px 4px 0 0;
    transition: filter .15s ease;
  }

  .bar:hover i, .bar:focus-visible i { filter: brightness(1.25); }
  .bar:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: 4px; }

  .bar::after {
    content: attr(data-tip);
    position: absolute;
    top: .45rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ink);
    color: var(--paper);
    font-family: var(--mono);
    font-size: .68rem;
    line-height: 1.35;
    white-space: pre;
    padding: .35rem .5rem;
    border-radius: 5px;
    opacity: 0;
    pointer-events: none;
    transition: opacity .12s ease;
    z-index: 5;
  }

  .bar:first-child::after { left: 0; transform: none; }
  .bar:last-child::after { left: auto; right: 0; transform: none; }

  .bar:hover::after, .bar:focus-visible::after { opacity: 1; }

  .plot-axis {
    display: flex;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: .68rem;
    color: var(--ink-muted);
    margin-top: .5rem;
    min-width: 560px;
  }

  .peak {
    margin: .9rem 0 0;
    font-size: .82rem;
    color: var(--ink-muted);
  }

  .peak b { color: var(--ink-2); font-weight: 600; }

  /* ---------- Leyenda ---------- */

  .legend {
    margin: 2.5rem 0 0;
    border: 1px solid var(--rule);
    border-radius: 10px;
    background: var(--panel-alt);
    padding: 1.15rem 1.35rem;
    display: grid;
    gap: .85rem;
  }

  .legend h2 {
    font-size: .8rem;
    font-weight: 600;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--ink-2);
    margin: 0;
  }

  .legend-row {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem .9rem;
    align-items: center;
    font-size: .85rem;
    color: var(--ink-2);
  }

  .swatch {
    display: inline-flex;
    align-items: center;
    gap: .45rem;
    font-size: .82rem;
  }

  .swatch span.dot {
    width: 10px; height: 10px; border-radius: 3px; display: inline-block;
  }

  /* ---------- Cuerpo en dos columnas ---------- */

  .body-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 3rem;
    margin-top: 3.25rem;
    align-items: start;
  }

  @media (min-width: 1024px) {
    .body-grid { grid-template-columns: 224px minmax(0, 1fr); gap: 3.5rem; }
  }

  .rail { display: none; }

  @media (min-width: 1024px) {
    .rail {
      display: block;
      position: sticky;
      top: 2rem;
      font-size: .85rem;
    }
  }

  .rail h2 {
    font-family: var(--mono);
    font-size: .68rem;
    letter-spacing: .15em;
    text-transform: uppercase;
    color: var(--ink-muted);
    margin: 0 0 .85rem;
    font-weight: 500;
  }

  .rail ol { list-style: none; margin: 0; padding: 0; display: grid; gap: .1rem; }

  .rail a {
    display: flex;
    justify-content: space-between;
    gap: .6rem;
    align-items: baseline;
    padding: .34rem .55rem .34rem .7rem;
    color: var(--ink-2);
    text-decoration: none;
    border-left: 2px solid var(--rule);
    border-radius: 0 4px 4px 0;
  }

  .rail a:hover { background: var(--panel-alt); color: var(--ink); }
  .rail a:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
  .rail a b { font-family: var(--mono); font-size: .7rem; color: var(--ink-muted); font-weight: 500; font-variant-numeric: tabular-nums; }

  .rail li.part > a {
    font-weight: 600;
    color: var(--ink);
    margin-top: .9rem;
    border-left-color: currentColor;
  }
  .rail li.part-i  > a { color: var(--integracion); }
  .rail li.part-p  > a { color: var(--plataforma); }
  .rail li.part-t  > a { color: var(--transversal); }
  .rail li.part:first-child > a { margin-top: 0; }

  /* ---------- Partes y secciones ---------- */

  .part-head {
    padding: 1.5rem 0 1.15rem;
    border-top: 2px solid currentColor;
    margin-top: 3.5rem;
  }

  .part-head:first-of-type { margin-top: 0; }

  .part-head .kicker {
    font-family: var(--mono);
    font-size: .7rem;
    letter-spacing: .16em;
    text-transform: uppercase;
    margin: 0 0 .5rem;
  }

  .part-head h2 {
    font-family: var(--serif);
    font-size: clamp(1.6rem, 3.2vw, 2.1rem);
    line-height: 1.14;
    letter-spacing: -.012em;
    margin: 0;
    color: var(--ink);
    text-wrap: balance;
  }

  .part-head p {
    margin: .7rem 0 0;
    color: var(--ink-2);
    max-width: 68ch;
    font-size: .95rem;
  }

  #integracion { color: var(--integracion); }
  #plataforma  { color: var(--plataforma); }
  #transversal { color: var(--transversal); }

  .section {
    background: var(--panel);
    border: 1px solid var(--rule);
    border-left: 3px solid var(--accent, var(--rule-2));
    border-radius: 8px;
    padding: 1.4rem 1.5rem 1.5rem;
    margin-top: 1.15rem;
    box-shadow: var(--shadow);
  }

  .section.i { --accent: var(--integracion); }
  .section.p { --accent: var(--plataforma); }
  .section.t { --accent: var(--transversal); }

  .section > h3 {
    font-family: var(--sans);
    font-size: 1.05rem;
    font-weight: 650;
    letter-spacing: -.005em;
    margin: 0;
    color: var(--ink);
    text-wrap: balance;
  }

  .section > p.sub {
    margin: .5rem 0 0;
    color: var(--ink-2);
    font-size: .92rem;
    max-width: 70ch;
  }

  .entries {
    list-style: none;
    margin: 1.15rem 0 0;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .entries > li {
    display: grid;
    grid-template-columns: 6.6rem minmax(0, 1fr);
    gap: .35rem .9rem;
    padding: .8rem 0;
    border-top: 1px solid var(--rule);
  }

  @media (max-width: 560px) {
    .entries > li { grid-template-columns: 1fr; gap: .45rem; }
  }

  .entries > li > div { min-width: 0; }

  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.35rem;
    padding: 0 .5rem;
    border-radius: 4px;
    font-family: var(--mono);
    font-size: .64rem;
    letter-spacing: .07em;
    text-transform: uppercase;
    font-weight: 600;
    white-space: nowrap;
    justify-self: start;
    margin-top: .12rem;
  }

  .chip.nuevo { background: var(--accent-soft, var(--panel-alt)); color: var(--accent, var(--ink-2)); }
  .chip.fix   { background: var(--panel-alt); color: var(--ink-2); border: 1px solid var(--rule-2); }
  .chip.mejora { background: var(--transversal-soft); color: var(--transversal); border: 1px solid transparent; }
  .chip.seg   { background: var(--alerta-soft); color: var(--alerta); }
  .chip.doc   { background: transparent; color: var(--ink-muted); border: 1px dashed var(--rule-2); }

  .section.i { --accent-soft: var(--integracion-soft); }
  .section.p { --accent-soft: var(--plataforma-soft); }
  .section.t { --accent-soft: var(--transversal-soft); }

  .what {
    margin: 0;
    font-size: .95rem;
    color: var(--ink);
  }

  .why {
    margin: .25rem 0 0;
    font-size: .87rem;
    color: var(--ink-2);
  }

  .tech {
    margin: .4rem 0 0;
    font-family: var(--mono);
    font-size: .73rem;
    line-height: 1.55;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }

  .tech::before { content: "▸ "; }

  /* ---------- Antes / después de las pruebas ---------- */

  .ba {
    display: grid;
    grid-template-columns: 1fr auto 1fr 1fr;
    align-items: center;
    gap: 1rem;
    margin: 1.25rem 0 0;
    padding: 1.15rem 1.25rem;
    background: var(--panel-alt);
    border: 1px solid var(--rule);
    border-radius: 8px;
  }

  @media (max-width: 640px) {
    .ba { grid-template-columns: 1fr; gap: 1.1rem; }
    .ba-arrow { display: none; }
  }

  .ba-col { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }

  .ba-when {
    margin: 0;
    font-family: var(--mono);
    font-size: .66rem;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .ba-n {
    margin: .15rem 0 0;
    font-family: var(--serif);
    font-size: 2.1rem;
    line-height: 1;
    letter-spacing: -.02em;
    font-variant-numeric: tabular-nums;
    color: var(--ink-2);
  }

  .ba-now .ba-n, .ba-delta .ba-n { color: var(--transversal); }

  .ba-l { margin: .3rem 0 0; font-size: .8rem; color: var(--ink-muted); }

  .ba-arrow { font-size: 1.4rem; color: var(--rule-2); text-align: center; }

  .ba-note {
    margin: .9rem 0 0;
    font-size: .84rem;
    color: var(--ink-2);
    max-width: 70ch;
  }

  .ba-note strong { color: var(--ink); font-weight: 650; }

  mark {
    background: var(--alerta-soft);
    color: var(--alerta);
    padding: 0 .22rem;
    border-radius: 3px;
    font-weight: 600;
  }

  /* ---------- Tabla de cronología ---------- */

  .timeline-wrap { overflow-x: auto; margin-top: 1.15rem; }

  table.timeline {
    width: 100%;
    min-width: 620px;
    border-collapse: collapse;
    font-size: .89rem;
  }

  table.timeline th, table.timeline td {
    text-align: left;
    padding: .75rem .85rem;
    border-bottom: 1px solid var(--rule);
    vertical-align: top;
  }

  table.timeline thead th {
    font-family: var(--mono);
    font-size: .67rem;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--ink-muted);
    font-weight: 500;
    border-bottom: 1px solid var(--rule-2);
  }

  table.timeline td.wk {
    font-family: var(--mono);
    font-size: .78rem;
    color: var(--ink-2);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  table.timeline td.n {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    color: var(--ink-2);
    text-align: right;
  }

  table.timeline tbody tr:hover { background: var(--panel-alt); }

  /* ---------- Cierre ---------- */

  .closing {
    margin-top: 3.5rem;
    border-top: 1px solid var(--rule-2);
    padding-top: 1.5rem;
    font-size: .85rem;
    color: var(--ink-muted);
    display: grid;
    gap: .4rem;
  }

  .closing b { color: var(--ink-2); font-weight: 600; }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
  }
</style>
<style>
  /* ============ CAPA DE BORRADOR: cobrado / por cobrar ============ */

  :root {
    --cobrado:      #0f7a3d;
    --cobrado-soft: #e4f3ea;
    --cobrado-line: #b9dfc9;
  }
  @media (prefers-color-scheme: dark) {
    :root { --cobrado: #55d98a; --cobrado-soft: #0f2a1b; --cobrado-line: #1e4a31; }
  }
  :root[data-theme="light"] { --cobrado: #0f7a3d; --cobrado-soft: #e4f3ea; --cobrado-line: #b9dfc9; }
  :root[data-theme="dark"]  { --cobrado: #55d98a; --cobrado-soft: #0f2a1b; --cobrado-line: #1e4a31; }

  body { padding-bottom: 6.5rem; }

  /* --- aviso de borrador --- */
  .draft-note {
    margin: 1.5rem 0 0;
    border: 1px dashed var(--rule-2);
    border-radius: 10px;
    background: var(--panel-alt);
    padding: 1rem 1.2rem;
    display: grid;
    gap: .4rem;
  }
  .draft-note h2 {
    margin: 0; font-size: .8rem; font-weight: 600;
    letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2);
  }
  .draft-note p { margin: 0; font-size: .87rem; color: var(--ink-2); max-width: 74ch; }
  .draft-note b { color: var(--ink); }

  /* --- encabezado de seccion con su subtotal --- */
  .sec-head {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: .6rem 1.25rem; flex-wrap: wrap;
  }
  .sec-head h3 {
    font-family: var(--sans); font-size: 1.05rem; font-weight: 650;
    letter-spacing: -.005em; margin: 0; color: var(--ink);
    text-wrap: balance; flex: 1 1 16rem; min-width: 0;
  }
  .sec-total {
    font-family: var(--mono); font-size: .72rem; color: var(--ink-muted);
    font-variant-numeric: tabular-nums; white-space: nowrap; flex: 0 0 auto;
  }
  .sec-total b { color: var(--integracion); font-weight: 600; }

  /* --- marca de cobro dentro de cada item --- */
  .bill { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin-top: .45rem; }

  .pill {
    display: inline-flex; align-items: center; gap: .4rem;
    height: 1.7rem; padding: 0 .6rem; border-radius: 5px;
    font-family: var(--mono); font-size: .68rem; font-weight: 600;
    letter-spacing: .04em; text-transform: uppercase; white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .pill-paid    { background: var(--cobrado-soft); color: var(--cobrado); border: 1px solid var(--cobrado-line); }
  .pill-partial { background: var(--alerta-soft);  color: var(--alerta);  border: 1px solid transparent; }
  .pill-incl    { background: transparent; color: var(--ink-muted); border: 1px dashed var(--rule-2); }

  .bill-field {
    display: inline-flex; align-items: center; gap: .3rem;
    height: 1.7rem; padding: 0 .5rem 0 .55rem;
    border: 1px solid var(--rule-2); border-radius: 5px;
    background: var(--panel);
  }
  .bill-field:focus-within { border-color: var(--ink-2); box-shadow: 0 0 0 3px var(--panel-alt); }
  .bill-field .cur {
    font-family: var(--mono); font-size: .68rem; color: var(--ink-muted); letter-spacing: .04em;
  }
  .bill-field input {
    width: 5rem; border: 0; background: transparent; color: var(--ink);
    font-family: var(--mono); font-size: .8rem; font-variant-numeric: tabular-nums;
    text-align: right; padding: 0; outline: none; -moz-appearance: textfield;
  }
  .bill-field input::-webkit-outer-spin-button,
  .bill-field input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .bill-field input::placeholder { color: var(--ink-muted); opacity: .7; }
  .bill-field.filled { border-color: var(--integracion); }

  .section-price {
    margin-top: 1.1rem;
    padding: .85rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .75rem 1.25rem;
    flex-wrap: wrap;
    background: var(--accent-soft, var(--panel-alt));
    border: 1px solid var(--accent, var(--rule-2));
    border-radius: 8px;
  }
  .section-price-copy { display: grid; gap: .12rem; }
  .section-price-copy strong { font-size: .88rem; color: var(--ink); }
  .section-price-copy span { font-size: .76rem; color: var(--ink-2); }
  .section-price .bill-field { background: var(--panel); }

  .date-tag {
    font-family: var(--mono); font-size: .66rem; letter-spacing: .04em;
    color: var(--ink-muted); white-space: nowrap;
    padding: .15rem .4rem; border-radius: 4px; border: 1px solid transparent;
  }
  .renglon {
    font-family: var(--sans); font-size: .72rem; color: var(--ink-muted);
    font-style: italic;
  }
  .pill-paid.clickable, .bill-field .undo { cursor: pointer; }
  .bill-field .undo {
    border: 0; background: transparent; padding: 0 0 0 .1rem; line-height: 1;
    color: var(--ink-muted); font-size: .85rem;
  }
  .bill-field .undo:hover { color: var(--cobrado); }

  /* --- barra de totales --- */
  .totbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
    background: var(--panel); border-top: 1px solid var(--rule-2);
    box-shadow: 0 -8px 24px -18px rgba(0,0,0,.55);
  }
  .totbar-in {
    max-width: 1220px; margin: 0 auto;
    padding: .7rem clamp(1rem, 4vw, 2.75rem);
    display: flex; align-items: center; gap: 1rem 1.6rem; flex-wrap: wrap;
  }
  .tot { display: flex; flex-direction: column; gap: .05rem; }
  .tot-l {
    font-family: var(--mono); font-size: .62rem; letter-spacing: .12em;
    text-transform: uppercase; color: var(--ink-muted);
  }
  .tot-n {
    font-family: var(--mono); font-size: 1rem; font-weight: 600;
    font-variant-numeric: tabular-nums; color: var(--ink-2);
  }
  .tot-n.paid  { color: var(--cobrado); }
  .tot-n.pend  { color: var(--integracion); }
  .tot-n.grand { color: var(--ink); font-size: 1.25rem; }
  .totbar .spacer { flex: 1 1 auto; }
  .totbar button {
    font-family: var(--sans); font-size: .78rem; color: var(--ink-2);
    background: var(--panel-alt); border: 1px solid var(--rule-2);
    border-radius: 6px; padding: .4rem .8rem; cursor: pointer;
  }
  .totbar button:hover { background: var(--paper-alt); color: var(--ink); }
  .totbar button:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }

  .breakdown { border-top: 1px solid var(--rule); background: var(--panel-alt); }
  .breakdown-in {
    max-width: 1220px; margin: 0 auto;
    padding: .85rem clamp(1rem, 4vw, 2.75rem);
    display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .6rem 1.6rem;
  }
  .bd-row {
    display: flex; justify-content: space-between; gap: 1rem;
    font-size: .82rem; color: var(--ink-2);
    border-bottom: 1px dotted var(--rule-2); padding-bottom: .25rem;
  }
  .bd-row span:last-child { font-family: var(--mono); font-variant-numeric: tabular-nums; }

  @media print {
    .totbar { position: static; box-shadow: none; }
    body { padding-bottom: 0; }
    .bill-field { border-color: #999; }
  }
</style>
</head>
<body>

<div class="wrap">

  <header class="masthead">
    <p class="eyebrow">GetBackplate · Registro de cambios</p>
    <h1>Trabajo realizado y <em>valor entregado</em></h1>
    <p class="lede">
      Todo lo que se agregó, mejoró o corrigió en la plataforma entre el 1 de julio y el 6 de agosto de 2026,
      separado por plan y explicado primero en palabras simples. Cada punto sale del historial real del repositorio.
    </p>
    <p class="period"><b>01 jul 2026</b> → <b>06 ago 2026</b> · 29 días con cambios</p>
  </header>

  <section class="figures" aria-label="Cifras del período">
    <div class="figure"><span class="figure-n">306</span><span class="figure-l">commits realizados</span></div>
    <div class="figure"><span class="figure-n">88</span><span class="figure-l">funciones nuevas</span></div>
    <div class="figure"><span class="figure-n">171</span><span class="figure-l">correcciones</span></div>
    <div class="figure"><span class="figure-n">71</span><span class="figure-l">cambios de base de datos</span></div>
    <div class="figure"><span class="figure-n">+846</span><span class="figure-l">pruebas automáticas nuevas</span></div>
    <div class="figure"><span class="figure-n">29</span><span class="figure-l">días con commits</span></div>
  </section>

  <section class="activity">
    <h2>Ritmo del período</h2>
    <p class="hint">Commits realizados por día. Pasa el cursor sobre una barra para ver el detalle.</p>
    <div class="plot-scroll">
      <div class="plot" role="img" aria-label="Commits por día entre el 1 de julio y el 6 de agosto de 2026. Máximo 30 commits el 30 de julio.">
        <span class="bar" tabindex="0" data-tip="1 jul&#10;6 commits"><i style="height:20%"></i></span>
        <span class="bar" tabindex="0" data-tip="3 jul&#10;4 commits"><i style="height:13%"></i></span>
        <span class="bar" tabindex="0" data-tip="5 jul&#10;2 commits"><i style="height:7%"></i></span>
        <span class="bar" tabindex="0" data-tip="6 jul&#10;1 commit"><i style="height:3%"></i></span>
        <span class="bar" tabindex="0" data-tip="9 jul&#10;7 commits"><i style="height:23%"></i></span>
        <span class="bar" tabindex="0" data-tip="10 jul&#10;4 commits"><i style="height:13%"></i></span>
        <span class="bar" tabindex="0" data-tip="13 jul&#10;10 commits"><i style="height:33%"></i></span>
        <span class="bar" tabindex="0" data-tip="14 jul&#10;14 commits"><i style="height:47%"></i></span>
        <span class="bar" tabindex="0" data-tip="15 jul&#10;23 commits"><i style="height:77%"></i></span>
        <span class="bar" tabindex="0" data-tip="16 jul&#10;18 commits"><i style="height:60%"></i></span>
        <span class="bar" tabindex="0" data-tip="17 jul&#10;3 commits"><i style="height:10%"></i></span>
        <span class="bar" tabindex="0" data-tip="19 jul&#10;2 commits"><i style="height:7%"></i></span>
        <span class="bar" tabindex="0" data-tip="20 jul&#10;10 commits"><i style="height:33%"></i></span>
        <span class="bar" tabindex="0" data-tip="21 jul&#10;2 commits"><i style="height:7%"></i></span>
        <span class="bar" tabindex="0" data-tip="22 jul&#10;12 commits"><i style="height:40%"></i></span>
        <span class="bar" tabindex="0" data-tip="23 jul&#10;1 commit"><i style="height:3%"></i></span>
        <span class="bar" tabindex="0" data-tip="24 jul&#10;26 commits"><i style="height:87%"></i></span>
        <span class="bar" tabindex="0" data-tip="25 jul&#10;9 commits"><i style="height:30%"></i></span>
        <span class="bar" tabindex="0" data-tip="26 jul&#10;8 commits"><i style="height:27%"></i></span>
        <span class="bar" tabindex="0" data-tip="28 jul&#10;13 commits"><i style="height:43%"></i></span>
        <span class="bar" tabindex="0" data-tip="29 jul&#10;24 commits"><i style="height:80%"></i></span>
        <span class="bar" tabindex="0" data-tip="30 jul&#10;30 commits"><i style="height:100%"></i></span>
        <span class="bar" tabindex="0" data-tip="31 jul&#10;11 commits"><i style="height:37%"></i></span>
        <span class="bar" tabindex="0" data-tip="1 ago&#10;4 commits"><i style="height:13%"></i></span>
        <span class="bar" tabindex="0" data-tip="2 ago&#10;14 commits"><i style="height:47%"></i></span>
        <span class="bar" tabindex="0" data-tip="3 ago&#10;10 commits"><i style="height:33%"></i></span>
        <span class="bar" tabindex="0" data-tip="4 ago&#10;6 commits"><i style="height:20%"></i></span>
        <span class="bar" tabindex="0" data-tip="5 ago&#10;20 commits"><i style="height:67%"></i></span>
        <span class="bar" tabindex="0" data-tip="6 ago&#10;12 commits"><i style="height:40%"></i></span>
      </div>
      <div class="plot-axis"><span>1 jul</span><span>17 jul</span><span>30 jul</span><span>6 ago</span></div>
    </div>
    <p class="peak">Pico el <b>30 de julio</b> con 30 commits, el día del rediseño del selector de alcance y del historial de checklists.</p>
  </section>

  <section class="draft-note">
    <h2>Borrador de cobro — no es el informe final</h2>
    <p>Cada área lleva al lado su estado. Las áreas marcadas como <b>Facturado anteriormente</b> no llevan
    precio. Las demás tienen un campo para que le pongas el precio vos; el total se arma solo en la barra de
    abajo. Los importes están en <b>dólares</b> y se guardan en este navegador, así que podés cerrar y seguir
    después.</p>
  </section>

  <section class="legend">
    <h2>Cómo leer esta guía</h2>
    <div class="legend-row">
      <span class="swatch"><span class="dot" style="background:var(--integracion)"></span> Plan de Integración</span>
      <span class="swatch"><span class="dot" style="background:var(--plataforma)"></span> Plan de Plataforma</span>
      <span class="swatch"><span class="dot" style="background:var(--transversal)"></span> Transversal (afecta a los dos)</span>
    </div>
    <div class="legend-row">
      <span class="chip nuevo" style="--accent:var(--ink-2);--accent-soft:var(--panel)">Nuevo</span> algo que antes no existía &nbsp;·&nbsp;
      <span class="chip fix">Corrección</span> algo que estaba mal y se arregló &nbsp;·&nbsp;
      <span class="chip mejora">Mejora</span> algo existente que ahora funciona mejor &nbsp;·&nbsp;
      <span class="chip seg">Seguridad</span> protección de datos o accesos &nbsp;·&nbsp;
      <span class="chip doc">Legal</span> textos, contratos y contenido público
    </div>
    <div class="legend-row" style="color:var(--ink-muted);font-size:.82rem">
      Bajo cada punto, la línea en tipografía de máquina es el detalle técnico: archivo, migración o mecanismo.
    </div>
  </section>

  <div class="body-grid">

    <nav class="rail" aria-label="Índice">
      <h2>Contenido</h2>
      <ol>
        <li class="part part-i"><a href="#integracion">Plan de Integración <b>8</b></a></li>
        <li><a href="#i1">Envío de facturas <b>14</b></a></li>
        <li><a href="#i2">Conexión con QuickBooks <b>12</b></a></li>
        <li><a href="#i3">Reportes y alertas <b>13</b></a></li>
        <li><a href="#i4">Cobros y facturación <b>13</b></a></li>
        <li><a href="#i5">Sitio público y legales <b>12</b></a></li>
        <li><a href="#i6">Referidos y leads <b>6</b></a></li>
        <li><a href="#i7">Alta de clientes e idioma <b>5</b></a></li>
        <li><a href="#i8">Preparación para Intuit Review <b>16</b></a></li>

        <li class="part part-p"><a href="#plataforma">Plan de Plataforma <b>8</b></a></li>
        <li><a href="#p1">Quién ve qué <b>14</b></a></li>
        <li><a href="#p2">Notificaciones <b>19</b></a></li>
        <li><a href="#p3">Checklists <b>14</b></a></li>
        <li><a href="#p4">Documentos y archivos <b>10</b></a></li>
        <li><a href="#p5">Personal y puestos <b>12</b></a></li>
        <li><a href="#p6">Entrar a la plataforma <b>8</b></a></li>
        <li><a href="#p7">Soporte <b>4</b></a></li>
        <li><a href="#p8">Idioma <b>3</b></a></li>

        <li class="part part-t"><a href="#transversal">Transversal <b>5</b></a></li>
        <li><a href="#t1">Seguridad y datos <b>6</b></a></li>
        <li><a href="#t2">Retención y auditoría <b>4</b></a></li>
        <li><a href="#t3">Consistencia <b>4</b></a></li>
        <li><a href="#t4">Infraestructura <b>2</b></a></li>
        <li><a href="#t5">Pruebas y docs <b>4</b></a></li>

        <li class="part"><a href="#cronologia">Cronología</a></li>
      </ol>
    </nav>

    <main>

      <!-- ============ PARTE 1 ============ -->

      <section class="part-head" id="integracion">
        <p class="kicker">Parte 1 · 8 áreas</p>
        <h2>Plan de Integración — QuickBooks Online ↔ Restaurant365</h2>
        <p>El puente que lleva facturas de QuickBooks a Restaurant365. El trabajo de estas cinco semanas se
        concentró en tres cosas: que ninguna factura se pierda ni se duplique, que la conexión con Intuit
        aguante una revisión oficial, y que el negocio alrededor (compras, cobros, referidos, textos legales)
        quedara completo.</p>
      </section>

      <article class="section i" id="i1">
        <h3>1.1 · Que las facturas lleguen siempre, y una sola vez</h3>
        <p class="sub">El corazón del producto. Antes había varias formas de que una factura se enviara dos veces,
        o de que se quedara trabada sin que nadie se enterara. Se cerraron todas.</p>
        <ul class="entries">
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Una misma factura ya no puede enviarse dos veces a R365.</p>
            <p class="why">Si dos procesos corrían al mismo tiempo, ambos tomaban la misma factura. Ahora cada factura se "aparta" antes de mandarse y el segundo proceso la encuentra ocupada.</p>
            <p class="tech">Claim atómico en <code>20260703000001_qbo_unified_invoices_claim.sql</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Se destrabó el envío automático de facturas.</p>
            <p class="why">Un comportamiento inesperado de la capa de base de datos hacía que el envío automático quedara colgado sin error visible.</p>
            <p class="tech">Bug de PostgREST rodeado en el pipeline de envío QBO → R365</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Los clientes sin FTP ahora sí ven sus facturas mapeadas.</p>
            <p class="why">Antes, si un cliente no tenía configurado el envío por FTP, el sistema se saltaba también el mapeo. Ahora mapea igual y solo omite el envío.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Si marcar una factura como "mapeada" falla, ahora se entera.</p>
            <p class="why">El resultado de esa operación no se revisaba, así que un fallo pasaba desapercibido y la factura quedaba en un estado incorrecto.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Las notas de crédito con importes negativos ya no rompen la validación.</p>
            <p class="why">Los credit memos llegan con montos negativos por definición y el validador los rechazaba como si fueran un error.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El webhook de QuickBooks ya no se corta a la mitad.</p>
            <p class="why">Tenía 10 segundos de tiempo máximo y en lotes grandes se cortaba. Ahora tiene 60.</p>
            <p class="tech"><code>maxDuration</code> 10s → 60s en el handler del webhook QBO</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Soporte de CloudEvents de Intuit y mejoras generales de confiabilidad.</p>
            <p class="why">El formato de eventos que Intuit está adoptando, más reintentos y trazas en todo el recorrido de la factura.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Los avisos de clientes que aún no configuraron el sync se marcan como "ignorados", no como error.</p>
            <p class="why">Llenaban el registro de errores falsos y escondían los problemas reales.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Aviso al superadmin cuando un aviso de QuickBooks no se puede procesar.</p>
            <p class="why">Antes fallaba en silencio. Ahora llega una alerta con el detalle.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Los números de cuenta de clientes cargan mucho más rápido y los que fallan se reintentan solos.</p>
            <p class="tech">Carga de <em>Account No.</em> paralelizada con reintento de fallidos</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El tablero ya no se rompe cuando Intuit limita las peticiones.</p>
            <p class="why">Un error 429 (demasiadas peticiones) tumbaba toda la pantalla del tablero QBO-R365. Ahora se maneja y el resto sigue funcionando.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se guarda el identificador de cada respuesta de Intuit, para poder rastrear un problema con ellos.</p>
            <p class="tech">Trace IDs + <code>20260720000007_intuit_api_response_logs.sql</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Registro de las ejecuciones del proceso de recuperación.</p>
            <p class="why">Queda constancia de cada vez que el sistema intenta recuperar facturas que no salieron.</p>
            <p class="tech"><code>20260709000001_qbo_recovery_run_log.sql</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Cola durable de webhooks de QuickBooks y recuperación diaria por CDC.</p>
            <p class="why">Cada aviso se guarda antes de procesarse, conserva sus intentos y estados, y una reconciliación diaria recupera documentos cuyo webhook no llegó.</p>
            <p class="tech"><code>qbo_webhook_receipts</code> + reclamos, reintentos y reconciliación CDC · commit <code>1ced3d1c</code></p>
          </div></li>
        </ul>
      </article>

      <article class="section i" id="i2">
        <h3>1.2 · Conectar y desconectar QuickBooks con seguridad</h3>
        <p class="sub">Todo el bloque necesario para pasar la revisión de la Intuit App Store, más el inicio de sesión
        con la cuenta de Intuit.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Inicio de sesión con la cuenta de Intuit (Sign in with Intuit).</p>
            <p class="why">Un cliente que ya usa QuickBooks entra con esa misma cuenta, sin crear otra contraseña.</p>
            <p class="tech">Migraciones <code>20260717000003</code>, <code>20260717000004</code>, <code>20260718000001</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Después de la verificación en dos pasos, el login con Intuit ya no rebota al principio.</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">El identificador de la empresa de QuickBooks se guarda cifrado.</p>
            <p class="tech">Cifrado de <code>realmId</code> + cabeceras <code>Cache-Control</code> en rutas sensibles</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Una misma empresa de QuickBooks no puede quedar conectada a dos organizaciones distintas.</p>
            <p class="tech"><code>20260719000002_qbo_realm_ownership.sql</code></p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">El retorno del login de QuickBooks se valida y ya no se puede desviar a otro sitio.</p>
            <p class="tech">Validación de <code>redirect</code> en el auth callback + endurecimiento del OAuth callback</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Desconectar QuickBooks ahora desconecta de verdad.</p>
            <p class="why">Antes solo se borraba de nuestro lado; la autorización seguía viva en Intuit.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Botón oficial "Connect to QuickBooks" y cumplimiento completo de la marca Intuit.</p>
            <p class="why">Requisito para publicar en su tienda: nombre, logo, textos y aviso de marca registrada exactos.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Paquete completo de "listo para revisión de Intuit": retención de datos, soporte y facturación.</p>
            <p class="tech"><code>20260719000001</code>, <code>20260720000001</code> y <code>INTUIT_REVIEW_READINESS.md</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El botón de Intuit aparece solo si la empresa realmente tiene ese plan.</p>
            <p class="why">Se mostraba también a quien entra desde el lado de plataforma, donde no aplica.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El puente entre dominios ya no invalida la sesión antes de usarla.</p>
            <p class="why">Se revocaba el token justo antes de que el otro dominio lo necesitara y el usuario quedaba fuera.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Cada campo del modal de conexión tiene al lado una ayuda que explica qué va ahí.</p>
            <p class="why">Los datos de la configuración de sincronización no eran obvios y había que preguntar. La ayuda se abre hacia abajo cuando arriba no hay espacio en pantalla.</p>
            <p class="tech">Componente compartido <code>shared/ui/field-help.tsx</code> + textos en <code>qbo-r365.i18n.ts</code></p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Separación estricta entre QuickBooks sandbox y producción.</p>
            <p class="why">El entorno de desarrollo queda forzado a sandbox y una configuración contradictoria se rechaza antes de hacer una petición, para que una prueba no alcance datos reales.</p>
            <p class="tech">Resolución fail-closed de entorno QBO + cobertura crítica · commit <code>cfab1c37</code></p>
          </div></li>
        </ul>
      </article>

      <article class="section i" id="i3">
        <h3>1.3 · Reportes al dueño y alertas</h3>
        <p class="sub">Visibilidad de la operación sin tener que entrar a mirar. Lo que antes había que revisar a mano
        ahora llega solo, en el horario correcto y sin duplicados.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Reporte semanal de operaciones para el dueño de la plataforma.</p>
            <p class="tech">Servicio de reporte semanal + <code>20260713000002_qbo_owner_weekly_report_runs.sql</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Reportes separados: uno semanal y otro mensual por organización.</p>
            <p class="why">Antes iban mezclados y en el idioma equivocado.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El horario y el corte del reporte mensual coinciden con el ciclo de facturación real.</p>
            <p class="why">Los números del reporte no cuadraban con lo que se cobraba porque las fechas de corte eran distintas.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El reporte semanal ya no se manda dos veces ni se queda colgado.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Página pública de preferencias de correo y baja de suscripción, con enlace propio desde cada reporte.</p>
            <p class="why">El que recibe el reporte entra desde el correo, sin contraseña, y elige entre tres opciones: <b>semanal</b>, <b>mensual</b> o <b>apagar el reporte</b>. La página le aclara que los avisos de cuenta y facturación siguen llegando igual, porque no se pueden desactivar.</p>
            <p class="tech"><code>/email/preferences</code> con token · <code>20260721000002_qbo_report_preferences.sql</code> y <code>20260722000002</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Los dueños reciben copia de los reportes de integración de sus clientes.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El reporte lista solo los fallos de entrega que siguen activos.</p>
            <p class="why">Arrastraba fallos ya resueltos y parecía que había más problemas de los reales.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Herramienta para mandar el reporte semanal a un solo destinatario, para probarlo antes.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Alertas automáticas de integración al teléfono de todos los superadmin.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Aviso inmediato cuando se cae la conexión de QuickBooks de un cliente.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Las alertas llegan a la campanita aunque el superadmin no tenga las notificaciones del teléfono activadas.</p>
            <p class="why">Si dependía solo del push, quien no lo tenía prendido nunca se enteraba.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">La tarjeta de facturas del tablero muestra el ciclo de facturación actual, no todo el histórico.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">La página de baja de suscripción quedó con el logo de GetBackplate y el mismo aspecto que el resto de las páginas públicas.</p>
            <p class="why">Es una página que el cliente ve fuera de la app, llegando desde un correo: si no tiene la marca, parece de otro lado.</p>
            <p class="tech"><code>email/preferences/page.tsx</code> y <code>preferences.module.css</code></p>
          </div></li>
        </ul>
      </article>

      <article class="section i" id="i4">
        <h3>1.4 · Compras, cobros y correos de facturación</h3>
        <p class="sub">El cliente ahora puede comprar, pagar y entender su factura sin salir del producto — y si un
        cobro falla, el sistema lo recupera en vez de perderlo.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">El cliente puede comprar conexiones adicionales de R365 desde la app.</p>
            <p class="tech"><code>20260716000002_r365_connection_purchases.sql</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Recibo automático por cada pago de suscripción exitoso, con el PDF de la factura adjunto.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">El recordatorio de renovación detalla cada concepto y avisa si hay un cargo por uso pendiente.</p>
            <p class="why">Así nadie se sorprende con un monto distinto al que esperaba.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Los cobros de Stripe ahora son recuperables.</p>
            <p class="why">Si el aviso de pago de Stripe falla, se reintenta; si se agotan los intentos, queda apartado con aviso en vez de perderse.</p>
            <p class="tech"><code>20260726000010</code>, <code>20260803000001/2/3</code> — ciclo de vida y cola muerta de eventos Stripe</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Los correos de facturación llevan a una página que funciona.</p>
            <p class="why">Apuntaban a <code>/app/billing</code>, que ya no existía tras separar los dominios.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Todos los correos de facturación usan la marca y el color naranja de GetBackplate.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">El pago se completa dentro del modal, sin sacar al usuario de la pantalla.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Los 4 planes de integración se ven en una sola fila en el modal de ajustes.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Se quitó la fecha repetida del recordatorio de renovación.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Se quitó del link de suscripción la sugerencia de cargo por facturas aún no facturadas.</p>
            <p class="why">Confundía: mostraba un monto que todavía no se iba a cobrar.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Las tarjetas de planes de la landing son las mismas que se ven dentro de la app.</p>
            <p class="why">Un solo lugar donde mantener precios y descripciones.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Setup fee opcional con reglas completas para mensual, anual y suscripciones existentes.</p>
            <p class="why">El cliente puede incluirlo o excluirlo; si elige anual recibe el descuento configurado y una suscripción que ya lo pagó no vuelve a cobrarlo.</p>
            <p class="tech">Metadata consistente de setup en Checkout y Subscription + pruebas de planes y upgrades</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">La facturación por excedentes quedó protegida contra cargos duplicados o mal asociados.</p>
            <p class="why">Cada cargo usa una clave idempotente, se vincula a la suscripción correcta y no adelanta el marcador de facturación si Stripe o la base fallan.</p>
            <p class="tech">Idempotencia y validaciones de usage billing · commit <code>cfab1c37</code></p>
          </div></li>
        </ul>
      </article>

      <article class="section i" id="i5">
        <h3>1.5 · Sitio público, legales y Trust Center</h3>
        <p class="sub">La cara pública del producto de integración: cómo se ve, qué promete y qué dice legalmente.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Rediseño visual completo de la landing de integración, siguiendo la maqueta.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Trust Center público, con las pantallas de conexión exitosa y desconexión rediseñadas.</p>
            <p class="why">Es la página donde un cliente corporativo verifica cómo se tratan sus datos antes de firmar.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Página de Respuesta a Incidentes, enlazada desde el pie de todas las páginas.</p>
          </div></li>
          <li><span class="chip doc">Legal</span><div>
            <p class="what">Aviso de marca registrada de Intuit y QuickBooks en todas las páginas legales.</p>
          </div></li>
          <li><span class="chip doc">Legal</span><div>
            <p class="what">Dirección legal actualizada a McAllen, y separada de la dirección comercial de la empresa.</p>
          </div></li>
          <li><span class="chip doc">Legal</span><div>
            <p class="what">Los precios del contrato marco (MSA) se alinearon con los reales.</p>
            <p class="why">Se corrigió el 14 de julio y se volvió a ajustar el 6 de agosto con la lista definitiva.</p>
          </div></li>
          <li><span class="chip doc">Legal</span><div>
            <p class="what">Se quitó del contrato y del Trust Center el compromiso de mantener pólizas de seguro.</p>
            <p class="why">Era una promesa que no se podía sostener hoy. Mejor no prometerla que incumplirla.</p>
          </div></li>
          <li><span class="chip doc">Legal</span><div>
            <p class="what">Se quitó la cifra de "siete años" de retención de las páginas legales de integración.</p>
          </div></li>
          <li><span class="chip doc">Legal</span><div>
            <p class="what">Sentry aparece listado como subprocesador en la política de privacidad y el Trust Center.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El Trust Center decía que el envío cifrado (FTPS) era opcional; en realidad ya viene activo.</p>
          </div></li>
          <li><span class="chip doc">Legal</span><div>
            <p class="what">Se sacaron de los textos públicos los canales de contacto que no existen, y los correos se alinearon a un solo esquema.</p>
            <p class="tech">hello / support / security / referrals en legales, /refer y payment links</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Navegación y pie compartidos en todas las páginas públicas y legales, con el mismo aspecto.</p>
          </div></li>
        </ul>
      </article>

      <article class="section i" id="i6">
        <h3>1.6 · Referidos y leads</h3>
        <p class="sub">Un canal nuevo de entrada de clientes, desde el formulario público hasta el seguimiento interno.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Formulario público en <code>/refer</code> para que cualquiera recomiende un proveedor.</p>
            <p class="tech"><code>20260713000001_qbo_public_vendor_referrals.sql</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Más datos de contacto en el referido y aviso a los dueños por cada uno que entra.</p>
            <p class="tech"><code>20260715000001_add_public_referral_contact_details.sql</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Bandeja de leads en superadmin, con asignación a una persona responsable.</p>
            <p class="tech"><code>20260716000001_superadmin_leads.sql</code>, <code>20260717000001_superadmin_leads_assignment.sql</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">La bandeja se convirtió en un CRM completo de leads de referidos.</p>
            <p class="tech"><code>20260722000003_superadmin_referral_leads_crm.sql</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Un referido que falla al guardarse ya no se pierde en silencio.</p>
            <p class="why">Ahora avisa, hay un proceso automático que recupera los que fallaron y llega un aviso al superadmin.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Ajustes de contenido, tamaño del logo y destino del enlace en el formulario y sus correos.</p>
          </div></li>
        </ul>
      </article>

      <article class="section i" id="i7">
        <h3>1.7 · Alta de clientes solo-integración e idioma</h3>
        <p class="sub">Un cliente que solo compra la integración no debería ver ni configurar el resto de la plataforma.
        Y todo lo que ve, en inglés.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se pueden crear organizaciones que tienen únicamente el módulo de integración.</p>
            <p class="tech"><code>20260714000003_allow_integration_only_module_profile.sql</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">El alta inicial se puede omitir y retomar después.</p>
            <p class="tech"><code>20260722000004_integration_onboarding_skip_state.sql</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Los módulos de esas organizaciones salen de una sola fuente, la del plan contratado.</p>
            <p class="why">Había dos lugares que decían qué módulos tenía un cliente y a veces no coincidían.</p>
            <p class="tech"><code>plan_modules</code> como fuente única</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Toda la experiencia de integración quedó en inglés: menús, QuickBooks, Ajustes, alta, facturación y correos.</p>
            <p class="tech"><code>20260721000001_qbo_module_english_copy.sql</code> + forzado de idioma por plan</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">La palabra genérica "invoice" pasó a ser "document" en toda la integración.</p>
            <p class="why">No siempre es una factura; también son notas de crédito y otros comprobantes.</p>
          </div></li>
        </ul>
      </article>

      <section class="section i" id="i8">
        <h3>1.8 · Preparación completa para el review de Intuit</h3>
        <p class="sub">Resumen consolidado de todo lo realizado para presentar GetBackplate ante Intuit. Esta sección
        reúne trabajo ya detallado en otras áreas y validaciones operativas posteriores. Sus ítems se cotizan juntos
        mediante un único precio general.</p>
        <div class="section-price">
          <div class="section-price-copy">
            <strong>Preparación para Intuit Review</strong>
          </div>
          <label class="bill-field">
            <span class="cur">US$</span>
            <input type="number" min="0" step="5" placeholder="0" id="intuitReviewPrice" data-section-price data-price-key="i8-total" data-price-plan="i" aria-label="Importe de preparación para Intuit Review">
          </label>
        </div>
        <ul class="entries">
          <li><span class="chip nuevo">Review</span><div>
            <p class="what">Entorno productivo exclusivo para el reviewer: organización <code>Intuit Review</code>.</p>
            <p class="why">La revisión tiene un tenant propio, separado de clientes reales y configurado únicamente con datos sintéticos.</p>
          </div></li>
          <li><span class="chip seg">Acceso</span><div>
            <p class="what">Usuario reviewer exclusivo con rol Company Admin y verificación en dos pasos por email.</p>
            <p class="why">Se creó un Gmail dedicado y se verificó el login completo; Intuit recibirá por canal privado las credenciales de la app y del buzón para obtener sus códigos MFA.</p>
          </div></li>
          <li><span class="chip seg">Producción</span><div>
            <p class="what">Credenciales y entorno productivo de QuickBooks configurados explícitamente.</p>
            <p class="why">Se restauró la clave correcta de cifrado de integraciones, se declaró <code>QBO_ENVIRONMENT=production</code> y se comprobó que los secretos almacenados se pueden descifrar.</p>
          </div></li>
          <li><span class="chip nuevo">QBO</span><div>
            <p class="what">Compañía QuickBooks Online productiva dedicada conectada a Intuit Review.</p>
            <p class="why">El grant OAuth, el customer y todos los documentos usados por el reviewer pertenecen a esa compañía de prueba controlada.</p>
          </div></li>
          <li><span class="chip nuevo">R365</span><div>
            <p class="what">Conexión Restaurant365 de revisión con FTPS AlwaysData independiente.</p>
            <p class="why">Se configuraron host, usuario writer, usuario viewer, carpeta <code>/APImports/R365</code>, cifrado de contraseña y ubicación <code>INTUIT-REVIEW</code>.</p>
          </div></li>
          <li><span class="chip nuevo">Datos</span><div>
            <p class="what">Juego completo de datos ficticios dentro de QuickBooks.</p>
            <p class="why">Incluye customer de revisión, dirección, contacto, términos, SKU, artículos de producto y delivery fee, facturas y notas de crédito con varias líneas.</p>
          </div></li>
          <li><span class="chip nuevo">Validación</span><div>
            <p class="what">Prueba manual de Invoice y Credit Memo hasta Restaurant365.</p>
            <p class="why"><code>REVIEW-INV-1001</code> y <code>REVIEW-CM-1001</code> fueron detectados, transformados, enviados al FTPS y registrados con historial y preview.</p>
          </div></li>
          <li><span class="chip nuevo">Validación</span><div>
            <p class="what">Prueba automática completa de Invoice por webhook.</p>
            <p class="why"><code>REVIEW-INV-1003</code> se envió por email desde QBO, generó un evento <code>Emailed</code>, entró al historial como enviada y produjo el CSV en FTPS sin sincronización manual.</p>
          </div></li>
          <li><span class="chip nuevo">Validación</span><div>
            <p class="what">Prueba automática completa de Credit Memo con importes negativos.</p>
            <p class="why"><code>REVIEW-CM-1002</code> recorrió email → webhook → transformación → historial → FTPS. El archivo final contiene precios <code>-17.50</code> y <code>-5.00</code>, y totales <code>-35.00</code> y <code>-5.00</code>.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Validación de Credit Memos adaptada al formato contable de R365.</p>
            <p class="why">Se corrigió el rechazo de importes negativos y quedó cubierto por pruebas automáticas antes de ejecutar la validación productiva.</p>
            <p class="tech">Commit <code>7f467829</code></p>
          </div></li>
          <li><span class="chip seg">OAuth</span><div>
            <p class="what">Flujo OAuth endurecido y alineado con los requisitos de Intuit.</p>
            <p class="why">Usa el scope contable requerido, callback exacto, state firmado, ownership único del realm, tokens y realm cifrados, refresh controlado y botón oficial Connect to QuickBooks.</p>
          </div></li>
          <li><span class="chip seg">Desconexión</span><div>
            <p class="what">Desconexión real y revocación remota del acceso.</p>
            <p class="why">Al desconectar se revoca el token ante Intuit antes de limpiar los secretos locales; también se manejan revocaciones detectadas por portal o refresh inválido.</p>
          </div></li>
          <li><span class="chip seg">Webhooks</span><div>
            <p class="what">Recepción de webhooks firmada, durable y recuperable.</p>
            <p class="why">La firma HMAC se valida antes de procesar; se soportan CloudEvents y formato legacy; los recibos se guardan con intentos y una reconciliación CDC recupera eventos faltantes.</p>
          </div></li>
          <li><span class="chip doc">Legal</span><div>
            <p class="what">Paquete público legal, soporte y seguridad listo para evaluación.</p>
            <p class="why">Incluye Privacy Policy, EULA/Terms, MSA, Incident Response, Trust Center, soporte y solicitudes de acceso, corrección, exportación o eliminación de datos.</p>
          </div></li>
          <li><span class="chip seg">Privacidad</span><div>
            <p class="what">Retención, minimización y trazabilidad documentadas y aplicadas.</p>
            <p class="why">Datos operativos QBO se purgan a los 12 meses, los CSV se generan en memoria, Sentry Session Replay está desactivado y cada respuesta de Intuit conserva su trace ID para soporte.</p>
          </div></li>
          <li><span class="chip doc">Entrega</span><div>
            <p class="what">Runbook privado y ficha de Intuit App Store preparados.</p>
            <p class="why">Quedaron documentados credenciales privadas, recorrido del reviewer, evidencias esperadas, URLs públicas, descripción comercial, funciones, uso de datos, logos disponibles y capturas necesarias. Se aclaró la diferencia intencional entre domicilio legal de McAllen y operativo de Houston.</p>
          </div></li>
        </ul>
        <p class="ba-note"><strong>Aislamiento confirmado:</strong> ninguna de estas pruebas usó documentos, tokens,
        conexiones, credenciales ni archivos de Prodel.</p>
      </section>

      <!-- ============ PARTE 2 ============ -->

      <section class="part-head" id="plataforma">
        <p class="kicker">Parte 2 · 8 áreas</p>
        <h2>Plan de Plataforma — operación diaria y personal</h2>
        <p>Avisos, checklists, documentos, mantenimiento, proveedores y expedientes de empleados.
        El eje del período fue una auditoría a fondo de <strong>quién ve qué</strong>, que destapó fallas que
        llevaban meses activas, más una reconstrucción del sistema de notificaciones y del historial de checklists.</p>
      </section>

      <article class="section p" id="p1">
        <h3>2.1 · Quién ve qué — el alcance</h3>
        <p class="sub">El mecanismo que decide a quién le llega cada aviso, checklist o documento, según su sucursal,
        departamento, puesto o nombre. Era el punto más frágil del producto y ahora tiene una sola regla, con
        una guardia automática que impide volver a desviarse.</p>
        <ul class="entries">
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what"><mark>Se restauró el filtro por puesto</mark>, que llevaba unos tres meses roto.</p>
            <p class="why">Un aviso, checklist o documento dirigido a un puesto concreto le llegaba a gente que no era de ese puesto. Corregido en avisos, checklists y documentos.</p>
            <p class="tech"><code>20260725000001_restore_position_scope_matching.sql</code>, <code>20260725000002</code></p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">El permiso "Ver" apagado ahora sí restringe.</p>
            <p class="why">En avisos, checklists y documentos, quitarle "Ver" a alguien no le quitaba nada: seguía viendo todo.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Quien trabaja en varias sucursales dejó de quedar fuera.</p>
            <p class="why">El sistema miraba una sola sucursal por persona, así que las demás no recibían nada. Afectaba avisos, checklists, mantenimiento y proveedores.</p>
            <p class="tech"><code>20260726000001_fix_maintenance_multilocacion.sql</code> + combinación membership × employee</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Un alcance dirigido solo a personas concretas ahora es realmente privado.</p>
            <p class="why">Al no tener sucursal ni puesto, el sistema lo interpretaba como "para todos".</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Combinar dos criterios (por ejemplo sucursal + puesto) ya no anula el filtro.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Una sola regla de alcance para toda la plataforma, con una guardia que avisa si alguien se desvía.</p>
            <p class="why">Cada módulo tenía su propia versión de la misma regla; por eso los errores aparecían de a uno.</p>
            <p class="tech"><code>20260729000003_unify_scope_rules.sql</code> + job de CI de la "Regla de Oro"</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Selector de alcance rediseñado en tres intenciones claras, en modales de tres columnas.</p>
            <p class="why">Antes había que adivinar si estabas dirigiendo a todos, a un grupo o a personas concretas.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Las carpetas heredan el alcance hacia adentro, con indicador visual y confirmación al mover.</p>
            <p class="why">Mover una carpeta podía cambiar quién ve su contenido sin que nadie lo notara.</p>
            <p class="tech"><code>20260726000002_folder_scope_inheritance.sql</code></p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Se muestra la sucursal concreta por la que cada persona entra en el alcance.</p>
            <p class="why">Con varias sucursales no quedaba claro por cuál estaba incluida.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">El puesto de un empleado pasó de ser texto suelto a una referencia real al catálogo.</p>
            <p class="why">Por eso renombrar un puesto rompía los filtros: el texto viejo quedaba huérfano.</p>
            <p class="tech"><code>20260729000005_employees_position_id.sql</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Renombrar un puesto o un departamento ahora se refleja en todos lados.</p>
          </div></li>
          <li><span class="chip doc">Docs</span><div>
            <p class="what">Documentado por qué las sucursales viven en tres tablas y cómo se resuelven las de una persona.</p>
            <p class="tech">Eliminada la tabla duplicada <code>announcement_audiences</code> (<code>20260729000004</code>)</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">La vista previa y descarga de documentos reconocen todas las sucursales autorizadas de una persona.</p>
            <p class="why">Antes se revisaba solo la sucursal principal y se podía negar un documento válido asignado a una ubicación secundaria.</p>
            <p class="tech">Autorización por conjunto completo de ubicaciones · commit <code>2a3dda6a</code></p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Los proveedores quedaron protegidos por sucursal tanto al verlos como al modificarlos.</p>
            <p class="why">Un empleado solo ve proveedores de sus ubicaciones y las operaciones rechazan cambios de proveedores o sucursales fuera de su alcance.</p>
            <p class="tech">Alcance de vendors + escrituras atómicas · commits <code>eaa6d5fd</code> y <code>eac0767b</code></p>
          </div></li>
        </ul>
      </article>

      <article class="section p" id="p2">
        <h3>2.2 · Notificaciones</h3>
        <p class="sub">Se reconstruyó cómo avisa el sistema: nada se pierde, nada se duplica, y cada aviso dice
        quién lo generó.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Toda notificación deja registro garantizado en la campanita, mande push o correo o los dos.</p>
            <p class="why">Si alguien no tenía el push activo o no abría el correo, no quedaba rastro de que se le había avisado.</p>
            <p class="tech"><code>20260729000001_notifications_in_app_channel.sql</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Se eliminó la campanita duplicada en 8 flujos que mandaban push y correo a la misma persona.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Se eliminó el sistema de notificaciones de mantenimiento que estaba duplicado.</p>
            <p class="why">Convivían dos, y cada uno avisaba por su cuenta.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Mantenimiento avisa por campanita y teléfono al crear y al responder una solicitud.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Casilla de correo opcional al dar de alta un mantenimiento, y los borradores ya no avisan a nadie.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se avisa cuando alguien completa un checklist y cuando se revisa el reporte.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se cubrieron los 4 pasos del ciclo de documentos de empleado que no avisaban.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se avisa a la audiencia cuando se sube un documento o se crea una carpeta.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se avisa a quien gana acceso cuando le cambian los permisos.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Los avisos dicen el nombre de quién reporta, responde, manda o contesta.</p>
            <p class="why">Antes decía solo "nueva solicitud"; ahora dice de quién y de qué sucursal.</p>
            <p class="tech">Formato <code>Sucursal · Nombre · resto</code>, resolvedor en <code>shared/lib/actor-names.ts</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Los avisos de mantenimiento y de proveedores van solo a quien tiene esa sucursal.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Indicador del estado de las notificaciones del teléfono, en el portal de empresa y en el de empleados.</p>
            <p class="why">Ahora se ve de un vistazo si alguien las tiene activadas o no.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Los fallos reales de envío al teléfono quedan registrados, igual que los de correo.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Desde la app solo se pueden activar las notificaciones del teléfono, no desactivarlas.</p>
            <p class="why">El botón las apagaba sin querer y la persona dejaba de recibir avisos sin saberlo.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Los avisos nuevos pasan por el sistema de traducción en vez de estar escritos en inglés a mano.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Los avisos quedaron en tres canales, con el enlace correcto, y se quitaron los canales que no existen.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Panel de superadmin para ver quién tiene las notificaciones del teléfono activadas, con el historial de envíos y la opción de darlas de baja.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Ese panel muestra el nombre de cada administrador y dice "Superadmin" cuando no pertenece a ninguna empresa.</p>
            <p class="why">Antes aparecía un guion y no se sabía de quién era cada suscripción. Además, los errores de envío ahora se ven.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Nuevos avisos para el ciclo de proveedores, las reasignaciones de personal y el feedback.</p>
            <p class="why">Altas, cambios y bajas de proveedores avisan a quienes corresponde; una persona se entera si cambia su puesto o departamento; y el feedback nuevo llega a los superadmin.</p>
            <p class="tech">Cobertura de eventos operativos + enlaces por portal · commits <code>358fced2</code>, <code>976d75da</code> y <code>65a6ee0c</code></p>
          </div></li>
        </ul>
      </article>

      <article class="section p" id="p3">
        <h3>2.3 · Checklists</h3>
        <p class="sub">El módulo más usado del día a día. Se le dio memoria: cada reparto queda congelado tal como se
        entregó, y editar el checklist ya no reescribe el pasado.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Historial de repartos de cada checklist: se ve cuándo salió y a quién.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El historial dejó de reescribirse y de duplicar puntos.</p>
            <p class="why">Editar un checklist cambiaba también los repartos ya entregados, así que el pasado dejaba de reflejar lo que realmente se hizo.</p>
            <p class="tech"><code>20260730000001_checklist_frozen_history.sql</code>, <code>20260802000001</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Agregar o quitar puntos de un checklist en curso se aplica en el próximo reparto; corregir el texto de un punto se aplica ya.</p>
            <p class="why">Es la diferencia entre cambiar la tarea (espera al próximo turno) y arreglar una falta de ortografía (aplica ahora).</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se avisa qué cambios quedaron pendientes para el próximo reparto.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Eliminar un checklist con historial ahora lo elimina de verdad.</p>
            <p class="tech"><code>20260731000001_checklist_deletable_with_history.sql</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Borrar un checklist o un aviso ya no deja su reparto huérfano.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Los repartos se engancharon al horario del proceso automático para que no se salten días.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">La frecuencia que se muestra sale del reparto real, no de un campo aparte que podía quedar desactualizado.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Las fotos de evidencia se ven en los reportes.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">El aviso de "checklist completado" lleva directo al reporte, no a la lista general.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Quien crea un checklist puede revisar los reportes de todas sus sucursales.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Un empleado vuelve a ver sus propios checklists en borrador.</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">El portal de empleado tenía la mitad de las protecciones del portal de empresa; ahora los dos usan el mismo código.</p>
            <p class="tech">Refactor en 4 pasos + tests que fijan la paridad entre portales</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Enviar un checklist ahora es una operación atómica y su reporte conserva una copia exacta.</p>
            <p class="why">Se valida que estén todos los puntos una sola vez, se rechazan puntos ajenos y se guardan juntos respuestas, comentarios, alertas y evidencias. El reporte mantiene su estructura aunque después cambie la plantilla.</p>
            <p class="tech"><code>20260802000001_checklist_submission_integrity_and_history.sql</code> · commit <code>eac0767b</code></p>
          </div></li>
        </ul>
      </article>

      <article class="section p" id="p4">
        <h3>2.4 · Documentos y archivos</h3>
        <p class="sub">Subir, organizar, encontrar y compartir. Incluye el salto del límite de tamaño, que era la
        queja más repetida.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">El límite de subida pasó de 10 MB a <mark>25 MB</mark> en todos los módulos.</p>
            <p class="why">También se subió el tope real del almacenamiento, no solo el de la pantalla.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Los archivos grandes suben directo al almacenamiento, sin pasar por el servidor.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Barrido automático de archivos que quedaron a medio subir.</p>
            <p class="why">Ocupaban espacio y nadie los veía.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Se arregló un bloqueo en las reglas de acceso a carpetas que hacía fallar la pantalla.</p>
            <p class="tech">Recursión infinita en RLS de <code>document_folders</code> (<code>20260727000001</code>)</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Arrastrar y soltar en el portal de empleado ya no se cancela solo.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Búsqueda, selección múltiple y descarga en ZIP en el historial de documentos.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Crear carpeta o subir archivo desde el menú lateral lleva a Documentos y abre la ventana correcta.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Las carpetas vacías asignadas por ubicación se ven en la vista de empleado.</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Se limpia el contenido del correo al compartir un documento.</p>
            <p class="why">Se podía colar código en el mensaje. Ahora se sanitiza antes de enviar.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Dar de alta un empleado desde el portal ahora sí guarda los documentos de su expediente.</p>
            <p class="why">Se subían y se perdían: el alta desde el portal los ignoraba.</p>
          </div></li>
        </ul>
      </article>

      <article class="section p" id="p5">
        <h3>2.5 · Personal, puestos y departamentos</h3>
        <p class="sub">Gestión de la gente: quién puede administrarla, qué pasa al convertir un usuario en empleado
        y por qué antes fallaba sin decir el motivo.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Módulo de Recursos Humanos delegado: un empleado del portal puede gestionar a otros empleados.</p>
            <p class="why">Antes esto solo lo podía hacer un administrador de la empresa. Ahora se puede delegar en el encargado de cada sucursal.</p>
            <p class="tech">Portal <code>/portal/employees</code>, API <code>/api/employee/employees</code></p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Los botones de editar y eliminar, y el estado laboral, se ocultan si la persona no tiene ese permiso.</p>
            <p class="why">Se veían aunque no funcionaran, y eso confundía sobre qué podía hacer cada uno.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">El recorrido de bienvenida de empleados se ve bien en el teléfono.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Quien tiene Recursos Humanos delegado puede gestionar también usuarios que no son empleados.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Convertir un usuario en empleado ya no pide crear una contraseña nueva si esa persona ya tenía acceso.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Cuando no se puede guardar, la pantalla dice qué campo falta y cuál fue el error real.</p>
            <p class="why">Antes solo decía "error al guardar" y había que adivinar.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Borrar un puesto o un departamento fallaba siempre. Ya funciona.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Se evitan perfiles huérfanos al borrar un empleado.</p>
            <p class="tech">Limpieza de <code>organization_user_profiles</code> en el borrado</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">El directorio muestra los nombres reales de las sucursales.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">La ventana de empleado se cierra al guardar.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Los identificadores de empleados dejaron de usar términos locales de un solo país.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Un usuario que ya tenía acceso puede convertirse en empleado.</p>
            <p class="why">La conversión conserva su cuenta existente y funciona también desde Recursos Humanos delegado, sin obligarlo a crear otra contraseña.</p>
            <p class="tech">Conversión usuario → empleado · commits <code>2fb5581f</code> y <code>5d483abf</code></p>
          </div></li>
        </ul>
      </article>

      <article class="section p" id="p6">
        <h3>2.6 · Entrar a la plataforma</h3>
        <p class="sub">Se agregó el ingreso con Google, se separaron los dominios y se reforzó la verificación en dos
        pasos — manteniendo la marca del cliente en toda la pantalla de entrada.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Inicio de sesión con Google.</p>
            <p class="why">Se entra con la cuenta de Google sin salir del dominio del cliente y sin abrir ventanas emergentes: la tarjeta de Google aparece al llegar.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Cada empresa puede tener su propia configuración de Google, con su marca.</p>
            <p class="tech"><code>20260806000001_tenant_google_oauth_branding.sql</code>, <code>20260806000002</code></p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">La marca de la empresa se mantiene durante todo el recorrido de login.</p>
            <p class="why">A mitad del proceso aparecía la marca genérica y parecía otro sitio.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">El botón de Google entra completo en la pantalla del teléfono.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Verificación en dos pasos por correo para los administradores de empresa.</p>
            <p class="why">Obligatoria cuando la empresa tiene la integración activa, opcional en el resto.</p>
            <p class="tech"><code>20260714000001_company_mfa_challenges.sql</code></p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Los códigos de verificación llegan de forma confiable.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se separaron los dominios: getbackplate.com para el sitio público, app.getbackplate.com para la aplicación.</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">El paso de un dominio a otro durante el login quedó blindado.</p>
            <p class="why">Fue lo más delicado del cambio de dominios: mantener la sesión sin abrir un agujero.</p>
          </div></li>
        </ul>
      </article>

      <article class="section p" id="p7">
        <h3>2.7 · Soporte</h3>
        <p class="sub">El modal de comentarios se reemplazó por un canal de soporte de verdad, con bandeja interna.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Página <code>/support</code> con tipos de solicitud, en lugar del modal de comentarios.</p>
            <p class="tech">Migraciones <code>20260720000002</code> a <code>20260720000006</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Bandeja unificada de soporte en superadmin, con todo el flujo de atención.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se puede pedir soporte sin haber iniciado sesión; si ya entró, los datos vienen rellenados.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Al entrar a soporte desde cualquier pantalla, el botón de volver regresa a donde estaba.</p>
          </div></li>
        </ul>
      </article>

      <article class="section p" id="p8">
        <h3>2.8 · Idioma</h3>
        <p class="sub">Un solo español para todas las empresas, sin modismos de un país concreto.</p>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se normalizó el español mexicano según el plan, incluidos los textos ya guardados.</p>
            <p class="tech"><code>20260806000003_normalize_historical_notification_copy.sql</code></p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Los mensajes al usuario volvieron a estar en español donde correspondía.</p>
            <p class="why">Se habían colado en inglés al forzar el idioma del plan de integración.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Se completaron las traducciones al inglés que faltaban en Ajustes, la campanita y la integración.</p>
          </div></li>
        </ul>
      </article>

      <!-- ============ PARTE 3 ============ -->

      <section class="part-head" id="transversal">
        <p class="kicker">Parte 3 · 5 áreas</p>
        <h2>Transversal — seguridad, datos e infraestructura</h2>
        <p>Trabajo que no se ve en pantalla pero sostiene los dos planes: protección de datos, retención,
        consistencia bajo carga y pruebas automáticas.</p>
      </section>

      <article class="section t" id="t1" data-single-price="true">
        <h3>3.1 · Seguridad y acceso a datos</h3>
        <div class="section-price">
          <div class="section-price-copy">
            <strong>Seguridad y acceso a datos</strong>
          </div>
          <label class="bill-field">
            <span class="cur">US$</span>
            <input type="number" min="0" step="5" placeholder="0" id="securityAccessPrice" data-section-price data-price-key="t1-total" data-price-plan="t" aria-label="Importe de Seguridad y acceso a datos">
          </label>
        </div>
        <ul class="entries">
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Ninguna tabla nueva puede quedar sin protección de acceso.</p>
            <p class="why">Un mecanismo automático la activa al crearse, y quedó sincronizado entre el entorno de pruebas y el de producción.</p>
            <p class="tech">Event trigger <code>ensure_rls</code> versionado (<code>20260710000001</code>)</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Endurecimiento de las reglas de acceso y de las funciones privilegiadas.</p>
            <p class="tech">RRHH, contratos, contexto y transacciones — <code>20260726000003/5/7/8/9</code></p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Protección reforzada de la facturación con Stripe y del entorno de QuickBooks.</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Reglas de acceso para las sesiones en las que un superadmin entra como un cliente.</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Dependencias con vulnerabilidades conocidas actualizadas.</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Se desactivó la grabación de sesiones de Sentry.</p>
            <p class="why">Grababa la pantalla del usuario; innecesario y sensible.</p>
          </div></li>
        </ul>
      </article>

      <article class="section t" id="t2" data-single-price="true">
        <h3>3.2 · Retención y auditoría</h3>
        <div class="section-price">
          <div class="section-price-copy">
            <strong>Retención y auditoría</strong>
          </div>
          <label class="bill-field">
            <span class="cur">US$</span>
            <input type="number" min="0" step="5" placeholder="0" id="retentionAuditPrice" data-section-price data-price-key="t2-total" data-price-plan="t" aria-label="Importe de Retención y auditoría">
          </label>
        </div>
        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Los registros de auditoría se borran solos a los 12 meses.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Queda constancia de cada ejecución del borrado automático.</p>
            <p class="tech"><code>20260717000002_audit_log_retention_runs.sql</code></p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">La papelera de superadmin muestra el registro de borrados de todos los procesos de retención, no solo de uno.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Retención completa para datos operativos de QuickBooks y evidencia fiscal.</p>
            <p class="why">Webhooks, payloads, ejecuciones y detalles operativos se purgan automáticamente a los 12 meses, mientras la evidencia fiscal, de facturación y aceptación sigue una conservación separada.</p>
            <p class="tech"><code>20260719000001_intuit_retention_support_billing.sql</code> + <code>20260720000001_intuit_retention_hardening.sql</code></p>
          </div></li>
        </ul>
      </article>

      <article class="section t" id="t3">
        <h3>3.3 · Consistencia cuando pasan dos cosas a la vez</h3>
        <p class="sub">Errores que solo aparecen cuando dos personas o dos procesos actúan al mismo tiempo — los más
        difíciles de reproducir y los que dejan datos incoherentes.</p>
        <ul class="entries">
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Se cerraron las carreras en alcance, checklists y recurrencia.</p>
            <p class="tech">8 migraciones el 2 de agosto: <code>20260802000001</code> a <code>20260802000008</code></p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Cambiar la programación de un aviso es ahora una operación única e indivisible, con bloqueo.</p>
          </div></li>
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">Las modificaciones de proveedores se hacen en una sola transacción.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Estado "expirado" para las entregas de avisos que ya no aplican.</p>
          </div></li>
        </ul>
      </article>

      <article class="section t" id="t4">
        <h3>3.4 · Infraestructura y costo</h3>
        <ul class="entries">
          <li><span class="chip mejora">Mejora</span><div>
            <p class="what">El servidor se movió a la misma región que la base de datos (US East).</p>
            <p class="why">Estaban en regiones distintas y cada consulta cruzaba el país. Menos demora en todo.</p>
          </div></li>
          <li><span class="chip fix">Corrección</span><div>
            <p class="what">Se cortaron ciclos de recarga que disparaban el consumo.</p>
            <p class="why">La app se refrescaba en bucle y eso subía la factura sin dar nada a cambio.</p>
          </div></li>
        </ul>
      </article>

      <article class="section t" id="t5" data-single-price="true">
        <h3>3.5 · Pruebas automáticas y documentación</h3>
        <p class="sub">Las pruebas automáticas son comprobaciones que corren solas cada vez que se toca el código:
        si alguien rompe algo que antes funcionaba, avisan antes de que llegue a producción. Es el cambio más
        grande del período en números.</p>

        <div class="section-price">
          <div class="section-price-copy">
            <strong>Pruebas automáticas y documentación</strong>
          </div>
          <label class="bill-field">
            <span class="cur">US$</span>
            <input type="number" min="0" step="5" placeholder="0" id="testingDocsPrice" data-section-price data-price-key="t5-total" data-price-plan="t" aria-label="Importe de Pruebas automáticas y documentación">
          </label>
        </div>

        <div class="ba">
          <div class="ba-col">
            <p class="ba-when">Al 30 de junio de 2026</p>
            <p class="ba-n">213</p>
            <p class="ba-l">pruebas, en 15 archivos</p>
          </div>
          <div class="ba-arrow" aria-hidden="true">→</div>
          <div class="ba-col ba-now">
            <p class="ba-when">Al 6 de agosto de 2026</p>
            <p class="ba-n">1 059</p>
            <p class="ba-l">pruebas, en 127 archivos</p>
          </div>
          <div class="ba-col ba-delta">
            <p class="ba-when">Diferencia</p>
            <p class="ba-n">+846</p>
            <p class="ba-l">pruebas nuevas · ×5 la cobertura</p>
          </div>
        </div>
        <p class="ba-note">Ambas cifras son ejecuciones reales de la suite, no un conteo del código: <strong>1 059 de 1 059
        pasan</strong> hoy, y 213 de 213 pasaban al 30 de junio. Los 9 recorridos de prueba de punta a punta
        (Playwright) siguen siendo los mismos 9 y no se ejecutaron para este informe.</p>

        <ul class="entries">
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Se cubrieron con pruebas los módulos que no tenían ninguna.</p>
            <p class="why">Incluye el reparto programado de checklists, el envío masivo de avisos, dos reglas de notificación que ya se habían roto solas, el tope de subida de archivos y los documentos del expediente.</p>
          </div></li>
          <li><span class="chip nuevo">Nuevo</span><div>
            <p class="what">Pruebas que fijan la paridad entre el portal de empresa y el de empleados.</p>
            <p class="why">Impiden que uno de los dos vuelva a quedarse atrás en protecciones, que fue exactamente lo que había pasado con los checklists.</p>
          </div></li>
          <li><span class="chip doc">Docs</span><div>
            <p class="what">Documentación al día: índice de migraciones, changelog, informe final de la auditoría y el modelo de sucursales.</p>
          </div></li>
          <li><span class="chip seg">Seguridad</span><div>
            <p class="what">Entorno real de pruebas de aislamiento y despliegue seguro.</p>
            <p class="why">Las reglas RLS se comprueban contra PostgreSQL de desarrollo dentro de una transacción que siempre se revierte; las pruebas no pueden salir a la red y otra verificación detecta diferencias entre archivos de migración e historial aplicado.</p>
            <p class="tech">Runner RLS rollback-only + network guard + suite crítica + migration drift · commit <code>a0e3fd60</code></p>
          </div></li>
        </ul>
      </article>

      <!-- ============ CRONOLOGÍA ============ -->

      <section class="part-head" id="cronologia" style="color:var(--rule-2)">
        <p class="kicker" style="color:var(--ink-muted)">Anexo</p>
        <h2>Cronología semana a semana</h2>
        <p>La misma historia ordenada por fecha, para ubicar cuándo se hizo cada cosa.</p>
      </section>

      <div class="timeline-wrap">
        <table class="timeline">
          <thead>
            <tr>
              <th scope="col">Semana</th>
              <th scope="col">Foco principal</th>
              <th scope="col" style="text-align:right">Commits</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="wk">1 – 6 jul</td>
              <td>Módulo de RRHH delegado en el portal de empleados, panel de suscripciones push en superadmin, base de confiabilidad del envío QBO → R365 (reclamo atómico) y ajustes del formulario de referido.</td>
              <td class="n">13</td>
            </tr>
            <tr>
              <td class="wk">7 – 13 jul</td>
              <td>Reporte semanal al dueño, Trust Center público, formulario <code>/refer</code>, rediseño de la landing de integración y cifrado del identificador de QuickBooks.</td>
              <td class="n">21</td>
            </tr>
            <tr>
              <td class="wk">14 – 20 jul</td>
              <td>Verificación en dos pasos, separación de dominios, inglés en toda la integración, Sign in with Intuit, bandeja de leads, canal de soporte y retención automática de registros.</td>
              <td class="n">70</td>
            </tr>
            <tr>
              <td class="wk">21 – 27 jul</td>
              <td>Compra de conexiones R365, recibos con PDF, CRM de referidos, preferencias de reportes y el inicio de la auditoría de alcance y permisos delegados.</td>
              <td class="n">58</td>
            </tr>
            <tr>
              <td class="wk">28 jul – 3 ago</td>
              <td>La semana más intensa: login con Google, rediseño del selector de alcance, historial congelado de checklists, campanita garantizada, cierre de carreras y cobros de Stripe recuperables.</td>
              <td class="n">106</td>
            </tr>
            <tr>
              <td class="wk">4 – 6 ago</td>
              <td>Nombre del actor en los avisos, branding de Google por empresa, límite de 25 MB, español mexicano por plan y precios definitivos del MSA.</td>
              <td class="n">38</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="closing">
        <p><b>Alcance de este documento.</b> Cubre del 1 de julio de 2026 a las 00:00 hasta el 6 de agosto de 2026
        inclusive: <b>306 commits</b> en total, agrupados por área. Los puntos listados son los que cambian algo
        visible o relevante; los ajustes internos menores están resumidos dentro de su área.</p>
        <p><b>Fuente.</b> Historial del repositorio (306 commits, sin fusiones) y las 71 migraciones de base de
        datos aplicadas en el período. Las cifras semanales suman 13 + 21 + 70 + 58 + 106 + 38 = 306.</p>
        <p><b>Pruebas.</b> Las cifras de 213 y 1 059 son ejecuciones reales de la suite en la revisión del 30 de
        junio y en la del 6 de agosto respectivamente, no un conteo estático del código.</p>
      </div>

    </main>
  </div>
</div>
<div class="totbar">
  <div class="totbar-in">
    <div hidden aria-hidden="true"><span id="tPaid">0</span><span id="tDone">0</span></div>
    <div class="tot"><span class="tot-l">Entregas incluidas</span><span class="tot-n grand" id="vCharged">0</span></div>
    <div class="tot"><span class="tot-l">Nuevos</span><span class="tot-n pend" id="vNew">0</span></div>
    <div class="tot"><span class="tot-l">Mejoras</span><span class="tot-n" id="vImprovement" style="color:var(--transversal)">0</span></div>
    <div class="tot"><span class="tot-l">Correcciones</span><span class="tot-n" id="vFix">0</span></div>
    <div class="tot"><span class="tot-l">Seguridad</span><span class="tot-n" id="vSecurity" style="color:var(--alerta)">0</span></div>
    <div class="tot"><span class="tot-l">Legal / Docs</span><span class="tot-n" id="vDocs">0</span></div>
    <div class="spacer"></div>
    <div class="tot"><span class="tot-l">Total a cobrar</span><span class="tot-n grand" id="tTotal">US$ 0</span></div>
    <button type="button" id="btnDesglose" aria-expanded="false">Desglose</button>
    <button type="button" id="btnLimpiar">Limpiar</button>
  </div>
  <div class="breakdown" id="breakdown" hidden>
    <div class="breakdown-in" id="breakdownIn"></div>
  </div>
</div>

<script>
(function () {
  "use strict";

  /* ==================================================================
     CRITERIO: no es la fecha, es QUÉ COSA ES.
     Si el punto es un arreglo, una continuación o el remate de algo que
     ya fue facturado, va como COBRADO aunque se haya tocado en
     agosto. Si agrega una capacidad nueva que no estaba en ningún
     renglón tuyo, queda por cobrar.
     ================================================================== */

  var RENGLON = {
    A: "Notificaciones push + webapp + arreglos de móvil",
    B: "Integración QBO→R365: notificación push a superadmin",
    C: "Reemplazo de WhatsApp por Push (avisos, documentos, checklist)",
    D: "Campanita de notificaciones (push + operativas)",
    E: "Links de suscripción, Stripe y precio por factura",
    F: "Página legal y subpáginas (MSA, EULA)",
    G: "Página de referido y crons de reporte"
  };

  var COBRADO = {
    /* A — el sistema de push, la webapp y los arreglos de interfaz en móvil */
    "p2-12":"A","p2-13":"A","p2-14":"A","p2-17":"A","p2-18":"A","p5-3":"A",

    /* B — las alertas de integración que le llegan al superadmin */
    "i1-9":"B","i3-9":"B","i3-10":"B","i3-11":"B",

    /* C — sacar WhatsApp y dejar Push por defecto en avisos, documentos y checklists */
    "p2-6":"C","p2-7":"C","p2-8":"C","p2-16":"C",

    /* D — la campanita y los avisos operativos (mantenimiento) */
    "p2-1":"D","p2-2":"D","p2-3":"D","p2-4":"D","p2-5":"D","p2-10":"D","p2-11":"D",

    /* E — todo el circuito de suscripción, checkout y cobro */
    "i4-1":"E","i4-2":"E","i4-3":"E","i4-4":"E","i4-5":"E","i4-6":"E",
    "i4-7":"E","i4-8":"E","i4-9":"E","i4-10":"E","i4-11":"E",

    /* F — las páginas legales y el contrato */
    "i5-4":"F","i5-5":"F","i5-6":"F","i5-7":"F","i5-8":"F","i5-9":"F","i5-11":"F","i5-12":"F",

    /* G — la página de referido y los crons de reporte */
    "i6-1":"G","i6-2":"G","i6-5":"G","i6-6":"G",
    "i3-1":"G","i3-2":"G","i3-3":"G","i3-4":"G","i3-7":"G"
  };

  /* Fecha del cambio en que se basa cada punto. Es solo dato de contexto:
     NO decide si algo está cobrado o no. */
  var FECHAS = {
    "i1-1":"07-03","i1-2":"07-09","i1-3":"07-24","i1-4":"07-24","i1-5":"08-06","i1-6":"07-24",
    "i1-7":"07-24","i1-8":"07-30","i1-9":"07-25","i1-10":"07-14","i1-11":"07-14","i1-12":"07-20","i1-13":"07-09","i1-14":"07-24",
    "i2-1":"07-19","i2-2":"07-24","i2-3":"07-10","i2-4":"07-20","i2-5":"07-10","i2-6":"07-10",
    "i2-7":"07-09","i2-8":"07-20","i2-9":"07-28","i2-10":"07-28","i2-11":"08-05","i2-12":"07-26",
    "i3-1":"07-10","i3-2":"07-05","i3-3":"07-24","i3-4":"07-13","i3-5":"07-22","i3-6":"07-21",
    "i3-7":"07-20","i3-8":"08-03","i3-9":"07-09","i3-10":"07-30","i3-11":"07-30","i3-12":"07-24","i3-13":"07-24",
    "i4-1":"07-16","i4-2":"07-16","i4-3":"07-24","i4-4":"08-03","i4-5":"07-24","i4-6":"07-20",
    "i4-7":"07-14","i4-8":"07-24","i4-9":"07-24","i4-10":"07-09","i4-11":"07-24","i4-12":"07-20","i4-13":"07-26",
    "i5-1":"07-13","i5-2":"07-13","i5-3":"07-14","i5-4":"07-13","i5-5":"07-14","i5-6":"07-14",
    "i5-7":"08-05","i5-8":"07-24","i5-9":"07-24","i5-10":"07-13","i5-11":"07-03","i5-12":"07-15",
    "i6-1":"07-13","i6-2":"07-15","i6-3":"07-16","i6-4":"07-22","i6-5":"07-23","i6-6":"07-03",
    "i7-1":"07-14","i7-2":"07-22","i7-3":"07-25","i7-4":"07-14","i7-5":"07-24",
    "p1-1":"07-25","p1-2":"07-25","p1-3":"07-26","p1-4":"07-29","p1-5":"07-29","p1-6":"07-29",
    "p1-7":"07-30","p1-8":"07-26","p1-9":"08-05","p1-10":"07-29","p1-11":"07-29","p1-12":"07-31","p1-13":"07-29","p1-14":"08-03",
    "p2-1":"08-02","p2-2":"08-02","p2-3":"08-02","p2-4":"07-30","p2-5":"08-05","p2-6":"07-30",
    "p2-7":"08-02","p2-8":"07-29","p2-9":"07-30","p2-10":"08-05","p2-11":"08-02","p2-12":"07-31",
    "p2-13":"08-01","p2-14":"08-01","p2-15":"08-02","p2-16":"08-03","p2-17":"07-01","p2-18":"07-01","p2-19":"08-02",
    "p3-1":"08-03","p3-2":"07-30","p3-3":"07-30","p3-4":"07-30","p3-5":"07-30","p3-6":"07-30",
    "p3-7":"08-04","p3-8":"08-01","p3-9":"08-05","p3-10":"08-04","p3-11":"07-30","p3-12":"07-30","p3-13":"07-30","p3-14":"08-03",
    "p4-1":"08-06","p4-2":"08-06","p4-3":"08-06","p4-4":"07-28","p4-5":"07-29","p4-6":"07-24",
    "p4-7":"07-28","p4-8":"07-25","p4-9":"07-25","p4-10":"08-06",
    "p5-1":"07-01","p5-2":"07-01","p5-3":"07-01","p5-4":"07-16","p5-5":"07-16","p5-6":"07-16",
    "p5-7":"08-01","p5-8":"07-25","p5-9":"07-16","p5-10":"07-15","p5-11":"08-06","p5-12":"07-15",
    "p6-1":"07-28","p6-2":"08-06","p6-3":"08-05","p6-4":"08-05","p6-5":"07-14","p6-6":"07-15",
    "p6-7":"07-14","p6-8":"08-03",
    "p7-1":"07-24","p7-2":"07-20","p7-3":"07-20","p7-4":"07-28",
    "p8-1":"08-06","p8-2":"07-30","p8-3":"07-30",
    "t1-1":"07-13","t1-2":"07-26","t1-3":"07-26","t1-4":"07-09","t1-5":"07-16","t1-6":"07-09",
    "t2-1":"07-14","t2-2":"07-17","t2-3":"07-24","t2-4":"07-20",
    "t3-1":"08-03","t3-2":"08-02","t3-3":"08-02","t3-4":"08-02",
    "t4-1":"07-16","t4-2":"08-05",
    "t5-1":"08-02","t5-2":"07-30","t5-3":"08-03","t5-4":"07-26"
  };

  var MES = { "07": "jul", "08": "ago" };
  var PLANES = { i: "Integración", p: "Plataforma", t: "Transversal" };
  var CLAVE = "gbp-borrador-precios-v4";
  var CLAVE_ESTADO = "gbp-borrador-estados-v4";
  var fmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } }
  function escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var precios = {"i1-12":"30","i1-13":"30","i2-1":"50","i2-3":"30","i2-6":"20","i2-7":"30","i2-8":"70","i2-11":"20","i5-3":"20","i6-4":"70","p1-7":"70","p1-10":"30","p1-11":"30","p2-9":"30","p3-1":"20","p3-3":"20","p4-2":"20","p4-3":"10","p4-6":"30","p5-1":"30","p6-1":"150","p6-2":"30","p6-5":"70","p6-8":"30","p6-7":"20","i8-total":"250","i3-5":"70","i5-1":"30","t2-total":"120","t5-total":"120","t1-total":"50"};
  var estados = {};
  var items = [];
  function migrarPrecioDeSeccion(sectionId, itemCount) {
    var totalKey = sectionId + "-total";
    if (precios[totalKey] != null) return;
    var precioAnteriorTotal = 0;
    for (var idx = 1; idx <= itemCount; idx++) {
      var itemKey = sectionId + "-" + idx;
      var precioAnterior = parseFloat(precios[itemKey]);
      if (!isNaN(precioAnterior) && precioAnterior > 0) precioAnteriorTotal += precioAnterior;
      delete precios[itemKey];
    }
    if (precioAnteriorTotal > 0) precios[totalKey] = String(precioAnteriorTotal);
  }
  migrarPrecioDeSeccion("t1", 6);
  migrarPrecioDeSeccion("t2", 4);
  migrarPrecioDeSeccion("t5", 4);
  var sectionPriceInputs = Array.prototype.slice.call(document.querySelectorAll("[data-section-price]"));
  sectionPriceInputs.forEach(function (input) {
    var key = input.getAttribute("data-price-key");
    if (key && precios[key] != null) input.value = precios[key];
    input.addEventListener("input", recalcular);
  });

  Array.prototype.forEach.call(document.querySelectorAll("article.section"), function (art) {
    var plan = art.classList.contains("i") ? "i" : art.classList.contains("p") ? "p" : "t";
    art.setAttribute("data-plan", plan);

    var h3 = art.querySelector("h3");
    if (h3 && !h3.parentNode.classList.contains("sec-head")) {
      var cab = document.createElement("div");
      cab.className = "sec-head";
      h3.parentNode.insertBefore(cab, h3);
      cab.appendChild(h3);
      var st = document.createElement("span");
      st.className = "sec-total";
      st.setAttribute("data-sec", art.id);
      cab.appendChild(st);
    }

    Array.prototype.forEach.call(art.querySelectorAll("ul.entries > li"), function (li, idx) {
      var clave = art.id + "-" + (idx + 1);
      var cuerpo = li.querySelector("div") || li;
      var caja = document.createElement("div");
      caja.className = "bill";
      cuerpo.appendChild(caja);
      if (art.getAttribute("data-single-price") === "true") {
        var soloFecha = document.createElement("span");
        soloFecha.className = "date-tag";
        soloFecha.textContent = fechaLinda(FECHAS[clave] || null);
        soloFecha.title = "Fecha del cambio. Es solo referencia; la sección tiene un único precio general.";
        caja.appendChild(soloFecha);
        return;
      }
      var it = { clave: clave, plan: plan, caja: caja, fecha: FECHAS[clave] || null };
      items.push(it);
      pintar(it);
    });
  });

  function renglonDe(c) {
    if (estados[c] === "pendiente") return null;
    if (estados[c]) return estados[c];      /* override manual: guarda la letra */
    return COBRADO[c] || null;
  }

  function fechaLinda(f) {
    if (!f) return "";
    var p = f.split("-");
    return parseInt(p[1], 10) + " " + (MES[p[0]] || p[0]);
  }

  function pintar(it) {
    it.caja.innerHTML = "";

    var f = document.createElement("span");
    f.className = "date-tag";
    f.textContent = fechaLinda(it.fecha);
    f.title = "Fecha del cambio. Es solo referencia, no define si está cobrado.";
    it.caja.appendChild(f);

    var r = renglonDe(it.clave);

    if (r) {
      var pill = document.createElement("button");
      pill.type = "button";
      pill.className = "pill pill-paid clickable";
      pill.textContent = "Facturado anteriormente";
      pill.title = "Entra en: " + (RENGLON[r] || r) + "\nClic para pasarlo a por cobrar.";
      pill.addEventListener("click", function () {
        estados[it.clave] = "pendiente";
        escribir(CLAVE_ESTADO, estados);
        pintar(it); recalcular();
      });
      it.caja.appendChild(pill);

      var lbl = document.createElement("span");
      lbl.className = "renglon";
      lbl.textContent = RENGLON[r] || r;
      it.caja.appendChild(lbl);

      it.input = null;
      return;
    }

    var lab = document.createElement("label");
    lab.className = "bill-field";
    var cur = document.createElement("span");
    cur.className = "cur"; cur.textContent = "US$";
    lab.appendChild(cur);

    var input = document.createElement("input");
    input.type = "number"; input.min = "0"; input.step = "5"; input.placeholder = "0";
    input.setAttribute("aria-label", "Precio a cobrar por este punto");
    if (precios[it.clave] != null) input.value = precios[it.clave];
    input.addEventListener("input", recalcular);
    lab.appendChild(input);

    var ok = document.createElement("button");
    ok.type = "button"; ok.className = "undo"; ok.textContent = "✓";
    ok.title = "Marcarlo como ya cobrado";
    ok.addEventListener("click", function () {
      estados[it.clave] = COBRADO[it.clave] || "X";
      escribir(CLAVE_ESTADO, estados);
      delete precios[it.clave]; escribir(CLAVE, precios);
      pintar(it); recalcular();
    });
    lab.appendChild(ok);

    it.caja.appendChild(lab);
    it.input = input;
  }

  var elTotal = document.getElementById("tTotal");
  var elPaid = document.getElementById("tPaid");
  var elDone = document.getElementById("tDone");
  var elBreak = document.getElementById("breakdownIn");

  function recalcular() {
    var total = 0, conPrecio = 0, pend = 0, cob = 0;
    var porPlan = { i: 0, p: 0, t: 0 }, porSec = {};

    items.forEach(function (it) {
      var sec = it.clave.replace(/-\d+$/, "");
      if (porSec[sec] === undefined) porSec[sec] = 0;
      if (!it.input) { cob++; return; }
      pend++;

      var v = parseFloat(it.input.value);
      var ok = !isNaN(v) && v > 0;
      it.input.parentNode.classList.toggle("filled", ok);
      if (it.input.value === "") delete precios[it.clave]; else precios[it.clave] = it.input.value;
      if (!ok) return;

      total += v; conPrecio++;
      porPlan[it.plan] += v; porSec[sec] += v;
    });

    sectionPriceInputs.forEach(function (sectionInput) {
      pend++;
      var key = sectionInput.getAttribute("data-price-key");
      var plan = sectionInput.getAttribute("data-price-plan");
      var sectionValue = parseFloat(sectionInput.value);
      var sectionOk = !isNaN(sectionValue) && sectionValue > 0;
      sectionInput.parentNode.classList.toggle("filled", sectionOk);
      if (sectionInput.value === "") delete precios[key];
      else precios[key] = sectionInput.value;
      if (sectionOk) {
        total += sectionValue;
        conPrecio++;
        porPlan[plan] += sectionValue;
        porSec[key.replace(/-total$/, "")] = sectionValue;
      }
    });

    elTotal.textContent = "US$ " + fmt.format(total);
    elPaid.textContent = cob + " de " + (items.length + sectionPriceInputs.length);
    elDone.textContent = conPrecio + " de " + pend;

    Array.prototype.forEach.call(document.querySelectorAll(".sec-total"), function (el) {
      var v = porSec[el.getAttribute("data-sec")] || 0;
      el.innerHTML = v > 0 ? "subtotal <b>US$ " + fmt.format(v) + "</b>" : "";
    });

    elBreak.innerHTML = "";
    Object.keys(PLANES).forEach(function (k) {
      var fila = document.createElement("div"); fila.className = "bd-row";
      var a = document.createElement("span"); a.textContent = PLANES[k];
      var b = document.createElement("span"); b.textContent = "US$ " + fmt.format(porPlan[k]);
      fila.appendChild(a); fila.appendChild(b); elBreak.appendChild(fila);
    });

    escribir(CLAVE, precios);
  }

  var btnD = document.getElementById("btnDesglose");
  var panel = document.getElementById("breakdown");
  btnD.addEventListener("click", function () {
    var abrir = panel.hasAttribute("hidden");
    if (abrir) panel.removeAttribute("hidden"); else panel.setAttribute("hidden", "");
    btnD.setAttribute("aria-expanded", String(abrir));
  });

  document.getElementById("btnLimpiar").addEventListener("click", function () {
    if (!confirm("¿Borrar todos los precios y volver las marcas de cobrado al estado original?")) return;
    precios = {}; estados = {};
    escribir(CLAVE, precios); escribir(CLAVE_ESTADO, estados);
    sectionPriceInputs.forEach(function (input) { input.value = ""; });
    items.forEach(pintar); recalcular();
  });

  recalcular();
})();
</script>
<script>
(function () {
  "use strict";
  var ids = { total: "vCharged", nuevo: "vNew", mejora: "vImprovement", fix: "vFix", seg: "vSecurity", doc: "vDocs" };
  function tipo(li) {
    var chip = li.querySelector(":scope > .chip");
    if (!chip) return "nuevo";
    if (chip.classList.contains("mejora")) return "mejora";
    if (chip.classList.contains("fix")) return "fix";
    if (chip.classList.contains("seg")) return "seg";
    if (chip.classList.contains("doc")) return "doc";
    return "nuevo";
  }
  function tienePrecio(input) {
    var value = parseFloat(input && input.value);
    return !isNaN(value) && value > 0;
  }
  function contar() {
    var counts = { total: 0, nuevo: 0, mejora: 0, fix: 0, seg: 0, doc: 0 };
    function incluir(li) { var key = tipo(li); counts[key] += 1; counts.total += 1; }
    document.querySelectorAll("article.section:not([data-single-price]) ul.entries > li").forEach(function (li) {
      if (tienePrecio(li.querySelector(".bill-field input"))) incluir(li);
    });
    document.querySelectorAll("[data-section-price]").forEach(function (input) {
      if (!tienePrecio(input)) return;
      var section = input.closest(".section");
      if (section) section.querySelectorAll("ul.entries > li").forEach(incluir);
    });
    Object.keys(ids).forEach(function (key) { var node = document.getElementById(ids[key]); if (node) node.textContent = counts[key]; });
  }
  document.addEventListener("input", function () { setTimeout(contar, 0); });
  contar();
})();
</script>
</body>
</html>
$development_report_20260807000008$,
    content_sha256 = '630e1d5add514c0b880e4bea45e3e57b26f00b4a33e5e569e14913316303b3af',
    snapshot = jsonb_set(snapshot, '{contentSha256}', to_jsonb('630e1d5add514c0b880e4bea45e3e57b26f00b4a33e5e569e14913316303b3af'::text), true),
    updated_at = now()
WHERE id = '20260807-0000-4000-8000-260807000004';
ALTER TABLE public.development_ledger_reports ENABLE TRIGGER trg_prevent_development_report_mutation;

NOTIFY pgrst, 'reload schema';
