import { useEffect, useState } from "react";
import { CalendarDays, ArrowUpRight } from "lucide-react";
import { get } from "./store";
import { READING_PLANS, label, type ReadingPlan } from "./plans";

type Enrollment = {
  id: string;
  start: string;
  completed: number[];
  custom?: ReadingPlan;
};
export default function HomePlan({
  onRead,
  onPlans,
}: {
  onRead: (book: number, chapter: number) => void;
  onPlans: () => void;
}) {
  const [active, setActive] = useState<{
    plan: ReadingPlan;
    enrollment: Enrollment;
  } | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const enrollment = await get<Enrollment>("active-plan");
        const chronological = await get<ReadingPlan>("chronological-plan");
        const plan =
          enrollment?.custom ||
          READING_PLANS.find((p) => p.id === enrollment?.id) ||
          (enrollment?.id === "chronological" ? chronological : undefined);
        if (live) {
          setActive(enrollment && plan ? { plan, enrollment } : null);
          setError("");
        }
      } catch {
        if (live) setError("Your saved plan could not be loaded.");
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  if (loading)
    return (
      <div className="plan-preview" role="status">
        Opening your reading plan…
      </div>
    );
  if (error)
    return (
      <div className="plan-preview">
        <p role="status">{error}</p>
        <button className="button" onClick={onPlans}>
          Open plans
        </button>
      </div>
    );
  if (!active)
    return (
      <div className="plan-preview">
        <span className="quick-icon">
          <CalendarDays size={23} />
        </span>
        <div>
          <h3>A little structure. Space to linger.</h3>
          <p>Choose a reading plan that fits your pace.</p>
        </div>
        <button className="button" onClick={onPlans}>
          Explore plans
        </button>
      </div>
    );
  const { plan, enrollment } = active;
  const completed = new Set(
    enrollment.completed.filter(
      (day) => Number.isInteger(day) && day >= 0 && day < plan.days.length,
    ),
  );
  const day = plan.days.findIndex((_, i) => !completed.has(i));
  const assignments = day < 0 ? [] : plan.days[day];
  const first = assignments[0];
  return (
    <div className="plan-preview">
      <span className="quick-icon">
        <CalendarDays size={23} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3>{plan.name}</h3>
        <p>
          {day < 0
            ? "Plan complete. Return to any passage whenever you like."
            : `Next · Day ${day + 1} · ${assignments.length ? assignments.map(label).join(" · ") : "A day to pause and revisit"}`}
        </p>
        <progress
          style={{ width: "100%", accentColor: "var(--accent, #9c4039)" }}
          aria-label={`${plan.name} progress`}
          value={completed.size}
          max={plan.days.length}
        />
        <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {completed.size} of {plan.days.length} days complete
        </p>
      </div>
      <button
        className="button"
        onClick={() => (first ? onRead(first.book, first.chapter) : onPlans())}
      >
        {first ? "Open reading" : "View plan"}
        {first && <ArrowUpRight size={15} />}
      </button>
    </div>
  );
}
