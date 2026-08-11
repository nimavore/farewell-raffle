"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { remainingPrizes, useRaffleData } from "@/lib/useRaffleData";
import {
  buildSegments,
  labelPos,
  landingRotation,
  segmentPath,
  type WheelSegment,
} from "@/lib/wheel";
import type { SpinRpcResult } from "@/lib/types";

type Phase = "pick" | "ready" | "charging" | "spinning" | "result";

const CHARGE_MS = 1600; // time to reach full power

export default function WheelPage() {
  const data = useRaffleData();
  const wheelOpen = data.eventState?.wheel_open ?? false;

  const [phase, setPhase] = useState<Phase>("pick");
  const [selectedId, setSelectedId] = useState("");
  const [power, setPower] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<
    Extract<SpinRpcResult, { ok: true }> | null
  >(null);
  const [spinError, setSpinError] = useState<string | null>(null);

  // Segment layout is frozen when a spin starts so realtime pool updates don't
  // reshuffle the wheel mid-animation.
  const [frozen, setFrozen] = useState<WheelSegment[] | null>(null);

  const rotationRef = useRef(0);
  const chargeStart = useRef(0);
  const chargeRaf = useRef<number | null>(null);
  const spinDuration = useRef(4);

  const liveSegments = useMemo(
    () => buildSegments(remainingPrizes(data.pool)),
    [data.pool]
  );
  const segments = frozen ?? liveSegments;

  const spunIds = useMemo(
    () => new Set(data.results.map((r) => r.registrant_id)),
    [data.results]
  );
  const wonByReg = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data.results) m.set(r.registrant_id, r.prize_name);
    return m;
  }, [data.results]);

  const total = data.registrants.length;
  const spunCount = data.results.length;
  const everyoneSpun = total > 0 && spunCount >= total;

  const stopCharge = useCallback(() => {
    if (chargeRaf.current !== null) {
      cancelAnimationFrame(chargeRaf.current);
      chargeRaf.current = null;
    }
  }, []);

  useEffect(() => () => stopCharge(), [stopCharge]);

  function pick(id: string) {
    setSelectedId(id);
    setResult(null);
    setSpinError(null);
    setPower(0);
    setPhase(id ? "ready" : "pick");
  }

  function beginCharge() {
    if (phase !== "ready") return;
    setPhase("charging");
    chargeStart.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - chargeStart.current;
      const p = Math.min(1, elapsed / CHARGE_MS);
      setPower(p);
      if (p < 1) chargeRaf.current = requestAnimationFrame(tick);
    };
    chargeRaf.current = requestAnimationFrame(tick);
  }

  async function releaseCharge() {
    if (phase !== "charging") return;
    stopCharge();
    const p = power;

    // Freeze the current wheel layout for the animation.
    const layout = liveSegments;
    setFrozen(layout);
    setPhase("spinning");

    // Ask the server for the real outcome.
    let res: SpinRpcResult | null = null;
    try {
      const r = await fetch("/spin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registrantId: selectedId }),
      });
      res = (await r.json()) as SpinRpcResult;
    } catch {
      res = null;
    }

    if (!res || !res.ok) {
      setFrozen(null);
      setPhase("ready");
      setPower(0);
      setSpinError(
        res && !res.ok && res.reason === "already_spun"
          ? "That name has already spun."
          : "Spin failed — try again."
      );
      return;
    }

    // Land on a random slice matching the won prize (names repeat across slices).
    const matches = layout.filter((s) => s.prizeName === res!.prizeName);
    const seg = matches[Math.floor(Math.random() * matches.length)] ?? layout[0];
    spinDuration.current = 3.2 + p * 3.5;
    const next = landingRotation(rotationRef.current, seg, p);
    rotationRef.current = next;
    setRotation(next);
    setResult(res);
    // `onTransitionEnd` on the wheel advances to the result phase.
  }

  function onSpinEnd() {
    if (phase !== "spinning" || !result) return;
    setPhase("result");
    if (result.isNoPrize) {
      // gentle, no confetti
    } else if (result.isShirt) {
      confetti({ particleCount: 220, spread: 100, origin: { y: 0.6 } });
      setTimeout(
        () => confetti({ particleCount: 120, spread: 120, origin: { y: 0.5 } }),
        250
      );
    } else {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
  }

  function nextPerson() {
    setFrozen(null);
    setSelectedId("");
    setResult(null);
    setPower(0);
    setPhase("pick");
  }

  if (!data.ready) {
    return <Screen>Warming up the engine… ∿</Screen>;
  }
  if (!wheelOpen) {
    return (
      <Screen>
        <p className="text-2xl font-semibold">Still in the pit lane… 🏁</p>
        <p className="mt-2 text-slate-400">
          The wheel fires up the moment the mystery host says go. Grab a draft
          beer in the meantime. 🍺
        </p>
      </Screen>
    );
  }
  if (everyoneSpun && phase === "pick") {
    return <EndScreen data={data} />;
  }

  return (
    <main className="no-select mx-auto flex min-h-screen max-w-3xl flex-col items-center px-4 py-8">
      <div className="mb-4 flex w-full items-center justify-between text-sm text-slate-400">
        <span>Mbition · Farewell Raffle ∿</span>
        <span>
          {spunCount} of {total} across the line
        </span>
      </div>

      {phase === "pick" ? (
        <Picker
          registrants={data.registrants}
          spunIds={spunIds}
          wonByReg={wonByReg}
          onPick={pick}
        />
      ) : (
        <div className="flex w-full flex-col items-center">
          <PersonBadge
            name={
              data.registrants.find((r) => r.id === selectedId)?.name ?? ""
            }
            onChange={phase === "ready" ? () => nextPerson() : undefined}
          />

          <Wheel
            segments={segments}
            rotation={rotation}
            durationSec={phase === "spinning" ? spinDuration.current : 0}
            onTransitionEnd={onSpinEnd}
          />

          {spinError && (
            <p className="mt-3 text-sm text-rose-400">{spinError}</p>
          )}

          {(phase === "ready" || phase === "charging") && (
            <ChargeButton
              power={power}
              charging={phase === "charging"}
              onDown={beginCharge}
              onUp={releaseCharge}
            />
          )}

          {phase === "spinning" && (
            <p className="mt-6 h-14 text-lg text-slate-400">Full throttle… 🏎️💨</p>
          )}

          {phase === "result" && result && (
            <ResultCard result={result} onNext={nextPerson} />
          )}
        </div>
      )}
    </main>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {children}
    </main>
  );
}

