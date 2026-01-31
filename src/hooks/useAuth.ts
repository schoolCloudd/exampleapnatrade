import { useState, useEffect, useCallback, useMemo } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  name: string;
  balance: number;
  total_deposit: number;
  total_bet: number;
  referral_code: string;
  referred_by: string | null;
  referral_earnings: number;
  avatar_url?: string;
}

interface AuthCallbacks {
  onNewAccountCreated?: (name: string) => void;
  onLogin?: (name: string) => void;
}

let authCallbacks: AuthCallbacks = {};

export const setAuthCallbacks = (callbacks: AuthCallbacks) => {
  authCallbacks = callbacks;
};

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[useAuth] Error fetching profile:", error);
        return null;
      }

      if (data) {
        setProfile(data as Profile);
        return data as Profile;
      }
      
      // No profile found - this is expected for new users
      return null;
    } catch (err) {
      console.error("[useAuth] Exception fetching profile:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Track if this is a sign-up event
        if (event === 'SIGNED_IN') {
          // Check if user just signed up (no profile yet indicates new user)
          setIsNewUser(false);
        }

        // Defer profile fetch
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    
    if (!error && data.user) {
      setIsNewUser(true);
    }
    
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (!error && data.user) {
      // Trigger login callback for existing users
      setTimeout(() => {
        if (authCallbacks.onLogin) {
          fetchProfile(data.user.id).then((profile) => {
            if (profile) {
              authCallbacks.onLogin?.(profile.name);
            }
          });
        }
      }, 100);
    }
    
    return { data, error };
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
      setProfile(null);
      setIsNewUser(false);
    }
    return { error };
  };

  // Input sanitization function
  const sanitizeInput = (input: string): string => {
    if (typeof input !== 'string') return '';
    // Remove HTML tags and script content
    return input.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').replace(/on\w+\s*=/gi, '').trim();
  };

  const createProfile = async (name: string, referralCode?: string) => {
    if (!user) return { error: new Error("No user"), isNew: false };

    // Sanitize inputs to prevent XSS
    const sanitizedName = sanitizeInput(name).substring(0, 50); // Limit name length
    const sanitizedReferralCode = referralCode ? sanitizeInput(referralCode).substring(0, 20).toUpperCase() : undefined;

    if (!sanitizedName || sanitizedName.length < 2) {
      return { error: new Error("Name must be at least 2 characters long"), isNew: false };
    }

    // Check if profile already exists
    const existingProfile = await fetchProfile(user.id);
    if (existingProfile) {
      // Profile exists - check if we need to link a referral
      const storedReferralId = localStorage.getItem('referred_by');
      if (storedReferralId && storedReferralId !== user.id && storedReferralId.match(/^[a-f0-9-]{36}$/)) {
        // Verify the referral ID exists in the database
        const { data: referrer } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", storedReferralId)
          .maybeSingle();

        if (referrer && !existingProfile.referred_by) {
          // Link referral for existing user if not already linked
          await supabase
            .from("profiles")
            .update({ referred_by: referrer.id })
            .eq("user_id", user.id);

          // Create referral record
          await supabase.from("referrals").insert({
            referrer_id: referrer.id,
            referred_id: existingProfile.id,
          });

          // Clear the stored referral ID
          localStorage.removeItem('referred_by');
        }
      }
      return { data: existingProfile, error: null, isNew: false };
    }

    let referredBy = null;

    // Check for stored referral ID from URL first, then fallback to provided code
    const storedReferralId = localStorage.getItem('referred_by');
    if (storedReferralId && storedReferralId !== user.id) {
      // Verify the referral ID exists in the database
      const { data: referrer } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", storedReferralId)
        .maybeSingle();

      if (referrer) {
        referredBy = referrer.id;
      }
      // Clear the stored referral ID after use
      localStorage.removeItem('referred_by');
    } else if (referralCode) {
      // Fallback to manual referral code for backward compatibility
      const { data: referrer } = await supabase
        .from("profiles")
        .select("id")
        .eq("referral_code", referralCode.toUpperCase())
        .maybeSingle();

      if (referrer) {
        referredBy = referrer.id;
      }
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        name,
        referred_by: referredBy,
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (data && !error) {
      setProfile(data as Profile);

      // Create referral record if referred
      if (referredBy) {
        await supabase.from("referrals").insert({
          referrer_id: referredBy,
          referred_id: data.id,
        });
      }
      
      // Trigger new account callback
      if (authCallbacks.onNewAccountCreated) {
        authCallbacks.onNewAccountCreated(name);
      }
    }

    return { data, error, isNew: true };
  };

  const updateBalance = async (newBalance?: number, totalBet?: number, totalDeposit?: number) => {
    if (!user || !profile) return { error: new Error("No user") };

    const prevProfile = profile;
    const updates: Partial<Profile> = {};
    
    if (newBalance !== undefined) updates.balance = newBalance;
    if (totalBet !== undefined) updates.total_bet = totalBet;
    if (totalDeposit !== undefined) updates.total_deposit = totalDeposit;

    // Skip if no updates
    if (Object.keys(updates).length === 0) return { error: null };

    // Optimistic UI update (instant wallet updates)
    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id);

    if (error) {
      // rollback
      setProfile(prevProfile);
    }

    return { error };
  };

  const updateProfile = async (updates: { name?: string; avatar_url?: string }) => {
    if (!user || !profile) return { error: new Error("No user") };

    const prevProfile = profile;
    
    // Optimistic UI update
    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id);

    if (error) {
      // rollback
      setProfile(prevProfile);
    }

    return { error };
  };

  const refreshProfile = useCallback(() => {
    if (user) {
      return fetchProfile(user.id);
    }
    return Promise.resolve(null);
  }, [user, fetchProfile]);

  return {
    user,
    session,
    profile,
    loading,
    isNewUser,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    createProfile,
    updateBalance,
    updateProfile,
    refreshProfile,
  };
};

export default useAuth;
