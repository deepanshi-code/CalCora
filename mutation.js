// Sensitivity check for the validation harness itself.
//
// "100% pass" only means something if the harness can fail. This script plants one known bug at a
// time into a scratch copy of the source, reruns the generator + Python reference, and records
// whether the bug was detected (any category below 100%). It never touches the real source files.
//
//   node validation/mutation.js        -> writes validation/MUTATION.md
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

const MUTANTS = [
  { id: 'M1', file: 'calculator.js', what: '^ evaluated left-to-right (2^3^2 = 64 instead of 512)',
    from: 'const exponent = this.parseUnary(); // right-associative, allows 2^-1\n      return Math.pow(base, exponent);',
    to: "let v = Math.pow(base, this.parsePostfix());\n      while (this.isSymbol(this.peek(), '^')) { this.next(); v = Math.pow(v, this.parsePostfix()); }\n      return v;" },
  { id: 'M2', file: 'calculator.js', what: 'trig rounded to 12 decimals (the earlier, flawed approach)',
    from: 'const clean = (v, argRad) => (Math.abs(v) < 2.3e-16 * Math.abs(argRad) ? 0 : v);',
    to: 'const clean = (v, argRad) => Math.round(v * 1e12) / 1e12;' },
  { id: 'M3', file: 'calculator.js', what: 'radians-to-degrees uses pi = 3.14159',
    from: 'const fromRad = (v) => (this.isDegreeMode ? v * 180 / Math.PI : v);',
    to: 'const fromRad = (v) => (this.isDegreeMode ? v * 180 / 3.14159 : v);' },
  { id: 'M4', file: 'calculator.js', what: 'unary minus no longer covers a following power (-2^2 fails to parse)',
    from: 'const val = this.parseUnary();', to: 'const val = this.parsePostfix();' },
  { id: 'M5', file: 'calculus.js', what: 'chain rule dropped for function calls',
    from: 'return this.mul(outer, du);', to: 'return outer;' },
  { id: 'M6', file: 'calculus.js', what: 'product rule uses minus instead of plus',
    from: 'return this.add(this.mul(this.diff(n.a, steps), n.b), this.mul(n.a, this.diff(n.b, steps)));',
    to: 'return this.sub(this.mul(this.diff(n.a, steps), n.b), this.mul(n.a, this.diff(n.b, steps)));' },
  { id: 'M7', file: 'integration.js', what: 'integral of f(ax+b) forgets to divide by a',
    from: 'const byA = (F) => this.div(F, this.num(a));', to: 'const byA = (F) => F;' },
  { id: 'M8', file: 'calculus.js', what: "Simpson's weights swapped (2/4 instead of 4/2)",
    from: '(i % 2 === 0 ? 2 : 4)', to: '(i % 2 === 0 ? 4 : 2)' },
  { id: 'M9', file: 'calculus.js', what: 'printed numbers rounded to 6 significant digits',
    from: 'parseFloat(n.toPrecision(12))', to: 'parseFloat(n.toPrecision(6))' },
  { id: 'M10', file: 'calculator.js', what: 'tan(90 deg) no longer reported as undefined',
    from: 'if (this.isDegreeMode && Math.abs(arg % 180) === 90) throw new Error("tan undefined");', to: '' },

  // --- integration.js: one planted bug per method ---
  { id: 'M11', file: 'integration.js', what: 'by parts: uv + ∫v du instead of uv − ∫v du',
    from: 'return this.sub(this.mul(u, V), rest);', to: 'return this.add(this.mul(u, V), rest);' },
  { id: 'M12', file: 'integration.js', what: 'u-substitution forgets to divide by du/dx',
    from: 'const h = this.simplify(this.div(n, dg));', to: 'const h = this.simplify(n);' },
  { id: 'M13', file: 'integration.js', what: 'repeated quadratic factor: reduction formula uses 1/√Δ instead of 2/√Δ',
    from: 'return this.mul(this.num(2 / Math.sqrt(delta)), this.fn(\'atan\'', to: 'return this.mul(this.num(1 / Math.sqrt(delta)), this.fn(\'atan\'' },
  { id: 'M14', file: 'integration.js', what: 'sin reduction formula: (n−1)/n replaced by 1/n',
    from: "k = (e - 1) / e;\n        } else if (b.name === 'cos')", to: "k = 1 / e;\n        } else if (b.name === 'cos')" },
  { id: 'M15', file: 'integration.js', what: 'e^p·sin q formula: a·sin q + b·cos q (sign error)',
    from: "inner = this.sub(this.mul(this.num(a), this.fn('sin', q)), this.mul(this.num(b), this.fn('cos', q)));",
    to: "inner = this.add(this.mul(this.num(a), this.fn('sin', q)), this.mul(this.num(b), this.fn('cos', q)));" },
  { id: 'M16', file: 'integration.js', what: 'root substitution: Jacobian k·u^(k−1) loses its k',
    from: 'this.mul(mapped, this.mul(this.num(k), this.pow(U, this.num(k - 1))))', to: 'this.mul(mapped, this.pow(U, this.num(k - 1)))' },
  { id: 'M17', file: 'integration.js', what: 'polynomial division quotient ignores the leading coefficient of the divisor',
    from: 'const c = r[i] / D[dd];', to: 'const c = r[i];' },
  { id: 'M18', file: 'integration.js', what: 'odd sin power: (1 − cos²) written as (1 + cos²)',
    from: 'this.pow(this.sub(this.num(1), this.pow(cosU, this.num(2))), this.num((sinA.e - 1) / 2))',
    to: 'this.pow(this.add(this.num(1), this.pow(cosU, this.num(2))), this.num((sinA.e - 1) / 2))' },

  // --- defense in depth: the same wrong rule with the self-check ON (M19) and OFF (M20) ---
  { id: 'M19', file: 'integration.js', what: 'WRONG by-parts rule, self-check left ON (should degrade to "no closed form", never a wrong answer)',
    from: 'return this.sub(this.mul(u, V), rest);', to: 'return this.add(this.mul(u, V), rest);' },
  { id: 'M20', file: 'integration.js', what: 'same wrong rule AND self-check disabled (wrong answers leak; independent reference must catch them)',
    edits: [
      { from: 'return this.sub(this.mul(u, V), rest);', to: 'return this.add(this.mul(u, V), rest);' },
      { from: 'if (!checked) {', to: 'if (false) {' },
    ] },
];

