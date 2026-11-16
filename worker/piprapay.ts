// Developed & integrated by Ashraful Zaman — https://www.avirah.com.bd
import type { Env } from "./env";
import { getSettings, type Settings } from "./settings";
import { botText } from "./i18n";
import { balanceText, starsText } from "./botMessages";
import { tg, webAppButton } from "./telegram";
import { pickLang } from "../shared/types";

export interface PipraPayInvoiceResult {
  ok: boolean;
  paymentId?: number;
  paymentUrl?: string;
  invoiceId?: string;
  error?: string;
}

export interface PipraPayVerifyResult {
  status?: string;
  amount?: number | string;
  currency?: string;
  metadata?: string | { user_id?: string; invoiceid?: string };
  pp_id?: string;
  message?: string;
}

/** Cleans base URL: removes trailing slashes and /api */
export function getPipraPayBaseUrl(s: Pick<Settings, "piprapay_api_url">): string {
  let url = (s.piprapay_api_url || "").trim();
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/api$/, "");
  return url;
}

/** Creates a pending payment and requests a payment URL from the OptimumPay / PipraPay gateway */
export async function createPipraPayInvoice(
  env: Env,
  s: Settings,
  opts: {
    userId: number;
    amountBdt: number;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    origin: string;
  },
): Promise<PipraPayInvoiceResult> {
  const base = getPipraPayBaseUrl(s);
  const apiKey = (s.piprapay_api_key || "").trim();
  if (!base || !apiKey) {
    return { ok: false, error: "OptimumPay / PipraPay API URL or Key is not configured." };
  }

  const amountBdt = Math.round(opts.amountBdt * 100) / 100;
  if (!(amountBdt > 0)) {
    return { ok: false, error: "Invalid amount." };
  }

  const bdtPerUsd = s.bdt_per_usd > 0 ? s.bdt_per_usd : 125;
  const usd = amountBdt / bdtPerUsd;
  const amountMicro = Math.round(usd * 1_000_000);
  const starsEquivalent = Math.max(1, Math.round(usd * (s.stars_per_usd || 77)));
  const now = Math.floor(Date.now() / 1000);

  // Insert pending payment into DB
  const row = await env.DB.prepare(
    `INSERT INTO payments (user_id, stars, amount, draft, status, created_at)
     VALUES (?1, ?2, ?3, ?4, 'pending', ?5)
     RETURNING id`,
  )
    .bind(opts.userId, starsEquivalent, amountMicro, JSON.stringify({ method: "piprapay", bdt: amountBdt }), now)
    .first<{ id: number }>();

  if (!row) return { ok: false, error: "Failed to initialize payment." };
  const paymentId = row.id;

  const hexSuffix = Math.random().toString(16).slice(2, 8);
  const invoiceId = `INV_${paymentId}_${opts.userId}_${hexSuffix}`;

  const returnUrl = `${opts.origin}/hooks/piprapay/return`;
  const webhookUrl = `${opts.origin}/hooks/piprapay`;

  const payload = {
    full_name: opts.customerName || "Customer",
    email_address: opts.customerEmail || "customer@telegram.org",
    mobile_number: opts.customerPhone || "01700000000",
    amount: amountBdt.toFixed(2),
    currency: "BDT",
    metadata: JSON.stringify({
      user_id: String(opts.userId),
      invoiceid: invoiceId,
    }),
    return_url: returnUrl,
    webhook_url: webhookUrl,
  };

  const endpoints = [`${base}/api/checkout/redirect`, `${base}/api/create-charge`];
  const headers = {
    "Content-Type": "application/json",
    "MHS-PIPRAPAY-API-KEY": apiKey,
    "mh-piprapay-api-key": apiKey,
    "api-key": apiKey,
  };

  let lastError = "Unable to contact payment gateway.";
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        lastError = `Gateway returned non-JSON response (${res.status})`;
        continue;
      }

      const paymentUrl = data?.pp_url || data?.payment_url || data?.data?.pp_url || data?.data?.payment_url;
      if (paymentUrl && (data.status === true || data.status === "true" || data.status === "success" || !data.error)) {
        return {
          ok: true,
          paymentId,
          paymentUrl,
          invoiceId,
        };
      }

      if (data?.message) lastError = String(data.message);
      else if (data?.error) lastError = String(data.error);
    } catch (e) {
      lastError = (e as Error).message;
    }
  }

  return { ok: false, paymentId, error: lastError };
}

/** Verifies a payment with the PipraPay / OptimumPay gateway */
export async function verifyPipraPayPayment(_env: Env | undefined, s: Settings, ppId: string): Promise<PipraPayVerifyResult> {
  const base = getPipraPayBaseUrl(s);
  const apiKey = (s.piprapay_api_key || "").trim();
  if (!base || !apiKey) {
    return { status: "failed", message: "API credentials not configured." };
  }

  const endpoints = [
    `${base}/api/verify-payment`,
    `${base}/api/verify-payments`,
    `${base}/api/verify-charge`,
  ];
  const headers = {
    "Content-Type": "application/json",
    "MHS-PIPRAPAY-API-KEY": apiKey,
    "mh-piprapay-api-key": apiKey,
    "api-key": apiKey,
  };

  const body = JSON.stringify({ pp_id: ppId, api_key: apiKey });
  let lastError = "Unable to verify payment with gateway.";

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(20_000),
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }

      if (data && typeof data === "object") {
        return data as PipraPayVerifyResult;
      }
    } catch (e) {
      lastError = (e as Error).message;
    }
  }

  return { status: "failed", message: lastError };
}

