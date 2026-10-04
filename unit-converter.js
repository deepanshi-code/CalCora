// --- UNIT CONVERTER PANEL ---
// One tidy converter for every quantity in the unit catalogue: pick a quantity, pick the two units, type in
// either box (both directions work), and see the same value in every other unit below.
window.UnitConverterUI = {
  app: null,
  state: { dim: 'length', from: 'm', to: 'ft' },
  STORE_KEY: 'calcora_unit_converter',
  DEFAULTS: {
    length: ['m', 'ft'], mass: ['kg', 'lb'], temperature: ['°C', '°F'], time: ['h', 'min'], area: ['m²', 'ft²'],
    volume: ['L', 'gal'], speed: ['km/h', 'mph'], pressure: ['atm', 'psi'], energy: ['kJ', 'kcal'], power: ['kW', 'hp'],
    force: ['N', 'lbf'], angle: ['°', 'rad'], data: ['GB', 'MiB'], frequency: ['Hz', 'kHz'], density: ['kg/m³', 'g/cm³'],
  },

  init(appInstance) {
    this.app = appInstance;
    this.cats = document.getElementById('uc-cats');
    this.fromValue = document.getElementById('uc-from-value');
    this.toValue = document.getElementById('uc-to-value');
    this.fromUnit = document.getElementById('uc-from-unit');
    this.toUnit = document.getElementById('uc-to-unit');
    this.swapBtn = document.getElementById('uc-swap');
    this.noteEl = document.getElementById('uc-note');
    this.allEl = document.getElementById('uc-all');
    if (!this.cats || !window.UnitCatalog) return;

    this.load();
    this.buildCategories();
    this.fillUnits();
    this.bindEvents();
    this.convertFrom();
  },

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.STORE_KEY) || 'null');
      const U = window.UnitCatalog;
      if (saved && U.has(saved.dim) && U.symbols(saved.dim).includes(saved.from) && U.symbols(saved.dim).includes(saved.to)) this.state = saved;
    } catch (e) { /* ignore a corrupt or unavailable store */ }
  },
  save() { try { localStorage.setItem(this.STORE_KEY, JSON.stringify(this.state)); } catch (e) { /* ignore */ } },

  buildCategories() {
    const U = window.UnitCatalog;
    this.cats.innerHTML = '';
    U.PANEL_ORDER.forEach((dim) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'uc-cat';
      b.textContent = U.DIMENSIONS[dim].label;
      b.dataset.dim = dim;
      b.setAttribute('role', 'tab');
      this.cats.appendChild(b);
    });
    this.markActiveCategory();
  },

  markActiveCategory() {
    this.cats.querySelectorAll('.uc-cat').forEach((b) => {
      const on = b.dataset.dim === this.state.dim;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
  },

  fillUnits() {
    const U = window.UnitCatalog;
    [this.fromUnit, this.toUnit].forEach((sel) => {
      sel.innerHTML = '';
      U.DIMENSIONS[this.state.dim].units.forEach((u) => {
        const o = document.createElement('option');
        o.value = u.symbol;
        o.textContent = u.note ? `${u.symbol} (${u.note})` : u.symbol;
        sel.appendChild(o);
      });
    });
    this.fromUnit.value = this.state.from;
    this.toUnit.value = this.state.to;
  },

  bindEvents() {
    this.cats.addEventListener('click', (e) => {
      const b = e.target.closest('.uc-cat');
      if (!b) return;
      const dim = b.dataset.dim;
      const [from, to] = this.DEFAULTS[dim] || window.UnitCatalog.symbols(dim).slice(0, 2);
      this.state = { dim, from, to };
      this.markActiveCategory();
      this.fillUnits();
      this.fromValue.value = '1';
      this.convertFrom();
      this.save();
      if (this.app) this.app.playBeep(600, 0.04, 0.015);
    });
    this.fromValue.addEventListener('input', () => this.convertFrom());
    this.toValue.addEventListener('input', () => this.convertTo());
    this.fromUnit.addEventListener('change', () => { this.state.from = this.fromUnit.value; this.save(); this.convertFrom(); });
    this.toUnit.addEventListener('change', () => { this.state.to = this.toUnit.value; this.save(); this.convertFrom(); });
    this.swapBtn.addEventListener('click', () => {
      const { from, to } = this.state;
      this.state.from = to;
      this.state.to = from;
      this.fromUnit.value = this.state.from;
      this.toUnit.value = this.state.to;
      this.save();
      this.convertFrom();
      if (this.app) this.app.playBeep(650, 0.05, 0.02);
    });
    // clicking a row in the list makes that unit the target
    this.allEl.addEventListener('click', (e) => {
      const row = e.target.closest('.uc-all-item');
      if (!row) return;
      this.state.to = row.dataset.unit;
      this.toUnit.value = this.state.to;
      this.save();
      this.convertFrom();
    });
  },

  // typed text may be an expression: "1/3", "2*pi", "1e-6"
  read(input) {
    const text = input.value.trim();
    if (text === '') return null;
    try { return window.FormulaSolver ? window.FormulaSolver.parseNumber(text) : Number(text); } catch (e) { return NaN; }
  },

  fmt(v, digits = 10) {
    if (!Number.isFinite(v)) return '';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e12 || a < 1e-6) return v.toExponential(Math.min(digits - 1, 8)).replace(/\.?0+e/, 'e').replace('e+', 'e');
    return String(parseFloat(v.toPrecision(digits)));
  },

  convertFrom() {
    const v = this.read(this.fromValue);
    this.fromValue.removeAttribute('aria-invalid');
    if (v === null) { this.toValue.value = ''; this.renderAll(null); this.renderNote(); return; }
    if (Number.isNaN(v)) { this.fromValue.setAttribute('aria-invalid', 'true'); this.toValue.value = ''; this.renderAll(null); return; }
    const { dim, from, to } = this.state;
    this.toValue.value = this.fmt(window.UnitCatalog.convert(v, dim, from, to));
    this.renderAll(v);
    this.renderNote();
  },

  convertTo() {
    const v = this.read(this.toValue);
    this.toValue.removeAttribute('aria-invalid');
    if (v === null) { this.fromValue.value = ''; this.renderAll(null); return; }
    if (Number.isNaN(v)) { this.toValue.setAttribute('aria-invalid', 'true'); return; }
    const { dim, from, to } = this.state;
    const fromV = window.UnitCatalog.convert(v, dim, to, from);
    this.fromValue.value = this.fmt(fromV);
    this.renderAll(fromV);
    this.renderNote();
  },

  renderNote() {
    const { dim, from, to } = this.state;
    const U = window.UnitCatalog;
    if (dim === 'temperature') {
      this.noteEl.textContent = '°F = °C × 9/5 + 32     K = °C + 273.15';
      return;
    }
    this.noteEl.textContent = `1 ${from} = ${this.fmt(U.convert(1, dim, from, to), 7)} ${to}`;
  },

  renderAll(v) {
    const { dim, from, to } = this.state;
    const U = window.UnitCatalog;
    this.allEl.innerHTML = '';
    U.DIMENSIONS[dim].units.forEach((u) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'uc-all-item' + (u.symbol === to ? ' is-target' : '') + (u.symbol === from ? ' is-source' : '');
      item.dataset.unit = u.symbol;
      const val = document.createElement('span');
      val.className = 'uc-all-val';
      val.textContent = v === null ? '—' : this.fmt(U.convert(v, dim, from, u.symbol), 7);
      const unit = document.createElement('span');
      unit.className = 'uc-all-unit';
      unit.textContent = u.symbol;
      item.append(val, unit);
      this.allEl.appendChild(item);
    });
  },
};
