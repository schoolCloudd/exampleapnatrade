import { useNavigate } from "react-router-dom";
import { ArrowLeft, HelpCircle, MessageCircle, FileQuestion, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const HelpPage = () => {
  const navigate = useNavigate();

  const helpItems = [
    {
      icon: FileQuestion,
      label: "FAQs",
      description: "Find answers to common questions",
      action: () => toast.info("FAQs coming soon"),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
        >
          <ArrowLeft size={24} className="text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Help & Support</h1>
      </div>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-6">
        {/* Help Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center">
            <HelpCircle size={40} className="text-primary" />
          </div>
        </div>

        <p className="text-center text-muted-foreground">
          How can we help you today?
        </p>

        {/* Help Options */}
        <div className="glass-card rounded-2xl overflow-hidden">
          {helpItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={item.action}
                className={`w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-all ${
                  index < helpItems.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Icon size={20} className="text-muted-foreground" />
                  </div>
                  <div className="text-left">
                    <span className="font-medium text-foreground block">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </div>
                </div>
                <ChevronRight size={20} className="text-muted-foreground" />
              </button>
            );
          })}
        </div>

        {/* Quick Tips */}
        <div className="glass-card rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-foreground">Quick Tips</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Trading is available 24/7</li>
            <li>• Minimum trade amount is ₹10</li>
            <li>• Withdrawals are processed within 24 hours</li>
            <li>• Keep your account secure with 2FA</li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default HelpPage;
