# Calcora

A dependency-free, browser-based scientific toolkit: calculator, function plotter, calculus tools,
unit and currency converters, BMI, and a searchable formula library.

## Run

```bash
npm start          # serves the folder at http://localhost:8765 (needs Python)
npm test           # unit tests for the parser and calculus (Node 18+)
npm run validate   # accuracy benchmark vs an independent Python reference -> validation/REPORT.md
npm run mutation   # proves the benchmark can fail: plants 10 known bugs -> validation/MUTATION.md
```

`validate` and `mutation` need Python 3 with numpy (development only; the app itself has no dependencies).
You can also open `index.html` directly, but a local server is recommended (currency sync uses `fetch`).

## Who it is for, and how we know

- **Audience and hypotheses:** [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md). Written as hypotheses; no user research
  has been done yet, and the brief says which claims are proven and which are not.
- **Usability study protocol:** [`docs/USABILITY_TEST.md`](docs/USABILITY_TEST.md) (tasks, SUS, analysis plan, blank results).
  Not yet run.

## Accuracy

Measured, not asserted. `npm run validate` generates random expression trees and renders each one twice: in this app's
syntax and in Python. The Python side uses `math`, `cmath` (complex-step differentiation, no cancellation error) and
numpy (64-point Gauss-Legendre integration). On the committed seed (`validation/REPORT.md`):

