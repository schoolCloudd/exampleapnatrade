import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Verify Telegram initData signature
async function verifyTelegramAuth(initData: string, botToken: string): Promise<{ valid: boolean; user?: TelegramUser }> {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    
    if (!hash) {
      console.error("[TelegramAuth] No hash in initData");
      return { valid: false };
    }
    
    // Remove hash from data for verification
    urlParams.delete("hash");
    
    // Sort parameters alphabetically
    const dataCheckArr: string[] = [];
    const sortedParams = [...urlParams.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [key, value] of sortedParams) {
      dataCheckArr.push(`${key}=${value}`);
    }
    const dataCheckString = dataCheckArr.join("\n");
    
    // Create secret key from bot token
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const secretHash = await crypto.subtle.sign(
      "HMAC",
      secretKey,
      encoder.encode(botToken)
    );
    
    // Create HMAC key from secret hash
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      secretHash,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    // Calculate HMAC of data check string
    const signature = await crypto.subtle.sign(
      "HMAC",
      hmacKey,
      encoder.encode(dataCheckString)
    );
    
    // Convert to hex
    const calculatedHash = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    
    if (calculatedHash !== hash) {
      console.error("[TelegramAuth] Hash mismatch");
      return { valid: false };
    }
    
    // Check auth_date is not too old (allow 24 hours)
    const authDate = parseInt(urlParams.get("auth_date") || "0");
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      console.error("[TelegramAuth] Auth data expired");
      return { valid: false };
    }
    
    // Parse user data
    const userDataStr = urlParams.get("user");
    if (!userDataStr) {
      console.error("[TelegramAuth] No user data in initData");
      return { valid: false };
    }
    
    const user = JSON.parse(userDataStr) as TelegramUser;
    return { valid: true, user };
    
  } catch (error) {
    console.error("[TelegramAuth] Verification error:", error);
    return { valid: false };
  }
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { initData, action } = await req.json();
    
    if (!initData) {
      return new Response(
        JSON.stringify({ error: "Missing initData" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      console.error("[TelegramAuth] TELEGRAM_BOT_TOKEN not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Verify Telegram signature
    const verification = await verifyTelegramAuth(initData, botToken);
    
    if (!verification.valid || !verification.user) {
      return new Response(
        JSON.stringify({ error: "Invalid Telegram authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const telegramUser = verification.user;
    console.log("[TelegramAuth] Verified user:", telegramUser.id, telegramUser.first_name);
    
    // Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Generate email from Telegram ID (for Supabase auth)
    const telegramEmail = `telegram_${telegramUser.id}@apnatrade.telegram`;
    const telegramPassword = `tg_${telegramUser.id}_${botToken.slice(-16)}`;
    
    // Check if user exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === telegramEmail);
    
    let userId: string;
    let isNewUser = false;
    
    if (existingUser) {
      // User exists, sign them in
      userId = existingUser.id;
      console.log("[TelegramAuth] Existing user found:", userId);
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: telegramEmail,
        password: telegramPassword,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          full_name: `${telegramUser.first_name}${telegramUser.last_name ? ` ${telegramUser.last_name}` : ""}`,
          avatar_url: telegramUser.photo_url,
        },
      });
      
      if (createError || !newUser.user) {
        console.error("[TelegramAuth] Failed to create user:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create user account" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      userId = newUser.user.id;
      isNewUser = true;
      console.log("[TelegramAuth] New user created:", userId);
      
      // Create profile for new user
      const displayName = telegramUser.username || 
        `${telegramUser.first_name}${telegramUser.last_name ? ` ${telegramUser.last_name}` : ""}`;
      
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          user_id: userId,
          name: displayName,
          avatar_url: telegramUser.photo_url || null,
        });
      
      if (profileError) {
        console.error("[TelegramAuth] Failed to create profile:", profileError);
        // Don't fail the auth, profile can be created later
      }
    }
    
    // Return credentials for client-side sign in
    // (Supabase Admin API doesn't have createSession, so we use credentials approach)
    return new Response(
      JSON.stringify({
        success: true,
        userId,
        isNewUser,
        telegramUser: {
          id: telegramUser.id,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          username: telegramUser.username,
          photoUrl: telegramUser.photo_url,
        },
        authMethod: "credentials",
        email: telegramEmail,
        password: telegramPassword,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("[TelegramAuth] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
