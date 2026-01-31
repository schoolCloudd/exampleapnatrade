import { useState, useEffect, useCallback, useRef } from "react";
import { History, RefreshCw, Bell } from "lucide-react";
import Header from "@/components/Header";
import CoinSelector, { coins, Coin, formatINRPrice } from "@/components/CoinSelector";
import TimeframeSelector from "@/components/TimeframeSelector";
import CandlestickChart from "@/components/CandlestickChart";
import TradingTimer from "@/components/TradingTimer";
import BetControls from "@/components/BetControls";
import ActiveBet from "@/components/ActiveBet";
import BottomNav from "@/components/BottomNav";
import WinConfetti from "@/components/WinConfetti";
import TradeResultModal from "@/components/TradeResultModal";
import useSwipeGesture from "@/hooks/useSwipeGesture";
import { useGlobalTrades, settleActiveTrade } from "@/hooks/useGlobalTrades";
import { toast } from "sonner";
import useSoundEffects from "@/hooks/useSoundEffects";

interface TradeProps {
  balance: number;
  userName: string;
  userId?: string;
  onBalanceChange: (newBalance: number) => void;
  onBet: (amount: number) => void;
  onNavigate: (tab: "trade" | "wallet" | "referral" | "profile") => void;
  onOpenHistory: () => void;
  onOpenNotifications: () => void;
  unreadNotifications: number;
  onTradeComplete: (trade: {
    coin_symbol: string;
    coin_name: string;
    timeframe: number;
    direction: "up" | "down";
    amount: number;
    entry_price: number;
    return_rate: number;
  }, result: "win" | "loss", exitPrice: number, pnl: number) => void;
  refreshProfile: () => void;
}

interface PriceAlert {
  id: string;
  coinSymbol: string;
  targetPrice: number;
  direction: "above" | "below";
  triggered: boolean;
}

