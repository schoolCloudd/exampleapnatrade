import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Rate limit configurations per action type
const RATE_LIMITS: Record<string, { windowSeconds: number; maxRequests: number }> = {
  auth_attempt: { windowSeconds: 300, maxRequests: 5 },      // 5 attempts per 5 minutes
  bet_place: { windowSeconds: 60, maxRequests: 10 },          // 10 bets per minute
  deposit_request: { windowSeconds: 3600, maxRequests: 10 },  // 10 deposits per hour
  withdrawal_request: { windowSeconds: 3600, maxRequests: 5 },// 5 withdrawals per hour
  api_call: { windowSeconds: 60, maxRequests: 100 },          // 100 API calls per minute
};

interface RateLimitRequest {
  action: string;
  userId?: string;
  ipAddress?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    const body: RateLimitRequest = await req.json();
    const { action, userId, ipAddress } = body;

    // Validate action type
    if (!action || !RATE_LIMITS[action]) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid action type",
          valid_actions: Object.keys(RATE_LIMITS)
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Must have at least one identifier
    if (!userId && !ipAddress) {
      return new Response(
        JSON.stringify({ error: "Either userId or ipAddress is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const limits = RATE_LIMITS[action];
    const results: Array<{ identifier: string; type: string; result: unknown }> = [];

    // Check rate limit for user ID
    if (userId) {
      const { data: userResult, error: userError } = await supabase.rpc("check_rate_limit", {
        p_identifier: userId,
        p_identifier_type: "user_id",
        p_action: action,
        p_window_seconds: limits.windowSeconds,
        p_limit_max: limits.maxRequests,
      });

      if (userError) {
        console.error("Rate limit check error (user):", userError);
        throw userError;
      }

      results.push({ identifier: userId, type: "user_id", result: userResult });

      // If user is blocked, return immediately
      if (!userResult.allowed) {
        console.log(`Rate limit exceeded for user ${userId} on action ${action}:`, userResult);
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: userResult.reason,
            blocked_until: userResult.blocked_until,
            abuse_score: userResult.abuse_score,
            identifier_type: "user_id",
            action,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check rate limit for IP address
    if (ipAddress) {
      const { data: ipResult, error: ipError } = await supabase.rpc("check_rate_limit", {
        p_identifier: ipAddress,
        p_identifier_type: "ip_address",
        p_action: action,
        p_window_seconds: limits.windowSeconds,
        p_limit_max: limits.maxRequests * 2, // IP limits are 2x user limits
      });

      if (ipError) {
        console.error("Rate limit check error (IP):", ipError);
        throw ipError;
      }

      results.push({ identifier: ipAddress, type: "ip_address", result: ipResult });

      // If IP is blocked, return immediately
      if (!ipResult.allowed) {
        console.log(`Rate limit exceeded for IP ${ipAddress} on action ${action}:`, ipResult);
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: ipResult.reason,
            blocked_until: ipResult.blocked_until,
            abuse_score: ipResult.abuse_score,
            identifier_type: "ip_address",
            action,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // All checks passed
    const response = {
      allowed: true,
      action,
      limits: {
        window_seconds: limits.windowSeconds,
        max_requests: limits.maxRequests,
      },
      usage: results.map((r) => ({
        identifier_type: r.type,
        count: (r.result as { count?: number }).count,
        limit: (r.result as { limit?: number }).limit,
      })),
    };

    console.log(`Rate limit check passed for action ${action}:`, response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Rate limiter error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Rate limit check failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
