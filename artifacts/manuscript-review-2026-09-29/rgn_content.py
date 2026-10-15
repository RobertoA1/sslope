"""English editorial adaptation of the verified Spanish manuscript; no new runs."""

TITLE = 'Semisynthetic evaluation of FEM LSTM slope displacement forecasts'
ABSTRACT = (
    'This study evaluates a semisynthetic prototype for forecasting slope displacement '
    'using a two-dimensional finite element model (FEM), a long short-term memory network '
    '(LSTM), and a residual correction constrained by monotonicity. The experimental '
    'TA-01 slope uses an assumed geometry and material properties, daily NASA POWER '
    'reanalysis rainfall for a point near Cerro de Pasco, Peru, during 2020 to 2025, '
    'and 500 simulated scenarios with 24 hourly states each. Pore pressures and '
    'displacements are simulated. Persistence, ridge regression, LSTM and the hybrid '
    'were compared at one-hour and six-hour horizons using disjoint rainfall dates '
    'and two chronological tests. Uncertainty was estimated using 5000 resamples '
    'clustered by rainfall date. In the date-separated test, hybrid mean absolute '
    'error was 0.00000798 mm at one hour and 0.00006176 mm at six hours, compared '
    'with 0.00000858 mm and 0.00006332 mm for LSTM. LSTM performed better in 2024 '
    'and the hybrid in 2025; all four paired 95 percent confidence intervals included '
    'zero. The hybrid was more sensitive to noisy and missing inputs. The workflow '
    'supports controlled evaluation of physical simulation and temporal learning, '
    'but does not establish a consistent advantage for residual correction or '
    'validate operational mine alerts. The very small errors describe reproduction '
    'of the numerical generator and require assessment against its storage precision.'
)
KEYWORDS = 'Slope stability, Finite element modelling, LSTM, Physics-guided learning, Semisynthetic data'

