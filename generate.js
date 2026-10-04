// Differential-testing case generator.
//
// Builds random expression trees and renders each one TWICE:
//   - in the calculator's own syntax (what a user would type), evaluated here by our parser, and
//   - in Python syntax (evaluated later by reference.py using Python's math/cmath/numpy).
// Because the tree is the same, any disagreement is a bug in one of the two evaluators.
//
//   node validation/generate.js [seed] [nArithmetic] [nDerivative] [nIntegral]
//   -> writes validation/cases.json
const fs = require('fs');
const path = require('path');
const { Calc, Calculus } = require('./load')();

const SEED = Number(process.argv[2] ?? 20260504);
const N_ARITH = Number(process.argv[3] ?? 3000);
const N_DERIV = Number(process.argv[4] ?? 600);
const N_INTEG = Number(process.argv[5] ?? 1200);

// mulberry32: small, fast, seedable PRNG so every run is reproducible
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = prng(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const round = (v, dp) => Number(v.toFixed(dp));

// ---------------------------------------------------------------- tree rendering
// node: {k:'num',v} {k:'const',n:'pi'|'e'} {k:'var'} {k:'neg',a} {k:'bin',op,a,b}
//       {k:'fn',name,a} {k:'fact',a} {k:'pct',a}
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, mod: 2, neg: 3, '^': 4 };
const precOf = (n) => (n.k === 'bin' ? PREC[n.op] : n.k === 'neg' ? PREC.neg : 5);

const numText = (v) => String(v);

// Calculator syntax. `minimal` uses the fewest parentheses precedence allows, which is what
// exercises the parser's precedence and associativity rules; otherwise everything is wrapped.
function renderCalc(n, minimal, unicode) {
  const R = (c) => renderCalc(c, minimal, unicode);
  const wrap = (c, need) => (need ? `(${R(c)})` : R(c));
  switch (n.k) {
    case 'num': return numText(n.v);
    case 'const': return n.n === 'pi' ? (unicode ? 'π' : 'pi') : 'e';
    case 'var': return 'x';
    case 'neg': return (unicode ? '−' : '-') + wrap(n.a, minimal ? precOf(n.a) < PREC.neg : precOf(n.a) < 5);
    case 'fact': return wrap(n.a, precOf(n.a) < 5) + '!';
    case 'pct': return wrap(n.a, precOf(n.a) < 5) + '%';
    case 'fn': {
      const name = n.name === 'sqrt' && unicode ? '√' : n.name === 'cbrt' && unicode ? '³√' : n.name;
      return `${name}(${R(n.a)})`;
    }
    case 'bin': {
      const p = PREC[n.op];
      let l, r;
      if (minimal) {
        if (n.op === '^') {
          // right-associative: (a^b)^c needs parens on the left; a^b^c does not on the right.
          // A unary minus may sit directly in the exponent ("2^-1"), so only + - * / mod get parens.
          l = wrap(n.a, precOf(n.a) <= p);
          r = wrap(n.b, precOf(n.b) < PREC.neg);
        } else {
          // left-associative: equal precedence on the right needs parens (a - (b - c)).
          l = wrap(n.a, precOf(n.a) < p);
          r = wrap(n.b, precOf(n.b) <= p);
        }
      } else {
        l = wrap(n.a, precOf(n.a) < 5);
        r = wrap(n.b, precOf(n.b) < 5);
      }
      const sym = { '+': ' + ', '-': unicode ? ' − ' : ' - ', '*': unicode ? ' × ' : ' * ', '/': unicode ? ' ÷ ' : ' / ', mod: ' mod ', '^': '^' }[n.op];
      return l + sym + r;
    }
  }
  throw new Error('render');
}

// Python syntax: always fully parenthesised, all numbers floats, degrees handled by helpers
// defined in reference.py (sind, cosd, ...).
function renderPy(n) {
  const R = renderPy;
  switch (n.k) {
    case 'num': { const s = String(n.v); return /[.e]/.test(s) ? s : s + '.0'; }
    case 'const': return n.n === 'pi' ? 'PI' : 'E';
    case 'var': return 'x';
    case 'neg': return `(-${R(n.a)})`;
    case 'fact': return `FACT(${R(n.a)})`;
    case 'pct': return `(${R(n.a)}/100.0)`;
    case 'fn': return `${n.name.toUpperCase()}(${R(n.a)})`;
    case 'bin': {
      const l = R(n.a), r = R(n.b);
      if (n.op === 'mod') return `FMOD(${l},${r})`;
      if (n.op === '^') return `POW(${l},${r})`;
      return `(${l}${n.op}${r})`;
    }
  }
  throw new Error('renderPy');
}

