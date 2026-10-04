// Run with:  node tests.js
// Loads the browser modules into a sandbox (no DOM needed for the pure math code).
const { Calc, Calculus, Solver, Formulas, Units, Library } = require('./validation/load')();

let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => { ok ? passed++ : failures.push(`${name} ${detail}`); };

const calc = (expr, deg = true) => Calc.formatNumber(Calc.evaluateExpression(expr, deg));
const eq = (expr, expected, deg = true) => {
  let got;
  try { got = calc(expr, deg); } catch (e) { got = `ERR(${e.message})`; }
  check(`calc "${expr}"`, got === String(expected), `-> ${got}, expected ${expected}`);
};
const throws = (expr, deg = true) => {
  let threw = false;
  try { calc(expr, deg); } catch (e) { threw = true; }
  check(`calc "${expr}" should error`, threw);
};

// --- arithmetic & precedence ---
eq('2 + 3 × 4', 14);
eq('(2 + 3) × 4', 20);
eq('10 ÷ 4', 2.5);
eq('0.1 + 0.2', 0.3);
eq('2^3^2', 512);          // right-associative
eq('−2^2', -4);            // unary minus binds looser than ^
eq('2^-1', 0.5);
eq('5 mod 3', 2);
eq('50%', 0.5);
eq('5!', 120);
eq('10 − 2 − 3', 5);       // left-associative

// --- implicit multiplication ---
eq('2π', 6.28318530718);
eq('3(4 + 5)', 27);
eq('2sin(30)', 1);
eq('(2)(3)', 6);

// --- scientific notation (physical constants insert like this) ---
eq('6.62607015e-34 × 2', '1.32521403e-33');
eq('299792458 × 2', 599584916);
eq('1e3 + 1', 1001);
eq('2e', 5.43656365692);   // "2e" is 2 × Euler's number, not an exponent

// --- trig, degrees vs radians ---
eq('sin(30)', 0.5);
eq('sin(180)', 0);         // no 1.2e-16 noise
eq('cos(90)', 0);
eq('tan(45)', 1);
eq('sin(π/2)', 1, false);
eq('asin(0.5)', 30);
eq('atan(1)', 45);
eq('atan(1)', 0.785398163397, false);

// --- logs, roots, misc ---
eq('log(1000)', 3);
eq('log10(100)', 2);
eq('ln(e)', 1);
eq('√(16)', 4);
eq('³√(27)', 3);
eq('abs(−5)', 5);
eq('exp(0)', 1);
eq('sin(30', 0.5);         // auto-closed paren
eq('10^(2', 100);          // auto-closed paren

// --- error handling ---
throws('1 ÷ 0');
throws('ln(0)');
throws('√(−1)');
throws('tan(90)');
throws('asin(2)');
throws('(−1)!');
throws('1.5!');
throws('2 +');
throws('sin(');            // empty argument
throws('2 3');
throws('1.2.3');
throws('foo(2)');
throws('5 mod 0');
throws('171!');

// --- graph function compiler (no eval) ---
const f = Calc.compileFunction('x^2 + 2x');
check('graph x^2+2x at 3', f(3) === 15);
check('graph undefined -> null', Calc.compileFunction('1/x')(0) === null);
check('graph sin(x) uses radians', Math.abs(Calc.compileFunction('sin(x)')(Math.PI / 2) - 1) < 1e-12);
let rejected = false;
try { Calc.compileFunction('alert(1)'); } catch (e) { rejected = true; }
check('graph rejects arbitrary code', rejected);

// --- symbolic derivative: exact strings for simple cases ---
const d = (s) => Calculus.symbolicDerivative(s).symbolic;
const dEq = (src, expected) => check(`d/dx ${src}`, d(src) === expected, `-> ${d(src)}, expected ${expected}`);
dEq('x^3', '3*x^2');
dEq('5x', '5');
dEq('7', '0');
dEq('sin(x)', 'cos(x)');
dEq('cos(x)', '-sin(x)');
dEq('x^3 + 2x^2 - 5x + 1', '3*x^2 + 4*x - 5');
dEq('ln(x)', '1/x');
dEq('-x^2', '-2*x');
dEq('3*cos(x)', '-3*sin(x)');      // old code produced "--3*sin(x)"
dEq('x*sin(x^2)', 'sin(x^2) + 2*x^2*cos(x^2)');   // product + chain rule; x*x merges to x^2
dEq('x/x', '0');                                   // x/x = 1 (x != 0), so the derivative is 0
const aEq = (src, expected) => {
  const got = Calculus.symbolicAntiderivative(src).symbolic;
  check(`∫ ${src}`, got === expected, `-> ${got}, expected ${expected}`);
};
// exact printed forms for the textbook cases, one per method
aEq('3x^2', 'x^3');                // basic: old output was "3*(x^3/3)"
aEq('x^2', 'x^3/3');
aEq('cos(2x)', 'sin(2*x)/2');
aEq('(x+1)*(x-2)', 'x^3/3 - x^2/2 - 2*x');         // polynomial expansion
aEq('tan(x)^2', 'tan(x) - x');                     // trig reduction
aEq('1/cos(x)^2', 'tan(x)');
aEq('x*exp(x)', 'x*exp(x) - exp(x)');              // by parts
aEq('x*sin(x)', '-x*cos(x) + sin(x)');
aEq('ln(x)', 'x*ln(x) - x');
aEq('x*ln(x)', 'ln(x)*x^2/2 - x^2/4');
aEq('x^2*exp(x)', 'x^2*exp(x) - 2*x*exp(x) + 2*exp(x)');   // by parts twice, like terms merged
aEq('x*exp(x^2)', 'exp(x^2)/2');                   // u-substitution
aEq('ln(x)/x', 'ln(x)^2/2');
aEq('cos(x)/(1+sin(x)^2)', 'atan(sin(x))');
aEq('1/(x^2+1)', 'atan(x)');                       // rational / partial fractions
aEq('x/(x^2+1)', 'ln(abs(x^2 + 1))/2');
aEq('1/(x^2-1)', 'ln(abs(x - 1))/2 - ln(abs(x + 1))/2');
aEq('1/sqrt(4-x^2)', 'asin(x/2)');                 // radical
aEq('exp(x)*sin(x)', 'exp(x)*(sin(x) - cos(x))/2');