# Keys are paragraph positions in Manuscrito_TA01_BGM_plantilla.docx.
TEXT = {
23: '1. Introduction',
24: 'Slope stability is critical to the continuity and safety of open-pit mining. Excavation progressively changes rock-mass geometry, stress conditions, infiltration and pore pressure. An isolated estimate of the factor of safety (FoS) may therefore be insufficient when geotechnical and operational conditions vary over time. Wang et al. (2023) reported that deep learning facilitated prediction of a stability coefficient in their study. Forecasts of displacement trends, pore pressure and stability could support inspection, evacuation and bench redesign if their performance and thresholds were validated for the site.',
25: 'Conventional stability analyses, including limit equilibrium and finite element methods, explicitly represent geometry, strength and boundary conditions. This physical basis helps interpret failure mechanisms and investigate rainfall, excavation and material-property scenarios. However, results depend on uncertain parameters and updates that may not keep pace with field monitoring. Liu et al. (2022) compared the evolution of a slope digital twin with an observed failure associated with extreme rainfall. Their study illustrates the importance of updating and checking the model against performance records and observations; TA-01 lacks that field comparison.',
26: 'Geotechnical sensors, weather stations, Internet of Things systems and photogrammetry have increased the availability of time series for this purpose. Nevertheless, purely data-driven models may yield difficult-to-interpret or physically inconsistent predictions, particularly in poorly represented conditions. Pei et al. (2023) incorporated domain knowledge into machine learning and reported predictive advantages in the datasets they examined. This motivates investigation of geotechnical constraints, but does not imply that any physical correction will improve any predictor.',
27: 'Digital twins connect a computational representation of a slope with observations and updating mechanisms. Piciullo et al. (2025) integrated hydrological monitoring, meteorology, numerical modelling and machine learning to produce rolling stability forecasts. Their operational application differs from TA-01. The present study examines a semisynthetic configuration that retains a mechanical FEM response and temporal dependence; its update frequency and usefulness for mine alerts are not measured.',
28: 'The closest studies address different parts of the problem. Liu et al. (2022) and Piciullo et al. (2025) updated forecasts using observed data; Pei et al. (2023) incorporated domain knowledge into learning; and Zhang, Z., et al. (2024) imposed equations and boundary conditions in a three-dimensional framework. Table 1 defines the specific scope of TA-01 without claiming absolute priority: a traceable semisynthetic testbed comparing LSTM with a monotonic residual correction across rainfall dates. The methodological question is what this correction contributes within a controlled FEM generator before field validity is asserted.',
29: 'TA-01 integrates a two-dimensional elastic FEM, a temporal LSTM model, a residual correction guided by monotonic relationships, and evaluation using separated rainfall dates and test years. The experiment does not validate end-to-end latency, operational alerts, excavation changes, a strength-reduction FoS, or a continuous physics-informed neural network (PINN) satisfying governing field equations.',
30: 'The contribution is a software evaluation under a controlled generator. Scenario identifiers and rainfall dates allow each window to be traced, events to be separated between datasets, and comparisons to be repeated. The main finding is that a plausible monotonic constraint does not guarantee lower error when the test period changes and may increase sensitivity to degraded inputs. Displacements and geotechnical variables are simulated; only rainfall comes from an external source.',
31: '1.1. Positioning against related studies',
32: 'Table 1 compares the most directly related studies from 2022 to 2025, selected because they combine at least two of the following: slope updating, physical knowledge, temporal learning, monitoring data or numerical verification. The comparison distinguishes monotonic constraints from a field-equation PINN. A broader contextual map of forty works is provided in Appendix A, Table A1; it is a literature inventory rather than a systematic review or an independent validation of TA-01.',
33: '1.2. Research questions',
34: 'Four questions are evaluated within the TA-01 experiment:',
35: 'RQ1. How does the mean absolute error (MAE) of persistence, ridge, LSTM and the hybrid change at 1 h and 6 h with disjoint rainfall dates and chronological splits?',
36: 'RQ2. Does monotonic residual correction provide a consistent predictive improvement over LSTM across the test years?',
37: 'RQ3. How much does hybrid performance degrade with 5% input noise and 30% randomly missing held-out inputs?',
38: 'RQ4. What internal agreement do the FEM implementation and the spatial physics-informed extreme learning machine/radial basis function (PIELM/RBF) approximation achieve within the same discrete operator?',
39: 'RQ1 is addressed by Tables 3 and 4; RQ2 by the rainfall-date-clustered paired intervals in Figure 3; RQ3 by Table 6 and Figure 5; and RQ4 by the FEM and spatial checks in Table 5 and Figure 2. The conclusions retain the scope of these evaluations.',
40: '2. Methods',
41: '2.1. Prototype architecture and traceability',
42: 'The workflow separates scenario generation, mechanical simulation, window construction, training and validation. Each prediction retains its rainfall date and scenario identifier, allowing partitions without shared dates or scenarios and tracing reported metrics to validation files. Figure 1 summarises the workflow.',
43: '2.2. Case design and data provenance',
44: 'TA-01 is an experimental slope defined in the project rather than an instrumented mine. Its section is 100 m high and 160 m wide, with five benches and three material zones: soil, weathered material and rock. Mechanical and hydraulic properties were sampled within assumed ranges using Latin hypercube sampling (LHS). The dataset contains 500 scenarios with 24 hourly states each, giving 12000 records, with seed 20260915. All scenarios share the geometry and have an assigned rainfall date.',
45: 'Daily reanalysis rainfall was obtained from NASA POWER/MERRA-2 for the point 10.68° S, 76.26° W during 2020–2025 (National Aeronautics and Space Administration [NASA], n.d.). The source file contains no hourly observations; the generator distributed each daily total into assumed rectangular profiles lasting 6, 12 or 24 h. Pore pressures, displacements and safety indices were simulated rather than measured by sensors. This distinction is retained in data storage and interpretation.',
46: '2.3. Mechanical model and prediction target',
47: 'The in-house FEM uses constant-strain triangular elements in plane strain, isotropic linear elasticity, self-weight and pore-pressure loading formulated using a Biot coefficient. The base is fixed and horizontal displacement is restrained at the left boundary. A quasi-static state is solved each hour. Hydrology is approximated by infiltration and drainage; the FEM does not solve a transient spatial flow field. The evaluated quantity is the maximum rainfall-induced displacement relative to the initial dry state, in millimetres, stored as rainfall_induced_max_displacement_mm. The network learns the change between the origin and target hours and reconstructs the target-hour value. This quantity must not be interpreted as the total displacement of a real slope.',
48: 'The visualiser also calculates a local index from effective stresses and the Mohr–Coulomb criterion. This is not a FoS obtained through nonlinear strength reduction. An external strength-reduction exercise is retained as a separate reference; it neither labels training data nor validates the in-house FEM.',
49: '2.4. Mathematical coupling',
50: 'At each hour t, the quasi-static mechanical state is represented by Equation 1. The parameter vector θ groups geometry and properties, uₜ is the displacement vector, f_g is gravitational loading, f_p incorporates pore-pressure loading, K is the global stiffness matrix and pₜ denotes pore pressure.',
52: 'LSTM receives six hourly states and the future rainfall known in the experiment. The hybrid adds a residual correction to the standardised LSTM output. In Equations 2 and 3, yₜ is the current cumulative target displacement, h the forecast horizon, qψ the standardised target change predicted by LSTM, and cφ the standardised correction. The mean μΔ and standard deviation σΔ of the target change are estimated from training data only. X and Z collect the temporal and correction inputs, including future rainfall. The maximum operator prevents the final forecast from falling below yₜ. In Equation 4, r is cumulative future rainfall and s the simulated safety index; the derivatives apply only to cφ with all other inputs held constant.',
56: 'These expressions specify the evaluated coupling. The correction is guided by aggregate physical relationships, but does not solve governing field equations or enforce boundary conditions by construction. It is therefore not described as a field-equation PINN.',
57: '2.5. Temporal models and correction',
58: 'Four alternatives are evaluated on the same windows: persistence of the current value, autoregressive ridge regression, LSTM, and a hybrid adding a residual correction to LSTM. Each LSTM input contains six hours of history and predicts at 1 h or 6 h. Training uses backpropagation through time and Adam optimisation (Kingma & Ba, 2015), following the recurrent-memory principle of Hochreiter and Schmidhuber (1997). Future rainfall is a known exogenous input in this experiment, unlike imperfect operational weather forecasts. Ridge, LSTM and the hybrid all constrain the final prediction to be no lower than the current value; this shared constraint matters when interpreting the correction.',
59: 'The residual correction is a multilayer perceptron (MLP) fitted to the trained LSTM output. Its constraints ensure that, with other inputs fixed, higher future rainfall cannot reduce the correction and a higher safety index cannot increase it. These aggregate monotonicity conditions do not constitute a spatial equilibrium loss or a field-equation PINN (Raissi et al., 2019; Karniadakis et al., 2021). Monotonicity concerns direct correction inputs with the base LSTM output fixed; it does not establish global monotonicity of the hybrid when all variables change together. A separate spatial PIELM/RBF approximation was evaluated for one semisynthetic event, and its results are not attributed to the temporal predictor.',
60: 'Input scalers and target-change normalisation are estimated from training data only. Ridge selects regularisation on validation data; the networks use early stopping with criteria recorded in their artefacts. No comparable systematic architecture search or independent repeated training seeds are documented. The correction is fitted using the trained LSTM and its training predictions, without out-of-fold predictions for this second stage.',
61: '2.6. Experimental configuration',
62: 'Table 2 reports the configuration recovered from the scripts and saved model artefacts. Epoch counts are requested maxima; early stopping may terminate training sooner.',
63: '2.7. Validation and statistical analysis',
64: 'The first comparison assigns the 500 scenarios to training (350), validation (75) and testing (75) by rainfall date; scenarios sharing a date never cross partitions. This split is not chronological. Two further tests use retrained weights: training on 2020–2022, validation on 2023 and testing on 2024; and training on 2020–2023, validation on 2024 and testing on 2025. MAE is evaluated on comparable 1 h and 6 h windows. The non-chronological split reserves the highest-rainfall dates for validation and testing and balances assignment by simulated safety-index categories; it is not a simple random sample of future dates.',
65: 'The paired difference Δ = MAE(LSTM) − MAE(hybrid) is evaluated with 5000 resamples clustered by rainfall date and 95% percentile confidence intervals. Date clustering retains dependence between windows from an event (Field & Welsh, 2007), but assumes sufficient independence between date clusters. It is not a moving-block bootstrap of consecutive days. Hypothesis tests and p values are not reported because the experimental archive does not retain a reproducible calculation of the previously described sign-flip test. Robustness testing perturbs held-out inputs only: Gaussian noise at 5% of the training standard deviation and 30% random missingness imputed with training means. Metrics describe saved project predictions rather than field observations.',
66: 'Hybrid prediction intervals use a quantile of absolute validation error. The same validation set also informed model selection and early stopping. The intervals are therefore empirical intervals with retrospective coverage diagnostics rather than an independent conformal guarantee. Figure 4 contrasts overall coverage with coverage for rainfall of at least 5 mm/day; the latter group contains few dates.',
67: '2.8. Reproduction procedure',
68: 'Reproduction starts from the archived daily NASA POWER CSV in data/rainfall/. The 500 archived scenarios use seed 20260915 and a 30 × 20 mesh, whereas the current generator defaults to 14 × 9. Reproduction therefore requires explicit arguments --scenarios=500, --seed=20260915, --mesh-x=30 and --mesh-y=20 with npm run generate:fem -- and a new output directory to preserve the archived artefacts. Date-separated and chronological partitions are then constructed as documented in docs/CASO_TA01_FEM.md. Ridge, LSTM and the correction are trained per horizon, FEM and robustness checks are executed, and reports are consolidated. Manifests record the provenance and parameters of the archived runs.',
69: 'Full recreation also requires the output prefixes, horizons and saved weights associated with each split. The npm scripts and replication manifest document these arguments; generation alone does not reproduce every table.',
70: 'Reported outputs include data/validation/ta01-model-comparison.csv, ta01-rolling-origin-model-comparison.csv, ta01-rolling-origin-bootstrap.json and ta01-replication-manifest.json, with SHA-256 hashes of inputs and results. The public sslope repository provides a README, npm scripts and Docker Compose for the web service; this container does not itself define a closed training and analysis pipeline. Code and documentation use the MIT licence, and original semisynthetic data and results use CC BY 4.0. Python is not pinned for every experiment. Matching hashes verify archived artefact integrity, but do not establish that retraining will produce identical weights.',
71: '3. Results',
72: '3.1. RQ4 Internal FEM verification',
73: 'The constant-strain patch test reproduced the affine field with a maximum strain error of 1.14 × 10⁻¹⁸. Two global analytical checks gave maximum displacement errors of 1.62 × 10⁻¹¹ m for linear elasticity and 1.60 × 10⁻¹¹ m with uniform Biot pressure. Compared with the internal 48 × 32 mesh, the standard 30 × 20 mesh differed by 2.13% in displacement. Refinement was not monotonic: the 36 × 24 and 42 × 28 meshes differed from the reference by 8.49% and 7.41%, respectively. These tests verify parts of the implementation, but establish neither mesh convergence nor valid TA-01 geotechnical parameters. Figure 2 shows this mesh sensitivity.',
75: '3.2. RQ1 Prediction with separated rainfall dates',
76: 'In the disjoint-date split, the hybrid had the lowest MAE among the four alternatives at both horizons (Table 3). Relative to LSTM, MAE decreased by 6.99% at 1 h and 2.46% at 6 h. These magnitudes concern simulated maximum rainfall-induced displacement relative to the initial state.',
77: '3.3. RQ1 and RQ2 Chronological testing and uncertainty',
78: 'The order of LSTM and the hybrid changed with the test year (Table 4). In 2024, hybrid MAE was 1.15% higher at 1 h and 1.89% higher at 6 h; in 2025 it was 3.89% lower at 1 h and 4.63% lower at 6 h. All four 95% intervals included zero. These estimates do not support a consistent correction advantage and do not establish model equivalence.',
79: 'The 95% intervals for Δ were [−1.44 × 10⁻⁷, 4.25 × 10⁻⁸] mm at 1 h and [−1.15 × 10⁻⁶, 6.64 × 10⁻⁸] mm at 6 h in 2024; in 2025 they were [−2.59 × 10⁻⁷, 6.88 × 10⁻⁷] mm and [−3.83 × 10⁻⁷, 6.25 × 10⁻⁶] mm. Resampling used 82 test dates in 2024 and 76 in 2025. The intervals describe variation between semisynthetic dates rather than real geotechnical uncertainty. Figure 3 shows the differences and intervals; positive values favour the hybrid.',
81: 'The baselines remain informative in chronological testing. In 2024, persistence and ridge MAE were 0.00001049 mm and 0.00000662 mm at 1 h, and 0.00006888 mm and 0.00005232 mm at 6 h. In 2025, they were 0.00002167 mm and 0.00002055 mm at 1 h, and 0.00014399 mm and 0.00015151 mm at 6 h. LSTM and the hybrid outperformed these baselines in all four year–horizon combinations, although their mutual order changed. Source: data/validation/ta01-rolling-origin-model-comparison.csv.',
82: 'Selection by lowest validation MAE did not identify the lowest-test-MAE model in three of four year–horizon combinations. For rainfall of at least 5 mm/day, nominal 95% interval coverage was 33.3% and 76.9% at 1 h and 6 h in 2024, and 59.3% and 43.6% in 2025. There were only two and three qualifying dates, respectively. These diagnostics indicate model-selection and conditional-calibration instability within the testbed, without providing a reliable coverage estimate for real storms. Figure 4 shows that overall coverage does not ensure coverage at higher rainfall.',
84: '3.4. RQ4 Spatial approximation of discrete equilibrium',
85: 'For one semisynthetic event, the spatial PIELM/RBF approximation of the incremental FEM system gave a relative L2 displacement error of 12.57% at 354 nodes without displacement supervision and a relative discrete-equilibrium residual of 14.39%. Training and the reference shared the stiffness matrix and loading. These percentages therefore measure internal agreement rather than independent validation or transfer to another geometry. Sensors used in the approximation were synthetic and are not TA-01 field instrumentation. Table 5 distinguishes analytical checks from agreement under the shared operator.',
86: '3.5. RQ3 Robustness to input perturbations',
87: 'With 5% input noise, LSTM MAE increased by 5.13% at 1 h and 5.97% at 6 h; hybrid MAE increased by 53.88% and 46.10%. With 30% missing values, increases were 102.80% and 60.88% for LSTM, compared with 133.96% and 70.77% for the hybrid. The correction lost its small clean-input advantage under both perturbations. The test uses random missingness and mean imputation without retraining; it neither reproduces every sensor fault nor tests field behaviour. Source: data/validation/ta01-model-robustness.json. Table 6 retains absolute errors, and Figure 5 summarises sensitivity to noise and missingness.',
89: 'Figure 6 compares variants in which hydrological or mechanical inputs were replaced by their training means during inference. These are masking tests without retraining, not models trained without those variables. They do not isolate the causal contribution of individual correction-loss terms; that ablation remains pending.',
91: '4. Discussion',
92: 'The prototype combines a reproducible mechanical section, a trained temporal model and prediction-level provenance. In studies with field monitoring, parameter updating and comparison with observed events are central to interpreting a digital twin (Liu et al., 2022; Piciullo et al., 2025). TA-01 lacks that comparison: only daily rainfall has an external origin, and the geotechnical response follows model assumptions. Low forecast error thus measures reproduction of the generator, not accuracy of a mine alert.',
93: 'Physical knowledge has been investigated in slope predictors (Dahal & Lombardo, 2025; Pei et al., 2023). Here, monotonicity gives the correction a verifiable property, but its effect on MAE changes sign between the two years. This variation and intervals including zero support treating both predictors as experimental alternatives. The spatial evaluation incorporates discrete equilibrium but depends on the same FEM operator used for its reference; it does not establish a complete TA-01 field-equation PINN.',
94: 'No comparable benchmark of training time, inference time, energy use or end-to-end latency was recorded. Some artefacts contain partial inference measurements, insufficient to establish operational efficiency. The experiment therefore evaluates prediction error and internal robustness. The small absolute MAE improvement in the date-separated split does not by itself offset correction degradation under perturbed inputs.',
95: 'The numerical scale requires further caution. FEM post-processing stores nodal magnitudes with a rounding step of 10⁻⁵ mm (10⁻⁸ m), before constructing prediction windows. An average MAE below that step is mathematically possible, but does not demonstrate physical resolution or instrument accuracy. Small error differences require sensitivity checks against storage precision and solver tolerance before geotechnical relevance is assigned.',
96: 'The FEM assumes plane strain and linear elasticity, whereas real instability may involve plasticity, discontinuities, heterogeneity and transient flow. Comparison with a finer internal mesh does not demonstrate monotonic convergence, and an external strength-reduction benchmark does not validate the in-house linear FEM. The visualiser index is not a substitute for a strength-reduction FoS. Field validation would require observed properties and sensor series, independent geotechnical checks, events excluded from fitting, uncertainty analysis and validated alert criteria. Studying excavation sensitivity would also require representing geometric changes and evaluating them with relevant data.',
97: '4.1. Threats to validity',
98: 'Internal validity. The generator and learning models share FEM-derived variables, potentially favouring agreement. Date separation, chronological tests and perturbation of held-out inputs reduce temporal leakage but do not remove dependence on the generator. Known future rainfall is an idealised input rather than error-free operational information. Mean replacement can also produce combinations outside the generator’s joint input distribution.',
99: 'Construct validity. The target is maximum rainfall-induced displacement relative to the initial state, rather than total displacement or a strength-reduction FoS. Monotonic correction encodes aggregate physical knowledge and is not a complete field-equation PINN. Conclusions use these definitions.',
100: 'External validity. TA-01 uses one geometry, assumed property ranges and simplified rainfall profiles. Other lithologies, excavations, sensors and observed failures were not evaluated, preventing generalisation to a real mine.',
101: 'Conclusion validity. Dates, rather than hourly windows, are the resampling units. Neither power calculations nor an equivalence threshold were specified before analysis; intervals including zero do not establish equivalence. The high-rainfall subsets include only two dates in 2024 and three in 2025, making coverage estimates unstable. FEM storage precision and variation between training seeds were not tested as sensitivity factors.',
102: '4.2. Responsible use',
103: 'The prototype must not issue autonomous operational alerts. A false negative could delay inspection or evacuation; a false positive could unnecessarily interrupt operations. Future use requires field-validated thresholds, sensor redundancy, version records, geotechnical professional review and an escalation procedure. Predictions beyond the training rainfall, geometry or material domain should be flagged as unreliable.',
104: '5. Conclusions',
105: 'For RQ1, the hybrid had the lowest MAE in the date-separated split, with relative reductions of 6.99% at 1 h and 2.46% at 6 h compared with LSTM. However, the ranking changed between chronological tests.',
106: 'RQ2 found no consistent advantage for residual correction: LSTM performed better in 2024 and the hybrid in 2025, with all four paired intervals including zero. For RQ3, both models degraded with noise and missing inputs, but the hybrid suffered larger relative and absolute error increases under the evaluated conditions. Input quality is therefore critical to this prototype.',
107: 'RQ4 verified parts of the FEM implementation through internal tests and found partial spatial-approximation agreement under the same operator. These checks do not constitute independent geotechnical validation. TA-01 is a semisynthetic proof of concept for investigating the FEM–LSTM workflow; it validates neither operational alerts, real-time performance, operational FoS nor a governing-equation PINN.',
}

