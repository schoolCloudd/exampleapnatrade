# 🚀 ApnaTrade - Telegram Web App Deployment Guide

Complete guide for deploying ApnaTrade as a Telegram Web App (TWA).

## 📋 Prerequisites

1. **Telegram Account** - You need a Telegram account
2. **Published App URL** - Your Lovable app must be published (e.g., `https://your-app.lovable.app`)
3. **BotFather Access** - Telegram's official bot for creating bots

---

## 🤖 Step 1: Create Your Bot

### Open BotFather
1. Open Telegram and search for `@BotFather`
2. Start a chat with BotFather
3. Send `/newbot`

### Set Bot Details
```
BotFather: Alright, a new bot. How are we going to call it?
You: ApnaTrade (or your preferred name)

BotFather: Good. Now let's choose a username for your bot.
You: ApnaTradeBot (must end with 'bot')
```

### Save Your Bot Token
BotFather will give you a token like:
```
7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
```
**⚠️ SAVE THIS TOKEN SECURELY - You'll need it!**

---

## 🌐 Step 2: Configure Web App

### Set Web App URL
Send to BotFather:
```
/setmenubutton
```

1. Select your bot
2. Send your published app URL:
```
https://your-app.lovable.app
```

### Alternative: Inline Menu Button
```
/mybots
→ Select your bot
→ Bot Settings
→ Menu Button
→ Configure menu button
→ Enter your app URL
→ Set button text (e.g., "🎮 Open App")
```

---

## 🔐 Step 3: Add Bot Token to Secrets

### In Lovable:
1. Go to **Settings** → **Cloud** → **Secrets**
2. Add new secret:
   - **Name:** `TELEGRAM_BOT_TOKEN`
   - **Value:** Your bot token from BotFather

### Or via Admin Panel:
1. Go to `/apnadradeadmin/auth`
2. Login with admin credentials
3. Go to **Settings** tab
4. Add Telegram Bot Token in the bot settings section

---

## ⚙️ Step 4: Deploy Edge Functions

Edge functions are deployed automatically when you publish, but verify:

1. `telegram-auth` - Handles Telegram authentication
2. `nowpayments-webhook` - Processes deposits
3. `nowpayments-payout` - Processes withdrawals
4. `settle-trade` - Settles trades
5. `admin-action` - Admin operations
6. `rate-limiter` - Rate limiting

---

## 🧪 Step 5: Test Your Bot

### Open in Telegram
1. Search for your bot username (e.g., `@ApnaTradeBot`)
2. Start the bot with `/start`
3. Click the "Open App" button or menu button

### Expected Behavior
- App opens in Telegram's WebView
- User is automatically logged in (no signup form)
- Telegram username/name is used for profile
- Native Telegram UI elements work (back button, share, etc.)

---

## 🔧 Troubleshooting

### "TELEGRAM_BOT_TOKEN not configured"
- Ensure the secret is added in Lovable Settings → Cloud → Secrets
- Redeploy edge functions after adding

### "Invalid Telegram authentication"
- Check bot token is correct
- Ensure initData is being sent from frontend
- Check auth_date is not expired (24 hours)

### App doesn't auto-login
- Make sure you're opening from Telegram (not browser)
- Check browser console for errors
- Verify edge function logs

### White screen in Telegram
- Check if app URL is HTTPS (required)
- Verify the domain is accessible
- Check for JavaScript errors in console

---

## 📱 Telegram Bot Commands (Optional)

Add helpful commands via BotFather:
```
/setcommands

start - Start the app
help - Get help
support - Contact support
```

---

## 🎨 Customize Bot

### Set Bot Picture
```
/setuserpic
→ Select your bot
→ Send a 512x512 PNG image
```

### Set Bot Description
```
/setdescription
→ Select your bot
→ Send description text
```

### Set About Text
```
/setabouttext
→ Select your bot
→ Send about text
```

---

## 🔒 Security Features

When users open via Telegram:

1. **Cryptographic Verification** - initData is signed with bot token
2. **Auto-Authentication** - No password needed, Telegram ID is verified
3. **Session Management** - Supabase sessions are created server-side
4. **No Credential Exposure** - Users never see login forms

---

## 📊 Admin Panel

After deployment, access admin at:
```
https://your-app.lovable.app/apnadradeadmin/auth
```

### First Admin Setup:
1. Sign up normally through the app
2. Run in Supabase SQL Editor:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users 
WHERE email = 'your-admin@email.com';
```
3. Login at `/apnadradeadmin/auth`

---

## 🚀 Production Checklist

- [ ] Bot created and token saved
- [ ] Web App URL configured in BotFather
- [ ] TELEGRAM_BOT_TOKEN secret added
- [ ] Edge functions deployed
- [ ] NowPayments configured (if using crypto)
- [ ] Admin account created
- [ ] Tested login flow in Telegram
- [ ] Tested deposit/withdraw flow
- [ ] Tested trading functionality
- [ ] Kill-switches tested
- [ ] Telegram Bot commands set

---

## 📞 Support

For issues:
1. Check edge function logs in Lovable
2. Check browser console in Telegram WebView
3. Contact Telegram: https://t.me/King_of_tradea

---

## 🔗 Useful Links

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Web Apps](https://core.telegram.org/bots/webapps)
- [BotFather](https://t.me/BotFather)
- [Lovable Docs](https://docs.lovable.dev)

---

**Happy Trading! 🎯**