// --- derivative correctness: compare against central differences at several points.
// This validates product / quotient / chain rules without trusting string shapes.
const exprs = [
  'x*sin(x)', 'sin(x^2)', 'exp(2x)', 'x^2/(x+1)', 'sqrt(x^2+1)', 'atan(3x)',
  'ln(x^2+1)', '(x+1)^5', '2^x', 'x^x', 'tan(x)', 'cos(x)*exp(x)', 'sin(cos(x))',
  'asin(x/2)', 'log10(x+3)', '1/x', 'x^(-2)',
];
for (const e of exprs) {
  const sym = d(e);
  const exact = Calculus.makeFunction(sym);
  let worst = 0;
  for (const x of [0.3, 0.7, 1.1, 1.9]) {
    const num = Calculus.numericalDerivative(e, x);
    worst = Math.max(worst, Math.abs(exact(x) - num) / Math.max(1, Math.abs(num)));
  }
  check(`derivative of ${e} numerically verified`, worst < 1e-6, `(${sym}, rel err ${worst.toExponential(2)})`);
}

// --- antiderivative: differentiate the result and compare with the integrand ---
const integrands = [
  // basic
  'x^2', '3x^2 + 2x + 1', 'sin(x)', '-3*sin(x)', 'cos(2x)', 'exp(3x)', '1/x', '(2x+1)^3',
  'sqrt(x)', 'sqrt(2x+1)', '1/(x+2)', 'x^(-2)', 'ln(x)', 'tan(x)', '5', 'e^x', '2^x', 'x/4',
  'ln(3x+1)', 'atan(2x)', 'asin(x/3)', 'acos(x/4)',
  // polynomial products
  '(x+1)*(x-2)', 'x*(x+3)^2', '(2x+1)*(x^2-x+4)',
  // trigonometric
  'sin(x)^2', 'cos(x)^2', 'sin(2x)^3', 'cos(x)^4', 'tan(x)^2', 'tan(2x)^3', '1/cos(x)^2', '1/sin(x)^2', '1/cos(x)', '1/sin(x)',
  'sin(3x)*cos(5x)', 'sin(x)*sin(2x)', 'cos(x)*cos(4x)', 'sin(x)*cos(x)', 'sin(x)^2*cos(x)^2', 'sin(x)^2*cos(x)^4',
  // exponential x trig
  'exp(x)*sin(x)', 'exp(2x)*cos(3x)', 'exp(-x)*sin(2x+1)',
  // integration by parts
  'x*exp(x)', 'x*sin(x)', 'x*cos(3x)', 'x^2*exp(x)', 'x^2*sin(x)', 'x^3*exp(2x)', 'x*ln(x)', 'x^2*ln(x)', 'sqrt(x)*ln(x)',
  'ln(x)^2', 'x*atan(x)', 'x*asin(x/3)', 'x*exp(-x)', 'exp(x)*x^2*3',
  // u-substitution
  'x*exp(x^2)', 'x^3*exp(x^2)', 'x*sin(x^2+1)', 'x*sqrt(1+x^2)', 'ln(x)/x', '1/(x*ln(x))', 'sin(x)*exp(cos(x))',
  'cos(x)/(1+sin(x)^2)', 'cos(x)*sin(x)^3', 'x^2*cos(x^3)', 'exp(x)/(1+exp(x))', '(2x+1)/(x^2+x+1)',
  // rational
  '1/(x^2+1)', '1/(x^2+4)', 'x/(x^2+1)', '1/(x^2-1)', '1/(x^2+2x+5)', '(2x+3)/(x^2+x+1)', '(x^3+1)/(x+4)',
  '1/((x+1)*(x+2)*(x+3))', '(3x+5)/((x+1)*(x+4))', '1/(x^2+2x+1)', '(x^2+1)/(x^2-4)', 'x/(x^2-3x+2)',
  // radicals
  '1/sqrt(4-x^2)', 'sqrt(4-x^2)', '1/sqrt(x^2+1)', 'sqrt(x^2+1)', '1/sqrt(x^2+2x+5)', 'sqrt(9-x^2)',
];
// Sample points inside every integrand's domain (some need |x| < 2 or x > 0).
const SAMPLE_XS = [0.4, 0.9, 1.3, 1.6];
for (const e of integrands) {
  const { symbolic } = Calculus.symbolicAntiderivative(e);
  if (symbolic === null) { check(`antiderivative of ${e} found`, false); continue; }
  const original = Calculus.makeFunction(e);
  let worst = 0, used = 0;
  for (const x of SAMPLE_XS) {
    const orig = original(x);
    const num = Calculus.numericalDerivative(symbolic, x);
    if (!Number.isFinite(orig) || !Number.isFinite(num)) continue;
    used++;
    worst = Math.max(worst, Math.abs(num - orig) / Math.max(1, Math.abs(orig)));
  }
  check(`antiderivative of ${e} -> ${symbolic}`, used >= 2 && worst < 1e-6, `rel err ${worst.toExponential(2)} at ${used} points`);
}