DATA_AVAILABILITY = 'Code, scripts, semisynthetic scenarios, trained weights and validation files are available in the public sslope repository (https://github.com/RobertoA1/sslope). The manifest data/validation/ta01-replication-manifest.json records SHA-256 hashes of inputs and outputs. Code and documentation use the MIT licence; original contributions in data/generated/, data/models/ and data/validation/ use CC BY 4.0 (data/LICENSE.md). NASA POWER rainfall and other external sources retain their separately documented provenance and terms. The README explains execution and Docker Compose reproduces the local web service. Python versions are not fixed for every experiment and an immutable publication release has not yet been deposited, limiting exact replication. No personal or confidential data were processed in TA-01.'
AI_DECLARATION = 'OpenAI Codex assisted software and script development, comparison of manuscript statements with code and archived validation files, technical preparation of figures and tables from archived outputs, language translation, editorial revision and document formatting. The authors remain responsible for the methods, numerical results, references, interpretation and submitted manuscript.'
CONTRIBUTIONS = 'Roberto Enrique Quezada-Rodríguez: software, formal analysis, writing – original draft. Melanie Celeste Tello Fuentes: formal analysis, validation, writing – original draft, writing – review and editing.'

CROATIAN_TITLE = 'Semisintetička evaluacija prognoza pomaka kosine pomoću FEM-a i LSTM-a'
CROATIAN_ABSTRACT = (
    'U radu se evaluira semisintetički prototip za prognoziranje pomaka kosine koji '
    'kombinira dvodimenzionalni model konačnih elemenata (FEM), neuronsku mrežu s '
    'dugim kratkoročnim pamćenjem (LSTM) i rezidualnu korekciju s ograničenjima '
    'monotonosti. Eksperimentalna kosina TA-01 temelji se na pretpostavljenoj '
    'geometriji i svojstvima materijala, dnevnim oborinama iz reanalize NASA POWER '
    'za točku blizu Cerro de Pasca u Peruu tijekom 2020.–2025. te na 500 simuliranih '
    'scenarija s po 24 satna stanja. Tlakovi porne vode i pomaci su simulirani. '
    'Model zadržavanja trenutačne vrijednosti, ridge regresija, LSTM i hibrid '
    'uspoređeni su za horizonte od jednog i šest sati, uz odvojene datume oborina '
    'i dva kronološka testa. Nesigurnost je procijenjena pomoću 5000 ponovnih '
    'uzorkovanja grupiranih po datumu oborina. U testu s odvojenim datumima srednja '
    'apsolutna pogreška hibrida iznosila je 0.00000798 mm za jedan sat i '
    '0.00006176 mm za šest sati, naspram 0.00000858 mm i 0.00006332 mm za LSTM. '
    'LSTM je bio bolji 2024., a hibrid 2025.; sva četiri uparena 95-postotna '
    'intervala pouzdanosti uključivala su nulu. Hibrid je bio osjetljiviji na '
    'šum i nedostajuće ulazne podatke. Postupak omogućuje kontroliranu evaluaciju '
    'fizikalne simulacije i vremenskog učenja, ali ne potvrđuje dosljednu prednost '
    'korekcije niti valjanost operativnih rudarskih upozorenja. Vrlo male pogreške '
    'opisuju reprodukciju numeričkog generatora i zahtijevaju provjeru u odnosu '
    'na preciznost pohrane.'
)
CROATIAN_KEYWORDS = 'Stabilnost kosina, Metoda konačnih elemenata, LSTM, Učenje vođeno fizikom, Semisintetički podaci'

