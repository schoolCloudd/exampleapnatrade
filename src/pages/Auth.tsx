import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, User, ArrowRight, Ticket } from "lucide-react";
import Logo from "@/components/Logo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = "login" | "signup" | "name";

interface AuthProps {
  onAuth: (name: string, referralCode?: string) => Promise<{ error: Error | null }>;
  onSignUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  onSignIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  needsProfile: boolean;
}

const Auth = ({ onAuth, onSignUp, onSignIn, needsProfile }: AuthProps) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>(needsProfile ? "name" : "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Debug logging
  console.log("[Auth] Component rendered:", {
    mode,
    needsProfile,
    loading,
    hasName: !!name,
    hasEmail: !!email,
    hasPassword: !!password
  });

  // Update mode based on needsProfile
  useEffect(() => {
    setMode(needsProfile ? "name" : "signup");
  }, [needsProfile]);

  // Load referral code from localStorage
  useEffect(() => {
    const storedReferral = localStorage.getItem('referred_by');
    if (storedReferral && storedReferral !== 'null' && storedReferral !== 'undefined') {
      setReferralCode(storedReferral);
    }
  }, []);

  // Remove the redirect logic that was causing loops
  // Profile creation is handled by the parent component

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "name") {
        const { error } = await onAuth(name, referralCode || undefined);
        if (error) {
          toast.error(error.message || "Failed to create profile");
        } else {
          toast.success(`Welcome to ApnaTrade, ${name}!`);
          navigate("/");
        }
      } else if (mode === "login") {
        const { error } = await onSignIn(email, password);
        if (error) {
          toast.error(error.message || "Invalid email or password");
        }
      } else {
        const { error } = await onSignUp(email, password);
        if (error) {
          if (error.message?.includes("already registered")) {
            toast.error("This email is already registered. Please login instead.");
          } else {
            toast.error(error.message || "Failed to sign up");
          }
        } else {
          setMode("name");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    }

    setLoading(false);
  };


  return (
    <div className="min-h-screen bg-gradient-dark flex flex-col">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-profit/5 rounded-full blur-3xl" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <Logo size="lg" />
            </div>
            <p className="text-muted-foreground">
              {mode === "name"
                ? "Almost there! Enter your name"
                : mode === "login"
                ? "Welcome back, trader!"
                : "Start your trading journey"}
            </p>
          </div>

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "name" ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Your Name</label>
                  <div className="relative">
                    <User
                      size={20}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your name"
                      required
                      className="w-full pl-12 pr-4 py-4 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Referral Code (Optional)</label>
                  <div className="relative">
                    <Ticket
                      size={20}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      placeholder="Enter referral code"
                      className="w-full pl-12 pr-4 py-4 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  {referralCode && (
                    <p className="text-xs text-green-600">Referral code detected! You'll earn bonuses.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Email</label>
                  <div className="relative">
                    <Mail
                      size={20}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="w-full pl-12 pr-4 py-4 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Password</label>
                  <div className="relative">
                    <Lock
                      size={20}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      minLength={6}
                      className="w-full pl-12 pr-12 py-4 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-gold text-primary-foreground font-bold rounded-xl glow-gold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  {mode === "name" ? "Start Trading" : mode === "login" ? "Login" : "Sign Up"}
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          {mode !== "name" && (
            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-primary hover:underline font-medium"
              >
                {mode === "login" ? "Sign Up" : "Login"}
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 text-center text-xs text-muted-foreground">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </div>
    </div>
  );
};

export default Auth;
