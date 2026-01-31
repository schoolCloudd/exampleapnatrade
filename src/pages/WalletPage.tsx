import { useState, useEffect, useCallback } from "react";
import { ArrowDownRight, ArrowUpRight, Clock, CheckCircle2, XCircle, ChevronLeft } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Transaction {
  id: string;
  type: "deposit" | "withdraw";
  amount: number;
  status: "pending" | "completed" | "failed";
  date: string;
  coin: string;
}

interface WalletPageProps {
  balance: number;
  totalDeposit: number;
  totalBet: number;
  userName: string;
  onNavigate: (tab: "trade" | "wallet" | "referral" | "profile") => void;
}

const WalletPage = ({ balance, totalDeposit, totalBet, userName, onNavigate }: WalletPageProps) => {
  const [activeView, setActiveView] = useState<"main" | "history">("main");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const { user } = useAuth();

  // Fetch transactions function
  const fetchTransactions = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setTransactions(data.map(t => ({
        id: t.id,
        type: t.type as "deposit" | "withdraw",
        amount: t.amount,
        status: t.status as "pending" | "completed" | "failed",
        date: new Date(t.created_at).toLocaleString(),
        coin: t.coin || "USDT"
      })));
    }
  }, [user]);

  // Fetch transactions on mount
  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user, fetchTransactions]);

  // Real-time subscription for transaction updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`wallet-transactions:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to all events (INSERT, UPDATE)
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Refresh transactions list on any change
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchTransactions]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 size={16} className="text-profit" />;
      case "pending": return <Clock size={16} className="text-primary animate-pulse" />;
      case "failed": return <XCircle size={16} className="text-loss" />;
    }
  };

  const renderMainView = () => (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="glass-card rounded-2xl p-6 text-center">
        <div className="text-sm text-muted-foreground mb-2">Total Balance</div>
        <div className="text-4xl font-bold font-mono text-gradient-gold mb-4">
          ₹{balance.toLocaleString()}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="glass-card rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Deposited</div>
            <div className="font-mono font-bold text-lg text-foreground">₹{totalDeposit.toLocaleString()}</div>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Traded</div>
            <div className="font-mono font-bold text-lg text-foreground">₹{totalBet.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Recent Transactions</h3>
          <button
            onClick={() => setActiveView("history")}
            className="text-sm text-primary hover:underline"
          >
            View All
          </button>
        </div>
        <div className="divide-y divide-border">
          {transactions.slice(0, 5).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    tx.type === "deposit" ? "bg-profit/20" : "bg-primary/20"
                  }`}
                >
                  {tx.type === "deposit" ? (
                    <ArrowDownRight size={18} className="text-profit" />
                  ) : (
                    <ArrowUpRight size={18} className="text-primary" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-foreground capitalize">{tx.type}</div>
                  <div className="text-xs text-muted-foreground">{tx.date}</div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-mono font-bold ${
                    tx.type === "deposit" ? "text-profit" : "text-foreground"
                  }`}
                >
                  {tx.type === "deposit" ? "+" : "-"}₹{tx.amount}
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {getStatusIcon(tx.status)}
                  <span className="text-xs text-muted-foreground capitalize">{tx.status}</span>
                </div>
              </div>
            </div>
          ))}
          {transactions.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No transactions yet
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderHistoryView = () => (
    <div className="space-y-6">
      <button
        onClick={() => setActiveView("main")}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={20} />
        Back
      </button>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Transaction History</h3>
        </div>
        <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    tx.type === "deposit" ? "bg-profit/20" : "bg-primary/20"
                  }`}
                >
                  {tx.type === "deposit" ? (
                    <ArrowDownRight size={18} className="text-profit" />
                  ) : (
                    <ArrowUpRight size={18} className="text-primary" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-foreground capitalize">{tx.type}</div>
                  <div className="text-xs text-muted-foreground">{tx.date}</div>
                  <div className="text-xs text-muted-foreground">{tx.coin}</div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-mono font-bold ${
                    tx.type === "deposit" ? "text-profit" : "text-foreground"
                  }`}
                >
                  {tx.type === "deposit" ? "+" : "-"}₹{tx.amount}
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {getStatusIcon(tx.status)}
                  <span className="text-xs text-muted-foreground capitalize">{tx.status}</span>
                </div>
              </div>
            </div>
          ))}
          {transactions.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No transactions yet</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header balance={balance} userName={userName} />

      <main className="px-4 py-4">
        {activeView === "main" && renderMainView()}
        {activeView === "history" && renderHistoryView()}
      </main>

      <BottomNav activeTab="wallet" onTabChange={onNavigate} />
    </div>
  );
};

export default WalletPage;
