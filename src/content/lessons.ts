/**
 * The classroom track: an ordered path through the material, each step naming what you
 * should be able to do afterwards and where in the app to do it.
 */

export interface Lesson {
  id: string;
  module: string;
  title: string;
  minutes: number;
  /** The one-sentence claim of the lesson. */
  thesis: string;
  /** Concrete, checkable outcomes. */
  outcomes: string[];
  /** What to actually do, in order. */
  steps: Array<{ text: string; route?: string; routeLabel?: string }>;
  /** A question you should be able to answer before moving on. */
  checkpoint: string;
  external?: Array<{ label: string; url: string }>;
}

export const LESSONS: Lesson[] = [
  {
    id: "l1",
    module: "1 · The problem",
    title: "What is actually being decided",
    minutes: 8,
    thesis:
      "The entire model has one decision variable, repeated once per shift. Everything else is input.",
    outcomes: [
      "Name the planning entity, the planning variable and the value range without looking",
      "Explain why Employee is a problem fact and not an entity",
      "State the size of the search space and why that rules out enumeration",
    ],
    steps: [
      {
        text: "Open the mindmap and follow the chain Shift → Shift.employee → EmployeeSchedule. Read the side panel on each.",
        route: "/map",
        routeLabel: "Open the mindmap",
      },
      {
        text: "Read Shift.java top to bottom. Count how many fields are decided by the solver versus given.",
        route: "/code",
        routeLabel: "Read Shift.java",
      },
      {
        text: "In the Math Lab, look at the search-space panel for the SMALL dataset and compare it to the anchors.",
        route: "/math",
        routeLabel: "Search space",
      },
    ],
    checkpoint:
      "If you added a second planning variable to Shift — say, the location — what would happen to the size of the search space, and why?",
    external: [
      {
        label: "Timefold docs — planning variables",
        url: "https://docs.timefold.ai/timefold-solver/latest/using-timefold-solver/modeling-planning-problems",
      },
    ],
  },
  {
    id: "l2",
    module: "2 · Scoring",
    title: "Hard and soft are levels, not weights",
    minutes: 10,
    thesis:
      "Score comparison is lexicographic, which is what makes hard constraints genuinely inviolable rather than merely expensive.",
    outcomes: [
      "Compare two HardSoftScores correctly, including the trick cases",
      "Explain why no hard-to-soft exchange rate exists or is needed",
      "Say why this model uses the BigDecimal score variant",
    ],
    steps: [
      {
        text: "Read the lexicographic-order section in the Math Lab and try the comparison widget.",
        route: "/math",
        routeLabel: "Lexicographic order",
      },
      {
        text: "In the code reader, compare unavailableEmployee, undesiredDayForEmployee and desiredDayForEmployee line by line. Find the only differences.",
        route: "/code",
        routeLabel: "The constraint provider",
      },
      {
        text: "In the Constraint Lab, switch off every hard constraint and watch what the solver considers a good schedule.",
        route: "/lab",
        routeLabel: "Constraint Lab",
      },
    ],
    checkpoint:
      "Which is better: -1hard/+1,000,000soft or 0hard/-9,999soft? Now explain why a single-objective formulation would need you to invent a magic number here.",
  },
  {
    id: "l3",
    module: "2 · Scoring",
    title: "Match weighers, and why gradients matter",
    minutes: 12,
    thesis:
      "Choosing HOW MUCH each violation costs is a separate decision from choosing WHICH tuples violate — and getting it wrong produces a score that is correct but unsearchable.",
    outcomes: [
      "Explain why the overlap constraint counts minutes rather than incidents",
      "Predict the cost of four shifts on one day, and say why it is quadratic",
      "Identify the one reward in the model and what it does to the soft score's readability",
    ],
    steps: [
      {
        text: "Read the weigher rationale for all eight constraints in the Constraint Lab side panel.",
        route: "/lab",
        routeLabel: "Constraint Lab",
      },
      {
        text: "In the Math Lab, work through the flat-weight-versus-gradient landscape demo.",
        route: "/math",
        routeLabel: "Gradients",
      },
    ],
    checkpoint:
      "You replace the overlap weigher with a flat weight of 1. The optimal schedule is unchanged — so why does the solver now find a worse one?",
  },
  {
    id: "l4",
    module: "3 · Constraint streams",
    title: "Pipelines, joiners and the hidden filter",
    minutes: 15,
    thesis:
      "A constraint stream is a query. Its shape determines both what it selects and how fast it runs, and one of its filters is invisible.",
    outcomes: [
      "Read any of the eight pipelines and say what tuple type flows at each stage",
      "Explain why a joiner is not sugar for a filter",
      "Explain why an empty schedule scores 0hard/0soft",
      "Say what .complement(...) fixes and what breaks without it",
    ],
    steps: [
      {
        text: "Read all eight constraint methods with the annotations open. Pay attention to the two flagged as gotchas.",
        route: "/code",
        routeLabel: "The constraint provider",
      },
      {
        text: "In the Constraint Lab, turn off the balance constraint and look at the load distribution chart.",
        route: "/lab",
        routeLabel: "Constraint Lab",
      },
      {
        text: "Drill the constraint-stream deck until you can do it cold.",
        route: "/cards",
        routeLabel: "Flashcards",
      },
    ],
    checkpoint:
      "Trace the tuple types through the unavailableEmployee pipeline, stage by stage, starting from Shift and ending at the penalty.",
    external: [
      {
        label: "Timefold docs — constraint streams",
        url: "https://docs.timefold.ai/timefold-solver/latest/constraints-and-score/score-calculation",
      },
    ],
  },
  {
    id: "l5",
    module: "4 · The mathematics of fairness",
    title: "Deriving unfairness from the solver source",
    minutes: 15,
    thesis:
      "unfairness() is √(Σ(xᵢ − x̄)²) — the Euclidean distance from a perfectly balanced load vector, which is σ·√n and not σ.",
    outcomes: [
      "Derive Σ(xᵢ − x̄)² = Σxᵢ² − S²/n and recognise it in the solver's accumulators",
      "Explain why squared beats absolute deviation for this job",
      "Explain why the value must not be rounded to an integer",
      "Compute the O(1) delta when one shift moves between two employees",
    ],
    steps: [
      {
        text: "Work through the derivation and the interactive load-vector widget.",
        route: "/math",
        routeLabel: "Load balancing",
      },
      {
        text: "Drag the sliders until absolute deviation stays fixed while unfairness changes. That gap is the whole argument for squaring.",
        route: "/math",
        routeLabel: "Load balancing",
      },
    ],
    checkpoint:
      "10 shifts over 5 employees. Which is worse by this metric, (3,2,2,2,1) or (6,1,1,1,1) — and by what factor? Now answer the same question using absolute deviations and explain the discrepancy.",
  },
  {
    id: "l6",
    module: "5 · Search",
    title: "Two phases, and what a move is",
    minutes: 12,
    thesis:
      "Construction gets you a complete solution fast and greedily; local search gets you a good one by proposing small changes it is willing to reject.",
    outcomes: [
      "Describe what the construction heuristic does and what it cannot do",
      "Compute the size of the change-move and swap-move neighbourhoods",
      "Explain why the working solution can end up worse than the best solution",
    ],
    steps: [
      {
        text: "Run a solve with the move inspector open and watch individual moves being accepted and rejected.",
        route: "/solve",
        routeLabel: "Solver",
      },
      {
        text: "Set the construction heuristic to NONE and solve. Watch what happens, and work out why.",
        route: "/solve",
        routeLabel: "Solver",
      },
    ],
    checkpoint:
      "Why does first-fit degenerate into best-fit in this particular model? (Hint: what happens to the score on every single assignment?)",
  },
  {
    id: "l7",
    module: "5 · Search",
    title: "Acceptance criteria: the actual metaheuristic",
    minutes: 15,
    thesis:
      "Every metaheuristic is a rule for sometimes accepting a worse solution. That rule is the algorithm; everything else is plumbing.",
    outcomes: [
      "State the Late Acceptance criterion from memory, including the hill-climbing fallback",
      "Explain why it needs almost no tuning where simulated annealing does",
      "Predict what pure hill climbing does on this problem and why",
    ],
    steps: [
      {
        text: "Race all four acceptors on the same dataset and seed, then read the trajectories.",
        route: "/solve",
        routeLabel: "Compare acceptors",
      },
      {
        text: "Set lateAcceptanceSize to 1 and then to 5,000, and explain both results.",
        route: "/solve",
        routeLabel: "Solver",
      },
    ],
    checkpoint:
      "With L = 1, late acceptance becomes equivalent to which algorithm? What does L → ∞ approach?",
    external: [
      {
        label: "Timefold docs — local search acceptors",
        url: "https://docs.timefold.ai/timefold-solver/latest/optimization-algorithms/optimization-algorithms",
      },
    ],
  },
  {
    id: "l8",
    module: "6 · Judging the result",
    title: "Bounds, or how to know whether the solver did well",
    minutes: 15,
    thesis:
      "A score with no lower bound tells you nothing. For this model the bound is computable exactly, in polynomial time.",
    outcomes: [
      "Build the per-day bipartite graph and explain what a matching means",
      "State Hall's condition and its deficiency version",
      "Distinguish 'the search is weak' from 'the instance is impossible'",
      "Explain why the bound is a bound and not the optimum",
    ],
    steps: [
      {
        text: "Open the feasibility panel on the shipped SMALL dataset and find the days that are short.",
        route: "/math",
        routeLabel: "Feasibility bound",
      },
      {
        text: "Solve it and compare the result against the bound. Then switch to a feasible seed and solve again.",
        route: "/solve",
        routeLabel: "Solver",
      },
    ],
    checkpoint:
      "The bound says -2 and the solver reaches -3. Name two distinct explanations, and say how you would tell them apart.",
  },
  {
    id: "l9",
    module: "7 · Performance",
    title: "Why incremental scoring is the whole ballgame",
    minutes: 12,
    thesis:
      "The score decomposes as a sum over employees, so a move changes two terms out of fifteen — and that structural fact is worth more than any amount of micro-optimisation.",
    outcomes: [
      "Explain the decomposition and which constraint breaks it",
      "Derive the O(1) delta for the unfairness term",
      "Measure the speedup on your own machine and say where it comes from",
    ],
    steps: [
      {
        text: "Run the scoring benchmark and read the two moves-per-second figures.",
        route: "/math",
        routeLabel: "Benchmark",
      },
      {
        text: "Read fastEval.ts alongside constraints.ts. The two agree on every state — the tests assert it — but one is ~20× faster.",
        route: "/code",
        routeLabel: "Code reader",
      },
    ],
    checkpoint:
      "Which of the eight constraints does NOT decompose per employee, and how is it kept O(1) anyway?",
  },
  {
    id: "l10",
    module: "8 · Production",
    title: "The service layer, and what the TODOs are telling you",
    minutes: 10,
    thesis:
      "Solving is asynchronous, so the API is a job submission plus a poll — and the quickstart is honest about the two places that would break in production.",
    outcomes: [
      "Trace a solve from POST through best-solution events to GET",
      "Explain what SolutionManager does that SolverManager does not",
      "Name both TODOs and say what each would cost you",
    ],
    steps: [
      {
        text: "Read EmployeeScheduleResource.java with the annotations open.",
        route: "/code",
        routeLabel: "Read the REST layer",
      },
      {
        text: "Compare the /analyze endpoint against the Constraint Lab, which is a port of it.",
        route: "/lab",
        routeLabel: "Constraint Lab",
      },
    ],
    checkpoint:
      "Why can DELETE /schedules/{id} return a solution that is one step short of the final best?",
  },
];

export const MODULES = [...new Set(LESSONS.map((lesson) => lesson.module))];