// --- honesty: no closed form is reported, quickly, for integrals outside the methods ---
for (const e of ['exp(x^2)', 'sin(x)/x', 'x^x', 'exp(x)/x', 'sqrt(sin(x))', '1/ln(x)', 'sin(x^2)', 'cos(x)/x', 'atan(x)/x', 'ln(x)*sin(x)']) {
  const t0 = Date.now();
  const r = Calculus.symbolicAntiderivative(e);
  check(`∫ ${e} declined, not guessed (${r.symbolic})`, r.symbolic === null && Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
}

// --- the self-check gate: a deliberately broken rule must not leak a wrong answer ---
{
  const original = Calculus.integBasic;
  Calculus.integBasic = function (n, s, depth) {
    // wrong on purpose: claims the antiderivative of sin(x) is sin(x)
    if (n.t === 'fn' && n.name === 'sin' && n.a.t === 'var') return this.fn('sin', n.a);
    return original.call(this, n, s, depth);
  };
  const r = Calculus.symbolicAntiderivative('sin(x)');
  Calculus.integBasic = original;
  check('self-check rejects a wrong antiderivative from a broken rule', r.symbolic === null);
  check('self-check explains why', r.steps.some((t) => /self-check/i.test(t)));
  check('...and the real rule is restored', Calculus.symbolicAntiderivative('sin(x)').symbolic === '-cos(x)');
}

// --- every returned antiderivative carries a passed self-check note ---
check('result lists its self-check', Calculus.symbolicAntiderivative('x*exp(x)').steps.some((t) => /Self-check: .* matches/.test(t)));

// --- Simpson's rule against known values ---
const near = (a, b, tol = 1e-8) => Math.abs(a - b) < tol;
check('∫0..1 x^2 = 1/3', near(Calculus.simpsonsRule('x^2', 0, 1), 1 / 3));
check('∫0..π sin = 2', near(Calculus.simpsonsRule('sin(x)', 0, Math.PI), 2));
check('∫1..e 1/x = 1', near(Calculus.simpsonsRule('1/x', 1, Math.E), 1));

// --- parser round-trip: toStr output must re-parse to an equal function ---
for (const e of ['(x+1)*(x-1)', 'x-(x-1)', '2/(x*3)', '-(x+1)^2', 'x^(2^x)']) {
  const ast = Calculus.simplify(Calculus.parseAST(e));
  const again = Calculus.makeFunction(Calculus.toStr(ast));
  const orig = Calculus.makeFunction(e);
  check(`round-trip ${e} -> ${Calculus.toStr(ast)}`, [0.5, 1.5, 2.5].every(x => near(again(x), orig(x), 1e-9)));
}

// =====================================================================================
//  FORMULA LIBRARY: every formula must be a working calculator
// =====================================================================================
const close2 = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const solveWith = (f, find, given, deg = true) => {
  const g = { ...given };
  f.vars.forEach((v) => { if (v.def !== undefined && v.id !== find && !(v.id in g)) g[v.id] = v.def; });
  return Solver.solve(f, find, g, { deg });
};
const byName = (name) => Formulas.find((f) => f.name === name);

// --- structure: the machine-readable part agrees with the declared variables ---
const seenNames = new Set();
for (const f of Formulas) {
  check(`formula name unique: ${f.name}`, !seenNames.has(f.name)); seenNames.add(f.name);
  const ids = f.vars.map((v) => v.id);
  check(`${f.name}: variable ids unique`, new Set(ids).size === ids.length);
  if (f.solve === false) { check(`${f.name}: reference-only has a reason`, !!f.why); continue; }
  if (f.dataset) { check(`${f.name}: dataset has an example`, !!f.example); continue; }
  for (const src of f.eqs) {
    let eq;
    try { eq = Solver.parseEquation(src); } catch (e) { check(`${f.name}: equation parses (${src})`, false, e.message); continue; }
    check(`${f.name}: equation uses only declared variables (${src})`, [...eq.vars].every((v) => ids.includes(v)), [...eq.vars].filter((v) => !ids.includes(v)).join(','));
  }
  check(`${f.name}: every declared variable appears in an equation`, ids.every((id) => f.eqs.some((src) => Solver.parseEquation(src).vars.has(id))));
  check(`${f.name}: example target is solvable`, !!f.example && (f.targets || ids).includes(f.example.find));
}

// --- worked examples against independent arithmetic (written by hand, not via the solver) ---
const R_GAS = 8.314462618;
const EXPECT = {
  'Area of Circle': Math.PI * 9, 'Circumference of Circle': 2 * Math.PI, 'Area of Rectangle': 20, 'Perimeter of Rectangle': 18,
  'Area of Triangle': 12, 'Area of Triangle (Heron)': 6, 'Perimeter of Triangle': 12, 'Pythagoras Theorem': 5,
  'Volume of Sphere': (4 / 3) * Math.PI * 27, 'Surface Area of Sphere': 16 * Math.PI, 'Volume of Cylinder': 20 * Math.PI,
  'Lateral SA of Cylinder': 20 * Math.PI, 'Total SA of Cylinder': 28 * Math.PI, 'Volume of Cone': 12 * Math.PI,
  'Slant Height of Cone': 5, 'Volume of Cube': 27, 'Surface Area of Cube': 24, 'Volume of Cuboid': 24, 'Diagonal of Rectangle': 5,
  'Arc Length': 10, 'Area of Sector': 12, 'Area of Parallelogram': 15, 'Area of Trapezoid': 16,
  'Quadratic Formula': [2, 1], 'Discriminant': 12, 'Slope-Intercept Form': 7, 'Point-Slope Form': 5, 'Distance Formula': 5,
  'Midpoint Formula': 5, 'Exponential Growth': 100 * Math.exp(0.2), 'Logarithm Change Base': 3, 'Sum of Arithmetic Series': 55,
  'Sum of Geometric Series': 7, 'nth Term – Arithmetic': 14, 'nth Term – Geometric': 54,
  "Newton's 2nd Law": 6, 'Kinetic Energy': 9, 'Potential Energy': 2 * 9.8 * 5, 'Equations of Motion (v)': 14,
  'Equations of Motion (s)': 2 * 4 + 0.5 * 3 * 16, 'Equations of Motion (v²)': [5, -5], "Ohm's Law": 12, 'Power (Electrical)': 24,
  "Coulomb's Law": 8.9875517923e9 * 1e-6 * 2e-6 / (0.1 * 0.1), "Newton's Gravitation": 6.6743e-11 * 5.972e24 / (6.371e6 * 6.371e6),
  'Pressure': 50, 'Wave Speed': 100, 'Density': 5, 'Work Done': 25, 'Momentum': 6, "Hooke's Law": -10,
  'Sine Rule': 20, 'Cosine Rule': 5, 'Pythagorean Identity': 1, 'tan Identity': 1, 'Double Angle – sin': Math.sqrt(3) / 2,
  'Double Angle – cos': 0.5, 'Sum-to-Product (sin)': 0.5 + Math.sqrt(3) / 2,
  'Normal Distribution': 1 / Math.sqrt(2 * Math.PI), 'Combinations C(n,r)': 10, 'Permutations P(n,r)': 20, "Bayes' Theorem": 0.9 * 0.01 / 0.05,
  'Ideal Gas Law': (1 * R_GAS * 273.15) / 101325, 'Molarity': 4, 'pH Formula': 7, 'pOH Formula': 3, 'pH + pOH': 11,
  'Arrhenius Equation': 1e13 * Math.exp(-50000 / (R_GAS * 300)), 'Molar Mass': 18,
  'Simple Interest': 100, 'Compound Interest': 1210, 'Present Value': 1000, 'Future Value': 1210, 'Rule of 72': 9, 'ROI': 50,
};
for (const f of Formulas) {
  if (f.solve === false || f.dataset) continue;
  const want = EXPECT[f.name];
  if (want === undefined) { check(`${f.name}: has an independent expected value`, false); continue; }
  const r = solveWith(f, f.example.find, f.example.given);
  if (!r.ok) { check(`${f.name}: example solves`, false, r.message); continue; }
  const got = r.solutions.map((s) => s.value);
  const wants = Array.isArray(want) ? want : [want];
  check(`${f.name}: example = ${wants.join(' / ')}`, got.length === wants.length && wants.every((w, i) => close2(got[i], w, 1e-9)), `got ${got.join(' / ')}`);
}

// --- datasets ---
{
  const lists = (txt) => txt.split(/\s+/).map(Number);
  const x = lists('2 4 4 4 5 5 7 9');
  const rowsOf = (name, data) => Object.fromEntries(byName(name).dataset.compute(data));
  check('mean of 2 4 4 4 5 5 7 9 = 5', rowsOf('Mean (Average)', { x })['Mean μ'] === 5);
  check('population variance = 4', close2(rowsOf('Variance', { x })['Population variance σ² (÷ n)'], 4));
  check('sample variance = 32/7', close2(rowsOf('Variance', { x })['Sample variance s² (÷ n−1)'], 32 / 7));
  check('population std dev = 2', close2(rowsOf('Standard Deviation', { x })['Population std dev σ (÷ n)'], 2));
  check('correlation of the textbook pairs', close2(rowsOf('Correlation Coefficient', { x: [1, 2, 3, 4, 5], y: [2, 4, 5, 4, 5] })['Correlation r'], 6 / Math.sqrt(60)));
  let threw = '';
  try { byName('Correlation Coefficient').dataset.compute({ x: [1, 2, 3], y: [1, 2] }); } catch (e) { threw = e.message; }
  check('correlation rejects unpaired lists', /paired/.test(threw));
  threw = '';
  try { byName('Correlation Coefficient').dataset.compute({ x: [3, 3, 3], y: [1, 2, 3] }); } catch (e) { threw = e.message; }
  check('correlation rejects a constant list', /no spread/.test(threw));
}

// --- round trip: solve for EVERY variable of EVERY equation and get the original value back ---
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const sample = (v) => {
    if (v.def !== undefined) return v.def;
    if (v.int) return 2 + Math.floor(rnd() * 8);
    if (v.angle || (v.min === 0 && v.max === 180)) return 20 + rnd() * 50;
    if (v.min === 0 && v.max === 1) return 0.1 + rnd() * 0.8;
    if (v.unit === 'decimal' || v.id === 'r' && /rate/.test(v.name)) return 0.01 + rnd() * 0.19;
    return 1 + rnd() * 9;
  };
  let trials = 0, failed = 0;
  const failures2 = [];
  for (const f of Formulas) {
    if (f.solve === false || f.dataset) continue;
    const meta = Object.fromEntries(f.vars.map((v) => [v.id, v]));
    const allowed = f.targets || f.vars.map((v) => v.id);
    for (const src of f.eqs) {
      const eq = Solver.parseEquation(src);
      const ids = f.vars.map((v) => v.id).filter((id) => eq.vars.has(id));
      const base = ids[0];
      for (let rep = 0; rep < 12; rep++) {
        const env = {};
        ids.filter((id) => id !== base).forEach((id) => { env[id] = sample(meta[id]); });
        const first = Solver.solveEquation(eq, base, env, true, meta[base]);
        if (!first.solutions.length) { rep--; if (++trials > 100000) break; continue; }   // sampled values outside the formula's domain
        env[base] = first.solutions[0].value;
        for (const id of ids) {
          if (id === base || !allowed.includes(id) || meta[id].def !== undefined) continue;
          const rest = { ...env }; delete rest[id];
          const res = Solver.solveEquation(eq, id, rest, true, meta[id]);
          const ok = res.solutions.some((s) => close2(s.value, env[id], 1e-6));
          trials++;
          if (!ok) { failed++; if (failures2.length < 8) failures2.push(`${f.name} [${src}] find ${id} from ${JSON.stringify(rest)} want ${env[id]} got ${res.solutions.map((s) => s.value).join(',') || 'nothing'}`); }
        }
      }
    }
  }
  check(`round trip: ${trials - failed}/${trials} variable solves recovered the original value`, failed === 0, failures2.join(' || '));
  check('round trip exercised a meaningful number of solves', trials > 600, `only ${trials}`);
}

