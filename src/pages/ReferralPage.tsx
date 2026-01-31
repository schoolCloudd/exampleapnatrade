import { useState, useEffect } from "react";
import { Copy, Share2, Users, Gift, TrendingUp, Loader2, Send } from "lucide-react";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
interface Referral {
  id: string;
  name: string;
  joinDate: string;
  totalDeposit: number;
  yourEarnings: number;
}

interface ReferralPageProps {
  balance: number;
  userName: string;
  onNavigate: (tab: "trade" | "wallet" | "referral" | "profile") => void;
}

const ReferralPage = ({ balance, userName, onNavigate }: ReferralPageProps) => {
  const [referralCode, setReferralCode] = useState("");
  const [referralLink, setReferralLink] = useState("");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const { isTelegram, webApp, hapticImpact } = useTelegramWebApp();

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Generate referral link using user ID
      const baseUrl = window.location.origin;
      const link = `${baseUrl}?ref=${user.id}`;
      setReferralLink(link);

      // Get current user's profile with referral code
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, referral_code, referral_earnings")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        setReferralCode(profile.referral_code || "");
        setTotalEarnings(profile.referral_earnings || 0);

        // Get referrals where current user is referrer
        const { data: referralsData } = await supabase
          .from("referrals")
          .select("id, referred_id, total_earnings, created_at")
          .eq("referrer_id", profile.id);

        if (referralsData && referralsData.length > 0) {
          // Get referred user profiles
          const referredIds = referralsData.map(r => r.referred_id);
          const { data: referredProfiles } = await supabase
            .from("profiles")
            .select("id, name, total_deposit, created_at")
            .in("id", referredIds);

          const mappedReferrals = referralsData.map(ref => {
            const profile = referredProfiles?.find(p => p.id === ref.referred_id);
            return {
              id: ref.id,
              name: profile?.name || "Unknown User",
              joinDate: new Date(ref.created_at).toLocaleDateString(),
              totalDeposit: profile?.total_deposit || 0,
              yourEarnings: ref.total_earnings || 0,
            };
          });

          setReferrals(mappedReferrals);
        }
      }
    } catch (error) {
      console.error("Error fetching referral data:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    hapticImpact("light");
    toast.success("Referral link copied!");
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join ApnaTrade",
          text: `Join ApnaTrade and start trading with my referral!`,
          url: referralLink,
        });
      } catch {
        copyLink();
      }
    } else {
      copyLink();
    }
  };

  // Telegram native share with fallback
  const shareTelegram = () => {
    hapticImpact("medium");
    const shareText = `🚀 Join ApnaTrade! Start trading with my referral link!`;
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;

    if (isTelegram && webApp) {
      try {
        // Try Telegram's native share - may not be supported in all contexts
        webApp.switchInlineQuery(`Join ApnaTrade! ${referralLink}`, ["users", "groups", "channels"]);
      } catch (error) {
        console.log("switchInlineQuery not supported, using fallback:", error);
        // Fallback: Open Telegram share URL
        window.open(telegramUrl, "_blank");
      }
    } else {
      // Fallback: Open Telegram share URL
      window.open(telegramUrl, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header balance={balance} userName={userName} />

      <main className="px-4 py-4 space-y-6">
        {/* Hero Card */}
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-primary/20 rounded-xl">
                <Gift size={28} className="text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Refer & Earn</h1>
                <p className="text-sm text-muted-foreground">Earn lifetime commissions</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-secondary/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-profit">₹20</div>
                <div className="text-xs text-muted-foreground">Per Signup Bonus</div>
              </div>
              <div className="bg-secondary/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-primary">2%</div>
                <div className="text-xs text-muted-foreground">Lifetime Commission</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Your Referral Link</div>
                <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-3 bg-secondary rounded-xl font-mono text-sm text-primary break-all">
                  {referralLink || "Loading..."}
                </div>
                <button
                  onClick={copyLink}
                  disabled={!referralLink}
                  className="p-3 bg-primary/20 rounded-xl hover:bg-primary/30 transition-all disabled:opacity-50"
                  title="Copy Link"
                >
                  <Copy size={20} className="text-primary" />
                </button>
                <button
                  onClick={shareTelegram}
                  disabled={!referralLink}
                  className="p-3 bg-[#0088cc] rounded-xl hover:bg-[#0088cc]/90 transition-all disabled:opacity-50"
                  title="Share on Telegram"
                >
                  <Send size={20} className="text-white" />
                </button>
                <button
                  onClick={shareLink}
                  disabled={!referralLink}
                  className="p-3 bg-primary rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
                  title="Share"
                >
                  <Share2 size={20} className="text-primary-foreground" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={18} className="text-primary" />
              <span className="text-xs text-muted-foreground">Total Referrals</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{referrals.length}</div>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={18} className="text-profit" />
              <span className="text-xs text-muted-foreground">Total Earnings</span>
            </div>
            <div className="text-2xl font-bold text-profit">₹{totalEarnings.toLocaleString()}</div>
          </div>
        </div>

        {/* How it works */}
        <div className="glass-card rounded-2xl p-5">
          <h3 className="font-semibold text-foreground mb-4">How It Works</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">1</div>
              <div>
                <div className="font-medium text-foreground">Share Your Link</div>
                <div className="text-sm text-muted-foreground">Share your unique referral link with friends</div>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">2</div>
              <div>
                <div className="font-medium text-foreground">Friend Signs Up</div>
                <div className="text-sm text-muted-foreground">They click your link and register - You get ₹20 instantly!</div>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">3</div>
              <div>
                <div className="font-medium text-foreground">Earn Forever</div>
                <div className="text-sm text-muted-foreground">Get 10% of their deposits + 2% of all their trades!</div>
              </div>
            </div>
          </div>
        </div>

        {/* Referrals List */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Your Referrals</h3>
          </div>
          {referrals.length > 0 ? (
            <div className="divide-y divide-border">
              {referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                      <span className="text-primary font-bold">{referral.name.charAt(0)}</span>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{referral.name}</div>
                      <div className="text-xs text-muted-foreground">Joined {referral.joinDate}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-profit">+₹{referral.yourEarnings}</div>
                    <div className="text-xs text-muted-foreground">Deposit: ₹{referral.totalDeposit}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Users size={48} className="text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">No referrals yet</p>
              <p className="text-sm text-muted-foreground">Share your code to start earning!</p>
            </div>
          )}
        </div>
      </main>

      <BottomNav activeTab="referral" onTabChange={onNavigate} />
    </div>
  );
};

export default ReferralPage;
