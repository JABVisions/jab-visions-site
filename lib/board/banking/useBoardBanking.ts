"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PAY_DROP_BANKING_SETTINGS,
  type BankingSnapshot,
  type PayDropBankingSettings,
} from "@/lib/board/banking/status";

export type BankingTransaction = {
  id: string;
  pay_drop_id?: string | null;
  title?: string | null;
  amount_cents: number;
  creator_amount_cents?: number;
  platform_fee_cents?: number;
  currency?: string;
  payment_status: string;
  payout_status?: string;
  payer_id?: string | null;
  created_at: string;
};

export function useBoardBanking() {
  const [snapshot, setSnapshot] = useState<BankingSnapshot | null>(null);
  const [settings, setSettings] = useState<PayDropBankingSettings>(DEFAULT_PAY_DROP_BANKING_SETTINGS);
  const [transactions, setTransactions] = useState<BankingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/paydrops/banking", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Could not load Banking.");
      }
      setSnapshot(data.banking);
      setSettings(data.settings ?? DEFAULT_PAY_DROP_BANKING_SETTINGS);
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Banking.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, settings, setSettings, transactions, loading, error, refresh };
}
