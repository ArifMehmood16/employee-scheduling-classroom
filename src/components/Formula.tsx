import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small maths typesetting without a KaTeX dependency.
 *
 * Every formula in this app is at most a fraction, a square root and a sum, so hand
 * setting keeps the Lovable bundle small and the markup inspectable. Anything more
 * elaborate than this and the honest move would be to add KaTeX.
 */

export function Math({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("math whitespace-nowrap", className)}>{children}</span>;
}

/** Display formula: centred, roomy, with an optional label on the right. */
export function Display({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "my-3 flex items-center justify-center gap-4 rounded-md border bg-background/60 px-4 py-3",
        className,
      )}
    >
      <div className="math text-center text-[15px] leading-relaxed">{children}</div>
      {label ? (
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : null}
    </div>
  );
}

export function Frac({ over, under }: { over: ReactNode; under: ReactNode }) {
  return (
    <span className="frac">
      <span>{over}</span>
      <span>{under}</span>
    </span>
  );
}

/** Square root with an overbar that actually covers the radicand. */
export function Sqrt({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-start">
      <span className="pr-0.5 text-[1.15em] leading-none">√</span>
      <span className="border-t border-current pt-[2px]">{children}</span>
    </span>
  );
}

export function Sub({ children }: { children: ReactNode }) {
  return <sub className="text-[0.72em]">{children}</sub>;
}

export function Sup({ children }: { children: ReactNode }) {
  return <sup className="text-[0.72em]">{children}</sup>;
}

/** Capital sigma with limits stacked above and below, as in print. */
export function Sum({ over, under }: { over?: ReactNode; under?: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex flex-col items-center align-middle leading-none">
      {over ? <span className="text-[0.62em]">{over}</span> : null}
      <span className="text-[1.4em] leading-none">Σ</span>
      {under ? <span className="text-[0.62em]">{under}</span> : null}
    </span>
  );
}

/** A named step in a derivation, with the justification alongside. */
export function Step({
  expression,
  because,
}: {
  expression: ReactNode;
  because?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5">
      <div className="math min-w-0 flex-1 text-[14px]">{expression}</div>
      {because ? (
        <div className="shrink-0 text-xs text-muted-foreground">{because}</div>
      ) : null}
    </div>
  );
}
