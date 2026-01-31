import { createContext, useContext, useEffect, ReactNode } from "react";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";

interface TelegramContextType {
  isReady: boolean;
  isTelegram: boolean;
  user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
  } | null;
  colorScheme: "light" | "dark";
  startParam: string | null;
  hapticImpact: (style?: "light" | "medium" | "heavy") => void;
  hapticNotification: (type: "success" | "error" | "warning") => void;
  hapticSelection: () => void;
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
  showMainButton: (text: string, onClick: () => void) => void;
  hideMainButton: () => void;
  showBackButton: (onClick: () => void) => void;
  hideBackButton: () => void;
  closeApp: () => void;
  openLink: (url: string, tryInstantView?: boolean) => void;
  getInitData: () => string | null;
}

const TelegramContext = createContext<TelegramContextType | null>(null);

export const useTelegram = () => {
  const context = useContext(TelegramContext);
  if (!context) {
    throw new Error("useTelegram must be used within TelegramWebAppProvider");
  }
  return context;
};

interface TelegramWebAppProviderProps {
  children: ReactNode;
}

export const TelegramWebAppProvider = ({ children }: TelegramWebAppProviderProps) => {
  const telegram = useTelegramWebApp();

  // Apply Telegram theme to CSS variables
  useEffect(() => {
    if (telegram.isTelegram && window.Telegram?.WebApp?.themeParams) {
      const params = window.Telegram.WebApp.themeParams;
      const root = document.documentElement;
      
      // Map Telegram theme to CSS variables if needed
      if (params.bg_color) {
        root.style.setProperty("--tg-bg-color", params.bg_color);
      }
      if (params.text_color) {
        root.style.setProperty("--tg-text-color", params.text_color);
      }
      if (params.hint_color) {
        root.style.setProperty("--tg-hint-color", params.hint_color);
      }
      if (params.button_color) {
        root.style.setProperty("--tg-button-color", params.button_color);
      }
      if (params.button_text_color) {
        root.style.setProperty("--tg-button-text-color", params.button_text_color);
      }
      if (params.secondary_bg_color) {
        root.style.setProperty("--tg-secondary-bg-color", params.secondary_bg_color);
      }
    }
  }, [telegram.isTelegram]);

  // Handle viewport changes in Telegram
  useEffect(() => {
    if (telegram.isTelegram) {
      const handleViewportChanged = () => {
        // Force re-render on viewport change
        document.documentElement.style.setProperty(
          "--tg-viewport-height",
          `${window.Telegram?.WebApp?.viewportHeight}px`
        );
        document.documentElement.style.setProperty(
          "--tg-viewport-stable-height",
          `${window.Telegram?.WebApp?.viewportStableHeight}px`
        );
      };

      // Initial set
      handleViewportChanged();

      // Note: Telegram WebApp doesn't have addEventListener, 
      // viewport changes are handled automatically
    }
  }, [telegram.isTelegram]);

  return (
    <TelegramContext.Provider value={telegram}>
      {children}
    </TelegramContext.Provider>
  );
};

export default TelegramWebAppProvider;
