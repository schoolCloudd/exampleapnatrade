import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, TrendingUp, TrendingDown, ArrowDownRight, ArrowUpRight, DollarSign,
  Activity, BarChart3, Settings, ChevronLeft, CheckCircle2, XCircle, Clock,
  Eye, RefreshCw, Key, UserX, UserCheck, Edit3, Gift, Wallet, Plus, Minus,
  ClipboardCheck, Bot, Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import useSoundEffects from "@/hooks/useSoundEffects";

interface AdminStats {
  totalUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalTrades: number;
  platformProfit: number;
  activeUsers: number;
  totalReferrals: number;
  totalReferralEarnings: number;
}

type PaymentMode = "manual" | "nowpayments";

interface Transaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  coin: string | null;
  wallet_address: string | null;
  created_at: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  balance: number;
  total_deposit: number;
  total_bet: number;
  referral_code: string | null;
  referral_earnings: number;
  blocked: boolean;
  created_at: string;
}

interface ReferralData {
  id: string;
  referrer_id: string;
  referred_id: string;
  total_earnings: number;
  signup_bonus_paid: boolean;
  created_at: string;
  referrer_name?: string;
  referred_name?: string;
}

interface AdminPageProps {
  onBack: () => void;
}

type TabType = "overview" | "deposits" | "withdrawals" | "users" | "referrals" | "settings";

