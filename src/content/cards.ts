/**
 * Flashcards and quiz content.
 *
 * Cards are graded with a three-box Leitner scheme (again / good / easy) rather than a
 * full SM-2 schedule, because a single sitting with this material is a review session,
 * not a months-long retention programme.
 */

export type Deck =
  | "annotations"
  | "constraints"
  | "streams"
  | "score"
  | "search"
  | "maths";

export interface Flashcard {
  id: string;
  deck: Deck;
  front: string;
  back: string;
  /** The thing people usually get wrong about this. */
  trap?: string;
}

export const DECK_META: Record<Deck, { label: string; blurb: string }> = {
  annotations: {
    label: "Annotations",
    blurb: "The seven annotations that define the model",
  },
  constraints: {
    label: "The 8 constraints",
    blurb: "What each one selects, and what it charges",
  },
  streams: {
    label: "Constraint streams",
    blurb: "forEach, joiners, flattenLast, groupBy, complement",
  },
  score: { label: "Scoring", blurb: "Levels, lexicographic order, weighers" },
  search: { label: "Search", blurb: "Phases, moves, acceptors, termination" },
  maths: { label: "Mathematics", blurb: "Combinatorics, unfairness, bounds" },
};

export const FLASHCARDS: Flashcard[] = [
  // ---- annotations -------------------------------------------------------
  {
    id: "a1",
    deck: "annotations",
    front: "What does @PlanningVariable mark, and how many are in this model?",
    back: "The field the solver is allowed to change. Exactly one in this model: Shift.employee. Every other field is fixed input.",
    trap: "Being a field of a @PlanningEntity does not make something changeable — only @PlanningVariable does.",
  },
  {
    id: "a2",
    deck: "annotations",
    front: "Why does EmployeeSchedule.employees carry TWO annotations?",
    back: "@ProblemFactCollectionProperty says 'index these for joins but never change them'. @ValueRangeProvider says 'these are the legal values for the planning variable'. Stacking both is idiomatic when the fact collection IS the value range.",
  },
  {
    id: "a3",
    deck: "annotations",
    front: "What is @PlanningId for?",
    back: "A stable, unique identity used by multi-threaded solving and score-analysis output to refer to an entity across solution clones.",
  },
  {
    id: "a4",
    deck: "annotations",
    front: "Why must a planning variable never appear in equals/hashCode?",
    back: "The variable changes millions of times per solve. A hashCode that depended on it would corrupt every internal index — and the symptom is wrong scores rather than an exception, which makes it one of the hardest bugs in this domain to find.",
  },
  {
    id: "a5",
    deck: "annotations",
    front: "Why does @PlanningSolution require a no-arg constructor?",
    back: "Timefold clones the entire solution graph every time it finds a new best, so it can hand you an immutable snapshot while continuing to mutate its working copy.",
  },

  // ---- constraints -------------------------------------------------------
  {
    id: "c1",
    deck: "constraints",
    front: "Name the five HARD constraints.",
    back: "Missing required skill · Overlapping shift · At least 10 hours between two shifts · Max one shift per day · Unavailable employee.",
  },
  {
    id: "c2",
    deck: "constraints",
    front: "Name the three SOFT constraints and their directions.",
    back: "Undesired day (penalise) · Desired day (REWARD) · Balance employee shift assignments (penalise). Only one reward in the whole model.",
  },
  {
    id: "c3",
    deck: "constraints",
    front: "What is the penalty for the 10-hour rest constraint?",
    back: "(10 × 60) − gapMinutes, applied only when floor(gapHours) < 10. So 0 at a legal break and 600 back-to-back.",
    trap: "Duration.toHours() truncates, so a 10h30m gap is legal and a 9h59m gap costs exactly 1.",
  },
  {
    id: "c4",
    deck: "constraints",
    front: "Four shifts assigned to one employee on the same day. What does 'Max one shift per day' cost?",
    back: "6. It is forEachUniquePair, so the cost is C(4,2) = 6, not 3. The penalty grows quadratically in the pile-up.",
  },
  {
    id: "c5",
    deck: "constraints",
    front: "Which constraint is the cheapest hard violation, and why does that matter?",
    back: "Missing required skill, at a flat 1. It matters because when the data is over-constrained the solver will deliberately break THAT one rather than breach availability (up to 480) — the weights decide which rule bends.",
  },
  {
    id: "c6",
    deck: "constraints",
    front: "'Unavailable employee' and 'Undesired day' — what is the difference in the code?",
    back: "One word. The pipelines are character-for-character identical apart from the date set; one uses ONE_HARD and the other ONE_SOFT.",
  },

  // ---- streams -----------------------------------------------------------
  {
    id: "s1",
    deck: "streams",
    front: "What does forEach(Shift.class) silently exclude?",
    back: "Shifts whose planning variable is null. Unassigned shifts are invisible to every constraint using forEach.",
    trap: "This is why an entirely empty schedule scores a flawless 0hard/0soft. Use forEachIncludingUnassigned to see them.",
  },
  {
    id: "s2",
    deck: "streams",
    front: "Why prefer a joiner over a filter when both give the same score?",
    back: "A joiner builds a hash or interval index, so the pair stream is proportional to matching pairs. A filter materialises the full cartesian product first. Same answer, far slower solver.",
  },
  {
    id: "s3",
    deck: "streams",
    front: "What does flattenLast(Employee::getUnavailableDates) do?",
    back: "Explodes the collection in the last tuple slot into one row per element — turning (Shift, Employee) into (Shift, LocalDate) tuples, one per unavailable date.",
  },
  {
    id: "s4",
    deck: "streams",
    front: "What does forEachUniquePair guarantee that a self-join does not?",
    back: "Each unordered pair appears exactly once, so you cannot double-count. A plain join(Shift.class) would emit both (a,b) and (b,a).",
  },
  {
    id: "s5",
    deck: "streams",
    front: "What does .complement(Employee.class, e -> 0L) fix?",
    back: "groupBy only emits groups with at least one member, so an employee with zero shifts would be absent from the load vector and invisible to the fairness calculation. complement injects them back with load 0.",
    trap: "Without it, 'fairness' is measured only over people already working — and the fairest solution becomes 'overload a few, idle the rest', the exact opposite of the intent.",
  },
  {
    id: "s6",
    deck: "streams",
    front: "In atLeast10HoursBetweenTwoShifts, why join rather than forEachUniquePair?",
    back: "The constraint is directional — it needs the pair ordered so that a ends before b starts. lessThanOrEqual(getEnd, getStart) supplies that direction; an unordered pair could not express it.",
  },

  // ---- score -------------------------------------------------------------
  {
    id: "sc1",
    deck: "score",
    front: "Which is better: -1hard/+1000000soft, or 0hard/-9999soft?",
    back: "0hard/-9999soft. Comparison is lexicographic: hard is compared first and soft only breaks ties. No amount of soft reward buys off one unit of hard penalty.",
  },
  {
    id: "sc2",
    deck: "score",
    front: "Why HardSoftBigDecimalScore rather than plain HardSoftScore?",
    back: "So the load-balance constraint can return a fractional unfairness. Rounded to an integer, thousands of distinct load vectors would collapse to the same score and local search would face a flat landscape with no signal.",
  },
  {
    id: "sc3",
    deck: "score",
    front: "Why weigh the overlap constraint by minutes rather than a flat 1?",
    back: "To create a gradient. With a flat weight, shortening an overlap without eliminating it earns nothing, so the search has no downhill direction to follow and must find the whole fix in one move.",
  },
  {
    id: "sc4",
    deck: "score",
    front: "What is Timefold's initScore, and what problem does it solve?",
    back: "A dominating level equal to minus the number of unassigned entities. Comparison is (initScore, hard, soft), so any fully-assigned solution beats any partial one — otherwise the empty schedule, which scores 0hard/0soft, would look optimal.",
  },
  {
    id: "sc5",
    deck: "score",
    front: "Can the soft score in this model be positive? Why does that complicate reading it?",
    back: "Yes — the Desired day constraint is a reward. So a soft score of +6234 is meaningless without knowing the reward ceiling: the total desired-minutes actually available to be collected.",
  },

  // ---- search ------------------------------------------------------------
  {
    id: "se1",
    deck: "search",
    front: "What are the two solver phases, and what does each contribute?",
    back: "Construction heuristic: assign every entity once, in order, never revisiting — fast, complete, greedy. Local search: propose and accept/reject small changes — slow per unit of progress, but this is where quality comes from.",
  },
  {
    id: "se2",
    deck: "search",
    front: "State the Late Acceptance criterion.",
    back: "Accept a move if its score is at least as good as the score from L steps ago (Timefold default L = 400), or — with hillClimbingEnabled, the default — at least as good as the last step's score.",
  },
  {
    id: "se3",
    deck: "search",
    front: "Why is Late Acceptance the default rather than Simulated Annealing?",
    back: "It self-calibrates. Its acceptance bar is a real score the search actually achieved, so it tightens automatically as the search improves. Simulated annealing needs a starting temperature expressed in your score's units, which changes with every dataset.",
  },
  {
    id: "se4",
    deck: "search",
    front: "Why does pure hill climbing fail on this problem?",
    back: "It accepts only improvements, so it halts at the first local optimum. Escaping a plateau here often needs two coordinated moves, and hill climbing will never take the first one because in isolation it looks worse.",
  },
  {
    id: "se5",
    deck: "search",
    front: "How large is the change-move neighbourhood, and how does it compare to the search space?",
    back: "|S| × (|E| − 1) — about 2,000 for the SMALL dataset, ~13,000 including swaps. The search space is 15^143 ≈ 10^168. Local search examines a vanishingly small neighbourhood, never the space.",
  },
  {
    id: "se6",
    deck: "search",
    front: "Why can the working solution be worse than the best solution at the end of a solve?",
    back: "Because the acceptor deliberately accepts worsening moves to escape local optima. The solver keeps a separate best-solution snapshot and restores it when it terminates.",
  },

  // ---- maths -------------------------------------------------------------
  {
    id: "m1",
    deck: "maths",
    front: "Give the formula for LoadBalance.unfairness().",
    back: "√(Σᵢ (xᵢ − x̄)²) — the square root of the total sum of squared deviations from the mean, to 6 significant digits.",
    trap: "It is NOT the standard deviation. It equals σ·√n. Equivalently it is the Euclidean distance from the load vector to the perfectly balanced vector.",
  },
  {
    id: "m2",
    deck: "maths",
    front: "Why squared deviations rather than absolute deviations for fairness?",
    back: "Squaring punishes outliers superlinearly. With loads summing to 10 over 5 people, (3,2,2,2,1) and (6,1,1,1,1) have absolute deviations of 2 and 8 — only 4× apart. Squared, they are 2 and 20: 10× apart. Absolute deviation is nearly indifferent to how imbalance is distributed; squared deviation is not.",
  },
  {
    id: "m3",
    deck: "maths",
    front: "How does Timefold compute the sum of squared deviations incrementally?",
    back: "It maintains Σxᵢ² and −S² separately, using the identity Σ(xᵢ − x̄)² = Σxᵢ² − S²/n. Both update in O(1) when one load changes, so no pass over the load vector is ever needed.",
  },
  {
    id: "m4",
    deck: "maths",
    front: "Why is the score a sum over employees, and why does that matter?",
    back: "Constraints 1–7 all filter on shift.employee, so the total decomposes per employee. A change move touches exactly two of those terms, which is what makes incremental scoring possible — and incremental scoring is the difference between thousands and hundreds of thousands of moves per second.",
  },
  {
    id: "m5",
    deck: "maths",
    front: "How can you prove a lower bound on the hard score?",
    back: "Per day, 'max one shift per day' forces an injective assignment. Build a bipartite graph (shifts × employees with skill and availability) and take the maximum matching; the deficiency |shifts| − |matching| is a count of shifts that MUST break a hard constraint. Sum over days by Hall's deficiency theorem.",
    trap: "It is a bound, not the optimum — the rest constraint couples adjacent days and this per-day relaxation cannot see it.",
  },
  {
    id: "m6",
    deck: "maths",
    front: "Why does 'find a feasible solution' turn out to be the easy part?",
    back: "The space respecting one-shift-per-day is a product of k-permutations P(|E|, k_day) — still astronomically large. Greedy construction lands inside it in milliseconds. The hard part is finding a GOOD solution among ~10^150 feasible ones.",
  },
  {
    id: "m7",
    deck: "maths",
    front: "Why does a 22:00–06:00 shift overlap its first day by 119 minutes, not 120?",
    back: "The day window ends at LocalTime.MAX = 23:59:59.999999999, one nanosecond short of midnight, and ChronoUnit.MINUTES truncates. 119.99999… minutes becomes 119.",
  },
  {
    id: "m8",
    deck: "maths",
    front: "What complexity class is employee shift scheduling in, and what follows from that?",
    back: "NP-hard — it contains graph colouring as a special case (shifts = vertices, 'cannot share an employee' = edges, employees = colours). What follows is the whole metaheuristic approach: abandon proving optimality, get a very good answer inside a time budget you choose.",
  },
];

