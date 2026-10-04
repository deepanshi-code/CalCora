// --- FORMULA LIBRARY: page, cards and the Calculate dialog ---
// Data lives in formula-data.js, the equation solver in formula-solver.js and the unit table in units.js.
//
// Page: search, category pills, a Favorites pill, and a calm grid of cards (name, formula, one line of
// description, a Calculate button).
// Dialog: pick the variable to find, fill in the others (each with a unit picker), read the answer in any
// compatible unit. "Show working" reveals the equation, the rearrangement and the substitution.
(function () {
  const { formulas: FORMULAS, categoryLabels: CATEGORY_LABELS, parseList } = window.FormulaData;
  const Units = window.UnitCatalog;
  const Solver = window.FormulaSolver;

  const FAV_KEY = 'calcora_formula_favorites';
  const WORKING_KEY = 'calcora_formula_working';
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: ignore */ } },
  };

  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const formatValue = (x) => {
    const sc = window.ScientificCalculator;
    return sc && sc.formatNumber ? sc.formatNumber(x) : Solver.fmt(x);
  };

  // ---------------------------------------------------------------- units-aware solving (no DOM; tested)
  // entries: { id: { value, unit } } in whatever units the user chose. Values are converted to the unit the
  // equation works in, solved, and the answer converted to opts.targetUnit.
  function solveWithUnits(f, target, entries, opts = {}) {
    const meta = Object.fromEntries(f.vars.map((v) => [v.id, v]));
    const given = {};
    const conversions = [];
    for (const [id, e] of Object.entries(entries)) {
      const v = meta[id];
      let value = e.value;
      if (v && v.dim && e.unit && e.unit !== v.unit) {
        value = Units.convert(e.value, v.dim, e.unit, v.unit);
        conversions.push(`${v.sym}: ${formatValue(e.value)} ${e.unit} = ${formatValue(value)} ${v.unit}`);
      }
      given[id] = value;
    }
    const res = Solver.solve(f, target, given, { deg: opts.deg !== false });
    res.conversions = conversions;
    const tv = meta[target];
    res.targetUnit = opts.targetUnit || (tv && tv.unit) || '';
    if (!res.ok) return res;
    res.solutions.forEach((sol) => {
      sol.native = sol.value;
      sol.display = tv && tv.dim && res.targetUnit && res.targetUnit !== tv.unit
        ? Units.convert(sol.value, tv.dim, tv.unit, res.targetUnit)
        : sol.value;
    });
    return res;
  }

  window.FormulaLibrary = {
    app: null,
    activeCategory: 'all',
    formulas: FORMULAS,
    solveWithUnits,
    state: null,       // the open dialog

    init(appInstance) {
      this.app = appInstance;
      this.favorites = new Set(store.get(FAV_KEY, []));
      this.cacheDOM();
      this.addFavoritesPill();
      this.bindEvents();
      this.render('all', '');
    },

    cacheDOM() {
      this.searchInput = document.getElementById('formula-search-input');
      this.categoriesContainer = document.getElementById('formula-categories');
      this.resultsArea = document.getElementById('formula-results-area');
      this.countEl = el('div', 'formula-count');
      this.countEl.setAttribute('aria-live', 'polite');
      this.resultsArea.parentNode.insertBefore(this.countEl, this.resultsArea);
    },

    addFavoritesPill() {
      const b = el('button', 'formula-cat-btn formula-fav-pill');
      b.type = 'button';
      b.dataset.cat = 'favorites';
      this.favPill = b;
      this.categoriesContainer.appendChild(b);
      this.updateFavPill();
    },
    updateFavPill() { this.favPill.textContent = `★ Favorites${this.favorites.size ? ` (${this.favorites.size})` : ''}`; },

    bindEvents() {
      this.searchInput.addEventListener('input', () => this.render(this.activeCategory, this.searchInput.value));
      this.categoriesContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.formula-cat-btn');
        if (!btn) return;
        this.activeCategory = btn.dataset.cat;
        this.categoriesContainer.querySelectorAll('.formula-cat-btn').forEach((b) => b.classList.toggle('active', b === btn));
        this.render(this.activeCategory, this.searchInput.value);
      });
      this.resultsArea.addEventListener('click', (e) => {
        const card = e.target.closest('.fc');
        if (!card) return;
        const f = FORMULAS[Number(card.dataset.index)];
        const calc = e.target.closest('.formula-calc-btn');
        const copy = e.target.closest('.formula-copy-btn');
        const star = e.target.closest('.fc-star');
        if (calc) this.openSolver(f, calc);
        else if (copy) this.copyExpression(f, copy);
        else if (star) this.toggleFavorite(f, star);
      });
    },

    // =============================================================== page
    render(category, query) {
      const q = query.trim().toLowerCase();
      const matches = (f) => {
        if (category === 'favorites') { if (!this.favorites.has(f.name)) return false; }
        else if (category !== 'all' && f.category !== category) return false;
        if (!q) return true;
        return f.name.toLowerCase().includes(q) || f.expr.toLowerCase().includes(q) || f.desc.toLowerCase().includes(q) ||
          f.category.includes(q) || f.vars.some((v) => `${v.id} ${v.sym} ${v.name}`.toLowerCase().includes(q));
      };
      const filtered = FORMULAS.map((f, index) => ({ f, index })).filter(({ f }) => matches(f));
      this.countEl.textContent = filtered.length === FORMULAS.length ? `${FORMULAS.length} formulas` : `${filtered.length} of ${FORMULAS.length} formulas`;

      this.resultsArea.innerHTML = '';
      if (!filtered.length) {
        const empty = el('div', 'formula-no-results');
        empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        const msg = el('span');
        msg.textContent = category === 'favorites' && !q
          ? 'No favorites yet. Press the ☆ on a formula to keep it here.'
          : `No formulas matched "${query}".`;
        empty.appendChild(msg);
        this.resultsArea.appendChild(empty);
        return;
      }

      const grouped = {};
      filtered.forEach((item) => { (grouped[item.f.category] = grouped[item.f.category] || []).push(item); });
      Object.keys(grouped).forEach((cat) => {
        const section = el('section', 'formula-category-section');
        const title = el('h3', 'formula-category-title');
        title.append(el('span', '', CATEGORY_LABELS[cat] || cat), el('span', 'formula-category-count', String(grouped[cat].length)));
        const grid = el('div', 'formula-cards-grid');
        grouped[cat].forEach(({ f, index }) => grid.appendChild(this.buildCard(f, index)));
        section.append(title, grid);
        this.resultsArea.appendChild(section);
      });
    },

    buildCard(f, index) {
      const card = el('article', 'fc');
      card.dataset.index = index;
      const fav = this.favorites.has(f.name);

      const top = el('div', 'fc-top');
      const name = el('h4', 'fc-name', f.name);
      const star = el('button', 'fc-star', fav ? '★' : '☆');
      star.type = 'button';
      star.setAttribute('aria-pressed', String(fav));
      star.setAttribute('aria-label', `${fav ? 'Remove' : 'Add'} ${f.name} ${fav ? 'from' : 'to'} favorites`);
      top.append(name, star);

      const expr = el('div', 'fc-expr', f.expr);
      const desc = el('p', 'fc-desc', f.desc);
      const actions = el('div', 'fc-actions');

      if (f.solve === false) {
        const note = el('span', 'formula-no-calc', 'Reference only');
        note.title = f.why || '';
        actions.appendChild(note);
        desc.textContent = `${f.desc} ${f.why || ''}`.trim();
      } else {
        const calc = el('button', 'formula-calc-btn');
        calc.type = 'button';
        calc.setAttribute('aria-label', `Calculate with ${f.name}`);
        calc.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8.01" y2="11"/><line x1="12" y1="11" x2="12.01" y2="11"/><line x1="16" y1="11" x2="16.01" y2="11"/><line x1="8" y1="15" x2="8.01" y2="15"/><line x1="12" y1="15" x2="12.01" y2="15"/><line x1="16" y1="15" x2="16.01" y2="15"/></svg><span>Calculate</span>';
        actions.appendChild(calc);
      }
      const copy = el('button', 'formula-copy-btn');
      copy.type = 'button';
      copy.title = 'Copy formula';
      copy.setAttribute('aria-label', `Copy formula ${f.name}`);
      copy.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      actions.appendChild(copy);

      card.append(top, expr, desc, actions);
      return card;
    },

    toggleFavorite(f, btn) {
      if (this.favorites.has(f.name)) this.favorites.delete(f.name); else this.favorites.add(f.name);
      store.set(FAV_KEY, [...this.favorites]);
      this.updateFavPill();
      if (this.activeCategory === 'favorites') { this.render('favorites', this.searchInput.value); return; }
      const on = this.favorites.has(f.name);
      btn.textContent = on ? '★' : '☆';
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${f.name} ${on ? 'from' : 'to'} favorites`);
    },

    copyExpression(f, btn) {
      const flash = () => { btn.classList.add('done'); setTimeout(() => btn.classList.remove('done'), 900); };
      if (navigator.clipboard) navigator.clipboard.writeText(f.expr).then(flash, flash); else flash();
      if (this.app) this.app.playBeep(700, 0.06, 0.02);
    },

    // =============================================================== dialog shell
    ensureModal() {
      if (this.modal) return;
      const overlay = el('div', 'fm-overlay');
      overlay.hidden = true;
      const dialog = el('div', 'fm-dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'fm-title');
      dialog.tabIndex = -1;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      this.modal = overlay;
      this.dialog = dialog;
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.closeSolver(); });
      document.addEventListener('keydown', (e) => {
        if (overlay.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); this.closeSolver(); }
        if (e.key === 'Tab') this.trapFocus(e);
      });
    },

    trapFocus(e) {
      const items = [...this.dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, summary')].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    },

    usesTrig(f) { return (f.eqs || []).some((eq) => /\b(sin|cos|tan|asin|acos|atan)\(/.test(eq)); },

    targetsOf(f) {
      if (f.targets) return f.targets;
      const used = new Set();
      f.eqs.forEach((eq) => Solver.parseEquation(eq).vars.forEach((v) => used.add(v)));
      return f.vars.map((v) => v.id).filter((id) => used.has(id));
    },

    openSolver(f, opener) {
      this.ensureModal();
      const S = (this.state = { formula: f, target: null, deg: true, inputs: {}, units: {}, lists: {}, opener, last: null });
      const d = this.dialog;
      d.innerHTML = '';

      const header = el('div', 'fm-header');
      const titles = el('div', 'fm-titles');
      const h2 = el('h2', '', f.name);
      h2.id = 'fm-title';
      titles.append(h2, el('div', 'fm-expr', f.expr));
      const close = el('button', 'fm-close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('click', () => this.closeSolver());
      header.append(titles, close);

      const body = el('div', 'fm-body');
      d.append(header, body);
      if (f.dataset) this.buildDatasetForm(body, f, S); else this.buildSolveForm(body, f, S);

      const result = el('div', 'fm-result');
      result.setAttribute('role', 'status');
      result.setAttribute('aria-live', 'polite');
      S.resultEl = result;
      body.appendChild(result);

      this.modal.hidden = false;
      document.body.classList.add('fm-open');
      if (this.app) this.app.playBeep(620, 0.05, 0.02);
      (d.querySelector('input:not([disabled]), textarea') || d).focus();
      this.compute(false);
    },

    closeSolver() {
      if (!this.modal || this.modal.hidden) return;
      this.modal.hidden = true;
      document.body.classList.remove('fm-open');
      const opener = this.state && this.state.opener;
      this.state = null;
      if (opener && document.contains(opener)) opener.focus();
    },

    segmented(label, options, current, onPick) {
      const wrap = el('div', 'fm-seg-wrap');
      wrap.appendChild(el('span', 'fm-label', label));
      const group = el('div', 'fm-seg');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', label);
      options.forEach(([key, text, title]) => {
        const b = el('button', 'fm-chip' + (key === current ? ' active' : ''), text);
        b.type = 'button';
        b.dataset.key = key;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(key === current));
        if (title) b.title = title;
        b.addEventListener('click', () => {
          group.querySelectorAll('.fm-chip').forEach((c) => { const on = c === b; c.classList.toggle('active', on); c.setAttribute('aria-checked', String(on)); });
          onPick(key);
        });
        group.appendChild(b);
      });
      wrap.appendChild(group);
      return wrap;
    },

    // =============================================================== equation form
    buildSolveForm(body, f, S) {
      const targets = this.targetsOf(f);
      // start on the quantity people usually want (the worked example's answer): x for the quadratic, not a
      S.target = f.example && targets.includes(f.example.find) ? f.example.find : targets[0];

      const toolbar = el('div', 'fm-toolbar');
      toolbar.appendChild(this.segmented('Find', targets.map((id) => { const v = f.vars.find((x) => x.id === id); return [id, v.sym, v.name]; }), S.target, (id) => this.setTarget(id)));
      if (this.usesTrig(f)) {
        toolbar.appendChild(this.segmented('Angles', [['deg', 'Degrees'], ['rad', 'Radians']], 'deg', (k) => { S.deg = k === 'deg'; this.refreshAngleUnits(); this.compute(false); }));
      }
      body.appendChild(toolbar);

      const rows = el('div', 'fm-rows-list');
      f.vars.forEach((v) => rows.appendChild(this.buildRow(v, S)));
      body.appendChild(rows);

      const foot = el('div', 'fm-foot');
      const calc = this.button('Calculate', 'fm-primary', () => this.compute(true));
      const links = el('div', 'fm-links');
      links.append(this.button('Try an example', 'fm-link', () => this.fillExample()), this.button('Clear', 'fm-link', () => this.clearInputs()));
      foot.append(calc, links);
      body.appendChild(foot);
      this.syncTargetRow();
    },

    buildRow(v, S) {
      const row = el('div', 'fm-row');
      row.dataset.id = v.id;
      const inputId = `fm-in-${v.id}`;

      const label = el('label', 'fm-row-label');
      label.htmlFor = inputId;
      label.append(el('span', 'fm-sym', v.sym), el('span', 'fm-name', v.name));

      const ctl = el('div', 'fm-ctl');
      const input = el('input');
      input.id = inputId;
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = v.def !== undefined ? String(v.def) : '';
      if (v.def !== undefined) input.value = String(v.def);
      input.addEventListener('input', () => { clearTimeout(S.timer); S.timer = setTimeout(() => this.compute(false), 120); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.compute(true); } });
      ctl.appendChild(input);
      S.inputs[v.id] = input;

      const symbols = v.dim && !v.angle ? Units.symbols(v.dim) : [];
      if (symbols.length > 1) {
        const sel = el('select', 'fm-unit-select');
        sel.setAttribute('aria-label', `Unit for ${v.name}`);
        symbols.forEach((sym) => { const o = el('option', '', sym); o.value = sym; sel.appendChild(o); });
        sel.value = v.unit;
        sel.addEventListener('change', () => { if (v.id === S.target) this.renderLast(); else this.compute(false); });
        ctl.appendChild(sel);
        S.units[v.id] = sel;
      } else {
        const fixed = el('span', 'fm-unit', v.angle ? '°' : v.unit);
        fixed.dataset.angle = v.angle ? '1' : '';
        ctl.appendChild(fixed);
      }

      const err = el('div', 'fm-error');
      err.hidden = true;
      err.id = `fm-err-${v.id}`;
      row.append(label, ctl, err);
      return row;
    },

    refreshAngleUnits() {
      this.dialog.querySelectorAll('.fm-unit[data-angle="1"]').forEach((n) => { n.textContent = this.state.deg ? '°' : 'rad'; });
    },

    setTarget(id) {
      const S = this.state;
      if (!S) return;
      S.target = id;
      const group = this.dialog.querySelector('.fm-toolbar .fm-seg');
      group.querySelectorAll('.fm-chip').forEach((c) => { const on = c.dataset.key === id; c.classList.toggle('active', on); c.setAttribute('aria-checked', String(on)); });
      this.syncTargetRow();
      this.compute(false);
    },

    // The row being solved for shows "result" and keeps only its unit picker
    syncTargetRow() {
      const S = this.state;
      S.formula.vars.forEach((v) => {
        const input = S.inputs[v.id];
        const isTarget = v.id === S.target;
        input.closest('.fm-row').classList.toggle('is-target', isTarget);
        input.disabled = isTarget;
        if (isTarget) { input.dataset.saved = input.value; input.value = ''; input.placeholder = 'result'; }
        else {
          if (input.dataset.saved !== undefined) { input.value = input.dataset.saved; delete input.dataset.saved; }
          input.placeholder = v.def !== undefined ? String(v.def) : '';
        }
      });
    },

    unitOf(id) {
      const S = this.state;
      const v = S.formula.vars.find((x) => x.id === id);
      if (v.angle) return S.deg ? '°' : ' rad';
      return S.units[id] ? S.units[id].value : v.unit;
    },

    fillExample() {
      const S = this.state, f = S.formula, ex = f.example;
      if (!ex) return;
      if (f.dataset) {
        Object.entries(ex.lists).forEach(([id, text]) => { S.lists[id].value = text; });
      } else {
        this.setTarget(ex.find);
        f.vars.forEach((v) => {
          if (v.id === S.target) return;
          if (S.units[v.id]) S.units[v.id].value = v.unit;
          if (v.def === undefined) S.inputs[v.id].value = '';
        });
        Object.entries(ex.given).forEach(([id, val]) => { S.inputs[id].value = String(val); });
      }
      this.compute(true);
    },

    clearInputs() {
      const S = this.state;
      if (S.formula.dataset) Object.values(S.lists).forEach((ta) => { ta.value = ''; });
      else S.formula.vars.forEach((v) => { if (v.id !== S.target) S.inputs[v.id].value = v.def !== undefined ? String(v.def) : ''; });
      this.compute(false);
      const first = this.dialog.querySelector('input:not([disabled]), textarea');
      if (first) first.focus();
    },

    button(label, cls, onClick) {
      const b = el('button', cls, label);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    },

    // =============================================================== data-set form
    buildDatasetForm(body, f, S) {
      body.appendChild(el('p', 'fm-hint', 'Type or paste your numbers, separated by spaces, commas or new lines.'));
      f.dataset.lists.forEach((l) => {
        const wrap = el('label', 'fm-list');
        wrap.appendChild(el('span', 'fm-label', l.label));
        const ta = el('textarea');
        ta.rows = 3;
        ta.spellcheck = false;
        ta.placeholder = 'e.g. 2 4 4 4 5 5 7 9';
        ta.addEventListener('input', () => { clearTimeout(S.timer); S.timer = setTimeout(() => this.compute(false), 150); });
        wrap.appendChild(ta);
        body.appendChild(wrap);
        S.lists[l.id] = ta;
      });
      const foot = el('div', 'fm-foot');
      const links = el('div', 'fm-links');
      links.append(this.button('Try an example', 'fm-link', () => this.fillExample()), this.button('Clear', 'fm-link', () => this.clearInputs()));
      foot.append(this.button('Calculate', 'fm-primary', () => this.compute(true)), links);
      body.appendChild(foot);
    },

    // =============================================================== computing
    compute(explicit) {
      const S = this.state;
      if (!S) return;
      S.resultEl.className = 'fm-result';
      S.resultEl.innerHTML = '';
      S.last = null;
      try {
        if (S.formula.dataset) return this.computeDataset(explicit);
        const f = S.formula;
        const entries = {};
        let bad = false;
        f.vars.forEach((v) => {
          const input = S.inputs[v.id];
          const err = input.closest('.fm-row').querySelector('.fm-error');
          err.hidden = true;
          input.removeAttribute('aria-invalid');
          input.removeAttribute('aria-describedby');
          if (v.id === S.target || input.value.trim() === '') return;
          try { entries[v.id] = { value: Solver.parseNumber(input.value), unit: S.units[v.id] ? S.units[v.id].value : v.unit }; }
          catch (e) { bad = true; err.textContent = e.message; err.hidden = false; input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', err.id); }
        });
        if (bad) return this.showMessage('Fix the highlighted value(s).', 'error');

        const res = solveWithUnits(f, S.target, entries, { deg: S.deg, targetUnit: S.units[S.target] ? S.units[S.target].value : undefined });
        if (!res.ok) return this.showMessage(res.message, explicit || !res.missing ? 'warn' : 'hint');
        S.last = res;
        this.renderLast();
      } catch (e) {
        this.showMessage(`Could not calculate: ${e.message}`, 'error');
      }
    },

    showMessage(text, kind) {
      const out = this.state.resultEl;
      out.className = `fm-result ${kind}`;
      out.textContent = text;
    },

    // Re-draw the answer card; also used when only the output unit changed
    renderLast() {
      const S = this.state;
      if (!S || !S.last) return;
      const res = S.last;
      const v = S.formula.vars.find((x) => x.id === S.target);
      const targetUnit = this.unitOf(S.target);
      const out = S.resultEl;
      out.className = 'fm-result ok';
      out.innerHTML = '';

      const answers = el('div', 'fm-answers');
      const multiple = res.solutions.length > 1;
      res.solutions.forEach((sol, i) => {
        const shown = v.dim && S.units[S.target] ? Units.convert(sol.native, v.dim, v.unit, targetUnit) : sol.native;
        sol.display = shown;
        const label = multiple ? `${v.sym}${'₁₂₃₄₅₆'[i] || i + 1}` : v.sym;
        const line = el('div', 'fm-answer');
        line.append(el('span', 'fm-answer-sym', `${label} =`), el('span', 'fm-answer-val', formatValue(shown)));
        const unit = targetUnit && targetUnit !== '' ? targetUnit.trim() : '';
        if (unit) line.appendChild(el('span', 'fm-answer-unit', unit));
        answers.appendChild(line);
      });
      out.appendChild(answers);
      if (multiple) out.appendChild(el('p', 'fm-note', 'More than one real solution. Choose the one that makes sense for your problem (a time cannot be negative, for instance).'));
      if (v.dim && targetUnit !== v.unit && S.units[S.target]) {
        out.appendChild(el('p', 'fm-note', `In ${v.unit}: ${res.solutions.map((s) => formatValue(s.native)).join(' or ')}`));
      }

      // working, collapsed by default
      const details = el('details', 'fm-working');
      details.open = store.get(WORKING_KEY, false) === true;
      details.addEventListener('toggle', () => store.set(WORKING_KEY, details.open));
      details.appendChild(el('summary', '', 'Show working'));
      const steps = el('ol', 'fm-steps');
      const add = (title, text) => { const li = el('li'); li.append(el('strong', '', `${title} `), document.createTextNode(text)); steps.appendChild(li); };
      add('Equation:', res.equation);
      if (res.conversions && res.conversions.length) add('Units:', res.conversions.join('; '));
      if (res.method === 'rearranged') {
        const seen = new Set([res.equation]);
        res.solutions.forEach((s) => { if (s.rearranged && !seen.has(s.rearranged)) { seen.add(s.rearranged); add('Rearranged:', s.rearranged); } });
        res.solutions.forEach((s) => { if (s.substituted) add('Substituted:', `${s.substituted} = ${formatValue(s.native)}`); });
      } else {
        add('Method:', `${v.sym} appears more than once, so the equation was solved numerically and each answer was checked by substituting it back.`);
      }
      details.appendChild(steps);
      out.appendChild(details);

      S.lastAnswer = res.solutions[0].display;
      const actions = el('div', 'fm-result-actions');
      const copy = this.button('Copy answer', 'fm-secondary', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(formatValue(S.lastAnswer)).catch(() => {});
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy answer'; }, 900);
      });
      actions.append(copy, this.button('Use in calculator', 'fm-secondary', () => this.sendToCalculator()));
      out.appendChild(actions);
    },

    computeDataset(explicit) {
      const S = this.state, f = S.formula;
      const lists = {};
      for (const l of f.dataset.lists) {
        const text = S.lists[l.id].value.trim();
        if (!text) return this.showMessage(`Enter the ${l.label.toLowerCase()}${explicit ? '.' : ' to see results.'}`, explicit ? 'warn' : 'hint');
        try { lists[l.id] = parseList(text); } catch (e) { return this.showMessage(`${l.label}: ${e.message}`, 'error'); }
      }
      let rows;
      try { rows = f.dataset.compute(lists); } catch (e) { return this.showMessage(e.message, 'error'); }
      const out = S.resultEl;
      out.className = 'fm-result ok';
      const list = el('dl', 'fm-rows');
      rows.forEach(([label, value]) => list.append(el('dt', '', label), el('dd', '', formatValue(value))));
      out.appendChild(list);
      S.lastAnswer = rows[rows.length - 1][1];
      const actions = el('div', 'fm-result-actions');
      actions.append(this.button('Use in calculator', 'fm-secondary', () => this.sendToCalculator()));
      out.appendChild(actions);
    },

    sendToCalculator() {
      const S = this.state;
      const sc = window.ScientificCalculator;
      if (!S || !sc || !this.app) return;
      sc.state.expression += formatValue(S.lastAnswer);
      sc.updateScreen();
      const navBtn = document.getElementById('nav-calc');
      this.closeSolver();
      if (navBtn) this.app.switchPanel('calculator-panel', navBtn);
    },
  };
})();
