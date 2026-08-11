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
      setError("That name's already registered — if this is you, you're all set!");
    } else if (result.reason === "locked") {
      setLocked(true);
    } else {
      setError("Please enter your name.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-white/10 bg-panel p-8 shadow-2xl">
        <h1 className="text-2xl font-bold">Farewell Raffle</h1>

        {locked ? (
          <p className="mt-4 text-slate-300">
            Registration is closed — see you tonight! <span aria-hidden>🎉</span>
          </p>
        ) : status === "done" ? (
          <div className="mt-4 animate-pop">
            <p className="text-lg font-semibold text-emerald-300">You&apos;re in!</p>
            <p className="mt-1 text-slate-300">See you on the last day <span aria-hidden>🍻</span></p>
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
                placeholder="e.g. Alex Rivera"
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
              {status === "submitting" ? "Adding you…" : "Count me in"}
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
