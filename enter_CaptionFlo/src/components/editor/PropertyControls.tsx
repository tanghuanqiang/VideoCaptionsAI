import { cn } from "@/lib/utils";

/** A labeled row for property panels. */
export function FieldRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5", className)}>
      <label className="shrink-0 text-xs text-foreground/60">{label}</label>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {children}
      </div>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-foreground/45 first:mt-0">
      {children}
    </h3>
  );
}

/** Number input that shows "mixed" placeholder when value is undefined in batch mode. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  mixed,
  width = "w-20",
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  mixed?: boolean;
  width?: string;
}) {
  return (
    <div className={cn("relative", width)}>
      <input
        type="number"
        value={mixed ? "" : value ?? ""}
        min={min}
        max={max}
        step={step}
        placeholder={mixed ? "混合" : undefined}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (Number.isFinite(value)) onChange(value);
        }}
        className="h-8 w-full rounded-md border border-input bg-card px-2 pr-6 text-right text-xs tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-foreground/40">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function ColorField({
  value,
  onChange,
  mixed,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  mixed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {mixed && <span className="text-[10px] text-foreground/40">混合</span>}
      <input
        type="color"
        value={value ?? "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded-md border border-input bg-card p-0.5"
      />
    </div>
  );
}

export function TextField({
  value,
  onChange,
  mixed,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  mixed?: boolean;
}) {
  return (
    <input
      type="text"
      value={mixed ? "" : value ?? ""}
      placeholder={mixed ? "混合" : undefined}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-32 rounded-md border border-input bg-card px-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
    />
  );
}