const Trade = ({ 
  balance, 
  userName,
  userId,
  onBalanceChange, 
  onBet, 
  onNavigate, 
  onOpenHistory,
  onOpenNotifications,
  unreadNotifications,
  onTradeComplete,
  refreshProfile,
}: TradeProps) => {
  // Load saved coin and timeframe from localStorage
  const savedCoinSymbol = localStorage.getItem('selectedCoinSymbol');
  const savedTimeframe = localStorage.getItem('selectedTimeframe');
  const initialCoin = savedCoinSymbol ? coins.find(c => c.symbol === savedCoinSymbol) || coins[0] : coins[0];
  const initialTimeframe = savedTimeframe ? parseInt(savedTimeframe) : 60;

  const [selectedCoin, setSelectedCoin] = useState<Coin>(initialCoin);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [currentPrice, setCurrentPrice] = useState(selectedCoin.price);
  const [oneClickEnabled, setOneClickEnabled] = useState(false);
  const [oneClickAmount, setOneClickAmount] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartKey, setChartKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiAmount, setConfettiAmount] = useState(0);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [tradeResult, setTradeResult] = useState<{
    result: "win" | "loss";
    amount: number;
    pnl: number;
    coinSymbol: string;
    direction: "up" | "down";
    returnRate: number;
  } | null>(null);
  const { playWin, playLoss, playClick, playBet, playNotification } = useSoundEffects();

  // Use global trade system
  const {
    activeTrade: activeBet,
    placeBet,
    updateCurrentPrice,
  } = useGlobalTrades();

  // Update current price for global trade system
  useEffect(() => {
    updateCurrentPrice(currentPrice);
  }, [currentPrice, updateCurrentPrice]);

  // Refs to maintain coin selection across timer cycles
  const selectedCoinRef = useRef(selectedCoin);
  const timeframeRef = useRef(timeframe);

  // Load price alerts from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('priceAlerts');
    if (saved) {
      setPriceAlerts(JSON.parse(saved));
    }
  }, []);

  // Save price alerts to localStorage
  useEffect(() => {
    localStorage.setItem('priceAlerts', JSON.stringify(priceAlerts));
  }, [priceAlerts]);

  // Check price alerts
  useEffect(() => {
    priceAlerts.forEach(alert => {
      if (alert.triggered) return;
      if (alert.coinSymbol !== selectedCoin.symbol) return;
      
      const shouldTrigger = 
        (alert.direction === "above" && currentPrice >= alert.targetPrice) ||
        (alert.direction === "below" && currentPrice <= alert.targetPrice);
      
      if (shouldTrigger) {
        playNotification();
        toast.success(`🔔 Price Alert: ${alert.coinSymbol}`, {
          description: `Price ${alert.direction === "above" ? "reached" : "dropped to"} ${formatINRPrice(alert.targetPrice)}`,
        });
        setPriceAlerts(prev => prev.map(a => 
          a.id === alert.id ? { ...a, triggered: true } : a
        ));
      }
    });
  }, [currentPrice, priceAlerts, selectedCoin.symbol, playNotification]);

  // Add price alert
  const addPriceAlert = useCallback((targetPrice: number, direction: "above" | "below") => {
    const newAlert: PriceAlert = {
      id: Date.now().toString(),
      coinSymbol: selectedCoin.symbol,
      targetPrice,
      direction,
      triggered: false,
    };
    setPriceAlerts(prev => [...prev, newAlert]);
    toast.success(`Price alert set for ${selectedCoin.symbol} ${direction} ${formatINRPrice(targetPrice)}`);
  }, [selectedCoin.symbol]);

  // Swipe gesture for coin switching
  const handleSwipeLeft = useCallback(() => {
    const currentIndex = coins.findIndex(c => c.symbol === selectedCoin.symbol);
    const nextIndex = currentIndex < coins.length - 1 ? currentIndex + 1 : 0;
    setSelectedCoin(coins[nextIndex]);
    playClick();
  }, [selectedCoin.symbol, playClick]);

  const handleSwipeRight = useCallback(() => {
    const currentIndex = coins.findIndex(c => c.symbol === selectedCoin.symbol);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : coins.length - 1;
    setSelectedCoin(coins[prevIndex]);
    playClick();
  }, [selectedCoin.symbol, playClick]);

  const { onTouchStart, onTouchMove, onTouchEnd } = useSwipeGesture({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    minSwipeDistance: 60
  });

  // Keep refs in sync with state and persist to localStorage
  useEffect(() => {
    selectedCoinRef.current = selectedCoin;
    localStorage.setItem('selectedCoinSymbol', selectedCoin.symbol);
  }, [selectedCoin]);

  useEffect(() => {
    timeframeRef.current = timeframe;
    localStorage.setItem('selectedTimeframe', timeframe.toString());
  }, [timeframe]);

  // Fixed 85% return rate
  const returnRate = 85;

  // Update current price when coin changes
  useEffect(() => {
    setCurrentPrice(selectedCoin.price);
  }, [selectedCoin]);

  // Handle price updates from chart
  const handlePriceUpdate = useCallback((price: number) => {
    setCurrentPrice(price);
  }, []);

  // Pull to refresh handler
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    playClick();
    
    // Refresh chart data
    setChartKey(prev => prev + 1);
    
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Chart refreshed");
    }, 500);
  }, [playClick]);

  // Place bet handler - uses database atomic operations
  const handlePlaceBet = useCallback(async (amount: number, direction: "up" | "down") => {
    playClick();
    
    if (amount > balance) {
      toast.error("Insufficient balance");
      return;
    }

    if (activeBet) {
      toast.error("Wait for current trade to complete");
      return;
    }

    // Place bet via hook (handles DB deduction)
    const result = await placeBet(
      amount,
      direction,
      selectedCoin.symbol,
      selectedCoin.name,
      timeframe,
      currentPrice,
      returnRate
    );

    if (result.success) {
      playBet();
      toast.success(
        `${direction === "up" ? "Long" : "Short"} opened at ${formatINRPrice(currentPrice)}`
      );
      // Refresh profile to get updated balance
      refreshProfile();
      // Track bet amount
      onBet(amount);
    } else {
      toast.error(result.error || "Failed to place bet");
    }
  }, [activeBet, balance, currentPrice, selectedCoin, timeframe, returnRate, placeBet, playBet, playClick, refreshProfile, onBet]);

  // One-click trade handlers
  const handleOneClickUp = useCallback(() => {
    if (oneClickEnabled && oneClickAmount <= balance && !activeBet) {
      handlePlaceBet(oneClickAmount, "up");
    }
  }, [oneClickEnabled, oneClickAmount, balance, activeBet, handlePlaceBet]);

  const handleOneClickDown = useCallback(() => {
    if (oneClickEnabled && oneClickAmount <= balance && !activeBet) {
      handlePlaceBet(oneClickAmount, "down");
    }
  }, [oneClickEnabled, oneClickAmount, balance, activeBet, handlePlaceBet]);

  // Handle candle close - global trade system handles settlement automatically
  const handleCandleClose = useCallback(() => {
    // Global trade system handles settlement automatically
    // No need for manual settlement here
  }, []);

  // Quick price alert - set alert 5% above current
  const handleQuickAlert = useCallback(() => {
    const alertPrice = currentPrice * 1.05; // 5% above
    addPriceAlert(alertPrice, "above");
  }, [currentPrice, addPriceAlert]);

  // Create display-friendly bet object for ActiveBet component
  const displayBet = activeBet ? {
    amount: activeBet.amount,
    direction: activeBet.direction,
    entryPrice: activeBet.entry_price,
    returnRate: activeBet.return_rate,
    candleStartTime: Math.floor(new Date(activeBet.created_at).getTime() / 1000),
    candleEndTime: activeBet.endTime,
    upTotalBet: 0, // Global system doesn't track market totals
    downTotalBet: 0,
  } : null;

  return (
    <div className="h-screen h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Win Confetti Effect */}
      <WinConfetti trigger={showConfetti} amount={confettiAmount} />
      
      {/* Trade Result Modal */}
      <TradeResultModal 
        result={tradeResult} 
        onClose={() => setTradeResult(null)} 
      />
      
      <Header 
        balance={balance} 
        userName={userName} 
        unreadNotifications={unreadNotifications}
        onNotificationsClick={onOpenNotifications}
      />

      {/* Main Scrollable Content Area */}
      <main 
        className="flex-1 flex flex-col px-1.5 sm:px-4 lg:px-6 py-1 sm:py-2 max-w-4xl mx-auto w-full min-h-0 pb-[160px] sm:pb-[180px]"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Coin & Timeframe Selection Row - Optimized for mobile */}
        <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-1.5 flex-shrink-0">
          <CoinSelector 
            selectedCoin={selectedCoin} 
            onSelectCoin={setSelectedCoin}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
          />
          <TimeframeSelector
            selectedTimeframe={timeframe}
            onSelectTimeframe={setTimeframe}
          />
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 bg-secondary rounded-full hover:bg-secondary/80 transition-all flex-shrink-0 touch-manipulation active:scale-95"
            title="Refresh Chart"
          >
            <RefreshCw size={14} className={`text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onOpenHistory}
            className="p-1.5 bg-secondary rounded-full hover:bg-secondary/80 transition-all flex-shrink-0 touch-manipulation active:scale-95"
            title="Trade History"
          >
            <History size={14} className="text-muted-foreground" />
          </button>
        </div>

        {/* Chart with Overlay Timer/Price */}
        <div className="relative flex-1 min-h-[180px] glass-card rounded-xl overflow-hidden">
          <CandlestickChart 
            key={chartKey}
            timeframe={timeframe} 
            coinSymbol={selectedCoin.symbol} 
            basePrice={selectedCoin.price} 
            onPriceUpdate={handlePriceUpdate}
          />
          
          {/* Floating Price & Timer Overlay - Top Right */}
          <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 flex items-center gap-1 sm:gap-2 bg-background/90 backdrop-blur-sm rounded-lg px-1.5 sm:px-2 py-1 border border-border/50">
            <div className="text-right">
              <div className="text-[6px] sm:text-[8px] text-muted-foreground uppercase tracking-wide">Price</div>
              <div className="font-mono text-[10px] sm:text-sm font-bold text-foreground">
                {formatINRPrice(currentPrice)}
              </div>
            </div>
            <div className="w-px h-5 sm:h-8 bg-border/50" />
            <TradingTimer
              timeframe={timeframe}
              onCandleClose={handleCandleClose}
              onTimerExpire={async () => {
                // Trigger immediate settlement when timer hits zero
                if (activeBet) {
                  // Update the current price one final time
                  updateCurrentPrice(currentPrice);
                  // Immediately settle the active trade
                  await settleActiveTrade();
                }
              }}
              compact
            />
          </div>
          
          {/* Price Alert Button */}
          <button
            onClick={handleQuickAlert}
            className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-lg border border-border/50 hover:bg-primary/20 transition-all touch-manipulation active:scale-95"
            title="Set price alert +5%"
          >
            <Bell size={12} className="text-primary" />
          </button>
        </div>
      </main>

      {/* Fixed Buy/Sell Controls - Above Bottom Nav with proper gap */}
      <div className="fixed bottom-[80px] sm:bottom-[85px] left-0 right-0 z-40 px-2 sm:px-4 lg:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Active Bet - Only when active */}
          {displayBet && (
            <div className="mb-1">
              <ActiveBet bet={displayBet} currentPrice={currentPrice} />
            </div>
          )}
          
          {/* Buy/Sell Controls */}
          <div className="glass-card rounded-xl p-1.5 sm:p-3 shadow-2xl border border-border/50">
            <BetControls
              balance={balance}
              onPlaceBet={handlePlaceBet}
              disabled={!!activeBet}
              returnRate={returnRate}
              oneClickEnabled={oneClickEnabled}
              onOneClickToggle={setOneClickEnabled}
              oneClickAmount={oneClickAmount}
              onOneClickAmountChange={setOneClickAmount}
              onOneClickUp={handleOneClickUp}
              onOneClickDown={handleOneClickDown}
            />
          </div>
        </div>
      </div>

      <BottomNav activeTab="trade" onTabChange={onNavigate} />
    </div>
  );
};

export default Trade;
