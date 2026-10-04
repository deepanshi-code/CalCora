// --- FORMULA DATA ---
// Each formula is both reference text (expr, desc) and a working calculator: `eqs` holds the equation(s)
// in machine-readable form and `vars` describes every variable (symbol, name, unit, allowed range).
// The "Calculate" dialog lets the user pick the variable to find, fills in the others, and uses
// FormulaSolver (formula-solver.js) to rearrange or numerically solve the equation.
//
//   eqs      equations the solver may use ("P = V*I", "P = I^2*R"...). With several, the one whose other
//            variables are all filled in is used.
//   vars     [{ id, sym, name, unit, dim, min, max, def, angle }]   def = editable default (a physical constant);
//            dim = physical dimension (see units.js) so values can be entered and shown in any compatible unit;
//            unit = the unit the equation itself works in
//   targets  optional: variables that may be solved for (default: all)
//   example  { given, find }  worked example behind the "Try an example" button (and the tests)
//   dataset  list-input formulas (mean, variance, correlation) computed directly instead of solved
//   solve:false + why   shown as a reference only
(function () {
  const V = (id, name, unit = '', o = {}) => ({ id, name, unit, sym: o.sym || id, ...o });
  const POS = { min: 0 };                     // physical quantity that cannot be negative
  const ANGLE = { angle: true };              // degrees or radians, following the dialog's toggle
  const TRI_ANGLE = { angle: true, min: 0, max: 180 };
  const PROB = { min: 0, max: 1 };
  const SS = '((a+b+c)/2)';                   // Heron's semi-perimeter

  const parseList = (text) => {
    const items = String(text).split(/[\s,;]+/).filter(Boolean);
    if (!items.length) throw new Error('Enter at least one number');
    return items.map((t) => window.FormulaSolver.parseNumber(t));
  };
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const mean = (a) => sum(a) / a.length;
  const sumSq = (a, m) => sum(a.map((x) => (x - m) * (x - m)));

  const FORMULAS = [
    // ---------------------------------------------------------------- geometry
    { name: 'Area of Circle', category: 'geometry', expr: 'A = π × r²', desc: 'Area enclosed by a circle of radius r.',
      eqs: ['A = pi*r^2'], vars: [V('A', 'Area', '', POS), V('r', 'radius', '', POS)], example: { given: { r: 3 }, find: 'A' } },
    { name: 'Circumference of Circle', category: 'geometry', expr: 'C = 2πr', desc: 'Total perimeter length of a circle.',
      eqs: ['C = 2*pi*r'], vars: [V('C', 'Circumference', '', POS), V('r', 'radius', '', POS)], example: { given: { r: 1 }, find: 'C' } },
    { name: 'Area of Rectangle', category: 'geometry', expr: 'A = l × w', desc: 'Area of a rectangle with length l and width w.',
      eqs: ['A = l*w'], vars: [V('A', 'Area', '', POS), V('l', 'length', '', POS), V('w', 'width', '', POS)], example: { given: { l: 4, w: 5 }, find: 'A' } },
    { name: 'Perimeter of Rectangle', category: 'geometry', expr: 'P = 2(l + w)', desc: 'Sum of all sides of a rectangle.',
      eqs: ['P = 2*(l+w)'], vars: [V('P', 'Perimeter', '', POS), V('l', 'length', '', POS), V('w', 'width', '', POS)], example: { given: { l: 4, w: 5 }, find: 'P' } },
    { name: 'Area of Triangle', category: 'geometry', expr: 'A = ½ × b × h', desc: 'Area of a triangle with base b and height h.',
      eqs: ['A = 0.5*b*h'], vars: [V('A', 'Area', '', POS), V('b', 'base', '', POS), V('h', 'height', '', POS)], example: { given: { b: 6, h: 4 }, find: 'A' } },
    { name: 'Area of Triangle (Heron)', category: 'geometry', expr: 'A = √(s(s-a)(s-b)(s-c))', desc: "Heron's formula: s = (a+b+c)/2 (semi-perimeter).",
      eqs: [`A = sqrt(${SS}*(${SS}-a)*(${SS}-b)*(${SS}-c))`], vars: [V('A', 'Area', '', POS), V('a', 'side a', '', POS), V('b', 'side b', '', POS), V('c', 'side c', '', POS)], example: { given: { a: 3, b: 4, c: 5 }, find: 'A' } },
    { name: 'Perimeter of Triangle', category: 'geometry', expr: 'P = a + b + c', desc: 'Sum of all three sides of a triangle.',
      eqs: ['P = a+b+c'], vars: [V('P', 'Perimeter', '', POS), V('a', 'side a', '', POS), V('b', 'side b', '', POS), V('c', 'side c', '', POS)], example: { given: { a: 3, b: 4, c: 5 }, find: 'P' } },
    { name: 'Pythagoras Theorem', category: 'geometry', expr: 'c² = a² + b²', desc: 'Relation between sides of a right-angled triangle.',
      eqs: ['c^2 = a^2 + b^2'], vars: [V('c', 'hypotenuse', '', POS), V('a', 'side a', '', POS), V('b', 'side b', '', POS)], example: { given: { a: 3, b: 4 }, find: 'c' } },
    { name: 'Volume of Sphere', category: 'geometry', expr: 'V = (4/3)πr³', desc: 'Volume enclosed inside a sphere of radius r.',
      eqs: ['V = (4/3)*pi*r^3'], vars: [V('V', 'Volume', '', POS), V('r', 'radius', '', POS)], example: { given: { r: 3 }, find: 'V' } },
    { name: 'Surface Area of Sphere', category: 'geometry', expr: 'SA = 4πr²', desc: 'Total surface area of a sphere.',
      eqs: ['SA = 4*pi*r^2'], vars: [V('SA', 'Surface Area', '', POS), V('r', 'radius', '', POS)], example: { given: { r: 2 }, find: 'SA' } },
    { name: 'Volume of Cylinder', category: 'geometry', expr: 'V = πr²h', desc: 'Volume of a right circular cylinder.',
      eqs: ['V = pi*r^2*h'], vars: [V('V', 'Volume', '', POS), V('r', 'radius', '', POS), V('h', 'height', '', POS)], example: { given: { r: 2, h: 5 }, find: 'V' } },
    { name: 'Lateral SA of Cylinder', category: 'geometry', expr: 'LSA = 2πrh', desc: 'Curved surface area of a cylinder (excluding caps).',
      eqs: ['LSA = 2*pi*r*h'], vars: [V('LSA', 'Lateral Surface Area', '', POS), V('r', 'radius', '', POS), V('h', 'height', '', POS)], example: { given: { r: 2, h: 5 }, find: 'LSA' } },
    { name: 'Total SA of Cylinder', category: 'geometry', expr: 'TSA = 2πr(r + h)', desc: 'Total surface area including both circular caps.',
      eqs: ['TSA = 2*pi*r*(r+h)'], vars: [V('TSA', 'Total Surface Area', '', POS), V('r', 'radius', '', POS), V('h', 'height', '', POS)], example: { given: { r: 2, h: 5 }, find: 'TSA' } },
    { name: 'Volume of Cone', category: 'geometry', expr: 'V = (1/3)πr²h', desc: 'Volume of a right circular cone.',
      eqs: ['V = (1/3)*pi*r^2*h'], vars: [V('V', 'Volume', '', POS), V('r', 'base radius', '', POS), V('h', 'height', '', POS)], example: { given: { r: 3, h: 4 }, find: 'V' } },
    { name: 'Slant Height of Cone', category: 'geometry', expr: 'l = √(r² + h²)', desc: 'Slant height of a cone from apex to base edge.',
      eqs: ['l = sqrt(r^2+h^2)'], vars: [V('l', 'slant height', '', POS), V('r', 'radius', '', POS), V('h', 'height', '', POS)], example: { given: { r: 3, h: 4 }, find: 'l' } },
    { name: 'Volume of Cube', category: 'geometry', expr: 'V = a³', desc: 'Volume of a cube with side length a.',
      eqs: ['V = a^3'], vars: [V('V', 'Volume', '', POS), V('a', 'side', '', POS)], example: { given: { a: 3 }, find: 'V' } },
    { name: 'Surface Area of Cube', category: 'geometry', expr: 'SA = 6a²', desc: 'Total surface area of all 6 faces of a cube.',
      eqs: ['SA = 6*a^2'], vars: [V('SA', 'Surface Area', '', POS), V('a', 'side', '', POS)], example: { given: { a: 2 }, find: 'SA' } },
    { name: 'Volume of Cuboid', category: 'geometry', expr: 'V = l × w × h', desc: 'Volume of a rectangular box.',
      eqs: ['V = l*w*h'], vars: [V('V', 'Volume', '', POS), V('l', 'length', '', POS), V('w', 'width', '', POS), V('h', 'height', '', POS)], example: { given: { l: 2, w: 3, h: 4 }, find: 'V' } },
    { name: 'Diagonal of Rectangle', category: 'geometry', expr: 'd = √(l² + w²)', desc: 'Length of the diagonal of a rectangle.',
      eqs: ['d = sqrt(l^2+w^2)'], vars: [V('d', 'diagonal', '', POS), V('l', 'length', '', POS), V('w', 'width', '', POS)], example: { given: { l: 3, w: 4 }, find: 'd' } },
    { name: 'Arc Length', category: 'geometry', expr: 'L = rθ', desc: 'Length of an arc where θ is in radians.',
      eqs: ['L = r*theta'], vars: [V('L', 'arc length', '', POS), V('r', 'radius', '', POS), V('theta', 'angle', 'rad', { sym: 'θ', min: 0 })], example: { given: { r: 5, theta: 2 }, find: 'L' } },
    { name: 'Area of Sector', category: 'geometry', expr: 'A = ½r²θ', desc: 'Area of a circular sector (θ in radians).',
      eqs: ['A = 0.5*r^2*theta'], vars: [V('A', 'sector area', '', POS), V('r', 'radius', '', POS), V('theta', 'angle', 'rad', { sym: 'θ', min: 0 })], example: { given: { r: 4, theta: 1.5 }, find: 'A' } },
    { name: 'Area of Parallelogram', category: 'geometry', expr: 'A = b × h', desc: 'Area of a parallelogram.',
      eqs: ['A = b*h'], vars: [V('A', 'Area', '', POS), V('b', 'base', '', POS), V('h', 'perpendicular height', '', POS)], example: { given: { b: 5, h: 3 }, find: 'A' } },
    { name: 'Area of Trapezoid', category: 'geometry', expr: 'A = ½(a + b) × h', desc: 'Area of a trapezoid with parallel sides a and b.',
      eqs: ['A = 0.5*(a+b)*h'], vars: [V('A', 'Area', '', POS), V('a', 'parallel side a', '', POS), V('b', 'parallel side b', '', POS), V('h', 'height', '', POS)], example: { given: { a: 3, b: 5, h: 4 }, find: 'A' } },

    // ---------------------------------------------------------------- algebra
    { name: 'Quadratic Formula', category: 'algebra', expr: 'x = (-b ± √(b²-4ac)) / 2a', desc: 'Roots of ax² + bx + c = 0. Both roots are shown.',
      eqs: ['a*x^2 + b*x + c = 0'], vars: [V('a', 'coefficient a'), V('b', 'coefficient b'), V('c', 'coefficient c'), V('x', 'root')], example: { given: { a: 1, b: -3, c: 2 }, find: 'x' } },
    { name: 'Discriminant', category: 'algebra', expr: 'Δ = b² - 4ac', desc: 'Determines nature of roots of a quadratic equation.',
      eqs: ['D = b^2 - 4*a*c'], vars: [V('D', 'discriminant', '', { sym: 'Δ' }), V('a', 'coefficient a'), V('b', 'coefficient b'), V('c', 'coefficient c')], example: { given: { a: 1, b: 4, c: 1 }, find: 'D' } },
    { name: 'Slope-Intercept Form', category: 'algebra', expr: 'y = mx + b', desc: 'Equation of a straight line.',
      eqs: ['y = m*x + b'], vars: [V('y', 'y'), V('m', 'slope'), V('x', 'x'), V('b', 'y-intercept')], example: { given: { m: 2, x: 3, b: 1 }, find: 'y' } },
    { name: 'Point-Slope Form', category: 'algebra', expr: 'y - y₁ = m(x - x₁)', desc: 'Line through point (x₁, y₁) with slope m.',
      eqs: ['y - y1 = m*(x - x1)'], vars: [V('y', 'y'), V('y1', 'known y', '', { sym: 'y₁' }), V('m', 'slope'), V('x', 'x'), V('x1', 'known x', '', { sym: 'x₁' })], example: { given: { m: 2, x: 3, x1: 1, y1: 1 }, find: 'y' } },
    { name: 'Distance Formula', category: 'algebra', expr: 'd = √((x₂-x₁)² + (y₂-y₁)²)', desc: 'Distance between two points in a plane.',
      eqs: ['d = sqrt((x2-x1)^2 + (y2-y1)^2)'], vars: [V('d', 'distance', '', POS), V('x1', 'x of point 1', '', { sym: 'x₁' }), V('y1', 'y of point 1', '', { sym: 'y₁' }), V('x2', 'x of point 2', '', { sym: 'x₂' }), V('y2', 'y of point 2', '', { sym: 'y₂' })], example: { given: { x1: 0, y1: 0, x2: 3, y2: 4 }, find: 'd' } },
    { name: 'Midpoint Formula', category: 'algebra', expr: 'M = ((x₁+x₂)/2, (y₁+y₂)/2)', desc: 'Midpoint of a line segment. Find either coordinate.',
      eqs: ['mx = (x1+x2)/2', 'my = (y1+y2)/2'], vars: [V('mx', 'midpoint x', '', { sym: 'Mx' }), V('my', 'midpoint y', '', { sym: 'My' }), V('x1', 'x of point 1', '', { sym: 'x₁' }), V('y1', 'y of point 1', '', { sym: 'y₁' }), V('x2', 'x of point 2', '', { sym: 'x₂' }), V('y2', 'y of point 2', '', { sym: 'y₂' })], example: { given: { x1: 2, x2: 8 }, find: 'mx' } },
    { name: 'Exponential Growth', category: 'algebra', expr: 'A = A₀ × eʳᵗ', desc: 'Continuous exponential growth model.',
      eqs: ['A = A0*exp(r*t)'], vars: [V('A', 'final amount'), V('A0', 'initial amount', '', { sym: 'A₀' }), V('r', 'rate', '(decimal)'), V('t', 'time', '', POS)], example: { given: { A0: 100, r: 0.1, t: 2 }, find: 'A' } },
    { name: 'Logarithm Change Base', category: 'algebra', expr: 'logₐb = ln(b) / ln(a)', desc: 'Change of base formula for logarithms.',
      eqs: ['L = ln(b)/ln(a)'], vars: [V('L', 'logₐ(b)', '', { sym: 'logₐb' }), V('a', 'base a'), V('b', 'argument b')], example: { given: { a: 2, b: 8 }, find: 'L' } },
    { name: 'Sum of Arithmetic Series', category: 'algebra', expr: 'Sₙ = n/2 × (a + l)', desc: 'Sum of n terms of an arithmetic progression.',
      eqs: ['S = (n/2)*(a + l)'], vars: [V('S', 'sum', '', { sym: 'Sₙ' }), V('n', 'number of terms', '', POS), V('a', 'first term'), V('l', 'last term')], example: { given: { n: 10, a: 1, l: 10 }, find: 'S' } },
    { name: 'Sum of Geometric Series', category: 'algebra', expr: 'Sₙ = a(1 - rⁿ) / (1-r)', desc: 'Sum of n terms of a geometric progression (r ≠ 1).',
      eqs: ['S = a*(1 - r^n)/(1 - r)'], vars: [V('S', 'sum', '', { sym: 'Sₙ' }), V('a', 'first term'), V('r', 'common ratio'), V('n', 'number of terms', '', POS)], example: { given: { a: 1, r: 2, n: 3 }, find: 'S' } },
    { name: 'Binomial Theorem', category: 'algebra', expr: '(a+b)ⁿ = Σ C(n,k) aⁿ⁻ᵏ bᵏ', desc: 'Expansion of a binomial raised to a power.',
      solve: false, why: 'It expands into several terms rather than giving one number. Use "Combinations C(n,r)" for the coefficients.', vars: [V('C', 'C(n,k) = n!/(k!(n-k)!)')] },
    { name: 'nth Term – Arithmetic', category: 'algebra', expr: 'aₙ = a + (n-1)d', desc: 'nth term of an arithmetic progression.',
      eqs: ['an = a + (n-1)*d'], vars: [V('an', 'nth term', '', { sym: 'aₙ' }), V('a', 'first term'), V('n', 'term number', '', POS), V('d', 'common difference')], example: { given: { a: 2, n: 5, d: 3 }, find: 'an' } },
    { name: 'nth Term – Geometric', category: 'algebra', expr: 'aₙ = a × rⁿ⁻¹', desc: 'nth term of a geometric progression.',
      eqs: ['an = a*r^(n-1)'], vars: [V('an', 'nth term', '', { sym: 'aₙ' }), V('a', 'first term'), V('r', 'common ratio'), V('n', 'term number', '', POS)], example: { given: { a: 2, r: 3, n: 4 }, find: 'an' } },

    // ---------------------------------------------------------------- physics (SI units)
    { name: "Newton's 2nd Law", category: 'physics', expr: 'F = ma', desc: 'Force equals mass times acceleration.',
      eqs: ['F = m*a'], vars: [V('F', 'force', 'N'), V('m', 'mass', 'kg', POS), V('a', 'acceleration', 'm/s²')], example: { given: { m: 2, a: 3 }, find: 'F' } },
    { name: 'Kinetic Energy', category: 'physics', expr: 'KE = ½mv²', desc: 'Energy of a body due to its motion.',
      eqs: ['KE = 0.5*m*v^2'], vars: [V('KE', 'kinetic energy', 'J', POS), V('m', 'mass', 'kg', POS), V('v', 'velocity', 'm/s')], example: { given: { m: 2, v: 3 }, find: 'KE' } },
    { name: 'Potential Energy', category: 'physics', expr: 'PE = mgh', desc: 'Gravitational potential energy near Earth (g = 9.8 m/s² by default).',
      eqs: ['PE = m*g*h'], vars: [V('PE', 'potential energy', 'J'), V('m', 'mass', 'kg', POS), V('g', 'gravity', 'm/s²', { def: 9.8 }), V('h', 'height', 'm')], example: { given: { m: 2, h: 5 }, find: 'PE' } },
    { name: 'Equations of Motion (v)', category: 'physics', expr: 'v = u + at', desc: 'Final velocity from initial velocity and acceleration.',
      eqs: ['v = u + a*t'], vars: [V('v', 'final velocity', 'm/s'), V('u', 'initial velocity', 'm/s'), V('a', 'acceleration', 'm/s²'), V('t', 'time', 's', POS)], example: { given: { u: 2, a: 3, t: 4 }, find: 'v' } },
    { name: 'Equations of Motion (s)', category: 'physics', expr: 's = ut + ½at²', desc: 'Displacement under uniform acceleration. Solving for time can give two answers.',
      eqs: ['s = u*t + 0.5*a*t^2'], vars: [V('s', 'displacement', 'm'), V('u', 'initial velocity', 'm/s'), V('a', 'acceleration', 'm/s²'), V('t', 'time', 's', POS)], example: { given: { u: 2, a: 3, t: 4 }, find: 's' } },
    { name: 'Equations of Motion (v²)', category: 'physics', expr: 'v² = u² + 2as', desc: 'Velocity-displacement relation under acceleration.',
      eqs: ['v^2 = u^2 + 2*a*s'], vars: [V('v', 'final velocity', 'm/s'), V('u', 'initial velocity', 'm/s'), V('a', 'acceleration', 'm/s²'), V('s', 'displacement', 'm')], example: { given: { u: 3, a: 2, s: 4 }, find: 'v' } },
    { name: "Ohm's Law", category: 'physics', expr: 'V = IR', desc: 'Voltage = Current × Resistance.',
      eqs: ['V = I*R'], vars: [V('V', 'voltage', 'V'), V('I', 'current', 'A'), V('R', 'resistance', 'Ω', POS)], example: { given: { I: 3, R: 4 }, find: 'V' } },
    { name: 'Power (Electrical)', category: 'physics', expr: 'P = VI = I²R = V²/R', desc: 'Electrical power. Fill in any two of V, I, R and the matching form is used.',
      eqs: ['P = V*I', 'P = I^2*R', 'P = V^2/R'], vars: [V('P', 'power', 'W'), V('V', 'voltage', 'V'), V('I', 'current', 'A'), V('R', 'resistance', 'Ω', POS)], example: { given: { V: 12, I: 2 }, find: 'P' } },
    { name: "Coulomb's Law", category: 'physics', expr: 'F = k × q₁q₂ / r²', desc: 'Electrostatic force between two charges (k = 8.99×10⁹ by default).',
      eqs: ['F = k*q1*q2/r^2'], vars: [V('F', 'force', 'N'), V('k', 'Coulomb constant', 'N·m²/C²', { def: 8.9875517923e9 }), V('q1', 'charge 1', 'C', { sym: 'q₁' }), V('q2', 'charge 2', 'C', { sym: 'q₂' }), V('r', 'distance', 'm', POS)], example: { given: { q1: 1e-6, q2: 2e-6, r: 0.1 }, find: 'F' } },
    { name: "Newton's Gravitation", category: 'physics', expr: 'F = G × m₁m₂ / r²', desc: 'Gravitational force between two masses (G = 6.674×10⁻¹¹ by default).',
      eqs: ['F = G*m1*m2/r^2'], vars: [V('F', 'force', 'N'), V('G', 'gravitational constant', 'N·m²/kg²', { def: 6.6743e-11 }), V('m1', 'mass 1', 'kg', { sym: 'm₁', min: 0 }), V('m2', 'mass 2', 'kg', { sym: 'm₂', min: 0 }), V('r', 'distance', 'm', POS)], example: { given: { m1: 5.972e24, m2: 1, r: 6.371e6 }, find: 'F' } },
    { name: 'Pressure', category: 'physics', expr: 'P = F / A', desc: 'Pressure = Force per unit Area.',
      eqs: ['P = F/A'], vars: [V('P', 'pressure', 'Pa'), V('F', 'force', 'N'), V('A', 'area', 'm²', POS)], example: { given: { F: 100, A: 2 }, find: 'P' } },
    { name: 'Wave Speed', category: 'physics', expr: 'v = fλ', desc: 'Speed of a wave = frequency × wavelength.',
      eqs: ['v = f*lambda'], vars: [V('v', 'wave speed', 'm/s'), V('f', 'frequency', 'Hz', POS), V('lambda', 'wavelength', 'm', { sym: 'λ', min: 0 })], example: { given: { f: 50, lambda: 2 }, find: 'v' } },
    { name: 'Density', category: 'physics', expr: 'ρ = m / V', desc: 'Mass per unit volume.',
      eqs: ['rho = m/V'], vars: [V('rho', 'density', 'kg/m³', { sym: 'ρ', min: 0 }), V('m', 'mass', 'kg', POS), V('V', 'volume', 'm³', POS)], example: { given: { m: 10, V: 2 }, find: 'rho' } },
    { name: 'Work Done', category: 'physics', expr: 'W = F × d × cosθ', desc: 'Work done by a force over displacement d (θ = angle between them).',
      eqs: ['W = F*d*cos(theta)'], vars: [V('W', 'work', 'J'), V('F', 'force', 'N'), V('d', 'displacement', 'm'), V('theta', 'angle', '', { sym: 'θ', ...TRI_ANGLE })], example: { given: { F: 10, d: 5, theta: 60 }, find: 'W' } },
    { name: 'Momentum', category: 'physics', expr: 'p = mv', desc: 'Linear momentum of a moving object.',
      eqs: ['p = m*v'], vars: [V('p', 'momentum', 'kg·m/s'), V('m', 'mass', 'kg', POS), V('v', 'velocity', 'm/s')], example: { given: { m: 2, v: 3 }, find: 'p' } },
    { name: "Hooke's Law", category: 'physics', expr: 'F = -kx', desc: 'Restoring force of a spring displaced by x.',
      eqs: ['F = -k*x'], vars: [V('F', 'restoring force', 'N'), V('k', 'spring constant', 'N/m', POS), V('x', 'displacement', 'm')], example: { given: { k: 100, x: 0.1 }, find: 'F' } },

    // ---------------------------------------------------------------- trigonometry (degrees by default)
    { name: 'Sine Rule', category: 'trigonometry', expr: 'a/sinA = b/sinB = c/sinC', desc: 'Relates sides and opposite angles in any triangle. Solving for an angle may give two answers (the ambiguous case).',
      eqs: ['a/sin(A) = b/sin(B)'], vars: [V('a', 'side a', '', POS), V('A', 'angle A', '', TRI_ANGLE), V('b', 'side b', '', POS), V('B', 'angle B', '', TRI_ANGLE)], example: { given: { a: 10, A: 30, B: 90 }, find: 'b' } },
    { name: 'Cosine Rule', category: 'trigonometry', expr: 'c² = a² + b² - 2ab cosC', desc: 'Generalization of Pythagoras for any triangle.',
      eqs: ['c^2 = a^2 + b^2 - 2*a*b*cos(C)'], vars: [V('c', 'side c', '', POS), V('a', 'side a', '', POS), V('b', 'side b', '', POS), V('C', 'angle C (between a and b)', '', TRI_ANGLE)], example: { given: { a: 3, b: 4, C: 90 }, find: 'c' } },
    { name: 'Pythagorean Identity', category: 'trigonometry', expr: 'sin²θ + cos²θ = 1', desc: 'Fundamental identity from the unit circle. The calculator shows the left side equals 1 for any angle.',
      eqs: ['T = sin(theta)^2 + cos(theta)^2'], targets: ['T'], vars: [V('T', 'sin²θ + cos²θ', '', { sym: 'sin²θ + cos²θ' }), V('theta', 'angle', '', { sym: 'θ', ...ANGLE })], example: { given: { theta: 37 }, find: 'T' } },
    { name: 'tan Identity', category: 'trigonometry', expr: 'tanθ = sinθ / cosθ', desc: 'Tangent in terms of sine and cosine.',
      eqs: ['T = sin(theta)/cos(theta)'], vars: [V('T', 'tan θ', '', { sym: 'tanθ' }), V('theta', 'angle', '', { sym: 'θ', ...ANGLE })], example: { given: { theta: 45 }, find: 'T' } },
    { name: 'Double Angle – sin', category: 'trigonometry', expr: 'sin 2θ = 2 sinθ cosθ', desc: 'Sine of double the angle.',
      eqs: ['S2 = 2*sin(theta)*cos(theta)'], vars: [V('S2', 'sin 2θ', '', { sym: 'sin2θ' }), V('theta', 'angle', '', { sym: 'θ', ...ANGLE })], example: { given: { theta: 30 }, find: 'S2' } },
    { name: 'Double Angle – cos', category: 'trigonometry', expr: 'cos 2θ = cos²θ - sin²θ', desc: 'Cosine of double the angle.',
      eqs: ['C2 = cos(theta)^2 - sin(theta)^2'], vars: [V('C2', 'cos 2θ', '', { sym: 'cos2θ' }), V('theta', 'angle', '', { sym: 'θ', ...ANGLE })], example: { given: { theta: 30 }, find: 'C2' } },
    { name: "Euler's Formula", category: 'trigonometry', expr: 'e^(iθ) = cosθ + i sinθ', desc: "Euler's formula relating complex exponentials to trig.",
      solve: false, why: 'It involves the imaginary unit i. This calculator works with real numbers only.', vars: [V('theta', 'angle (radians)', '', { sym: 'θ' })] },
    { name: 'Sum-to-Product (sin)', category: 'trigonometry', expr: 'sinA + sinB = 2 sin((A+B)/2) cos((A-B)/2)', desc: 'Sum-to-product conversion. Calculate both sides to see they are equal.',
      eqs: ['L = sin(A) + sin(B)', 'R = 2*sin((A+B)/2)*cos((A-B)/2)'], targets: ['L', 'R'], vars: [V('L', 'left side', '', { sym: 'sinA + sinB' }), V('R', 'right side', '', { sym: '2sin((A+B)/2)cos((A−B)/2)' }), V('A', 'angle A', '', ANGLE), V('B', 'angle B', '', ANGLE)], example: { given: { A: 30, B: 60 }, find: 'L' } },

    // ---------------------------------------------------------------- statistics
    { name: 'Mean (Average)', category: 'statistics', expr: 'μ = Σxᵢ / n', desc: 'Sum of all values divided by count. Paste your data below.',
      dataset: { lists: [{ id: 'x', label: 'Values' }], compute: ({ x }) => [['Count n', x.length], ['Sum Σx', sum(x)], ['Mean μ', mean(x)]] },
      vars: [V('x', 'values')], example: { lists: { x: '2 4 4 4 5 5 7 9' } } },
    { name: 'Variance', category: 'statistics', expr: 'σ² = Σ(xᵢ - μ)² / n', desc: 'Average squared deviation from the mean. Shows both the population (÷n) and sample (÷n−1) versions.',
      dataset: { lists: [{ id: 'x', label: 'Values' }], compute: ({ x }) => {
        const m = mean(x), ss = sumSq(x, m);
        const rows = [['Count n', x.length], ['Mean μ', m], ['Population variance σ² (÷ n)', ss / x.length]];
        if (x.length > 1) rows.push(['Sample variance s² (÷ n−1)', ss / (x.length - 1)]);
        return rows;
      } }, vars: [V('x', 'values')], example: { lists: { x: '2 4 4 4 5 5 7 9' } } },
    { name: 'Standard Deviation', category: 'statistics', expr: 'σ = √(Σ(xᵢ - μ)² / n)', desc: 'Square root of variance, the spread of data. Population and sample versions.',
      dataset: { lists: [{ id: 'x', label: 'Values' }], compute: ({ x }) => {
        const m = mean(x), ss = sumSq(x, m);
        const rows = [['Count n', x.length], ['Mean μ', m], ['Population std dev σ (÷ n)', Math.sqrt(ss / x.length)]];
        if (x.length > 1) rows.push(['Sample std dev s (÷ n−1)', Math.sqrt(ss / (x.length - 1))]);
        return rows;
      } }, vars: [V('x', 'values')], example: { lists: { x: '2 4 4 4 5 5 7 9' } } },
    { name: 'Normal Distribution', category: 'statistics', expr: 'f(x) = (1/σ√2π) e^(-(x-μ)²/2σ²)', desc: 'Probability density of a Gaussian (bell) curve.',
      eqs: ['f = (1/(sigma*sqrt(2*pi)))*exp(-((x-mu)^2)/(2*sigma^2))'], vars: [V('f', 'density f(x)'), V('x', 'x'), V('mu', 'mean', '', { sym: 'μ' }), V('sigma', 'standard deviation', '', { sym: 'σ', min: 0 })], example: { given: { x: 0, mu: 0, sigma: 1 }, find: 'f' } },
    { name: 'Combinations C(n,r)', category: 'statistics', expr: 'C(n,r) = n! / (r!(n-r)!)', desc: 'Number of ways to choose r items from n (whole numbers, r ≤ n).',
      eqs: ['C = fact(n)/(fact(r)*fact(n-r))'], targets: ['C'], vars: [V('C', 'C(n,r)'), V('n', 'total items', '', { min: 0, int: true }), V('r', 'chosen items', '', { min: 0, int: true })], example: { given: { n: 5, r: 2 }, find: 'C' } },
    { name: 'Permutations P(n,r)', category: 'statistics', expr: 'P(n,r) = n! / (n-r)!', desc: 'Ordered arrangements of r items from n (whole numbers, r ≤ n).',
      eqs: ['P = fact(n)/fact(n-r)'], targets: ['P'], vars: [V('P', 'P(n,r)'), V('n', 'total items', '', { min: 0, int: true }), V('r', 'chosen items', '', { min: 0, int: true })], example: { given: { n: 5, r: 2 }, find: 'P' } },
    { name: "Bayes' Theorem", category: 'statistics', expr: 'P(A|B) = P(B|A)P(A)/P(B)', desc: 'Conditional probability update rule. Enter probabilities between 0 and 1.',
      eqs: ['PAB = PBA*PA/PB'], vars: [V('PAB', 'posterior P(A|B)', '', { sym: 'P(A|B)', ...PROB }), V('PBA', 'likelihood P(B|A)', '', { sym: 'P(B|A)', ...PROB }), V('PA', 'prior P(A)', '', { sym: 'P(A)', ...PROB }), V('PB', 'evidence P(B)', '', { sym: 'P(B)', ...PROB })], example: { given: { PBA: 0.9, PA: 0.01, PB: 0.05 }, find: 'PAB' } },
    { name: 'Correlation Coefficient', category: 'statistics', expr: 'r = Σ(x-x̄)(y-ȳ) / (n σₓ σᵧ)', desc: "Pearson's r measures linear relationship between two paired lists of equal length.",
      dataset: { lists: [{ id: 'x', label: 'x values' }, { id: 'y', label: 'y values' }], compute: ({ x, y }) => {
        if (x.length !== y.length) throw new Error(`x has ${x.length} values but y has ${y.length}: they must be paired`);
        if (x.length < 2) throw new Error('Enter at least two pairs');
        const mx = mean(x), my = mean(y);
        const sxy = sum(x.map((v, i) => (v - mx) * (y[i] - my)));
        const den = Math.sqrt(sumSq(x, mx) * sumSq(y, my));
        if (den === 0) throw new Error('One list has no spread (all values equal), so r is undefined');
        return [['Pairs n', x.length], ['Mean of x', mx], ['Mean of y', my], ['Correlation r', sxy / den]];
      } }, vars: [V('x', 'x values'), V('y', 'y values')], example: { lists: { x: '1 2 3 4 5', y: '2 4 5 4 5' } } },

    // ---------------------------------------------------------------- chemistry (SI units)
    { name: 'Ideal Gas Law', category: 'chemistry', expr: 'PV = nRT', desc: 'Relation between pressure, volume, moles, temperature (R = 8.314 J/mol·K by default).',
      eqs: ['P*V = n*R*T'], vars: [V('P', 'pressure', 'Pa', POS), V('V', 'volume', 'm³', POS), V('n', 'moles', 'mol', POS), V('R', 'gas constant', 'J/(mol·K)', { def: 8.314462618 }), V('T', 'temperature', 'K', POS)], example: { given: { P: 101325, n: 1, T: 273.15 }, find: 'V' } },
    { name: 'Molarity', category: 'chemistry', expr: 'M = n / V', desc: 'Concentration = moles of solute per litre of solution.',
      eqs: ['M = n/V'], vars: [V('M', 'molarity', 'mol/L', POS), V('n', 'moles', 'mol', POS), V('V', 'volume', 'L', POS)], example: { given: { n: 2, V: 0.5 }, find: 'M' } },
    { name: 'pH Formula', category: 'chemistry', expr: 'pH = -log₁₀[H⁺]', desc: 'pH from hydrogen ion concentration.',
      eqs: ['pH = -log10(H)'], vars: [V('pH', 'pH'), V('H', 'hydrogen ion concentration', 'mol/L', { sym: '[H⁺]', min: 0 })], example: { given: { H: 1e-7 }, find: 'pH' } },
    { name: 'pOH Formula', category: 'chemistry', expr: 'pOH = -log₁₀[OH⁻]', desc: 'pOH from hydroxide ion concentration.',
      eqs: ['pOH = -log10(OH)'], vars: [V('pOH', 'pOH'), V('OH', 'hydroxide concentration', 'mol/L', { sym: '[OH⁻]', min: 0 })], example: { given: { OH: 1e-3 }, find: 'pOH' } },
    { name: 'pH + pOH', category: 'chemistry', expr: 'pH + pOH = 14', desc: 'Relationship at 25°C.',
      eqs: ['pH + pOH = 14'], vars: [V('pH', 'pH'), V('pOH', 'pOH')], example: { given: { pH: 3 }, find: 'pOH' } },
    { name: 'Arrhenius Equation', category: 'chemistry', expr: 'k = A × e^(-Ea/RT)', desc: 'Temperature dependence of reaction rate constant.',
      eqs: ['k = A*exp(-Ea/(R*T))'], vars: [V('k', 'rate constant', '', POS), V('A', 'frequency factor', '', POS), V('Ea', 'activation energy', 'J/mol', { sym: 'Eₐ', min: 0 }), V('R', 'gas constant', 'J/(mol·K)', { def: 8.314462618 }), V('T', 'temperature', 'K', POS)], example: { given: { A: 1e13, Ea: 50000, T: 300 }, find: 'k' } },
    { name: 'Molar Mass', category: 'chemistry', expr: 'M = m / n', desc: 'Molar mass from mass and moles.',
      eqs: ['M = m/n'], vars: [V('M', 'molar mass', 'g/mol', POS), V('m', 'mass', 'g', POS), V('n', 'moles', 'mol', POS)], example: { given: { m: 36, n: 2 }, find: 'M' } },

    // ---------------------------------------------------------------- finance
    { name: 'Simple Interest', category: 'finance', expr: 'SI = P × R × T / 100', desc: 'Interest without compounding.',
      eqs: ['SI = P*R*T/100'], vars: [V('SI', 'interest'), V('P', 'principal', '', POS), V('R', 'rate', '% per year', POS), V('T', 'time', 'years', POS)], example: { given: { P: 1000, R: 5, T: 2 }, find: 'SI' } },
    { name: 'Compound Interest', category: 'finance', expr: 'A = P(1 + r/n)^(nt)', desc: 'Growth with periodic compounding. Enter the rate as a decimal (10% = 0.1).',
      eqs: ['A = P*(1 + r/n)^(n*t)'], vars: [V('A', 'final amount', '', POS), V('P', 'principal', '', POS), V('r', 'annual rate', 'decimal'), V('n', 'compounds per year', '', { min: 0 }), V('t', 'years', '', POS)], example: { given: { P: 1000, r: 0.1, n: 1, t: 2 }, find: 'A' } },
    { name: 'Present Value', category: 'finance', expr: 'PV = FV / (1 + r)^t', desc: "Today's worth of a future sum. Rate as a decimal.",
      eqs: ['PV = FV/(1 + r)^t'], vars: [V('PV', 'present value'), V('FV', 'future value'), V('r', 'rate', 'decimal'), V('t', 'periods', '', POS)], example: { given: { FV: 1210, r: 0.1, t: 2 }, find: 'PV' } },
    { name: 'Future Value', category: 'finance', expr: 'FV = PV × (1 + r)^t', desc: 'Value of present sum at future date. Rate as a decimal.',
      eqs: ['FV = PV*(1 + r)^t'], vars: [V('FV', 'future value'), V('PV', 'present value'), V('r', 'rate', 'decimal'), V('t', 'periods', '', POS)], example: { given: { PV: 1000, r: 0.1, t: 2 }, find: 'FV' } },
    { name: 'Rule of 72', category: 'finance', expr: 'Years ≈ 72 / r', desc: 'Estimate years to double an investment at annual rate r (in %).',
      eqs: ['Y = 72/r'], vars: [V('Y', 'years to double', 'years', { sym: 'Years', min: 0 }), V('r', 'annual rate', '%', { min: 0 })], example: { given: { r: 8 }, find: 'Y' } },
    { name: 'ROI', category: 'finance', expr: 'ROI = (Gain - Cost) / Cost × 100', desc: 'Return on Investment as a percentage.',
      eqs: ['ROI = (Gain - Cost)/Cost*100'], vars: [V('ROI', 'return', '%'), V('Gain', 'final value'), V('Cost', 'initial investment', '', POS)], example: { given: { Gain: 150, Cost: 100 }, find: 'ROI' } },
  ];

  const CATEGORY_LABELS = { geometry: 'Geometry', algebra: 'Algebra', physics: 'Physics', trigonometry: 'Trigonometry', statistics: 'Statistics', chemistry: 'Chemistry', finance: 'Finance' };

  // ---------------------------------------------------------------- physical dimensions
  // The unit written next to a variable (the unit its equation works in) decides its dimension, so a value
  // can be typed in any compatible unit (cm, lb, °F, atm...) and converted before solving.
  // Constants such as k, G and R have composite units and are left as fixed, editable numbers.
  const UNIT_DIM = {
    'N': ['force', 'N'], 'kg': ['mass', 'kg'], 'g': ['mass', 'g'], 'm/s²': ['acceleration', 'm/s²'], 'J': ['energy', 'J'],
    'm/s': ['speed', 'm/s'], 'm': ['length', 'm'], 's': ['time', 's'], 'years': ['time', 'yr'], 'V': ['voltage', 'V'],
    'A': ['current', 'A'], 'Ω': ['resistance', 'Ω'], 'C': ['charge', 'C'], 'Pa': ['pressure', 'Pa'], 'm²': ['area', 'm²'],
    'm³': ['volume', 'm³'], 'L': ['volume', 'L'], 'Hz': ['frequency', 'Hz'], 'kg/m³': ['density', 'kg/m³'], 'N/m': ['stiffness', 'N/m'],
    'mol': ['amount', 'mol'], 'K': ['temperature', 'K'], 'mol/L': ['concentration', 'mol/L'], 'g/mol': ['molarMass', 'g/mol'],
    'J/mol': ['molarEnergy', 'J/mol'], 'W': ['power', 'W'], 'rad': ['angle', 'rad'],
    '%': ['ratio', '%'], '% per year': ['ratio', '%'], 'decimal': ['ratio', 'decimal'],
  };
  // Geometry formulas are written without units (any consistent unit works). Giving them lengths, areas and
  // volumes lets the student type a radius in cm and read the area in m².
  const GEOMETRY_AREA = new Set(['A', 'SA', 'LSA', 'TSA']);
  FORMULAS.forEach((f) => f.vars.forEach((v) => {
    if (v.dim) return;
    if (v.unit && UNIT_DIM[v.unit]) { [v.dim, v.unit] = UNIT_DIM[v.unit]; return; }
    if (f.category === 'geometry' && !v.unit && f.solve !== false) {
      if (GEOMETRY_AREA.has(v.id)) { v.dim = 'area'; v.unit = 'm²'; }
      else if (v.id === 'V') { v.dim = 'volume'; v.unit = 'm³'; }
      else { v.dim = 'length'; v.unit = 'm'; }
    }
  }));

  window.FormulaData = { formulas: FORMULAS, categoryLabels: CATEGORY_LABELS, parseList };
})();
