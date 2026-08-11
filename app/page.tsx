import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Farewell Raffle <span aria-hidden>🍻</span>
        </h1>
        <p className="mt-3 text-slate-400">
          One last spin. Register your name, then come find the wheel on the big
          screen.
        </p>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-3">
        <Link
          href="/register"
          className="rounded-2xl border border-white/10 bg-panel p-6 transition hover:border-brand/60 hover:bg-panel/70"
        >
          <div className="text-2xl">✍️</div>
          <div className="mt-2 font-semibold">Register</div>
          <div className="mt-1 text-sm text-slate-400">Add your name</div>
        </Link>
        <Link
          href="/wheel"
          className="rounded-2xl border border-white/10 bg-panel p-6 transition hover:border-brand/60 hover:bg-panel/70"
        >
          <div className="text-2xl">🎡</div>
          <div className="mt-2 font-semibold">Wheel</div>
          <div className="mt-1 text-sm text-slate-400">Big-screen spin</div>
        </Link>
        <Link
          href="/monitor"
          className="rounded-2xl border border-white/10 bg-panel p-6 transition hover:border-brand/60 hover:bg-panel/70"
        >
          <div className="text-2xl">🛠️</div>
          <div className="mt-2 font-semibold">Monitor</div>
          <div className="mt-1 text-sm text-slate-400">Admin only</div>
        </Link>
      </div>
    </main>
  );
}