function Picker({
  registrants,
  spunIds,
  wonByReg,
  onPick,
}: {
  registrants: { id: string; name: string }[];
  spunIds: Set<string>;
  wonByReg: Map<string, string>;
  onPick: (id: string) => void;
}) {
  return (
    <div className="mt-6 w-full max-w-xl">
      <h1 className="text-center text-3xl font-bold">Who&apos;s up next? 🏎️</h1>
      <p className="mt-1 text-center text-slate-400">
        Find your name, then hold the button to rev the wheel.
      </p>
      <div className="mt-6 grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {registrants.map((r) => {
          const spun = spunIds.has(r.id);
          return (
            <button
              key={r.id}
              disabled={spun}
              onClick={() => onPick(r.id)}
              className={
                "rounded-xl border px-3 py-3 text-left transition " +
                (spun
                  ? "cursor-not-allowed border-white/5 bg-white/5 text-slate-500"
                  : "border-white/10 bg-panel hover:border-brand hover:bg-panel/70")
              }
            >
              <div className="truncate font-medium">{r.name}</div>
              {spun && (
                <div className="truncate text-xs text-emerald-400">
                  ✓ Won: {wonByReg.get(r.id)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PersonBadge({
  name,
  onChange,
}: {
  name: string;
  onChange?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="rounded-full bg-brand/20 px-4 py-1.5 text-lg font-semibold text-brand">
        {name}
      </span>
      {onChange && (
        <button
          onClick={onChange}
          className="text-sm text-slate-500 underline hover:text-slate-300"
        >
          wrong driver?
        </button>
      )}
    </div>
  );
}

function Wheel({
  segments,
  rotation,
  durationSec,
  onTransitionEnd,
}: {
  segments: WheelSegment[];
  rotation: number;
  durationSec: number;
  onTransitionEnd: () => void;
}) {
  return (
    <div className="relative aspect-square w-[min(78vw,460px)]">
      {/* fixed pointer at top */}
      <div className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2">
        <div className="h-0 w-0 border-x-[14px] border-t-[24px] border-x-transparent border-t-gold drop-shadow" />
      </div>

      <svg viewBox="0 0 100 100" className="h-full w-full">
        <circle cx="50" cy="50" r="48" fill="#0b0e13" />
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "50px 50px",
            transition: durationSec
              ? `transform ${durationSec}s cubic-bezier(0.15, 0.85, 0.12, 1)`
              : "none",
          }}
          onTransitionEnd={onTransitionEnd}
        >
          {segments.map((s) => {
            // A lone remaining prize fills the whole wheel. An SVG arc from 0°
            // to 360° is degenerate (start === end point) and renders nothing,
            // so draw a full circle instead.
            const full = s.end - s.start >= 359.999;
            const lp = full ? { x: 50, y: 32 } : labelPos(s.mid);
            const short = s.prizeName;
            return (
              <g key={s.key}>
                {full ? (
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill={s.color}
                    stroke="#0b0e13"
                    strokeWidth={0.5}
                  />
                ) : (
                  <path
                    d={segmentPath(s.start, s.end)}
                    fill={s.color}
                    stroke="#0b0e13"
                    strokeWidth={0.5}
                  />
                )}
                <text
                  x={lp.x}
                  y={lp.y}
                  fill="#0b0e13"
                  fontSize={
                    segments.length > 16 ? 2.0 : segments.length > 8 ? 2.5 : 3.4
                  }
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={full ? undefined : `rotate(${s.mid}, ${lp.x}, ${lp.y})`}
                >
                  {short.length > 14 ? short.slice(0, 13) + "…" : short}
                </text>
              </g>
            );
          })}
        </g>
        <circle cx="50" cy="50" r="6" fill="#161b22" stroke="#7c5cff" strokeWidth="1" />
      </svg>
    </div>
  );
}

function ChargeButton({
  power,
  charging,
  onDown,
  onUp,
}: {
  power: number;
  charging: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <div className="mt-6 flex w-full max-w-xs flex-col items-center gap-3">
      <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-gold transition-[width] duration-75"
          style={{ width: `${power * 100}%` }}
        />
      </div>
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          onDown();
        }}
        onPointerUp={onUp}
        onPointerLeave={() => charging && onUp()}
        className="w-full rounded-2xl bg-gold px-6 py-5 text-xl font-bold text-ink shadow-lg transition active:scale-95"
      >
        {charging ? "Release to launch! 🚀" : "Hold to rev 🏎️"}
      </button>
    </div>
  );
}

function ResultCard({
  result,
  onNext,
}: {
  result: Extract<SpinRpcResult, { ok: true }>;
  onNext: () => void;
}) {
  return (
    <div className="mt-6 flex animate-pop flex-col items-center text-center">
      <div className="text-5xl">
        {result.isShirt ? "👕" : result.isNoPrize ? "😅" : "🎁"}
      </div>
      <p className="mt-2 text-slate-400">
        {result.isNoPrize ? "The wheel chose… nothing 😅" : "The wheel has spoken —"}
      </p>
      <p className="text-3xl font-extrabold">
        {result.isNoPrize ? "No prize" : result.prizeName}
      </p>
      {result.isNoPrize && (
        <p className="mt-1 text-sm text-slate-500">
          Good news: the draft beer doesn&apos;t require winning. 🍺
        </p>
      )}
      <button
        onClick={onNext}
        className="mt-6 rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:brightness-110"
      >
        Next driver →
      </button>
    </div>
  );
}

function EndScreen({
  data,
}: {
  data: ReturnType<typeof useRaffleData>;
}) {
  const nameById = new Map(data.registrants.map((r) => [r.id, r.name]));
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-4xl font-bold">Checkered flag! 🏁</h1>
      <p className="mt-2 text-slate-400">
        Every driver&apos;s crossed the line. Final standings — now go refill
        that beer. 🍺
      </p>
      <ul className="mx-auto mt-8 max-w-md space-y-2 text-left">
        {data.results.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-panel px-4 py-3"
          >
            <span className="font-medium">{nameById.get(r.registrant_id)}</span>
            <span className={r.is_shirt ? "text-gold" : "text-slate-300"}>
              {r.is_shirt ? "👕 " : r.is_noprize ? "😅 " : "🎁 "}
              {r.prize_name}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
