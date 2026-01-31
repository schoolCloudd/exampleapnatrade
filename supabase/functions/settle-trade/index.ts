import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface SettleTradeRequest {
  trade_id: string;
  exit_price: number;
  result: "win" | "loss";
}

/**
 * SECURE TRADE SETTLEMENT EDGE FUNCTION
 * 
 * This function handles the atomic settlement of trades with:
 * - JWT verification for user authentication
 * - Idempotency protection (no double-credits)
 * - Atomic balance mutations via RPC
 * - Full audit logging
 * - Race condition prevention
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Trade settlement request received`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ===== JWT VERIFICATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error(`[${requestId}] Missing or invalid authorization header`);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user-context client to verify JWT
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );

    if (claimsError || !claimsData?.claims?.sub) {
      console.error(`[${requestId}] JWT verification failed:`, claimsError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    console.log(`[${requestId}] Authenticated user: ${userId}`);

    // Create service-role client for privileged operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ===== INPUT VALIDATION =====
    const body: SettleTradeRequest = await req.json();
    const { trade_id, exit_price, result } = body;

    if (!trade_id || typeof trade_id !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid trade_id", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof exit_price !== "number" || !Number.isFinite(exit_price) || exit_price <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid exit_price", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (result !== "win" && result !== "loss") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid result, must be win or loss", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== IDEMPOTENCY CHECK =====
    const idempotencyKey = `trade_settle_${trade_id}`;
    
    const { data: idempotencyResult, error: idempotencyError } = await supabase.rpc(
      "check_idempotency",
      {
        p_key: idempotencyKey,
        p_operation: "trade_settlement",
        p_user_id: userId,
        p_request_hash: `${trade_id}_${result}`,
      }
    );

    if (idempotencyError) {
      console.error(`[${requestId}] Idempotency check failed:`, idempotencyError);
      throw idempotencyError;
    }

    if (idempotencyResult?.duplicate) {
      console.log(`[${requestId}] Duplicate settlement detected, returning cached result`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Already processed (idempotent)",
          cached_result: idempotencyResult.result,
          request_id: requestId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      // ===== FETCH TRADE WITH USER VERIFICATION =====
      const { data: trade, error: tradeError } = await supabase
        .from("trades")
        .select("*")
        .eq("id", trade_id)
        .eq("user_id", userId) // CRITICAL: Verify ownership
        .eq("result", "pending") // Only settle pending trades
        .maybeSingle();

      if (tradeError || !trade) {
        console.error(`[${requestId}] Trade not found or already settled:`, tradeError);
        
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "trade_settlement",
          p_status: "failed",
          p_result: { error: "Trade not found or already settled" },
        });

        return new Response(
          JSON.stringify({ success: false, error: "Trade not found or already settled", request_id: requestId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== CALCULATE PNL =====
      let pnl: number;
      let creditAmount: number;
      let mutationType: string;

      if (result === "win") {
        // Win: original stake + profit (stake * return_rate/100)
        const profit = trade.amount * (trade.return_rate / 100);
        pnl = profit;
        creditAmount = trade.amount + profit; // Return stake + winnings
        mutationType = "trade_win";
      } else {
        // Loss: stake was already deducted when bet was placed
        // No balance change needed, just record the loss
        pnl = -trade.amount;
        creditAmount = 0;
        mutationType = "trade_loss";
      }

      console.log(`[${requestId}] Settlement calculation: result=${result}, pnl=${pnl}, creditAmount=${creditAmount}`);

      // ===== ATOMIC BALANCE MUTATION (only for wins) =====
      let mutationResult = null;
      if (creditAmount > 0) {
        const { data: mutation, error: mutationError } = await supabase.rpc(
          "mutate_balance",
          {
            p_user_id: userId,
            p_amount: creditAmount,
            p_type: mutationType,
            p_source_table: "trades",
            p_source_id: trade_id,
            p_request_id: requestId,
            p_metadata: {
              coin_symbol: trade.coin_symbol,
              direction: trade.direction,
              entry_price: trade.entry_price,
              exit_price: exit_price,
              return_rate: trade.return_rate,
              stake: trade.amount,
              profit: pnl,
            },
          }
        );

        if (mutationError) {
          console.error(`[${requestId}] Balance mutation failed:`, mutationError);
          throw mutationError;
        }

        if (!mutation?.success) {
          console.error(`[${requestId}] Balance mutation rejected:`, mutation);
          
          await supabase.rpc("complete_idempotency", {
            p_key: idempotencyKey,
            p_operation: "trade_settlement",
            p_status: "failed",
            p_result: mutation,
          });

          return new Response(
            JSON.stringify({ success: false, error: mutation?.error || "Balance update failed", request_id: requestId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        mutationResult = mutation;
        console.log(`[${requestId}] Balance mutation successful:`, mutation);
      } else {
        // For losses, still log to financial_audit_log manually
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, balance")
          .eq("user_id", userId)
          .maybeSingle();

        if (profile) {
          await supabase.from("financial_audit_log").insert({
            user_id: userId,
            profile_id: profile.id,
            type: mutationType,
            before_balance: profile.balance,
            after_balance: profile.balance, // No change for losses
            amount: 0, // No balance change
            source_table: "trades",
            source_id: trade_id,
            request_id: requestId,
            metadata: {
              coin_symbol: trade.coin_symbol,
              direction: trade.direction,
              entry_price: trade.entry_price,
              exit_price: exit_price,
              stake_lost: trade.amount,
              result: "loss",
            },
          });
        }
      }

      // ===== UPDATE TRADE RECORD =====
      const { error: updateError } = await supabase
        .from("trades")
        .update({
          exit_price: exit_price,
          result: result,
          pnl: pnl,
          closed_at: new Date().toISOString(),
        })
        .eq("id", trade_id);

      if (updateError) {
        console.error(`[${requestId}] Failed to update trade:`, updateError);
        // Don't fail the whole operation, balance is already updated
      }

      // ===== COMPLETE IDEMPOTENCY =====
      await supabase.rpc("complete_idempotency", {
        p_key: idempotencyKey,
        p_operation: "trade_settlement",
        p_status: "completed",
        p_result: {
          result: result,
          pnl: pnl,
          credit_amount: creditAmount,
          audit_id: mutationResult?.audit_id,
          before_balance: mutationResult?.before_balance,
          after_balance: mutationResult?.after_balance,
        },
      });

      console.log(`[${requestId}] Trade settled successfully: ${trade_id}, result=${result}, pnl=${pnl}`);

      return new Response(
        JSON.stringify({
          success: true,
          result: result,
          pnl: pnl,
          new_balance: mutationResult?.after_balance,
          audit_id: mutationResult?.audit_id,
          request_id: requestId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (processingError) {
      console.error(`[${requestId}] Processing error:`, processingError);

      await supabase.rpc("complete_idempotency", {
        p_key: idempotencyKey,
        p_operation: "trade_settlement",
        p_status: "failed",
        p_result: { error: processingError instanceof Error ? processingError.message : "Unknown error" },
      });

      throw processingError;
    }

  } catch (error) {
    console.error(`[${requestId}] Settlement error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
