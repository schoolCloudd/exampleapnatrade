import { useEffect, useState, useCallback } from "react";

// Telegram Web App types
interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramUser;
    auth_date?: number;
    hash?: string;
    start_param?: string;
  };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: Array<{
      id?: string;
      type?: "default" | "ok" | "close" | "cancel" | "destructive";
      text?: string;
    }>;
  }, callback?: (buttonId: string) => void) => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  BackButton: {
    isVisible: boolean;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  CloudStorage: {
    setItem: (key: string, value: string, callback?: (error: Error | null, stored: boolean) => void) => void;
    getItem: (key: string, callback: (error: Error | null, value: string | null) => void) => void;
    getItems: (keys: string[], callback: (error: Error | null, values: Record<string, string>) => void) => void;
    removeItem: (key: string, callback?: (error: Error | null, removed: boolean) => void) => void;
    removeItems: (keys: string[], callback?: (error: Error | null, removed: boolean) => void) => void;
    getKeys: (callback: (error: Error | null, keys: string[]) => void) => void;
  };
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  openInvoice: (url: string, callback?: (status: string) => void) => void;
  sendData: (data: string) => void;
  switchInlineQuery: (query: string, choose_chat_types?: string[]) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export const useTelegramWebApp = () => {
  const [isReady, setIsReady] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("dark");
  const [startParam, setStartParam] = useState<string | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    
    if (tg) {
      setIsTelegram(true);
      setColorScheme(tg.colorScheme);
      
      // Get user data
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user);
      }
      
      // Get start parameter (for deep links)
      if (tg.initDataUnsafe?.start_param) {
        setStartParam(tg.initDataUnsafe.start_param);
      }
      
      // Expand to full height
      tg.expand();
      
      // Set theme colors
      tg.setHeaderColor("#0a0a0a");
      tg.setBackgroundColor("#0a0a0a");
      
      // Enable closing confirmation for important actions
      tg.enableClosingConfirmation();
      
      // Signal that app is ready
      tg.ready();
      setIsReady(true);
      
      console.log("[TelegramWebApp] Initialized", {
        version: tg.version,
        platform: tg.platform,
        user: tg.initDataUnsafe?.user,
      });
    } else {
      // Not running in Telegram
      setIsReady(true);
    }
  }, []);

  // Haptic feedback helpers
  const hapticImpact = useCallback((style: "light" | "medium" | "heavy" = "medium") => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
  }, []);

  const hapticNotification = useCallback((type: "success" | "error" | "warning") => {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
  }, []);

  const hapticSelection = useCallback(() => {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
  }, []);

  // Alert/Confirm helpers
  const showAlert = useCallback((message: string): Promise<void> => {
    return new Promise((resolve) => {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(message, resolve);
      } else {
        alert(message);
        resolve();
      }
    });
  }, []);

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showConfirm(message, resolve);
      } else {
        resolve(confirm(message));
      }
    });
  }, []);

  // Main button helpers
  const showMainButton = useCallback((text: string, onClick: () => void) => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.MainButton.setText(text);
      tg.MainButton.onClick(onClick);
      tg.MainButton.show();
    }
  }, []);

  const hideMainButton = useCallback(() => {
    window.Telegram?.WebApp?.MainButton?.hide();
  }, []);

  // Back button helpers
  const showBackButton = useCallback((onClick: () => void) => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.BackButton.onClick(onClick);
      tg.BackButton.show();
    }
  }, []);

  const hideBackButton = useCallback(() => {
    window.Telegram?.WebApp?.BackButton?.hide();
  }, []);

  // Close app
  const closeApp = useCallback(() => {
    window.Telegram?.WebApp?.close();
  }, []);

  // Open external link
  const openLink = useCallback((url: string, tryInstantView = false) => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openLink(url, { try_instant_view: tryInstantView });
    } else {
      window.open(url, "_blank");
    }
  }, []);

  // Get init data for backend verification
  const getInitData = useCallback(() => {
    return window.Telegram?.WebApp?.initData || null;
  }, []);

  return {
    isReady,
    isTelegram,
    user,
    colorScheme,
    startParam,
    hapticImpact,
    hapticNotification,
    hapticSelection,
    showAlert,
    showConfirm,
    showMainButton,
    hideMainButton,
    showBackButton,
    hideBackButton,
    closeApp,
    openLink,
    getInitData,
    webApp: window.Telegram?.WebApp || null,
  };
};

export default useTelegramWebApp;
