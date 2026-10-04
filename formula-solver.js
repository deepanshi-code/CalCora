// --- FORMULA SOLVER ---
// Takes an equation such as  "s = u*t + 0.5*a*t^2"  plus numeric values for every variable but one, and
// returns the value(s) of the missing variable. No eval; it has its own small parser.
//
// Two methods, in this order:
//   1. Rearrangement. If the unknown appears exactly once, the equation is inverted step by step
//      (a + b = y  ->  a = y - b, a^2 = y  ->  a = ±√y, sin a = y  ->  a = sin⁻¹ y or 180° − sin⁻¹ y ...).
//      This gives an exact, readable result AND the rearranged formula to show the student.
//   2. Numeric root finding. If the unknown appears more than once (s = ut + ½at² solved for t), the
//      residual lhs − rhs is scanned for sign changes and refined by bisection. All real roots found
//      are returned.
// Every answer is substituted back into the original equation and rejected if it does not satisfy it.
window.FormulaSolver = (() => {
  const CONSTANTS = new Set(['pi', 'e', 'halfturn']);
  const FUNCS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log10', 'log2', 'sqrt', 'cbrt', 'abs', 'exp', 'fact'];

  // ------------------------------------------------------------------ parser
  function tokenize(src) {
    const s = src
      .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt')
      .replace(/\s+/g, ' ');
    const re = /\s*(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|[-+*/^()!=,])/gy;
    const out = [];
    let m, last = 0;
    while ((m = re.exec(s)) !== null) { out.push(m[1]); last = re.lastIndex; }
    if (s.slice(last).trim() !== '') throw new Error(`Unexpected "${s.slice(last).trim()[0]}"`);
    return out;
  }

  // Grammar:  sum := term (('+'|'-') term)*   term := unary (('*'|'/') unary)*
  //           unary := '-' unary | power       power := postfix ('^' unary)?    postfix := primary '!'?
  // With opts.implicit, adjacent factors multiply ("2pi", "3(4+5)"); equations always use explicit '*'.
  function parseExpr(tokens, opts = {}) {
    let i = 0;
    const peek = () => tokens[i];
    const take = () => tokens[i++];
    const isNum = (t) => t !== undefined && /^[\d.]/.test(t);
    const isIdent = (t) => t !== undefined && /^[A-Za-z_]/.test(t);
    const startsFactor = (t) => t !== undefined && (isNum(t) || isIdent(t) || t === '(');

    const sum = () => {
      let n = term();
      while (peek() === '+' || peek() === '-') { const op = take(); n = { t: 'bin', op, a: n, b: term() }; }
      return n;
    };
    const term = () => {
      let n = unary();
      for (;;) {
        if (peek() === '*' || peek() === '/') { const op = take(); n = { t: 'bin', op, a: n, b: unary() }; }
        else if (opts.implicit && startsFactor(peek()) && !(isNum(peek()) && isNum(tokens[i - 1]))) n = { t: 'bin', op: '*', a: n, b: power() };
        else return n;
      }
    };
    const unary = () => {
      if (peek() === '-') { take(); return { t: 'neg', a: unary() }; }
      if (peek() === '+') { take(); return unary(); }
      return power();
    };
    const power = () => {
      const base = postfix();
      if (peek() === '^') { take(); return { t: 'bin', op: '^', a: base, b: unary() }; }
      return base;
    };
    const postfix = () => {
      let n = primary();
      while (peek() === '!') { take(); n = { t: 'fn', n: 'fact', a: n }; }
      return n;
    };
    const primary = () => {
      const tok = take();
      if (tok === undefined) throw new Error('Unexpected end of expression');
      if (isNum(tok)) return { t: 'num', v: Number(tok) };
      if (tok === '(') { const n = sum(); if (take() !== ')') throw new Error('Missing closing parenthesis'); return n; }
      if (isIdent(tok)) {
        if (FUNCS.includes(tok) && peek() === '(') {
          take();
          const a = sum();
          if (take() !== ')') throw new Error('Missing closing parenthesis');
          return { t: 'fn', n: tok, a };
        }
        return { t: 'sym', n: tok };
      }
      throw new Error(`Unexpected "${tok}"`);
    };
    const n = sum();
    if (i < tokens.length) throw new Error(`Unexpected "${tokens[i]}"`);
    return n;
  }

  function parseEquation(src) {
    const parts = src.split('=');
    if (parts.length !== 2) throw new Error(`Not an equation: ${src}`);
    const lhs = parseExpr(tokenize(parts[0]));
    const rhs = parseExpr(tokenize(parts[1]));
    return { src, lhs, rhs, vars: new Set([...symbolsOf(lhs), ...symbolsOf(rhs)]) };
  }

  // A number typed by the user: "12", "1e-7", "2*pi", "3/4", "sqrt(2)".
  function parseNumber(text) {
    const trimmed = String(text).trim();
    if (trimmed === '') throw new Error('Enter a value');
    const ast = parseExpr(tokenize(trimmed), { implicit: true });
    if (symbolsOf(ast).size) throw new Error('Use numbers only (pi and e are allowed)');
    const v = evaluate(ast, {}, true);
    if (!Number.isFinite(v)) throw new Error('Not a valid number');
    return v;
  }

  // ------------------------------------------------------------------ tree helpers
  function symbolsOf(n, out = new Set()) {
    switch (n.t) {
      case 'sym': if (!CONSTANTS.has(n.n)) out.add(n.n); break;
      case 'neg': case 'fn': symbolsOf(n.a, out); break;
      case 'bin': symbolsOf(n.a, out); symbolsOf(n.b, out); break;
    }
    return out;
  }
  function countOf(n, v) {
    switch (n.t) {
      case 'sym': return n.n === v ? 1 : 0;
      case 'neg': case 'fn': return countOf(n.a, v);
      case 'bin': return countOf(n.a, v) + countOf(n.b, v);
    }
    return 0;
  }
  const N = (v) => ({ t: 'num', v });
  const S = (n) => ({ t: 'sym', n });
  const F = (n, a) => ({ t: 'fn', n, a });
  const NEG = (a) => (a.t === 'neg' ? a.a : { t: 'neg', a });
  const isNum = (n, v) => n.t === 'num' && n.v === v;
  // Builds a node, skipping pointless operations (0 − y, y·1, y/1, y^1) so rearranged formulas read cleanly.
  const B = (op, a, b) => {
    if (op === '+' && isNum(a, 0)) return b;
    if (op === '+' && isNum(b, 0)) return a;
    if (op === '-' && isNum(b, 0)) return a;
    if (op === '-' && isNum(a, 0)) return NEG(b);
    if (op === '*' && (isNum(a, 1))) return b;
    if (op === '*' && (isNum(b, 1))) return a;
    if (op === '/' && isNum(b, 1)) return a;
    if (op === '^' && isNum(b, 1)) return a;
    return { t: 'bin', op, a, b };
  };

  // ------------------------------------------------------------------ evaluation
  const realPow = (a, b) => {
    if (a < 0 && Number.isFinite(b) && !Number.isInteger(b)) {
      const r = 1 / b;                                  // odd roots of negatives are real: (-8)^(1/3) = -2
      if (Number.isInteger(r) && Math.abs(r) % 2 === 1) return -Math.pow(-a, b);
      return NaN;
    }
    return Math.pow(a, b);
  };
  const snap = (v, arg) => (Math.abs(v) < 2.3e-16 * Math.abs(arg) ? 0 : v);   // sin(180°) = 0, not 1.2e-16

  function evaluate(n, env, deg) {
    const ev = (m) => evaluate(m, env, deg);
    switch (n.t) {
      case 'num': return n.v;
      case 'sym':
        if (Object.prototype.hasOwnProperty.call(env, n.n)) return env[n.n];
        if (n.n === 'pi') return Math.PI;
        if (n.n === 'e') return Math.E;
        if (n.n === 'halfturn') return deg ? 180 : Math.PI;
        throw new Error(`No value for ${n.n}`);
      case 'neg': return -ev(n.a);
      case 'bin': {
        const a = ev(n.a), b = ev(n.b);
        switch (n.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return a / b;
          case '^': return realPow(a, b);
        }
        break;
      }
      case 'fn': {
        const x = ev(n.a);
        const toRad = (v) => (deg ? (v * Math.PI) / 180 : v);
        const fromRad = (v) => (deg ? (v * 180) / Math.PI : v);
        switch (n.n) {
          case 'sin': return snap(Math.sin(toRad(x)), toRad(x));
          case 'cos': return snap(Math.cos(toRad(x)), toRad(x));
          case 'tan': return deg && Math.abs(x % 180) === 90 ? NaN : snap(Math.tan(toRad(x)), toRad(x));
          case 'asin': return x < -1 || x > 1 ? NaN : fromRad(Math.asin(x));
          case 'acos': return x < -1 || x > 1 ? NaN : fromRad(Math.acos(x));
          case 'atan': return fromRad(Math.atan(x));
          case 'ln': return x > 0 ? Math.log(x) : NaN;
          case 'log10': return x > 0 ? Math.log10(x) : NaN;
          case 'log2': return x > 0 ? Math.log2(x) : NaN;
          case 'sqrt': return x >= 0 ? Math.sqrt(x) : NaN;
          case 'cbrt': return Math.cbrt(x);
          case 'abs': return Math.abs(x);
          case 'exp': return Math.exp(x);
          case 'fact': {
            if (!Number.isInteger(x) || x < 0 || x > 170) return NaN;
            let r = 1;
            for (let k = 2; k <= x; k++) r *= k;
            return r;
          }
        }
      }
    }
    throw new Error('Cannot evaluate');
  }

  // ------------------------------------------------------------------ method 1: rearrangement
  // Returns the list of expressions the unknown can equal, or null if it cannot be isolated.
  function isolate(eq, v) {
    const inL = countOf(eq.lhs, v), inR = countOf(eq.rhs, v);
    if (inL + inR !== 1) return null;
    return inv(inL ? eq.lhs : eq.rhs, inL ? eq.rhs : eq.lhs, v);
  }

  function inv(n, y, v) {
    const merge = (lists) => (lists.some((l) => l === null) ? null : lists.flat());
    switch (n.t) {
      case 'sym': return [y];
      case 'neg': return inv(n.a, NEG(y), v);
      case 'bin': {
        const inA = countOf(n.a, v) > 0;
        const x = inA ? n.a : n.b, o = inA ? n.b : n.a;
        switch (n.op) {
          case '+': return inv(x, B('-', y, o), v);
          case '-': return inA ? inv(x, B('+', y, o), v) : inv(x, B('-', o, y), v);
          case '*': return inv(x, B('/', y, o), v);
          case '/': return inA ? inv(x, B('*', y, o), v) : inv(x, B('/', o, y), v);
          case '^':
            if (!inA) return inv(x, B('/', F('ln', y), F('ln', o)), v);            // base^x = y
            if (o.t === 'num') {                                                    // x^n = y
              const root = B('^', y, N(1 / o.v));
              return Number.isInteger(o.v) && o.v % 2 === 0
                ? merge([inv(x, root, v), inv(x, NEG(root), v)])                    // even power: ± root
                : inv(x, root, v);
            }
            return inv(x, B('^', y, B('/', N(1), o)), v);
        }
        return null;
      }
      case 'fn': {
        const a = n.a;
        switch (n.n) {
          case 'sin': return merge([inv(a, F('asin', y), v), inv(a, B('-', S('halfturn'), F('asin', y)), v)]);
          case 'cos': return inv(a, F('acos', y), v);
          case 'tan': return inv(a, F('atan', y), v);
          case 'asin': return inv(a, F('sin', y), v);
          case 'acos': return inv(a, F('cos', y), v);
          case 'atan': return inv(a, F('tan', y), v);
          case 'ln': return inv(a, F('exp', y), v);
          case 'log10': return inv(a, B('^', N(10), y), v);
          case 'log2': return inv(a, B('^', N(2), y), v);
          case 'exp': return inv(a, F('ln', y), v);
          case 'sqrt': return inv(a, B('^', y, N(2)), v);
          case 'cbrt': return inv(a, B('^', y, N(3)), v);
          case 'abs': return merge([inv(a, y, v), inv(a, NEG(y), v)]);
          default: return null;                                                     // factorial is not invertible
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ method 2: numeric roots
  function numericRoots(eq, v, env, deg, bounds) {
    const g = (x) => {
      const e = { ...env, [v]: x };
      const l = evaluate(eq.lhs, e, deg), r = evaluate(eq.rhs, e, deg);
      return { d: l - r, s: Math.abs(l) + Math.abs(r) };
    };
    const lo = Math.max(bounds.min, -1e9), hi = Math.min(bounds.max, 1e9);
    const safe = (x) => { try { return g(x); } catch (e) { return { d: NaN, s: NaN }; } };
    const xs = new Set([]);
    const add = (x) => { if (x >= lo && x <= hi && Number.isFinite(x)) xs.add(x); };
    add(0);
    for (let k = -128; k <= 144; k++) { const m = Math.pow(10, k / 16); add(m); add(-m); }   // 1e-8 .. 1e9 (about 15% steps), both signs
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi - lo <= 1e4) {
      for (let k = 0; k <= 720; k++) add(lo + ((hi - lo) * k) / 720);                          // bounded: dense linear grid too
    }
    add(lo); add(hi);
    let pts = [...xs].sort((a, b) => a - b);
    let vals = pts.map(safe);

    // Where is the equation defined at all? (Heron's formula only makes sense for |b−c| < a < b+c.)
    // Find the edges of each defined stretch and sample it densely, including right next to the edges.
    const edge = (bad, good) => { for (let it = 0; it < 80; it++) { const m = (bad + good) / 2; if (Number.isFinite(safe(m).d)) good = m; else bad = m; } return good; };
    const extra = new Set();
    for (let i = 0; i < pts.length;) {
      if (!Number.isFinite(vals[i].d)) { i++; continue; }
      let j = i;
      while (j + 1 < pts.length && Number.isFinite(vals[j + 1].d)) j++;
      const left = i > 0 ? edge(pts[i - 1], pts[i]) : pts[i];
      const right = j + 1 < pts.length ? edge(pts[j + 1], pts[j]) : pts[j];
      if (right > left && (i > 0 || j + 1 < pts.length)) {
        if (right - left <= 1e6) for (let k = 0; k <= 800; k++) extra.add(left + ((right - left) * k) / 800);
        // next to a hole or edge (a 0/0 at r = 1, a square root starting at 0), where roots like to hide
        for (let k = -40; k <= 24; k++) {
          const d = Math.pow(10, k / 4);
          if (i > 0) extra.add(left + d);
          if (j + 1 < pts.length) extra.add(right - d);
        }
      }
      i = j + 1;
    }
    if (extra.size) {
      extra.forEach((x) => add(x));
      pts = [...xs].sort((a, b) => a - b);
      vals = pts.map(safe);
    }
    const ok = (r) => { const q = g(r); return Math.abs(q.d) <= 1e-9 * q.s + 1e-12; };
    const roots = [];
    const push = (r) => { if (Number.isFinite(r) && !roots.some((q) => Math.abs(q - r) <= 1e-9 * Math.max(1, Math.abs(r)))) roots.push(r); };

    for (let i = 0; i < pts.length - 1; i++) {
      const a = vals[i], b = vals[i + 1];
      if (!Number.isFinite(a.d) || !Number.isFinite(b.d)) continue;
      if (a.d === 0) { push(pts[i]); continue; }
      if (a.d * b.d < 0) {                                     // sign change: bisect, then verify (a pole also flips the sign)
        let x0 = pts[i], x1 = pts[i + 1], f0 = a.d;
        for (let it = 0; it < 200; it++) {
          const m = (x0 + x1) / 2, fm = g(m).d;
          if (fm === 0) { x0 = x1 = m; break; }
          if (f0 * fm < 0) x1 = m; else { x0 = m; f0 = fm; }
        }
        const r = (x0 + x1) / 2;
        if (ok(r)) push(r);
      }
    }
    // a root where the curve only touches zero (double root, e.g. discriminant = 0): look for local minima of |g|
    for (let i = 1; i < pts.length - 1; i++) {
      const p = vals[i - 1], c = vals[i], n = vals[i + 1];
      if (![p, c, n].every((q) => Number.isFinite(q.d))) continue;
      if (Math.abs(c.d) < Math.abs(p.d) && Math.abs(c.d) < Math.abs(n.d) && p.d * c.d >= 0 && c.d * n.d >= 0) {
        let a = pts[i - 1], b = pts[i + 1];
        const phi = (Math.sqrt(5) - 1) / 2;
        for (let it = 0; it < 200 && b - a > 1e-15 * Math.max(1, Math.abs(a)); it++) {
          const c1 = b - phi * (b - a), c2 = a + phi * (b - a);
          if (Math.abs(g(c1).d) < Math.abs(g(c2).d)) b = c2; else a = c1;
        }
        const r = (a + b) / 2;
        if (ok(r)) push(r);
      }
    }
    return roots.sort((a, b) => a - b);
  }

  // ------------------------------------------------------------------ solving one equation
  const defaultBounds = (meta) => ({ min: meta && Number.isFinite(meta.min) ? meta.min : -Infinity, max: meta && Number.isFinite(meta.max) ? meta.max : Infinity });

  function solveEquation(eq, v, env, deg, meta) {
    // An angle with no stated limits is searched over one full turn (0 to 360° or 0 to 2π). Limits written
    // in degrees (a triangle angle is 0..180) are converted when the dialog is in radians.
    const bounds = defaultBounds(meta);
    if (meta && meta.angle) {
      const k = deg ? 1 : Math.PI / 180;
      bounds.min = (Number.isFinite(meta.min) ? meta.min : 0) * k;
      bounds.max = (Number.isFinite(meta.max) ? meta.max : 360) * k;
    }
    const accept = (x) => {
      if (!Number.isFinite(x) || x < bounds.min - 1e-12 || x > bounds.max + 1e-12) return false;
      try {                                                                       // substitute back
        const e = { ...env, [v]: x };
        const l = evaluate(eq.lhs, e, deg), r = evaluate(eq.rhs, e, deg);
        return Math.abs(l - r) <= 1e-7 * (Math.abs(l) + Math.abs(r)) + 1e-9;
      } catch (err) { return false; }
    };
    // Prefer the "clean" value when it satisfies the equation exactly: a double root found numerically as
    // 1.0000000105 is really 1, and 4.000000000000001 is 4.
    const strict = (x) => {
      try {
        const e = { ...env, [v]: x };
        const l = evaluate(eq.lhs, e, deg), r = evaluate(eq.rhs, e, deg);
        return Math.abs(l - r) <= 1e-12 * (Math.abs(l) + Math.abs(r)) + 1e-15;
      } catch (err) { return false; }
    };
    const snap = (x) => {
      for (let dp = 0; dp <= 10; dp++) { const r = Number(x.toFixed(dp)); if (strict(r)) return r === 0 ? 0 : r; }
      return x;
    };
    // roots within 1e-6 of each other are one root (a tangent point is only located to ~1e-8)
    const dedupe = (vals) => {
      const out = [];
      for (const x of vals.map(snap)) if (!out.some((q) => Math.abs(q - x) <= 1e-6 * Math.max(1, Math.abs(x)))) out.push(x);
      return out.sort((a, b) => b - a);
    };

    const candidates = isolate(eq, v);
    if (candidates) {
      const rows = [];
      for (const ast of candidates) {
        let x;
        try { x = evaluate(ast, env, deg); } catch (err) { continue; }
        if (accept(x)) rows.push({ value: x === 0 ? 0 : x, ast });
      }
      // Trig equations repeat every full turn and the inverse functions return only one value (atan gives
      // −45° where 135° and 315° are also answers). For an angle, add every other root within the range.
      if (meta && meta.angle && Number.isFinite(bounds.max)) {
        for (const x of dedupe(numericRoots(eq, v, env, deg, bounds)).filter(accept)) {
          if (!rows.some((r) => Math.abs(r.value - x) <= 1e-6 * Math.max(1, Math.abs(x)))) rows.push({ value: x, ast: null });
        }
      }
      const seen = [];
      const unique = rows.filter((r) => { if (seen.some((q) => Math.abs(q - r.value) <= 1e-9 * Math.max(1, Math.abs(r.value)))) return false; seen.push(r.value); return true; });
      return { method: 'rearranged', solutions: unique.sort((a, b) => b.value - a.value), asts: candidates };
    }
    const roots = dedupe(numericRoots(eq, v, env, deg, bounds)).filter(accept);
    return { method: 'numeric', solutions: roots.map((value) => ({ value, ast: null })), asts: null };
  }

  // ------------------------------------------------------------------ printing
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
  function fmt(v) {
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    return String(parseFloat(v.toPrecision(10)));
  }
  // ctx: { sym: id -> display symbol, values: id -> number (substitute instead of printing the name), deg }
  function toStr(n, ctx = {}, parent = 0, right = false) {
    const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3, '^': 4 };
    let s, prec = 5;
    switch (n.t) {
      case 'num': s = fmt(n.v); if (n.v < 0) prec = 3; break;
      case 'sym':
        if (n.n === 'pi') s = 'π';
        else if (n.n === 'e') s = 'e';
        else if (n.n === 'halfturn') s = ctx.deg === false ? 'π' : '180°';
        else if (ctx.values && Object.prototype.hasOwnProperty.call(ctx.values, n.n)) { s = fmt(ctx.values[n.n]); if (ctx.values[n.n] < 0) prec = 3; }
        else s = (ctx.sym && ctx.sym[n.n]) || n.n;
        break;
      case 'neg': prec = PREC.neg; s = '−' + toStr(n.a, ctx, PREC.neg); break;
      case 'fn': {
        const arg = toStr(n.a, ctx);
        const names = { asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', log10: 'log₁₀', log2: 'log₂', fact: 'fact' };
        if (n.n === 'sqrt') s = `√(${arg})`;
        else if (n.n === 'cbrt') s = `∛(${arg})`;
        else if (n.n === 'exp') s = `e^(${arg})`;
        else if (n.n === 'abs') s = `|${arg}|`;
        else s = `${names[n.n] || n.n}(${arg})`;
        break;
      }
      case 'bin': {
        prec = PREC[n.op];
        if (n.op === '^') {
          const b = n.b;
          if (b.t === 'num' && b.v === 0.5) { s = `√(${toStr(n.a, ctx)})`; prec = 5; break; }
          if (b.t === 'num' && Math.abs(b.v - 1 / 3) < 1e-12) { s = `∛(${toStr(n.a, ctx)})`; prec = 5; break; }
          const base = toStr(n.a, ctx, 5);
          if (b.t === 'num' && Number.isInteger(b.v) && b.v >= 0 && b.v <= 9) s = base + SUP[b.v];
          else if (b.t === 'num' && b.v > 0 && Math.abs(1 / b.v - Math.round(1 / b.v)) < 1e-12 && Math.round(1 / b.v) <= 12) s = `${base}^(1/${Math.round(1 / b.v)})`;
          else s = `${base}^(${toStr(b, ctx)})`;
        } else if (n.op === '*') {
          s = toStr(n.a, ctx, 2) + (ctx.values ? ' × ' : '·') + toStr(n.b, ctx, 2, true);
        } else if (n.op === '/') {
          s = toStr(n.a, ctx, 2) + ' / ' + toStr(n.b, ctx, 2, true);
        } else {
          s = toStr(n.a, ctx, 1) + (n.op === '+' ? ' + ' : ' − ') + toStr(n.b, ctx, 1, true);
        }
        break;
      }
    }
    const needs = prec < parent || (right && prec === parent && parent <= 2);
    return needs ? `(${s})` : s;
  }

  // ------------------------------------------------------------------ public: solve a formula
  // formula: { eqs: [equation strings], vars: [{ id, sym, name, unit, min, max }] }
  // given:   { id: number }  (everything except the unknown)
  function solve(formula, target, given, opts = {}) {
    const deg = opts.deg !== false;
    if (!formula._parsed) formula._parsed = formula.eqs.map(parseEquation);
    const meta = Object.fromEntries(formula.vars.map((v) => [v.id, v]));
    const symMap = Object.fromEntries(formula.vars.map((v) => [v.id, v.sym || v.id]));

    const candidates = formula._parsed.filter((eq) => eq.vars.has(target));
    if (!candidates.length) return { ok: false, message: `${symMap[target] || target} does not appear in this formula.` };

    const need = (eq) => [...eq.vars].filter((x) => x !== target);
    const have = (x) => Object.prototype.hasOwnProperty.call(given, x);
    const usable = candidates.find((eq) => need(eq).every(have));
    if (!usable) {
      // Report only what is still missing, for the equation form(s) that are closest to complete.
      const options = candidates.map((eq) => need(eq).filter((x) => !have(x)));
      const fewest = Math.min(...options.map((o) => o.length));
      const best = options.filter((o) => o.length === fewest);
      const names = (o) => o.map((x) => symMap[x] || x).join(', ');
      const unique = [...new Set(best.map(names))];
      const message = unique.length === 1
        ? `Enter a value for: ${unique[0]}`
        : fewest === 1
          ? `Enter a value for: ${unique.join(' or ')}`
          : `Enter the values for one of these sets: ${unique.map((u) => `(${u})`).join(' or ')}`;
      return { ok: false, missing: best[0], message };
    }

    const result = solveEquation(usable, target, given, deg, meta[target]);
    const eqText = `${toStr(usable.lhs, { sym: symMap, deg })} = ${toStr(usable.rhs, { sym: symMap, deg })}`;
    if (!result.solutions.length) {
      return { ok: false, equation: eqText, message: 'No real solution for these values. Check the numbers and their units.' };
    }
    const solutions = result.solutions.map((sol) => ({
      value: sol.value,
      rearranged: sol.ast ? `${symMap[target] || target} = ${toStr(sol.ast, { sym: symMap, deg })}` : null,
      substituted: sol.ast ? `${symMap[target] || target} = ${toStr(sol.ast, { sym: symMap, values: given, deg })}` : null,
    }));
    return { ok: true, method: result.method, equation: eqText, solutions };
  }

  return { parseEquation, parseNumber, parseExpr, tokenize, evaluate, isolate, solveEquation, solve, toStr, symbolsOf, fmt };
})();
