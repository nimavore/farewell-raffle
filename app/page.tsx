import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div>
        <p className="text-xs font-semibold tracking-[0.35em] text-brand">
          ∿ MBITION ∿
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
          The Farewell Raffle
        </h1>
        <p className="mt-3 text-slate-400">
          Draft beers, sandwiches, and a wheel that owes you nothing. Someone&apos;s
          shifting into a new gear — the rest is classified.
        </p>
        <p className="mt-2 text-sm font-medium text-gold">
          🗓️ Friday the 14th · 🕕 18:00 · 📍 1st-floor open space · 🍺 on tap
        </p>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-3">
        <Link
          href="/register"
          className="rounded-2xl border border-white/10 bg-panel p-6 transition hover:border-brand/60 hover:bg-panel/70"
        >
          <div className="text-2xl">✍️</div>
          <div className="mt-2 font-semibold">Register</div>
          <div className="mt-1 text-sm text-slate-400">Get on the grid</div>
        </Link>
        <Link
          href="/wheel"
          className="rounded-2xl border border-white/10 bg-panel p-6 transition hover:border-brand/60 hover:bg-panel/70"
        >
          <div className="text-2xl">🎡</div>
          <div className="mt-2 font-semibold">The Wheel</div>
          <div className="mt-1 text-sm text-slate-400">Meet your fate</div>
        </Link>
        <Link
          href="/monitor"
          className="rounded-2xl border border-white/10 bg-panel p-6 transition hover:border-brand/60 hover:bg-panel/70"
        >
          <div className="text-2xl">🛠️</div>
          <div className="mt-2 font-semibold">Mission Control</div>
          <div className="mt-1 text-sm text-slate-400">Staff only</div>
        </Link>
      </div>
    </main>
  );
}