// --- solver behaviour ---
{
  const quad = byName('Quadratic Formula');
  const roots = (a, b, c) => solveWith(quad, 'x', { a, b, c });
  check('quadratic: two roots, larger first', JSON.stringify(roots(1, -3, 2).solutions.map((s) => s.value)) === '[2,1]');
  check('quadratic: double root listed once', JSON.stringify(roots(1, -2, 1).solutions.map((s) => s.value)) === '[1]');
  check('quadratic: no real roots is reported, not guessed', !roots(1, 0, 1).ok && /No real solution/.test(roots(1, 0, 1).message));
  check('quadratic: finds b from a root', close2(solveWith(quad, 'b', { a: 1, c: 2, x: 1 }).solutions[0].value, -3));

  const pyth = byName('Pythagoras Theorem');
  check('lengths exclude the negative root', JSON.stringify(solveWith(pyth, 'c', { a: 3, b: 4 }).solutions.map((s) => s.value)) === '[5]');
  check('leg from hypotenuse', close2(solveWith(pyth, 'a', { c: 5, b: 4 }).solutions[0].value, 3));
  check('impossible triangle has no real solution', !solveWith(pyth, 'a', { c: 3, b: 4 }).ok);

  const power = byName('Power (Electrical)');
  check('power: V and I give P', close2(solveWith(power, 'P', { V: 12, I: 2 }).solutions[0].value, 24));
  check('power: I and R give P (second form)', close2(solveWith(power, 'P', { I: 2, R: 5 }).solutions[0].value, 20));
  check('power: V and R give P (third form)', close2(solveWith(power, 'P', { V: 10, R: 5 }).solutions[0].value, 20));
  check('power: R from V and P uses V²/R', close2(solveWith(power, 'R', { V: 10, P: 20 }).solutions[0].value, 5));
  const lacking = solveWith(power, 'P', { V: 12 });
  check('power: with V given, the one missing value (I or R) is asked for', !lacking.ok && lacking.message === 'Enter a value for: I or R', lacking.message);
  const lackingAll = solveWith(power, 'P', {});
  check('power: with nothing given, the alternative sets are listed', !lackingAll.ok && /\(V, I\) or \(I, R\) or \(V, R\)/.test(lackingAll.message), lackingAll.message);

  const work = byName('Work Done');
  check('trig: degrees', close2(solveWith(work, 'W', { F: 10, d: 5, theta: 60 }, true).solutions[0].value, 25));
  check('trig: radians', close2(solveWith(work, 'W', { F: 10, d: 5, theta: Math.PI / 3 }, false).solutions[0].value, 25));
  check('trig: angle from work, degrees', close2(solveWith(work, 'theta', { F: 10, d: 5, W: 25 }, true).solutions[0].value, 60));
  check('trig: angle from work, radians', close2(solveWith(work, 'theta', { F: 10, d: 5, W: 25 }, false).solutions[0].value, Math.PI / 3));
  check('trig: cos(90°) is exactly 0', solveWith(work, 'W', { F: 10, d: 5, theta: 90 }, true).solutions[0].value === 0);

  const sine = byName('Sine Rule');
  const amb = solveWith(sine, 'B', { a: 10, A: 30, b: 14 }).solutions.map((s) => s.value);
  check('sine rule: ambiguous case gives two angles that sum to 180 − ...', amb.length === 2 && close2(amb[0] + amb[1], 180), JSON.stringify(amb));

  const motion = byName('Equations of Motion (s)');
  const t = solveWith(motion, 't', { s: 32, u: 2, a: 3 });
  check('kinematics: time solved numerically, negative time excluded', t.method === 'numeric' && t.solutions.length === 1 && close2(t.solutions[0].value, 4));
  const vsq = solveWith(byName('Equations of Motion (v²)'), 'v', { u: 3, a: 2, s: 4 });
  check('v² = u² + 2as: both signs of velocity shown', JSON.stringify(vsq.solutions.map((s) => s.value)) === '[5,-5]');

  const circle = byName('Area of Circle');
  const rr = solveWith(circle, 'r', { A: 28.274333882308138 });
  check('rearranged formula is shown', rr.method === 'rearranged' && rr.solutions[0].rearranged === 'r = √(A / π)', rr.solutions[0].rearranged);
  check('substituted line shows the numbers', /^r = √\(28\.27433388 \/ π\)$/.test(rr.solutions[0].substituted), rr.solutions[0].substituted);

  const comp = byName('Compound Interest');
  check('compound interest: solve for the rate', close2(solveWith(comp, 'r', { A: 1210, P: 1000, n: 1, t: 2 }).solutions[0].value, 0.1));
  check('compound interest: solve for the time', close2(solveWith(comp, 't', { A: 1210, P: 1000, n: 1, r: 0.1 }).solutions[0].value, 2));
  check('compound interest: solve for compounds per year (numeric)', close2(solveWith(comp, 'n', { A: 1000 * Math.pow(1 + 0.1 / 12, 12), P: 1000, r: 0.1, t: 1 }).solutions[0].value, 12, 1e-6));
  check('pH from concentration and back', close2(solveWith(byName('pH Formula'), 'H', { pH: 3 }).solutions[0].value, 1e-3));
  check('geometric series: solve for n', close2(solveWith(byName('Sum of Geometric Series'), 'n', { S: 7, a: 1, r: 2 }).solutions[0].value, 3));
  check('constants are editable defaults', close2(solveWith(byName('Potential Energy'), 'PE', { m: 2, h: 5, g: 1.62 }).solutions[0].value, 16.2));
  check('Bayes probabilities stay within 0..1', !solveWith(byName("Bayes' Theorem"), 'PA', { PAB: 0.9, PBA: 0.01, PB: 0.5 }).ok);

  // parsing of user-typed numbers
  const num = (s) => Solver.parseNumber(s);
  check('typed number: 2*pi', close2(num('2*pi'), 2 * Math.PI));
  check('typed number: 1/3', close2(num('1/3'), 1 / 3));
  check('typed number: 1e-6', num('1e-6') === 1e-6);
  check('typed number: sqrt(2)', close2(num('sqrt(2)'), Math.SQRT2));
  check('typed number: 2pi (implicit multiplication)', close2(num('2pi'), 2 * Math.PI));
  check('typed number: unicode × and −', close2(num('3 × 4 − 2'), 10));
  for (const bad of ['', 'abc', '1 +', '2*', '(3', '1/0', '1..2']) {
    let threw = false;
    try { num(bad); } catch (e) { threw = true; }
    check(`typed number rejected: "${bad}"`, threw);
  }
  // equations that are not equations
  let bad = false;
  try { Solver.parseEquation('x + 1'); } catch (e) { bad = true; }
  check('parseEquation rejects text without "="', bad);
}

