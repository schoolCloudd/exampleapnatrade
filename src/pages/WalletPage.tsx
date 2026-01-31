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
  onDeposit?: (amount: number) => Promise<void>;
  onWithdraw?: (amount: number) => Promise<void>;
}

const WalletPage = ({ balance, totalDeposit, totalBet, userName, onNavigate, onDeposit, onWithdraw }: WalletPageProps) => {
  const [activeView, setActiveView] = useState<"main" | "history" | "deposit" | "withdraw">("main");
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

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setActiveView("deposit")}
          className="glass-card rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-profit/5 transition-all active:scale-95"
        >
          <div className="p-3 bg-profit/20 rounded-full">
            <ArrowDownRight size={24} className="text-profit" />
          </div>
          <span className="font-semibold text-foreground">Deposit</span>
          <span className="text-xs text-muted-foreground">Add money</span>
        </button>

        <button
          onClick={() => setActiveView("withdraw")}
          disabled={balance < 200}
          className="glass-card rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-primary/5 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="p-3 bg-primary/20 rounded-full">
            <ArrowUpRight size={24} className="text-primary" />
          </div>
          <span className="font-semibold text-foreground">Withdraw</span>
          <span className="text-xs text-muted-foreground">USDT TRC20</span>
        </button>
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

  const renderDepositView = () => {
    const depositPackages = [
      { amount: 100, bonus: 0, popular: false },
      { amount: 250, bonus: 5, popular: false },
      { amount: 500, bonus: 15, popular: true },
      { amount: 1000, bonus: 35, popular: false },
      { amount: 2000, bonus: 80, popular: false },
      { amount: 5000, bonus: 250, popular: false },
    ];

    const handleDepositPackage = async (amount: number) => {
      if (onDeposit) {
        // Here we would integrate with NowPayments API
        // For now, we'll just call the deposit function
        await onDeposit(amount);
        setActiveView("main");
      }
    };

    return (
      <div className="space-y-6">
        <button
          onClick={() => setActiveView("main")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={20} />
          Back
        </button>

        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground mb-2">Choose Deposit Amount</h2>
            <p className="text-sm text-muted-foreground">Minimum ₹100, Maximum ₹5000</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {depositPackages.map((pkg) => (
              <button
                key={pkg.amount}
                onClick={() => handleDepositPackage(pkg.amount)}
                className={`glass-card rounded-xl p-4 text-center relative hover:bg-profit/5 transition-all active:scale-95 ${
                  pkg.popular ? 'ring-2 ring-profit' : ''
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-profit text-primary-foreground text-xs px-2 py-1 rounded-full font-semibold">
                    Popular
                  </div>
                )}
                <div className="text-lg font-bold text-foreground">₹{pkg.amount}</div>
                {pkg.bonus > 0 && (
                  <div className="text-xs text-profit">+₹{pkg.bonus} bonus</div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  Total: ₹{pkg.amount + pkg.bonus}
                </div>
              </button>
            ))}
          </div>

          <div className="glass-card rounded-xl p-4 bg-profit/5 border border-profit/20">
            <h3 className="font-semibold text-foreground mb-2">💰 Deposit Information</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Instant processing via NowPayments</li>
              <li>• Multiple payment methods available</li>
              <li>• Bonus credits added automatically</li>
              <li>• Funds credited after payment confirmation</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderWithdrawView = () => {
    const [withdrawAmount, setWithdrawAmount] = useState("");

    const handleWithdraw = async () => {
      const amount = parseInt(withdrawAmount);
      if (isNaN(amount) || amount < 200 || amount > 5000) {
        alert("Please enter amount between ₹200-₹5000");
        return;
      }

      if (onWithdraw) {
        await onWithdraw(amount);
        setWithdrawAmount("");
        setActiveView("main");
      }
    };

    return (
      <div className="space-y-6">
        <button
          onClick={() => setActiveView("main")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={20} />
          Back
        </button>

        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground mb-2">Withdraw Funds</h2>
            <p className="text-sm text-muted-foreground">USDT TRC20 Network Only</p>
          </div>

          <div className="glass-card rounded-xl p-4 space-y-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-2">Withdraw Amount (₹)</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="200 - 5000"
                min="200"
                max="5000"
                className="w-full p-3 bg-secondary rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Min: ₹200, Max: ₹5000, Available: ₹{balance}
              </p>
            </div>

            <div className="bg-primary/5 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <span className="text-sm font-medium text-foreground">Withdrawal Details</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Network: USDT TRC20</p>
                <p>• Processing time: 5-30 minutes</p>
                <p>• Fee: Network fee only</p>
                <p>• Minimum withdrawal: ₹200</p>
              </div>
            </div>

            <button
              onClick={handleWithdraw}
              disabled={!withdrawAmount || parseInt(withdrawAmount) < 200 || parseInt(withdrawAmount) > 5000 || parseInt(withdrawAmount) > balance}
              className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Request Withdrawal
            </button>
          </div>

          <div className="glass-card rounded-xl p-4 bg-warning/5 border border-warning/20">
            <h3 className="font-semibold text-foreground mb-2">⚠️ Important Notes</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Only USDT TRC20 withdrawals supported</li>
              <li>• Ensure correct wallet address</li>
              <li>• Withdrawals are manual and may take time</li>
              <li>• Contact support for urgent withdrawals</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

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
        {activeView === "deposit" && renderDepositView()}
        {activeView === "withdraw" && renderWithdrawView()}
        {activeView === "history" && renderHistoryView()}
      </main>

      <BottomNav activeTab="wallet" onTabChange={onNavigate} />
    </div>
  );
};

export default WalletPage;