function run(env, extra = []) {
  return execFileSync('python', [path.join(__dirname, 'reference.py'), ...extra], { env: { ...process.env, ...env }, encoding: 'utf8' });
}

const SIZES = ['20260504', '1500', '300', '500'];

function measure(dir) {
  const env = { QL_SRC: dir, QL_CASES: path.join(dir, 'cases.json'), QL_REPORT: path.join(dir, 'report.md') };
  execFileSync('node', [path.join(__dirname, 'generate.js'), ...SIZES], { env: { ...process.env, ...env }, encoding: 'utf8' });
  const out = run(env);
  return Object.fromEntries(out.split('\n').filter((l) => /%/.test(l)).map((l) => { const [k, v] = l.trim().split(/\s+/); return [k, parseFloat(v)]; }));
}

const rows = [];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-mutants-'));

// Baseline = unmutated source at the same sample size. A mutant is only "detected" if some
// category scores LOWER than the baseline, so a pre-existing failure cannot masquerade as a catch.
const baseDir = path.join(scratch, 'baseline');
fs.mkdirSync(baseDir);
for (const f of ['calculator.js', 'calculus.js', 'integration.js', 'formula-solver.js', 'units.js', 'formula-data.js', 'formulas.js']) fs.writeFileSync(path.join(baseDir, f), read(f));
const baseline = measure(baseDir);
console.log('baseline:', JSON.stringify(baseline));

for (const m of MUTANTS) {
  const dir = path.join(scratch, m.id);
  fs.mkdirSync(dir);
  for (const f of ['calculator.js', 'calculus.js', 'integration.js', 'formula-solver.js', 'units.js', 'formula-data.js', 'formulas.js']) fs.writeFileSync(path.join(dir, f), read(f));
  let src = read(m.file);
  const edits = m.edits || [{ from: m.from, to: m.to }];
  if (!edits.every((e) => src.includes(e.from))) { rows.push({ ...m, status: 'SKIPPED (pattern not found)', detail: '' }); continue; }
  for (const e of edits) src = src.replace(e.from, e.to);
  fs.writeFileSync(path.join(dir, m.file), src);
  try {
    const rates = measure(dir);
    const worse = Object.entries(rates).filter(([k, v]) => v < baseline[k]).map(([k, v]) => `${k} ${baseline[k].toFixed(1)}% -> ${v.toFixed(1)}%`);
    rows.push({ ...m, status: worse.length ? 'DETECTED' : 'MISSED', detail: worse.join(', ') || 'no category dropped below baseline' });
  } catch (e) {
    // A mutant that breaks the code outright (exceptions while generating) is also "detected".
    rows.push({ ...m, status: 'DETECTED', detail: 'harness crashed: ' + String(e.message).split('\n')[0].slice(0, 80) });
  }
}

const detected = rows.filter((r) => r.status === 'DETECTED').length;
const evaluated = rows.filter((r) => !r.status.startsWith('SKIPPED')).length;
const lines = [
  '# Harness sensitivity (mutation check)', '',
  'One known bug is planted at a time into a scratch copy of the source; the generator and Python reference are rerun.',
  'A mutant counts as **detected** when any category scores lower than the unmutated baseline at the same sample size',
  `(baseline: ${Object.entries(baseline).map(([k, v]) => `${k} ${v.toFixed(1)}%`).join(', ')}). Run with \`npm run mutation\`.`, '',
  `**Detected ${detected} of ${evaluated} planted bugs.**`, '',
  '| ID | Planted bug | Result | Where it showed up |', '|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.what} | ${r.status} | ${r.detail} |`), '',
  'Mutants that were not detected point at blind spots in the generator and should be treated as findings.', '',
];
fs.writeFileSync(path.join(__dirname, 'MUTATION.md'), lines.join('\n'));
fs.rmSync(scratch, { recursive: true, force: true });
console.log(lines.slice(6, 8).join('\n'));
rows.forEach((r) => console.log(`${r.id.padEnd(4)} ${r.status.padEnd(10)} ${r.what}  ${r.detail ? '-> ' + r.detail : ''}`));
