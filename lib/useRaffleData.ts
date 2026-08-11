"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabaseClient";
import type {
  EventState,
  PrizeConfigRow,
  PrizePoolSlot,
  Registrant,
  RemainingPrize,
  SpinResult,
} from "./types";

export type RaffleData = {
  ready: boolean;
  registrants: Registrant[];
  prizeConfig: PrizeConfigRow[];
  pool: PrizePoolSlot[];
  results: SpinResult[];
  eventState: EventState | null;
};

const empty: RaffleData = {
  ready: false,
  registrants: [],
  prizeConfig: [],
  pool: [],
  results: [],
  eventState: null,
};

// Loads all raffle tables once and keeps them live via a single realtime
// channel. Shared by the monitor and wheel pages.
export function useRaffleData(): RaffleData {
  const [data, setData] = useState<RaffleData>(empty);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    async function reloadAll() {
      const [regs, cfg, pool, results, state] = await Promise.all([
        supabase.from("registrants").select("*").order("seq"),
        supabase.from("prize_config").select("*").order("sort"),
        supabase.from("prize_pool").select("*"),
        supabase.from("spin_results").select("*").order("seq"),
        supabase.from("event_state").select("*").eq("id", 1).single(),
      ]);
      if (!active) return;
      setData({
        ready: true,
        registrants: (regs.data as Registrant[]) ?? [],
        prizeConfig: (cfg.data as PrizeConfigRow[]) ?? [],
        pool: (pool.data as PrizePoolSlot[]) ?? [],
        results: (results.data as SpinResult[]) ?? [],
        eventState: (state.data as EventState) ?? null,
      });
    }

    reloadAll();

    // Any change to any table simply triggers a full reload — the dataset is
    // tiny (an event of a few dozen people) so this is simpler and race-free
    // versus surgically patching local state.
    const channel = supabase
      .channel("raffle-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "registrants" }, reloadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "prize_config" }, reloadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "prize_pool" }, reloadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "spin_results" }, reloadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_state" }, reloadAll)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return data;
}

// Aggregate unclaimed pool slots into wheel segments.
export function remainingPrizes(pool: PrizePoolSlot[]): RemainingPrize[] {
  const map = new Map<string, RemainingPrize>();
  for (const slot of pool) {
    if (slot.claimed) continue;
    const existing = map.get(slot.prize_name);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(slot.prize_name, {
        prizeName: slot.prize_name,
        isShirt: slot.is_shirt,
        isNoPrize: slot.is_noprize,
        count: 1,
      });
    }
  }
  // Shirts first, then fillers, then "No prize" last.
  return [...map.values()].sort((a, b) => {
    if (a.isShirt !== b.isShirt) return a.isShirt ? -1 : 1;
    if (a.isNoPrize !== b.isNoPrize) return a.isNoPrize ? 1 : -1;
    return a.prizeName.localeCompare(b.prizeName);
  });
}
