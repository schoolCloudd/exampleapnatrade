import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import Auth from "./Auth";
import CustomCursor from "@/components/CustomCursor";
import BackgroundMusic from "@/components/BackgroundMusic";
import useAuth, { setAuthCallbacks } from "@/hooks/useAuth";
import useTrades from "@/hooks/useTrades";
import useNotifications from "@/hooks/useNotifications";
import useRealtimeNotifications from "@/hooks/useRealtimeNotifications";
import useRealtimeTransactions from "@/hooks/useRealtimeTransactions";
import useTelegramAuth from "@/hooks/useTelegramAuth";
import { useTelegram } from "@/components/TelegramWebAppProvider";
import { supabase } from "@/integrations/supabase/client";
import { initializeGlobalTrades } from "@/hooks/useGlobalTrades";

// Lazy load heavy components for better performance
const Trade = lazy(() => import("./Trade"));
const TradeHistory = lazy(() => import("./TradeHistory"));
const WalletPage = lazy(() => import("./WalletPage"));
const ReferralPage = lazy(() => import("./ReferralPage"));
const ProfilePage = lazy(() => import("./ProfilePage"));
const NotificationsPage = lazy(() => import("./NotificationsPage"));

type Tab = "trade" | "wallet" | "referral" | "profile";
type View = "main" | "history" | "notifications";

