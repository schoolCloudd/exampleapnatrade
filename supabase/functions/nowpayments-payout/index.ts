import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface PayoutRequest {
  transactionId: string;
}

interface NowPaymentsPayoutResponse {
  id: string;
  status: string;
  address: string;
  currency: string;
  amount: number;
  error?: string;
}

/**
 * SECURE NOWPAYMENTS PAYOUT EDGE FUNCTION
 * 
 * Hardened with:
 * - Admin JWT verification
 * - Idempotency protection (no double-payouts)
 * - Atomic balance mutations via RPC
 * - Full audit logging
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Payout request received`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ===== JWT VERIFICATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );

    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid token", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminUserId = claimsData.claims.sub as string;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ===== ADMIN ROLE CHECK =====
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, message: "Admin access required", request_id: requestId }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== CHECK KILL-SWITCH =====
    const { data: withdrawSwitch } = await supabase.rpc("check_operation_allowed", { p_operation: "withdraw" });
    if (!withdrawSwitch?.allowed) {
      console.log(`[${requestId}] Withdrawals disabled by kill-switch`);
      return new Response(
        JSON.stringify({ success: false, message: "Withdrawals temporarily disabled", request_id: requestId }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== CHECK PAYMENT MODE =====
    const { data: modeData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_mode")
      .maybeSingle();

    if (modeData?.value !== "nowpayments") {
      return new Response(
        JSON.stringify({ success: false, message: "Payment mode is manual", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== GET API KEY =====
    const { data: apiKeyData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "nowpayments_api_key")
      .maybeSingle();

    const apiKey = apiKeyData?.value;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, message: "NowPayments API key not configured", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== PARSE REQUEST =====
    const { transactionId }: PayoutRequest = await req.json();

    if (!transactionId || typeof transactionId !== "string") {
      return new Response(
        JSON.stringify({ success: false, message: "Valid transaction ID required", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== IDEMPOTENCY CHECK =====
    const idempotencyKey = `payout_${transactionId}`;
    
    const { data: idempotencyResult, error: idempotencyError } = await supabase.rpc(
      "check_idempotency",
      {
        p_key: idempotencyKey,
        p_operation: "payout",
        p_user_id: adminUserId,
      }
    );

    if (idempotencyError) {
      console.error(`[${requestId}] Idempotency check failed:`, idempotencyError);
      throw idempotencyError;
    }

    if (idempotencyResult?.duplicate) {
      console.log(`[${requestId}] Duplicate payout detected`);
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
      // ===== GET WITHDRAWAL TRANSACTION =====
      const { data: transaction, error: txError } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .eq("type", "withdraw")
        .eq("status", "pending")
        .maybeSingle();

      if (txError || !transaction) {
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "payout",
          p_status: "failed",
          p_result: { error: "Withdrawal not found or already processed" },
        });
        return new Response(
          JSON.stringify({ success: false, message: "Withdrawal not found or already processed", request_id: requestId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!transaction.wallet_address) {
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "payout",
          p_status: "failed",
          p_result: { error: "Wallet address not provided" },
        });
        return new Response(
          JSON.stringify({ success: false, message: "Wallet address not provided", request_id: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== GET USER PROFILE =====
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", transaction.user_id)
        .maybeSingle();

      if (!profile) {
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "payout",
          p_status: "failed",
          p_result: { error: "User profile not found" },
        });
        return new Response(
          JSON.stringify({ success: false, message: "User profile not found", request_id: requestId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== BALANCE CHECK =====
      if (profile.balance < transaction.amount) {
        await supabase.from("transactions").update({ 
          status: "failed", 
          updated_at: new Date().toISOString() 
        }).eq("id", transactionId);

        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "payout",
          p_status: "failed",
          p_result: { error: "Insufficient balance" },
        });

        return new Response(
          JSON.stringify({ success: false, message: "Insufficient user balance", request_id: requestId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== CHECK CIRCUIT BREAKER =====
      const { data: circuitCheck } = await supabase.rpc("check_payout_circuit_breaker", { 
        p_amount: transaction.amount 
      });
      
      if (!circuitCheck?.allowed) {
        console.log(`[${requestId}] Circuit breaker triggered:`, circuitCheck);
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "payout",
          p_status: "failed",
          p_result: { error: "Circuit breaker triggered", details: circuitCheck },
        });
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: "Payout limit reached. Please try again later.", 
            remaining: circuitCheck?.remaining,
            request_id: requestId 
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== CURRENCY MAPPING =====
      const coinMapping: Record<string, string> = {
        "USDT": "usdttrc20", "BTC": "btc", "ETH": "eth", "BNB": "bnbbsc",
        "SOL": "sol", "TRX": "trx", "USDC": "usdcerc20", "XRP": "xrp",
        "ADA": "ada", "DOGE": "doge", "DOT": "dot", "MATIC": "maticmainnet",
        "LTC": "ltc", "SHIB": "shib", "AVAX": "avaxc", "ATOM": "atom",
        "LINK": "link", "UNI": "uni", "XLM": "xlm", "BCH": "bch",
        "NEAR": "near", "APT": "apt", "FIL": "fil", "ARB": "arb", "OP": "op",
      };

      const currency = coinMapping[transaction.coin || "USDT"] || "usdttrc20";

      // ===== GET EXCHANGE RATE =====
      const rateResponse = await fetch(
        `https://api.nowpayments.io/v1/estimate?amount=${transaction.amount}&currency_from=inr&currency_to=${currency}`,
        { headers: { "x-api-key": apiKey } }
      );

      if (!rateResponse.ok) {
        const rateError = await rateResponse.text();
        console.error(`[${requestId}] Rate estimation failed:`, rateError);
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "payout",
          p_status: "failed",
          p_result: { error: "Failed to get exchange rate" },
        });
        return new Response(
          JSON.stringify({ success: false, message: "Failed to get exchange rate", request_id: requestId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rateData = await rateResponse.json();
      const cryptoAmount = rateData.estimated_amount;

      // ===== ATOMIC BALANCE DEDUCTION =====
      const { data: mutationResult, error: mutationError } = await supabase.rpc(
        "mutate_balance",
        {
          p_user_id: transaction.user_id,
          p_amount: -transaction.amount, // Negative for debit
          p_type: "withdrawal",
          p_source_table: "transactions",
          p_source_id: transactionId,
          p_request_id: requestId,
          p_metadata: {
            payout_currency: currency,
            crypto_amount: cryptoAmount,
            wallet_address: transaction.wallet_address,
            approved_by: adminUserId,
          },
        }
      );

      if (mutationError || !mutationResult?.success) {
        console.error(`[${requestId}] Balance mutation failed:`, mutationError || mutationResult);
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "payout",
          p_status: "failed",
          p_result: { error: mutationResult?.error || "Balance deduction failed" },
        });
        return new Response(
          JSON.stringify({ success: false, message: mutationResult?.error || "Balance deduction failed", request_id: requestId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[${requestId}] Balance deducted:`, mutationResult);

      // ===== CALL NOWPAYMENTS PAYOUT API =====
      const payoutResponse = await fetch("https://api.nowpayments.io/v1/payout", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          withdrawals: [{
            address: transaction.wallet_address,
            currency: currency,
            amount: cryptoAmount,
            ipn_callback_url: `${supabaseUrl}/functions/v1/nowpayments-payout-webhook`,
            extra_id: transactionId,
          }],
        }),
      });

      const payoutData: NowPaymentsPayoutResponse = await payoutResponse.json();

      if (!payoutResponse.ok || payoutData.error) {
        console.error(`[${requestId}] NowPayments payout failed:`, payoutData);
        
        // CRITICAL: Refund the balance since payout failed
        const { error: refundError } = await supabase.rpc("mutate_balance", {
          p_user_id: transaction.user_id,
          p_amount: transaction.amount, // Positive to credit back
          p_type: "refund",
          p_source_table: "transactions",
          p_source_id: transactionId,
          p_request_id: requestId,
          p_metadata: { reason: "NowPayments payout failed", error: payoutData.error },
        });

        if (refundError) {
          console.error(`[${requestId}] CRITICAL: Refund failed! Manual intervention needed:`, refundError);
        }

        await supabase.from("transactions").update({
          status: "failed",
          updated_at: new Date().toISOString(),
        }).eq("id", transactionId);

        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "payout",
          p_status: "failed",
          p_result: { error: payoutData.error || "Payout failed", refunded: !refundError },
        });

        return new Response(
          JSON.stringify({ success: false, message: payoutData.error || "Payout failed", request_id: requestId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== SUCCESS: UPDATE TRANSACTION =====
      await supabase.from("transactions").update({
        status: "completed",
        updated_at: new Date().toISOString(),
      }).eq("id", transactionId);

      // ===== LOG ADMIN ACTION =====
      await supabase.rpc("log_admin_action", {
        p_admin_user_id: adminUserId,
        p_action_type: "nowpayments_payout",
        p_target_user_id: transaction.user_id,
        p_target_table: "transactions",
        p_target_id: transactionId,
        p_before_state: { balance: profile.balance, status: "pending" },
        p_after_state: { 
          balance: mutationResult.after_balance, 
          status: "completed",
          payout_id: payoutData.id,
          crypto_amount: cryptoAmount,
        },
        p_reason: `NowPayments payout: ${cryptoAmount} ${currency}`,
        p_request_id: requestId,
      });

      // ===== NOTIFY USER =====
      await supabase.from("notifications").insert({
        user_id: transaction.user_id,
        title: "Withdrawal Sent! 🚀",
        message: `Your withdrawal of ₹${transaction.amount} in ${transaction.coin} has been sent to your wallet.`,
        type: "withdraw",
      });

      // ===== COMPLETE IDEMPOTENCY =====
      await supabase.rpc("complete_idempotency", {
        p_key: idempotencyKey,
        p_operation: "payout",
        p_status: "completed",
        p_result: {
          payout_id: payoutData.id,
          crypto_amount: cryptoAmount,
          currency: currency,
          audit_id: mutationResult.audit_id,
        },
      });

      console.log(`[${requestId}] Payout successful: ${cryptoAmount} ${currency}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Payout initiated successfully",
          payoutId: payoutData.id,
          cryptoAmount: cryptoAmount,
          currency: currency,
          request_id: requestId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (processingError) {
      console.error(`[${requestId}] Processing error:`, processingError);
      
      await supabase.rpc("complete_idempotency", {
        p_key: idempotencyKey,
        p_operation: "payout",
        p_status: "failed",
        p_result: { error: processingError instanceof Error ? processingError.message : "Unknown error" },
      });

      throw processingError;
    }

  } catch (error) {
    console.error(`[${requestId}] Payout error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
