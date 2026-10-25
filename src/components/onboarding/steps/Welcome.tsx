import s from "../onboarding.module.css";

const WHAT = [
  ["Your car", "Model, miles and what it's worth"],
  ["How you pay", "Paid off, a loan, or a lease"],
  ["Insurance", "Connect Toyota Insurance (simulated) or type it in"],
  ["Driving", "Miles a month, or import a real drive"],
  ["Goals", "What you want to protect: cash, total cost or the monthly payment"],
  ["Your bank", "Connect through Capital One's Nessie sandbox and watch your budget take shape"],
];

export default function Welcome({ name }: { name: string }) {
  return (
    <>
      <p className={s.kicker}>Welcome</p>
      <h1 className={s.title}>Hi {name}. Six short steps and your plan is ready.</h1>
      <p className={s.lede}>Everything you enter stays on this demo server and in this browser. Numbers are estimates.</p>
      <ol className={s.grid} style={{ listStyle: "none", padding: 0 }}>
        {WHAT.map(([t, d], i) => (
          <li key={t} className={s.card}>
            <span className={s.kicker}>Step {i + 1}</span>
            <strong>{t}</strong>
            <span className={s.hint}>{d}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
