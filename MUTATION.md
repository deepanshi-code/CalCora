# Harness sensitivity (mutation check)

One known bug is planted at a time into a scratch copy of the source; the generator and Python reference are rerun.
A mutant counts as **detected** when any category scores lower than the unmutated baseline at the same sample size
(baseline: arithmetic 100.0%, derivative 100.0%, simpson 100.0%, antiderivative 100.0%, coverage 100.0%, textbook 90.0%, printed_deriv 100.0%, printed_anti 100.0%). Run with `npm run mutation`.

**Detected 20 of 20 planted bugs.**

| ID | Planted bug | Result | Where it showed up |
|---|---|---|---|
| M1 | ^ evaluated left-to-right (2^3^2 = 64 instead of 512) | DETECTED | arithmetic 100.0% -> 98.0%, simpson 100.0% -> 98.5% |
| M2 | trig rounded to 12 decimals (the earlier, flawed approach) | DETECTED | arithmetic 100.0% -> 99.9% |
| M3 | radians-to-degrees uses pi = 3.14159 | DETECTED | arithmetic 100.0% -> 97.8% |
| M4 | unary minus no longer covers a following power (-2^2 fails to parse) | DETECTED | arithmetic 100.0% -> 97.6%, simpson 100.0% -> 99.8%, printed_deriv 100.0% -> 99.3%, printed_anti 100.0% -> 97.2% |
| M5 | chain rule dropped for function calls | DETECTED | derivative 100.0% -> 87.5%, antiderivative 100.0% -> 86.0%, coverage 100.0% -> 21.8%, textbook 90.0% -> 28.0% |
| M6 | product rule uses minus instead of plus | DETECTED | derivative 100.0% -> 80.3%, antiderivative 100.0% -> 79.5%, coverage 100.0% -> 20.9%, textbook 90.0% -> 42.0% |
| M7 | integral of f(ax+b) forgets to divide by a | DETECTED | coverage 100.0% -> 77.8%, textbook 90.0% -> 80.0% |
| M8 | Simpson's weights swapped (2/4 instead of 4/2) | DETECTED | simpson 100.0% -> 0.0% |
| M9 | printed numbers rounded to 6 significant digits | DETECTED | printed_deriv 100.0% -> 99.3%, printed_anti 100.0% -> 79.6% |
| M10 | tan(90 deg) no longer reported as undefined | DETECTED | arithmetic 100.0% -> 99.8% |
| M11 | by parts: uv + ∫v du instead of uv − ∫v du | DETECTED | coverage 100.0% -> 94.1%, textbook 90.0% -> 64.0% |
| M12 | u-substitution forgets to divide by du/dx | DETECTED | coverage 100.0% -> 80.0%, textbook 90.0% -> 60.0% |
| M13 | repeated quadratic factor: reduction formula uses 1/√Δ instead of 2/√Δ | DETECTED | coverage 100.0% -> 89.5%, textbook 90.0% -> 66.0% |
| M14 | sin reduction formula: (n−1)/n replaced by 1/n | DETECTED | coverage 100.0% -> 99.6%, textbook 90.0% -> 88.0% |
| M15 | e^p·sin q formula: a·sin q + b·cos q (sign error) | DETECTED | coverage 100.0% -> 94.3%, textbook 90.0% -> 88.0% |
| M16 | root substitution: Jacobian k·u^(k−1) loses its k | DETECTED | coverage 100.0% -> 97.6%, textbook 90.0% -> 86.0% |
| M17 | polynomial division quotient ignores the leading coefficient of the divisor | DETECTED | coverage 100.0% -> 99.6% |
| M18 | odd sin power: (1 − cos²) written as (1 + cos²) | DETECTED | coverage 100.0% -> 98.9%, textbook 90.0% -> 88.0% |
| M19 | WRONG by-parts rule, self-check left ON (should degrade to "no closed form", never a wrong answer) | DETECTED | coverage 100.0% -> 94.1%, textbook 90.0% -> 64.0% |
| M20 | same wrong rule AND self-check disabled (wrong answers leak; independent reference must catch them) | DETECTED | antiderivative 100.0% -> 92.1% |

Mutants that were not detected point at blind spots in the generator and should be treated as findings.
