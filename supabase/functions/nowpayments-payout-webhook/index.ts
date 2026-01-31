import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

import { corsHeaders } from "../_shared/cors.ts";

interface NowPaymentsPayoutIPN {
  id: string;
  status: string;
  address: string;
  currency: string;
  amount: number;
  hash?: string;
  extra_id?: string; // This contains our transactionId
  error?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * NOWPAYMENTS PAYOUT WEBHOOK HANDLER
 * 
 * This handles automatic withdrawal confirmation from NowPayments.
 * When a payout is confirmed on the blockchain, NowPayments sends this webhook.
 * 
 * Flow:
 * 1. User requests withdrawal → transaction created (pending)
 * 2. Admin approves → nowpayments-payout deducts balance, calls NowPayments API
 * 3. NowPayments processes payout on blockchain
 * 4. NowPayments sends this webhook → we update transaction to completed
 * 
 * For fully automatic (no admin approval):
 * - Set auto_approve_withdrawals = true in platform_settings
 * - Withdrawals under max_auto_withdrawal_amount are auto-processed
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Payout webhook received`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.text();
    const signature = req.headers.get("x-nowpayments-sig");
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

    const payload: NowPaymentsPayoutIPN = JSON.parse(rawBody);

    // ===== ARCHIVE WEBHOOK IMMEDIATELY =====
    await supabase.from("webhook_archive").insert({
      provider: "nowpayments_payout",
      event_type: payload.status || "unknown",
      payload: payload,
      headers: Object.fromEntries(req.headers.entries()),
      signature: signature,
      ip_address: clientIp,
      idempotency_key: `payout_webhook_${payload.id}_${payload.extra_id}`,
    });
    console.log(`[${requestId}] Payout webhook archived`);

    // ===== GET IPN SECRET =====
    const { data: ipnData } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "nowpayments_ipn_secret")
      .maybeSingle();

    const ipnSecret = ipnData?.value;
    let signatureVerified = false;

    // ===== VERIFY SIGNATURE =====
    if (signature && ipnSecret) {
      const sortedKeys = Object.keys(payload).sort();
      const sortedObj: Record<string, unknown> = {};
      sortedKeys.forEach((key) => {
        sortedObj[key] = payload[key as keyof NowPaymentsPayoutIPN];
      });

      const hmac = createHmac("sha512", ipnSecret);
      hmac.update(JSON.stringify(sortedObj));
      const calculatedSig = hmac.digest("hex");

      if (calculatedSig !== signature) {
        console.error(`[${requestId}] Invalid payout webhook signature`);
        
        await supabase.rpc("log_security_event", {
          p_event_type: "invalid_payout_webhook_signature",
          p_severity: "warning",
          p_source: "nowpayments_payout_webhook",
          p_event_data: { payout_id: payload.id, extra_id: payload.extra_id },
          p_ip_address: clientIp,
          p_request_id: requestId,
        });

        await supabase.from("webhook_archive").update({
          processing_status: "signature_failed",
          signature_verified: false,
        }).eq("idempotency_key", `payout_webhook_${payload.id}_${payload.extra_id}`);

        return new Response(
          JSON.stringify({ success: false, message: "Invalid signature", request_id: requestId }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      signatureVerified = true;
    }

    // Update archive with verification status
    await supabase.from("webhook_archive").update({
      signature_verified: signatureVerified,
      processing_status: "processing",
    }).eq("idempotency_key", `payout_webhook_${payload.id}_${payload.extra_id}`);

    console.log(`[${requestId}] Payout webhook payload:`, payload);

    // ===== IDEMPOTENCY CHECK =====
    const idempotencyKey = `payout_confirm_${payload.id}_${payload.extra_id}`;
    
    const { data: idempotencyResult } = await supabase.rpc("check_idempotency", {
      p_key: idempotencyKey,
      p_operation: "payout_confirm",
    });

    if (idempotencyResult?.duplicate) {
      console.log(`[${requestId}] Duplicate payout confirmation, already processed`);
      return new Response(
        JSON.stringify({ success: true, message: "Already processed", request_id: requestId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // extra_id contains our transaction ID
    const transactionId = payload.extra_id;
    if (!transactionId) {
      console.log(`[${requestId}] No transaction ID in payout webhook`);
      await supabase.from("webhook_archive").update({
        processing_status: "no_transaction_id",
        error_message: "Missing extra_id",
      }).eq("idempotency_key", `payout_webhook_${payload.id}_${payload.extra_id}`);
      
      return new Response(
        JSON.stringify({ success: false, message: "No transaction ID", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== PROCESS BASED ON STATUS =====
    if (payload.status === "FINISHED" || payload.status === "finished") {
      // Payout confirmed on blockchain
      const { data: transaction } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .maybeSingle();

      if (!transaction) {
        console.log(`[${requestId}] Transaction not found: ${transactionId}`);
        await supabase.rpc("complete_idempotency", {
          p_key: idempotencyKey,
          p_operation: "payout_confirm",
          p_status: "failed",
          p_result: { error: "Transaction not found" },
        });
        return new Response(
          JSON.stringify({ success: false, message: "Transaction not found", request_id: requestId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update transaction if not already completed
      if (transaction.status !== "completed") {
        await supabase.from("transactions").update({
          status: "completed",
          updated_at: new Date().toISOString(),
        }).eq("id", transactionId);

        // Notify user
        await supabase.from("notifications").insert({
          user_id: transaction.user_id,
          title: "Withdrawal Confirmed! ✅",
          message: `Your withdrawal of ₹${transaction.amount} has been confirmed on the blockchain. TX: ${payload.hash || "N/A"}`,
          type: "withdraw",
        });

        console.log(`[${requestId}] Payout confirmed: ${transactionId}, hash: ${payload.hash}`);
      }

      await supabase.from("webhook_archive").update({
        processing_status: "completed",
        processed_at: new Date().toISOString(),
      }).eq("idempotency_key", `payout_webhook_${payload.id}_${payload.extra_id}`);

      await supabase.rpc("complete_idempotency", {
        p_key: idempotencyKey,
        p_operation: "payout_confirm",
        p_status: "completed",
        p_result: { hash: payload.hash, amount: payload.amount },
      });

      return new Response(
        JSON.stringify({ success: true, message: "Payout confirmed", request_id: requestId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (payload.status === "FAILED" || payload.status === "failed" || payload.status === "EXPIRED") {
      // Payout failed - need to refund user
      const { data: transaction } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .maybeSingle();

      if (transaction && transaction.status !== "failed") {
        // Refund the balance
        const { error: refundError } = await supabase.rpc("mutate_balance", {
          p_user_id: transaction.user_id,
          p_amount: transaction.amount, // Positive to credit back
          p_type: "refund",
          p_source_table: "transactions",
          p_source_id: transactionId,
          p_request_id: requestId,
          p_metadata: { reason: "Payout failed", payout_id: payload.id, error: payload.error },
        });

        if (refundError) {
          console.error(`[${requestId}] CRITICAL: Refund failed!`, refundError);
          await supabase.rpc("log_security_event", {
            p_event_type: "payout_refund_failed",
            p_severity: "critical",
            p_source: "nowpayments_payout_webhook",
            p_event_data: { transaction_id: transactionId, error: refundError.message },
            p_user_id: transaction.user_id,
            p_request_id: requestId,
          });
        } else {
          console.log(`[${requestId}] Refund successful for failed payout: ${transactionId}`);
        }

        await supabase.from("transactions").update({
          status: "failed",
          updated_at: new Date().toISOString(),
        }).eq("id", transactionId);

        await supabase.from("notifications").insert({
          user_id: transaction.user_id,
          title: "Withdrawal Failed ❌",
          message: `Your withdrawal of ₹${transaction.amount} failed. The amount has been refunded to your wallet.`,
          type: "withdraw",
        });
      }

      await supabase.from("webhook_archive").update({
        processing_status: "failed",
        error_message: payload.error || "Payout failed",
        processed_at: new Date().toISOString(),
      }).eq("idempotency_key", `payout_webhook_${payload.id}_${payload.extra_id}`);

      await supabase.rpc("complete_idempotency", {
        p_key: idempotencyKey,
        p_operation: "payout_confirm",
        p_status: "failed",
        p_result: { error: payload.error, refunded: true },
      });

      return new Response(
        JSON.stringify({ success: true, message: "Payout failure processed, refunded", request_id: requestId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For other statuses (PROCESSING, CONFIRMING, etc.)
    await supabase.from("webhook_archive").update({
      processing_status: "acknowledged",
    }).eq("idempotency_key", `payout_webhook_${payload.id}_${payload.extra_id}`);

    console.log(`[${requestId}] Payout status update: ${payload.status}`);
    return new Response(
      JSON.stringify({ success: true, message: "Status received", status: payload.status, request_id: requestId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${requestId}] Payout webhook error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