/** Settles a payment: verifies with gateway, checks status, credits user balance once */
export async function settlePipraPayPayment(env: Env, ppId: string): Promise<{ ok: boolean; already?: boolean; error?: string; paymentId?: number }> {
  const s = await getSettings(env, { fresh: true });
  const verify = await verifyPipraPayPayment(env, s, ppId);

  const status = String(verify.status ?? "").toLowerCase().trim();
  const validStatus = ["completed", "success", "paid"].includes(status);
  if (!validStatus) {
    return { ok: false, error: `Payment status '${status}' is not completed` };
  }

  let meta: any = verify.metadata ?? {};
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }

  const invoiceId = String(meta.invoiceid ?? meta.invoice_id ?? "");
  let paymentId: number | null = null;
  if (invoiceId.startsWith("INV_")) {
    const parts = invoiceId.split("_");
    paymentId = Number(parts[1]) || null;
  }

  let paymentRow: { id: number; user_id: number; amount: number; stars: number; status: string; charge_id: string | null } | null = null;

  if (paymentId) {
    paymentRow = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(paymentId).first();
  }

  if (!paymentRow) {
    paymentRow = await env.DB.prepare("SELECT * FROM payments WHERE charge_id = ?1").bind(ppId).first();
  }

  if (!paymentRow) {
    return { ok: false, error: "Payment record not found." };
  }

  if (paymentRow.status === "paid") {
    return { ok: true, already: true, paymentId: paymentRow.id };
  }

  const now = Math.floor(Date.now() / 1000);
  const [mark] = await env.DB.batch([
    env.DB.prepare("UPDATE payments SET status = 'paid', charge_id = ?2, paid_at = ?3 WHERE id = ?1 AND status = 'pending'").bind(
      paymentRow.id,
      ppId,
      now,
    ),
    env.DB.prepare("INSERT INTO ledger (user_id, delta, kind, ref, created_at) SELECT ?1, ?2, 'topup', ?3, ?4 WHERE changes() = 1").bind(
      paymentRow.user_id,
      paymentRow.amount,
      paymentRow.id,
      now,
    ),
    env.DB.prepare("UPDATE users SET balance = balance + ?2 WHERE id = ?1 AND changes() = 1").bind(paymentRow.user_id, paymentRow.amount),
  ]);

  if (!mark.meta.changes) {
    return { ok: true, already: true, paymentId: paymentRow.id };
  }

  // Notify user via Telegram
  try {
    const user = await env.DB.prepare("SELECT lang, language_code FROM users WHERE id = ?1").bind(paymentRow.user_id).first<{ lang: string | null; language_code: string | null }>();
    const lang = pickLang(user?.lang ?? user?.language_code);
    const bal = await env.DB.prepare("SELECT balance FROM users WHERE id = ?1").bind(paymentRow.user_id).first<{ balance: number }>();
    const paidText = `${starsText(paymentRow.stars)}`;
    const button = s.app_url
      ? { inline_keyboard: [[webAppButton(botText(lang, "open"), `${s.app_url}/#/wallet`, "open")]] }
      : undefined;

    await tg(env.BOT_TOKEN, "sendMessage", {
      chat_id: paymentRow.user_id,
      text: botText(lang, "topupDone", { amount: paidText, balance: balanceText(bal?.balance ?? paymentRow.amount, s) }),
      parse_mode: "HTML",
      reply_markup: button,
    });
  } catch (e) {
    console.warn("Failed to send payment confirmation to Telegram user:", (e as Error).message);
  }

  return { ok: true, paymentId: paymentRow.id };
}

/** Tests the gateway connection with a 10 BDT test charge */
export async function testPipraPayConnection(
  _env: Env | undefined,
  s: Settings,
  origin: string,
): Promise<{ ok: boolean; message: string }> {
  const base = getPipraPayBaseUrl(s);
  const apiKey = (s.piprapay_api_key || "").trim();
  if (!base) return { ok: false, message: "API URL is required." };
  if (!apiKey) return { ok: false, message: "API Key is required." };

  const endpoints = [`${base}/api/checkout/redirect`, `${base}/api/create-charge`];
  const payload = {
    full_name: "Test User",
    email_address: "test@example.com",
    mobile_number: "01700000000",
    amount: "10.00",
    currency: "BDT",
    metadata: JSON.stringify({ user_id: "1", invoiceid: `TEST_${Date.now()}` }),
    return_url: `${origin}/hooks/piprapay/return`,
    webhook_url: `${origin}/hooks/piprapay`,
  };

  const headers = {
    "Content-Type": "application/json",
    "MHS-PIPRAPAY-API-KEY": apiKey,
    "mh-piprapay-api-key": apiKey,
    "api-key": apiKey,
  };

  let lastError = "Unable to connect to gateway.";
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        lastError = `Gateway returned HTTP ${res.status}: ${text.slice(0, 100)}`;
        continue;
      }

      if (data?.pp_url || data?.payment_url || data?.status === true || data?.status === "true" || data?.status === "success") {
        return { ok: true, message: "Connection successful! Gateway accepted API key and URL." };
      }

      if (data?.message) lastError = String(data.message);
      else if (data?.error) lastError = String(data.error);
    } catch (e) {
      lastError = (e as Error).message;
    }
  }

  return { ok: false, message: lastError };
}