const AdminPage = ({ onBack }: AdminPageProps) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0, totalDeposits: 0, totalWithdrawals: 0, pendingDeposits: 0,
    pendingWithdrawals: 0, totalTrades: 0, platformProfit: 0, activeUsers: 0,
    totalReferrals: 0, totalReferralEarnings: 0,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [referrals, setReferrals] = useState<ReferralData[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showIpnSecret, setShowIpnSecret] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("manual");

  // Telegram Bot settings
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [showBotToken, setShowBotToken] = useState(false);
  const [savingBotSettings, setSavingBotSettings] = useState(false);



  // Realtime alert state
  const [newDepositAlert, setNewDepositAlert] = useState(false);

  // Sound effects
  const { playNotification } = useSoundEffects();

  useEffect(() => { fetchAdminData(); }, []);

  // Setup realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('admin_transactions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
        },
        (payload) => {
          const newTransaction = payload.new as Transaction;

          // Add to transactions state
          setTransactions(prev => [newTransaction, ...prev]);

          // Update stats optimistically
          setStats(prev => ({
            ...prev,
            pendingDeposits: newTransaction.type === 'deposit'
              ? prev.pendingDeposits + 1
              : prev.pendingDeposits,
            pendingWithdrawals: newTransaction.type === 'withdraw'
              ? prev.pendingWithdrawals + 1
              : prev.pendingWithdrawals,
          }));

          // Sound and visual alert for new deposits
          if (newTransaction.type === 'deposit') {
            playNotification();
            setNewDepositAlert(true);
            setTimeout(() => setNewDepositAlert(false), 3000); // Reset after 3 seconds
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
        },
        (payload) => {
          const updatedTransaction = payload.new as Transaction;

          // Update in transactions state
          setTransactions(prev =>
            prev.map(tx =>
              tx.id === updatedTransaction.id ? updatedTransaction : tx
            )
          );

          // Update stats based on status change
          if (payload.old.status !== updatedTransaction.status) {
            setStats(prev => {
              const newStats = { ...prev };

              // Remove from pending counts if completed/failed
              if (updatedTransaction.status === 'completed' || updatedTransaction.status === 'failed') {
                if (updatedTransaction.type === 'deposit') {
                  newStats.pendingDeposits = Math.max(0, prev.pendingDeposits - 1);
                  if (updatedTransaction.status === 'completed') {
                    newStats.totalDeposits += updatedTransaction.amount;
                  }
                } else if (updatedTransaction.type === 'withdraw') {
                  newStats.pendingWithdrawals = Math.max(0, prev.pendingWithdrawals - 1);
                  if (updatedTransaction.status === 'completed') {
                    newStats.totalWithdrawals += updatedTransaction.amount;
                  }
                }
              }

              return newStats;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playNotification]);

  const fetchAdminData = async () => {
    try {
      setLoading(true);

      // Fetch all profiles
      const { data: profilesData, count: usersCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact" });

      setUsers((profilesData || []) as UserProfile[]);

      // Fetch trades
      const { data: tradesData, count: tradesCount } = await supabase
        .from("trades")
        .select("*", { count: "exact" });

      // Fetch transactions
      const { data: transactionsData } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      // Fetch referrals
      const { data: referralsData } = await supabase
        .from("referrals")
        .select("*");

      // Map referral names
      const profileMap = new Map((profilesData || []).map(p => [p.id, p.name]));
      const mappedReferrals = (referralsData || []).map(r => ({
        ...r,
        referrer_name: profileMap.get(r.referrer_id) || "Unknown",
        referred_name: profileMap.get(r.referred_id) || "Unknown",
      }));
      setReferrals(mappedReferrals);

      // Calculate stats
      const deposits = transactionsData?.filter(t => t.type === "deposit") || [];
      const withdrawals = transactionsData?.filter(t => t.type === "withdraw") || [];

      const totalDeposits = deposits.filter(d => d.status === "completed").reduce((sum, d) => sum + d.amount, 0);
      const totalWithdrawals = withdrawals.filter(w => w.status === "completed").reduce((sum, w) => sum + w.amount, 0);
      const pendingDeposits = deposits.filter(d => d.status === "pending").length;
      const pendingWithdrawals = withdrawals.filter(w => w.status === "pending").length;
      const platformProfit = tradesData?.filter(t => t.result === "loss").reduce((sum, t) => sum + Math.abs(t.pnl || 0), 0) || 0;
      const totalReferralEarnings = referralsData?.reduce((sum, r) => sum + r.total_earnings, 0) || 0;

      setStats({
        totalUsers: usersCount || 0,
        totalDeposits,
        totalWithdrawals,
        pendingDeposits,
        pendingWithdrawals,
        totalTrades: tradesCount || 0,
        platformProfit,
        activeUsers: Math.floor((usersCount || 0) * 0.3),
        totalReferrals: referralsData?.length || 0,
        totalReferralEarnings,
      });

      setTransactions(transactionsData || []);

      // Load API settings
      const { data: settingsData } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["nowpayments_api_key", "nowpayments_ipn_secret", "payment_mode", "telegram_bot_token", "telegram_admin_chat_id"]);

      settingsData?.forEach((s) => {
        if (s.key === "nowpayments_api_key") setApiKey(s.value || "");
        else if (s.key === "nowpayments_ipn_secret") setApiSecret(s.value || "");
        else if (s.key === "payment_mode") setPaymentMode((s.value as PaymentMode) || "manual");
        else if (s.key === "telegram_bot_token") setTelegramBotToken(s.value || "");
        else if (s.key === "telegram_admin_chat_id") setTelegramChatId(s.value || "");
      });
    } catch (error) {
      console.error("Error fetching admin data:", error);
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  const updateTransactionStatus = async (id: string, status: "completed" | "failed", txType?: string) => {
    try {
      // Check if it's a withdrawal and payment mode is nowpayments
      if (txType === "withdraw" && status === "completed" && paymentMode === "nowpayments") {
        toast.loading("Processing payout via NowPayments...", { id: "payout" });
        
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nowpayments-payout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${sessionData.session?.access_token}`,
            },
            body: JSON.stringify({ transactionId: id }),
          }
        );

        const result = await response.json();
        toast.dismiss("payout");

        if (!response.ok || !result.success) {
          toast.error(result.message || "Payout failed");
          return;
        }

        toast.success(`Payout sent! ${result.cryptoAmount} ${result.currency}`);
        fetchAdminData();
        return;
      }

      // Manual processing for deposits or when in manual mode
      const tx = transactions.find(t => t.id === id);
      if (tx && status === "completed") {
        // Get user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", tx.user_id)
          .maybeSingle();

        if (profile) {
          if (tx.type === "deposit") {
            // Credit balance for deposit
            await supabase.from("profiles").update({
              balance: profile.balance + tx.amount,
              total_deposit: profile.total_deposit + tx.amount,
            }).eq("user_id", tx.user_id);

            // Send notification
            await supabase.from("notifications").insert({
              user_id: tx.user_id,
              title: "Deposit Successful! 🎉",
              message: `Your deposit of ₹${tx.amount} has been credited.`,
              type: "deposit",
            });
          } else if (tx.type === "withdraw") {
            // Deduct balance for withdrawal
            if (profile.balance >= tx.amount) {
              await supabase.from("profiles").update({
                balance: profile.balance - tx.amount,
              }).eq("user_id", tx.user_id);

              // Send notification
              await supabase.from("notifications").insert({
                user_id: tx.user_id,
                title: "Withdrawal Sent! 🚀",
                message: `Your withdrawal of ₹${tx.amount} has been processed.`,
                type: "withdraw",
              });
            } else {
              toast.error("User has insufficient balance");
              return;
            }
          }
        }
      }

      const { error } = await supabase.from("transactions").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      toast.success(`Transaction ${status}`);
      fetchAdminData();
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast.error("Failed to update transaction");
    }
  };

  const updateUserBalance = async (userId: string, amount: number, action: "add" | "subtract") => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) throw new Error("User not found");

      const newBalance = action === "add" ? user.balance + amount : user.balance - amount;
      if (newBalance < 0) {
        toast.error("Balance cannot be negative");
        return;
      }

      const { error } = await supabase.from("profiles").update({ balance: newBalance }).eq("id", userId);
      if (error) throw error;

      toast.success(`Balance ${action === "add" ? "added" : "subtracted"} successfully`);
      fetchAdminData();
    } catch (error) {
      console.error("Error updating balance:", error);
      toast.error("Failed to update balance");
    }
  };

  const toggleUserBlock = async (userId: string, blocked: boolean) => {
    try {
      const { error } = await supabase.from("profiles").update({ blocked: !blocked }).eq("id", userId);
      if (error) throw error;
      toast.success(`User ${blocked ? "unblocked" : "blocked"} successfully`);
      fetchAdminData();
    } catch (error) {
      console.error("Error toggling block:", error);
      toast.error("Failed to update user status");
    }
  };



  const saveApiSettings = async () => {
    if (!apiKey || !apiSecret) {
      toast.error("Please enter both API key and IPN secret");
      return;
    }
    setSavingSettings(true);
    try {
      await supabase.from("platform_settings").upsert({ key: "nowpayments_api_key", value: apiKey }, { onConflict: "key" });
      await supabase.from("platform_settings").upsert({ key: "nowpayments_ipn_secret", value: apiSecret }, { onConflict: "key" });
      toast.success("API configuration saved!");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save API configuration");
    } finally {
      setSavingSettings(false);
    }
  };

  const saveBotSettings = async () => {
    if (!telegramBotToken || !telegramChatId) {
      toast.error("Please enter both Bot Token and Chat ID");
      return;
    }
    setSavingBotSettings(true);
    try {
      await supabase.from("platform_settings").upsert({ key: "telegram_bot_token", value: telegramBotToken }, { onConflict: "key" });
      await supabase.from("platform_settings").upsert({ key: "telegram_admin_chat_id", value: telegramChatId }, { onConflict: "key" });
      toast.success("Telegram Bot configuration saved!");
    } catch (error) {
      console.error("Error saving bot settings:", error);
      toast.error("Failed to save Bot configuration");
    } finally {
      setSavingBotSettings(false);
    }
  };

  const testTelegramBot = async () => {
    if (!telegramBotToken || !telegramChatId) {
      toast.error("Please save bot settings first");
      return;
    }
    
    try {
      toast.loading("Sending test message...", { id: "test-bot" });
      
      const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: "✅ ApnaTrade Admin Bot Connected!\n\nTest message from admin panel.",
          parse_mode: "HTML",
        }),
      });
      
      const result = await response.json();
      toast.dismiss("test-bot");
      
      if (result.ok) {
        toast.success("Test message sent successfully!");
      } else {
        toast.error(`Failed: ${result.description}`);
      }
    } catch (error) {
      toast.dismiss("test-bot");
      toast.error("Failed to send test message");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 size={16} className="text-profit" />;
      case "pending": return <Clock size={16} className="text-primary animate-pulse" />;
      case "failed": return <XCircle size={16} className="text-loss" />;
    }
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {[
          { icon: Users, label: "Total Users", value: stats.totalUsers, color: "text-primary" },
          { icon: Activity, label: "Active Users", value: stats.activeUsers, color: "text-profit" },
          { icon: ArrowDownRight, label: "Total Deposits", value: `₹${stats.totalDeposits.toLocaleString()}`, color: "text-profit", sub: `${stats.pendingDeposits} pending` },
          { icon: ArrowUpRight, label: "Total Withdrawals", value: `₹${stats.totalWithdrawals.toLocaleString()}`, color: "text-loss", sub: `${stats.pendingWithdrawals} pending` },
          { icon: BarChart3, label: "Total Trades", value: stats.totalTrades, color: "text-primary" },
          { icon: DollarSign, label: "Platform Profit", value: `₹${stats.platformProfit.toLocaleString()}`, color: "text-gradient-gold" },
          { icon: Gift, label: "Total Referrals", value: stats.totalReferrals, color: "text-primary" },
          { icon: TrendingUp, label: "Referral Payouts", value: `₹${stats.totalReferralEarnings.toLocaleString()}`, color: "text-profit" },
        ].map((stat, i) => (
          <div key={i} className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={18} className={stat.color} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
            {stat.sub && <div className="text-xs text-primary">{stat.sub}</div>}
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Pending Actions</h3>
          <button onClick={fetchAdminData} className="p-2 hover:bg-secondary rounded-lg"><RefreshCw size={18} className="text-muted-foreground" /></button>
        </div>
        <div className="divide-y divide-border">
          {transactions.filter(t => t.status === "pending").slice(0, 5).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${tx.type === "deposit" ? "bg-profit/20" : "bg-primary/20"}`}>
                  {tx.type === "deposit" ? <ArrowDownRight size={18} className="text-profit" /> : <ArrowUpRight size={18} className="text-primary" />}
                </div>
                <div>
                  <div className="font-medium text-foreground capitalize">{tx.type}</div>
                  <div className="text-xs text-muted-foreground">{tx.coin} • {new Date(tx.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-foreground">₹{tx.amount}</span>
                <button onClick={() => updateTransactionStatus(tx.id, "completed", tx.type)} className="p-2 bg-profit/20 rounded-lg hover:bg-profit/30"><CheckCircle2 size={16} className="text-profit" /></button>
                <button onClick={() => updateTransactionStatus(tx.id, "failed", tx.type)} className="p-2 bg-loss/20 rounded-lg hover:bg-loss/30"><XCircle size={16} className="text-loss" /></button>
              </div>
            </div>
          ))}
          {transactions.filter(t => t.status === "pending").length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No pending transactions</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTransactionsList = (type: "deposit" | "withdraw") => {
    const filtered = transactions.filter(t => t.type === type);
    return (
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground capitalize">{type}s</h3>
          <span className="text-sm text-muted-foreground">{filtered.length} total</span>
        </div>
        <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
          {filtered.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${type === "deposit" ? "bg-profit/20" : "bg-primary/20"}`}>
                  {type === "deposit" ? <ArrowDownRight size={18} className="text-profit" /> : <ArrowUpRight size={18} className="text-primary" />}
                </div>
                <div>
                  <div className="font-medium text-foreground">{tx.coin} • ₹{tx.amount.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</div>
                  {tx.wallet_address && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{tx.wallet_address}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">{getStatusIcon(tx.status)}<span className="text-xs text-muted-foreground capitalize">{tx.status}</span></div>
                {tx.status === "pending" && (
                  <>
                    <button onClick={() => updateTransactionStatus(tx.id, "completed", tx.type)} className="p-2 bg-profit/20 rounded-lg hover:bg-profit/30"><CheckCircle2 size={16} className="text-profit" /></button>
                    <button onClick={() => updateTransactionStatus(tx.id, "failed", tx.type)} className="p-2 bg-loss/20 rounded-lg hover:bg-loss/30"><XCircle size={16} className="text-loss" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">No {type}s yet</div>}
        </div>
      </div>
    );
  };

  const renderUsers = () => (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">User Management</h3>
          <p className="text-xs text-muted-foreground">{users.length} total users</p>
        </div>
        <div className="divide-y divide-border max-h-[65vh] overflow-y-auto">
          {users.map((user) => (
            <div key={user.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${user.blocked ? "bg-loss/20 text-loss" : "bg-primary/20 text-primary"}`}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-foreground flex items-center gap-2">
                      {user.name}
                      {user.blocked && <span className="text-xs bg-loss/20 text-loss px-2 py-0.5 rounded">Blocked</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">Code: {user.referral_code || "N/A"}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-foreground">₹{user.balance.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Deposit: ₹{user.total_deposit}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => updateUserBalance(user.id, 100, "add")} className="flex-1 py-2 bg-profit/20 text-profit rounded-lg text-sm font-medium flex items-center justify-center gap-1 hover:bg-profit/30">
                  <Plus size={14} /> Add ₹100
                </button>
                <button onClick={() => updateUserBalance(user.id, 100, "subtract")} className="flex-1 py-2 bg-loss/20 text-loss rounded-lg text-sm font-medium flex items-center justify-center gap-1 hover:bg-loss/30">
                  <Minus size={14} /> Sub ₹100
                </button>
                <button onClick={() => toggleUserBlock(user.id, user.blocked)} className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 ${user.blocked ? "bg-profit/20 text-profit hover:bg-profit/30" : "bg-loss/20 text-loss hover:bg-loss/30"}`}>
                  {user.blocked ? <UserCheck size={14} /> : <UserX size={14} />}
                  {user.blocked ? "Unblock" : "Block"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderReferrals = () => (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Referral Tracking</h3>
          <p className="text-xs text-muted-foreground">{referrals.length} total referrals • ₹{stats.totalReferralEarnings} earned</p>
        </div>
        <div className="divide-y divide-border max-h-[65vh] overflow-y-auto">
          {referrals.map((ref) => (
            <div key={ref.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-lg"><Gift size={18} className="text-primary" /></div>
                <div>
                  <div className="font-medium text-foreground">{ref.referrer_name} → {ref.referred_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(ref.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-profit">₹{ref.total_earnings}</div>
                <div className="text-xs text-muted-foreground">{ref.signup_bonus_paid ? "Bonus Paid" : "Pending Bonus"}</div>
              </div>
            </div>
          ))}
          {referrals.length === 0 && <div className="p-8 text-center text-muted-foreground">No referrals yet</div>}
        </div>
      </div>
    </div>
  );



  const savePaymentMode = async (mode: PaymentMode) => {
    try {
      await supabase.from("platform_settings").upsert({ key: "payment_mode", value: mode }, { onConflict: "key" });
      setPaymentMode(mode);
      toast.success(`Payment mode set to ${mode === "manual" ? "Manual" : "NowPayments API"}`);
    } catch (error) {
      toast.error("Failed to update payment mode");
    }
  };

  const renderSettings = () => (
    <div className="space-y-6">
      {/* Payment Mode Toggle */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Settings size={24} className="text-primary" />
          Payment Processing Mode
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose how deposits and withdrawals are processed
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => savePaymentMode("manual")}
            className={`p-4 rounded-xl border-2 transition-all ${
              paymentMode === "manual" 
                ? "border-primary bg-primary/10" 
                : "border-border bg-secondary hover:border-primary/50"
            }`}
          >
            <div className="text-2xl mb-2">👤</div>
            <div className="font-bold text-foreground">Manual</div>
            <div className="text-xs text-muted-foreground">Admin verifies & processes</div>
          </button>
          <button
            onClick={() => savePaymentMode("nowpayments")}
            className={`p-4 rounded-xl border-2 transition-all ${
              paymentMode === "nowpayments" 
                ? "border-primary bg-primary/10" 
                : "border-border bg-secondary hover:border-primary/50"
            }`}
          >
            <div className="text-2xl mb-2">🤖</div>
            <div className="font-bold text-foreground">NowPayments</div>
            <div className="text-xs text-muted-foreground">Auto via API</div>
          </button>
        </div>
        <div className={`p-3 rounded-lg text-sm ${paymentMode === "manual" ? "bg-profit/10 text-profit" : "bg-primary/10 text-primary"}`}>
          Current: <strong>{paymentMode === "manual" ? "Manual Mode" : "NowPayments API"}</strong>
        </div>
      </div>

      {/* Telegram Bot Configuration */}
      <div className="glass-card rounded-2xl p-6 space-y-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Bot size={24} className="text-[#0088cc]" />
          Telegram Admin Bot
        </h2>

        <p className="text-sm text-muted-foreground">
          Configure Telegram bot for admin alerts (payouts, security events, etc.)
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Bot Token (from @BotFather)</label>
            <div className="relative">
              <input 
                type={showBotToken ? "text" : "password"} 
                value={telegramBotToken} 
                onChange={(e) => setTelegramBotToken(e.target.value)} 
                placeholder="123456789:ABCdefGHI..." 
                className="w-full px-4 py-3 pr-12 bg-secondary rounded-xl text-foreground" 
              />
              <button onClick={() => setShowBotToken(!showBotToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Eye size={18} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Admin Chat ID</label>
            <input 
              type="text" 
              value={telegramChatId} 
              onChange={(e) => setTelegramChatId(e.target.value)} 
              placeholder="-100123456789 or your user ID" 
              className="w-full px-4 py-3 bg-secondary rounded-xl text-foreground" 
            />
            <p className="text-xs text-muted-foreground">
              Use @userinfobot to get your Chat ID, or use group/channel ID for team alerts
            </p>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={saveBotSettings} 
              disabled={savingBotSettings} 
              className="flex-1 py-3 bg-gradient-gold text-primary-foreground font-bold rounded-xl disabled:opacity-50"
            >
              {savingBotSettings ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw size={18} className="animate-spin" />Saving...
                </span>
              ) : "Save Bot Settings"}
            </button>
            <button 
              onClick={testTelegramBot}
              className="px-4 py-3 bg-[#0088cc] text-white font-bold rounded-xl hover:bg-[#0088cc]/90 flex items-center gap-2"
            >
              <Send size={18} />
              Test
            </button>
          </div>
        </div>
      </div>

      {/* NowPayments Config - Only show if API mode */}
      {paymentMode === "nowpayments" && (
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Key size={24} className="text-primary" />
            NowPayments API Configuration
          </h2>

          <p className="text-sm text-muted-foreground">
            Connect NowPayments API for automatic crypto processing. Get keys from{" "}
            <a href="https://nowpayments.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">nowpayments.io</a>
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">API Key</label>
              <div className="relative">
                <input type={showApiKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API Key" className="w-full px-4 py-3 pr-12 bg-secondary rounded-xl text-foreground" />
                <button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><Eye size={18} /></button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">IPN Secret</label>
              <div className="relative">
                <input type={showIpnSecret ? "text" : "password"} value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Enter IPN Secret" className="w-full px-4 py-3 pr-12 bg-secondary rounded-xl text-foreground" />
                <button onClick={() => setShowIpnSecret(!showIpnSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><Eye size={18} /></button>
              </div>
            </div>

            <button onClick={saveApiSettings} disabled={savingSettings} className="w-full py-4 bg-gradient-gold text-primary-foreground font-bold rounded-xl disabled:opacity-50">
              {savingSettings ? <span className="flex items-center justify-center gap-2"><RefreshCw size={18} className="animate-spin" />Saving...</span> : "Save API Configuration"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading admin data...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview" as TabType, icon: BarChart3, label: "Overview" },
    { id: "deposits" as TabType, icon: ArrowDownRight, label: "Deposits" },
    { id: "withdrawals" as TabType, icon: ArrowUpRight, label: "Withdrawals" },
    { id: "users" as TabType, icon: Users, label: "Users" },
    { id: "referrals" as TabType, icon: Gift, label: "Referrals" },
    { id: "settings" as TabType, icon: Settings, label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-secondary rounded-lg"><ChevronLeft size={24} className="text-foreground" /></button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Admin Panel</h1>
              <p className="text-xs text-muted-foreground">Manage your platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/apnadradeadmin/qa")}
              className="flex items-center gap-1.5 px-3 py-2 bg-profit/20 rounded-lg hover:bg-profit/30 text-profit text-sm font-medium"
            >
              <ClipboardCheck size={16} />
              QA
            </button>
            <button onClick={fetchAdminData} className="p-2 bg-primary/20 rounded-lg hover:bg-primary/30 relative">
              <RefreshCw size={20} className="text-primary" />
              {newDepositAlert && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-profit rounded-full animate-pulse"></div>
              )}
            </button>
          </div>
        </div>

        <div className="flex overflow-x-auto px-4 pb-3 gap-2 scrollbar-hide">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              <tab.icon size={16} />{tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 py-4">
        {activeTab === "overview" && renderOverview()}
        {activeTab === "deposits" && renderTransactionsList("deposit")}
        {activeTab === "withdrawals" && renderTransactionsList("withdraw")}
        {activeTab === "users" && renderUsers()}
        {activeTab === "referrals" && renderReferrals()}
        {activeTab === "settings" && renderSettings()}
      </main>
    </div>
  );
};

export default AdminPage;
