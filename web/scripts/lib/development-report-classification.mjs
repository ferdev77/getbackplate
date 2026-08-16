export const IMPROVEMENT_KEYS = [
  "i1-10", "i3-11", "i3-13", "i4-4", "i4-6", "i4-7", "i4-8", "i4-9", "i5-12", "i6-6", "i7-5",
  "p1-9", "p2-14", "p2-15", "p2-18", "p3-10", "p5-2", "p5-3", "p5-5", "p5-6", "p5-10", "p5-11",
  "p6-3", "p6-4", "p6-6", "p7-4", "p8-3", "t3-1", "t3-2", "t3-3", "t4-1",
];

export function applyDevelopmentReportImprovements(source) {
  let html = source;
  let changed = 0;
  const indexesBySection = new Map();
  for (const key of IMPROVEMENT_KEYS) {
    const separator = key.lastIndexOf("-");
    const section = key.slice(0, separator);
    const index = Number(key.slice(separator + 1));
    const indexes = indexesBySection.get(section) ?? new Set();
    indexes.add(index);
    indexesBySection.set(section, indexes);
  }

  for (const [section, indexes] of indexesBySection) {
    const sectionPattern = new RegExp(`(<article class="section [ipt]" id="${section}"[^>]*>)([\\s\\S]*?)(</article>)`);
    const match = html.match(sectionPattern);
    if (!match) throw new Error(`Unable to find report section ${section}`);
    let itemIndex = 0;
    const body = match[2].replace(/<li><span class="chip ([^"]+)">([^<]+)<\/span><div>[\s\S]*?<\/div><\/li>/g, (item, badgeClass, label) => {
      itemIndex += 1;
      if (!indexes.has(itemIndex)) return item;
      if (badgeClass !== "fix" || label !== "Corrección") throw new Error(`Expected correction badge at ${section}-${itemIndex}`);
      changed += 1;
      return item.replace('<span class="chip fix">Corrección</span>', '<span class="chip mejora">Mejora</span>');
    });
    html = html.replace(sectionPattern, () => `${match[1]}${body}${match[3]}`);
  }

  if (changed !== IMPROVEMENT_KEYS.length) throw new Error(`Expected ${IMPROVEMENT_KEYS.length} improvements, changed ${changed}`);
  if (!html.includes(".chip.mejora")) {
    html = html.replace(
      ".chip.fix   { background: var(--panel-alt); color: var(--ink-2); border: 1px solid var(--rule-2); }",
      ".chip.fix   { background: var(--panel-alt); color: var(--ink-2); border: 1px solid var(--rule-2); }\n  .chip.mejora { background: var(--transversal-soft); color: var(--transversal); border: 1px solid transparent; }",
    );
  }
  if (!html.includes('<span class="chip mejora">Mejora</span>')) throw new Error("Improvement badges were not rendered");
  const legendNeedle = '<span class="chip fix">Corrección</span> algo que estaba mal y se arregló &nbsp;·&nbsp;';
  if (html.includes(legendNeedle)) {
    html = html.replace(legendNeedle, `${legendNeedle}\n      <span class="chip mejora">Mejora</span> algo existente que ahora funciona mejor &nbsp;·&nbsp;`);
  }
  return html;
}

export function applyDevelopmentReportValueSummary(source) {
  if (source.includes('id="vCharged"')) return source;
  const oldCounters = `    <div class="tot"><span class="tot-l">Ítems facturados anteriormente</span><span class="tot-n paid" id="tPaid">0</span></div>
    <div class="tot"><span class="tot-l">Con precio puesto</span><span class="tot-n" id="tDone">0 de 0</span></div>`;
  const newCounters = `    <div hidden aria-hidden="true"><span id="tPaid">0</span><span id="tDone">0</span></div>
    <div class="tot"><span class="tot-l">Entregas incluidas</span><span class="tot-n grand" id="vCharged">0</span></div>
    <div class="tot"><span class="tot-l">Nuevos</span><span class="tot-n pend" id="vNew">0</span></div>
    <div class="tot"><span class="tot-l">Mejoras</span><span class="tot-n" id="vImprovement" style="color:var(--transversal)">0</span></div>
    <div class="tot"><span class="tot-l">Correcciones</span><span class="tot-n" id="vFix">0</span></div>
    <div class="tot"><span class="tot-l">Seguridad</span><span class="tot-n" id="vSecurity" style="color:var(--alerta)">0</span></div>
    <div class="tot"><span class="tot-l">Legal / Docs</span><span class="tot-n" id="vDocs">0</span></div>`;
  if (!source.includes(oldCounters)) throw new Error("Unable to find the legacy billing counters");
  let html = source.replace(oldCounters, newCounters);
  const counterScript = `<script>
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
</script>`;
  html = html.includes("</body>") ? html.replace("</body>", `${counterScript}\n</body>`) : `${html}${counterScript}`;
  return html;
}

export function summarizeDevelopmentReportPrices(html) {
  const pricesMatch = html.match(/var precios = (\{[^\n]*\});/);
  if (!pricesMatch) throw new Error("Unable to find embedded report prices");
  const prices = JSON.parse(pricesMatch[1]);
  const sections = new Map();
  const sectionPattern = /<(article|section) class="section [ipt]" id="([ipt]\d+)"[^>]*>([\s\S]*?)<\/\1>/g;
  let sectionMatch;
  while ((sectionMatch = sectionPattern.exec(html))) {
    const badges = [];
    for (const badge of sectionMatch[3].matchAll(/<li><span class="chip ([^"]+)">([^<]+)<\/span>/g)) {
      badges.push(badge[1]);
    }
    sections.set(sectionMatch[2], badges);
  }
  const counts = { total: 0, nuevo: 0, mejora: 0, fix: 0, seg: 0, doc: 0 };
  function include(badgeClass) {
    const type = badgeClass === "mejora" ? "mejora" : badgeClass === "fix" ? "fix" : badgeClass === "seg" ? "seg" : badgeClass === "doc" ? "doc" : "nuevo";
    counts[type] += 1;
    counts.total += 1;
  }
  for (const [key, rawValue] of Object.entries(prices)) {
    if (!(Number(rawValue) > 0)) continue;
    const separator = key.lastIndexOf("-");
    const section = key.slice(0, separator);
    const item = key.slice(separator + 1);
    const badges = sections.get(section);
    if (!badges) throw new Error(`Unable to summarize unknown section ${section}`);
    if (item === "total") badges.forEach(include);
    else {
      const badge = badges[Number(item) - 1];
      if (!badge) throw new Error(`Unable to summarize unknown item ${key}`);
      include(badge);
    }
  }
  return counts;
}
