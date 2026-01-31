import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type AdminActionType = 
  | "manual_credit"
  | "manual_debit"
  | "block_user"
  | "unblock_user"
  | "approve_deposit"
  | "reject_deposit"
  | "approve_withdrawal"
  | "reject_withdrawal";

interface AdminActionRequest {
  action: AdminActionType;
  target_user_id: string;
  amount?: number;
  transaction_id?: string;
  reason?: string;
}

/**
 * SECURE ADMIN ACTION EDGE FUNCTION
 * 
 * Handles all privileged admin operations with:
 * - Admin role verification via has_role()
 * - Full audit logging via log_admin_action()
 * - Atomic balance mutations via mutate_balance()
 * - Idempotency protection
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Admin action request received`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ===== JWT VERIFICATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error(`[${requestId}] Missing authorization header`);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized", request_id: requestId }),
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
      console.error(`[${requestId}] JWT verification failed:`, claimsError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminUserId = claimsData.claims.sub as string;
    console.log(`[${requestId}] Admin user: ${adminUserId}`);

    // Create service-role client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ===== ADMIN ROLE VERIFICATION =====
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      console.error(`[${requestId}] User ${adminUserId} is not an admin`);
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required", request_id: requestId }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== INPUT VALIDATION =====
    const body: AdminActionRequest = await req.json();
    const { action, target_user_id, amount, transaction_id, reason } = body;

    if (!action || !target_user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: action, target_user_id", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validActions: AdminActionType[] = [
      "manual_credit", "manual_debit", "block_user", "unblock_user",
      "approve_deposit", "reject_deposit", "approve_withdrawal", "reject_withdrawal"
    ];

    if (!validActions.includes(action)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid action. Valid: ${validActions.join(", ")}`, request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate amount for credit/debit actions
    if ((action === "manual_credit" || action === "manual_debit") && 
        (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid positive amount required for credit/debit", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate transaction_id for transaction actions
    if ((action.includes("deposit") || action.includes("withdrawal")) && !transaction_id) {
      return new Response(
        JSON.stringify({ success: false, error: "transaction_id required for deposit/withdrawal actions", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== IDEMPOTENCY CHECK =====
    const idempotencyKey = transaction_id 
      ? `admin_${action}_${transaction_id}`
      : `admin_${action}_${target_user_id}_${Date.now().toString().slice(0, -3)}`; // 1-second granularity for manual actions
    
    const { data: idempotencyResult } = await supabase.rpc("check_idempotency", {
      p_key: idempotencyKey,
      p_operation: `admin_${action}`,
      p_user_id: adminUserId,
    });

    if (idempotencyResult?.duplicate) {
      console.log(`[${requestId}] Duplicate admin action detected`);
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

    // ===== FETCH TARGET USER PROFILE =====
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", target_user_id)
      .maybeSingle();

    if (profileError || !targetProfile) {
      console.error(`[${requestId}] Target user not found:`, profileError);
      return new Response(
        JSON.stringify({ success: false, error: "Target user not found", request_id: requestId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: Record<string, unknown> = {};
    const beforeState = { ...targetProfile };

    try {
      switch (action) {
        case "manual_credit": {
          const { data: mutation, error: mutationError } = await supabase.rpc("mutate_balance", {
            p_user_id: target_user_id,
            p_amount: amount!,
            p_type: "admin_credit",
            p_source_table: "admin_actions",
            p_source_id: null,
            p_request_id: requestId,
            p_metadata: { admin_user_id: adminUserId, reason },
          });

          if (mutationError || !mutation?.success) {
            throw new Error(mutation?.error || mutationError?.message || "Credit failed");
          }

          // Also update total_deposit for manual credits
          await supabase.from("profiles").update({
            total_deposit: targetProfile.total_deposit + amount!,
          }).eq("user_id", target_user_id);

          // Create transaction record
          await supabase.from("transactions").insert({
            user_id: target_user_id,
            type: "deposit",
            amount: amount!,
            status: "completed",
            coin: "ADMIN",
          });

          result = {
            credited: amount,
            before_balance: mutation.before_balance,
            after_balance: mutation.after_balance,
            audit_id: mutation.audit_id,
          };
          break;
        }

        case "manual_debit": {
          const { data: mutation, error: mutationError } = await supabase.rpc("mutate_balance", {
            p_user_id: target_user_id,
            p_amount: -amount!, // Negative for debit
            p_type: "admin_debit",
            p_source_table: "admin_actions",
            p_source_id: null,
            p_request_id: requestId,
            p_metadata: { admin_user_id: adminUserId, reason },
          });

          if (mutationError || !mutation?.success) {
            throw new Error(mutation?.error || mutationError?.message || "Debit failed");
          }

          // Create transaction record
          await supabase.from("transactions").insert({
            user_id: target_user_id,
            type: "withdraw",
            amount: amount!,
            status: "completed",
            coin: "ADMIN",
          });

          result = {
            debited: amount,
            before_balance: mutation.before_balance,
            after_balance: mutation.after_balance,
            audit_id: mutation.audit_id,
          };
          break;
        }

        case "block_user":
        case "unblock_user": {
          const blocked = action === "block_user";
          await supabase.from("profiles").update({ blocked }).eq("user_id", target_user_id);
          result = { blocked };
          break;
        }

        case "approve_deposit": {
          const { data: tx } = await supabase
            .from("transactions")
            .select("*")
            .eq("id", transaction_id)
            .eq("type", "deposit")
            .eq("status", "pending")
            .maybeSingle();

          if (!tx) {
            throw new Error("Deposit transaction not found or already processed");
          }

          // Atomic credit
          const { data: mutation, error: mutationError } = await supabase.rpc("mutate_balance", {
            p_user_id: tx.user_id,
            p_amount: tx.amount,
            p_type: "deposit",
            p_source_table: "transactions",
            p_source_id: transaction_id,
            p_request_id: requestId,
            p_metadata: { approved_by: adminUserId, coin: tx.coin },
          });

          if (mutationError || !mutation?.success) {
            throw new Error(mutation?.error || mutationError?.message || "Deposit credit failed");
          }

          await supabase.from("transactions").update({
            status: "completed",
            updated_at: new Date().toISOString(),
          }).eq("id", transaction_id);

          // Notify user
          await supabase.from("notifications").insert({
            user_id: tx.user_id,
            title: "Deposit Successful! 🎉",
            message: `Your deposit of ₹${tx.amount} has been credited.`,
            type: "deposit",
          });

          result = {
            approved: true,
            amount: tx.amount,
            audit_id: mutation.audit_id,
          };
          break;
        }

        case "reject_deposit": {
          await supabase.from("transactions").update({
            status: "failed",
            updated_at: new Date().toISOString(),
          }).eq("id", transaction_id);

          const { data: tx } = await supabase
            .from("transactions")
            .select("user_id, amount")
            .eq("id", transaction_id)
            .maybeSingle();

          if (tx) {
            await supabase.from("notifications").insert({
              user_id: tx.user_id,
              title: "Deposit Failed",
              message: `Your deposit of ₹${tx.amount} could not be verified. Please contact support.`,
              type: "deposit",
            });
          }

          result = { rejected: true, reason };
          break;
        }

        case "approve_withdrawal": {
          const { data: tx } = await supabase
            .from("transactions")
            .select("*")
            .eq("id", transaction_id)
            .eq("type", "withdraw")
            .eq("status", "pending")
            .maybeSingle();

          if (!tx) {
            throw new Error("Withdrawal transaction not found or already processed");
          }

          // Deduct balance
          const { data: mutation, error: mutationError } = await supabase.rpc("mutate_balance", {
            p_user_id: tx.user_id,
            p_amount: -tx.amount,
            p_type: "withdrawal",
            p_source_table: "transactions",
            p_source_id: transaction_id,
            p_request_id: requestId,
            p_metadata: { approved_by: adminUserId, wallet_address: tx.wallet_address, coin: tx.coin },
          });

          if (mutationError || !mutation?.success) {
            throw new Error(mutation?.error || mutationError?.message || "Withdrawal debit failed");
          }

          await supabase.from("transactions").update({
            status: "completed",
            updated_at: new Date().toISOString(),
          }).eq("id", transaction_id);

          await supabase.from("notifications").insert({
            user_id: tx.user_id,
            title: "Withdrawal Sent! 🚀",
            message: `Your withdrawal of ₹${tx.amount} has been processed.`,
            type: "withdraw",
          });

          result = {
            approved: true,
            amount: tx.amount,
            audit_id: mutation.audit_id,
          };
          break;
        }

        case "reject_withdrawal": {
          const { data: tx } = await supabase
            .from("transactions")
            .select("*")
            .eq("id", transaction_id)
            .eq("type", "withdraw")
            .eq("status", "pending")
            .maybeSingle();

          if (!tx) {
            throw new Error("Withdrawal not found");
          }

          // No balance change - withdrawal was not yet deducted
          await supabase.from("transactions").update({
            status: "failed",
            updated_at: new Date().toISOString(),
          }).eq("id", transaction_id);

          await supabase.from("notifications").insert({
            user_id: tx.user_id,
            title: "Withdrawal Rejected",
            message: `Your withdrawal of ₹${tx.amount} was rejected. ${reason || "Please contact support."}`,
            type: "withdraw",
          });

          result = { rejected: true, reason };
          break;
        }
      }

      // ===== LOG ADMIN ACTION =====
      const afterProfile = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", target_user_id)
        .maybeSingle();

      await supabase.rpc("log_admin_action", {
        p_admin_user_id: adminUserId,
        p_action_type: action,
        p_target_user_id: target_user_id,
        p_target_table: transaction_id ? "transactions" : "profiles",
        p_target_id: transaction_id || targetProfile.id,
        p_before_state: beforeState,
        p_after_state: afterProfile?.data || result,
        p_reason: reason,
        p_request_id: requestId,
      });

      // ===== COMPLETE IDEMPOTENCY =====
      await supabase.rpc("complete_idempotency", {
        p_key: idempotencyKey,
        p_operation: `admin_${action}`,
        p_status: "completed",
        p_result: result,
      });

      console.log(`[${requestId}] Admin action completed: ${action} on user ${target_user_id}`);

      return new Response(
        JSON.stringify({ success: true, action, result, request_id: requestId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (processingError) {
      console.error(`[${requestId}] Processing error:`, processingError);

      await supabase.rpc("complete_idempotency", {
        p_key: idempotencyKey,
        p_operation: `admin_${action}`,
        p_status: "failed",
        p_result: { error: processingError instanceof Error ? processingError.message : "Unknown error" },
      });

      // Still log the failed action
      await supabase.rpc("log_admin_action", {
        p_admin_user_id: adminUserId,
        p_action_type: `${action}_failed`,
        p_target_user_id: target_user_id,
        p_target_table: "profiles",
        p_target_id: targetProfile.id,
        p_before_state: beforeState,
        p_after_state: { error: processingError instanceof Error ? processingError.message : "Unknown error" },
        p_reason: reason,
        p_request_id: requestId,
      });

      throw processingError;
    }

  } catch (error) {
    console.error(`[${requestId}] Admin action error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
