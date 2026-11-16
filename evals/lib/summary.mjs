// Pass rates per case and grader across runs, and the Markdown summary (spec 8.3).

export function summarise(results, { threshold, stoppedByCost = false, maxCost = null }) {
  const cases = {};
  for (const r of results) {
    const c = (cases[r.case] ??= { runs: 0, cost: 0, minutes: 0, stops: {}, graders: {} });
    c.runs += 1;
    c.cost += r.cost;
    c.minutes += r.minutes;
    c.stops[r.stop] = (c.stops[r.stop] ?? 0) + 1;
    for (const [name, g] of Object.entries(r.grades)) {
      const s = (c.graders[name] ??= { pass: 0, total: 0, failures: [] });
      s.total += 1;
      if (g.pass) s.pass += 1;
      else s.failures.push({ run: r.run, detail: g.detail });
    }
  }
  const below = [];
  for (const [name, c] of Object.entries(cases)) {
    for (const [g, s] of Object.entries(c.graders)) {
      s.rate = s.total ? s.pass / s.total : 0;
      if (s.rate < threshold) below.push(`${name} / ${g}`);
    }
  }
  const cost = results.reduce((a, r) => a + r.cost, 0);
  return { threshold, cost, stoppedByCost, maxCost, ok: !below.length && results.length > 0, below, cases };
}

const pct = (x) => `${Math.round(x * 100)}%`;

export function toMarkdown(s) {
  const lines = ['# KeelWright eval results', ''];
  lines.push(`Threshold ${pct(s.threshold)} per grader · total cost $${s.cost.toFixed(2)}${s.stoppedByCost ? ` · **stopped early at the $${s.maxCost} cost limit**` : ''}`);
  lines.push('', s.ok ? '**Result: pass**' : `**Result: below threshold** — ${s.below.join(', ') || 'no runs'}`, '');
  for (const [name, c] of Object.entries(s.cases)) {
    lines.push(`## ${name}`, '', `${c.runs} runs · $${c.cost.toFixed(2)} · ${Math.round(c.minutes)} min · ${Object.entries(c.stops).map(([k, v]) => `${k} ×${v}`).join(', ')}`, '');
    lines.push('| Grader | Pass rate | Failures |', '|---|---|---|');
    for (const [g, st] of Object.entries(c.graders)) {
      const f = st.failures.map((x) => `run ${x.run}: ${String(x.detail).replace(/\n/g, ' ').replace(/\|/g, '\\|').slice(0, 160)}`).join('<br>');
      lines.push(`| ${g} | ${pct(st.rate)} (${st.pass}/${st.total}) | ${f || '—'} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