// ---------------------------------------------------------------- random trees
const FN_ARITH = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'sqrt', 'cbrt', 'abs', 'exp'];
function randNum() {
  const t = rnd();
  if (t < 0.55) return Math.floor(between(0, 21));
  if (t < 0.9) return round(between(0, 20), 1);
  return round(between(0, 3), 3);
}
function randLeaf() {
  const t = rnd();
  if (t < 0.85) return { k: 'num', v: randNum() };
  return { k: 'const', n: pick(['pi', 'e']) };
}
function randArith(depth) {
  if (depth === 0 || rnd() < 0.18) return randLeaf();
  const t = rnd();
  if (t < 0.55) {
    const op = pick(['+', '-', '*', '/', '+', '-', '*', '^', 'mod']);
    let b = randArith(depth - 1);
    if (op === '^') b = rnd() < 0.7 ? { k: 'num', v: pick([0, 1, 2, 3, 0.5, 2.5, 4]) } : b;
    return { k: 'bin', op, a: randArith(depth - 1), b };
  }
  if (t < 0.65) return { k: 'neg', a: randArith(depth - 1) };
  if (t < 0.9) return { k: 'fn', name: pick(FN_ARITH), a: randArith(depth - 1) };
  if (t < 0.95) return { k: 'fact', a: { k: 'num', v: Math.floor(between(0, 13)) } };
  return { k: 'pct', a: randArith(depth - 1) };
}

// Calculus expressions in x. Kept inside well-behaved domains; reference.py skips (and counts)
// any point where the real-valued function is undefined.
function randCalc(depth) {
  if (depth === 0 || rnd() < 0.2) {
    const t = rnd();
    if (t < 0.55) return { k: 'var' };
    if (t < 0.85) return { k: 'num', v: pick([1, 2, 3, 4, 5, 0.5, 1.5, 2.5, 7]) };
    return { k: 'const', n: pick(['pi', 'e']) };
  }
  const t = rnd();
  if (t < 0.5) {
    const op = pick(['+', '-', '*', '/', '*', '+']);
    return { k: 'bin', op, a: randCalc(depth - 1), b: randCalc(depth - 1) };
  }
  if (t < 0.65) {
    return { k: 'bin', op: '^', a: randCalc(depth - 1), b: { k: 'num', v: pick([2, 3, 4, -1, -2, 0.5, 1.5, 2.5]) } };
  }
  if (t < 0.7) return { k: 'neg', a: randCalc(depth - 1) };
  const name = pick(['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt', 'atan', 'asin', 'acos']);
  if (name === 'asin' || name === 'acos') {
    return { k: 'fn', name, a: { k: 'bin', op: '*', a: { k: 'num', v: pick([0.3, 0.5, 0.8, 1]) }, b: { k: 'var' } } };
  }
  return { k: 'fn', name, a: randCalc(depth - 1) };
}

// ---------------------------------------------------------------- calculus-syntax rendering
// The calculus module uses "log" = natural log; we only emit ln. Everything is fully parenthesised
// except implicit-free binary operators, which exercises its own precedence handling too.
function renderCalcMinimal(n) { return renderCalc(n, true, false); }

// ---------------------------------------------------------------- 1. arithmetic cases
const arithmetic = [];
for (let i = 0; i < N_ARITH; i++) {
  const depth = 1 + Math.floor(rnd() * 4);
  const tree = randArith(depth);
  const deg = rnd() < 0.5;
  const minimal = rnd() < 0.6;
  const unicode = rnd() < 0.5;
  const text = renderCalc(tree, minimal, unicode);
  let ours;
  try {
    ours = Calc.formatNumber(Calc.evaluateExpression(text, deg));
  } catch (e) {
    ours = null; // our parser reported an error
  }
  arithmetic.push({ text, py: renderPy(tree), deg, minimal, ours, kind: 'random trees' });
}

const evalOurs = (text, deg) => {
  try { return Calc.formatNumber(Calc.evaluateExpression(text, deg)); } catch (e) { return null; }
};

