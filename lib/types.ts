export type Registrant = {
  id: string;
  name: string;
  name_norm: string;
  registered_at: string;
  seq: number;
  has_spun: boolean;
};

export type PrizeConfigRow = {
  id: string;
  name: string;
  quantity: number;
  is_shirt: boolean;
  sort: number;
};

export type PrizePoolSlot = {
  id: string;
  prize_name: string;
  is_shirt: boolean;
  is_noprize: boolean;
  claimed: boolean;
  claimed_by: string | null;
};

export type SpinResult = {
  id: string;
  registrant_id: string;
  prize_name: string;
  is_shirt: boolean;
  is_noprize: boolean;
  spun_at: string;
  seq: number;
};

export type EventState = {
  id: number;
  registration_locked: boolean;
  wheel_open: boolean;
};

// jsonb payloads returned by the RPCs
export type RegisterResult =
  | { ok: true; id: string; name: string; seq: number }
  | { ok: false; reason: "empty" | "locked" | "duplicate" };

export type LockResult =
  | { ok: true; n: number; shirts: number; fillers: number; noprize: number }
  | {
      ok: false;
      reason: "too_few" | "oversubscribed";
      message: string;
      n: number;
      shirts?: number;
      fillers?: number;
    };

export type SpinRpcResult =
  | {
      ok: true;
      prizeName: string;
      isShirt: boolean;
      isNoPrize: boolean;
      seq: number;
    }
  | {
      ok: false;
      reason:
        | "wheel_closed"
        | "unknown_registrant"
        | "already_spun"
        | "pool_empty";
    };

// Aggregated remaining prize, derived client-side from prize_pool.
export type RemainingPrize = {
  prizeName: string;
  isShirt: boolean;
  isNoPrize: boolean;
  count: number;
};