TABLES = [
    [
        ['Study', 'Data', 'Physical component', 'Temporal model', 'Reported validation'],
        ['Liu et al. (2022)', 'Monitoring and observed performance', 'Updated stability model', 'Temporal evolution', 'Observed failure'],
        ['Pei et al. (2023)', 'Stability datasets', 'Knowledge-guided loss', 'Not the focus', 'Physical and data-driven model comparisons'],
        ['Zhang, Z., et al. (2024)', 'Numerical cases', 'Equations and boundary conditions', 'External excitation', 'Numerical reference'],
        ['Piciullo et al. (2025)', 'IoT monitoring and weather data', 'Numerical models', 'Rolling forecasts', 'Documented operational use'],
        ['This study', 'External rainfall and simulated response', 'FEM 2D and aggregate monotonicity', 'LSTM at 1 h and 6 h', 'Disjoint dates; 2024 and 2025'],
    ],
    [
        ['Component', 'Documented value', 'Traceability'],
        ['Scenarios', '500 scenarios of 24 hourly states; seed 20260915', 'Section 2.2'],
        ['FEM mesh', '30 × 20; internal reference 48 × 32', 'Section 3.1'],
        ['Windows', '6 h history; 1 h and 6 h horizons', 'Section 2.5'],
        ['Optimisation', 'Adam', 'Section 2.5'],
        ['Main split', '350 training, 75 validation, 75 testing, by date', 'Section 2.7'],
        ['Chronological splits', '2024 and 2025 tests with retraining', 'Section 2.7'],
        ['Uncertainty', '5000 date-clustered resamples; 95% confidence intervals', 'Section 2.7'],
        ['Robustness', '5% noise; 30% missingness with imputation', 'Section 3.5'],
        ['Architecture', 'LSTM: 15 inputs, 12 hidden units; residual MLP: 19 inputs, 16 hidden units', 'data/models/ta01-lstm-1h.json; ta01-physics-guided-1h.json'],
        ['Training', 'LSTM: Adam, MSE, maximum 320 epochs, batch 128, learning rate 0.003, seed 20260916; correction: Adam, maximum 360 epochs, batch 128, learning rate 0.0015, seed 20260917', 'Saved model artefacts; scripts/train-lstm.py; scripts/train-physics-guided.py'],
        ['Environment', 'Node.js ≥24; NumPy ≥2, <3; Python version and hardware not fixed', 'package.json; requirements-ml.txt'],
    ],
    [
        ['Horizon', 'Windows', 'Persistence', 'Ridge', 'LSTM', 'Hybrid'],
        ['1 h', '1350', '0.00002081', '0.00001181', '0.00000858', '0.00000798'],
        ['6 h', '975', '0.00013169', '0.00008855', '0.00006332', '0.00006176'],
    ],
    [
        ['Test year', 'Horizon', 'Windows', 'LSTM', 'Hybrid'],
        ['2024', '1 h', '1476', '0.00000435', '0.00000440'],
        ['2024', '6 h', '1066', '0.00002909', '0.00002964'],
        ['2025', '1 h', '1404', '0.00000540', '0.00000519'],
        ['2025', '6 h', '1014', '0.00005769', '0.00005502'],
    ],
    [
        ['Check', 'Quantity', 'Result', 'Scope'],
        ['CST patch', 'Strain', '1.14 × 10⁻¹⁸', 'Affine field; dimensionless'],
        ['Global elasticity', 'Displacement', '1.62 × 10⁻¹¹ m', 'Manufactured analytical solution'],
        ['Uniform Biot pressure', 'Displacement', '1.60 × 10⁻¹¹ m', 'Manufactured analytical solution'],
        ['30 × 20 mesh', 'Difference', '2.13 %', 'Relative to internal 48 × 32 reference'],
        ['PIELM/RBF TA-01', 'Relative L2 error', '12.57 %', '354 nodes without displacement supervision'],
        ['PIELM/RBF TA-01', 'Relative residual', '14.39 %', 'Same reference FEM operator'],
    ],
    [
        ['Horizon', 'Condition', 'Windows', 'LSTM (mm)', 'Hybrid (mm)'],
        ['1 h', 'Clean', '1350', '0.00000858', '0.00000798'],
        ['1 h', '5% noise', '1350', '0.00000902', '0.00001228'],
        ['1 h', '30% missing', '1350', '0.0000174', '0.00001867'],
        ['6 h', 'Clean', '975', '0.00006332', '0.00006176'],
        ['6 h', '5% noise', '975', '0.0000671', '0.00009023'],
        ['6 h', '30% missing', '975', '0.00010187', '0.00010547'],
    ],
]

