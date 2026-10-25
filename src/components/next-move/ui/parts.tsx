import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

/** Section header: red kicker, big title, optional pill beside it, optional lede. */
export function SectionHead({ kicker, title, pill, lede }: { kicker: string; title: string; pill?: ReactNode; lede?: ReactNode }) {
  return (
    <header className="nm-head">
      <span className="label">{kicker}</span>
      <div className="nm-head__row">
        <h2>{title}</h2>
        {pill}
      </div>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}

/** White card with a red icon and uppercase title. */
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

/** One figure on a light tile. `iconSide="left"` puts the icon in a pink square (Compare); "right" is a gray line icon (Home, Money). */
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
      <strong className={`nm-tile__value${tone ? ` is-${tone}` : ""}`}>{value}</strong>
      {sub && <span className="nm-tile__sub">{sub}</span>}
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: "good" | "bad" }) {
  return <span className={`tag nm-pill${tone ? ` is-${tone}` : ""}`}>{children}</span>;
}

/** Label/amount rows with an optional bold total. */
export function Ledger({ rows, total }: { rows: { k: string; v: ReactNode; bad?: boolean }[]; total?: { k: string; v: ReactNode; bad?: boolean } }) {
  return (
    <div className="nm-ledger">
      {rows.map((r) => (
        <div key={r.k}>
          <span>{r.k}</span>
          <span className={r.bad ? "neg" : undefined}>{r.v}</span>
        </div>
      ))}
      {total && (
        <div className="total">
          <span>{total.k}</span>
          <span className={total.bad ? "neg" : undefined}>{total.v}</span>
        </div>
      )}
    </div>
  );
}
