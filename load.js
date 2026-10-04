// Loads the browser modules into a Node sandbox so the pure math code can be tested
// and benchmarked without a DOM.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function loadModules() {
  const ctx = vm.createContext({ console, Math });
  ctx.window = ctx;
  for (const f of ['calculator.js', 'calculus.js', 'integration.js', 'formula-solver.js', 'units.js', 'formula-data.js', 'formulas.js']) {
    const file = path.join(process.env.QL_SRC || path.join(__dirname, '..'), f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f });
  }
  return {
    Calc: ctx.window.ScientificCalculator,
    Calculus: ctx.window.CalculusTools,
    Solver: ctx.window.FormulaSolver,
    Library: ctx.window.FormulaLibrary,
    Formulas: ctx.window.FormulaLibrary.formulas,
    Units: ctx.window.UnitCatalog,
  };
};
