# 🚀 Complete Telegram Web App Deployment Guide for ApnaTrade

## 📋 Prerequisites

Before starting, ensure you have:

- ✅ Node.js 18+ installed
- ✅ Git account
- ✅ Supabase project
- ✅ Telegram account
- ✅ Domain/Hosting (Vercel, Netlify, or Firebase)

---

## 🤖 Step 1: Create Telegram Bot

### 1.1 Create Bot via BotFather

1. **Open Telegram** and search for `@BotFather`
2. **Send command**: `/newbot`
3. **Bot Name**: `ApnaTrade` (display name)
4. **Username**: `apnatrade_yourname_bot` (must end with 'bot')
5. **Save the Bot Token** securely (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789`)

### 1.2 Configure Bot Settings

Send these commands to BotFather:

```
/setdescription
ApnaTrade - Advanced Crypto Trading Platform
Trade cryptocurrencies with real-time charts and instant settlements.

/setabouttext
🚀 Trade BTC, ETH & more with 85% profit payouts!

/setcommands
trade - Start trading cryptocurrencies
wallet - Manage your wallet and deposits
referral - View referral earnings
profile - Account settings
help - Get help and support

/setinline
# Select your bot and enable inline mode

/setwebapp
# Select your bot and enter your web app URL when deployed
```

---

## 🗄️ Step 2: Supabase Setup

### 2.1 Create Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Note down:
   - Project URL: `https://abcdefghijklmnop.supabase.co`
   - Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - Service Role Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 2.2 Database Setup

Run the provided `database-setup.sql` in Supabase SQL Editor:

```sql
-- Copy and paste the entire database-setup.sql content here
```

### 2.3 Enable Edge Functions

```bash
supabase functions deploy
```

### 2.4 Configure Authentication

In Supabase Dashboard → Authentication → Settings:
- ✅ Enable email confirmations
- ✅ Enable password recovery
- Site URL: `https://your-deployment-domain.com`

---

## 🔧 Step 3: Environment Configuration

### 3.1 Create Environment Files

Create `.env.production`:

```env
# Supabase
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Telegram
VITE_TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789

# Optional: Analytics
VITE_GA_TRACKING_ID=G-XXXXXXXXXX
```

Create `.env.local` for development:

```env
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_TELEGRAM_BOT_TOKEN=your_bot_token
```

### 3.2 Telegram Web App Manifest

Create `public/manifest.json`:

```json
{
  "name": "ApnaTrade",
  "short_name": "ApnaTrade",
  "description": "Advanced Crypto Trading Platform with Telegram Integration",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#f59e0b",
  "orientation": "portrait-primary",
  "scope": "/",
  "icons": [
    {
      "src": "/favicon.ico",
      "sizes": "64x64",
      "type": "image/x-icon"
    }
  ]
}
```

---

## 🏗️ Step 4: Build Optimization

### 4.1 Update vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['lucide-react', 'sonner'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  },
  define: {
    global: 'globalThis',
  }
})
```

### 4.2 Update index.html Meta Tags

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#f59e0b" />
  <meta name="description" content="Trade cryptocurrencies with ApnaTrade - Advanced trading platform with Telegram integration" />

  <!-- Telegram Web App Meta Tags -->
  <meta property="og:title" content="ApnaTrade - Crypto Trading" />
  <meta property="og:description" content="Trade BTC, ETH & more with instant settlements" />
  <meta property="og:image" content="/og-image.png" />

  <!-- Preconnect to external domains -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

  <title>ApnaTrade - Crypto Trading Platform</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

---

## 🚀 Step 5: Deployment

### 5.1 Vercel Deployment (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel --prod
   ```

3. **Set Environment Variables**:
   ```bash
   vercel env add VITE_SUPABASE_URL
   vercel env add VITE_SUPABASE_ANON_KEY
   vercel env add VITE_TELEGRAM_BOT_TOKEN
   ```

4. **Redeploy**:
   ```bash
   vercel --prod
   ```

