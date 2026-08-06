# Employee Scheduling Classroom

An interactive study tool for the [Timefold](https://timefold.ai) employee-scheduling
quickstart. It contains a **working TypeScript port** of the quickstart's domain model,
constraint engine and solver, so every number in the UI is computed rather than quoted —
and every formula is derived from the Java/solver source rather than paraphrased from the
docs.

Built to be dropped straight into [Lovable](https://lovable.dev): Vite + React 18.3 +
TypeScript + Tailwind 3.4 + shadcn/ui + react-router 6, which is exactly Lovable's
`vite_react_shadcn_ts` stack.

## Run it

```sh
npm install
npm run dev        # http://localhost:8080
npm test           # 28 tests verifying the port
npm run typecheck
npm run build
```

No backend, no API keys, no server. The solver runs in the browser tab.

## What's here

| Route | What it does |
|---|---|
| `/learn` | Ten sequenced lessons, each with checkable outcomes and a checkpoint question |
| `/map` | Zoomable React Flow graph of the codebase, node by node |
| `/code` | The **verbatim Java** from the quickstart with 39 line-anchored annotations |
| `/lab` | Score a schedule, drag shifts between people, switch constraints off — a port of `PUT /schedules/analyze` |
| `/math` | Search-space combinatorics, lexicographic order, the unfairness derivation, Hall's-theorem bounds, live scoring benchmark |
| `/solve` | Real construction heuristic + local search with a move-by-move inspector and an acceptor race |
| `/cards` | 40 flashcards (three-box Leitner) and a 10-question quiz |

## The engine

`src/timefold/` is a faithful port, not a mock-up.

| File | Purpose |
|---|---|
| `domain.ts` | `Employee`, `Shift`, `EmployeeSchedule` — mirrors the annotated Java model, including `java.time` truncation semantics |
| `score.ts` | `HardSoftScore` with **lexicographic** comparison |
| `constraints.ts` | All 8 constraints with per-match justifications. The readable reference implementation |
| `fastEval.ts` | The same arithmetic, ~20× faster. Precomputation, hash sets, an early-break pair loop, zero hot-path allocation |
| `loadBalance.ts` | Port of `DefaultLoadBalance`, both direct and the real O(1) incremental accumulator |
| `solver.ts` | Construction heuristic + local search with 4 acceptors (Late Acceptance, Hill Climbing, Simulated Annealing, Tabu) |
| `feasibility.ts` | Kuhn's bipartite matching → a **provable lower bound** on the hard score |
| `searchSpace.ts` | Combinatorics in log10 space, because the honest numbers overflow float64 |
| `demoData.ts` | Port of `DemoDataGenerator` (SMALL / LARGE / TINY), seeded and reproducible |

`npm test` asserts that `constraints.ts` and the solver's incremental scoring agree with
each other over thousands of random states, and checks every constraint's arithmetic
against hand-computed cases. If the fast path and the readable path ever disagree, the
readable one is right by definition.

## Three findings from building it

**1. `unfairness()` is not the standard deviation.** The Javadoc only says
"dimensionless, lower is fairer". Reading `DefaultLoadBalance.java`, it accumulates
`Σxᵢ²` and `−S²` separately and returns `sqrt(numerator/n + integralPart)`, which by the
computational formula for variance is

```
unfairness = √(Σxᵢ² − S²/n) = √(Σ(xᵢ − x̄)²) = σ·√n
```

the Euclidean distance from the load vector to the perfectly balanced one. Full
derivation, with a live widget, at `/math` → Load balancing.

**2. An empty schedule scores a flawless 0hard/0soft.** `forEach(Shift.class)` silently
excludes entities whose planning variable is null, so no constraint matches anything.
Timefold's separate `initScore` level is what stops a solver latching onto it as the
optimum — the port replicates that, and `solver.ts` documents why a naive
"keep the best score" implementation throws away every real schedule it finds.

**3. The shipped `SMALL` dataset is infeasible.** At `randomSeed = 0`, some days demand
more `Doctor` shifts than there are available Doctors, so `0hard` is unreachable and a
solver stalling at `−3hard` is *optimal*, not weak. `feasibility.ts` computes the exact
shortfall by per-day bipartite matching (Hall's deficiency theorem), which is the
difference between debugging your solver and debugging your data.

## Notes on the port

- **Seeded RNG.** `mulberry32`, not `java.util.Random` — the *distributions* and structure
  are faithful, the exact names drawn are not identical to a Java run. Everything is
  reproducible for a given seed.
- **Start date is pinned** to `2026-08-10` (a Monday) rather than `new Date()`, so the
  feasibility bound and every displayed figure are stable.
- **Approximations are labelled in the code.** The construction heuristic approximates
  Timefold's `ALLOCATE_ENTITY_FROM_QUEUE`; the simulated-annealing acceptor collapses the
  two score levels into one magnitude where Timefold anneals each separately. Both are
  flagged where they occur rather than glossed over.
- **The solver runs on the main thread**, time-sliced from `requestAnimationFrame`. A Web
  Worker would be smoother but would hide the individual accept/reject decisions, which
  are the point of the move inspector.

## Charts

Chart colours were validated with a colour-vision-deficiency checker against the actual
render surfaces (worst adjacent CVD ΔE 8.4, normal-vision 19.8; all pass the lightness
band, chroma floor and 3:1 contrast checks). Hard/soft use the reserved *status* palette
and always ship with a text label, so hue never carries meaning alone. Hard and soft score
are plotted as **two charts, never one with two y-axes** — they are separate levels of a
lexicographic order, and a shared axis would invent a relationship that does not exist.

## Source

Ported from `use-cases/employee-scheduling` in
[TimefoldAI/timefold-quickstarts](https://github.com/TimefoldAI/timefold-quickstarts).
Formula details cross-checked against
[TimefoldAI/timefold-solver](https://github.com/TimefoldAI/timefold-solver)
(`DefaultLoadBalance`, `LateAcceptanceAcceptor`, `AcceptorFactory`).
