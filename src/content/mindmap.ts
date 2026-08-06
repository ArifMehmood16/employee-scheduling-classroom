/**
 * The codebase as a graph. Layers left to right: data in, model, score, search,
 * service, UI. Positions are hand-placed rather than auto-laid-out, because the
 * spatial arrangement is itself part of the explanation — the vertical column at
 * x≈560 is the eight constraints, and their being a column makes the point that they
 * are independent of each other.
 */

export type NodeKind =
  | "domain"
  | "solver"
  | "constraint"
  | "rest"
  | "ui"
  | "config"
  | "concept";

export interface MapNode {
  id: string;
  label: string;
  sublabel?: string;
  kind: NodeKind;
  x: number;
  y: number;
  /** Long-form explanation shown in the side panel. */
  detail: string;
  /** Deep links into the rest of the app. */
  javaFile?: string;
  route?: string;
  routeLabel?: string;
  external?: { label: string; url: string };
}

export interface MapEdge {
  source: string;
  target: string;
  label?: string;
  /** Dashed = "reads / annotates", solid = "flows into". */
  dashed?: boolean;
  /** Force the edge to drop below the row instead of cutting through it. */
  under?: boolean;
}

export const MAP_NODES: MapNode[] = [
  // ---- Data in -----------------------------------------------------------
  {
    id: "demoData",
    label: "DemoDataGenerator",
    sublabel: "SMALL · LARGE",
    kind: "config",
    x: 0,
    y: 160,
    detail:
      "Builds the test instances. Locations cycle through 2/3/4 daily start times; shift counts per timeslot are a weighted draw; each day a handful of employees get a random unavailable/undesired/desired marker. Seeded, so every run produces the identical problem — which is what makes benchmarking meaningful, and also means the shipped instance has fixed (and, as it turns out, infeasible) properties.",
    javaFile: "DemoDataGenerator",
    route: "/lab",
    routeLabel: "Inspect the generated data",
  },
  {
    id: "properties",
    label: "application.properties",
    sublabel: "spent-limit = 30s",
    kind: "config",
    x: 0,
    y: 340,
    detail:
      "The solver's entire configuration in this quickstart is a termination limit. No move selectors, no acceptor, no construction heuristic — all defaults. That is the headline claim of the framework: sensible defaults get you most of the way, and the file you actually author is the constraint provider. The commented-out lines are the escape hatches: FULL_ASSERT for debugging score corruption, best-score-limit to stop at first feasible, move-thread-count for the licensed multi-threaded solver.",
    route: "/math",
    routeLabel: "What the defaults actually are",
  },

  // ---- Domain model ------------------------------------------------------
  {
    id: "employee",
    label: "Employee",
    sublabel: "@ProblemFact · @ValueRange",
    kind: "domain",
    x: 340,
    y: 20,
    detail:
      "A problem fact: immutable while solving. Carries skills and three date sets (unavailable → hard, undesired → soft penalty, desired → soft reward). Doubles as the value range for the planning variable, which is why one field carries both @ProblemFactCollectionProperty and @ValueRangeProvider.",
    javaFile: "Employee",
    route: "/code",
    routeLabel: "Read Employee.java",
  },
  {
    id: "shift",
    label: "Shift",
    sublabel: "@PlanningEntity",
    kind: "domain",
    x: 340,
    y: 300,
    detail:
      "The planning entity. start, end, location and requiredSkill are given; only `employee` is decided. Being a field of an entity does not make something changeable — only @PlanningVariable does that.",
    javaFile: "Shift",
    route: "/code",
    routeLabel: "Read Shift.java",
  },
  {
    id: "planningVariable",
    label: "Shift.employee",
    sublabel: "@PlanningVariable — the one decision",
    kind: "concept",
    x: 700,
    y: -40,
    detail:
      "The whole search space in one field. |E| choices per shift, |S| shifts, so |E|^|S| candidate schedules. For the SMALL dataset that is 15^143 ≈ 10^168 — more than the number of legal positions on a Go board. Everything else in the framework exists to search that space without enumerating it.",
    route: "/math",
    routeLabel: "How big is 10^168?",
  },
  {
    id: "schedule",
    label: "EmployeeSchedule",
    sublabel: "@PlanningSolution",
    kind: "domain",
    x: 700,
    y: 380,
    detail:
      "The root object the solver clones on every new best solution. Holds the employee list (facts + value range), the shift list (entities), the score and the solver status. Its score type — HardSoftBigDecimalScore — is chosen specifically so the load-balance constraint can return a fractional value.",
    javaFile: "EmployeeSchedule",
    route: "/code",
    routeLabel: "Read EmployeeSchedule.java",
  },

  // ---- Score -------------------------------------------------------------
  {
    id: "constraintProvider",
    label: "ConstraintProvider",
    sublabel: "defineConstraints()",
    kind: "solver",
    x: 1040,
    y: 180,
    detail:
      "Eight constraint streams, five hard and three soft. Each is a pipeline: a source (forEach / forEachUniquePair), zero or more indexed joins, optional filters and grouping, then a verdict (penalize / reward) with a match weigher. The selection and the weighing are independent choices, and they fail in different ways: bad selection gives wrong scores, bad weighing gives a score that is right but unsearchable.",
    javaFile: "EmployeeSchedulingConstraintProvider",
    route: "/lab",
    routeLabel: "Toggle constraints live",
  },
  {
    id: "c1",
    label: "Missing required skill",
    sublabel: "HARD · flat 1",
    kind: "constraint",
    x: 1400,
    y: 0,
    detail:
      "forEach + filter. Binary condition, so a flat weight is the honest encoding — there is no 'more wrong' about lacking a certification. Also the cheapest hard violation in the model at 1 point, which is why the solver prefers it over breaching availability (up to 480) when the data is over-constrained.",
    route: "/lab",
    routeLabel: "See its matches",
  },
  {
    id: "c2",
    label: "Overlapping shift",
    sublabel: "HARD · minutes of overlap",
    kind: "constraint",
    x: 1400,
    y: 80,
    detail:
      "forEachUniquePair with two indexed joiners: equal(employee) and overlapping(start, end). Weighed by minutes so the solver sees a gradient — with a flat weight, shortening an overlap without eliminating it would earn nothing and the search would have no downhill direction.",
    route: "/math",
    routeLabel: "Why gradients matter",
  },
  {
    id: "c3",
    label: "At least 10h between shifts",
    sublabel: "HARD · 600 − gap",
    kind: "constraint",
    x: 1400,
    y: 160,
    detail:
      "An ordered join via lessThanOrEqual(end, start). The penalty is a shortfall: 0 at a legal break, 600 back-to-back. Because Duration.toHours() truncates, the real threshold is 'ten whole hours' — a 10h30m gap is legal, a 9h59m gap costs exactly 1.",
    route: "/lab",
    routeLabel: "See its matches",
  },
  {
    id: "c4",
    label: "Max one shift per day",
    sublabel: "HARD · 1 per pair",
    kind: "constraint",
    x: 1400,
    y: 240,
    detail:
      "Per PAIR, so k shifts on one day cost C(k,2): two cost 1, four cost 6. That quadratic growth comes free from forEachUniquePair and punishes hoarding far better than a flat per-day penalty. It also makes each day an injective assignment, which is exactly the structure the feasibility bound exploits.",
    route: "/math",
    routeLabel: "The feasibility bound",
  },
  {
    id: "c5",
    label: "Unavailable employee",
    sublabel: "HARD · overlapping minutes",
    kind: "constraint",
    x: 1400,
    y: 320,
    detail:
      "join + flattenLast(unavailableDates) + filter. Weighed by how many minutes of the shift fall on the unavailable day — which for a night shift is 119 on the first day and 360 on the second, thanks to LocalTime.MAX being a nanosecond short of midnight.",
    route: "/code",
    routeLabel: "The missing minute",
  },
  {
    id: "c6",
    label: "Undesired day",
    sublabel: "SOFT · overlapping minutes",
    kind: "constraint",
    x: 1400,
    y: 400,
    detail:
      "Byte-for-byte the same pipeline as 'Unavailable employee', on a different date set and a different level. The cleanest demonstration in the codebase of what hard versus soft actually means: same measurement, different tier of the lexicographic order.",
    route: "/math",
    routeLabel: "Lexicographic ordering",
  },
  {
    id: "c7",
    label: "Desired day",
    sublabel: "SOFT · REWARD",
    kind: "constraint",
    x: 1400,
    y: 480,
    detail:
      "The only reward in the model, and the reason soft score can be positive. It also means a bare soft number tells you nothing about quality unless you know the reward ceiling — the total desired-minutes available to be collected.",
    route: "/lab",
    routeLabel: "See its matches",
  },
  {
    id: "c8",
    label: "Balance assignments",
    sublabel: "SOFT · unfairness",
    kind: "constraint",
    x: 1400,
    y: 560,
    detail:
      "The only aggregate constraint: the entire schedule collapses to one match. groupBy(employee, count()) → complement(Employee, 0L) → loadBalance → penalizeBigDecimal(unfairness). Its value is sqrt(sum of squared deviations from the mean) = σ·√n, taken straight from the solver source. The complement() call is the highest-value single line in the file.",
    route: "/math",
    routeLabel: "Derive the unfairness formula",
  },

  // ---- Search ------------------------------------------------------------
  {
    id: "scoreDirector",
    label: "Score calculation",
    sublabel: "incremental, per employee",
    kind: "solver",
    x: 1040,
    y: 460,
    detail:
      "Constraints 1–7 all filter on shift.employee, so the score decomposes as a sum over employees. A move touching one shift changes exactly two of those terms, so the score updates without recomputing anything else — and the unfairness term updates in O(1) from a running sum of squares. This is where the framework's speed comes from, and it is measurable: the Math Lab benchmarks incremental against full recalculation on your machine.",
    route: "/math",
    routeLabel: "Benchmark it",
  },
  {
    id: "constructionHeuristic",
    label: "Construction heuristic",
    sublabel: "ALLOCATE_ENTITY_FROM_QUEUE",
    kind: "solver",
    x: 700,
    y: 620,
    detail:
      "Phase 1. Assign each shift once, in order, never revisiting. Fast (|S|·|E| evaluations) and produces a complete solution, but cannot undo its own greedy mistakes. A quirk worth noticing: because the balance constraint changes on every single assignment, 'first non-deteriorating value' never triggers here, so first-fit degenerates into best-fit.",
    route: "/solve",
    routeLabel: "Watch it run",
  },
  {
    id: "localSearch",
    label: "Local search",
    sublabel: "Late Acceptance, L=400",
    kind: "solver",
    x: 1040,
    y: 620,
    detail:
      "Phase 2, and where the quality comes from. Propose a move, score it, accept or reject. Late acceptance accepts anything at least as good as the score from 400 steps ago (plus a hill-climbing fallback against the last step) — a self-calibrating bar that needs no tuning, unlike simulated annealing's temperature which must be expressed in your score's units.",
    route: "/solve",
    routeLabel: "Compare acceptors",
  },
  {
    id: "moves",
    label: "Move selectors",
    sublabel: "change · swap",
    kind: "concept",
    x: 1400,
    y: 660,
    detail:
      "Change move: give one shift to a different employee (|S|·(|E|−1) of them). Swap move: exchange two shifts' employees (C(|S|,2) of them). Together ~13,000 neighbours for the SMALL dataset — against 10^168 total states. Local search only ever looks at a neighbourhood, never the space.",
    route: "/math",
    routeLabel: "Neighbourhood size",
  },

  // ---- Service + UI ------------------------------------------------------
  {
    id: "resource",
    label: "EmployeeScheduleResource",
    sublabel: "POST /schedules",
    kind: "rest",
    x: 700,
    y: 820,
    detail:
      "Solving is asynchronous: POST returns a job ID immediately, and a bestSolutionEventConsumer overwrites the stored job every time the solver improves. So GET /schedules/{id} returns the best solution so far, which is what lets a UI animate progress. Two honest TODOs in the file: the job map has no TTL, and terminateEarly is asynchronous.",
    javaFile: "EmployeeScheduleResource",
    route: "/code",
    routeLabel: "Trace the lifecycle",
  },
  {
    id: "analyze",
    label: "PUT /schedules/analyze",
    sublabel: "ScoreAnalysis",
    kind: "rest",
    x: 1040,
    y: 820,
    detail:
      "Score a schedule without solving it, and get back per-constraint totals plus individual matches with justifications. This endpoint is what the Constraint Lab in this app is a port of — every violation you see listed there corresponds to one ConstraintMatch that this endpoint would return.",
    route: "/lab",
    routeLabel: "The port of this endpoint",
  },
  {
    id: "webui",
    label: "app.js + index.html",
    sublabel: "vanilla JS + Bootstrap",
    kind: "ui",
    x: 1400,
    y: 1000,
    detail:
      "The quickstart's own front end: a Gantt board built with vis-timeline, polling the REST API every 2 seconds. Deliberately dependency-light. This classroom replaces it with React, and replaces the polling with an in-browser solver so there is no server at all.",
    external: {
      label: "Timefold quickstarts on GitHub",
      url: "https://github.com/TimefoldAI/timefold-quickstarts",
    },
  },
];

