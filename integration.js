// --- INTEGRATION ENGINE ---
// Extends window.CalculusTools (calculus.js). Works on the expression tree and tries these
// strategies in order, stopping at the first that succeeds:
//
//   1. basic       constants, sums, constant multiples, f(ax+b) for powers / sin / cos / exp / tan /
//                  ln / atan / asin / acos, and a^u
//   2. poly        polynomial products, expanded then integrated term by term
//   3. trig        sin/cos/tan powers (reduction formulas), sec^2, csc^2, sec, csc, products of
//                  sin/cos (product-to-sum), even powers (half-angle identities)
//   4. expTrig     e^(ax+b) times sin/cos(cx+d) (closed form, no by-parts loop)
//   5. rational    polynomial / polynomial: long division, then partial fractions for a linear or
//                  quadratic denominator, or any denominator with distinct real roots
//   6. radical     polynomial/sqrt(quadratic) and polynomial*sqrt(quadratic): reduction + completing the square
//   7. uSub        u-substitution: find g with integrand = h(g)·g'
//   8. byParts     integration by parts, choosing u by LIATE (inverse trig, log, algebraic, trig, exp)
//
// Safety: a candidate antiderivative is only returned if its derivative reproduces the integrand
// at sample points (verifyAntiderivative). A bug in any rule therefore shows up as "no closed
// form found", never as a confident wrong answer. Recursion is bounded by depth, a cycle guard
// and a per-integral call budget, so inputs that cannot be integrated terminate quickly.
Object.assign(window.CalculusTools, {
  STRATEGIES: ['integBasic', 'integPoly', 'integTrig', 'integExpTrig', 'integRational', 'integRadical', 'integUSub', 'integRootSub', 'integParts'],

  // Entry point used by symbolicAntiderivative(). Returns an AST or null.
  antiderivativeOf(f, steps) {
    this._active = new Set();
    this._budget = 600;
    const F = this.integ(f, steps, 0);
    if (!F) return null;
    const Fs = this.simplify(F);
    const checked = this.verifyAntiderivative(f, Fs);
    if (!checked) {
      steps.push('A candidate antiderivative failed the numeric self-check (its derivative did not reproduce the integrand) and was discarded.');
      return null;
    }
    steps.push(`Self-check: d/dx of the result matches the integrand at ${checked} sample points.`);
    return Fs;
  },

  // Differentiate the candidate and compare with the integrand. Points where either side is
  // undefined (domain edges) are skipped; at least two valid points must agree.
  verifyAntiderivative(f, F) {
    const dF = this.diff(F);
    let valid = 0;
    for (const x of [0.37, 0.91, 1.43, 2.11, 2.77, 3.4, 0.53, 1.19, -0.43, -1.3, -2.2, 5.1, 0.07, 7.3]) {
      const a = this.evalAt(f, x);
      const b = this.evalAt(dF, x);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (Math.abs(a - b) > 1e-7 * Math.max(1, Math.abs(a))) return 0;
      valid++;
    }
    return valid >= 2 ? valid : 0;
  },

  integ(n, steps, depth = 0) {
    if (depth > 6 || this._budget-- <= 0) return null;
    const k = this.key(n);
    if (this._active.has(k)) return null; // would loop back to an integral already in progress
    this._active.add(k);
    try {
      for (const name of this.STRATEGIES) {
        const s = []; // steps of a failed attempt are discarded
        const F = this[name](n, s, depth);
        if (F) { steps.push(...s); return F; }
      }
      return null;
    } finally {
      this._active.delete(k);
    }
  },

  S(x) { return this.toStr(this.simplify(x)); },

  // ============================================================ 1. basic rules
  integBasic(n, s, depth) {
    const note = (t) => s.push(t);
    const S = (x) => this.S(x);
    const X = { t: 'var' };
    const sub = (m) => this.integ(m, s, depth + 1);

    if (this.isConst(n)) {
      note(`∫${S(n)} dx = ${S(n)}·x  (constant rule)`);
      return this.mul(n, X);
    }

    // Constant multiple rule, seen through the normal form: 0.5·u⁻³ is stored as 1/(2·u³)
    const fz = this.factorize(n);
    if (!fz.zeroDiv && fz.atoms.length && fz.c !== 0 && Math.abs(fz.c) !== 1) {
      const F = sub(this.buildProduct(1, fz.atoms));
      if (F) { note(`Constant multiple rule: ∫${this.fmt(fz.c)}·f dx = ${this.fmt(fz.c)}·∫f dx`); return this.mul(this.num(fz.c), F); }
    }

    switch (n.t) {
      case 'var': note('∫x dx = x²/2'); return this.div(this.pow(X, this.num(2)), this.num(2));
      case 'neg': { const F = sub(n.a); return F && this.neg(F); }
      case 'add': case 'sub': {
        note(`Sum/difference rule on ${S(n)}`);
        const A = sub(n.a);
        const B = A && sub(n.b);
        if (!A || !B) return null;
        return n.t === 'add' ? this.add(A, B) : this.sub(A, B);
      }
      case 'mul': {
        if (this.isConst(n.a)) { const F = sub(n.b); return F && this.mul(n.a, F); }
        if (this.isConst(n.b)) { const F = sub(n.a); return F && this.mul(n.b, F); }
        return null;
      }
      case 'div': {
        if (this.isConst(n.b)) { const F = sub(n.a); return F && this.div(F, n.b); }
        if (this.isConst(n.a)) return sub(this.mul(n.a, this.pow(n.b, this.num(-1))));
        return null;
      }
      case 'pow': {
        const a = this.linearCoeff(n.a); // n.a = a·x + b ?
        if (a !== null && this.isConst(n.b)) {
          const p = this.evalNode(n.b);
          if (p === -1) {
            note(`∫(u)⁻¹ dx = ln|u|/a  with u = ${S(n.a)}`);
            return this.div(this.fn('ln', this.fn('abs', n.a)), this.num(a));
          }
          note(`∫uⁿ dx = uⁿ⁺¹/(a(n+1))  with u = ${S(n.a)}, n = ${this.fmt(p)}`);
          return this.div(this.pow(n.a, this.num(p + 1)), this.num(a * (p + 1)));
        }
        if (this.isConst(n.a) && this.linearCoeff(n.b) !== null) {
          const k = this.linearCoeff(n.b);
          const lnA = this.isNum(n.a) && n.a.sym === 'e' ? null : this.fn('ln', n.a);
          note(`∫aᵘ dx = aᵘ/(a'·ln a)  with u = ${S(n.b)}`);
          return lnA ? this.div(n, this.mul(this.num(k), lnA)) : this.div(n, this.num(k));
        }
        return null;
      }
      case 'fn': {
        const a = this.linearCoeff(n.a);
        if (a === null) return null;
        const u = n.a;
        const byA = (F) => this.div(F, this.num(a));
        switch (n.name) {
          case 'sin': note(`∫sin(u) dx = −cos(u)/a  with u = ${S(u)}`); return byA(this.neg(this.fn('cos', u)));
          case 'cos': note(`∫cos(u) dx = sin(u)/a  with u = ${S(u)}`);  return byA(this.fn('sin', u));
          case 'exp': note(`∫exp(u) dx = exp(u)/a  with u = ${S(u)}`);  return byA(this.fn('exp', u));
          case 'tan': note(`∫tan(u) dx = −ln|cos(u)|/a  with u = ${S(u)}`); return byA(this.neg(this.fn('ln', this.fn('abs', this.fn('cos', u)))));
          case 'sqrt': return sub(this.pow(u, this.num(0.5)));
          case 'ln':
            note(`∫ln(u) dx = (u·ln u − u)/a  with u = ${S(u)}  (by parts)`);
            return byA(this.sub(this.mul(u, this.fn('ln', u)), u));
          case 'atan':
            note(`∫atan(u) dx = (u·atan u − ½ln(1+u²))/a  with u = ${S(u)}`);
            return byA(this.sub(this.mul(u, this.fn('atan', u)),
              this.mul(this.num(0.5), this.fn('ln', this.add(this.num(1), this.pow(u, this.num(2)))))));
          case 'asin':
            note(`∫asin(u) dx = (u·asin u + √(1−u²))/a  with u = ${S(u)}`);
            return byA(this.add(this.mul(u, this.fn('asin', u)), this.fn('sqrt', this.sub(this.num(1), this.pow(u, this.num(2))))));
          case 'acos':
            note(`∫acos(u) dx = (u·acos u − √(1−u²))/a  with u = ${S(u)}`);
            return byA(this.sub(this.mul(u, this.fn('acos', u)), this.fn('sqrt', this.sub(this.num(1), this.pow(u, this.num(2))))));
          default: return null;
        }
      }
    }
    return null;
  },

  // ============================================================ polynomial helpers
  // Coefficient arrays are ascending: [c0, c1, c2] = c0 + c1·x + c2·x².
  polyTrim(p) {
    const q = p.slice();
    while (q.length && Math.abs(q[q.length - 1]) < 1e-14) q.pop();
    return q;
  },
  polyAdd(p, q, sign = 1) {
    const out = [];
    for (let i = 0; i < Math.max(p.length, q.length); i++) out.push((p[i] || 0) + sign * (q[i] || 0));
    return out;
  },
  polyMul(p, q) {
    if (!p.length || !q.length) return [];
    const out = new Array(p.length + q.length - 1).fill(0);
    for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) out[i + j] += p[i] * q[j];
    return out;
  },
  polyEval(p, x) { return p.reduceRight((acc, c) => acc * x + c, 0); },
  polyDeriv(p) { return p.slice(1).map((c, i) => c * (i + 1)); },
  // Long division: N = Q·D + R with deg R < deg D.
  polyDivide(N, D) {
    const r = N.slice();
    const dd = D.length - 1;
    const q = new Array(Math.max(0, N.length - dd)).fill(0);
    for (let i = N.length - 1; i >= dd; i--) {
      const c = r[i] / D[dd];
      q[i - dd] = c;
      for (let j = 0; j <= dd; j++) r[i - dd + j] -= c * D[j];
    }
    return { q: this.polyTrim(q), r: this.polyTrim(r.slice(0, Math.max(dd, 0))) };
  },

  // Tree -> coefficient array, or null if the tree is not a polynomial in x with numeric coefficients.
  toPoly(n) {
    switch (n.t) {
      case 'num': return [n.v];
      case 'var': return [0, 1];
      case 'neg': { const p = this.toPoly(n.a); return p && p.map((c) => -c); }
      case 'add': case 'sub': {
        const p = this.toPoly(n.a), q = p && this.toPoly(n.b);
        return q && this.polyAdd(p, q, n.t === 'add' ? 1 : -1);
      }
      case 'mul': { const p = this.toPoly(n.a), q = p && this.toPoly(n.b); return q && this.polyMul(p, q); }
      case 'div': {
        if (!this.isConst(n.b)) return null;
        const v = this.evalNode(n.b);
        const p = Number.isFinite(v) && v !== 0 ? this.toPoly(n.a) : null;
        return p && p.map((c) => c / v);
      }
      case 'pow': {
        if (!this.isNum(n.b) || !Number.isInteger(n.b.v) || n.b.v < 0 || n.b.v > 20) return null;
        const p = this.toPoly(n.a);
        if (!p) return null;
        let out = [1];
        for (let i = 0; i < n.b.v; i++) out = this.polyMul(out, p);
        return out;
      }
    }
    return null;
  },

  // Coefficient array -> tree (highest power first).
  polyToNode(p) {
    let out = null;
    for (let k = p.length - 1; k >= 0; k--) {
      if (p[k] === 0) continue;
      const term = k === 0 ? this.num(p[k]) : this.mul(this.num(p[k]), this.pow({ t: 'var' }, this.num(k)));
      out = out === null ? term : this.add(out, term);
    }
    return out || this.num(0);
  },

  // Roots by Durand-Kerner iteration, polished with Newton. Returns [{re, im}].
  polyRoots(P) {
    const m = P.length - 1;
    const c = P.map((v) => v / P[m]);
    const radius = 1 + Math.max(...c.slice(0, m).map(Math.abs));
    let z = [];
    for (let i = 0; i < m; i++) {
      const ang = (2 * Math.PI * i) / m + 0.4;
      z.push({ re: 0.6 * radius * Math.cos(ang), im: 0.6 * radius * Math.sin(ang) });
    }
    const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
    const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
    const peval = (x) => { let acc = { re: 0, im: 0 }; for (let i = m; i >= 0; i--) { acc = cmul(acc, x); acc.re += c[i]; } return acc; };
    for (let it = 0; it < 600; it++) {
      let delta = 0;
      for (let i = 0; i < m; i++) {
        let den = { re: 1, im: 0 };
        for (let j = 0; j < m; j++) if (j !== i) den = cmul(den, { re: z[i].re - z[j].re, im: z[i].im - z[j].im });
        const step = cdiv(peval(z[i]), den);
        z[i] = { re: z[i].re - step.re, im: z[i].im - step.im };
        delta = Math.max(delta, Math.abs(step.re) + Math.abs(step.im));
      }
      if (delta < 1e-15) break;
    }
    const dP = this.polyDeriv(P);
    return z.map((r) => {
      if (Math.abs(r.im) > 1e-7 * Math.max(1, Math.abs(r.re))) return r;
      let x = r.re;
      for (let i = 0; i < 6; i++) { const d = this.polyEval(dP, x); if (d === 0) break; x -= this.polyEval(P, x) / d; }
      return { re: x, im: 0 };
    });
  },

  // ============================================================ 2. polynomials
  integPoly(n, s) {
    const P = this.toPoly(n);
    if (!P || P.length <= 1) return null; // constants are handled by the basic rule
    s.push('Expand to a polynomial and integrate term by term: ∫xⁿ dx = xⁿ⁺¹/(n+1)');
    let F = null;
    for (let k = P.length - 1; k >= 0; k--) {
      if (P[k] === 0) continue;
      const term = this.mul(this.num(P[k] / (k + 1)), this.pow({ t: 'var' }, this.num(k + 1)));
      F = F === null ? term : this.add(F, term);
    }
    return F || this.num(0);
  },

  // Distributes products and small integer powers over sums, then simplifies.
  expand(n) {
    const terms = (m) => {
      switch (m.t) {
        case 'add': return [...terms(m.a), ...terms(m.b)];
        case 'sub': return [...terms(m.a), ...terms(m.b).map((t) => this.neg(t))];
        case 'neg': return terms(m.a).map((t) => this.neg(t));
        case 'mul': { const A = terms(m.a), B = terms(m.b), out = []; for (const a of A) for (const b of B) out.push(this.mul(a, b)); return out; }
        case 'div': return this.isConst(m.b) ? terms(m.a).map((t) => this.div(t, m.b)) : [m];
        case 'pow': {
          if (!this.isNum(m.b) || !Number.isInteger(m.b.v) || m.b.v < 2 || m.b.v > 6) return [m];
          const base = terms(m.a);
          let acc = [this.num(1)];
          for (let i = 0; i < m.b.v; i++) { const next = []; for (const x of acc) for (const y of base) next.push(this.mul(x, y)); acc = next; }
          return acc;
        }
        default: return [m];
      }
    };
    let sum = null;
    for (const t of terms(n)) sum = sum === null ? t : this.add(sum, t);
    return this.simplify(sum);
  },

  // ============================================================ 3. trigonometric
  integTrig(n, s, depth) {
    const fz = this.factorize(n);
    if (fz.zeroDiv || !fz.atoms.length) return null;
    const A = fz.atoms;
    const isSC = (b) => b.t === 'fn' && (b.name === 'sin' || b.name === 'cos');
    const wrap = (F) => (F ? this.mul(this.num(fz.c), F) : null);
    const sub = (m) => this.integ(m, s, depth + 1);

    // (a) a single power of sin, cos or tan of a linear argument
    if (A.length === 1 && A[0].b.t === 'fn' && ['sin', 'cos', 'tan'].includes(A[0].b.name) && Number.isInteger(A[0].e)) {
      const { b, e } = A[0];
      const u = b.a;
      const a = this.linearCoeff(u);
      if (a === null) return null;
      const sinU = this.fn('sin', u), cosU = this.fn('cos', u), tanU = this.fn('tan', u);
      if (e >= 2) {
        const rest = sub(this.pow(b, this.num(e - 2)));
        if (!rest) return null;
        let first, k;
        if (b.name === 'sin') {
          s.push(`Reduction formula: ∫sinⁿu dx = −sinⁿ⁻¹u·cos u/(n·a) + (n−1)/n·∫sinⁿ⁻²u dx   (n = ${e})`);
          first = this.neg(this.div(this.mul(this.pow(sinU, this.num(e - 1)), cosU), this.num(e * a)));
          k = (e - 1) / e;
        } else if (b.name === 'cos') {
          s.push(`Reduction formula: ∫cosⁿu dx = cosⁿ⁻¹u·sin u/(n·a) + (n−1)/n·∫cosⁿ⁻²u dx   (n = ${e})`);
          first = this.div(this.mul(this.pow(cosU, this.num(e - 1)), sinU), this.num(e * a));
          k = (e - 1) / e;
        } else {
          s.push(`Reduction formula: ∫tanⁿu dx = tanⁿ⁻¹u/((n−1)·a) − ∫tanⁿ⁻²u dx   (n = ${e})`);
          first = this.div(this.pow(tanU, this.num(e - 1)), this.num((e - 1) * a));
          k = -1;
        }
        return wrap(this.add(first, this.mul(this.num(k), rest)));
      }
      if (e === -2 && b.name === 'cos') { s.push('∫sec²(u) dx = tan(u)/a'); return wrap(this.div(tanU, this.num(a))); }
      if (e === -2 && b.name === 'sin') { s.push('∫csc²(u) dx = −cot(u)/a'); return wrap(this.neg(this.div(cosU, this.mul(this.num(a), sinU)))); }
      if (e === -1 && b.name === 'cos') {
        s.push('∫sec(u) dx = ln|sec u + tan u|/a');
        return wrap(this.div(this.fn('ln', this.fn('abs', this.div(this.add(this.num(1), sinU), cosU))), this.num(a)));
      }
      if (e === -1 && b.name === 'sin') {
        s.push('∫csc(u) dx = ln|tan(u/2)|/a');
        return wrap(this.div(this.fn('ln', this.fn('abs', this.div(sinU, this.add(this.num(1), cosU)))), this.num(a)));
      }
      return null;
    }

    // (b) a product of two sin/cos factors with different linear arguments: product-to-sum
    if (A.length === 2 && A.every((t) => isSC(t.b) && t.e === 1)) {
      const [p, q] = [A[0].b, A[1].b];
      if (this.linearCoeff(p.a) === null || this.linearCoeff(q.a) === null) return null;
      const P = p.a, Q = q.a;
      const half = (t) => this.mul(this.num(0.5), t);
      const sum = this.add(P, Q);
      let r;
      if (p.name === 'sin' && q.name === 'cos') r = half(this.add(this.fn('sin', sum), this.fn('sin', this.sub(P, Q))));
      else if (p.name === 'cos' && q.name === 'sin') r = half(this.add(this.fn('sin', sum), this.fn('sin', this.sub(Q, P))));
      else if (p.name === 'sin') r = half(this.sub(this.fn('cos', this.sub(P, Q)), this.fn('cos', sum)));
      else r = half(this.add(this.fn('cos', this.sub(P, Q)), this.fn('cos', sum)));
      s.push('Product-to-sum identity (sin A cos B = ½[sin(A+B) + sin(A−B)], and the three analogues)');
      return wrap(sub(this.simplify(r)));
    }

    // (c) several even powers of sin/cos: half-angle identities, expand, integrate term by term
    if (A.length >= 2 && A.every((t) => isSC(t.b) && Number.isInteger(t.e) && t.e >= 2 && t.e % 2 === 0 && this.linearCoeff(t.b.a) !== null)) {
      let expr = this.num(fz.c);
      for (const { b, e } of A) {
        const c2 = this.fn('cos', this.mul(this.num(2), b.a));
        const half = b.name === 'sin' ? this.div(this.sub(this.num(1), c2), this.num(2)) : this.div(this.add(this.num(1), c2), this.num(2));
        expr = this.mul(expr, this.pow(half, this.num(e / 2)));
      }
      s.push('Half-angle identities sin²u = (1 − cos 2u)/2 and cos²u = (1 + cos 2u)/2, expand, integrate term by term');
      return sub(this.expand(expr));
    }

    // (d) sinᵐ·cosⁿ of the same argument with an odd exponent of at least 3: peel off one factor and
    //     use sin² = 1 − cos² (or cos² = 1 − sin²); every resulting term is f(cos)·sin, a u-substitution
    if (A.length === 2 && A.every((t) => isSC(t.b) && Number.isInteger(t.e) && t.e >= 1)) {
      const sinA = A.find((t) => t.b.name === 'sin'), cosA = A.find((t) => t.b.name === 'cos');
      if (sinA && cosA && this.same(sinA.b.a, cosA.b.a) && this.linearCoeff(sinA.b.a) !== null) {
        const u = sinA.b.a;
        const sinU = this.fn('sin', u), cosU = this.fn('cos', u);
        let expr = null;
        if (sinA.e % 2 === 1 && sinA.e >= 3) {
          expr = this.mul(this.mul(sinU, this.pow(this.sub(this.num(1), this.pow(cosU, this.num(2))), this.num((sinA.e - 1) / 2))), this.pow(cosU, this.num(cosA.e)));
        } else if (cosA.e % 2 === 1 && cosA.e >= 3) {
          expr = this.mul(this.mul(cosU, this.pow(this.sub(this.num(1), this.pow(sinU, this.num(2))), this.num((cosA.e - 1) / 2))), this.pow(sinU, this.num(sinA.e)));
        }
        if (expr) {
          s.push('Odd power: peel off one factor and use sin²u + cos²u = 1, then substitute');
          return sub(this.expand(this.mul(this.num(fz.c), expr)));
        }
      }
    }
    return null;
  },

  // exp(u) written either as exp(u) or as e^u
  expArg(b) {
    if (b.t === 'fn' && b.name === 'exp') return b.a;
    if (b.t === 'pow' && b.a.t === 'num' && b.a.sym === 'e') return b.b;
    return null;
  },

  // ============================================================ 4. e^(ax+b) · sin/cos(cx+d)
  integExpTrig(n, s, depth) {
    const fz = this.factorize(n);
    if (fz.zeroDiv || fz.atoms.length !== 2) return null;
    const ex = fz.atoms.find((t) => t.e === 1 && this.expArg(t.b) !== null);

    // e^p · sin²q or e^p · cos²q: half-angle identity first, giving e^p and e^p·cos 2q
    const sq = fz.atoms.find((t) => t.e === 2 && t.b.t === 'fn' && (t.b.name === 'sin' || t.b.name === 'cos') && this.linearCoeff(t.b.a) !== null);
    if (ex && sq) {
      const c2 = this.fn('cos', this.mul(this.num(2), sq.b.a));
      const half = sq.b.name === 'sin' ? this.div(this.sub(this.num(1), c2), this.num(2)) : this.div(this.add(this.num(1), c2), this.num(2));
      s.push('Half-angle identity for the squared trig factor, then ∫e^p and ∫e^p·cos(2q)');
      return this.integ(this.expand(this.mul(this.num(fz.c), this.mul(ex.b, half))), s, depth + 1);
    }
    const tr = fz.atoms.find((t) => t.e === 1 && t.b.t === 'fn' && (t.b.name === 'sin' || t.b.name === 'cos'));
    if (!ex || !tr) return null;
    const a = this.linearCoeff(this.expArg(ex.b));
    const b = this.linearCoeff(tr.b.a);
    if (a === null || b === null) return null;
    const q = tr.b.a;
    const den = a * a + b * b;
    let inner;
    if (tr.b.name === 'sin') {
      s.push('∫e^p·sin q dx = e^p(a·sin q − b·cos q)/(a² + b²)   where a = p′, b = q′');
      inner = this.sub(this.mul(this.num(a), this.fn('sin', q)), this.mul(this.num(b), this.fn('cos', q)));
    } else {
      s.push('∫e^p·cos q dx = e^p(a·cos q + b·sin q)/(a² + b²)   where a = p′, b = q′');
      inner = this.add(this.mul(this.num(a), this.fn('cos', q)), this.mul(this.num(b), this.fn('sin', q)));
    }
    return this.mul(this.num(fz.c / den), this.mul(ex.b, inner));
  },

  // ============================================================ 5. rational functions
  integRational(n, s, depth) {
    const fz = this.factorize(n);
    if (fz.zeroDiv || !fz.atoms.length) return null;
    let N = [fz.c], D = [1];
    const den = []; // the denominator as written: [{ p: coefficients, m: multiplicity }]
    for (const { b, e } of fz.atoms) {
      if (!Number.isInteger(e)) return null;
      const p = this.toPoly(b);
      if (!p) {
        // e.g. 1/((u + 1/u)·u): expand numerator and denominator; and if negative powers of x
        // remain (u/(u + 1/u)), multiply top and bottom by the matching power of x to clear them
        if (n.t !== 'div') return null;
        let retry = this.simplify(this.div(this.expand(n.a), this.expand(n.b)));
        if (this.same(retry, n)) {
          let lowest = 0;
          const scan = (m) => {
            if (m.t === 'pow' && m.a.t === 'var' && this.isNum(m.b) && Number.isInteger(m.b.v)) lowest = Math.min(lowest, m.b.v);
            else if (m.t === 'neg' || m.t === 'fn') scan(m.a);
            else if (m.t !== 'num' && m.t !== 'var') { scan(m.a); scan(m.b); }
          };
          scan(n);
          if (lowest >= 0) return null;
          const shift = this.pow({ t: 'var' }, this.num(-lowest));
          retry = this.simplify(this.div(this.expand(this.mul(n.a, shift)), this.expand(this.mul(n.b, shift))));
          if (this.same(retry, n)) return null;
        }
        return this.integ(retry, s, depth + 1);
      }
      let pk = [1];
      for (let i = 0; i < Math.abs(e); i++) pk = this.polyMul(pk, p);
      if (e > 0) N = this.polyMul(N, pk); else { D = this.polyMul(D, pk); den.push({ p: this.polyTrim(p), m: -e }); }
    }
    N = this.polyTrim(N);
    D = this.polyTrim(D);
    if (D.length <= 1) return null; // a polynomial: handled by integPoly

    // Denominator written as linear and irreducible-quadratic factors (any multiplicity)?
    // Then partial fractions can be done exactly, including repeated factors.
    const usable = den.every(({ p }) => p.length === 2 || (p.length === 3 && p[1] * p[1] - 4 * p[0] * p[2] < -1e-12 * (p[1] * p[1] + Math.abs(4 * p[0] * p[2]) + 1)));
    if (usable) {
      const F = this.partialFractionsFactored(N, den, D, s);
      if (F) return F;
    } else if (D.length - 1 >= 3) {
      // An expanded denominator such as x³ + 1 or x⁴ + 1: factor it from its (simple) roots into linear
      // and irreducible quadratic factors, then use the same exact method.
      const found = this.factorByRoots(D);
      if (found) {
        const lead = D[D.length - 1];
        const F = this.partialFractionsFactored(N.map((c) => c / lead), found, D.map((c) => c / lead), s);
        if (F) { s.unshift('Factor the denominator from its roots (real roots → linear factors, conjugate pairs → irreducible quadratics)'); return F; }
      }
    }

    const { q, r } = this.polyDivide(N, D);
    let F = null;
    if (q.length) {
      s.push('Polynomial long division: integrate the quotient and the proper fraction R/Q separately');
      for (let k = q.length - 1; k >= 0; k--) {
        if (q[k] === 0) continue;
        const term = this.mul(this.num(q[k] / (k + 1)), this.pow({ t: 'var' }, this.num(k + 1)));
        F = F === null ? term : this.add(F, term);
      }
    }
    if (!r.length) return F || this.num(0);
    const part = this.properFraction(r, D, s);
    if (!part) return null;
    return F === null ? part : this.add(F, part);
  },

  // Factors a polynomial with distinct roots into monic linear and irreducible quadratic factors,
  // as [{ p, m: 1 }], or returns null (repeated roots, roots too ill-conditioned to separate).
  factorByRoots(D) {
    const deg = D.length - 1;
    if (deg < 3 || deg > 8) return null;
    const roots = this.polyRoots(D);
    const tol = (z) => 1e-6 * Math.max(1, Math.hypot(z.re, z.im));
    for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
      if (Math.hypot(roots[i].re - roots[j].re, roots[i].im - roots[j].im) < tol(roots[i])) return null;
    }
    const real = roots.filter((z) => z.im === 0);
    const up = roots.filter((z) => z.im > 0), down = roots.filter((z) => z.im < 0);
    if (up.length !== down.length) return null;
    return [
      ...real.map((z) => ({ p: [-z.re, 1], m: 1 })),
      ...up.map((z) => ({ p: [z.re * z.re + z.im * z.im, -2 * z.re, 1], m: 1 })),
    ];
  },

  // N / (∏ pᵢ^mᵢ) with every pᵢ linear or irreducible quadratic. Writes
  //   R/D = Σᵢ Σₖ (Aᵢₖ·x + Bᵢₖ) / pᵢᵏ     (k = 1..mᵢ; linear factors have only the constant term)
  // solves for the unknowns by matching coefficients, then integrates each term:
  //   linear:    ∫ A/(a·x+b)ᵏ        = (A/a)·ln|p|  or  A·p¹⁻ᵏ/(a(1−k))
  //   quadratic: (A·x + B)/pᵏ = (A/2a)·p′/pᵏ + C/pᵏ  with  C = B − A·b/(2a),
  //              ∫ dx/pᵏ = (2a·x+b)/((k−1)Δp^(k−1)) + 2a(2k−3)/((k−1)Δ)·∫ dx/p^(k−1),   Δ = 4ac − b²
  partialFractionsFactored(N, den, D, s) {
    const X = { t: 'var' };
    const lnAbs = (t) => this.fn('ln', this.fn('abs', t));
    const { q, r } = this.polyDivide(N, D);
    const degD = D.length - 1;

    const layout = [];                     // one entry per (factor, power) with its unknown count
    den.forEach((d, i) => { for (let k = 1; k <= d.m; k++) layout.push({ i, k, deg: d.p.length - 1 }); });
    const columns = [];
    for (const u of layout) {
      let other = [1];                     // D / pᵢᵏ
      den.forEach((d, j) => { const e = j === u.i ? d.m - u.k : d.m; for (let t = 0; t < e; t++) other = this.polyMul(other, d.p); });
      for (let c = 0; c < u.deg; c++) {
        const mono = new Array(c + 1).fill(0); mono[c] = 1;
        columns.push(this.polyMul(mono, other));
      }
    }
    if (columns.length !== degD) return null;
    const M = Array.from({ length: degD }, (_, row) => columns.map((col) => col[row] || 0));
    const sol = this.solveLinear(M, Array.from({ length: degD }, (_, row) => r[row] || 0));
    if (!sol) return null;

    const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
    const powTerm = (A, p, k, scale) => this.mul(this.num(A / (scale * (1 - k))), this.pow(this.polyToNode(p), this.num(1 - k)));
    const J = (p, k) => {                   // ∫ dx / pᵏ for an irreducible quadratic p
      const [c, b, a] = p;
      const delta = 4 * a * c - b * b;
      const pn = this.polyToNode(p);
      const lin = this.add(this.mul(this.num(2 * a), X), this.num(b));
      if (k === 1) return this.mul(this.num(2 / Math.sqrt(delta)), this.fn('atan', this.div(lin, this.num(Math.sqrt(delta)))));
      return this.add(
        this.div(lin, this.mul(this.num((k - 1) * delta), this.pow(pn, this.num(k - 1)))),
        this.mul(this.num((2 * a * (2 * k - 3)) / ((k - 1) * delta)), J(p, k - 1)));
    };

    s.push('Partial fractions: write R/D as a sum of A/(x−r)ᵏ and (A·x+B)/Qᵏ terms, solve for the coefficients, integrate each (repeated factors use a reduction formula)');
    let F = null;
    const addTerm = (t) => { F = F === null ? t : this.add(F, t); };
    for (let k = q.length - 1; k >= 0; k--) if (q[k] !== 0) addTerm(this.mul(this.num(q[k] / (k + 1)), this.pow(X, this.num(k + 1))));
    let at = 0;
    for (const u of layout) {
      const c = sol.slice(at, at + u.deg).map(clean);
      at += u.deg;
      const p = den[u.i].p;
      if (u.deg === 1) {
        if (c[0] === 0) continue;
        addTerm(u.k === 1 ? this.mul(this.num(c[0] / p[1]), lnAbs(this.polyToNode(p))) : powTerm(c[0], p, u.k, p[1]));
      } else {
        const [B, A] = c;
        const [, b, a] = p;
        if (A !== 0) addTerm(u.k === 1 ? this.mul(this.num(A / (2 * a)), lnAbs(this.polyToNode(p))) : powTerm(A / (2 * a), p, u.k, 1));
        const C = B - (A * b) / (2 * a);
        if (clean(C) !== 0) addTerm(this.mul(this.num(C), J(p, u.k)));
      }
    }
    return F || this.num(0);
  },

  // ∫ R/D dx with deg R < deg D.
  properFraction(R, D, s) {
    const X = { t: 'var' };
    const m = D.length - 1;
    const Dnode = this.polyToNode(D);
    const lnAbs = (t) => this.fn('ln', this.fn('abs', t));

    if (m === 1) {
      s.push('∫ r/(a·x + b) dx = (r/a)·ln|a·x + b|');
      return this.mul(this.num(R[0] / D[1]), lnAbs(Dnode));
    }

    if (m === 2) {
      const [c, b, a] = D;
      const B = R[0] || 0, A = R[1] || 0;
      const disc = b * b - 4 * a * c;
      const tiny = 1e-12 * (b * b + Math.abs(4 * a * c) + 1);
      if (disc < -tiny) {
        const k = Math.sqrt(-disc);
        s.push('Irreducible quadratic: (A·x + B)/(a·x² + b·x + c) = A/(2a)·ln|Q| + (B − A·b/(2a))·(2/√(4ac−b²))·atan((2a·x + b)/√(4ac−b²))');
        const lnPart = this.mul(this.num(A / (2 * a)), lnAbs(Dnode));
        const atanPart = this.mul(this.num(((B - (A * b) / (2 * a)) * 2) / k),
          this.fn('atan', this.div(this.add(this.mul(this.num(2 * a), X), this.num(b)), this.num(k))));
        return this.add(lnPart, atanPart);
      }
      if (Math.abs(disc) <= tiny) {
        const m0 = b / (2 * a);
        const xm = this.add(X, this.num(m0));
        s.push('Repeated root: Q = a(x + m)², so (A·x + B)/Q = (A/a)/(x + m) + (B − A·m)/(a·(x + m)²)');
        return this.sub(this.mul(this.num(A / a), lnAbs(xm)), this.div(this.num(B - A * m0), this.mul(this.num(a), xm)));
      }
    }

    // Distinct real roots (any degree): R/D = Σ R(rᵢ)/D′(rᵢ) · 1/(x − rᵢ)
    const roots = m === 2
      ? (() => { const [c, b, a] = D; const sq = Math.sqrt(b * b - 4 * a * c); return [(-b + sq) / (2 * a), (-b - sq) / (2 * a)].map((re) => ({ re, im: 0 })); })()
      : this.polyRoots(D);
    if (roots.some((z) => z.im !== 0)) return null;
    const rs = roots.map((z) => z.re);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      if (Math.abs(rs[i] - rs[j]) < 1e-6 * Math.max(1, Math.abs(rs[i]))) return null; // repeated root
    }
    const dD = this.polyDeriv(D);
    s.push('Partial fractions over the real roots of the denominator: R/Q = Σ R(rᵢ)/Q′(rᵢ) · 1/(x − rᵢ)');
    let F = null;
    for (const r of rs) {
      const coef = this.polyEval(R, r) / this.polyEval(dD, r);
      const term = this.mul(this.num(coef), lnAbs(this.sub(X, this.num(r))));
      F = F === null ? term : this.add(F, term);
    }
    return F;
  },

  // ============================================================ 6. polynomial / sqrt(quadratic)
  // Gaussian elimination with partial pivoting; returns the solution vector or null if singular.
  solveLinear(M, rhs) {
    const n = rhs.length;
    const A = M.map((row, i) => [...row, rhs[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return null;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
      }
    }
    return A.map((row, i) => row[n] / row[i]);
  },

  // ∫ dx/√Q for a quadratic Q = A·x² + B·x + C by completing the square, or null.
  inverseRootIntegral(Q, s) {
    const [C, B, A] = Q;
    const h = -B / (2 * A);
    const k = C - (B * B) / (4 * A);
    if (Math.abs(k) < 1e-12) return null;
    const u = this.sub({ t: 'var' }, this.num(h));
    const root = this.fn('sqrt', this.polyToNode(Q));
    if (A > 0) {
      const sA = Math.sqrt(A);
      s.push('∫ dx/√(A·u² + k) = ln|√A·u + √(A·u² + k)|/√A,   u = x − h  (complete the square)');
      return this.div(this.fn('ln', this.fn('abs', this.add(this.mul(this.num(sA), u), root))), this.num(sA));
    }
    if (k <= 0) return null; // the root is never real
    const sA = Math.sqrt(-A);
    s.push('∫ dx/√(k − |A|·u²) = asin(√|A|·u/√k)/√|A|,   u = x − h  (complete the square)');
    return this.div(this.fn('asin', this.div(this.mul(this.num(sA), u), this.num(Math.sqrt(k)))), this.num(sA));
  },

  // P(x)/√Q and P(x)·√Q for a quadratic Q and any polynomial P.
  // Reduction: find R (degree deg P − 1) and K with  P = R′·Q + ½·R·Q′ + K,
  // then  ∫ P/√Q dx = R(x)·√Q + K·∫ dx/√Q.   (P·√Q is handled as (P·Q)/√Q.)
  integRadical(n, s) {
    const fz = this.factorize(n);
    if (fz.zeroDiv) return null;
    const rad = fz.atoms.filter((a) => Math.abs(Math.abs(a.e) - 0.5) < 1e-12);
    if (rad.length !== 1) return null;
    const { b, e } = rad[0];
    const Q = this.toPoly(b);
    if (!Q || Q.length !== 3 || Q[2] === 0) return null;

    let N = [fz.c];
    for (const a of fz.atoms) {
      if (a === rad[0]) continue;
      const p = this.toPoly(a.b);
      if (!p || !Number.isInteger(a.e) || a.e < 0) return null;
      for (let i = 0; i < a.e; i++) N = this.polyMul(N, p);
    }
    if (e > 0) N = this.polyMul(N, Q);
    N = this.polyTrim(N);
    if (!N.length) return null;

    const base = this.inverseRootIntegral(Q, s);
    if (!base) return null;
    const deg = N.length - 1;
    if (deg === 0) return this.mul(this.num(N[0]), base);

    // unknowns: r_0 .. r_(deg-1) and K; equations: coefficients of x^0 .. x^deg
    const dQ = this.polyDeriv(Q);
    const cols = [];
    for (let j = 0; j < deg; j++) {
      const xj = new Array(j + 1).fill(0); xj[j] = 1;                 // x^j
      const dxj = j === 0 ? [] : (() => { const t = new Array(j).fill(0); t[j - 1] = j; return t; })(); // j·x^(j−1)
      const col = this.polyAdd(this.polyMul(dxj, Q), this.polyMul(xj, dQ).map((c) => c / 2));
      cols.push(col);
    }
    cols.push([1]); // K
    const size = deg + 1;
    const M = Array.from({ length: size }, (_, row) => cols.map((col) => col[row] || 0));
    const rhs = Array.from({ length: size }, (_, row) => N[row] || 0);
    const sol = this.solveLinear(M, rhs);
    if (!sol) return null;
    const K = sol[deg];
    const R = this.polyTrim(sol.slice(0, deg));
    s.push('Reduction: find R(x) and K with P = R′·Q + ½·R·Q′ + K, so ∫P/√Q dx = R(x)·√Q + K·∫dx/√Q');
    const rootPart = R.length ? this.mul(this.polyToNode(R), this.fn('sqrt', b)) : null;
    const basePart = Math.abs(K) < 1e-14 ? null : this.mul(this.num(K), base);
    if (rootPart && basePart) return this.add(rootPart, basePart);
    return rootPart || basePart || this.num(0);
  },

  // ============================================================ 7. u-substitution
  mapTree(n, f) {
    const r = f(n);
    if (r !== undefined) return r;
    switch (n.t) {
      case 'num': case 'var': case 'u': return n;
      case 'neg': return { t: 'neg', a: this.mapTree(n.a, f) };
      case 'fn': return { t: 'fn', name: n.name, a: this.mapTree(n.a, f) };
      default: return { t: n.t, a: this.mapTree(n.a, f), b: this.mapTree(n.b, f) };
    }
  },
  hasVar(n) {
    switch (n.t) {
      case 'var': return true;
      case 'num': case 'u': return false;
      case 'neg': case 'fn': return this.hasVar(n.a);
      default: return this.hasVar(n.a) || this.hasVar(n.b);
    }
  },
  size(n) {
    switch (n.t) {
      case 'num': case 'var': case 'u': return 1;
      case 'neg': case 'fn': return 1 + this.size(n.a);
      default: return 1 + this.size(n.a) + this.size(n.b);
    }
  },

  // Sub-expressions that could be the inner function g in f(g(x))·g'(x).
  substitutionCandidates(n) {
    const found = new Map();
    const add = (g) => { if (g.t !== 'var' && !this.isConst(g)) found.set(this.key(g), g); };
    const walk = (m) => {
      switch (m.t) {
        case 'fn': add(m); add(m.a); walk(m.a); break; // u = f(x) itself (ln x for ln(x)/x) or its argument
        case 'pow': add(m.a); add(m.b); walk(m.a); walk(m.b); break;
        case 'div': add(m.b); walk(m.a); walk(m.b); break;
        case 'neg': walk(m.a); break;
        case 'num': case 'var': break;
        default: walk(m.a); walk(m.b);
      }
    };
    walk(n);
    // exponentials as a whole (u = eˣ) and powers of x with divisors of the exponent (x⁴ also suggests u = x²)
    const walkExtra = (m) => {
      if (m.t === 'num' || m.t === 'var') return;
      if (this.expArg(m) !== null) add(m);
      if (m.t === 'pow' && m.a.t === 'var' && this.isNum(m.b) && Number.isInteger(m.b.v) && m.b.v >= 2) {
        for (let d = 2; d <= m.b.v; d++) if (m.b.v % d === 0) add(this.pow(m.a, this.num(d)));
      }
      if (m.t === 'neg' || m.t === 'fn') walkExtra(m.a);
      else if (m.t !== 'neg') { walkExtra(m.a); walkExtra(m.b); }
    };
    walkExtra(n);
    const lin = (g) => (this.linearCoeff(g) !== null ? 1 : 0); // non-linear inner functions are tried first
    return [...found.values()].sort((p, q) => lin(p) - lin(q) || this.size(p) - this.size(q)).slice(0, 10);
  },

  // The replacement rule for u = g. Besides g itself, a power of x becomes the matching power of u
  // when g = x^d (x⁴ -> u² for u = x²), and e^(m·x) becomes u^(m/a) when g = e^(a·x) (e^(2x) -> u²).
  substituter(g) {
    const U = { t: 'u' };
    const pw = (k) => (k === 1 ? U : { t: 'pow', a: U, b: this.num(k) });
    const gPow = g.t === 'pow' && g.a.t === 'var' && this.isNum(g.b) ? g.b.v : null;
    const through0 = (arg) => { const a = this.linearCoeff(arg); return a !== null && Math.abs(this.evalAt(arg, 0)) < 1e-14 ? a : null; };
    const gExp = this.expArg(g) !== null ? through0(this.expArg(g)) : null;
    return (m) => {
      if (this.same(m, g)) return U;
      if (gPow && m.t === 'pow' && m.a.t === 'var' && this.isNum(m.b) && Number.isInteger(m.b.v / gPow) && m.b.v / gPow !== 0) return pw(m.b.v / gPow);
      if (gExp !== null && this.expArg(m) !== null) {
        const mm = through0(this.expArg(m));
        if (mm !== null && Number.isInteger(mm / gExp) && mm !== 0) return pw(mm / gExp);
      }
      return undefined;
    };
  },

  integUSub(n, s, depth) {
    if (depth > 3) return null;
    for (const g of this.substitutionCandidates(n)) {
      const dg = this.simplify(this.diff(g));
      if (this.isNum(dg, 0)) continue;
      const h = this.simplify(this.div(n, dg));
      const hu = this.mapTree(h, this.substituter(g));
      if (this.hasVar(hu)) continue; // the integrand is not a function of g alone
      const inner = [];
      const Fu = this.integ(this.simplify(this.mapTree(hu, (m) => (m.t === 'u' ? { t: 'var' } : undefined))), inner, depth + 1);
      if (!Fu) continue;
      s.push(`Substitution u = ${this.S(g)}, du = (${this.S(dg)}) dx`, ...inner, 'Substitute back u = ' + this.S(g));
      return this.mapTree(Fu, (m) => (m.t === 'var' ? g : undefined));
    }
    return null;
  },

  // Fractional powers of x (√x, x^(1/3), x^(2/3)...): substitute x = uᵏ, dx = k·uᵏ⁻¹ du, where k is the
  // common denominator of the exponents. The integrand becomes a function of u without roots.
  integRootSub(n, s, depth) {
    if (depth > 2) return null;
    const exps = [];
    const scan = (m) => {
      switch (m.t) {
        case 'pow':
          if (m.a.t === 'var' && this.isNum(m.b)) { if (!Number.isInteger(m.b.v)) exps.push(m.b.v); } else { scan(m.a); scan(m.b); }
          break;
        case 'fn': if (m.name === 'sqrt' && m.a.t === 'var') exps.push(0.5); else scan(m.a); break;
        case 'num': case 'var': break;
        case 'neg': scan(m.a); break;
        default: scan(m.a); scan(m.b);
      }
    };
    scan(n);
    if (!exps.length) return null;
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let k = 1;
    for (const e of exps) {
      const fr = this.asFraction(e);
      if (!fr) return null;
      k = (k * Math.abs(fr[1])) / gcd(k, Math.abs(fr[1]));
    }
    if (k < 2 || k > 6) return null;

    const U = { t: 'var' };
    const mapped = this.mapTree(n, (m) => {
      if (m.t === 'pow' && m.a.t === 'var' && this.isNum(m.b)) return this.pow(U, this.num(m.b.v * k));
      if (m.t === 'fn' && m.name === 'sqrt' && m.a.t === 'var') return this.pow(U, this.num(k / 2));
      if (m.t === 'var') return this.pow(U, this.num(k));
      return undefined;
    });
    const h = this.simplify(this.mul(mapped, this.mul(this.num(k), this.pow(U, this.num(k - 1)))));
    const inner = [];
    const Fu = this.integ(h, inner, depth + 1);
    if (!Fu) return null;
    const root = k === 2 ? this.fn('sqrt', U) : this.pow(U, this.num(1 / k));
    s.push(`Root substitution: x = uᵏ with k = ${k}, so u = x^(1/${k}) and dx = ${k}·u^${k - 1} du`, ...inner, 'Substitute back u = x^(1/' + k + ')');
    return this.mapTree(Fu, (m) => (m.t === 'var' ? root : undefined));
  },

  // ============================================================ 8. integration by parts
  // LIATE: inverse trig (1), logarithm (2), algebraic (3), trig (4), exponential (5).
  rank(b) {
    if (b.t === 'fn') {
      if (['atan', 'asin', 'acos'].includes(b.name)) return 1;
      if (b.name === 'ln' || b.name === 'lgten') return 2;
      if (['sin', 'cos', 'tan'].includes(b.name)) return 4;
      if (b.name === 'exp') return 5;
      return 6;
    }
    if (this.expArg(b) !== null) return 5;
    if (this.toPoly(b)) return 3;
    return 6;
  },

  integParts(n, s, depth) {
    if (depth > 4) return null;
    const fz = this.factorize(n);
    if (fz.zeroDiv || !fz.atoms.length) return null;
    const atoms = fz.atoms.map((a) => ({ b: a.b, e: a.e, r: this.rank(a.b) }));
    const order = atoms.map((_, i) => i).filter((i) => atoms[i].r <= 4).sort((i, j) => atoms[i].r - atoms[j].r);
    for (const i of order) {
      const u = this.buildProduct(1, [{ b: atoms[i].b, e: atoms[i].e }]);
      const dv = this.buildProduct(fz.c, atoms.filter((_, j) => j !== i).map(({ b, e }) => ({ b, e })));
      const inner = [];
      const V = this.integ(dv, inner, depth + 1);
      if (!V) continue;
      const du = this.simplify(this.diff(u));
      const rest = this.integ(this.simplify(this.mul(V, du)), inner, depth + 1);
      if (!rest) continue;
      s.push(`Integration by parts: u = ${this.S(u)}, dv = ${this.S(dv)} dx, so v = ${this.S(V)}  (∫u dv = uv − ∫v du)`, ...inner);
      return this.sub(this.mul(u, V), rest);
    }
    return null;
  },
});