TABLE_CAPTIONS = [
    'Scope comparison with directly related studies. This synthesis is not a systematic review.',
    'Documented experimental configuration. Architecture and training settings follow the saved 1 h artefacts; chronological and 6 h runs record completed epochs. MSE: mean squared error.',
    'MAE in the rainfall-date-separated test, in mm. All four methods use the same windows at each horizon. Source: data/validation/ta01-model-comparison.csv.',
    'LSTM and hybrid MAE in chronological tests, in mm. Sources: ta01-rolling-origin-model-comparison.csv and ta01-rolling-origin-bootstrap.json.',
    'Numerical and spatial verification scope. These quantities are not temporal forecast errors. CST: constant-strain triangle. Sources: ta01-fem-mesh-sensitivity.json and ta01-spatial-pinn-validation.json.',
    'MAE with clean and perturbed inputs. Responses are semisynthetic and no retraining under perturbation was performed. Source: ta01-robustness-summary.csv.',
]

FIGURE_CAPTIONS = [
    'Data flow and evaluation of the semisynthetic TA-01 prototype. LHS: Latin hypercube sampling. This schematic describes the experiment rather than a field monitoring system.',
    'Sensitivity of maximum rainfall-induced displacement to FEM discretisation. Differences are relative to the internal 48 × 32 mesh and do not establish convergence. Source: ta01-fem-mesh-summary.csv.',
    'Paired MAE differences, Δ = MAE(LSTM) − MAE(hybrid), and 95% percentile intervals clustered by rainfall date. Positive values favour the hybrid. Horizontal scales differ; no p values are plotted. Source: ta01-rolling-origin-bootstrap.json.',
    'Retrospective coverage of hybrid prediction intervals. Overall coverage is compared with rainfall ≥5 mm/day. The dashed line marks nominal 95% coverage. High rainfall includes only two dates in 2024 and three in 2025; windows are correlated. Source: ta01-rolling-interval-coverage.csv.',
    'Predictive sensitivity to noise and randomly missing inputs. Noise is relative to training standard deviation; missing inputs use training-mean imputation. Each point compares a perturbed condition with the same model’s clean case, without retraining. Source: ta01-robustness-summary.csv.',
    'Hydrological and mechanical input masking at inference, using training means. MAE uses the same non-chronological test windows. Variants are not retrained models or isolated correction-loss ablations. Source: ta01-ablation-summary.csv.',
]