export const MAP_EDGES: MapEdge[] = [
  { source: "demoData", target: "employee", label: "generates" },
  { source: "demoData", target: "shift", label: "generates" },
  { source: "shift", target: "planningVariable", label: "declares" },
  { source: "employee", target: "planningVariable", label: "value range", dashed: true },
  { source: "shift", target: "schedule", label: "entities" },
  { source: "employee", target: "schedule", label: "facts" },
  { source: "schedule", target: "constraintProvider", label: "scored by" },
  { source: "constraintProvider", target: "c1" },
  { source: "constraintProvider", target: "c2" },
  { source: "constraintProvider", target: "c3" },
  { source: "constraintProvider", target: "c4" },
  { source: "constraintProvider", target: "c5" },
  { source: "constraintProvider", target: "c6" },
  { source: "constraintProvider", target: "c7" },
  { source: "constraintProvider", target: "c8" },
  { source: "constraintProvider", target: "scoreDirector", label: "compiled into" },
  { source: "scoreDirector", target: "constructionHeuristic", label: "phase 1" },
  { source: "scoreDirector", target: "localSearch", label: "phase 2" },
  { source: "localSearch", target: "moves", label: "samples" },
  { source: "properties", target: "localSearch", label: "30s limit", dashed: true },
  { source: "constructionHeuristic", target: "localSearch", label: "hands over" },
  { source: "localSearch", target: "resource", label: "best solution events" },
  { source: "resource", target: "analyze", dashed: true },
  { source: "resource", target: "webui", label: "polled by", under: true },
];

export const KIND_META: Record<NodeKind, { label: string; color: string }> = {
  domain: { label: "Domain model", color: "var(--series-1)" },
  solver: { label: "Solver", color: "var(--series-2)" },
  constraint: { label: "Constraint", color: "var(--series-3)" },
  rest: { label: "REST layer", color: "var(--series-4)" },
  ui: { label: "Front end", color: "var(--viz-ink-muted)" },
  config: { label: "Configuration", color: "var(--viz-ink-secondary)" },
  concept: { label: "Key concept", color: "var(--status-serious)" },
};