// =====================================================================================
//  UNITS: the catalogue, and conversion inside the formula dialog's engine
// =====================================================================================
{
  const U = Units;
  const conv = (v, d, a, b) => U.convert(v, d, a, b);
  // Defined or internationally agreed values, written out here independently of the table
  const KNOWN = [
    [1, 'length', 'in', 'm', 0.0254], [1, 'length', 'ft', 'in', 12], [1, 'length', 'mi', 'km', 1.609344], [1, 'length', 'yd', 'ft', 3],
    [1, 'mass', 'lb', 'kg', 0.45359237], [1, 'mass', 'lb', 'oz', 16], [1, 'mass', 'st', 'lb', 14], [1, 'mass', 't', 'kg', 1000],
    [1, 'time', 'h', 's', 3600], [1, 'time', 'day', 'h', 24], [1, 'time', 'yr', 'day', 365.25], [24, 'time', 'month', 'yr', 2],
    [1, 'area', 'ha', 'm²', 10000], [1, 'area', 'acre', 'm²', 4046.8564224], [1, 'area', 'ft²', 'in²', 144],
    [1, 'volume', 'L', 'mL', 1000], [1, 'volume', 'gal', 'L', 3.785411784], [1, 'volume', 'gal', 'qt', 4], [1, 'volume', 'cup', 'fl oz', 8],
    [1, 'speed', 'mph', 'm/s', 0.44704], [36, 'speed', 'km/h', 'm/s', 10], [1, 'speed', 'kn', 'km/h', 1.852],
    [1, 'force', 'kgf', 'N', 9.80665], [1, 'force', 'lbf', 'N', 4.4482216152605],
    [1, 'pressure', 'atm', 'Pa', 101325], [1, 'pressure', 'bar', 'kPa', 100], [1, 'pressure', 'atm', 'mmHg', 760], [1, 'pressure', 'atm', 'psi', 14.695948775513449],
    [1, 'energy', 'kWh', 'J', 3.6e6], [1, 'energy', 'cal', 'J', 4.184], [1, 'energy', 'kcal', 'cal', 1000], [1, 'energy', 'eV', 'J', 1.602176634e-19],
    [1, 'power', 'hp', 'W', 745.6998715822702], [1, 'power', 'kW', 'W', 1000],
    [180, 'angle', '°', 'rad', Math.PI], [1, 'angle', 'turn', '°', 360], [90, 'angle', '°', 'grad', 100],
    [1, 'data', 'kB', 'B', 1000], [1, 'data', 'KiB', 'B', 1024], [8, 'data', 'bit', 'B', 1], [1, 'data', 'GiB', 'MiB', 1024],
    [50, 'ratio', '%', 'decimal', 0.5], [1, 'frequency', 'rpm', 'Hz', 1 / 60], [1, 'density', 'g/cm³', 'kg/m³', 1000], [1, 'concentration', 'mmol/L', 'mol/L', 0.001],
  ];
  for (const [v, d, a, b, want] of KNOWN) check(`${v} ${a} = ${want} ${b}`, close2(conv(v, d, a, b), want, 1e-9), `got ${conv(v, d, a, b)}`);

  // temperature is shifted, not just scaled
  check('0 °C = 273.15 K', close2(conv(0, 'temperature', '°C', 'K'), 273.15));
  check('100 °C = 212 °F', close2(conv(100, 'temperature', '°C', '°F'), 212));
  check('32 °F = 0 °C', Math.abs(conv(32, 'temperature', '°F', '°C')) < 1e-12);
  check('−40 °C = −40 °F', close2(conv(-40, 'temperature', '°C', '°F'), -40));
  check('0 K = −273.15 °C', close2(conv(0, 'temperature', 'K', '°C'), -273.15));
  check('98.6 °F = 37 °C', close2(conv(98.6, 'temperature', '°F', '°C'), 37, 1e-9));

  // structure: every unit converts to every other unit in its dimension and back
  let pairs = 0, drift = 0;
  for (const [dim, d] of Object.entries(U.DIMENSIONS)) {
    check(`${dim}: base unit exists with factor 1`, d.units.some((x) => x.symbol === d.base && x.factor === 1 && x.offset === 0));
    check(`${dim}: unit symbols are unique`, new Set(d.units.map((x) => x.symbol)).size === d.units.length);
    for (const a of d.units) for (const b of d.units) {
      const x = 123.456;
      pairs++;
      if (!close2(conv(conv(x, dim, a.symbol, b.symbol), dim, b.symbol, a.symbol), x, 1e-9)) drift++;
    }
  }
  check(`unit round trips: ${pairs - drift}/${pairs} pairs are lossless`, drift === 0);
  let unknown = false; try { conv(1, 'length', 'm', 'parsec'); } catch (e) { unknown = true; }
  check('an unknown unit is an error, not NaN', unknown);

  // every formula variable that has a dimension names a real unit of it
  for (const f of Formulas) for (const v of f.vars) {
    if (v.dim) { let ok = true; try { U.find(v.dim, v.unit); } catch (e) { ok = false; } check(`${f.name}: ${v.id} unit ${v.unit} is a ${v.dim} unit`, ok); }
  }
}

