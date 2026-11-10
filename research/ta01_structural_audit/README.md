# TA-01 structural audit

This follow-up investigates the generator and retained predictors as software.
It does not introduce an unvalidated physical mechanism to obtain favourable
neural results. The original rainfall-linear TA-01 remains unchanged.

The proposed contribution is a reproducible diagnostic certificate connecting:

1. the effective parameter dimension and exact amplitude law of the generator;
2. numerical verification with a second assembly/solver and a manufactured
   elasticity solution;
3. the difference between a monotone residual term and a monotone composite
   forecasting pipeline.

The protocol is reviewed and frozen with code hashes before execution. All
original test periods have already been examined. These are retrospective
algebraic, implementation and functional-property audits; they are not new
prospective forecasts or field validation. A finite monotonicity grid can
produce a counterexample but cannot establish a global guarantee.

Output files and scripts must preserve failures and distinguish old stored
labels from unrounded equilibrium solutions. The manufactured-domain adapter
tests source element and PCG functions using in-memory exports; it does not
silently replace the production model or assert convergence of its stepped
geometry.
