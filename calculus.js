// --- CALCULUS TOOLS MODULE ---
// Expressions are parsed into an AST, so differentiation handles the sum, product,
// quotient, power and chain rules for any nesting. Integration is rule-based on
// the AST (linear substitution) and says so when no closed form is known.
// Definite integrals use Simpson's rule, evaluated with the calculator's own parser.
//
// AST nodes: {t:'num',v} {t:'var'} {t:'neg',a} {t:'add',a,b} {t:'sub',a,b}
//            {t:'mul',a,b} {t:'div',a,b} {t:'pow',a,b} {t:'fn',name,a}
window.CalculusTools = {
  app: null,

  init(appInstance) {
    this.app = appInstance;
    this.bindEvents();
  },

  bindEvents() {
    const diffBtn  = document.getElementById('diff-calculate-btn');
    const integBtn = document.getElementById('integ-calculate-btn');

    if (diffBtn)  diffBtn.addEventListener('click',  () => this.differentiate());
    if (integBtn) integBtn.addEventListener('click', () => this.integrate());

    const diffInput  = document.getElementById('diff-function-input');
    const integInput = document.getElementById('integ-function-input');
    if (diffInput)  diffInput.addEventListener('keydown',  e => { if (e.key === 'Enter') this.differentiate(); });
    if (integInput) integInput.addEventListener('keydown', e => { if (e.key === 'Enter') this.integrate(); });
  },

  // ============================================================
  //  UI HANDLERS
  // ============================================================
  differentiate() {
    const funcStr  = document.getElementById('diff-function-input').value.trim();
    const pointStr = document.getElementById('diff-point-input').value.trim();
    const resultEl = document.getElementById('diff-result-value');
    const stepsEl  = document.getElementById('diff-result-steps');

    if (!funcStr) {
      resultEl.textContent = 'Please enter a function.';
      stepsEl.textContent = '';
      return;
    }

    try {
      const { symbolic, steps, ast } = this.symbolicDerivative(funcStr);
      let output = `f′(x) = ${symbolic}`;

      if (pointStr !== '') {
        const xVal = this.evalConstant(pointStr);
        const exact = this.compileAST(ast)(xVal);
        const numeric = this.numericalDerivative(funcStr, xVal);
        output += `\n\nAt x = ${this.fmt(xVal)}: f′ = ${this.fmt(exact)}` +
                  `\n(numerical check: ${this.fmt(numeric)})`;
      }

      resultEl.textContent = output;
      stepsEl.textContent = steps.length > 0 ? '── Steps ──\n' + steps.join('\n') : '';
      if (this.app) this.app.playBeep(600, 0.06, 0.02);
    } catch (err) {
      resultEl.textContent = 'Could not differentiate. Check your syntax.';
      stepsEl.textContent = 'Error: ' + err.message;
    }
  },

  integrate() {
    const funcStr  = document.getElementById('integ-function-input').value.trim();
    const lowerStr = document.getElementById('integ-lower-input').value.trim();
    const upperStr = document.getElementById('integ-upper-input').value.trim();
    const resultEl = document.getElementById('integ-result-value');
    const stepsEl  = document.getElementById('integ-result-steps');

    if (!funcStr) {
      resultEl.textContent = 'Please enter a function.';
      stepsEl.textContent = '';
      return;
    }

    try {
      const { symbolic, steps, ast } = this.symbolicAntiderivative(funcStr); // symbolic is null if no closed form
      const antiderivText = symbolic === null
        ? 'no closed form found by the built-in methods'
        : `${symbolic} + C`;

      if (lowerStr !== '' && upperStr !== '') {
        const a = this.evalConstant(lowerStr);
        const b = this.evalConstant(upperStr);
        const simpson = this.simpsonsRule(funcStr, a, b, 1000);
        if (!Number.isFinite(simpson)) throw new Error('Integrand is undefined or diverges on part of [a, b]');

        // With an antiderivative we can compute F(b) − F(a) exactly and use Simpson's rule as an
        // independent check. If they disagree (a pole or jump inside [a, b]), say so.
        let value = simpson, method, unreliable = null;
        if (ast) {
          const F = this.compileAST(ast);
          const exact = F(b) - F(a);
          if (Number.isFinite(exact) && Math.abs(exact - simpson) <= 1e-6 * Math.max(1, Math.abs(simpson))) {
            value = exact;
            method = "F(b) − F(a), cross-checked against Simpson's rule (agree to 1e-6)";
          } else {
            method = 'the two methods disagree';
            unreliable = `F(b) − F(a) = ${this.fmt(exact)}  but  Simpson's rule = ${this.fmt(simpson)}`;
          }
        } else {
          method = "Simpson's rule (n = 1000); no closed form, so no exact cross-check";
        }

        if (unreliable) {
          // Show no value: a number that two independent methods dispute would be a guess.
          resultEl.textContent =
            `No reliable value for ∫ from ${this.fmt(a)} to ${this.fmt(b)}.\n\n${unreliable}\n\n` +
            '⚠ The integrand probably has a singularity or jump inside [a, b] (for example 1/x across 0), ' +
            'so the integral may diverge and the antiderivative does not apply across it.\n\n' +
            `Antiderivative: F(x) = ${antiderivText}`;
        } else {
          resultEl.textContent =
            `∫ from ${this.fmt(a)} to ${this.fmt(b)} of f(x) dx = ${this.fmt(value)}\n\n` +
            `Antiderivative: F(x) = ${antiderivText}`;
        }
        stepsEl.textContent =
          `── Method: ${method} ──\n` +
          (steps.length > 0 ? '\n── Symbolic steps ──\n' + steps.join('\n') : '');
      } else {
        resultEl.textContent = `F(x) = ${antiderivText}`;
        stepsEl.textContent = steps.length > 0 ? '── Steps ──\n' + steps.join('\n') : '';
      }

      if (this.app) this.app.playBeep(600, 0.06, 0.02);
    } catch (err) {
      resultEl.textContent = 'Could not integrate. Check your syntax.';
      stepsEl.textContent = 'Error: ' + err.message;
    }
  },

  // ============================================================
  //  PUBLIC SYMBOLIC API (pure — no DOM; used by tests)
  // ============================================================
  // `symbolic` is for display (12 significant digits); `ast` is the exact tree, and
  // compileAST(ast) evaluates it without going through the rounded text.
  symbolicDerivative(expr) {
    const steps = [];
    const d = this.simplify(this.diff(this.simplify(this.parseAST(expr)), steps));
    return { symbolic: this.toStr(d), steps, ast: d };
  },

  // symbolic/ast are null when no method applies. Every candidate answer is checked numerically
  // (its derivative must reproduce the integrand) before it is returned, so a rule bug becomes
  // "no closed form found" rather than a confident wrong answer. The engine is in integration.js.
  symbolicAntiderivative(expr) {
    const steps = [];
    const f = this.simplify(this.parseAST(expr));
    const F = this.antiderivativeOf(f, steps);
    const ast = F ? this.simplify(F) : null;
    return { symbolic: ast ? this.toStr(ast) : null, steps, ast, integrand: f };
  },

  // Fast evaluator for an AST: x -> number (NaN outside the domain).
  compileAST(ast) {
    return (x) => this.evalAt(ast, x);
  },

  // ============================================================
  //  AST PARSER  (convention here: log = natural log, log10 = base 10)
  // ============================================================
  parseAST(src) {
    const s = src.replace(/log10\(/gi, 'lgten(');
    const tokens = [];
    const re = /\s*(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+|[a-zA-Zπ]+|[-+*/^()])/gy;
    let m;
    let last = 0;
    while ((m = re.exec(s)) !== null) {
      tokens.push(m[1]);
      last = re.lastIndex;
    }
    if (s.slice(last).trim() !== '') throw new Error(`Unexpected character near "${s.slice(last).trim()[0]}"`);

    let i = 0;
    const peek = () => tokens[i];
    const take = () => tokens[i++];
    const FUNCS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'lgten', 'exp', 'sqrt', 'abs'];
    const isNum = t => t !== undefined && /^[\d.]/.test(t);
    const startsFactor = t => t !== undefined && (isNum(t) || t === '(' || /^[a-zA-Zπ]/.test(t));

    const parseExpr = () => {
      let node = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = take();
        const rhs = parseTerm();
        node = { t: op === '+' ? 'add' : 'sub', a: node, b: rhs };
      }
      return node;
    };
    const parseTerm = () => {
      let node = parseUnary();
      for (;;) {
        if (peek() === '*' || peek() === '/') {
          const op = take();
          node = { t: op === '*' ? 'mul' : 'div', a: node, b: parseUnary() };
        } else if (startsFactor(peek()) && !(isNum(peek()) && isNum(tokens[i - 1]))) {
          node = { t: 'mul', a: node, b: parsePower() }; // implicit: 2x, 3(x+1), 2sin(x)
        } else {
          return node;
        }
      }
    };
    const parseUnary = () => {
      if (peek() === '-') { take(); return { t: 'neg', a: parseUnary() }; }
      if (peek() === '+') { take(); return parseUnary(); }
      return parsePower();
    };
    const parsePower = () => {
      const base = parsePrimary();
      if (peek() === '^') { take(); return { t: 'pow', a: base, b: parseUnary() }; }
      return base;
    };
    const parsePrimary = () => {
      const tok = take();
      if (tok === undefined) throw new Error('Unexpected end of expression');
      if (isNum(tok)) return { t: 'num', v: parseFloat(tok) };
      if (tok === '(') {
        const inner = parseExpr();
        if (take() !== ')') throw new Error('Missing closing parenthesis');
        return inner;
      }
      const w = tok.toLowerCase();
      if (w === 'x') return { t: 'var' };
      if (w === 'pi' || w === 'π') return { t: 'num', v: Math.PI, sym: 'pi' };
      if (w === 'e') return { t: 'num', v: Math.E, sym: 'e' };
      if (FUNCS.includes(w)) {
        let arg;
        if (peek() === '(') {
          take();
          arg = parseExpr();
          if (take() !== ')') throw new Error('Missing closing parenthesis');
        } else {
          arg = parseUnary();
        }
        return { t: 'fn', name: w === 'log' ? 'ln' : w, a: arg };
      }
      throw new Error(`Unknown symbol: ${tok}`);
    };

    const ast = parseExpr();
    if (i < tokens.length) throw new Error(`Unexpected "${tokens[i]}"`);
    return ast;
  },

  // ---- AST constructors (with light algebraic simplification) ----
  num(v) { return { t: 'num', v }; },
  isNum(n, v) { return n.t === 'num' && !n.sym && (v === undefined || n.v === v); },

  add(a, b) {
    if (this.isNum(a, 0)) return b;
    if (this.isNum(b, 0)) return a;
    if (this.isNum(a) && this.isNum(b)) return this.num(a.v + b.v);
    return { t: 'add', a, b };
  },
  sub(a, b) {
    if (this.isNum(b, 0)) return a;
    if (this.isNum(a, 0)) return this.neg(b);
    if (this.isNum(a) && this.isNum(b)) return this.num(a.v - b.v);
    if (this.same(a, b)) return this.num(0); // u - u = 0 (also keeps d/dx of a constant-zero function at 0, not NaN)
    return { t: 'sub', a, b };
  },
  // Canonical string for a tree; two trees are structurally equal iff their keys match.
  key(n) {
    switch (n.t) {
      case 'num': return n.sym ? `#${n.sym}` : `#${n.v}`;
      case 'var': return 'x';
      case 'u':   return 'u';
      case 'neg': return `(-${this.key(n.a)})`;
      case 'fn':  return `${n.name}(${this.key(n.a)})`;
      default:    return `(${this.key(n.a)}${n.t}${this.key(n.b)})`;
    }
  },
  same(a, b) { return this.key(a) === this.key(b); },
  neg(a) {
    if (this.isNum(a)) return this.num(-a.v);
    if (a.t === 'neg') return a.a;
    if (a.t === 'mul' && this.isNum(a.a)) return this.mul(this.num(-a.a.v), a.b); // -(3*y) -> -3*y
    return { t: 'neg', a };
  },
  mul(a, b) {
    if (this.isNum(a, 0) || this.isNum(b, 0)) return this.num(0);
    // pull signs out and merge numeric coefficients: 2*(2*x) -> 4*x, 3*(-y) -> -3*y
    if (a.t === 'neg') return this.neg(this.mul(a.a, b));
    if (b.t === 'neg') return this.neg(this.mul(a, b.a));
    if (this.isNum(a) && b.t === 'mul' && this.isNum(b.a)) return this.mul(this.num(a.v * b.a.v), b.b);
    // 3*(y/3) -> y,  2*(y/4) -> 0.5*y
    if (this.isNum(a) && b.t === 'div' && this.isNum(b.b) && b.b.v !== 0) return this.mul(this.num(a.v / b.b.v), b.a);
    // keep every numeric coefficient at the front: x*(2*y) -> 2*(x*y)
    if (!this.isNum(a) && b.t === 'mul' && this.isNum(b.a)) return this.mul(b.a, this.mul(a, b.b));
    if (a.t === 'mul' && this.isNum(a.a) && !this.isNum(b)) return this.mul(a.a, this.mul(a.b, b));
    if (this.isNum(a, 1)) return b;
    if (this.isNum(b, 1)) return a;
    if (this.isNum(a, -1)) return this.neg(b);
    if (this.isNum(b, -1)) return this.neg(a);
    if (this.isNum(a) && this.isNum(b)) return this.num(a.v * b.v);
    // keep numeric coefficients on the left: x*2 -> 2*x
    if (this.isNum(b) && !this.isNum(a)) return { t: 'mul', a: b, b: a };
    return { t: 'mul', a, b };
  },
  div(a, b) {
    if (this.isNum(a, 0)) return this.num(0);
    if (this.isNum(b, 1)) return a;
    if (this.isNum(a) && this.isNum(b) && b.v !== 0) return this.num(a.v / b.v);
    return { t: 'div', a, b };
  },
  pow(a, b) {
    if (this.isNum(b, 0)) return this.num(1);
    if (this.isNum(b, 1)) return a;
    if (this.isNum(a) && this.isNum(b)) {
      const v = Math.pow(a.v, b.v);
      if (Number.isFinite(v)) return this.num(v); // (-8)^(1/3) is NaN: leave it as an expression
    }
    // (b^p)^q = b^(pq) is always valid for an integer q
    if (a.t === 'pow' && this.isNum(a.b) && this.isNum(b) && Number.isInteger(b.v)) return this.pow(a.a, this.num(a.b.v * b.v));
    return { t: 'pow', a, b };
  },
  // Folds only exact integer results of a plain number (sin 0 = 0, exp 0 = 1, sqrt 4 = 2),
  // so symbolic constants and values like sin(1) stay in exact form.
  fn(name, a) {
    if (this.isNum(a)) {
      const f = Math[{ ln: 'log', lgten: 'log10' }[name] || name];
      const v = f ? f(a.v) : NaN;
      if (Number.isInteger(v) && Math.abs(v) < 1e6) return this.num(v);
    }
    return { t: 'fn', name, a };
  },

  // ---- normal forms -------------------------------------------------------------------
  // A product is a coefficient times factors base^exponent; factors with the same base merge,
  // so x*x -> x^2, x/x -> 1, sqrt(x)*x -> x^1.5 and 2x*cos(x^2)/(2x) -> cos(x^2).
  // (x/x -> 1 assumes x != 0, the usual convention for simplifying.)
  factorize(n) {
    const out = { c: 1, atoms: [], zeroDiv: false };
    const addAtom = (b, e) => {
      if (b.t === 'num' && !b.sym) {
        const v = Math.pow(b.v, e);
        if (Number.isFinite(v)) { out.c *= v; return; }
      }
      const k = this.key(b);
      const hit = out.atoms.find((a) => a.k === k);
      if (hit) hit.e += e; else out.atoms.push({ b, e, k });
    };
    const walk = (m, p) => {
      switch (m.t) {
        case 'mul': walk(m.a, p); walk(m.b, p); return;
        case 'div': walk(m.a, p); walk(m.b, -p); return;
        case 'neg':
          if (Number.isInteger(p)) { if (Math.abs(p) % 2 === 1) out.c *= -1; walk(m.a, p); return; }
          addAtom(m, p); return;
        case 'num':
          if (m.sym) { addAtom(m, p); return; }
          if (m.v === 0 && p < 0) { out.zeroDiv = true; return; }
          out.c *= Math.pow(m.v, p); return;
        case 'pow':
          if (this.isNum(m.b)) {
            const q = m.b.v;
            if (Number.isInteger(q) && ['mul', 'div', 'neg', 'num'].includes(m.a.t)) { walk(m.a, p * q); return; }
            addAtom(m.a, p * q); return;
          }
          addAtom(m, p); return;
        case 'fn':
          if (m.name === 'sqrt') { addAtom(m.a, 0.5 * p); return; }
          addAtom(m, p); return;
        default: addAtom(m, p);
      }
    };
    walk(n, 1);
    out.atoms = out.atoms.filter((a) => Math.abs(a.e) > 1e-12);
    return out;
  },

  // A float that is really p/q for a small q, as [p, q]; else null. (0.333333333333 -> [1, 3])
  asFraction(c) {
    if (Number.isInteger(c) || !Number.isFinite(c)) return null;
    for (let q = 2; q <= 1000; q++) {
      const p = Math.round(c * q);
      if (Math.abs(c - p / q) <= 1e-12 * Math.max(1, Math.abs(c))) return [p, q];
    }
    return null;
  },

  buildProduct(c, atoms) {
    if (c === 0) return this.num(0);
    const top = [], bottom = [];
    for (const { b, e } of atoms) {
      const m = Math.abs(e);
      const t = m === 0.5 ? this.fn('sqrt', b) : this.pow(b, this.num(m));
      (e > 0 ? top : bottom).push(t);
    }
    // 1/3 prints as x^3/3, not 0.333333333333*x^3
    const frac = this.asFraction(c);
    let num = this.num(frac ? frac[0] : c);
    for (const t of top) num = this.mul(num, t);
    if (frac) bottom.unshift(this.num(frac[1]));
    if (!bottom.length) return num;
    let den = bottom[0];
    for (let i = 1; i < bottom.length; i++) den = this.mul(den, bottom[i]);
    return this.div(num, den);
  },

  normMul(m) {
    if (m.t !== 'mul' && m.t !== 'div') return m;
    const fz = this.factorize(m);
    return fz.zeroDiv ? m : this.buildProduct(fz.c, fz.atoms);
  },

  // Collects like terms: 2x + 3x -> 5x, sin(x) - sin(x) -> 0, x*e^x - 2*x*e^x -> -x*e^x.
  normAdd(m) {
    if (m.t !== 'add' && m.t !== 'sub') return m;
    const terms = [];
    const collect = (node, sign) => {
      if (node.t === 'add') { collect(node.a, sign); collect(node.b, sign); return; }
      if (node.t === 'sub') { collect(node.a, sign); collect(node.b, -sign); return; }
      const fz = this.factorize(node);
      if (fz.zeroDiv) { terms.push({ k: this.key(node), atoms: [{ b: node, e: 1 }], c: sign }); return; }
      const k = fz.atoms.map((a) => `${a.k}^${a.e}`).sort().join('*');
      const hit = terms.find((t) => t.k === k);
      if (hit) hit.c += sign * fz.c; else terms.push({ k, atoms: fz.atoms, c: sign * fz.c });
    };
    collect(m, 1);
    let out = null;
    for (const t of terms) {
      if (t.c === 0) continue;
      const term = this.buildProduct(t.c, t.atoms);
      out = out === null ? term : this.add(out, term);
    }
    return out === null ? this.num(0) : out;
  },

  // k*(a + b) -> k*a + k*b for a numeric k, so like terms can combine afterwards.
  distribute(m) {
    const isSum = (t) => t.t === 'add' || t.t === 'sub';
    if (m.t === 'mul' && this.isNum(m.a) && isSum(m.b)) {
      const f = m.b.t === 'add' ? this.add : this.sub;
      return this.simplify(f.call(this, this.mul(m.a, m.b.a), this.mul(m.a, m.b.b)));
    }
    // (a + b)/k -> a/k + b/k and -(a + b) -> -a - b, so the pieces can merge with their neighbours
    if (m.t === 'div' && this.isNum(m.b) && m.b.v !== 0 && isSum(m.a)) {
      const f = m.a.t === 'add' ? this.add : this.sub;
      return this.simplify(f.call(this, this.div(m.a.a, m.b), this.div(m.a.b, m.b)));
    }
    if (m.t === 'neg' && isSum(m.a)) {
      return this.simplify(m.a.t === 'add' ? this.sub(this.neg(m.a.a), m.a.b) : this.add(this.neg(m.a.a), m.a.b));
    }
    return m;
  },

  // Re-runs the constructors bottom-up so every smart rule is applied once more.
  simplify(n) {
    switch (n.t) {
      case 'num': case 'var': case 'u': return n;
      case 'neg': return this.distribute(this.neg(this.simplify(n.a)));
      case 'fn':  return this.fn(n.name, this.simplify(n.a));
      case 'add': return this.normAdd(this.add(this.simplify(n.a), this.simplify(n.b)));
      case 'sub': return this.normAdd(this.sub(this.simplify(n.a), this.simplify(n.b)));
      case 'mul': return this.distribute(this.normMul(this.mul(this.simplify(n.a), this.simplify(n.b))));
      case 'div': return this.distribute(this.normMul(this.div(this.simplify(n.a), this.simplify(n.b))));
      case 'pow': return this.pow(this.simplify(n.a), this.simplify(n.b));
    }
    return n;
  },

  // True when the subtree contains no x.
  isConst(n) {
    switch (n.t) {
      case 'num': return true;
      case 'var': return false;
      case 'neg': case 'fn': return this.isConst(n.a);
      default: return this.isConst(n.a) && this.isConst(n.b);
    }
  },

  // ============================================================
  //  DIFFERENTIATION
  // ============================================================
  diff(n, steps) {
    const note = (s) => { if (steps) steps.push(s); };
    const S = (x) => this.toStr(this.simplify(x));

    if (this.isConst(n)) { if (n.t !== 'num') note(`d/dx[${S(n)}] = 0  (constant)`); return this.num(0); }

    switch (n.t) {
      case 'var': return this.num(1);
      case 'neg': return this.neg(this.diff(n.a, steps));
      case 'add': note(`Sum rule on ${S(n)}`);        return this.add(this.diff(n.a, steps), this.diff(n.b, steps));
      case 'sub': note(`Difference rule on ${S(n)}`); return this.sub(this.diff(n.a, steps), this.diff(n.b, steps));
      case 'mul': {
        note(`Product rule on ${S(n)}: (uv)′ = u′v + uv′`);
        return this.add(this.mul(this.diff(n.a, steps), n.b), this.mul(n.a, this.diff(n.b, steps)));
      }
      case 'div': {
        note(`Quotient rule on ${S(n)}: (u/v)′ = (u′v − uv′)/v²`);
        return this.div(
          this.sub(this.mul(this.diff(n.a, steps), n.b), this.mul(n.a, this.diff(n.b, steps))),
          this.pow(n.b, this.num(2)));
      }
      case 'pow': {
        if (this.isConst(n.b)) {
          note(`Power rule + chain rule on ${S(n)}: (uⁿ)′ = n·uⁿ⁻¹·u′`);
          return this.mul(this.mul(n.b, this.pow(n.a, this.sub(n.b, this.num(1)))), this.diff(n.a, steps));
        }
        if (this.isConst(n.a)) {
          note(`Exponential rule on ${S(n)}: (aᵘ)′ = aᵘ·ln(a)·u′`);
          return this.mul(this.mul(n, this.fn('ln', n.a)), this.diff(n.b, steps));
        }
        note(`General power on ${S(n)}: (uᵛ)′ = uᵛ·(v′·ln u + v·u′/u)`);
        return this.mul(n, this.add(
          this.mul(this.diff(n.b, steps), this.fn('ln', n.a)),
          this.div(this.mul(n.b, this.diff(n.a, steps)), n.a)));
      }
      case 'fn': {
        const u = n.a;
        const du = this.diff(u, steps);
        let outer;
        switch (n.name) {
          case 'sin':   outer = this.fn('cos', u); break;
          case 'cos':   outer = this.neg(this.fn('sin', u)); break;
          case 'tan':   outer = this.div(this.num(1), this.pow(this.fn('cos', u), this.num(2))); break;
          case 'asin':  outer = this.div(this.num(1), this.fn('sqrt', this.sub(this.num(1), this.pow(u, this.num(2))))); break;
          case 'acos':  outer = this.neg(this.div(this.num(1), this.fn('sqrt', this.sub(this.num(1), this.pow(u, this.num(2)))))); break;
          case 'atan':  outer = this.div(this.num(1), this.add(this.num(1), this.pow(u, this.num(2)))); break;
          case 'ln':    outer = this.div(this.num(1), u); break;
          case 'lgten': outer = this.div(this.num(1), this.mul(u, this.fn('ln', this.num(10)))); break;
          case 'exp':   outer = this.fn('exp', u); break;
          case 'sqrt':  outer = this.div(this.num(1), this.mul(this.num(2), this.fn('sqrt', u))); break;
          case 'abs':   outer = this.div(u, this.fn('abs', u)); break;
          default: throw new Error(`Cannot differentiate ${n.name}`);
        }
        note(`d/dx[${n.name}(u)] with u = ${S(u)}` + (this.isNum(du, 1) ? '' : '  (chain rule)'));
        return this.mul(outer, du);
      }
    }
    throw new Error('Unsupported expression');
  },

  // The positive counterpart of a visibly negative term (-y, -3, -2*y), or null.
  negatedOf(b) {
    if (b.t === 'neg') return b.a;
    if (this.isNum(b) && b.v < 0) return this.num(-b.v);
    if (b.t === 'mul' && this.isNum(b.a) && b.a.v < 0) return this.mul(this.num(-b.a.v), b.b);
    if (b.t === 'div') { const a = this.negatedOf(b.a); return a && this.div(a, b.b); }
    return null;
  },

  // If node = a·x + b with numeric a ≠ 0, returns a; otherwise null.
  linearCoeff(n) {
    const d = this.simplify(this.diff(n));
    if (d.t === 'num' && d.v !== 0) return d.v;
    return null;
  },

  // Numeric value of a constant subtree (x-free).
  evalNode(n) {
    if (n.t === 'var') throw new Error('Not a constant');
    return this.evalAt(n, 0);
  },

  // Numeric value of a tree at x.
  evalAt(n, x) {
    switch (n.t) {
      case 'num': return n.v;
      case 'var': return x;
      case 'neg': return -this.evalAt(n.a, x);
      case 'add': return this.evalAt(n.a, x) + this.evalAt(n.b, x);
      case 'sub': return this.evalAt(n.a, x) - this.evalAt(n.b, x);
      case 'mul': return this.evalAt(n.a, x) * this.evalAt(n.b, x);
      case 'div': return this.evalAt(n.a, x) / this.evalAt(n.b, x);
      case 'pow': return Math.pow(this.evalAt(n.a, x), this.evalAt(n.b, x));
      case 'fn':  return Math[{ ln: 'log', lgten: 'log10' }[n.name] || n.name](this.evalAt(n.a, x));
    }
    throw new Error('Unsupported expression');
  },

  // ============================================================
  //  AST -> STRING (minimal parentheses; output re-parses to the same tree)
  // ============================================================
  toStr(n, parentPrec = 0, rightSide = false, parentIsMul = false) {
    const PREC = { add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4 };
    let s;
    let prec = 5;
    switch (n.t) {
      case 'num':
        s = n.sym || this.fmt(n.v);
        if (n.v < 0 && !n.sym) prec = 3; // negative literal behaves like unary minus
        break;
      case 'var': s = 'x'; break;
      case 'neg':
        prec = PREC.neg;
        // -(a*b) and -(a/b) print without parentheses: -a*b is (-a)*b, the same value
        s = '-' + this.toStr(n.a, n.a.t === 'mul' || n.a.t === 'div' ? 2 : PREC.neg);
        break;
      case 'fn': {
        const name = n.name === 'lgten' ? 'log10' : n.name;
        s = `${name}(${this.toStr(n.a)})`;
        break;
      }
      case 'add': case 'sub': {
        prec = 1;
        // print "a + -2*x" as "a - 2*x"
        const flipped = n.t === 'add' ? this.negatedOf(n.b) : null;
        s = this.toStr(n.a, 1) + (n.t === 'sub' || flipped ? ' - ' : ' + ') + this.toStr(flipped || n.b, 1, true);
        break;
      }
      case 'mul': prec = 2;
        s = this.toStr(n.a, 2) + '*' + this.toStr(n.b, 2, true, true);
        break;
      case 'div': prec = 2;
        s = this.toStr(n.a, 2) + '/' + this.toStr(n.b, 2, true);
        break;
      case 'pow': prec = 4;
        s = this.toStr(n.a, 5) + '^' + this.toStr(n.b, 4);
        break;
    }
    // right operand of - and / needs parens at equal precedence; pow's base needs them for anything non-atomic
    // (multiplication is associative, so a*(b*c) prints as a*b*c)
    const needs = prec < parentPrec ||
      (rightSide && prec === parentPrec && parentPrec <= 2 && !(parentIsMul && n.t === 'mul'));
    return needs ? `(${s})` : s;
  },

  // ============================================================
  //  NUMERICS (use the calculator's parser; no eval / new Function)
  // ============================================================
  // Compiles an expression in x. Calculus input is always radians.
  makeFunction(expr) {
    // In this module "log" is natural log (matches parseAST); "log10(" is untouched
    // by this pattern and is understood by the calculator tokenizer as base 10.
    const prepared = expr.replace(/\blog\(/gi, 'ln(');
    const tokens = new MathParser(prepared, false, ['x']).tokenize();
    const vars = { x: 0 };
    const parser = new Parser(tokens, false, vars);
    return (x) => {
      vars.x = x;
      try { return parser.parse(); } catch (e) { return NaN; }
    };
  },

  evalConstant(str) {
    const tokens = new MathParser(str, false).tokenize();
    const v = new Parser(tokens, false).parse();
    if (!Number.isFinite(v)) throw new Error(`Invalid number: ${str}`);
    return v;
  },

  numericalDerivative(expr, x) {
    const f = this.makeFunction(expr);
    const h = 1e-5 * Math.max(1, Math.abs(x));
    return (f(x + h) - f(x - h)) / (2 * h);
  },

  simpsonsRule(expr, a, b, n = 1000) {
    if (n % 2 !== 0) n++;
    const f = this.makeFunction(expr);
    const h = (b - a) / n;
    let sum = f(a) + f(b);
    for (let i = 1; i < n; i++) {
      sum += (i % 2 === 0 ? 2 : 4) * f(a + i * h);
    }
    return (h / 3) * sum;
  },

  fmt(n) {
    if (!Number.isFinite(n)) return String(n);
    if (Number.isInteger(n)) return String(n);
    return String(parseFloat(n.toPrecision(12)));
  }
};