// Precedence stress: flat, unparenthesised chains exactly as a user would type them ("2^3^2",
// "-2^2", "8/2/2", "2^-1"). The reference here is Python's *own parser* (** is right-associative
// and binds tighter than a unary minus on its left), so this checks our grammar against an
// independent implementation of the same conventions rather than against a tree we built.
function flatChain() {
  const n = 2 + Math.floor(rnd() * 3);
  const ops = ['+', '-', '*', '/', '^', '^', '-', '/'];
  let calc = '', py = '';
  const sp = rnd() < 0.5 ? ' ' : '';
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const op = pick(ops);
      calc += sp + { '+': '+', '-': rnd() < 0.5 ? '−' : '-', '*': rnd() < 0.5 ? '×' : '*', '/': rnd() < 0.5 ? '÷' : '/', '^': '^' }[op] + sp;
      py += op === '^' ? '**' : op;
    }
    const neg = rnd() < 0.3;
    const v = Math.floor(between(1, 10));
    calc += (neg ? (rnd() < 0.5 ? '−' : '-') : '') + v;
    py += (neg ? '-' : '') + v + '.0';
  }
  return { calc, py };
}
for (let i = 0; i < Math.floor(N_ARITH * 0.2); i++) {
  const { calc, py } = flatChain();
  const deg = rnd() < 0.5;
  arithmetic.push({ text: calc, py, deg, minimal: true, ours: evalOurs(calc, deg), kind: 'precedence chains' });
}

// Special angles and edge values: exact multiples of 15 degrees (includes tan(90), tan(270)),
// multiples of pi/2 in radians, inverse-trig endpoints and domain violations, factorial limits,
// and overflow/underflow. Random numbers essentially never land on these.
const special = [];
for (let k = -24; k <= 24; k++) for (const f of ['sin', 'cos', 'tan']) {
  special.push({ text: `${f}(${k * 15})`, py: `${f.toUpperCase()}(${k * 15}.0)`, deg: true });
  special.push({ text: `${f}(${k}×π÷2)`, py: `${f.toUpperCase()}(${k}.0*PI/2.0)`, deg: false });
}
for (const f of ['asin', 'acos', 'atan']) for (const v of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
  special.push({ text: `${f}(${v})`, py: `${f.toUpperCase()}(${v.toFixed(1)})`, deg: true });
  special.push({ text: `${f}(${v})`, py: `${f.toUpperCase()}(${v.toFixed(1)})`, deg: false });
}
for (const n of [0, 1, 2, 5, 12, 20, 25, 170]) special.push({ text: `${n}!`, py: `FACT(${n}.0)`, deg: true });
const EDGE = [
  ['0^0', 'POW(0.0,0.0)'], ['0^−1', 'POW(0.0,-1.0)'], ['(−8)^(1÷3)', 'POW(-8.0,(1.0/3.0))'], ['(−8)^2', 'POW(-8.0,2.0)'],
  ['10^400', 'POW(10.0,400.0)'], ['1÷(10^400)', '(1.0/POW(10.0,400.0))'], ['exp(710)', 'EXP(710.0)'], ['exp(−800)', 'EXP(-800.0)'],
  ['ln(1)', 'LN(1.0)'], ['ln(0)', 'LN(0.0)'], ['log(1000)', 'LOG(1000.0)'], ['log(−1)', 'LOG(-1.0)'], ['√(0)', 'SQRT(0.0)'],
  ['√(−4)', 'SQRT(-4.0)'], ['³√(−27)', 'CBRT(-27.0)'], ['abs(−0)', 'ABS(-0.0)'], ['7 mod 3', 'FMOD(7.0,3.0)'],
  ['−7 mod 3', 'FMOD((-7.0),3.0)'], ['7 mod −3', 'FMOD(7.0,(-3.0))'], ['5 mod 0', 'FMOD(5.0,0.0)'], ['50%', '(50.0/100.0)'],
  ['200%%', '((200.0/100.0)/100.0)'], ['1÷0', '(1.0/0.0)'], ['0÷0', '(0.0/0.0)'], ['1e308×10', '(1e308*10.0)'],
  ['6.62607015e-34×2', '(6.62607015e-34*2.0)'], ['1e-320', '1e-320'], ['2π', '(2.0*PI)'], ['3(4+5)', '(3.0*(4.0+5.0))'],
];
for (const [text, py] of EDGE) for (const deg of [true, false]) special.push({ text, py, deg });
for (const s of special) arithmetic.push({ ...s, minimal: true, ours: evalOurs(s.text, s.deg), kind: 'special angles and edge values' });

