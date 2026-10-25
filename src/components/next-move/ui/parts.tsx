import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

/** Section header: red kicker, big title, optional pill and lede. */
export function SectionHead({ kicker, title, pill, lede, children }: { kicker: string; title: string; pill?: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="nm-head">
      <span className="label">{kicker}</span>
      <div className="nm-head__row">
        <h2>{title}</h2>
        {pill}
      </div>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </header>
  );
}

/** Card with an icon and a red uppercase title. */
export function Card({ icon, title, className = "", children }: { icon?: IconName; title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`card nm-card ${className}`}>
      {title && (
        <h3 className="nm-card__title">
          {icon && <Icon name={icon} size={22} />}
          <span className="label">{title}</span>
        </h3>
      )}
      {children}
    </div>
  );
}

/** One figure on a light tile. `iconSide` puts the icon in a tinted square on the left (Compare) instead of a gray line icon on the right. */
export function KpiTile({
  label,
  value,
  sub,
  icon,
  iconSide = "right",
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: IconName;
  iconSide?: "left" | "right";
  tone?: "good" | "bad";
}) {
  return (
    <div className={`nm-tile nm-tile--${iconSide}`}>
      <span className="nm-tile__icon">
        <Icon name={icon} size={iconSide === "left" ? 20 : 22} />
      </span>
      <span className="nm-tile__label">{label}</span>
      <strong className={`nm-tile__value mono${tone ? ` is-${tone}` : ""}`}>{value}</strong>
      {sub && <span className="nm-tile__sub">{sub}</span>}
    </div>
  );
}

/** Mono outline pill. */
export function Pill({ children, tone }: { children: ReactNode; tone?: "good" | "bad" | "warn" }) {
  return <span className={`tag nm-pill${tone ? ` is-${tone}` : ""}`}>{children}</span>;
}

/** Label/amount rows, optionally with a bold total at the bottom. */
export function Ledger({ rows, total }: { rows: { k: string; v: ReactNode; tone?: "bad" }[]; total?: { k: string; v: ReactNode; tone?: "bad" } }) {
  return (
    <div className="budget-math mono nm-ledger">
      {rows.map((r) => (
        <div key={r.k}>
          <span>{r.k}</span>
          <span className={r.tone === "bad" ? "neg" : undefined}>{r.v}</span>
        </div>
      ))}
      {total && (
        <div className="total">
          <span>{total.k}</span>
          <span className={total.tone === "bad" ? "neg" : undefined}>{total.v}</span>
        </div>
      )}
    </div>
  );
}