### 5.2 Alternative: Netlify

1. **Build locally**:
   ```bash
   npm run build
   ```

2. **Deploy to Netlify**:
   - Drag `dist` folder to Netlify dashboard
   - Set environment variables in site settings

### 5.3 Alternative: Firebase

1. **Install Firebase CLI**:
   ```bash
   npm i -g firebase-tools
   ```

2. **Initialize**:
   ```bash
   firebase init hosting
   ```

3. **Deploy**:
   ```bash
   firebase deploy --only hosting
   ```

---

## ⚙️ Step 6: Telegram Configuration

### 6.1 Set Menu Button

1. Send to BotFather: `/setmenubutton`
2. Select your bot
3. Send: `https://your-deployment-domain.com`

### 6.2 Configure Web App

1. Send to BotFather: `/setwebapp`
2. Select your bot
3. Send your deployment URL

### 6.3 Test Web App

1. Open Telegram → Find your bot
2. Click the menu button at bottom
3. Web app should open in Telegram WebView

---

## 🧪 Step 7: Testing Checklist

### 7.1 Pre-Deployment Testing

- ✅ **Local Development**:
  ```bash
  npm run dev
  ```
  - Test all features work
  - Check console for errors

- ✅ **Production Build**:
  ```bash
  npm run build
  npm run preview
  ```
  - Test built version locally

### 7.2 Telegram Testing

- ✅ **Web App Opens**: Menu button works
- ✅ **Authentication**: Login/signup works
- ✅ **Trading**: Can place and settle trades
- ✅ **Wallet**: Deposits/withdrawals work
- ✅ **Referrals**: Link generation and bonuses work
- ✅ **Mobile**: Responsive design works

### 7.3 Error Checking

- ✅ **Console Errors**: No JavaScript errors
- ✅ **Network Errors**: All API calls succeed
- ✅ **CORS Issues**: Supabase requests work
- ✅ **Telegram API**: WebApp functions work

---

## 🔧 Step 8: Troubleshooting

### 8.1 Common Issues & Solutions

#### **Web App Won't Open**
```bash
# Check if URL is correct
/setwebapp
https://your-domain.com
```

#### **Authentication Fails**
- ✅ Check Bot Token is correct
- ✅ Verify Supabase keys are set
- ✅ Ensure Edge Functions are deployed

#### **CORS Errors**
- ✅ Add your domain to Supabase CORS settings
- ✅ Check VITE_ environment variables

#### **Telegram WebApp Errors**
```javascript
// Add to console for debugging
console.log(window.Telegram?.WebApp);
```

#### **Build Errors**
```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
npm run build
```

### 8.2 Debug Commands

```bash
# Check if bot is responding
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe"

# Test web app URL
curl -I "https://your-deployment-domain.com"

# Check Supabase connection
curl "https://your-project.supabase.co/rest/v1/" \
  -H "apikey: YOUR_ANON_KEY"
```

---

## 📱 Step 9: Post-Deployment

### 9.1 Update BotFather Description

```
/setdescription
🚀 ApnaTrade - Trade cryptocurrencies with real-time charts!

Features:
• Live BTC/ETH price feeds
• 85% profit payouts
• Instant settlements
• Referral bonuses
• Secure wallet management

Start trading now!
```

### 9.2 Create Welcome Message

Set up bot commands and welcome message in your bot's code.

### 9.3 Monitor & Analytics

- Set up error monitoring (Sentry)
- Add analytics (Google Analytics)
- Monitor Supabase usage

---

## 🎯 Step 10: Go Live

1. ✅ **Test everything thoroughly**
2. ✅ **Update all environment variables**
3. ✅ **Verify Telegram integration**
4. ✅ **Share with users**

Your ApnaTrade Telegram Web App is now ready! 🚀

---

## 📞 Support

If you encounter issues:
1. Check this guide first
2. Review console errors
3. Verify all environment variables
4. Test Supabase connection
5. Check Telegram BotFather settings

**Happy Trading! 🎯**