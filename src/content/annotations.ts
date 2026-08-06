/**
 * Line-level annotations over the real Java source in javaSources.ts.
 *
 * `lines` are 1-indexed and inclusive, matching what the reader gutter shows.
 */

export interface Annotation {
  lines: [number, number];
  title: string;
  body: string;
  /** What breaks if this line or block is deleted. */
  ifRemoved?: string;
  kind: "annotation" | "variable" | "solution" | "entity" | "constraint" | "rest" | "gotcha";
}

export interface AnnotatedFile {
  key: string;
  path: string;
  title: string;
  blurb: string;
  /** What to read this file FOR. */
  readingGoal: string;
  annotations: Annotation[];
}

export const ANNOTATED_FILES: AnnotatedFile[] = [
  {
    key: "Shift",
    path: "src/main/java/org/acme/employeescheduling/domain/Shift.java",
    title: "Shift.java",
    blurb:
      "The planning entity. Everything the solver is allowed to change lives behind one annotation on one field.",
    readingGoal:
      "Find the single decision variable, and notice how much of the file is immutable problem data by comparison.",
    annotations: [
      {
        lines: [13, 13],
        title: "@PlanningEntity — this class is mutable during solving",
        kind: "entity",
        body:
          "Marks Shift as something the solver may modify. Timefold will clone these objects constantly (once per new best solution), which is why the class needs a no-arg constructor and why keeping entities small matters for performance.",
        ifRemoved:
          "Timefold throws at startup: the @PlanningEntityCollectionProperty on EmployeeSchedule points at a list whose element type is not a planning entity, so there is nothing to optimise.",
      },
      {
        lines: [15, 16],
        title: "@PlanningId — a stable identity for move bookkeeping",
        kind: "annotation",
        body:
          "Used by multi-threaded solving and by score-analysis output to refer to this entity across solution clones. It must be unique and stable. Note DemoDataGenerator assigns these as \"0\", \"1\", \"2\"... only at the very end of generation.",
      },
      {
        lines: [18, 22],
        title: "Problem facts on the entity: start, end, location, requiredSkill",
        kind: "annotation",
        body:
          "These live on the entity but are NOT planning variables — the solver never changes them. A shift's time and skill requirement are given; only its owner is in question. This is a common source of confusion: being a field of a @PlanningEntity does not make something changeable.",
      },
      {
        lines: [24, 25],
        title: "@PlanningVariable — the ONLY decision in the whole model",
        kind: "variable",
        body:
          "The solver picks a value for this field from the @ValueRangeProvider on EmployeeSchedule (the employee list). One variable per shift; with |E| employees and |S| shifts the search space is |E|^|S|. This one line is the entire reason the problem is hard.",
        ifRemoved:
          "There is nothing to decide. The solver would report the solution as fully initialised and return the input unchanged.",
      },
      {
        lines: [95, 97],
        title: "isOverlappingWithDate — checks only the start and end dates",
        kind: "gotcha",
        body:
          "It compares getStart().toLocalDate() and getEnd().toLocalDate() against the date. That is sufficient here because shifts are 8 hours long and therefore span at most two calendar days. A 3-day shift would silently escape this check on its middle day. The port exploits the same fact to precompute exactly two (date, minutes) pairs per shift.",
      },
      {
        lines: [99, 103],
        title: "getOverlappingDurationInMinutes — where the missing minute comes from",
        kind: "gotcha",
        body:
          "The day window is [LocalTime.MIN, LocalTime.MAX] = [00:00:00.000000000, 23:59:59.999999999]. It is one nanosecond short of midnight, and ChronoUnit.MINUTES truncates. So a 22:00-06:00 night shift contributes 119 minutes to its first day and 360 to its second — 479 total, one minute less than its 480-minute length. Not a bug, but it does mean the penalty for a night shift on an unavailable day is asymmetric between the two days.",
      },
      {
        lines: [105, 111],
        title: "The generic interval-intersection helper",
        kind: "annotation",
        body:
          "max(start1, start2) to min(end1, end2), clamped at zero. The same two lines appear again in the constraint provider as getMinuteOverlap. Worth recognising: interval overlap is the workhorse computation of nearly every scheduling constraint.",
      },
      {
        lines: [118, 132],
        title: "equals/hashCode on the @PlanningId only",
        kind: "gotcha",
        body:
          "Identity is the id, not the field values. This is deliberate — a Shift's employee changes millions of times during a solve, and a hashCode that depended on it would corrupt every HashMap the solver keeps. Rule of thumb: never include a planning variable in equals or hashCode.",
        ifRemoved:
          "Include `employee` in hashCode and the solver's internal indexes break in ways that surface as wrong scores rather than as exceptions — among the nastiest bugs in this domain.",
      },
    ],
  },
  {
    key: "Employee",
    path: "src/main/java/org/acme/employeescheduling/domain/Employee.java",
    title: "Employee.java",
    blurb: "A pure problem fact. No planning annotations at all — and that is the point.",
    readingGoal:
      "Confirm for yourself that nothing here is a planning variable, then ask why availability is modelled as three separate date sets.",
    annotations: [
      {
        lines: [9, 9],
        title: "No @PlanningEntity — Employee is immutable during solving",
        kind: "annotation",
        body:
          "Employees are the VALUE RANGE, not entities. The solver assigns employees to shifts, never the reverse. That asymmetry is a modelling choice with real consequences: because shifts are the entities, the search space is |E|^|S| rather than something combinatorially different, and moves are naturally 'reassign a shift'.",
      },
      {
        lines: [10, 11],
        title: "@PlanningId on name — which makes name the primary key",
        kind: "gotcha",
        body:
          "Employees are identified by name, and equals/hashCode below use only the name. Two real people called Amy Cole would silently collapse into one. Fine for a demo; the first thing to change for production.",
      },
      {
        lines: [14, 16],
        title: "Three date sets: unavailable, undesired, desired",
        kind: "annotation",
        body:
          "This is the whole preference model. unavailableDates drives a HARD constraint; undesired and desired drive SOFT ones. Splitting a single 'preference' concept into a hard tier and a soft tier is the cleanest example in the codebase of what the score levels are for — and note that unavailable and undesired use byte-for-byte identical arithmetic, differing only in which level they penalise.",
      },
    ],
  },
  {
    key: "EmployeeSchedule",
    path: "src/main/java/org/acme/employeescheduling/domain/EmployeeSchedule.java",
    title: "EmployeeSchedule.java",
    blurb: "The planning solution: the container the solver clones, scores and returns.",
    readingGoal:
      "Read the four annotations at the top as a contract. They are the complete interface between your model and the solver.",
    annotations: [
      {
        lines: [13, 13],
        title: "@PlanningSolution — the root object",
        kind: "solution",
        body:
          "Timefold clones this whole graph every time it finds a new best solution, so it can hand you an immutable snapshot while continuing to mutate its working copy. That is why the class needs a no-arg constructor.",
      },
      {
        lines: [16, 18],
        title: "@ProblemFactCollectionProperty + @ValueRangeProvider on the same field",
        kind: "solution",
        body:
          "Two jobs at once. The first tells the solver 'these are facts, index them for constraint joins but never change them'. The second tells it 'these are the legal values for the planning variable'. Stacking them on one field is idiomatic when the fact collection IS the value range.",
        ifRemoved:
          "Drop @ValueRangeProvider and the solver has no values to assign, failing at startup. Drop @ProblemFactCollectionProperty and the join in unavailableEmployee(...) — which joins Shift against Employee.class — finds nothing, so those three date constraints silently score zero.",
      },
      {
        lines: [20, 21],
        title: "@PlanningEntityCollectionProperty — where the entities are found",
        kind: "solution",
        body: "The solver walks this list to discover every entity whose variables it may change.",
      },
      {
        lines: [23, 24],
        title: "@PlanningScore with HardSoftBigDecimalScore",
        kind: "solution",
        body:
          "The BigDecimal variant is chosen specifically so the load-balance constraint can return a fractional unfairness. With plain HardSoftScore the unfairness would round to an integer, flattening the score landscape into plateaus and starving local search of the gradient it follows.",
      },
      {
        lines: [36, 39],
        title: "A second constructor carrying only score + status",
        kind: "annotation",
        body:
          "Used by the /status endpoint to answer 'how is it going?' without serialising the entire schedule. A small thing, but it is the difference between a status poll costing bytes and costing megabytes.",
      },
    ],
  },
  {
    key: "EmployeeSchedulingConstraintProvider",
    path: "src/main/java/org/acme/employeescheduling/solver/EmployeeSchedulingConstraintProvider.java",
    title: "EmployeeSchedulingConstraintProvider.java",
    blurb:
      "The business rules, as a stream pipeline per rule. This is the file you will spend the most time in.",
    readingGoal:
      "For each constraint, separate the SELECTION (which tuples match) from the WEIGHING (how much each match costs). Those are independent choices and they fail in different ways.",
    annotations: [
      {
        lines: [23, 33],
        title: "getMinuteOverlap — the shared interval-intersection helper",
        kind: "annotation",
        body:
          "max of the starts, min of the ends, converted to minutes. Returns a positive number only when the intervals actually overlap. Used as the match weigher for the overlapping-shift constraint.",
      },
      {
        lines: [35, 50],
        title: "defineConstraints — the registry, hard first then soft",
        kind: "constraint",
        body:
          "Just a list. The ORDER here is cosmetic; the levels are what create the hierarchy, and those are set by whether each constraint uses ONE_HARD or ONE_SOFT. Grouping them hard-then-soft in the array is a readability convention, nothing more.",
      },
      {
        lines: [52, 58],
        title: "requiredSkill — the simplest possible constraint",
        kind: "constraint",
        body:
          "forEach + filter + flat penalty. Note there is NO null check on getEmployee(), and none is needed: forEach(Shift.class) already excludes shifts whose planning variable is null. That implicit filter is the most consequential piece of hidden behaviour in the file.",
        ifRemoved:
          "Nurses get assigned to Anaesthetics shifts. Removing it also makes the problem trivially feasible, which is a good way to see how much of the difficulty comes from skills alone.",
      },
      {
        lines: [59, 66],
        title: "noOverlappingShifts — forEachUniquePair with two joiners",
        kind: "constraint",
        body:
          "forEachUniquePair emits each unordered pair once, so you cannot double-count. Two joiners compose: equal(getEmployee) hash-indexes by employee, and overlapping(getStart, getEnd) is an interval-tree index. Both are indexed, so the solver never materialises the full O(n^2) pair set — it only visits pairs that already share an employee and already overlap in time.",
        ifRemoved:
          "The solver stacks simultaneous shifts on whoever is most convenient — physically impossible, but numerically it eases skills and balance.",
      },
      {
        lines: [67, 79],
        title: "atLeast10HoursBetweenTwoShifts — an ordered join, and a truncation",
        kind: "rest",
        body:
          "This uses join(...) rather than forEachUniquePair, with lessThanOrEqual(getEnd, getStart) giving direction: the pair (a, b) matches when a ends before b starts. The penalty (10*60) - breakLength is a SHORTFALL: zero at a legal 10-hour break, 600 at a back-to-back handover.",
        ifRemoved:
          "You get the classic 'clopening' — finish at 22:00, start again at 06:00. Legal to the solver, punishing for the person.",
      },
      {
        lines: [71, 72],
        title: "Duration.toHours() truncates — the boundary is not where you'd guess",
        kind: "gotcha",
        body:
          "toHours() on a 10h30m gap returns 10, so `< 10` is false and it counts as legal. On a 9h59m gap it returns 9, so the pair is penalised by exactly 600 - 599 = 1. The constraint's real threshold is therefore 'at least 10 whole hours', and the penalty is continuous right up to it.",
      },
      {
        lines: [80, 86],
        title: "oneShiftPerDay — per pair, so the cost is quadratic in the pile-up",
        kind: "constraint",
        body:
          "Because it is forEachUniquePair, k shifts on one day cost C(k,2), not k-1. Two shifts cost 1, three cost 3, four cost 6. That superlinearity is free and it discourages hoarding much more effectively than a flat per-day penalty would. Note it compares getStart().toLocalDate() only, so a night shift belongs to the day it starts.",
      },
      {
        lines: [87, 95],
        title: "unavailableEmployee — join + flattenLast, the workhorse pattern",
        kind: "constraint",
        body:
          "Read it right to left: join Shift to its Employee (equal(getEmployee, identity)), flattenLast explodes that employee's unavailableDates set so each date becomes its own row, then filter keeps only the dates the shift actually touches. flattenLast is how you get from 'an object with a collection field' to 'one tuple per element' inside a constraint stream.",
        ifRemoved:
          "Hard availability degrades into a mere preference and gets traded away whenever balance or desired-days pay more.",
      },
      {
        lines: [96, 112],
        title: "undesired and desired — identical pipelines, three different verdicts",
        kind: "constraint",
        body:
          "Compare these two methods against unavailableEmployee line by line. The selection logic is character-for-character the same; only the date set and the final verdict differ — ONE_HARD penalize, ONE_SOFT penalize, ONE_SOFT reward. If you want one example of what 'hard versus soft' means mechanically, it is this trio.",
      },
      {
        lines: [114, 122],
        title: "balanceEmployeeShiftAssignments — the only aggregate constraint",
        kind: "constraint",
        body:
          "groupBy(employee, count()) gives a load per employee; loadBalance(...) folds all of those into ONE tuple carrying an unfairness number; penalizeBigDecimal charges it against soft. The whole schedule produces a single constraint match. Its value is sqrt(sum of squared deviations from the mean) — see the Math Lab for the derivation from the solver source.",
        ifRemoved:
          "A perfectly legal schedule appears in which three people work every day and the rest work never — nothing else in the model cares how many shifts one person has, only that they do not collide.",
      },
      {
        lines: [117, 117],
        title: ".complement(Employee.class, e -> 0L) — the line that is easy to miss",
        kind: "gotcha",
        body:
          "groupBy only emits groups that have at least one member, so an employee with zero shifts would be absent from the load vector entirely — and invisible to the fairness calculation. complement injects them back with a load of 0. Without it, 'fairness' would be measured only over the people already working, and the fairest solution would be to overload a handful and idle everyone else.",
        ifRemoved:
          "Fairness silently measures the wrong population and the solver's idea of a balanced schedule becomes the opposite of yours. This is the highest-value single line in the file.",
      },
    ],
  },
  {
    key: "EmployeeScheduleResource",
    path: "src/main/java/org/acme/employeescheduling/rest/EmployeeScheduleResource.java",
    title: "EmployeeScheduleResource.java",
    blurb:
      "The REST lifecycle. Solving is asynchronous, so the API is a job submission plus a poll.",
    readingGoal:
      "Trace one solve from POST to GET and notice that the client never waits for a solver. Then find the two TODOs — they are the real production gaps.",
    annotations: [
      {
        lines: [46, 47],
        title: "SolverManager and SolutionManager — two different jobs",
        kind: "annotation",
        body:
          "SolverManager runs solvers asynchronously and hands you a job handle. SolutionManager does synchronous, non-solving work on an existing solution: score it, explain it, analyse constraint matches. The /analyze endpoint uses the second one, which is why it can respond immediately.",
      },
      {
        lines: [49, 50],
        title: "TODO: the job map has no time-to-live and will leak",
        kind: "gotcha",
        body:
          "A ConcurrentHashMap that only ever grows, holding a full schedule per job. Fine for a demo, an outage in production. The fix is an eviction policy or an external store — and it is worth noticing that the quickstart says so out loud rather than hiding it.",
      },
      {
        lines: [78, 96],
        title: "solve() returns a job ID immediately, not a solution",
        kind: "annotation",
        body:
          "This is the shape every long-running optimisation API converges on. Note withBestSolutionEventConsumer: every time the solver improves on its best, the callback overwrites the stored job. So a GET mid-solve returns the best solution SO FAR, which is what makes the UI able to animate progress.",
      },
      {
        lines: [83, 85],
        title: "withProblemFinder re-reads from the map on every restart",
        kind: "annotation",
        body:
          "The solver asks for its problem via a lambda rather than being handed the object once. That indirection is what lets the same job be resumed or re-solved from whatever the current stored state is.",
      },
      {
        lines: [99, 106],
        title: "analyze() — score explanation without solving",
        kind: "annotation",
        body:
          "PUT a schedule, get back a ScoreAnalysis: per-constraint totals and, with the right fetch policy, every individual constraint match with its justification. This is the endpoint the Constraint Lab in this app is a port of. FETCH_MATCH_COUNT versus FETCH_ALL matters — the second can be very large.",
      },
      {
        lines: [156, 164],
        title: "terminateSolving is DELETE, and the second TODO",
        kind: "gotcha",
        body:
          "terminateEarly() is asynchronous, so this can return a solution while the solver is still winding down. The linked issue asks for terminateEarlyAndWait. A real client that terminates and immediately reads may get a schedule one step short of the final best.",
      },
    ],
  },
  {
    key: "DemoDataGenerator",
    path: "src/main/java/org/acme/employeescheduling/rest/DemoDataGenerator.java",
    title: "DemoDataGenerator.java",
    blurb:
      "How the test instances are built. Read this to understand why your solve is hard — or impossible.",
    readingGoal:
      "Work out the expected number of shifts from the distributions, then check whether the skill supply can cover the demand. That second question is the one that determines whether 0hard is even reachable.",
    annotations: [
      {
        lines: [29, 48],
        title: "SMALL — 3 locations, 15 employees, 14 days",
        kind: "annotation",
        body:
          "Locations cycle through SHIFT_START_TIMES_COMBOS, so location 0 gets 2 start times, location 1 gets 3, location 2 gets 4 — nine timeslots per day. With a shift-count distribution averaging 1.1 per timeslot over 14 days, expect roughly 139 shifts for 15 employees. That is ~9 shifts each across 14 days.",
      },
      {
        lines: [39, 41],
        title: "shiftCountDistribution — a weighted categorical draw",
        kind: "annotation",
        body:
          "[{1, weight 0.9}, {2, weight 0.1}] means P(1 shift) = 0.9 and P(2 shifts) = 0.1, so the expected count per timeslot is 1*0.9 + 2*0.1 = 1.1. The weights are unnormalised — pickCount divides by their sum — so you can write them as 3 and 1 rather than 0.75 and 0.25, as optionalSkillDistribution does.",
      },
      {
        lines: [47, 47],
        title: "randomSeed = 0, so the instance is reproducible",
        kind: "annotation",
        body:
          "Same seed, same instance, every run. Essential for benchmarking — otherwise you cannot tell an improvement in the solver from a lucky dataset. It also means the shipped SMALL instance is one fixed problem, and it is worth knowing its properties.",
      },
      {
        lines: [149, 155],
        title: "Availability is assigned by a uniform 3-way switch",
        kind: "gotcha",
        body:
          "For each chosen employee-day, random.nextInt(3) decides unavailable / undesired / desired with equal probability. So roughly a third of all availability markers are HARD unavailability, scattered without regard to whether the remaining staff can still cover that day. This is precisely how the shipped dataset ends up infeasible: on some days the number of shifts requiring a skill exceeds the number of available employees holding it.",
      },
      {
        lines: [184, 191],
        title: "requiredSkill is drawn 50/50 from required vs optional skills",
        kind: "gotcha",
        body:
          "random.nextBoolean() picks between the required-skill list (Doctor, Nurse — every employee has exactly one) and the optional list (Anaesthetics, Cardiology — held by only some). So half the shifts demand a scarce skill. Combined with the availability switch above, this is the other half of the infeasibility story. The Feasibility panel in this app computes the exact shortfall by bipartite matching.",
      },
      {
        lines: [200, 212],
        title: "pickCount — the weighted draw, and an off-by-one to watch",
        kind: "annotation",
        body:
          "Draw u uniform on [0, total weight), then walk buckets subtracting weights. Note the loop condition has no bound check on the index: it relies on the arithmetic never overshooting, which holds because u < total. The TypeScript port adds an explicit bound because floating-point summation makes that guarantee slightly less airtight.",
      },
    ],
  },
];

export const ANNOTATED_BY_KEY = Object.fromEntries(
  ANNOTATED_FILES.map((file) => [file.key, file]),
) as Record<string, AnnotatedFile>;
