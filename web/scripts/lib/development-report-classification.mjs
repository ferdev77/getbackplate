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