// ---------------------------------------------------------------- 2. derivative cases
const XS = [0.3, 0.55, 0.9, 1.4];
const derivative = [];
for (let i = 0; i < N_DERIV; i++) {
  const tree = randCalc(1 + Math.floor(rnd() * 3));
  const text = renderCalcMinimal(tree);
  // values: evaluated from the exact tree (what the app computes).
  // printedValues: re-parsed from the printed 12-digit text (what a user gets by copy-pasting it).
  let sym = null, values = null, printedValues = null, error = null;
  try {
    const r = Calculus.symbolicDerivative(text);
    sym = r.symbolic;
    const f = Calculus.compileAST(r.ast);
    values = XS.map((x) => f(x));
    const g = Calculus.makeFunction(sym);
    printedValues = XS.map((x) => g(x));
  } catch (e) { error = e.message; }
  derivative.push({ text, py: renderPy(tree), xs: XS, sym, values, printedValues, error });
}

// ---------------------------------------------------------------- 3. integral cases
// One family per integration method. Every integrand is built so it is finite and smooth on
// [LO, HI] (no poles, no sqrt of a negative), because the Python reference is numerical
// quadrature and would silently return garbage across a singularity.
const LO = 0.5, HI = 2.5;
const NUM = (v) => ({ k: 'num', v });
const XV = { k: 'var' };
const BIN = (op, a, b) => ({ k: 'bin', op, a, b });
const FN = (name, a) => ({ k: 'fn', name, a });
const PW = (a, n) => BIN('^', a, NUM(n));
const TIMES = (c, t) => (c === 1 ? t : BIN('*', NUM(c), t));
const rr = (lo, hi, dp = 2) => round(between(lo, hi), dp);
const sgn = () => pick([1, -1]);
const xPlus = (a) => (a >= 0 ? BIN('+', XV, NUM(a)) : BIN('-', XV, NUM(-a)));   // x + a
const lin = (a, b) => argTree(a, b);                                              // a*x + b (a may be negative)
const polyTree = (c0, c1, c2) => BIN('+', BIN('+', TIMES(c2, PW(XV, 2)), TIMES(c1, XV)), NUM(c0));
const RAND_C = () => pick([1, 2, 3, 0.5, 4, 1.5]) * pick([1, 1, -1]);
// roots of a denominator, kept outside [LO, HI]
const rootOutside = () => (rnd() < 0.5 ? rr(-4, 0.2, 1) : rr(2.8, 6, 1));

// a*x + b with a*x + b >= minVal on [LO, HI]
function linearArg(minVal) {
  const a = pick([-1, 1]) * round(between(0.3, 2.5), 2);
  const lowest = Math.min(a * LO, a * HI);
  const b = round(minVal - lowest + between(0, 1.5), 2);
  return { a, b, signedA: a };
}
function argTree(a, b) {
  const ax = { k: 'bin', op: '*', a: { k: 'num', v: Math.abs(a) }, b: { k: 'var' } };
  const lhs = a < 0 ? { k: 'neg', a: ax } : ax;
  return { k: 'bin', op: '+', a: lhs, b: { k: 'num', v: b } };
}
function randIntegrableTerm() {
  const c = pick([1, 2, 3, 0.5, 4]) * pick([1, 1, -1]);
  const t = rnd();
  const mk = (core) => (c === 1 ? core : { k: 'bin', op: '*', a: { k: 'num', v: c }, b: core });
  const lin = linearArg(0.4);
  const arg = argTree(lin.signedA, lin.b);
  if (t < 0.18) return mk({ k: 'bin', op: '^', a: arg, b: { k: 'num', v: pick([-3, -2, -1, 0.5, 2, 3, 1.5]) } });
  if (t < 0.34) return mk({ k: 'fn', name: 'sin', a: arg });
  if (t < 0.5) return mk({ k: 'fn', name: 'cos', a: arg });
  if (t < 0.62) return mk({ k: 'fn', name: 'exp', a: { k: 'bin', op: '*', a: { k: 'num', v: pick([0.3, 0.5, 1, 2]) * pick([1, -1]) }, b: { k: 'var' } } });
  if (t < 0.72) return mk({ k: 'fn', name: 'sqrt', a: arg });
  if (t < 0.8) return mk({ k: 'bin', op: '/', a: { k: 'num', v: 1 }, b: arg });
  if (t < 0.86) return mk({ k: 'fn', name: 'ln', a: { k: 'var' } });
  if (t < 0.92) {
    const small = { k: 'bin', op: '+', a: { k: 'bin', op: '*', a: { k: 'num', v: round(between(0.1, 0.5), 2) }, b: { k: 'var' } }, b: { k: 'num', v: round(between(-0.2, 0.2), 2) } };
    return mk({ k: 'fn', name: 'tan', a: small });
  }
  return mk({ k: 'bin', op: '^', a: { k: 'var' }, b: { k: 'num', v: pick([2, 3, 4, 5]) } });
}

