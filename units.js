// --- UNIT CATALOGUE ---
// One table of physical dimensions and their units, shared by the Unit Converter panel and the
// Calculate dialog of the Formula Library.
//
// Every dimension has a base unit; each unit is  base = value × factor + offset  (offset is only
// non-zero for temperature, where °C and °F are shifted scales, not just scaled ones).
// Definitions use exact or internationally agreed values (inch = 0.0254 m, lb = 0.45359237 kg,
// atm = 101325 Pa, thermochemical calorie = 4.184 J, US gallon = 3.785411784 L, ...).
window.UnitCatalog = (() => {
  const u = (symbol, factor, extra = {}) => ({ symbol, factor, offset: 0, ...extra });

  const DIMENSIONS = {
    length: {
      label: 'Length', base: 'm',
      units: [u('nm', 1e-9), u('µm', 1e-6), u('mm', 1e-3), u('cm', 1e-2), u('m', 1), u('km', 1e3),
        u('in', 0.0254), u('ft', 0.3048), u('yd', 0.9144), u('mi', 1609.344), u('nmi', 1852)],
    },
    mass: {
      label: 'Mass', base: 'kg',
      units: [u('µg', 1e-9), u('mg', 1e-6), u('g', 1e-3), u('kg', 1), u('t', 1e3),
        u('oz', 0.028349523125), u('lb', 0.45359237), u('st', 6.35029318)],
    },
    time: {
      label: 'Time', base: 's',
      units: [u('µs', 1e-6), u('ms', 1e-3), u('s', 1), u('min', 60), u('h', 3600), u('day', 86400),
        u('week', 604800), u('month', 2629800, { note: 'average month' }), u('yr', 31557600, { note: '365.25 days' })],
    },
    temperature: {
      label: 'Temperature', base: 'K',
      units: [u('K', 1), u('°C', 1, { offset: 273.15 }), u('°F', 5 / 9, { offset: (459.67 * 5) / 9 })],
    },
    area: {
      label: 'Area', base: 'm²',
      units: [u('mm²', 1e-6), u('cm²', 1e-4), u('m²', 1), u('km²', 1e6), u('in²', 6.4516e-4), u('ft²', 0.09290304),
        u('yd²', 0.83612736), u('ha', 1e4), u('acre', 4046.8564224)],
    },
    volume: {
      label: 'Volume', base: 'm³',
      units: [u('mL', 1e-6), u('cm³', 1e-6), u('L', 1e-3), u('m³', 1), u('in³', 1.6387064e-5), u('ft³', 0.028316846592),
        u('fl oz', 2.95735295625e-5), u('cup', 2.365882365e-4), u('pt', 4.73176473e-4), u('qt', 9.46352946e-4), u('gal', 3.785411784e-3)],
    },
    speed: {
      label: 'Speed', base: 'm/s',
      units: [u('m/s', 1), u('km/h', 1 / 3.6), u('mph', 0.44704), u('ft/s', 0.3048), u('kn', 1852 / 3600)],
    },
    acceleration: {
      label: 'Acceleration', base: 'm/s²',
      units: [u('m/s²', 1), u('ft/s²', 0.3048), u('g', 9.80665, { note: 'standard gravity' })],
    },
    force: {
      label: 'Force', base: 'N',
      units: [u('mN', 1e-3), u('N', 1), u('kN', 1e3), u('MN', 1e6), u('lbf', 4.4482216152605), u('kgf', 9.80665), u('dyn', 1e-5)],
    },
    pressure: {
      label: 'Pressure', base: 'Pa',
      units: [u('Pa', 1), u('hPa', 100), u('kPa', 1e3), u('MPa', 1e6), u('bar', 1e5), u('mbar', 100), u('atm', 101325),
        u('psi', 6894.757293168361), u('mmHg', 101325 / 760, { note: 'taken equal to the torr, so 1 atm = 760 mmHg' }), u('torr', 101325 / 760)],
    },
    energy: {
      label: 'Energy', base: 'J',
      units: [u('mJ', 1e-3), u('J', 1), u('kJ', 1e3), u('MJ', 1e6), u('cal', 4.184), u('kcal', 4184), u('Wh', 3600),
        u('kWh', 3.6e6), u('eV', 1.602176634e-19), u('BTU', 1055.05585262), u('ft·lbf', 1.3558179483314004)],
    },
    power: {
      label: 'Power', base: 'W',
      units: [u('mW', 1e-3), u('W', 1), u('kW', 1e3), u('MW', 1e6), u('hp', 745.6998715822702, { note: 'mechanical horsepower' })],
    },
    voltage: { label: 'Voltage', base: 'V', units: [u('mV', 1e-3), u('V', 1), u('kV', 1e3)] },
    current: { label: 'Current', base: 'A', units: [u('µA', 1e-6), u('mA', 1e-3), u('A', 1), u('kA', 1e3)] },
    resistance: { label: 'Resistance', base: 'Ω', units: [u('mΩ', 1e-3), u('Ω', 1), u('kΩ', 1e3), u('MΩ', 1e6)] },
    charge: {
      label: 'Charge', base: 'C',
      units: [u('pC', 1e-12), u('nC', 1e-9), u('µC', 1e-6), u('mC', 1e-3), u('C', 1), u('mAh', 3.6), u('Ah', 3600)],
    },
    frequency: {
      label: 'Frequency', base: 'Hz',
      units: [u('Hz', 1), u('kHz', 1e3), u('MHz', 1e6), u('GHz', 1e9), u('rpm', 1 / 60)],
    },
    density: {
      label: 'Density', base: 'kg/m³',
      units: [u('kg/m³', 1), u('g/cm³', 1e3), u('g/mL', 1e3), u('kg/L', 1e3), u('lb/ft³', 16.018463373960138)],
    },
    stiffness: { label: 'Spring constant', base: 'N/m', units: [u('N/m', 1), u('N/cm', 100), u('kN/m', 1e3), u('lbf/in', 175.12683521)] },
    amount: { label: 'Amount', base: 'mol', units: [u('µmol', 1e-6), u('mmol', 1e-3), u('mol', 1), u('kmol', 1e3)] },
    concentration: {
      label: 'Concentration', base: 'mol/L',
      units: [u('µmol/L', 1e-6), u('mmol/L', 1e-3), u('mol/L', 1), u('mol/m³', 1e-3)],
    },
    molarMass: { label: 'Molar mass', base: 'g/mol', units: [u('mg/mol', 1e-3), u('g/mol', 1), u('kg/mol', 1e3)] },
    molarEnergy: { label: 'Molar energy', base: 'J/mol', units: [u('J/mol', 1), u('kJ/mol', 1e3), u('kcal/mol', 4184)] },
    angle: {
      label: 'Angle', base: 'rad',
      units: [u('rad', 1), u('°', Math.PI / 180, { note: 'degree' }), u('arcmin', Math.PI / 10800), u('grad', Math.PI / 200), u('turn', 2 * Math.PI)],
    },
    ratio: { label: 'Rate / percentage', base: 'decimal', units: [u('decimal', 1), u('%', 0.01), u('‰', 0.001)] },
    data: {
      label: 'Data', base: 'B',
      units: [u('bit', 0.125), u('B', 1), u('kB', 1e3), u('MB', 1e6), u('GB', 1e9), u('TB', 1e12), u('KiB', 1024),
        u('MiB', 1048576), u('GiB', 1073741824), u('TiB', 1099511627776)],
    },
  };

  const find = (dim, symbol) => {
    const d = DIMENSIONS[dim];
    if (!d) throw new Error(`Unknown dimension: ${dim}`);
    const unit = d.units.find((x) => x.symbol === symbol);
    if (!unit) throw new Error(`Unknown ${dim} unit: ${symbol}`);
    return unit;
  };

  const toBase = (value, dim, symbol) => { const x = find(dim, symbol); return value * x.factor + x.offset; };
  const fromBase = (value, dim, symbol) => { const x = find(dim, symbol); return (value - x.offset) / x.factor; };
  const convert = (value, dim, from, to) => (from === to ? value : fromBase(toBase(value, dim, from), dim, to));

  // Panel categories for the standalone converter (in display order)
  const PANEL_ORDER = ['length', 'mass', 'temperature', 'time', 'area', 'volume', 'speed', 'pressure', 'energy', 'power', 'force', 'angle', 'data', 'frequency', 'density'];

  const symbols = (dim) => DIMENSIONS[dim].units.map((x) => x.symbol);

  return { DIMENSIONS, PANEL_ORDER, find, toBase, fromBase, convert, symbols, has: (dim) => !!DIMENSIONS[dim] };
})();
