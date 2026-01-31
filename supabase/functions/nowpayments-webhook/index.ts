import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

import { corsHeaders } from "../_shared/cors.ts";

interface NowPaymentsIPN {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  order_id: string;
  order_description: string;
  actually_paid: number;
  outcome_amount: number;
  outcome_currency: string;
  created_at: string;
  updated_at: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Generate unique request ID for tracing
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Webhook request received`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get raw body and headers for archival
    const rawBody = await req.text();
    const signature = req.headers.get("x-nowpayments-sig");
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

    // ===== ARCHIVE WEBHOOK IMMEDIATELY =====
    const payload: NowPaymentsIPN = JSON.parse(rawBody);
    await supabase.from("webhook_archive").insert({
      provider: "nowpayments",
      event_type: payload.payment_status || "unknown",
      payload: payload,
      headers: Object.fromEntries(req.headers.entries()),
      signature: signature,
      ip_address: clientIp,
      idempotency_key: `np_${payload.payment_id}_${payload.order_id}`,
    });
    console.log(`[${requestId}] Webhook archived`);

    // ===== CHECK KILL-SWITCH =====
    const { data: depositSwitch } = await supabase.rpc("check_operation_allowed", { p_operation: "deposit" });
    if (!depositSwitch?.allowed) {
      console.log(`[${requestId}] Deposits disabled by kill-switch`);
      await supabase.from("webhook_archive").update({ 
        processing_status: "blocked", 
        error_message: "Deposits disabled" 
      }).eq("idempotency_key", `np_${payload.payment_id}_${payload.order_id}`);
      
      return new Response(
        JSON.stringify({ success: false, message: "Deposits temporarily disabled", request_id: requestId }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if payment mode is set to nowpayments
    const { data: modeData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "payment_mode")
      .maybeSingle();

    if (modeData?.value !== "nowpayments") {
      console.log(`[${requestId}] Payment mode is not nowpayments, ignoring webhook`);
      return new Response(
        JSON.stringify({ success: false, message: "Payment mode is manual", request_id: requestId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get IPN secret from settings
    const { data: ipnData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "nowpayments_ipn_secret")
      .maybeSingle();

    const ipnSecret = ipnData?.value;
    if (!ipnSecret) {
      console.error(`[${requestId}] IPN secret not configured`);
      return new Response(
        JSON.stringify({ success: false, message: "IPN secret not configured", request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== MANDATORY SIGNATURE VERIFICATION =====
    if (!signature) {
      console.error(`[${requestId}] Missing IPN signature - potential attack`);

      await supabase.rpc("log_security_event", {
        p_event_type: "missing_webhook_signature",
        p_severity: "critical",
        p_source: "nowpayments_webhook",
        p_event_data: { payment_id: payload.payment_id, order_id: payload.order_id },
        p_ip_address: clientIp,
        p_request_id: requestId,
      });

      await supabase.from("webhook_archive").update({
        processing_status: "signature_missing",
        signature_verified: false
      }).eq("idempotency_key", `np_${payload.payment_id}_${payload.order_id}`);

      return new Response(
        JSON.stringify({ success: false, message: "Missing signature", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify signature
    const sortedKeys = Object.keys(payload).sort();
    const sortedObj: Record<string, unknown> = {};
    sortedKeys.forEach((key) => {
      sortedObj[key] = payload[key as keyof NowPaymentsIPN];
    });

    const hmac = createHmac("sha512", ipnSecret);
    hmac.update(JSON.stringify(sortedObj));
    const calculatedSig = hmac.digest("hex");

    if (calculatedSig !== signature) {
      console.error(`[${requestId}] Invalid IPN signature`);

      // Log security event for invalid signature
      await supabase.rpc("log_security_event", {
        p_event_type: "invalid_webhook_signature",
        p_severity: "critical",
        p_source: "nowpayments_webhook",
        p_event_data: { payment_id: payload.payment_id, order_id: payload.order_id },
        p_ip_address: clientIp,
        p_request_id: requestId,
      });

      await supabase.from("webhook_archive").update({
        processing_status: "signature_failed",
        signature_verified: false
      }).eq("idempotency_key", `np_${payload.payment_id}_${payload.order_id}`);

      return new Response(
        JSON.stringify({ success: false, message: "Invalid signature", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const signatureVerified = true;
    const requestHash = calculatedSig;

    // Update webhook archive with signature status
    await supabase.from("webhook_archive").update({ 
      signature_verified: signatureVerified,
      processing_status: "processing"
    }).eq("idempotency_key", `np_${payload.payment_id}_${payload.order_id}`);

    console.log(`[${requestId}] NowPayments IPN received:`, payload);

    // Process based on payment status
    if (payload.payment_status === "finished" || payload.payment_status === "confirmed") {
      // order_id format: "deposit_<user_id>_<transaction_id>"
      const orderParts = payload.order_id.split("_");
      if (orderParts.length < 3 || orderParts[0] !== "deposit") {
        console.log(`[${requestId}] Not a deposit order, ignoring`);
        return new Response(
          JSON.stringify({ success: true, message: "Not a deposit order", request_id: requestId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = orderParts[1];
      const transactionId = orderParts[2];

      // ===== IDEMPOTENCY CHECK =====
      // Use payment_id + transaction_id as idempotency key
      const idempotencyKey = `nowpayments_${payload.payment_id}_${transactionId}`;
      
      const { data: idempotencyResult, error: idempotencyError } = await supabase.rpc(
        "check_idempotency",
        {
          p_key: idempotencyKey,
          p_operation: "deposit",
          p_user_id: userId,
          p_request_hash: requestHash,
        }
      );

      if (idempotencyError) {
        console.error(`[${requestId}] Idempotency check failed:`, idempotencyError);
        throw idempotencyError;
      }

      if (idempotencyResult?.duplicate) {
        console.log(`[${requestId}] Duplicate webhook detected, returning cached result`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Already processed (idempotent)", 
            cached_result: idempotencyResult.result,
            request_id: requestId 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        // Get the transaction
        const { data: transaction, error: txError } = await supabase
          .from("transactions")
          .select("*")
          .eq("id", transactionId)
          .eq("user_id", userId)
          .eq("status", "pending")
          .maybeSingle();

        if (txError || !transaction) {
          console.error(`[${requestId}] Transaction not found or already processed:`, txError);

          // Mark idempotency as failed
          await supabase.rpc("complete_idempotency", {
            p_key: idempotencyKey,
            p_operation: "deposit",
            p_status: "failed",
            p_result: { error: "Transaction not found" },
          });

          return new Response(
            JSON.stringify({ success: false, message: "Transaction not found", request_id: requestId }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // ===== SERVER-SIDE DEPOSIT LIMIT ENFORCEMENT =====
        // Check monthly deposit limits per user and per device
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
        const monthlyLimit = 10000; // ₹10,000 monthly limit

        // Get user's monthly deposits
        const { data: monthlyDeposits, error: monthlyError } = await supabase
          .from("transactions")
          .select("amount")
          .eq("user_id", userId)
          .eq("status", "completed")
          .gte("created_at", `${currentMonth}-01T00:00:00.000Z`)
          .lt("created_at", `${currentMonth}-31T23:59:59.999Z`);

        if (monthlyError) {
          console.error(`[${requestId}] Error checking monthly deposits:`, monthlyError);
          await supabase.rpc("complete_idempotency", {
            p_key: idempotencyKey,
            p_operation: "deposit",
            p_status: "failed",
            p_result: { error: "Deposit limit check failed" },
          });
          return new Response(
            JSON.stringify({ success: false, message: "Deposit limit check failed", request_id: requestId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const totalMonthlyDeposits = monthlyDeposits?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
        const projectedTotal = totalMonthlyDeposits + transaction.amount;

        if (projectedTotal > monthlyLimit) {
          console.log(`[${requestId}] Monthly deposit limit exceeded: ${projectedTotal} > ${monthlyLimit}`);

          await supabase.rpc("complete_idempotency", {
            p_key: idempotencyKey,
            p_operation: "deposit",
            p_status: "failed",
            p_result: { error: "Monthly deposit limit exceeded" },
          });

          // Mark transaction as rejected
          await supabase
            .from("transactions")
            .update({
              status: "rejected",
              updated_at: new Date().toISOString(),
              notes: `Monthly limit exceeded: ₹${projectedTotal} > ₹${monthlyLimit}`
            })
            .eq("id", transactionId);

          return new Response(
            JSON.stringify({
              success: false,
              message: `Monthly deposit limit exceeded. Current: ₹${totalMonthlyDeposits}, Requested: ₹${transaction.amount}, Limit: ₹${monthlyLimit}`,
              request_id: requestId
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // ===== ATOMIC BALANCE MUTATION =====
        // Use the mutate_balance RPC for atomic, audited balance changes
        const { data: mutationResult, error: mutationError } = await supabase.rpc(
          "mutate_balance",
          {
            p_user_id: userId,
            p_amount: transaction.amount,
            p_type: "deposit",
            p_source_table: "transactions",
            p_source_id: transactionId,
            p_request_id: requestId,
            p_metadata: {
              payment_id: payload.payment_id,
              coin: transaction.coin,
              pay_amount: payload.pay_amount,
              pay_currency: payload.pay_currency,
            },
          }
        );

        if (mutationError) {
          console.error(`[${requestId}] Balance mutation failed:`, mutationError);
          throw mutationError;
        }

        if (!mutationResult?.success) {
          console.error(`[${requestId}] Balance mutation rejected:`, mutationResult);
          
          await supabase.rpc("complete_idempotency", {
            p_key: idempotencyKey,
            p_operation: "deposit",
            p_status: "failed",
            p_result: mutationResult,
          });
          
          return new Response(
            JSON.stringify({ success: false, message: mutationResult?.error || "Balance update failed", request_id: requestId }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[${requestId}] Balance mutation successful:`, mutationResult);

        // Update transaction to completed
        const { error: updateTxError } = await supabase
          .from("transactions")
          .update({ 
            status: "completed", 
            updated_at: new Date().toISOString() 
          })
          .eq("id", transactionId);

        if (updateTxError) {
          console.error(`[${requestId}] Failed to update transaction status:`, updateTxError);
          // Don't fail the whole operation, balance is already updated
        }

        // Create notification for user
        await supabase.from("notifications").insert({
          user_id: userId,
          title: "Deposit Successful! 🎉",
          message: `Your deposit of ₹${transaction.amount} via ${transaction.coin} has been credited to your account.`,
          type: "deposit",
        });

        // ===== REFERRAL BONUS PROCESSING =====
        // Get user profile to check for referrer
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, referred_by")
          .eq("user_id", userId)
          .maybeSingle();

        if (profile?.referred_by) {
          // Check for unpaid referral bonus
          const { data: referral } = await supabase
            .from("referrals")
            .select("*")
            .eq("referred_id", profile.id)
            .eq("signup_bonus_paid", false)
            .maybeSingle();

          if (referral) {
            // Idempotency for referral bonus
            const referralIdempotencyKey = `referral_bonus_${referral.id}_${transactionId}`;
            
            const { data: refIdempResult } = await supabase.rpc("check_idempotency", {
              p_key: referralIdempotencyKey,
              p_operation: "referral_bonus",
              p_user_id: null,
            });

            if (!refIdempResult?.duplicate) {
              // Pay ₹20 signup bonus + 10% commission on first deposit
              const signupBonus = 20;
              const commissionBonus = Math.floor(transaction.amount * 0.10);
              const totalReferralBonus = signupBonus + commissionBonus;

              // Get referrer's user_id
              const { data: referrerProfile } = await supabase
                .from("profiles")
                .select("user_id")
                .eq("id", referral.referrer_id)
                .maybeSingle();

              if (referrerProfile) {
                // Atomic referral bonus mutation
                const { data: refMutationResult, error: refMutationError } = await supabase.rpc(
                  "mutate_balance",
                  {
                    p_user_id: referrerProfile.user_id,
                    p_amount: totalReferralBonus,
                    p_type: "referral_bonus",
                    p_source_table: "referrals",
                    p_source_id: referral.id,
                    p_request_id: requestId,
                    p_metadata: {
                      referred_user_id: userId,
                      signup_bonus: signupBonus,
                      commission_bonus: commissionBonus,
                      deposit_amount: transaction.amount,
                    },
                  }
                );

                if (!refMutationError && refMutationResult?.success) {
                  // Update referral record
                  await supabase
                    .from("referrals")
                    .update({ 
                      signup_bonus_paid: true,
                      total_earnings: referral.total_earnings + totalReferralBonus
                    })
                    .eq("id", referral.id);

                  // Notify referrer
                  await supabase.from("notifications").insert({
                    user_id: referrerProfile.user_id,
                    title: "Referral Bonus! 💰",
                    message: `You earned ₹${signupBonus} signup bonus + ₹${commissionBonus} (10% commission) from your referral's first deposit!`,
                    type: "referral",
                  });

                  await supabase.rpc("complete_idempotency", {
                    p_key: referralIdempotencyKey,
                    p_operation: "referral_bonus",
                    p_status: "completed",
                    p_result: { amount: totalReferralBonus },
                  });

                  console.log(`[${requestId}] Referral bonus paid: ₹${totalReferralBonus}`);
                } else {
                  console.error(`[${requestId}] Referral bonus mutation failed:`, refMutationError || refMutationResult);
                  await supabase.rpc("complete_idempotency", {
                    p_key: referralIdempotencyKey,
                    p_operation: "referral_bonus",
                    p_status: "failed",
                    p_result: { error: "Mutation failed" },
                  });
                }
              }
            } else {
              console.log(`[${requestId}] Referral bonus already processed (idempotent)`);
            }
          }
        }

        // Mark deposit idempotency as completed
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "deposit",
          p_status: "completed",
          p_result: {
            amount: transaction.amount,
            audit_id: mutationResult.audit_id,
            before_balance: mutationResult.before_balance,
            after_balance: mutationResult.after_balance,
          },
        });

        console.log(`[${requestId}] Deposit processed successfully: User ${userId}, Amount ₹${transaction.amount}`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Deposit processed",
            audit_id: mutationResult.audit_id,
            request_id: requestId 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      } catch (processingError) {
        console.error(`[${requestId}] Processing error:`, processingError);
        
        // Mark idempotency as failed
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "deposit",
          p_status: "failed",
          p_result: { error: processingError instanceof Error ? processingError.message : "Unknown error" },
        });
        
        throw processingError;
      }

    } else if (payload.payment_status === "failed" || payload.payment_status === "expired") {
      // Handle failed/expired payments
      const orderParts = payload.order_id.split("_");
      if (orderParts.length >= 3 && orderParts[0] === "deposit") {
        const transactionId = orderParts[2];
        
        await supabase
          .from("transactions")
          .update({ 
            status: "failed", 
            updated_at: new Date().toISOString() 
          })
          .eq("id", transactionId);
          
        console.log(`[${requestId}] Payment marked as failed/expired: ${transactionId}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Payment failed/expired", request_id: requestId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For other statuses (waiting, confirming, etc.), just acknowledge
    return new Response(
      JSON.stringify({ success: true, message: "Status received", status: payload.payment_status, request_id: requestId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${requestId}] Webhook error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