function legacyBasic() {
  let tree = randIntegrableTerm();
  const extra = Math.floor(rnd() * 3);
  for (let j = 0; j < extra; j++) tree = BIN(pick(['+', '-']), tree, randIntegrableTerm());
  return tree;
}
const FAMILIES = {
  'basic rules': legacyBasic,
  'polynomial products': () => pick([
    () => BIN('*', xPlus(rr(-3, 3, 1)), xPlus(rr(-3, 3, 1))),
    () => BIN('*', XV, PW(xPlus(rr(-3, 3, 1)), 2)),
    () => BIN('*', lin(sgn() * rr(0.5, 3, 1), rr(-2, 2, 1)), polyTree(rr(-3, 3, 1), rr(-3, 3, 1), 1)),
    () => BIN('*', PW(xPlus(rr(-2, 2, 1)), 2), xPlus(rr(-2, 2, 1))),
  ])(),
  'trig powers': () => pick([
    () => { const n = pick([2, 3, 4]); return PW(FN(pick(['sin', 'cos']), lin(sgn() * rr(0.4, 2.5), rr(-1, 1, 1))), n); },
    () => PW(FN('tan', lin(rr(0.1, 0.4), rr(-0.1, 0.2))), pick([2, 3])),
    () => BIN('/', NUM(1), PW(FN('cos', lin(rr(0.1, 0.4), rr(-0.1, 0.2))), 2)),
    () => BIN('/', NUM(1), PW(FN('sin', lin(rr(0.2, 1.0), rr(0.1, 0.5))), 2)),
    () => BIN('/', NUM(1), FN('cos', lin(rr(0.1, 0.4), rr(-0.1, 0.2)))),
    () => BIN('/', NUM(1), FN('sin', lin(rr(0.2, 1.0), rr(0.1, 0.5)))),
  ])(),
  'trig products': () => pick([
    () => BIN('*', FN('sin', lin(rr(0.5, 3, 1), 0)), FN('cos', lin(rr(0.5, 3, 1), 0))),
    () => BIN('*', FN('sin', lin(rr(0.5, 3, 1), 0)), FN('sin', lin(rr(0.5, 3, 1), 0))),
    () => BIN('*', FN('cos', lin(rr(0.5, 3, 1), 0)), FN('cos', lin(rr(0.5, 3, 1), 0))),
    () => { const a = rr(0.5, 2, 1); return BIN('*', FN('sin', lin(a, 0)), FN('cos', lin(a, 0))); },
    () => { const a = rr(0.5, 2, 1); return BIN('*', PW(FN('sin', lin(a, 0)), 2), PW(FN('cos', lin(a, 0)), pick([2, 4]))); },
    // odd power of one factor (rewritten with sin² + cos² = 1, then substituted)
    () => { const a = rr(0.5, 2, 1); return BIN('*', PW(FN('sin', lin(a, 0)), pick([3, 5])), PW(FN('cos', lin(a, 0)), pick([2, 4]))); },
    () => { const a = rr(0.5, 2, 1); return BIN('*', PW(FN('sin', lin(a, 0)), pick([2, 4])), PW(FN('cos', lin(a, 0)), pick([3, 5]))); },
  ])(),
  'exponential x trig': () => BIN('*',
    FN('exp', lin(sgn() * rr(0.2, 1.5), rr(-1, 1, 1))),
    FN(pick(['sin', 'cos']), lin(sgn() * rr(0.3, 3), rr(-1, 1, 1)))),
  'by parts': () => pick([
    () => BIN('*', PW(XV, pick([1, 2, 3])), FN('exp', lin(sgn() * rr(0.3, 2), 0))),
    () => BIN('*', PW(XV, pick([1, 2, 3])), FN(pick(['sin', 'cos']), lin(rr(0.4, 3), 0))),
    () => BIN('*', PW(XV, pick([0, 1, 2, 3, 0.5, 1.5])), FN('ln', XV)),
    () => PW(FN('ln', XV), pick([2, 3])),
    () => FN('ln', argTree(...(() => { const L = linearArg(0.4); return [L.signedA, L.b]; })())),
    () => FN('atan', lin(sgn() * rr(0.3, 3), 0)),
    () => BIN('*', XV, FN('atan', lin(rr(0.3, 3), 0))),
    () => FN(pick(['asin', 'acos']), lin(sgn() * rr(0.1, 0.35), 0)),
    () => BIN('*', XV, FN(pick(['asin', 'acos']), lin(rr(0.1, 0.35), 0))),
    () => BIN('*', BIN('*', NUM(rr(0.5, 4, 1)), PW(XV, 2)), FN('exp', XV)),
  ])(),
  'u-substitution': () => pick([
    () => BIN('*', XV, FN('exp', TIMES(sgn() * rr(0.3, 1.5), PW(XV, 2)))),
    () => BIN('*', PW(XV, 2), FN('cos', TIMES(rr(0.3, 1.5), PW(XV, 3)))),
    () => BIN('*', XV, FN('sin', BIN('+', PW(XV, 2), NUM(rr(0.1, 3, 1))))),
    () => BIN('*', FN('cos', XV), PW(FN('sin', XV), pick([2, 3, 4]))),
    () => BIN('*', FN('sin', XV), PW(FN('cos', XV), pick([2, 3, 4]))),
    () => BIN('*', FN('sin', XV), FN('exp', FN('cos', XV))),
    () => BIN('*', XV, FN('sqrt', BIN('+', PW(XV, 2), NUM(rr(0.5, 4, 1))))),
    () => BIN('*', PW(XV, 2), FN('sqrt', BIN('+', PW(XV, 3), NUM(rr(0.5, 4, 1))))),
    () => BIN('/', FN('ln', XV), XV),
    () => BIN('/', PW(FN('ln', XV), 2), XV),
    () => BIN('/', FN('exp', XV), BIN('+', NUM(1), FN('exp', XV))),
    () => BIN('*', PW(XV, 2), PW(BIN('+', PW(XV, 3), NUM(rr(0.5, 4, 1))), pick([2, 3, -2]))),
    () => BIN('/', NUM(1), BIN('*', XV, BIN('+', FN('ln', XV), NUM(1.5)))),
    () => BIN('/', FN('cos', XV), BIN('+', NUM(1), PW(FN('sin', XV), 2))),
  ])(),
  'rational functions': () => pick([
    () => BIN('/', NUM(1), BIN('+', PW(XV, 2), NUM(rr(0.5, 9, 1)))),
    () => BIN('/', lin(rr(0.5, 3, 1), rr(-3, 3, 1)), polyTree(rr(1.5, 6, 1), rr(-1.5, 1.5, 1), 1)),
    () => BIN('/', NUM(1), BIN('*', xPlus(-rootOutside()), xPlus(-rootOutside()))),
    () => BIN('/', lin(rr(0.5, 3, 1), rr(-3, 3, 1)), BIN('*', xPlus(-rootOutside()), xPlus(-rootOutside()))),
    () => BIN('/', polyTree(rr(-3, 3, 1), rr(-2, 2, 1), 1), xPlus(-rootOutside())),     // needs long division
    () => BIN('/', NUM(1), BIN('*', BIN('*', xPlus(-rootOutside()), xPlus(-rootOutside())), xPlus(-rootOutside()))),
    () => BIN('/', NUM(1), PW(xPlus(-rootOutside()), 2)),
    () => BIN('/', XV, BIN('+', PW(XV, 2), NUM(rr(0.5, 5, 1)))),
    // repeated factors
    () => BIN('/', NUM(1), PW(BIN('+', PW(XV, 2), NUM(rr(0.5, 5, 1))), pick([2, 3]))),
    () => BIN('/', lin(rr(0.5, 3, 1), rr(-3, 3, 1)), PW(polyTree(rr(1.5, 6, 1), rr(-1.5, 1.5, 1), 1), 2)),
    () => BIN('/', NUM(1), BIN('*', PW(xPlus(-rootOutside()), 2), xPlus(-rootOutside()))),
    // expanded denominators with mixed real and complex roots (factored numerically)
    () => BIN('/', polyTree(rr(-2, 2, 1), rr(-2, 2, 1), 1), BIN('+', PW(XV, 3), NUM(rr(0.5, 8, 1)))),
    () => BIN('/', NUM(1), BIN('+', PW(XV, 4), NUM(rr(0.5, 20, 1)))),
    () => BIN('/', PW(XV, 2), BIN('-', PW(XV, 4), NUM(rr(50, 300, 0)))),
  ])(),
  'root and exponential substitutions': () => pick([
    () => BIN('/', FN('sqrt', XV), BIN('+', XV, NUM(rr(1, 5, 1)))),
    () => BIN('/', NUM(1), BIN('+', NUM(1), FN('sqrt', XV))),
    () => BIN('/', BIN('^', XV, BIN('/', NUM(1), NUM(3))), BIN('+', NUM(1), BIN('^', XV, BIN('/', NUM(2), NUM(3))))),
    () => BIN('*', BIN('/', NUM(1), FN('sqrt', XV)), FN('exp', FN('sqrt', XV))),
    () => BIN('/', FN('exp', XV), BIN('+', NUM(1), FN('exp', TIMES(2, XV)))),
    () => BIN('/', FN('exp', TIMES(2, XV)), BIN('+', NUM(1), FN('exp', XV))),
    () => BIN('/', NUM(1), BIN('+', FN('exp', XV), FN('exp', { k: 'neg', a: XV }))),
    () => BIN('/', FN('exp', XV), BIN('+', FN('exp', XV), NUM(rr(1, 4, 1)))),
    () => BIN('/', NUM(1), BIN('+', NUM(1), FN('exp', { k: 'neg', a: XV }))),
    () => BIN('*', PW(XV, 3), FN('exp', TIMES(rr(0.05, 0.2), PW(XV, 4)))),   // gentle: e^(c·x⁴) stays below ~10³ on [0.5, 2.5]
    () => BIN('/', XV, BIN('+', PW(XV, 4), NUM(rr(0.5, 5, 1)))),
  ])(),
  'radicals of a quadratic': () => {
    const num = pick(['1', 'x', 'x2', 'lin']);
    const mode = pick(['neg', 'pos', 'pos2']);
    let Q;
    if (mode === 'neg') {                      // C - A(x-h)^2 > 0 on the interval
      const h = rr(-1, 2, 1), A = rr(0.3, 2, 1);
      const M = Math.max(Math.abs(LO - h), Math.abs(HI - h));
      const C = round(A * M * M + rr(0.5, 3, 1), 3);
      Q = polyTree(round(C - A * h * h, 3), round(2 * A * h, 3), -A);   // C - A(x-h)^2, positive on [LO, HI]
    } else if (mode === 'pos') {
      Q = polyTree(rr(0.5, 5, 1), 0, 1);
    } else {
      const p = rr(-3, 3, 1);
      Q = polyTree(round(p * p / 4 + rr(0.5, 3, 1), 3), p, 1);
    }
    const root = FN('sqrt', Q);
    const numer = { '1': null, x: XV, x2: PW(XV, 2), lin: lin(rr(0.5, 3, 1), rr(-2, 2, 1)) }[num];
    return pick([
      () => (numer ? BIN('/', numer, root) : BIN('/', NUM(1), root)),
      () => (numer ? BIN('*', numer, root) : root),
    ])();
  },
};
// Outside the methods on purpose: must be declined (or, if answered, verified correct).
const OUT_OF_SCOPE = [
  { text: 'exp(x^2)', py: 'EXP(POW(x,2.0))' },
  { text: 'sin(x)/x', py: '(SIN(x)/x)' },
  { text: 'x^x', py: 'POW(x,x)' },
  { text: 'exp(x)/x', py: '(EXP(x)/x)' },
  { text: 'sqrt(sin(x))', py: 'SQRT(SIN(x))' },
  { text: '1/ln(x+1)', py: '(1.0/LN((x+1.0)))' },
  { text: 'sin(x^2)', py: 'SIN(POW(x,2.0))' },
  { text: 'cos(x)/x', py: '(COS(x)/x)' },
  { text: 'exp(sin(x))', py: 'EXP(SIN(x))' },
  { text: 'x/(1+exp(x))', py: '(x/(1.0+EXP(x)))' },
  { text: 'sqrt(1+x^3)', py: 'SQRT((1.0+POW(x,3.0)))' },
  { text: 'atan(x)/x', py: '(ATAN(x)/x)' },
];