// --- formulas with units: typed in one unit, solved, shown in another ---
{
  const F = (n) => Formulas.find((f) => f.name === n);
  const lib = Library;
  const solveU = (name, find, entries, opts) => {
    const f = F(name);
    f.vars.forEach((v) => { if (v.def !== undefined && v.id !== find && !(v.id in entries)) entries[v.id] = { value: v.def, unit: v.unit }; });
    return lib.solveWithUnits(f, find, entries, opts);
  };
  const first = (r) => r.solutions[0];

  let r = solveU('Area of Circle', 'A', { r: { value: 300, unit: 'cm' } }, { targetUnit: 'm²' });
  check('radius 300 cm -> area in m²', r.ok && close2(first(r).display, Math.PI * 9), r.message);
  r = solveU('Area of Circle', 'A', { r: { value: 300, unit: 'cm' } }, { targetUnit: 'cm²' });
  check('radius 300 cm -> area in cm²', close2(first(r).display, Math.PI * 300 * 300));
  check('conversion is reported', r.conversions.length === 1 && /300 cm = 3 m/.test(r.conversions[0]), r.conversions.join('|'));
  r = solveU('Area of Circle', 'r', { A: { value: 1, unit: 'm²' } }, { targetUnit: 'cm' });
  check('area 1 m² -> radius in cm', close2(first(r).display, 100 / Math.sqrt(Math.PI)));

  r = solveU('Ideal Gas Law', 'V', { P: { value: 1, unit: 'atm' }, n: { value: 1, unit: 'mol' }, T: { value: 0, unit: '°C' } }, { targetUnit: 'L' });
  check('1 mol at 1 atm and 0 °C is 22.414 L', close2(first(r).display, (8.314462618 * 273.15) / 101325 * 1000, 1e-9), `got ${r.ok ? first(r).display : r.message}`);
  r = solveU('Ideal Gas Law', 'T', { P: { value: 1, unit: 'atm' }, V: { value: 22.414, unit: 'L' }, n: { value: 1, unit: 'mol' } }, { targetUnit: '°C' });
  check('temperature solved in °C', r.ok && Math.abs(first(r).display) < 0.01, `got ${r.ok ? first(r).display : r.message}`);
  r = solveU('Ideal Gas Law', 'P', { V: { value: 22.414, unit: 'L' }, n: { value: 1, unit: 'mol' }, T: { value: 32, unit: '°F' } }, { targetUnit: 'atm' });
  check('32 °F is 273.15 K for the gas law', r.ok && close2(first(r).display, (8.314462618 * 273.15) / (22.414e-3) / 101325, 1e-9));

  r = solveU('Kinetic Energy', 'KE', { m: { value: 2, unit: 'lb' }, v: { value: 3, unit: 'mph' } }, { targetUnit: 'J' });
  check('kinetic energy from lb and mph', close2(first(r).display, 0.5 * (2 * 0.45359237) * Math.pow(3 * 0.44704, 2), 1e-9));
  r = solveU('Kinetic Energy', 'KE', { m: { value: 2, unit: 'kg' }, v: { value: 3, unit: 'm/s' } }, { targetUnit: 'kJ' });
  check('answer shown in kJ', close2(first(r).display, 0.009) && r.targetUnit === 'kJ');

  r = solveU('pH Formula', 'pH', { H: { value: 1, unit: 'mmol/L' } });
  check('1 mmol/L hydrogen ions is pH 3', close2(first(r).display, 3));
  r = solveU('Simple Interest', 'SI', { P: { value: 1000, unit: 'decimal' } });
  check('a non-ratio variable has no ratio conversion applied', r.ok || /Enter/.test(r.message));
  r = solveU('Simple Interest', 'SI', { P: { value: 1000, unit: 'decimal' }, R: { value: 0.05, unit: 'decimal' }, T: { value: 24, unit: 'month' } });
  check('rate as a decimal and time in months', r.ok && close2(first(r).display, 100), r.ok ? first(r).display : r.message);
  r = solveU('Compound Interest', 'A', { P: { value: 1000, unit: 'decimal' }, r: { value: 10, unit: '%' }, n: { value: 1, unit: 'decimal' }, t: { value: 2, unit: 'yr' } });
  check('compound interest with the rate typed as 10 %', r.ok && close2(first(r).display, 1210), r.ok ? first(r).display : r.message);

  r = solveU('Equations of Motion (s)', 't', { s: { value: 0.032, unit: 'km' }, u: { value: 2, unit: 'm/s' }, a: { value: 3, unit: 'm/s²' } }, { targetUnit: 'min' });
  check('time solved from km and shown in minutes', r.ok && close2(first(r).display, 4 / 60, 1e-9), r.ok ? first(r).display : r.message);

  r = solveU('Ohm\'s Law', 'V', { I: { value: 250, unit: 'mA' }, R: { value: 2, unit: 'kΩ' } }, { targetUnit: 'V' });
  check('250 mA through 2 kΩ is 500 V', close2(first(r).display, 500));

  // missing values still produce a helpful message, and unit choice never changes it
  r = solveU('Kinetic Energy', 'KE', { m: { value: 2, unit: 'lb' } });
  check('missing value is reported', !r.ok && /Enter a value for: v/.test(r.message));
}

