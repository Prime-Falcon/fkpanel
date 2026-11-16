# fpanel: your own SMM shop inside Telegram

fpanel is a Telegram bot and Mini App that sells social media growth services (followers, views, likes and more for Telegram, Instagram, TikTok, YouTube, X and 30+ platforms). Customers pay with **Telegram Stars**, and every order is fulfilled automatically through your fpanel API key. You set the prices; the markup is your profit.

It runs on **Cloudflare's free plan** and deploys in a few clicks. Name, logo, colors and links are yours to set.

Maintained by **Ashraful Zaman** ([Avirah](https://www.avirah.com.bd)).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Prime-Falcon/fkpanel)

---

## Features

- **Full shop in a Mini App**: browse platform → category → service, order form with every fpanel option, order tracking, wallet, refunds, order history, referral program.
- **Telegram Stars payments**: top up a balance (presets or any amount) or pay for a single order directly.
- **Automatic catalog and prices**: services, categories and prices sync from fpanel on a schedule. New services can go on sale automatically; services fpanel removes or pauses are taken off sale.
- **Your pricing**: default markup, per platform, per category or per service, or a fixed price per service.
- **Live order updates**: instant fpanel webhooks plus a once-a-minute check. The bot messages customers when an order finishes, and refunds undelivered parts automatically.
- **White-label branding**: your name, logo, welcome banner, 10 color themes or any custom color, website and terms links, custom welcome text, optional Telegram Premium custom emojis in bot messages.
- **20 languages** for customers (English, Español, Português, Русский, Türkçe, العربية, हिन्दी, Indonesia, Français, 中文, Deutsch, Italiano, Polski, Українська, 日本語, 한국어, Tiếng Việt, فارسی, اردو, বাংলা).
- **Admin panel inside Telegram**: sales and profit, orders, users and balances, payments and Stars refunds, referrals, price changes, branding, admins and settings. Admins also get a **/broadcast** menu in the bot.
- **Optional update channel gate**: require customers to join your channel before ordering.

---

## What you need

1. A **Telegram bot**: open [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token.
2. A **fpanel account and API key**: sign up on [fpanel](https://fpanel.avirah.com.bd) and create an API key on the developers page.
3. A free **Cloudflare** account and a **GitHub** account.

---

## Deploy in one click

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Prime-Falcon/fkpanel)

1. Click **Deploy to Cloudflare** and sign in (connect your GitHub account when Cloudflare asks).
2. Cloudflare copies this project to your GitHub, creates the database and asks for:
   - `BOT_TOKEN`: your bot token from @BotFather.
   - `NOTPANEL_API_KEY`: your fpanel API key (starts with `np_live_`).
   - `OWNER_IDS` (optional): your Telegram user ID, if you want to be admin straight away. Leave it empty to claim admin in the next step instead.
3. When the deploy finishes, open your app's address (for example `https://fpanel-miniapp.<you>.workers.dev`).
4. The setup page asks for your bot token once (to prove the bot is yours), checks your fpanel key, and sets up everything in Telegram for you: webhook, the **Open App** button, commands, and the bot's name and description in all languages.
5. Tap **Claim admin**. Telegram opens your bot with a one-time code, and you're the admin.
6. Open your bot, tap **Open App**, then **Profile → Admin** to set your markup, branding and links.

---

## Alternative: Deploy from Cloudflare Dashboard (Workers & Pages)

If you connect directly via Cloudflare Dashboard:
1. Fork or clone this repository to your own GitHub account (`https://github.com/Prime-Falcon/fkpanel`).
2. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Pages** or **Workers**.
3. Select **Import a repository** / **Connect to Git** and choose `fkpanel`.
4. Configure Build settings:
   - **Build command**: `npm run build`
   - **Deploy command**: `npm run deploy`
5. Under **Settings → Variables and Secrets**, add your `BOT_TOKEN` and `NOTPANEL_API_KEY`.

---

## Develop locally

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Checks:
```bash
npm run typecheck && npm test && npm run build
```

---

## Credits & License

Maintained by **Ashraful Zaman** ([Avirah](https://www.avirah.com.bd)).  
See [LICENSE](LICENSE) for license details.
