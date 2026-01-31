import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Trade {
  id: string;
  user_id: string;
  coin_symbol: string;
  coin_name: string;
  timeframe: number;
  direction: "up" | "down";
  amount: number;
  entry_price: number;
  exit_price: number | null;
  return_rate: number;
  result: "win" | "loss" | "pending" | null;
  pnl: number | null;
  created_at: string;
  closed_at: string | null;
}

interface ActiveTrade extends Trade {
  endTime: number;
  currentPrice: number;
}

// Global state for active trade
let globalActiveTrade: ActiveTrade | null = null;
let globalUserId: string | undefined;
let globalOnBalanceChange: ((balance: number) => void) | undefined;
let globalOnTradeComplete: ((trade: any, result: "win" | "loss", exitPrice: number, pnl: number) => void) | undefined;
let listeners: ((trade: ActiveTrade | null) => void)[] = [];

const notifyListeners = (trade: ActiveTrade | null) => {
  listeners.forEach(listener => listener(trade));
};

export const initializeGlobalTrades = (
  userId: string | undefined,
  onBalanceChange?: (balance: number) => void,
  onTradeComplete?: (trade: any, result: "win" | "loss", exitPrice: number, pnl: number) => void
) => {
  globalUserId = userId;
  globalOnBalanceChange = onBalanceChange;
  globalOnTradeComplete = onTradeComplete;

  // Check for pending trades
  checkPendingTrades();
};

const checkPendingTrades = async () => {
  if (!globalUserId) return;

  const { data: pendingTrades } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", globalUserId)
    .eq("result", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  if (pendingTrades && pendingTrades.length > 0) {
    const trade = pendingTrades[0] as Trade;
    const createdAt = new Date(trade.created_at);
    const durationMs = trade.timeframe * 1000;
    const endTime = createdAt.getTime() + durationMs;

    // If trade hasn't ended yet, restore it
    if (endTime > Date.now()) {
      globalActiveTrade = {
        ...trade,
        direction: trade.direction as "up" | "down",
        endTime,
        currentPrice: trade.entry_price,
      };
      notifyListeners(globalActiveTrade);
      startTradeMonitoring();
    } else {
      // Trade should have ended, settle it
      await settleTrade(trade, trade.entry_price);
    }
  }
};

let monitoringInterval: NodeJS.Timeout | null = null;

const startTradeMonitoring = () => {
  if (monitoringInterval) clearInterval(monitoringInterval);

  monitoringInterval = setInterval(async () => {
    if (globalActiveTrade && Date.now() >= globalActiveTrade.endTime) {
      await settleTrade(globalActiveTrade, globalActiveTrade.currentPrice);
      globalActiveTrade = null;
      notifyListeners(null);
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }
    }
  }, 1000);
};

const settleTrade = async (trade: Trade | ActiveTrade, exitPrice: number) => {
  try {
    // Determine win/loss based on price movement
    const priceChange = exitPrice - trade.entry_price;
    let userWins: boolean;

    if (trade.direction === "up") {
      userWins = priceChange > 0;
    } else {
      userWins = priceChange < 0;
    }

    const result: "win" | "loss" = userWins ? "win" : "loss";
    let pnl: number;
    let creditAmount: number;

    if (result === "win") {
      const profit = trade.amount * (trade.return_rate / 100);
      pnl = profit;
      creditAmount = trade.amount + profit;
    } else {
      pnl = -trade.amount;
      creditAmount = 0;
    }

    // Call settlement function
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/settle-trade`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          trade_id: trade.id,
          exit_price: exitPrice,
          result,
        }),
      }
    );

    if (response.ok) {
      // Show global notification
      if (result === "win") {
        const totalPayout = trade.amount + pnl;
        toast.success(`🎉 Trade Finished! You won ₹${totalPayout.toFixed(2)}`, {
          description: `${trade.direction === "up" ? "Long" : "Short"} ${trade.coin_symbol} closed with +${trade.return_rate}% return`,
        });
      } else {
        toast.error(`Trade Finished - Loss`, {
          description: `Lost ₹${trade.amount.toFixed(2)} on ${trade.coin_symbol}`,
        });
      }

      // Notify parent component
      globalOnTradeComplete?.(trade, result, exitPrice, pnl);

      // Refresh balance
      globalOnBalanceChange?.(0);
    }
    } catch (error) {
      console.error("Settlement error occurred");
    }
};

export const placeGlobalBet = async (
  amount: number,
  direction: "up" | "down",
  coinSymbol: string,
  coinName: string,
  timeframe: number,
  entryPrice: number,
  returnRate: number
): Promise<{ success: boolean; error?: string; tradeId?: string }> => {
  if (!globalUserId) {
    return { success: false, error: "User not authenticated" };
  }

  if (globalActiveTrade) {
    return { success: false, error: "Wait for current trade to complete" };
  }

  try {
    // Deduct balance first
    const { data: deductResult, error: deductError } = await supabase.rpc(
      "mutate_balance",
      {
        p_user_id: globalUserId,
        p_amount: -amount,
        p_type: "trade_bet",
        p_request_id: crypto.randomUUID(),
        p_metadata: {
          coin_symbol: coinSymbol,
          direction: direction,
          timeframe: timeframe,
          entry_price: entryPrice,
        },
      }
    );

    const deductData = deductResult as { success: boolean; error?: string } | null;
    if (deductError || !deductData?.success) {
      return { success: false, error: deductData?.error || "Insufficient balance" };
    }

    // Create trade record
    const { data: tradeData, error: tradeError } = await supabase
      .from("trades")
      .insert({
        user_id: globalUserId,
        coin_symbol: coinSymbol,
        coin_name: coinName,
        timeframe: timeframe,
        direction: direction,
        amount: amount,
        entry_price: entryPrice,
        return_rate: returnRate,
        result: "pending",
      })
      .select()
      .single();

    if (tradeError || !tradeData) {
      // Refund balance
      await supabase.rpc("mutate_balance", {
        p_user_id: globalUserId,
        p_amount: amount,
        p_type: "refund",
        p_request_id: crypto.randomUUID(),
        p_metadata: { reason: "Trade creation failed" },
      });
      return { success: false, error: "Failed to create trade" };
    }

    // Set active trade
    const endTime = Date.now() + (timeframe * 1000);
    globalActiveTrade = {
      ...tradeData,
      direction: tradeData.direction as "up" | "down",
      result: tradeData.result as "win" | "loss" | "pending" | null,
      endTime,
      currentPrice: entryPrice,
    };
    notifyListeners(globalActiveTrade);
    startTradeMonitoring();

    return { success: true, tradeId: tradeData.id };
  } catch (error) {
    return { success: false, error: "Unexpected error placing bet" };
  }
};

export const updateGlobalPrice = (price: number) => {
  if (globalActiveTrade) {
    globalActiveTrade.currentPrice = price;
  }
};

export const settleActiveTrade = async () => {
  if (globalActiveTrade) {
    const tradeToSettle = globalActiveTrade;
    globalActiveTrade = null;
    notifyListeners(null);
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    await settleTrade(tradeToSettle, tradeToSettle.currentPrice);
  }
};

export const useGlobalTrades = () => {
  const [activeTrade, setActiveTrade] = useState<ActiveTrade | null>(globalActiveTrade);

  useEffect(() => {
    const listener = (trade: ActiveTrade | null) => setActiveTrade(trade);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, []);

  return {
    activeTrade,
    placeBet: placeGlobalBet,
    updateCurrentPrice: updateGlobalPrice,
  };
};