| Area | Cases | Passed | Max relative error |
|---|---|---|---|
| Arithmetic and functions (random trees, 600 flat precedence chains checked against Python's own parser, 402 special-angle / edge cases) | 3,999 | 100% | 4.9e-12 |
| Derivatives (checked at 2,337 points) | 594 | 100% | 3.1e-14 |
| Antiderivatives, F(b) - F(a), across 10 integration families | 1,145 | 100% | 4.0e-14 |
| Definite integrals, Simpson n = 1000 | 1,250 | 100% | 8.5e-9 |

**Integration coverage** (how often a closed form is found), per method, from the same report:

| Set | Cases | Closed form found | Of those, correct |
|---|---|---|---|
| Nine method families, written to match the methods (basic, polynomial, trig powers, trig products, e^p·trig, by parts, u-substitution, rational, root/exponential substitution, radicals) | 1,100 | 100% | 100% |
| **Hand-picked textbook set, chosen without regard to the methods** | 50 | **90% (45)** | **100% (45/45)** |
| Integrals that must be declined (no elementary antiderivative, or outside the methods) | 100 | declined 100/100 | n/a |

The first row is partly self-fulfilling (the families are mine), so treat the **textbook set** as the honest number. Its
5 misses are 3 non-elementary integrals (`atan(x)²`, `ln(x)·sin(x)`, `sin(x)²/x`), one that needs trig substitution
(`√(1+x²)/x`) and `x·eˣ/(1+x)²`.

Honest caveats: 3 arithmetic cases were excluded because `mod` with a quotient above 1e9 depends on bits below double
precision; the check is numeric at sampled points, not a symbolic proof; the benchmark's integrals live on `[0.5, 2.5]`.

`npm run mutation` plants 20 known bugs one at a time (10 in the calculator and derivatives, 10 in the integration
methods) and confirms the benchmark flags each (**20 of 20 detected**). Two of them show the defense in depth: the same wrong
by-parts rule is run with the self-check **on** (it degrades to "no closed form", coverage 100% to 94%, no wrong answer
ever shown) and **off** (wrong answers leak and the independent reference catches them, 100% to 92%). The check has found
real flaws in this project (a fixed-decimal trig rounding that destroyed small results, `d/dx (x−x)^0.5` returning NaN)
and several blind spots in the benchmark itself, all since fixed.

## Works on phone, tablet and laptop

- **Responsive layout:** laptop (sidebar + keypad + side panel), tablet (stacked panels), phone (bottom navigation bar,
  thumb-sized keys of 42-52px, compact header). Tested at 360, 390, 820, 1280 and 1366px widths.
- **Phone details:** safe-area insets for notches, dynamic viewport height (`100dvh`), 16px inputs so iOS does not
  zoom on focus, no tap delay, landscape layout, and reduced-motion support.
- **Installable and offline (PWA):** `manifest.webmanifest` and `sw.js`. On a phone choose *Add to Home Screen*;
  on a laptop use the install icon in the Chrome/Edge address bar. After the first visit everything except live
  currency rates works without a network. Rates fall back to the last synced (or approximate) values.
- Service workers require HTTPS or `localhost`. Opening `index.html` from disk still works but without install/offline.

## Deploy (any static host)

There is no build step. Upload the folder to GitHub Pages, Netlify, Vercel or Cloudflare Pages and it is live over
HTTPS, which is what makes the install prompt and offline mode work for real users. When you change any file,
bump `CACHE_VERSION` in `sw.js` (and the `?v=` strings in `index.html`).

## Modules

| File | Responsibility |
|---|---|
| `calculator.js` | Lexer + recursive-descent parser, keypad/keyboard UI, history, graph plotter |
| `calculus.js` | Expression trees, simplifier (normal forms), differentiation, calculus panel UI |
| `integration.js` | Integration engine: 9 methods + a numeric self-check on every answer |
| `converters.js` | Currency conversion with live-rate sync + offline fallback |
| `bmi.js` | BMI calculation, WHO adult categories, healthy-weight range |
| `formula-solver.js` | Equation solver: parses an equation, rearranges it for any variable, or solves numerically |
| `units.js` | Catalogue of 26 physical quantities and 150+ units (incl. °C/°F/K), shared by the converter and the formula dialog |
| `formula-data.js` | The 81 formulas: equations, variables, units, worked examples |
| `formulas.js` | Formula page (cards, search, favorites) and the Calculate dialog |
| `unit-converter.js` | The Unit Converter panel |
| `app.js` | Navigation, themes, sound, shared state, service-worker registration |
| `sw.js` / `manifest.webmanifest` / `icons/` | Offline caching and installability |
| `tests.js` | Unit tests (no framework) |

## Calculator behaviour

- Precedence: `^` binds tighter than unary minus (`-2^2 = -4`); `^` is right-associative (`2^3^2 = 512`).
- Implicit multiplication: `2π`, `3(4+5)`, `2sin(30)`.
- Scientific notation: `6.62607015e-34`. `2e` still means 2 × e.
- DEG/RAD toggle applies to trig and inverse trig. Trig results are rounded to 12 decimals so `sin(180°) = 0`.
- Results are shown to 12 significant digits; errors name the cause (division by zero, domain error, etc.).
- Unclosed parentheses are closed automatically on `=`.

## Formula library you can calculate with

Search a formula, press **Calculate**, choose what to find, enter the other values, and get the answer. Typical use:
*Area of Circle* → find `r` → enter `A = 28.27` → `r = 3`, with the rearranged formula `r = √(A / π)` and the
substitution shown step by step.

- **Any variable can be the unknown.** If it appears once the equation is rearranged exactly (`r = √(A / π)`); if it
  appears more than once (`s = ut + ½at²` solved for `t`) all real roots are found numerically. Every answer is
  substituted back into the original equation and rejected if it does not satisfy it.
- **Several answers are shown when they exist** (quadratic roots, `v = ±5`, the ambiguous case of the sine rule), and
  physically impossible ones are dropped (a negative length or time, a probability above 1).
- **Several equation forms:** electrical power is `P = VI = I²R = V²/R`; fill in any two of V, I, R and the matching
  form is used. Constants such as `g`, `k`, `G`, `R` are prefilled and editable.
- **Units.** Every physical variable has a unit picker, and the answer can be shown in any compatible unit: type a radius
  in cm and read the area in m², enter a gas at `1 atm` and `0 °C` and get `22.414 L`, give a time in months. Temperatures
  convert correctly (°C and °F are shifted scales, not just scaled ones). The working shows the conversions used.
- **Typed values can be expressions:** `2*pi`, `1/3`, `1e-6`, `sqrt(2)`.
- **A calmer page:** three-column cards (name, formula, one line of description), a ★ Favorites filter, search by name,
  symbol or variable, and the working hidden behind "Show working" until you ask for it.
- **Degrees or radians** for trigonometric formulas. Angles are searched over one full turn, so `tan θ = −1` gives both
  135° and 315°.
- **Data sets:** mean, variance, standard deviation (population and sample) and correlation take a pasted list.
- **Two formulas are reference-only** (the binomial expansion and Euler's formula) and say why.
- **Try an example** on every formula fills a worked case; **Use in calculator** sends the answer to the calculator.

How it is tested (`npm test`, about 790 checks of the formula and unit features): every worked example against independently written
arithmetic; every unit against its official definition plus a lossless round trip between all 156 units; end-to-end cases
with units (atm and °C, mmol/L, months); a **round trip** that solves every formula for every one of its variables (about 2,000 solves) and checks the
original value comes back; edge cases (double roots, no real solution, missing inputs, degrees vs radians); and in the
browser, every one of the 79 calculable formulas was run through the real dialog.

## Unit Converter

One panel for 15 quantities (length, mass, temperature, time, area, volume, speed, pressure, energy, power, force, angle,
data, frequency, density). Pick a quantity, type in either box (both directions work, expressions like `1/3` are fine), swap
the units, or read the same value in **every** unit below and tap one to make it the target. Your last choice is remembered.
Definitions use exact or agreed values (1 in = 0.0254 m, 1 lb = 0.45359237 kg, 1 atm = 101325 Pa = 760 mmHg, 1 US gal =
3.785411784 L). A year is 365.25 days and a month the 30.4375-day average, and the catalogue says so.

## Calculus

- **Differentiation:** sum, product, quotient, power and chain rules for `sin cos tan asin acos atan ln log10 exp sqrt abs`.
  `log(x)` means natural log in this module.
- **Integration** (`integration.js`) tries these methods in order and stops at the first that works:
  1. basic rules (powers, sin/cos/exp/tan/ln/atan/asin/acos of `ax+b`, `a^u`)
  2. polynomial products (expanded)
  3. trigonometric: powers of sin/cos/tan (reduction formulas), sec/csc, products (product-to-sum),
     even powers (half-angle), odd powers of sin·cos (Pythagorean identity)
  4. `e^(ax+b)·sin/cos(cx+d)` and `e^p·sin²q` in closed form
  5. rational functions: long division, then partial fractions for any mix of linear and irreducible quadratic
     factors **including repeated ones**, and expanded denominators such as `x³+1` or `x⁴+1` (factored from their roots)
  6. `P(x)/√Q` and `P(x)·√Q` for a quadratic `Q` (reduction formula + completing the square)
  7. u-substitution (including `u = x²`, `u = eˣ`, `u = ln x`)
  8. root substitution `x = uᵏ` for `√x`, `x^(1/3)`, ...
  9. integration by parts, choosing `u` by LIATE
- **Never a confident wrong answer.** Before an antiderivative is shown, the app differentiates it and checks that it
  reproduces the integrand. A failing candidate is discarded and reported as "no closed form found". Recursion is bounded
  (depth limit, cycle guard, call budget), so integrals it cannot do fail in about a second at most.
- **Definite integrals:** computed as `F(b) − F(a)` and cross-checked with Simpson's rule (n = 1000). If the two disagree
  (a pole or jump inside `[a, b]`, such as `∫₋₁² 1/x dx`) no value is shown, only the warning.
- **Not supported** (reported as "no closed form"): non-elementary integrals (`e^(x²)`, `sin(x)/x`, `ln(x)·sin(x)`),
  trigonometric substitution (`√(1+x²)/x`), integrals needing a cyclic by-parts with a polynomial factor
  (`x·eˣ·sin x`), and denominators with repeated *expanded* roots.

## Known limitations

- Floating-point (IEEE-754 double) arithmetic: results are accurate to roughly 12 significant digits, not arbitrary precision.
- Currency rates are indicative only (public API `open.er-api.com`, offline fallback values are approximate). Not for trading.
- BMI is an adult screening index only; it is not medical advice.
- Calculus output is not guaranteed to be in simplest form (it is mathematically equivalent; the tests verify it numerically).
- Simplification assumes `x/x = 1` (i.e. x ≠ 0) and `√x·√x = x` (x ≥ 0), the usual convention; antiderivatives with `ln|u|`
  hold on each interval where `u ≠ 0`, which is why a definite integral across a pole is refused rather than computed.
- Integration is not a full computer-algebra system: see the "Not supported" list in the Calculus section.

## Testing approach

`tests.js` checks exact outputs for arithmetic, precedence, DEG/RAD and error cases. Derivatives and antiderivatives are
verified numerically (central differences at several points), so correctness does not depend on how the answer is printed.
Run `npm test` before every change.