// =====================================================================================
//  READABILITY: the colour pairs every theme relies on meet WCAG AA (4.5:1)
// =====================================================================================
{
  const css = require('fs').readFileSync(`${__dirname}/styles.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // later declarations of the same selector override earlier ones, exactly as the browser applies them
  const vars = (selector) => {
    const out = {};
    const re = new RegExp(`(?:^|\\n)${selector.replace(/[[\]"]/g, '\\$&').replace(/\./g, '\\.')}\\s*\\{([^{}]*)\\}`, 'g');
    let m;
    while ((m = re.exec(css))) for (const d of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
    return out;
  };
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');
  const root = vars(':root');
  const THEMES = { 'Dark': {}, 'Light': vars('[data-theme="frost"]'), 'Handheld LCD (grey)': vars('[data-theme="solar"]'), 'Retro CRT': vars('[data-theme="oscilloscope"]') };
  const PAIRS = [
    ['text-main', 'bg-card', 'body text on cards'], ['text-muted', 'bg-card', 'muted text on cards'],
    ['text-main', 'bg-input', 'text in fields and tiles'], ['text-muted', 'bg-input', 'muted text in fields and tiles'],
    ['on-accent', 'accent-fill', 'label on a filled button'], ['accent-text', 'bg-card', 'accent-coloured text on cards'],
    ['danger-text', 'bg-card', 'red text on cards'], ['btn-math-color', 'btn-math-bg', 'operator keys'],
  ];
  let checked = 0;
  for (const [name, own] of Object.entries(THEMES)) {
    const v = { ...root, ...own };
    for (const [fg, bg, what] of PAIRS) {
      if (!isHex(v[fg]) || !isHex(v[bg])) continue;                    // translucent or gradient colours are covered by the browser audit
      checked++;
      const r = ratio(v[fg], v[bg]);
      check(`${name}: ${what} (${v[fg]} on ${v[bg]}) is ${r.toFixed(1)}:1`, r >= 4.5, 'needs at least 4.5:1');
    }
  }
  check(`readability: ${checked} colour pairs checked across 4 themes`, checked >= 24, `only ${checked}`);
}

console.log(`${passed} passed, ${failures.length} failed`);
failures.forEach(m => console.log('  FAIL ' + m));
process.exit(failures.length ? 1 : 0);
