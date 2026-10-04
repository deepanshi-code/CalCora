// --- SCIENTIFIC CALCULATOR MODULE ---
window.ScientificCalculator = {
  // Module-specific state
  state: {
    expression: '',
    result: '0',
    angleMode: 'DEG', // 'DEG' or 'RAD'
    memory: 0,
    history: []
  },

  init(appInstance) {
    this.app = appInstance;
    this.cacheDOM();
    this.bindEvents();
    this.loadHistory();
    this.updateScreen();
  },

  cacheDOM() {
    this.exprDisplay = document.getElementById('calc-expression-display');
    this.resDisplay = document.getElementById('calc-result-display');
    this.angleModeBtn = document.getElementById('calc-deg-rad');
    this.angleModeIndicator = document.getElementById('calc-angle-mode');
    this.statusIndicator = document.getElementById('calc-status-indicator');
    
    this.historyList = document.getElementById('history-list');
    this.emptyHistoryText = document.getElementById('empty-history-text');
    this.clearHistoryBtn = document.getElementById('clear-history-btn');
    
    // Tab selectors
    this.utilityTabs = document.querySelectorAll('.utility-tab-btn');
    this.utilityPanes = document.querySelectorAll('.utility-tab-pane');
    
    // Constants
    this.constantButtons = document.querySelectorAll('.constant-btn');
    
    // Graph components
    this.graphCanvas = document.getElementById('graph-canvas');
    this.graphInput = document.getElementById('graph-function-input');
    this.graphPlotBtn = document.getElementById('graph-plot-btn');
    this.graphZoomIn = document.getElementById('graph-zoom-in');
    this.graphZoomOut = document.getElementById('graph-zoom-out');
    this.graphScaleLabel = document.getElementById('graph-scale-label');

    this.applyAccessibilityLabels();
  },

  // Symbol-only keys ("÷", "x²", "⌫") are announced as nothing useful by screen readers.
  applyAccessibilityLabels() {
    const labels = {
      'calc-deg-rad': 'Toggle degrees or radians', 'calc-abs': 'Absolute value', 'calc-mod': 'Modulo',
      'calc-pi': 'Pi', 'calc-e': "Euler's number", 'calc-sin': 'Sine', 'calc-asin': 'Inverse sine',
      'calc-cos': 'Cosine', 'calc-acos': 'Inverse cosine', 'calc-tan': 'Tangent', 'calc-atan': 'Inverse tangent',
      'calc-pow': 'Power', 'calc-sqrt': 'Square root', 'calc-cbrt': 'Cube root', 'calc-sqr': 'Square',
      'calc-log': 'Logarithm base 10', 'calc-ln': 'Natural logarithm', 'calc-fact': 'Factorial',
      'calc-percent': 'Percent', 'calc-inv': 'Reciprocal', 'calc-mc': 'Memory clear', 'calc-mr': 'Memory recall',
      'calc-mplus': 'Memory add', 'calc-mminus': 'Memory subtract', 'calc-rand': 'Random number',
      'calc-clear': 'Clear all', 'calc-backspace': 'Backspace', 'calc-lparent': 'Open parenthesis',
      'calc-rparent': 'Close parenthesis', 'calc-div': 'Divide', 'calc-mul': 'Multiply', 'calc-sub': 'Subtract',
      'calc-add': 'Add', 'calc-ten-pow': 'Ten to the power', 'calc-exp-e': 'e to the power',
      'calc-neg': 'Change sign', 'calc-decimal': 'Decimal point', 'calc-equal': 'Equals'
    };
    Object.entries(labels).forEach(([id, label]) => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('aria-label', label);
    });
    // Announce results and errors without moving focus
    this.resDisplay.setAttribute('role', 'status');
    this.resDisplay.setAttribute('aria-live', 'polite');
    this.statusIndicator.setAttribute('aria-live', 'polite');
  },

  bindEvents() {
    // Listen to keypad buttons
    const keypad = document.getElementById('calc-keyboard');
    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.calc-btn');
      if (!btn) return;
      
      const id = btn.id;
      this.handleButtonPress(id);
      
      // Play app's default beep
      if (id !== 'calc-equal') {
        this.app.playBeep(520, 0.04, 0.015);
      }
    });

    // Clear history
    if (this.clearHistoryBtn) {
      this.clearHistoryBtn.addEventListener('click', () => {
        this.clearHistory();
        this.app.playBeep(400, 0.08, 0.03);
      });
    }

    // Bind utility tab switching
    this.utilityTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.app.playBeep(600, 0.05, 0.015);
        this.switchUtilityTab(tab.dataset.utilityTab);
      });
    });

    // Bind constants insertions
    this.constantButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.app.playBeep(550, 0.04, 0.01);
        const val = btn.dataset.value;
        this.insertConstant(val);
      });
    });

    // Bind graph controls
    if (this.graphPlotBtn) {
      this.graphPlotBtn.addEventListener('click', () => {
        this.app.playBeep(650, 0.06, 0.02);
        this.plotFunction();
      });
    }
    if (this.graphZoomIn) {
      this.graphZoomIn.addEventListener('click', () => {
        this.app.playBeep(580, 0.04, 0.01);
        this.zoomGraph(0.5);
      });
    }
    if (this.graphZoomOut) {
      this.graphZoomOut.addEventListener('click', () => {
        this.app.playBeep(580, 0.04, 0.01);
        this.zoomGraph(2);
      });
    }

    // Draw initial grid
    setTimeout(() => {
      this.initGraphPlotter();
    }, 200);

    // Keyboard support for calculator inputs
    document.addEventListener('keydown', (e) => {
      // Don't intercept when focusing on numeric text inputs in converters or BMI panel
      if (document.activeElement.tagName === 'INPUT') return;

      // Ensure calculator tab is active
      const isCalcActive = document.getElementById('calculator-panel').classList.contains('active');
      if (!isCalcActive) return;

      const key = e.key;
      this.handleKeyboardPress(key, e);
    });
  },

  handleButtonPress(id) {
    switch (id) {
      case 'calc-clear':
        this.state.expression = '';
        this.state.result = '0';
        break;
      case 'calc-backspace':
        this.backspace();
        break;
      case 'calc-deg-rad':
        this.toggleAngleMode();
        break;
      case 'calc-equal':
        this.evaluate();
        break;
      
      // Constants
      case 'calc-pi':
        this.state.expression += 'π';
        break;
      case 'calc-e':
        this.state.expression += 'e';
        break;

      // Digits & Basic operators
      case 'calc-0': this.state.expression += '0'; break;
      case 'calc-1': this.state.expression += '1'; break;
      case 'calc-2': this.state.expression += '2'; break;
      case 'calc-3': this.state.expression += '3'; break;
      case 'calc-4': this.state.expression += '4'; break;
      case 'calc-5': this.state.expression += '5'; break;
      case 'calc-6': this.state.expression += '6'; break;
      case 'calc-7': this.state.expression += '7'; break;
      case 'calc-8': this.state.expression += '8'; break;
      case 'calc-9': this.state.expression += '9'; break;
      case 'calc-decimal': this.state.expression += '.'; break;
      
      case 'calc-add': this.state.expression += ' + '; break;
      case 'calc-sub': this.state.expression += ' − '; break;
      case 'calc-mul': this.state.expression += ' × '; break;
      case 'calc-div': this.state.expression += ' ÷ '; break;
      case 'calc-lparent': this.state.expression += '('; break;
      case 'calc-rparent': this.state.expression += ')'; break;
      
      // Scientific functions
      case 'calc-sin': this.state.expression += 'sin('; break;
      case 'calc-cos': this.state.expression += 'cos('; break;
      case 'calc-tan': this.state.expression += 'tan('; break;
      case 'calc-asin': this.state.expression += 'asin('; break;
      case 'calc-acos': this.state.expression += 'acos('; break;
      case 'calc-atan': this.state.expression += 'atan('; break;
      case 'calc-log': this.state.expression += 'log('; break;
      case 'calc-ln': this.state.expression += 'ln('; break;
      case 'calc-sqrt': this.state.expression += '√('; break;
      case 'calc-cbrt': this.state.expression += '³√('; break;
      case 'calc-abs': this.state.expression += 'abs('; break;
      case 'calc-fact': this.state.expression += '!'; break;
      case 'calc-percent': this.state.expression += '%'; break;
      
      // Special advanced operations
      case 'calc-pow':
        this.state.expression += '^';
        break;
      case 'calc-sqr':
        this.state.expression += '^2';
        break;
      case 'calc-ten-pow':
        this.state.expression += '10^(';
        break;
      case 'calc-exp-e':
        this.state.expression += 'e^(';
        break;
      case 'calc-inv':
        this.state.expression += '1÷(';
        break;
      case 'calc-mod':
        this.state.expression += ' mod ';
        break;
      case 'calc-neg':
        this.toggleNegation();
        break;
      case 'calc-rand':
        const randomVal = parseFloat(Math.random().toFixed(4));
        this.state.expression += randomVal.toString();
        break;

      // Memory Operations
      case 'calc-mc':
        this.state.memory = 0;
        this.flashMemoryIndicator('Memory Cleared');
        break;
      case 'calc-mr':
        this.state.expression += this.state.memory.toString();
        break;
      case 'calc-mplus':
        this.modifyMemory(true);
        break;
      case 'calc-mminus':
        this.modifyMemory(false);
        break;
    }
    
    this.updateScreen();
  },

  handleKeyboardPress(key, event) {
    if (key >= '0' && key <= '9') {
      this.state.expression += key;
    } else if (key === '.') {
      this.state.expression += '.';
    } else if (key === '+') {
      this.state.expression += ' + ';
    } else if (key === '-') {
      this.state.expression += ' − ';
    } else if (key === '*') {
      this.state.expression += ' × ';
    } else if (key === '/') {
      this.state.expression += ' ÷ ';
    } else if (key === '(') {
      this.state.expression += '(';
    } else if (key === ')') {
      this.state.expression += ')';
    } else if (key === '^') {
      this.state.expression += '^';
    } else if (key === '%') {
      this.state.expression += '%';
    } else if (key === '!') {
      this.state.expression += '!';
    } else if (key === 'Enter' || key === '=') {
      event.preventDefault();
      this.evaluate();
      this.app.playBeep(650, 0.08, 0.02);
    } else if (key === 'Backspace') {
      this.backspace();
    } else if (key === 'Escape') {
      this.state.expression = '';
      this.state.result = '0';
    } else {
      // Don't do screen updates for non-calculator keyboard actions
      return;
    }
    
    this.updateScreen();
    this.app.playBeep(520, 0.04, 0.015);
  },

  // Backspace deletes characters intelligently (e.g. deleting 'sin(' fully)
  backspace() {
    let expr = this.state.expression;
    if (expr.length === 0) return;

    // Check if the expression ends with custom functions
    const funcs = ['sin(', 'cos(', 'tan(', 'log(', 'ln(', 'abs(', 'asin(', 'acos(', 'atan(', '1÷('];
    let deleted = false;
    for (const f of funcs) {
      if (expr.endsWith(f)) {
        this.state.expression = expr.slice(0, -f.length);
        deleted = true;
        break;
      }
    }
    
    if (!deleted) {
      if (expr.endsWith('³√(')) {
        this.state.expression = expr.slice(0, -4);
      } else if (expr.endsWith('√(')) {
        this.state.expression = expr.slice(0, -2);
      } else if (expr.endsWith(' mod ')) {
        this.state.expression = expr.slice(0, -5);
      } else if (expr.endsWith(' + ') || expr.endsWith(' − ') || expr.endsWith(' × ') || expr.endsWith(' ÷ ')) {
        this.state.expression = expr.slice(0, -3);
      } else {
        this.state.expression = expr.slice(0, -1);
      }
    }
  },

  toggleAngleMode() {
    this.state.angleMode = this.state.angleMode === 'DEG' ? 'RAD' : 'DEG';
    this.angleModeIndicator.textContent = this.state.angleMode;
    this.angleModeBtn.textContent = this.state.angleMode === 'DEG' ? 'Rad' : 'Deg';
  },

  toggleNegation() {
    let expr = this.state.expression;
    if (expr.length === 0) {
      this.state.expression = '−';
      return;
    }

    // Check if it ends with a number
    const match = expr.match(/(\d+\.?\d*)$/);
    if (match) {
      const numStr = match[1];
      const index = expr.lastIndexOf(numStr);
      // Check if there is a minus sign right before the number
      const prefix = expr.slice(0, index);
      if (prefix.endsWith('−')) {
        // Remove minus
        this.state.expression = prefix.slice(0, -1) + numStr;
      } else {
        // Add minus
        this.state.expression = prefix + '−' + numStr;
      }
    } else {
      // Just append minus
      if (expr.endsWith('−')) {
        this.state.expression = expr.slice(0, -1);
      } else {
        this.state.expression += '−';
      }
    }
  },

  modifyMemory(isAdd) {
    try {
      const currentVal = parseFloat(this.state.result);
      if (isNaN(currentVal)) return;

      if (isAdd) {
        this.state.memory += currentVal;
        this.flashMemoryIndicator(`Added to M: ${this.state.memory.toFixed(3)}`);
      } else {
        this.state.memory -= currentVal;
        this.flashMemoryIndicator(`Subtracted from M: ${this.state.memory.toFixed(3)}`);
      }
    } catch (err) {
      console.warn('Memory error', err);
    }
  },

  flashMemoryIndicator(text) {
    // Show a temporary message in bottom display screen
    const prevRes = this.state.result;
    this.resDisplay.textContent = text;
    this.resDisplay.style.fontSize = '1.3rem';
    this.resDisplay.style.color = 'var(--accent-warning)';
    
    setTimeout(() => {
      this.resDisplay.textContent = prevRes;
      this.resDisplay.style.fontSize = '';
      this.resDisplay.style.color = '';
    }, 1200);
  },

  updateScreen() {
    this.exprDisplay.textContent = this.state.expression;
    // Set scroll to the right so input shows newest expressions
    this.exprDisplay.scrollLeft = this.exprDisplay.scrollWidth;
    this.resDisplay.textContent = this.state.result;
  },

  evaluate() {
    const expr = this.state.expression;
    if (expr.trim() === '') return;

    this.updateStatusIndicator("CALCULATING");

    try {
      const evalResult = this.evaluateExpression(expr, this.state.angleMode === 'DEG');
      const formattedResult = this.formatNumber(evalResult);

      this.state.result = formattedResult;
      
      // Save to history list
      this.addHistoryItem(expr, formattedResult);
      this.updateStatusIndicator("DONE", 2500);
    } catch (err) {
      this.state.result = 'Error';
      this.updateStatusIndicator(err.message.toUpperCase(), 3500);
      console.warn("Parsing Error: ", err.message);
    }
    
    this.updateScreen();
  },

  // Pure evaluation (no DOM) so it can be unit-tested. Throws on any invalid input.
  evaluateExpression(expr, isDeg = true) {
    let s = expr
      .replace(/−/g, '-')
      .replace(/×/g, '*')
      .replace(/÷/g, '/');

    // Auto-close parentheses left open by function keys such as "sin(" or "10^("
    const open = (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
    if (open > 0) s += ')'.repeat(open);

    const tokens = new MathParser(s, isDeg).tokenize();
    const value = new Parser(tokens, isDeg).parse();
    if (!Number.isFinite(value)) throw new Error('Calculation error');
    return value;
  },

  // 12 significant digits hides binary float noise (0.1+0.2) without
  // flattening very small/large values like 6.626e-34 to 0.
  formatNumber(v) {
    if (Number.isSafeInteger(v)) return v.toString();
    return parseFloat(v.toPrecision(12)).toString();
  },

  addHistoryItem(expression, result) {
    const newItem = { expression, result };
    this.state.history.unshift(newItem); // add to top
    if (this.state.history.length > 25) {
      this.state.history.pop();
    }
    this.saveHistory();
    this.renderHistory();
  },

  renderHistory() {
    this.historyList.innerHTML = '';
    
    if (this.state.history.length === 0) {
      this.emptyHistoryText.style.display = 'block';
      this.historyList.appendChild(this.emptyHistoryText);
      return;
    }

    this.emptyHistoryText.style.display = 'none';

    this.state.history.forEach((item, idx) => {
      const itemNode = document.createElement('div');
      itemNode.className = 'history-item';
      
      const expNode = document.createElement('span');
      expNode.className = 'history-item-exp';
      expNode.textContent = item.expression;
      
      const resNode = document.createElement('span');
      resNode.className = 'history-item-res';
      resNode.textContent = item.result;

      itemNode.appendChild(expNode);
      itemNode.appendChild(resNode);

      // Restore clicked expression
      itemNode.addEventListener('click', () => {
        this.state.expression = item.expression;
        this.state.result = item.result;
        this.updateScreen();
        this.app.playBeep(600, 0.05, 0.02);
      });

      this.historyList.appendChild(itemNode);
    });
  },

  clearHistory() {
    this.state.history = [];
    this.saveHistory();
    this.renderHistory();
  },

  saveHistory() {
    localStorage.setItem('quantum_calc_history', JSON.stringify(this.state.history));
  },

  loadHistory() {
    const saved = localStorage.getItem('quantum_calc_history');
    if (saved) {
      try {
        this.state.history = JSON.parse(saved);
        this.renderHistory();
      } catch (e) {
        this.state.history = [];
      }
    }
  },

  // --- SCIENTIFIC LAB UTILITIES ---

  switchUtilityTab(tabName) {
    this.utilityTabs.forEach(tab => {
      if (tab.dataset.utilityTab === tabName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    this.utilityPanes.forEach(pane => {
      if (pane.id === `pane-${tabName}`) {
        pane.style.display = 'flex';
      } else {
        pane.style.display = 'none';
      }
    });

    if (tabName === 'grapher') {
      setTimeout(() => {
        this.drawGraph();
      }, 50);
    }
  },

  insertConstant(val) {
    this.state.expression += val;
    this.updateScreen();
  },

  initGraphPlotter() {
    this.graphScale = 10;
    this.drawGraph();
  },

  zoomGraph(factor) {
    this.graphScale *= factor;
    // Bound scale limit
    if (this.graphScale < 1) this.graphScale = 1;
    if (this.graphScale > 100) this.graphScale = 100;
    
    if (this.graphScaleLabel) {
      this.graphScaleLabel.textContent = `Range: X[-${Math.round(this.graphScale)},${Math.round(this.graphScale)}]`;
    }
    this.drawGraph();
  },

  plotFunction() {
    this.drawGraph();
  },

  // Compiles "y = f(x)" text into a JS function using the same parser as the
  // calculator (no eval / new Function). Plot angles are always radians.
  // The returned function yields a finite number, or null where f is undefined.
  compileFunction(expr) {
    const tokens = new MathParser(expr.toLowerCase(), false, ['x']).tokenize();
    const vars = { x: 0 };
    const parser = new Parser(tokens, false, vars);
    return (xVal) => {
      vars.x = xVal;
      try {
        const y = parser.parse();
        return Number.isFinite(y) ? y : null;
      } catch (e) {
        return null;
      }
    };
  },

  drawGraph() {
    const canvas = this.graphCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const rect = canvas.parentNode.getBoundingClientRect();
    // Hidden tab (display:none) has zero size; drawing then would divide the grid
    // spacing down to 0 and loop forever. switchUtilityTab redraws once visible.
    if (rect.width < 10) return;
    canvas.width = rect.width;
    canvas.height = rect.height || 180;
    
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    let theme = this.app.state.activeTheme;
    let mainColor = '#f3f4f6';
    let axisColor = 'rgba(255, 255, 255, 0.3)';
    let gridColor = 'rgba(255, 255, 255, 0.06)';
    let curveColor = '#3b82f6'; // Clean modern blue
    
    if (theme === 'oscilloscope') {
      mainColor = '#ffb000';
      axisColor = 'rgba(255, 176, 0, 0.4)';
      gridColor = 'rgba(255, 176, 0, 0.08)';
      curveColor = '#ffb000'; // Amber phosphor curve
    } else if (theme === 'frost') {
      mainColor = '#1e293b';
      axisColor = 'rgba(30, 41, 59, 0.3)';
      gridColor = 'rgba(30, 41, 59, 0.06)';
      curveColor = '#2563eb'; // Royal blue
    } else if (theme === 'solar') {
      mainColor = '#121417'; // Dark LCD text
      axisColor = 'rgba(18, 20, 23, 0.4)';
      gridColor = 'rgba(18, 20, 23, 0.1)';
      curveColor = '#121417'; // Solid black curve on grey LCD
    }
    
    const scale = this.graphScale || 10;
    
    // Draw Grids
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    
    const gridSpacing = Math.max(w / 10, 10);
    for (let x = 0; x < w; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    
    // Center Axes
    const centerX = w / 2;
    const centerY = h / 2;
    
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;
    
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, h);
    ctx.stroke();
    
    ctx.fillStyle = axisColor;
    ctx.font = '9px monospace';
    ctx.fillText('x', w - 10, centerY - 5);
    ctx.fillText('y', centerX + 5, 10);
    ctx.fillText('0', centerX - 10, centerY + 12);
    
    const funcText = this.graphInput.value.trim();
    if (!funcText) return;
    
    let fn;
    try {
      fn = this.compileFunction(funcText);
    } catch (e) {
      ctx.fillStyle = mainColor;
      ctx.fillText(`Invalid expression: ${e.message}`, 10, h - 8);
      return;
    }

    ctx.beginPath();
    ctx.strokeStyle = curveColor;
    ctx.lineWidth = 2.2;

    if (theme === 'oscilloscope') {
      ctx.shadowColor = 'rgba(255, 176, 0, 0.8)';
      ctx.shadowBlur = 8;
    } else {
      ctx.shadowBlur = 0;
    }

    // penDown=false starts a new sub-path, so the curve is broken where the
    // function is undefined or off-screen (e.g. tan(x), 1/x) instead of
    // drawing a false line across the asymptote.
    let penDown = false;
    let plotted = 0;
    for (let px = 0; px < w; px++) {
      const x = ((px - centerX) / centerX) * scale;
      const y = fn(x);

      if (y === null) {
        penDown = false;
        continue;
      }
      const py = centerY - (y / scale) * centerY;
      if (py < 0 || py > h) {
        penDown = false;
        continue;
      }
      if (penDown) {
        ctx.lineTo(px, py);
      } else {
        ctx.moveTo(px, py);
        penDown = true;
      }
      plotted++;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (plotted === 0) {
      ctx.fillStyle = mainColor;
      ctx.fillText('Nothing to plot in this range (check syntax / use x as variable)', 10, h - 8);
    }
  },

  updateStatusIndicator(text, resetTime = 2000) {
    if (!this.statusIndicator) return;
    this.statusIndicator.textContent = text;
    if (resetTime > 0) {
      if (this.statusTimeout) clearTimeout(this.statusTimeout);
      this.statusTimeout = setTimeout(() => {
        this.statusIndicator.textContent = "READY";
      }, resetTime);
    }
  }
};

// --- RECURSIVE DESCENT MATH LEXER & PARSER ---
// Grammar (lowest to highest precedence):
//   expression := term (('+' | '-') term)*
//   term       := unary (('*' | '/' | 'mod' | <implicit multiplication>) unary)*
//   unary      := ('+' | '-') unary | power          -> -2^2 = -4
//   power      := postfix ('^' unary)?               -> right-assoc, 2^-1 allowed
//   postfix    := primary ('!' | '%')*
//   primary    := NUMBER | CONSTANT | VARIABLE | FUNCTION arg | '(' expression ')'
const FUNCTION_NAMES = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'cbrt', 'abs', 'exp'];

class MathParser {
  // `variables` lists identifiers (e.g. ['x']) that are allowed in addition to constants.
  constructor(input, isDegreeMode = true, variables = []) {
    this.input = input;
    this.pos = 0;
    this.isDegreeMode = isDegreeMode;
    this.variables = variables;
  }

  peek() {
    return this.pos < this.input.length ? this.input[this.pos] : null;
  }

  next() {
    return this.pos < this.input.length ? this.input[this.pos++] : null;
  }

  tokenize() {
    const tokens = [];
    this.pos = 0;
    while (this.pos < this.input.length) {
      let ch = this.peek();

      if (/\s/.test(ch)) {
        this.next();
        continue;
      }

      if (/[0-9.]/.test(ch)) {
        let numStr = '';
        while (ch && /[0-9.]/.test(ch)) {
          numStr += this.next();
          ch = this.peek();
        }
        // Scientific notation such as 6.62607015e-34. Only consumed when digits
        // follow the 'e', so "2e" still means 2 × Euler's number.
        const exp = this.input.slice(this.pos).match(/^[eE][+-]?\d+/);
        if (exp) {
          numStr += exp[0];
          this.pos += exp[0].length;
        }
        const value = Number(numStr);
        if (Number.isNaN(value)) throw new Error(`Invalid number: ${numStr}`);
        tokens.push({ type: 'NUMBER', value });
        continue;
      }

      if (/[a-zA-Zπ³√]/.test(ch)) {
        // Handle special math prefixes/symbols
        if (ch === 'π') {
          this.next();
          tokens.push({ type: 'CONSTANT', value: 'pi' });
          continue;
        }
        if (ch === '³') {
          this.next(); // consume ³
          if (this.peek() === '√') {
            this.next(); // consume √
            tokens.push({ type: 'FUNCTION', value: 'cbrt' });
          } else {
            throw new Error("Invalid character sequence around ³");
          }
          continue;
        }
        if (ch === '√') {
          this.next();
          tokens.push({ type: 'FUNCTION', value: 'sqrt' });
          continue;
        }

        let word = '';
        while (ch && /[a-zA-Z]/.test(ch)) {
          word += this.next();
          ch = this.peek();
        }

        const lowerWord = word.toLowerCase();
        if (this.variables.includes(lowerWord)) {
          tokens.push({ type: 'VARIABLE', value: lowerWord });
        } else if (lowerWord === 'pi' || lowerWord === 'e') {
          tokens.push({ type: 'CONSTANT', value: lowerWord });
        } else if (lowerWord === 'mod') {
          tokens.push({ type: 'OPERATOR', value: '%' });
        } else if (FUNCTION_NAMES.includes(lowerWord)) {
          // "log10(" is accepted as an explicit base-10 log
          if (lowerWord === 'log' && this.input.startsWith('10(', this.pos)) {
            this.pos += 2;
          }
          tokens.push({ type: 'FUNCTION', value: lowerWord });
        } else {
          throw new Error(`Unknown identifier: ${word}`);
        }
        continue;
      }

      if (['+', '-', '*', '/', '^', '(', ')', '!', '%'].includes(ch)) {
        const sym = this.next();
        tokens.push({ type: 'SYMBOL', value: sym });
        continue;
      }

      throw new Error(`Unexpected character: ${ch}`);
    }
    return tokens;
  }
}

class Parser {
  // `variables` maps identifier -> current value (e.g. { x: 2 }); callers may
  // mutate it between parse() calls to re-evaluate the same token list.
  constructor(tokens, isDegreeMode = true, variables = {}) {
    this.tokens = tokens;
    this.pos = 0;
    this.isDegreeMode = isDegreeMode;
    this.variables = variables;
  }

  peek() {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  next() {
    return this.pos < this.tokens.length ? this.tokens[this.pos++] : null;
  }

  isSymbol(tok, ...values) {
    return !!tok && tok.type === 'SYMBOL' && values.includes(tok.value);
  }

  parse() {
    this.pos = 0;
    if (this.tokens.length === 0) return 0;
    const val = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error("Unexpected tokens at end");
    }
    return val;
  }

  parseExpression() {
    let val = this.parseTerm();
    while (this.isSymbol(this.peek(), '+', '-')) {
      const op = this.next().value;
      const right = this.parseTerm();
      val = op === '+' ? val + right : val - right;
    }
    return val;
  }

  // True when the next token can start a new factor, which means two adjacent
  // factors are implicitly multiplied: 2π, 3(4+5), 2sin(x), (a)(b).
  startsImplicitFactor(tok) {
    if (!tok) return false;
    if (tok.type === 'CONSTANT' || tok.type === 'FUNCTION' || tok.type === 'VARIABLE') return true;
    if (tok.type === 'NUMBER') {
      // "2 3" is a typo, not 6
      const prev = this.tokens[this.pos - 1];
      return !(prev && prev.type === 'NUMBER');
    }
    return this.isSymbol(tok, '(');
  }

  parseTerm() {
    let val = this.parseUnary();
    for (;;) {
      const tok = this.peek();
      if (this.isSymbol(tok, '*', '/')) {
        this.next();
        const right = this.parseUnary();
        if (tok.value === '/') {
          if (right === 0) throw new Error("Division by zero");
          val /= right;
        } else {
          val *= right;
        }
      } else if (tok && tok.type === 'OPERATOR' && tok.value === '%') {
        this.next();
        const right = this.parseUnary();
        if (right === 0) throw new Error("Modulo by zero");
        val %= right;
      } else if (this.startsImplicitFactor(tok)) {
        val *= this.parsePower();
      } else {
        return val;
      }
    }
  }

  parseUnary() {
    if (this.isSymbol(this.peek(), '+', '-')) {
      const op = this.next().value;
      const val = this.parseUnary();
      return op === '-' ? -val : val;
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePostfix();
    if (this.isSymbol(this.peek(), '^')) {
      this.next();
      const exponent = this.parseUnary(); // right-associative, allows 2^-1
      return Math.pow(base, exponent);
    }
    return base;
  }

  parsePostfix() {
    let val = this.parsePrimary();
    while (this.isSymbol(this.peek(), '!', '%')) {
      const op = this.next().value;
      val = op === '!' ? this.factorial(val) : val / 100;
    }
    return val;
  }

  factorial(n) {
    if (n < 0) throw new Error("Neg factorial");
    if (!Number.isInteger(n)) throw new Error("Non-int factorial");
    if (n > 170) throw new Error("Factorial overflow");
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  parsePrimary() {
    const tok = this.next();
    if (!tok) {
      throw new Error("Unexpected end");
    }

    if (tok.type === 'NUMBER') {
      return tok.value;
    }

    if (tok.type === 'CONSTANT') {
      if (tok.value === 'pi') return Math.PI;
      if (tok.value === 'e') return Math.E;
    }

    if (tok.type === 'VARIABLE') {
      if (!(tok.value in this.variables)) throw new Error(`Undefined variable: ${tok.value}`);
      return this.variables[tok.value];
    }

    if (tok.type === 'FUNCTION') {
      const arg = this.parseFunctionArgument();
      return this.applyFunction(tok.value, arg);
    }

    if (this.isSymbol(tok, '(')) {
      const val = this.parseExpression();
      this.expectClose();
      return val;
    }

    throw new Error(`Unexpected token: ${tok.value || tok.type}`);
  }

  expectClose() {
    const close = this.next();
    if (!this.isSymbol(close, ')')) {
      throw new Error("Missing closing parenthesis");
    }
  }

  parseFunctionArgument() {
    if (this.isSymbol(this.peek(), '(')) {
      this.next();
      const arg = this.parseExpression();
      this.expectClose();
      return arg;
    }
    // Bare argument such as "sin 30" or "√9"
    return this.parseUnary();
  }

  applyFunction(name, arg) {
    const toRad = (v) => (this.isDegreeMode ? v * Math.PI / 180 : v);
    // sin(π) = 1.2e-16 is floating-point noise, not a result. A trig value is noise when it is
    // smaller than the representation error of its own argument (about 2.2e-16 × |argument|),
    // so it snaps to 0. Small but real results survive (sin(1e-20) ≈ 1e-20 is as large as its
    // argument), and nothing is rounded to a fixed number of decimals.
    const clean = (v, argRad) => (Math.abs(v) < 2.3e-16 * Math.abs(argRad) ? 0 : v);
    const fromRad = (v) => (this.isDegreeMode ? v * 180 / Math.PI : v);

    switch (name) {
      case 'sin': { const a = toRad(arg); return clean(Math.sin(a), a); }
      case 'cos': { const a = toRad(arg); return clean(Math.cos(a), a); }
      case 'tan': {
        if (this.isDegreeMode && Math.abs(arg % 180) === 90) throw new Error("tan undefined");
        const a = toRad(arg);
        return clean(Math.tan(a), a);
      }
      case 'asin':
        if (arg < -1 || arg > 1) throw new Error("asin domain");
        return fromRad(Math.asin(arg));
      case 'acos':
        if (arg < -1 || arg > 1) throw new Error("acos domain");
        return fromRad(Math.acos(arg));
      case 'atan':
        return fromRad(Math.atan(arg));
      case 'log':
        if (arg <= 0) throw new Error("Log boundary");
        return Math.log10(arg);
      case 'ln':
        if (arg <= 0) throw new Error("Ln boundary");
        return Math.log(arg);
      case 'sqrt':
        if (arg < 0) throw new Error("Negative sqrt");
        return Math.sqrt(arg);
      case 'cbrt':
        return Math.cbrt(arg);
      case 'abs':
        return Math.abs(arg);
      case 'exp':
        return Math.exp(arg);
      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }
}
