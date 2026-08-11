"use client";

import { useEffect, useMemo, useState } from "react";
import { useRaffleData } from "@/lib/useRaffleData";
import type { PrizeConfigRow } from "@/lib/types";

export default function MonitorPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/login")
      .then((r) => r.json())
      .then((d) => setAuthed(!!d.ok))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return <Centered>Loading…</Centered>;
  }
  if (!authed) {
    return <PasswordGate onSuccess={() => setAuthed(true)} />;
  }
  return <Dashboard />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-slate-400">
      {children}
    </main>
  );
}

function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) onSuccess();
    else setError("Incorrect password.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-panel p-8">
        <h1 className="text-xl font-bold">Mission Control ∿</h1>
        <p className="mt-1 text-sm text-slate-400">
          Staff only. Password, please — the surprise stays a surprise.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-4 w-full rounded-xl border border-white/10 bg-ink px-4 py-3 outline-none focus:border-brand"
          placeholder="Password"
        />
        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
        <button
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}

function Dashboard() {
  const data = useRaffleData();
  const locked = data.eventState?.registration_locked ?? false;
  const wheelOpen = data.eventState?.wheel_open ?? false;
  const hasSpins = data.results.length > 0;

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data.registrants) m.set(r.id, r.name);
    return m;
  }, [data.registrants]);

  const spunCount = data.results.length;
  const total = data.registrants.length;
  const shirtsLeft = data.pool.filter((p) => p.is_shirt && !p.claimed).length;
  const prizesLeft = data.pool.filter((p) => !p.claimed).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Mission Control ∿</h1>
        <EventControls locked={locked} wheelOpen={wheelOpen} hasSpins={hasSpins} />
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Registrants
          registrants={data.registrants}
          locked={locked}
          spunIds={new Set(data.results.map((r) => r.registrant_id))}
        />
        <PrizeConfigPanel config={data.prizeConfig} locked={locked} total={total} />
      </div>

      <section className="mt-6 rounded-3xl border border-white/10 bg-panel p-5">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <h2 className="text-lg font-semibold">Results</h2>
          <Stat label="Spun" value={`${spunCount} / ${total}`} />
          <Stat label="Prizes left" value={prizesLeft} />
          <Stat label="Shirts left" value={shirtsLeft} highlight={shirtsLeft > 0} />
        </div>

        {data.results.length === 0 ? (
          <p className="text-sm text-slate-500">No spins yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Prize</th>
                  <th className="py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="py-2 pr-4 text-slate-500">{r.seq}</td>
                    <td className="py-2 pr-4">{nameById.get(r.registrant_id) ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {r.is_shirt ? "👕 " : r.is_noprize ? "😅 " : "🎁 "}
                      {r.prize_name}
                    </td>
                    <td className="py-2 text-slate-500">
                      {new Date(r.spun_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ResetPanel />
    </main>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-ink px-3 py-1.5">
      <span className="text-xs text-slate-500">{label}: </span>
      <span className={highlight ? "font-semibold text-gold" : "font-semibold"}>
        {value}
      </span>
    </div>
  );
}

function EventControls({
  locked,
  wheelOpen,
  hasSpins,
}: {
  locked: boolean;
  wheelOpen: boolean;
  hasSpins: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(path: string, onOk?: (data: Record<string, unknown>) => void) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(path, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setBusy(false);
    if (!data.ok) {
      setMsg((data.message as string) ?? "Action failed.");
      return;
    }
    onOk?.(data);
  }

  const lock = () =>
    call("/api/admin/lock", (d) =>
      setMsg(
        `Locked. Pool: ${d.shirts} shirts + ${d.fillers} fillers + ${d.noprize} “No prize”.`
      )
    );
  const unlock = () => call("/api/admin/unlock");
  const openWheel = () =>
    call("/api/admin/open-wheel", () => setMsg("Wheel is live — let them spin! 🎡"));
  const closeWheel = () => call("/api/admin/close-wheel");

  const step = wheelOpen ? 2 : locked ? 1 : 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {!locked && (
          <button
            onClick={lock}
            disabled={busy}
            className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "…" : "🔒 1 · Lock Registration"}
          </button>
        )}

        {locked && !wheelOpen && (
          <>
            <button
              onClick={unlock}
              disabled={busy}
              className="rounded-xl bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20 disabled:opacity-60"
            >
              Unlock
            </button>
            <button
              onClick={openWheel}
              disabled={busy}
              className="rounded-xl bg-brand px-4 py-2 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "…" : "🎡 2 · Enable Wheel"}
            </button>
          </>
        )}

        {wheelOpen && (
          <>
            <span className="rounded-xl bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-300">
              🎡 Wheel is LIVE
            </span>
            {!hasSpins && (
              <button
                onClick={closeWheel}
                disabled={busy}
                className="rounded-xl bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20 disabled:opacity-60"
              >
                Disable
              </button>
            )}
          </>
        )}
      </div>

      <p className="max-w-xs text-right text-xs text-slate-400">
        {msg ??
          (step === 0
            ? "Step 1: lock registration to freeze the list and build the pool."
            : step === 1
              ? "Locked & pool built. Step 2: enable the wheel to start the draw."
              : hasSpins
                ? "Draw in progress. Reset (below) to undo everything."
                : "Wheel is live. Disable stays available until the first spin lands.")}
      </p>
    </div>
  );
}

function Registrants({
  registrants,
  locked,
  spunIds,
}: {
  registrants: { id: string; name: string; seq: number; registered_at: string }[];
  locked: boolean;
  spunIds: Set<string>;
}) {
  async function remove(id: string) {
    await fetch("/api/admin/registrant", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-panel p-5">
      <h2 className="mb-3 text-lg font-semibold">
        Registrants{" "}
        <span className="text-sm font-normal text-slate-500">({registrants.length})</span>
      </h2>
      {registrants.length === 0 ? (
        <p className="text-sm text-slate-500">No one yet.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
          {registrants.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5"
            >
              <span>
                <span className="mr-2 text-slate-600">{r.seq}</span>
                {r.name}
                {spunIds.has(r.id) && <span className="ml-2 text-emerald-400">✓</span>}
              </span>
              {!locked && (
                <button
                  onClick={() => remove(r.id)}
                  className="rounded px-2 text-slate-500 hover:text-rose-400"
                  title="Delete"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PrizeConfigPanel({
  config,
  locked,
  total,
}: {
  config: PrizeConfigRow[];
  locked: boolean;
  total: number;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");

  const fillers = config.filter((c) => !c.is_shirt);
  const fillerTotal = fillers.reduce((s, c) => s + c.quantity, 0);
  const noPrize = Math.max(0, total - 6 - fillerTotal);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(qty);
    if (!name.trim() || !Number.isInteger(quantity) || quantity < 0) return;
    await fetch("/api/admin/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), quantity }),
    });
    setName("");
    setQty("1");
  }

  async function patch(id: string, patch: { name?: string; quantity?: number }) {
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function remove(id: string) {
    await fetch("/api/admin/config", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-panel p-5">
      <h2 className="mb-3 text-lg font-semibold">Prizes</h2>

      <ul className="space-y-2 text-sm">
        <li className="flex items-center justify-between rounded-lg bg-ink px-3 py-2">
          <span className="font-medium">👕 T-Shirt</span>
          <span className="text-slate-400">× 6 (guaranteed)</span>
        </li>
        {fillers.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2"
          >
            <input
              defaultValue={c.name}
              disabled={locked}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) patch(c.id, { name: v });
              }}
              className="min-w-0 flex-1 bg-transparent outline-none disabled:opacity-70"
            />
            <span className="text-slate-500">×</span>
            <input
              type="number"
              min={0}
              defaultValue={c.quantity}
              disabled={locked}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isInteger(v) && v >= 0 && v !== c.quantity)
                  patch(c.id, { quantity: v });
              }}
              className="w-16 rounded bg-white/5 px-2 py-1 text-right outline-none disabled:opacity-70"
            />
            {!locked && (
              <button
                onClick={() => remove(c.id)}
                className="text-slate-500 hover:text-rose-400"
                title="Remove"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {!locked && (
        <form onSubmit={add} className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add filler (e.g. Snack)"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-16 rounded-lg border border-white/10 bg-ink px-2 py-2 text-right text-sm outline-none focus:border-brand"
          />
          <button className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:brightness-110">
            Add
          </button>
        </form>
      )}

      <p className="mt-3 text-xs text-slate-500">
        {total < 6 ? (
          <span className="text-amber-400">
            Only {total} registered — need at least 6 to guarantee shirts.
          </span>
        ) : 6 + fillerTotal > total ? (
          <span className="text-amber-400">
            Over-subscribed: 6 shirts + {fillerTotal} fillers = {6 + fillerTotal} &gt;{" "}
            {total} people. Reduce filler quantities to lock.
          </span>
        ) : (
          <>
            At lock ({total} people): 6 shirts + {fillerTotal} fillers +{" "}
            <strong>{noPrize}</strong> “No prize”.
          </>
        )}
      </p>
    </section>
  );
}

function ResetPanel() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function doReset() {
    setBusy(true);
    await fetch("/api/admin/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "RESET" }),
    });
    setBusy(false);
    setOpen(false);
    setConfirm("");
  }

  return (
    <section className="mt-10 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5">
      <h2 className="text-sm font-semibold text-rose-300">Danger zone</h2>
      <p className="mt-1 text-xs text-slate-400">
        Reset wipes all registrants, spins, and the prize pool. Irreversible.
      </p>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 rounded-lg border border-rose-500/40 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
        >
          Reset event…
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder='Type "RESET" to confirm'
            className="rounded-lg border border-rose-500/40 bg-ink px-3 py-2 text-sm outline-none"
          />
          <button
            disabled={confirm !== "RESET" || busy}
            onClick={doReset}
            className="rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Resetting…" : "Confirm reset"}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setConfirm("");
            }}
            className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
