import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTelegramWebApp } from "./useTelegramWebApp";

interface TelegramAuthState {
  isAuthenticating: boolean;
  isAuthenticated: boolean;
  error: string | null;
  telegramUser: {
    id: number;
    firstName: string;
    lastName?: string;
    username?: string;
    photoUrl?: string;
  } | null;
}

export const useTelegramAuth = () => {
  const { isTelegram, isReady, getInitData, user: tgUser } = useTelegramWebApp();
  const [state, setState] = useState<TelegramAuthState>({
    isAuthenticating: false, // Don't start authenticating by default
    isAuthenticated: false,
    error: null,
    telegramUser: null,
  });

  const authenticateWithTelegram = useCallback(async () => {
    if (!isTelegram || !isReady) {
      console.log("[TelegramAuth] Not in Telegram or not ready");
      return { success: false, error: "Not in Telegram" };
    }

    const initData = getInitData();
    if (!initData) {
      console.log("[TelegramAuth] No initData available");
      return { success: false, error: "No Telegram data" };
    }

    setState(prev => ({ ...prev, isAuthenticating: true, error: null }));

    try {
      console.log("[TelegramAuth] Calling telegram-auth edge function...");
      
      const { data, error } = await supabase.functions.invoke("telegram-auth", {
        body: { initData },
      });

      if (error) {
        console.error("[TelegramAuth] Edge function error:", error);
        setState(prev => ({
          ...prev,
          isAuthenticating: false,
          error: error.message || "Authentication failed",
        }));
        return { success: false, error: error.message };
      }

      if (!data?.success) {
        const errorMsg = data?.error || "Authentication failed";
        console.error("[TelegramAuth] Auth failed:", errorMsg);
        setState(prev => ({
          ...prev,
          isAuthenticating: false,
          error: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }

      console.log("[TelegramAuth] Auth successful, method:", data.authMethod);

      // Handle authentication based on method
      if (data.authMethod === "session" && data.session) {
        // Set session directly
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (setSessionError) {
          console.error("[TelegramAuth] Set session error:", setSessionError);
          // Fall back to credentials
          if (data.email && data.password) {
            await supabase.auth.signInWithPassword({
              email: data.email,
              password: data.password,
            });
          }
        }
      } else if (data.authMethod === "credentials" && data.email && data.password) {
        // Sign in with email/password
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

        if (signInError) {
          console.error("[TelegramAuth] Sign in error:", signInError);
          setState(prev => ({
            ...prev,
            isAuthenticating: false,
            error: signInError.message,
          }));
          return { success: false, error: signInError.message };
        }
      }

      setState({
        isAuthenticating: false,
        isAuthenticated: true,
        error: null,
        telegramUser: data.telegramUser,
      });

      return { 
        success: true, 
        isNewUser: data.isNewUser,
        telegramUser: data.telegramUser,
      };

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("[TelegramAuth] Exception:", err);
      setState(prev => ({
        ...prev,
        isAuthenticating: false,
        error: errorMsg,
      }));
      return { success: false, error: errorMsg };
    }
  }, [isTelegram, isReady, getInitData]);

  // Handle authentication logic
  useEffect(() => {
    const isLocalhost = window.location.hostname === 'localhost';
    const hasInitData = !!getInitData();
    console.log("[TelegramAuth] Effect triggered:", {
      isTelegram,
      isReady,
      hasInitData,
      isLocalhost,
      isAuthenticated: state.isAuthenticated,
      isAuthenticating: state.isAuthenticating
    });

    // If already authenticated or authenticating, do nothing
    if (state.isAuthenticated || state.isAuthenticating) {
      console.log("[TelegramAuth] Already authenticated or authenticating, skipping");
      return;
    }

    // If not ready, wait
    if (!isReady) {
      console.log("[TelegramAuth] Not ready yet, waiting");
      return;
    }

    // Check for Telegram initData - if present and valid, try Telegram auth
    if (isTelegram && hasInitData) {
      // In Telegram with valid initData - try to authenticate
      console.log("[TelegramAuth] In Telegram with initData, checking session...");
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          console.log("[TelegramAuth] Found existing session in Telegram");
          setState(prev => ({
            ...prev,
            isAuthenticated: true,
            telegramUser: tgUser ? {
              id: tgUser.id,
              firstName: tgUser.first_name,
              lastName: tgUser.last_name,
              username: tgUser.username,
              photoUrl: tgUser.photo_url,
            } : null,
          }));
        } else {
          console.log("[TelegramAuth] No session in Telegram, authenticating...");
          authenticateWithTelegram();
        }
      });
    } else {
      // Normal browser mode - check for existing session or allow email login
      console.log("[TelegramAuth] Normal browser mode, checking session...");
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          console.log("[TelegramAuth] Found existing session");
          setState(prev => ({
            ...prev,
            isAuthenticated: true,
            telegramUser: null,
          }));
        } else {
          console.log("[TelegramAuth] No session, enabling email auth");
          // No session - stop authenticating and allow email login
          setState(prev => ({
            ...prev,
            isAuthenticating: false,
            error: null,
          }));
        }
      });
    }
  }, [isTelegram, isReady, tgUser, state.isAuthenticated, state.isAuthenticating, getInitData]);

  // Global timeout for authentication attempts
  useEffect(() => {
    if (state.isAuthenticating) {
      const timeout = setTimeout(() => {
        console.log("[TelegramAuth] Authentication timeout, showing fallback");
        setState(prev => ({
          ...prev,
          isAuthenticating: false,
          error: "Authentication timeout. Please try refreshing or contact support.",
        }));
      }, 10000); // 10 second timeout

      return () => clearTimeout(timeout);
    }
  }, [state.isAuthenticating]);

  return {
    ...state,
    isTelegram,
    authenticateWithTelegram,
  };
};

export default useTelegramAuth;
