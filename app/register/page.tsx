"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";
import type { EventState, RegisterResult } from "@/lib/types";

type Status = "idle" | "submitting" | "done";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);

  // Watch lock state so the form closes the moment the admin locks.
  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    supabase
      .from("event_state")
      .select("registration_locked")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (active) setLocked((data as EventState | null)?.registration_locked ?? false);
      });

    const channel = supabase
      .channel("register-eventstate")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_state" },
        (payload) => {
          setLocked((payload.new as EventState).registration_locked);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name.");
      return;
    }

    setStatus("submitting");
    const supabase = getSupabase();
    const { data, error: rpcError } = await supabase.rpc("register", {
      p_name: trimmed,
    });

    if (rpcError) {
      setStatus("idle");
      setError("Something went wrong — please try again.");
      return;
    }

    const result = data as RegisterResult;
    if (result.ok) {
      setStatus("done");
      return;
    }

    setStatus("idle");
    if (result.reason === "duplicate") {
      setError("That name's already on the grid — if it's you, you're all set. 🏁");
    } else if (result.reason === "locked") {
      setLocked(true);
    } else {
      setError("Please enter your name.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-white/10 bg-panel p-8 shadow-2xl">
        <header className="text-center">
          <p className="text-xs font-semibold tracking-[0.3em] text-brand">
            ∿ MBITION ∿
          </p>
          <h1 className="mt-1 text-2xl font-bold">The Farewell Raffle</h1>
          <p className="mt-2 text-sm text-slate-400">
            Someone at Mbition is clocking out, and they&apos;re not
            leaving quietly. What it&apos;s for, who&apos;s behind it: strictly
            need-to-know. The wheel, though? Very real. Use a real name or a nickname 
			the host knows — anonymous or unidentifiable entries get removed.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
            <span className="rounded-full bg-white/5 px-3 py-1">🗓️ Fri the 14th</span>
            <span className="rounded-full bg-white/5 px-3 py-1">🕕 18:00</span>
            <span className="rounded-full bg-white/5 px-3 py-1">🍺 draft beers</span>
            <span className="rounded-full bg-white/5 px-3 py-1">🥪 sandwiches</span>
          </div>
        </header>

        {locked ? (
          <p className="mt-6 text-center text-slate-300">
            Grid&apos;s full — registration is closed. Follow the sound of the
            draft tap on Friday at 18:00. <span aria-hidden>🍺</span>
          </p>
        ) : status === "done" ? (
          <div className="mt-6 animate-pop text-center">
            <p className="text-lg font-semibold text-emerald-300">
              You&apos;re on the grid! <span aria-hidden>∿</span>
            </p>
            <p className="mt-1 text-slate-300">
              Friday the 14th, 18:00. Show up thirsty. <span aria-hidden>🍺</span>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm text-slate-400">Your name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. Bratman"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink px-4 py-3 text-lg outline-none focus:border-brand"
                disabled={status === "submitting"}
              />
            </label>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full rounded-xl bg-brand px-4 py-3 text-lg font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {status === "submitting" ? "Revving up…" : "Put me on the grid 🏁"}
            </button>
          </form>
        )}

        {locked === null && (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        )}
      </div>
    </main>
  );
}