# Topics only: original paper titles support these labels. No external result
# values are added or treated as independent evidence for TA-01.
LITERATURE_TOPICS = [
    'Slope digital twin using performance and monitoring records',
    'Neural networks coupled with elastoplastic slope analysis',
    'Knowledge-guided learning for slope stability',
    'Deep learning for open-pit stability coefficients',
    'Bayesian optimisation of convolutional stability classifiers',
    'Physics-guided three-dimensional slope modelling',
    'Geotechnical and geophysical data fusion for digital twins',
    'Ensemble and hybrid learning for slope stability',
    'Reliability, principal components and transfer learning',
    'Dynamic three-dimensional geological modelling',
    'UAV photogrammetry and geospatial surface-change analysis',
    'Physics-informed learning for landslide prediction',
    'Three-dimensional concave-slope stability algorithms',
    'Operational IoT-based digital-twin stability forecasting',
    'Review of geotechnical digital twins',
    'Cloud-based slope monitoring and early warning',
    'Limit equilibrium, FEM and discrete fracture networks',
    'Two- and three-dimensional open-pit stability comparison',
    'Interpretable stacking and three-dimensional stability',
    'Simulation and AI for risk-oriented open-pit design',
    'FEM-based surface-mine slope design',
    'Two-dimensional slope analysis in a fault zone',
    'Slope stability around a community reservoir',
    'Slope-instability hazard along a road corridor',
    'Numerical comparison of road-slope sections',
    'Geotechnical slope-stabilisation design',
    'Cut-slope stability and failure probability',
    'Geomechanical assessment of slope stability',
    'Reduced-scale geotechnical stabilisation model',
    'Stress and deformation analysis of an urban slope',
    'Nonlinear failure criteria for planar rock sliding',
    'FEM slope analysis under different loading conditions',
    'Filtered tailings and physical dam stability',
    'Kinematic and limit-equilibrium quarry design',
    'Regional slope-instability assessment along a road',
    'GIS-supported mine-slope geotechnical assessment',
    'Probabilistic assessment of planar sliding',
    'Python-based probabilistic geotechnical simulation',
    'Python application for teaching slope stability',
    'Numerical location and depth of tension cracks',
]