// ---------------------------------------------------------------------------

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Index into options. */
  answer: number;
  explanation: string;
  deck: Deck;
}

export const QUIZ: QuizQuestion[] = [
  {
    id: "q1",
    deck: "score",
    question:
      "A solver reports 0hard/-4,200soft. Another run of the same problem reports -1hard/+9,000soft. Which is better?",
    options: [
      "The second — its soft score is far higher",
      "The first — hard dominates absolutely",
      "They are incomparable without a weighting",
      "Depends on the configured hard-to-soft ratio",
    ],
    answer: 1,
    explanation:
      "Comparison is lexicographic on (hard, soft). Hard is compared first; soft only breaks ties. There is no hard-to-soft ratio to configure — that is the whole point of levels, and it is why you never have to invent a 'big enough' weight for hard rules.",
  },
  {
    id: "q2",
    deck: "streams",
    question: "An entirely unassigned schedule is scored. What comes back?",
    options: [
      "A large negative hard score — every shift is uncovered",
      "0hard/0soft",
      "An exception: the solution is uninitialised",
      "-143hard, one per unassigned shift",
    ],
    answer: 1,
    explanation:
      "forEach(Shift.class) skips shifts with a null planning variable, so no constraint matches anything. The empty schedule looks perfect. Timefold's separate initScore level is what stops the solver from latching onto it as the optimum.",
  },
  {
    id: "q3",
    deck: "maths",
    question:
      "10 shifts spread over 5 employees. Loads are (6,1,1,1,1). What does the balance constraint charge?",
    options: ["8", "√20 ≈ 4.47214", "2", "√8 ≈ 2.82843"],
    answer: 1,
    explanation:
      "The mean is 2, so deviations are (+4,−1,−1,−1,−1) and the squared deviations sum to 16+1+1+1+1 = 20. unfairness = √20 ≈ 4.47214. The answer 8 is the sum of ABSOLUTE deviations — which is what the constraint would charge if fairness were measured with L1 instead of L2.",
  },
  {
    id: "q4",
    deck: "constraints",
    question:
      "An employee finishes at 22:00 and starts again at 07:30 the next morning. What does the rest constraint charge?",
    options: ["0 — that is more than 9 hours", "30", "90", "600"],
    answer: 1,
    explanation:
      "The gap is 9h30m = 570 minutes. floor(570/60) = 9, which is < 10, so it is penalised by 600 − 570 = 30. Had the gap been 10h30m, toHours() would return 10 and the pair would be legal.",
  },
  {
    id: "q5",
    deck: "streams",
    question:
      "You delete `.complement(Employee.class, e -> 0L)` from the balance constraint. What happens?",
    options: [
      "Nothing measurable — employees with no shifts contribute 0 anyway",
      "The solver crashes on an empty group",
      "Fairness is measured only over employees who already have shifts, so overloading a few and idling the rest scores well",
      "The unfairness value doubles",
    ],
    answer: 2,
    explanation:
      "groupBy only emits groups with at least one member. Without complement, an idle employee is absent from the load vector entirely, so n shrinks and their idleness is invisible. The 'fairest' schedule becomes the opposite of what you wanted — which is why this is the highest-value single line in the constraint file.",
  },
  {
    id: "q6",
    deck: "search",
    question:
      "Your solver plateaus at -6hard and 30 more seconds does not help. What should you check FIRST?",
    options: [
      "Increase lateAcceptanceSize",
      "Switch to simulated annealing",
      "Whether the instance is feasible at all",
      "Add more move selectors",
    ],
    answer: 2,
    explanation:
      "Without a lower bound you cannot tell a weak search from an impossible problem. Compute the per-day bipartite matching deficiency: if it equals 6, the solver is already optimal on the hard level and every tuning change is wasted effort. The shipped SMALL dataset is exactly this case.",
  },
  {
    id: "q7",
    deck: "search",
    question: "Why does the overlap constraint weigh by minutes rather than using a flat weight of 1?",
    options: [
      "Minutes make the score easier for humans to read",
      "To give local search a gradient, so partial progress is rewarded",
      "Because HardSoftBigDecimalScore requires non-integer weights",
      "To make overlaps more expensive than skill mismatches",
    ],
    answer: 1,
    explanation:
      "A flat weight makes an 8-hour double-booking and a 5-minute one identical, so any move that shortens an overlap without eliminating it earns nothing. Weighing by minutes turns a cliff into a slope the search can walk down. (The last option is a real side effect, but not the reason.)",
  },
  {
    id: "q8",
    deck: "maths",
    question:
      "Which change would most increase the number of score evaluations per second?",
    options: [
      "Replacing equal(Shift::getEmployee) with an equivalent .filter(...)",
      "Recomputing only the two employees a move touches, rather than the whole schedule",
      "Switching from HardSoftBigDecimalScore to HardSoftScore",
      "Reducing lateAcceptanceSize from 400 to 40",
    ],
    answer: 1,
    explanation:
      "Incremental scoring is the big one — the score decomposes as a sum over employees, so a move changes exactly two terms. Option 1 makes it much slower (a filter is not indexed). Option 3 speeds up arithmetic slightly but destroys the score gradient. Option 4 changes search behaviour, not throughput.",
  },
  {
    id: "q9",
    deck: "annotations",
    question: "Why is Employee a problem fact rather than a planning entity?",
    options: [
      "Employees cannot be modified in a database",
      "Because the solver assigns employees to shifts, so shifts hold the decision",
      "Because Employee has no setters",
      "Performance — facts are cheaper to clone",
    ],
    answer: 1,
    explanation:
      "It is a modelling choice with real consequences. Shifts are the entities and employees the value range, so the search space is |E|^|S| and moves are naturally 'reassign a shift'. Inverting it — entities as employees with a list of shifts — would give a different variable type, different moves and different performance.",
  },
  {
    id: "q10",
    deck: "constraints",
    question:
      "The data is over-constrained: one day needs 5 Doctor shifts but only 4 Doctors are available. What does the solver do?",
    options: [
      "Leaves the fifth shift unassigned",
      "Assigns an unavailable Doctor, since availability is only soft",
      "Assigns a non-Doctor, taking a 1-point skill penalty",
      "Reports the problem as infeasible and stops",
    ],
    answer: 2,
    explanation:
      "It picks the cheapest hard violation. A skill mismatch is a flat 1; breaching availability costs the overlapping minutes, up to 480. Leaving the shift unassigned is not an option the moves offer, and nothing in the model reports infeasibility. The weights decided which rule bends — which is worth knowing before you set them.",
  },
];
