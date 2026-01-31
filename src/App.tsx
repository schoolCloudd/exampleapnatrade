import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TelegramWebAppProvider } from "@/components/TelegramWebAppProvider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AdminRoute from "./pages/AdminRoute";
import EditProfilePage from "./pages/EditProfilePage";
import HelpPage from "./pages/HelpPage";
import TermsPage from "./pages/TermsPage";
import LanguagePage from "./pages/LanguagePage";
import AdminQAPage from "./pages/AdminQAPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TelegramWebAppProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/apnadradeadmin/auth" element={<AdminRoute />} />
            <Route path="/apnadradeadmin/qa" element={<AdminQAPage />} />
            <Route path="/profile/edit" element={<EditProfilePage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/language" element={<LanguagePage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </TelegramWebAppProvider>
  </QueryClientProvider>
);

export default App;