// Hand-picked textbook integrals, chosen WITHOUT regard to what the methods can do: some are
// routine, some need techniques the engine does not have (repeated roots, mixed real/complex
// roots, substitutions that are not of the form f(g)·g'). Coverage here is informational and
// honest; the pass/fail question is only "is every answer it does give correct?".
// All are smooth on [0.5, 2.5]. Python source is derived mechanically from the same text.
const TEXTBOOK = [
  'x*exp(-x^2)', 'exp(x)/(1+exp(2*x))', 'x^2/(x^2+1)', 'x^3/(x^2+1)', 'x^2/(x^2+1)^2', '1/(x*(x+1)^2)',
  '1/(x^2*(x+1))', 'ln(x)^2/x', 'sin(x)^2*cos(x)', 'sin(x)^3*cos(x)^2', 'x*sqrt(x+1)', 'x/sqrt(x+1)',
  'sqrt(x)/(1+x)', 'exp(sqrt(x))', 'x*exp(x)*sin(x)', 'exp(x)*cos(x)^2', 'sin(x)*cos(2*x)', 'atan(x)^2',
  'ln(1+x^2)', 'x*ln(1+x^2)', 'sqrt(1+x^2)/x', 'sin(x)/(1+cos(x)^2)', 'exp(2*x)/(1+exp(x))', 'x^2*atan(x)',
  'cos(sqrt(x))', 'x*cos(x)^2', 'x*sin(x)^2', 'exp(x)*(x^2+1)', '1/(1+exp(x))', '(x+1)/(x^2+2*x+5)',
  'x^2*exp(-x)', 'sin(x)*cos(x)^2', 'sqrt(x)*exp(sqrt(x))', 'ln(x)*sin(x)', 'x/(x^4+1)', 'x^3/(x^4+1)',
  '1/(x^3+1)', '1/(x^4-81)', 'sin(x)^4', 'exp(x)*sin(x)^2', '1/(exp(x)+exp(-x))', 'x*atan(x^2)',
  'ln(x)/(1+x)^2', 'x*exp(x)/(1+x)^2', 'sin(x)^2/x', 'x^2*sqrt(x^2+4)', '(x^2+1)/(x^4+1)', 'exp(-x)*cos(2*x)',
  'x/(x^2+1)^2', '1/(x^2+1)^2',
];
const textbookPy = (t) => t
  .replace(/\b(sin|cos|tan|asin|acos|atan|exp|sqrt)\(/g, (_, f) => f.toUpperCase() + '(')
  .replace(/\bln\(/g, 'LN(')
  .replace(/\^/g, '**')
  .replace(/(?<![\w.])(\d+)(?![\w.])/g, '$1.0');

const familyNames = Object.keys(FAMILIES);
const integral = [];
const totalIntegral = N_INTEG + TEXTBOOK.length;
for (let i = 0; i < totalIntegral; i++) {
  let text, py, family, scope;
  if (i >= N_INTEG) {
    text = TEXTBOOK[i - N_INTEG]; py = textbookPy(text); family = 'textbook stress set (hand-picked)'; scope = 'mixed';
  } else if (i % 12 === 11) {
    const o = OUT_OF_SCOPE[Math.floor(i / 12) % OUT_OF_SCOPE.length];
    text = o.text; py = o.py; family = 'outside the methods (must decline)'; scope = 'out';
  } else {
    family = familyNames[i % familyNames.length];
    const tree = FAMILIES[family]();
    text = renderCalcMinimal(tree); py = renderPy(tree); scope = 'in';
  }
  let sym = null, simpson = null, fromF = null, fromFPrinted = null, error = null;
  const t0 = process.hrtime.bigint();
  try {
    const r = Calculus.symbolicAntiderivative(text);
    sym = r.symbolic;
    simpson = Calculus.simpsonsRule(text, LO, HI, 1000);
    if (r.ast) {
      const F = Calculus.compileAST(r.ast); fromF = F(HI) - F(LO);
      const G = Calculus.makeFunction(sym); fromFPrinted = G(HI) - G(LO);
    }
  } catch (e) { error = e.message; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  integral.push({ text, py, scope, family, lo: LO, hi: HI, sym, simpson, fromF, fromFPrinted, error, ms });
}

const out = { seed: SEED, generatedWith: 'validation/generate.js', arithmetic, derivative, integral };
const OUT = process.env.QL_CASES || path.join(__dirname, 'cases.json');
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`seed=${SEED}: ${arithmetic.length} arithmetic, ${derivative.length} derivative, ${integral.length} integral cases -> ${path.relative(process.cwd(), OUT)}`);
