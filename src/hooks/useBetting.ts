import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Type for mutate_balance RPC result
interface MutateBalanceResult {
  success: boolean;
  error?: string;
  before_balance?: number;
  after_balance?: number;
  amount?: number;
  audit_id?: string;
}

interface BetData {
  tradeId: string;
  amount: number;
  direction: "up" | "down";
  entryPrice: number;
  returnRate: number;
  candleStartTime: number;
  candleEndTime: number;
  coinSymbol: string;
  coinName: string;
  timeframe: number;
}

interface ActiveBetData extends BetData {
  upTotalBet: number;
  downTotalBet: number;
}

interface MarketBets {
  [candleKey: string]: {
    up: number;
    down: number;
    bettors: string[]; // user IDs who bet on this candle
  };
}

/**
 * Custom hook for handling betting with proper database integration
 * Uses mutate_balance RPC for atomic balance changes
 */
export const useBetting = (userId?: string) => {
  const [activeBet, setActiveBet] = useState<ActiveBetData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Place a bet - deducts amount from balance atomically
   */
  const placeBet = useCallback(async (
    amount: number,
    direction: "up" | "down",
    coinSymbol: string,
    coinName: string,
    timeframe: number,
    entryPrice: number,
    returnRate: number
  ): Promise<{ success: boolean; error?: string; tradeId?: string }> => {
    if (!userId) {
      return { success: false, error: "User not authenticated" };
    }

    if (isProcessing) {
      return { success: false, error: "Processing previous bet" };
    }

    if (activeBet) {
      return { success: false, error: "Wait for current trade to complete" };
    }

    setIsProcessing(true);

    try {
      const requestId = crypto.randomUUID();
      const now = Date.now();
      const candleEndTime = Math.ceil(now / (timeframe * 1000)) * timeframe * 1000;
      const candleStartTime = candleEndTime - timeframe * 1000;
      
      // Generate a candle key for market bets tracking
      const candleKey = `${coinSymbol}_${timeframe}_${candleEndTime}`;

      // Step 1: Deduct balance using atomic RPC
      const { data: deductData, error: deductError } = await supabase.rpc(
        "mutate_balance",
        {
          p_user_id: userId,
          p_amount: -amount, // Negative to deduct
          p_type: "trade_bet",
          p_source_table: "trades",
          p_request_id: requestId,
          p_metadata: {
            coin_symbol: coinSymbol,
            direction: direction,
            timeframe: timeframe,
            entry_price: entryPrice,
            candle_key: candleKey,
          },
        }
      );

      // Cast to proper type
      const deductResult = deductData as unknown as MutateBalanceResult | null;

      if (deductError || !deductResult?.success) {
        console.error("Balance deduction failed:", deductError || deductResult?.error);
        setIsProcessing(false);
        return { 
          success: false, 
          error: deductResult?.error || deductError?.message || "Insufficient balance" 
        };
      }

      // Step 2: Create trade record
      const { data: tradeData, error: tradeError } = await supabase
        .from("trades")
        .insert({
          user_id: userId,
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
        console.error("Trade creation failed:", tradeError);
        // Refund the deducted amount
        await supabase.rpc("mutate_balance", {
          p_user_id: userId,
          p_amount: amount,
          p_type: "refund",
          p_request_id: requestId + "_refund",
          p_metadata: { reason: "Trade creation failed" },
        });
        setIsProcessing(false);
        return { success: false, error: "Failed to create trade" };
      }

      // Step 3: Simulate market totals (in production this would be aggregated from real bets)
      const upTotalBet = direction === "up"
        ? amount * (10 + Math.random() * 20)
        : amount * (1 + Math.random() * 5);
      const downTotalBet = direction === "down"
        ? amount * (10 + Math.random() * 20)
        : amount * (1 + Math.random() * 5);

      // Set active bet
      setActiveBet({
        tradeId: tradeData.id,
        amount,
        direction,
        entryPrice,
        returnRate,
        candleStartTime,
        candleEndTime,
        coinSymbol,
        coinName,
        timeframe,
        upTotalBet,
        downTotalBet,
      });

      setIsProcessing(false);
      return { success: true, tradeId: tradeData.id };

    } catch (error) {
      console.error("Bet placement error:", error);
      setIsProcessing(false);
      return { success: false, error: "Unexpected error placing bet" };
    }
  }, [userId, isProcessing, activeBet]);

  /**
   * Settle bet - called when candle closes
   * Determines win/loss based on rigged logic and updates balance
   */
  const settleBet = useCallback(async (
    exitPrice: number
  ): Promise<{ success: boolean; result?: "win" | "loss"; pnl?: number; newBalance?: number }> => {
    if (!userId || !activeBet) {
      return { success: false };
    }

    const bet = activeBet;
    setActiveBet(null); // Clear active bet immediately
    setIsProcessing(true);

    try {
      const requestId = crypto.randomUUID();

      // Determine win/loss based on actual price movement
      const priceChange = exitPrice - bet.entryPrice;
      let userWins: boolean;

      if (bet.direction === "up") {
        userWins = priceChange > 0; // Win if price went up
      } else {
        userWins = priceChange < 0; // Win if price went down
      }

      const result: "win" | "loss" = userWins ? "win" : "loss";
      let pnl: number;
      let creditAmount: number;

      if (result === "win") {
        // Win: return stake + profit (stake * return_rate/100)
        const profit = bet.amount * (bet.returnRate / 100);
        pnl = profit;
        creditAmount = bet.amount + profit; // Total return = stake + profit

        // Credit winnings to balance using atomic RPC
        const { data: creditData, error: creditError } = await supabase.rpc(
          "mutate_balance",
          {
            p_user_id: userId,
            p_amount: creditAmount,
            p_type: "trade_win",
            p_source_table: "trades",
            p_source_id: bet.tradeId,
            p_request_id: requestId,
            p_metadata: {
              coin_symbol: bet.coinSymbol,
              direction: bet.direction,
              entry_price: bet.entryPrice,
              exit_price: exitPrice,
              return_rate: bet.returnRate,
              stake: bet.amount,
              profit: pnl,
            },
          }
        );

        // Cast to proper type
        const creditResult = creditData as unknown as MutateBalanceResult | null;

        if (creditError || !creditResult?.success) {
          console.error("Win credit failed:", creditError || creditResult?.error);
          // Still mark trade as win even if balance update fails (edge case)
        }

        // Update trade record
        await supabase
          .from("trades")
          .update({
            exit_price: exitPrice,
            result: "win",
            pnl: pnl,
            closed_at: new Date().toISOString(),
          })
          .eq("id", bet.tradeId);

        setIsProcessing(false);
        return { 
          success: true, 
          result: "win", 
          pnl: pnl,
          newBalance: creditResult?.after_balance,
        };

      } else {
        // Loss: stake was already deducted, no balance change needed
        pnl = -bet.amount;

        // Update trade record
        await supabase
          .from("trades")
          .update({
            exit_price: exitPrice,
            result: "loss",
            pnl: pnl,
            closed_at: new Date().toISOString(),
          })
          .eq("id", bet.tradeId);

        setIsProcessing(false);
        return { 
          success: true, 
          result: "loss", 
          pnl: pnl,
        };
      }

    } catch (error) {
      console.error("Settlement error:", error);
      setIsProcessing(false);
      return { success: false };
    }
  }, [userId, activeBet]);

  /**
   * Update simulated market totals (for visual display)
   */
  const updateMarketTotals = useCallback((upDelta: number, downDelta: number) => {
    if (!activeBet) return;
    
    setActiveBet(prev => {
      if (!prev) return prev;
      
      let up = prev.upTotalBet + upDelta;
      let down = prev.downTotalBet + downDelta;

      // Keep user's side heavier so the "more money loses" rig remains consistent
      if (prev.direction === "up" && up <= down) up = down + prev.amount;
      if (prev.direction === "down" && down <= up) down = up + prev.amount;

      return {
        ...prev,
        upTotalBet: Math.max(0, up),
        downTotalBet: Math.max(0, down),
      };
    });
  }, [activeBet]);

  /**
   * Clear active bet (for cleanup)
   */
  const clearActiveBet = useCallback(() => {
    setActiveBet(null);
  }, []);

  return {
    activeBet,
    isProcessing,
    placeBet,
    settleBet,
    updateMarketTotals,
    clearActiveBet,
  };
};

export default useBetting;
