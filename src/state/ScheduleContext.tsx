import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DATASETS,
  findFeasibleSeed,
  generateDemoData,
  type DatasetName,
  type DemoDataParameters,
} from "@/timefold/demoData";
import { analyseFeasibility, type FeasibilityReport } from "@/timefold/feasibility";
import {
  ALL_ENABLED,
  evaluateSchedule,
  type ConstraintId,
  type ConstraintToggles,
  type ScoreExplanation,
} from "@/timefold/constraints";
import type { EmployeeSchedule } from "@/timefold/domain";
import { EmployeeSchedulingSolver } from "@/timefold/solver";
import { computeSearchSpace, type SearchSpaceStats } from "@/timefold/searchSpace";

/**
 * One schedule shared across every page, so a solve on the Solver page is the same
 * object you then dissect in the Constraint Lab. Learning tools that reset state
 * between views make it impossible to follow a thread.
 *
 * The start date is pinned rather than taken from `new Date()` so that every number in
 * the app is reproducible — including the feasibility bound, which depends on which
 * calendar dates the availability markers land on.
 */

const PINNED_START_DATE = "2026-08-10"; // a Monday, matching nextOrSame(MONDAY)

/**
 * Steps of local search run when seeding a dataset.
 *
 * The app opens on a SOLVED schedule rather than an empty one, because a freshly
 * generated schedule has every planning variable null — and thanks to forEach() skipping
 * unassigned entities, that scores a flawless 0hard/0soft with no constraint matches
 * anywhere. Correct, and a genuinely important lesson, but a terrible first screen: every
 * panel in the app would read zero. So we solve on load and expose the empty state behind
 * an explicit "Clear assignments" action, where it teaches instead of confusing.
 */
const SEED_SOLVE_STEPS = 12_000;

interface ScheduleContextValue {
  dataset: DatasetName;
  seed: number;
  schedule: EmployeeSchedule;
  toggles: ConstraintToggles;
  explanation: ScoreExplanation;
  feasibility: FeasibilityReport;
  searchSpace: SearchSpaceStats;
  parameters: DemoDataParameters;
  setDataset: (dataset: DatasetName) => void;
  setSeed: (seed: number) => void;
  regenerate: () => void;
  applyFeasibleSeed: () => number | null;
  setSchedule: (schedule: EmployeeSchedule) => void;
  /** Set every planning variable back to null — the "why does this score 0/0?" state. */
  clearAssignments: () => void;
  toggleConstraint: (id: ConstraintId) => void;
  setToggles: (toggles: ConstraintToggles) => void;
  resetToggles: () => void;
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

function generate(dataset: DatasetName, seed: number): EmployeeSchedule {
  return generateDemoData({ ...DATASETS[dataset], randomSeed: seed }, PINNED_START_DATE);
}

/**
 * Generate, then construct and locally search, so the app opens on real data.
 *
 * The loop stops early once the hard score reaches the provable Hall's-theorem bound,
 * because at that point it is optimal on the hard level and further steps can only
 * polish soft — which is not worth blocking first paint for. A feasible instance
 * therefore seeds in a fraction of the step cap.
 */
function build(dataset: DatasetName, seed: number): EmployeeSchedule {
  const problem = generate(dataset, seed);
  const bound = analyseFeasibility(problem).hardScoreUpperBound;
  const solver = new EmployeeSchedulingSolver(problem, {
    seed: 0,
    toggles: ALL_ENABLED,
    spentLimitMs: Number.MAX_SAFE_INTEGER,
  });
  solver.runConstructionHeuristic();
  const cap = dataset === "LARGE" ? SEED_SOLVE_STEPS / 3 : SEED_SOLVE_STEPS;
  for (let i = 0; i < cap; i++) {
    solver.step();
    if (i % 256 === 0 && solver.bestScore().hard >= bound) break;
  }
  solver.restoreBest();
  return solver.snapshot();
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [dataset, setDatasetState] = useState<DatasetName>("SMALL");
  const [seed, setSeedState] = useState<number>(DATASETS.SMALL.randomSeed);
  const [schedule, setSchedule] = useState<EmployeeSchedule>(() =>
    build("SMALL", DATASETS.SMALL.randomSeed),
  );
  const [toggles, setToggles] = useState<ConstraintToggles>({ ...ALL_ENABLED });

  const setDataset = useCallback((next: DatasetName) => {
    setDatasetState(next);
    const nextSeed = DATASETS[next].randomSeed;
    setSeedState(nextSeed);
    setSchedule(build(next, nextSeed));
  }, []);

  const setSeed = useCallback(
    (nextSeed: number) => {
      setSeedState(nextSeed);
      setSchedule(build(dataset, nextSeed));
    },
    [dataset],
  );

  const regenerate = useCallback(() => {
    setSchedule(build(dataset, seed));
  }, [dataset, seed]);

  const clearAssignments = useCallback(() => {
    setSchedule(generate(dataset, seed));
  }, [dataset, seed]);

  const applyFeasibleSeed = useCallback(() => {
    const found = findFeasibleSeed(
      DATASETS[dataset],
      (candidate) => analyseFeasibility(candidate).feasible,
      PINNED_START_DATE,
    );
    if (found != null) {
      setSeedState(found);
      setSchedule(build(dataset, found));
    }
    return found;
  }, [dataset]);

  const toggleConstraint = useCallback((id: ConstraintId) => {
    setToggles((previous) => ({ ...previous, [id]: !previous[id] }));
  }, []);

  const resetToggles = useCallback(() => setToggles({ ...ALL_ENABLED }), []);

  const explanation = useMemo(
    () => evaluateSchedule(schedule, toggles, true),
    [schedule, toggles],
  );
  const feasibility = useMemo(() => analyseFeasibility(schedule), [schedule]);
  const searchSpace = useMemo(() => computeSearchSpace(schedule), [schedule]);

  const value = useMemo<ScheduleContextValue>(
    () => ({
      dataset,
      seed,
      schedule,
      toggles,
      explanation,
      feasibility,
      searchSpace,
      parameters: { ...DATASETS[dataset], randomSeed: seed },
      setDataset,
      setSeed,
      regenerate,
      applyFeasibleSeed,
      setSchedule,
      clearAssignments,
      toggleConstraint,
      setToggles,
      resetToggles,
    }),
    [
      dataset,
      seed,
      schedule,
      toggles,
      explanation,
      feasibility,
      searchSpace,
      setDataset,
      setSeed,
      regenerate,
      applyFeasibleSeed,
      clearAssignments,
      toggleConstraint,
      resetToggles,
    ],
  );

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useScheduleState(): ScheduleContextValue {
  const context = useContext(ScheduleContext);
  if (!context)
    throw new Error("useScheduleState must be used inside a ScheduleProvider");
  return context;
}

export { PINNED_START_DATE };