const Index = () => {
  const {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    createProfile,
    updateBalance,
    refreshProfile,
  } = useAuth();

  const { trades, fetchTrades, createTrade, closeTrade, getStats } = useTrades(user?.id);

  // Telegram Web App integration
  const { isTelegram, hapticNotification } = useTelegram();
  const { isAuthenticating: isTelegramAuthenticating, error: telegramAuthError, isAuthenticated: isTelegramAuthenticated } = useTelegramAuth();

  const {
    notifications,
    unreadCount,
    fetchNotifications,
    createNotification,
    markAsRead,
    markAllAsRead,
    addNotification,
  } = useNotifications(user?.id);

  // Real-time notifications subscription
  useRealtimeNotifications({
    userId: user?.id,
    onNewNotification: addNotification,
  });

  // Real-time transaction updates
  useRealtimeTransactions({
    userId: user?.id,
    onTransactionUpdate: useCallback((transaction: { status: string }) => {
      // Refresh profile when a transaction is completed/approved to update balance
      if (transaction.status === 'completed' || transaction.status === 'approved') {
        refreshProfile();
      }
    }, [refreshProfile]),
  });

  const [activeTab, setActiveTab] = useState<Tab>("trade");
  const [currentView, setCurrentView] = useState<View>("main");

  // Check for referral parameter in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref') || urlParams.get('invite');

    if (refParam && refParam.trim()) {
      // Store referral ID in localStorage
      localStorage.setItem('referred_by', refParam);
    }
  }, []);

  // Set up auth callbacks for notifications
  useEffect(() => {
    setAuthCallbacks({
      onNewAccountCreated: async (name: string) => {
        // Welcome notification for new accounts
        setTimeout(async () => {
          await createNotification({
            title: "Welcome to ApnaTrade! 🎉",
            message: `Hi ${name}, your trading journey begins now! Deposit to start trading.`,
            type: "promo",
          });
        }, 500);
      },
      onLogin: async (name: string) => {
        // Login notification
        setTimeout(async () => {
          await createNotification({
            title: "Welcome Back! 👋",
            message: `Good to see you again, ${name}. Happy trading!`,
            type: "promo",
          });
        }, 500);
      },
    });
  }, [createNotification]);

  // Fetch trades and notifications when user logs in
  useEffect(() => {
    if (user && profile) {
      fetchTrades();
      fetchNotifications();
    }
  }, [user, profile, fetchTrades, fetchNotifications]);

  const handleAuth = async (name: string, referralCode?: string) => {
    const result = await createProfile(name, referralCode);
    return { error: result.error };
  };

  const handleSignUp = async (email: string, password: string) => {
    const { error } = await signUp(email, password);
    return { error: error as Error | null };
  };

  const handleSignIn = async (email: string, password: string) => {
    const { error } = await signIn(email, password);
    return { error: error as Error | null };
  };


  const handleLogout = async () => {
    await signOut();
  };

  // Process referral bonus when referred user makes deposit
  const processReferralBonus = useCallback(async (referrerId: string, referredName: string, depositAmount: number, isFirstDeposit: boolean) => {
    const SIGNUP_BONUS = 20; // ₹20 signup bonus (one-time)
    const DEPOSIT_COMMISSION = 0.02; // 2% commission on all deposits

    try {
      // Get referrer profile
      const { data: referrer } = await supabase
        .from("profiles")
        .select("id, user_id, balance, referral_earnings")
        .eq("id", referrerId)
        .maybeSingle();

      if (!referrer) return;

      let totalBonus = 0;
      let bonusDescription = "";

      if (isFirstDeposit) {
        // First deposit: signup bonus + commission
        totalBonus = SIGNUP_BONUS + (depositAmount * DEPOSIT_COMMISSION);
        bonusDescription = `₹${SIGNUP_BONUS} signup bonus + ₹${(depositAmount * DEPOSIT_COMMISSION).toFixed(0)} (2% commission) from ${referredName}'s first deposit`;
      } else {
        // Subsequent deposits: only commission
        totalBonus = depositAmount * DEPOSIT_COMMISSION;
        bonusDescription = `₹${totalBonus.toFixed(0)} (2% commission) from ${referredName}'s deposit`;
      }

      // Update referrer balance and earnings
      await supabase
        .from("profiles")
        .update({
          balance: referrer.balance + totalBonus,
          referral_earnings: (referrer.referral_earnings || 0) + totalBonus,
        })
        .eq("id", referrerId);

      // Update referral record
      if (isFirstDeposit) {
        // For first deposit, set total_earnings and mark signup_bonus_paid
        await supabase
          .from("referrals")
          .update({
            total_earnings: totalBonus,
            signup_bonus_paid: true,
          })
          .eq("referrer_id", referrerId)
          .eq("referred_id", profile?.id);
      } else {
        // For subsequent deposits, increment total_earnings
        const { data: currentReferral } = await supabase
          .from("referrals")
          .select("total_earnings")
          .eq("referrer_id", referrerId)
          .eq("referred_id", profile?.id)
          .single();

        const currentEarnings = currentReferral?.total_earnings || 0;

        await supabase
          .from("referrals")
          .update({
            total_earnings: currentEarnings + totalBonus,
          })
          .eq("referrer_id", referrerId)
          .eq("referred_id", profile?.id);
      }

      // Create notification for referrer (via their user_id)
      await supabase.from("notifications").insert({
        user_id: referrer.user_id,
        title: "Referral Bonus! 🎁",
        message: `You earned ${bonusDescription}!`,
        type: "referral",
      });

    } catch (error) {
      console.error("Error processing referral bonus:", error);
    }
  }, [profile?.id]);

  const handleDeposit = async (amount: number) => {
    if (!profile || !user) return;

    const isFirstDeposit = profile.total_deposit === 0;
    const newBalance = profile.balance + amount;
    const newDeposit = profile.total_deposit + amount;

    // Create transaction record
    const { data: transaction } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "deposit",
        amount: amount,
        status: "completed",
        coin: "INR"
      })
      .select()
      .single();

    if (transaction) {
      await updateBalance(newBalance, undefined, newDeposit);

      // Create deposit notification
      await createNotification({
        title: "Deposit Received 💰",
        message: `₹${amount.toLocaleString()} has been added to your account. Start trading now!`,
        type: "deposit",
      });

      // Handle referral bonus for referred users
      if (profile.referred_by) {
        await processReferralBonus(profile.referred_by, profile.name, amount, isFirstDeposit);
      }
    }
  };

  const handleWithdraw = async (amount: number) => {
    if (!profile || !user || profile.balance < amount) return;

    const newBalance = profile.balance - amount;

    // Create transaction record
    const { data: transaction } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "withdraw",
        amount: amount,
        status: "pending", // Withdrawals start as pending
        coin: "INR"
      })
      .select()
      .single();

    if (transaction) {
      await updateBalance(newBalance);

      // Create withdraw notification
      await createNotification({
        title: "Withdrawal Initiated 💸",
        message: `₹${amount.toLocaleString()} withdrawal request has been submitted.`,
        type: "withdraw",
      });
    }
  };

  const handleBet = async (amount: number) => {
    if (!profile) return;
    // Only update total_bet, not balance (balance is managed separately in Trade.tsx)
    await updateBalance(undefined, profile.total_bet + amount);
  };

  const handleBalanceChange = async (newBalance: number) => {
    // Directly update balance in database
    await updateBalance(newBalance);
    // Force refresh profile to sync state
    await refreshProfile();
  };

  const handleTradeComplete = useCallback(async (
    trade: {
      coin_symbol: string;
      coin_name: string;
      timeframe: number;
      direction: "up" | "down";
      amount: number;
      entry_price: number;
      return_rate: number;
    },
    result: "win" | "loss",
    exitPrice: number,
    pnl: number
  ) => {
    // Create trade record
    const { data: tradeData } = await createTrade(trade);
    
    if (tradeData) {
      await closeTrade(tradeData.id, exitPrice, result, pnl);
    }

    // Create notification
    await createNotification({
      title: result === "win" ? "Trade Won! 🎉" : "Trade Closed",
      message:
        result === "win"
          ? `You won ₹${Math.abs(pnl).toFixed(2)} on ${trade.coin_symbol}!`
          : `Lost ₹${Math.abs(pnl).toFixed(2)} on ${trade.coin_symbol}.`,
      type: "trade_result",
    });
  }, [createTrade, closeTrade, createNotification]);

  // Handle referral notification (when referred user deposits)
  const handleReferralEarning = useCallback(async (referredName: string, earning: number) => {
    await createNotification({
      title: "Referral Bonus! 🎁",
      message: `You earned ₹${earning.toFixed(2)} from ${referredName}'s activity!`,
      type: "referral",
    });
  }, [createNotification]);

  // Handle mark as read with proper async
  const handleMarkAsRead = useCallback(async (id: string) => {
    await markAsRead(id);
  }, [markAsRead]);

  const handleMarkAllAsRead = useCallback(async () => {
    await markAllAsRead();
  }, [markAllAsRead]);

  // Initialize global trade system after all functions are declared
  useEffect(() => {
    if (user && profile) {
      initializeGlobalTrades(user.id, handleBalanceChange, handleTradeComplete);
    }
  }, [user?.id, profile, handleBalanceChange, handleTradeComplete]);

  // Show loading only when actually loading auth or profile
  // Add timeout to prevent infinite loading loops
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  useEffect(() => {
    if (loading || (isTelegramAuthenticating && !telegramAuthError) || (user && !profile)) {
      const timeout = setTimeout(() => {
        console.log("[Index] Loading timeout reached, forcing fallback");
        setLoadingTimeout(true);
      }, 15000); // 15 second timeout

      return () => clearTimeout(timeout);
    } else {
      setLoadingTimeout(false);
    }
  }, [loading, isTelegramAuthenticating, telegramAuthError, user, profile]);

  const shouldShowLoading = (
    !loadingTimeout && (
      loading ||
      (isTelegramAuthenticating && !telegramAuthError) ||
      (user && !profile)
    )
  );

  if (shouldShowLoading) {
    return (
      <div className="min-h-screen bg-gradient-dark flex flex-col items-center justify-center">
        {/* Background Effects */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-profit/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center space-y-6">
          {/* Logo */}
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-gradient-gold rounded-full flex items-center justify-center text-4xl font-bold text-primary-foreground glow-gold">
              A
            </div>
          </div>

          {/* Loading Text */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">ApnaTrade</h1>
            <p className="text-sm text-muted-foreground">
              {isTelegramAuthenticating
                ? "Connecting via Telegram..."
                : user && !profile
                ? "Loading your profile..."
                : "Loading..."}
            </p>
          </div>

          {/* Loading Spinner */}
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />

          {/* Error Display */}
          {telegramAuthError && (
            <div className="text-center space-y-2 max-w-sm">
              <p className="text-destructive text-sm font-medium">Authentication Error</p>
              <p className="text-destructive text-xs bg-destructive/10 p-2 rounded border">
                {telegramAuthError}
              </p>
              {!isTelegram && (
                <p className="text-muted-foreground text-xs">
                  Normal browser mode: Use email login below
                </p>
              )}
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <p>Debug Info:</p>
                <p>• Telegram: {isTelegram ? 'Yes' : 'No'}</p>
                <p>• Host: {window.location.hostname}</p>
                <p>• Path: {window.location.pathname}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Not authenticated - show login/signup
  if (!user) {
    return (
      <>
        <CustomCursor />
        <Auth
          onAuth={handleAuth}
          onSignUp={handleSignUp}
          onSignIn={handleSignIn}
          needsProfile={false}
        />
      </>
    );
  }



  // Needs profile (new user after signup)
  if (!profile) {
    return (
      <>
        <CustomCursor />
        <Auth
          onAuth={handleAuth}
          onSignUp={handleSignUp}
          onSignIn={handleSignIn}
          needsProfile={true}
        />
      </>
    );
  }

  // Show notifications page
  if (currentView === "notifications") {
    return (
      <div className="custom-cursor">
        <CustomCursor />
        <Suspense fallback={
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        }>
          <NotificationsPage
            balance={profile.balance}
            userName={profile.name}
            notifications={notifications}
            onBack={() => setCurrentView("main")}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onNavigate={(tab) => {
              setActiveTab(tab);
              setCurrentView("main");
            }}
          />
        </Suspense>
      </div>
    );
  }

  // Show trade history
  if (currentView === "history") {
    return (
      <div className="custom-cursor">
        <CustomCursor />
        <Suspense fallback={
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        }>
          <TradeHistory
            balance={profile.balance}
            userName={profile.name}
            trades={trades}
            stats={getStats()}
            onBack={() => setCurrentView("main")}
            onNavigate={setActiveTab}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="custom-cursor">
      <CustomCursor />
      <BackgroundMusic autoPlay />
      <Suspense fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      }>
        {activeTab === "trade" && (
          <Trade
            balance={profile.balance}
            userName={profile.name}
            userId={user.id}
            onBalanceChange={handleBalanceChange}
            onBet={handleBet}
            onNavigate={setActiveTab}
            onOpenHistory={() => setCurrentView("history")}
            onOpenNotifications={() => setCurrentView("notifications")}
            unreadNotifications={unreadCount}
            onTradeComplete={handleTradeComplete}
            refreshProfile={refreshProfile}
          />
        )}
      {activeTab === "wallet" && (
        <WalletPage
          balance={profile.balance}
          totalDeposit={profile.total_deposit}
          totalBet={profile.total_bet}
          userName={profile.name}
          onNavigate={setActiveTab}
          onDeposit={handleDeposit}
          onWithdraw={handleWithdraw}
        />
      )}
        {activeTab === "referral" && (
          <ReferralPage
            balance={profile.balance}
            userName={profile.name}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === "profile" && (
          <ProfilePage
            balance={profile.balance}
            userName={profile.name}
            userAvatar={profile.avatar_url}
            totalDeposit={profile.total_deposit}
            totalBet={profile.total_bet}
            trades={trades}
            onLogout={handleLogout}
            onNavigate={setActiveTab}
          />
        )}
      </Suspense>
    </div>
  );
};

export default Index;
