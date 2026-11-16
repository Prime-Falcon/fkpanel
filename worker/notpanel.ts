// Maintained & customized by Ashraful Zaman — https://www.avirah.com.bd
// SMMGen API v2 client. https://my.smmgen.com/api/v2
import { looksLikeNotPanelKey } from "../shared/brand";
import { platformName } from "../shared/platforms";
import type { Env } from "./env";
import { getSettings, type Settings } from "./settings";

const BASE = "https://my.smmgen.com/api/v2";

export class NotPanelError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface NpService {
  service: string | number;
  name: string;
  type: string;
  category: string;
  rate: string;
  min: string | number;
  max: string | number;
  refill: boolean;
  cancel: boolean;
  dripfeed: boolean;
  type_key: string;
  platform: string | null;
  fields: unknown[];
  drip_feed: unknown;
  step: number;
  availability: string;
  average_time_minutes: number | null;
}

export interface NpStatus {
  order?: number;
  status: string;
  status_key: string;
  charge?: string;
  start_count?: string | number | null;
  remains?: string | number | null;
  refund?: string;
  reason_code?: string | null;
  can_cancel?: boolean;
  cancel_available?: boolean;
  can_refill?: boolean;
  error?: string;
  error_code?: string;
}

export interface NpAddResult {
  order: number;
  status_key: string;
  charge: string;
  cancel_available?: boolean;
  cancel_before?: string;
  replayed?: boolean;
}

/** The key in use: the one saved in setup/admin, else the NOTPANEL_API_KEY secret. */
export const npKey = (env: Pick<Env, "NOTPANEL_API_KEY">, s: Pick<Settings, "np_api_key">): string => s.np_api_key.trim() || env.NOTPANEL_API_KEY?.trim() || "";

export function detectPlatformAndCategory(rawCategory: string, rawName: string): { platform: string; category: string; categorySlug: string } {
  const combined = (rawCategory + " " + rawName).toLowerCase();
  let platform = "other";
  if (combined.includes("telegram")) platform = "telegram";
  else if (combined.includes("instagram")) platform = "instagram";
  else if (combined.includes("tiktok") || combined.includes("tik tok")) platform = "tiktok";
  else if (combined.includes("youtube")) platform = "youtube";
  else if (combined.includes("twitter") || combined.includes(" x ") || combined.startsWith("x ") || combined.includes("x ( twitter )")) platform = "twitter-x";
  else if (combined.includes("facebook")) platform = "facebook";
  else if (combined.includes("spotify")) platform = "spotify";
  else if (combined.includes("whatsapp")) platform = "whatsapp";
  else if (combined.includes("threads")) platform = "threads";
  else if (combined.includes("snapchat")) platform = "snapchat";
  else if (combined.includes("twitch")) platform = "twitch";
  else if (combined.includes("kick")) platform = "kick";
  else if (combined.includes("reddit")) platform = "reddit";
  else if (combined.includes("pinterest")) platform = "pinterest";
  else if (combined.includes("linkedin")) platform = "linkedin";
  else if (combined.includes("discord")) platform = "discord";
  else if (combined.includes("soundcloud")) platform = "soundcloud";
  else if (combined.includes("google")) platform = "google";

  // Clean category (strip leading "Platform - ")
  let cleanCategory = rawCategory
    .replace(/^([a-z0-9.\s()]+)\s*-\s*/i, "")
    .trim();
  if (!cleanCategory) cleanCategory = rawCategory.trim();
  const slug = cleanCategory.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return { platform, category: cleanCategory, categorySlug: slug || "general" };
}

export function fieldsForType(typeKey: string): unknown[] {
  if (typeKey === "custom_comments" || typeKey === "comment_replies") {
    return [{ key: "comments", kind: "lines", required: true, label: "Comments (one per line)" }];
  }
  if (typeKey === "mentions_custom_list") {
    return [{ key: "usernames", kind: "lines", required: true, label: "Usernames (one per line)" }];
  }
  if (typeKey === "comment_likes" || typeKey === "mentions_user_followers") {
    return [{ key: "username", kind: "text", required: true, label: "Username" }];
  }
  if (typeKey === "poll") {
    return [{ key: "answer_number", kind: "text", required: true, label: "Answer Number" }];
  }
  if (typeKey === "mentions_media_likers") {
    return [{ key: "media_url", kind: "text", required: true, label: "Media URL" }];
  }
  return [];
}

// In-memory cache for SMMGen services list (5 minutes)
let servicesCache: { key: string; at: number; timestamp: string; items: any[] } | null = null;

export async function np<T = unknown>(key: string, action: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  if (!looksLikeNotPanelKey(key)) throw new NotPanelError("Not a valid API key", "INVALID_KEY", false, 0);
  key = key.trim();

  // Webhooks are not used by SMMGen; order statuses are updated via polling
  if (action === "webhook.add" || action === "webhook.remove") {
    return { id: "none", secret: "" } as T;
  }

  // Fast-path for services filtering from cache
  if (action === "services" && params.service && servicesCache && servicesCache.key === key && Date.now() - servicesCache.at < 300_000) {
    const idSet = new Set(String(params.service).split(",").map((s) => s.trim()));
    const matched = servicesCache.items.filter((s) => idSet.has(String(s.service))).map((s) => {
      const d = detectPlatformAndCategory(String(s.category ?? ""), String(s.name ?? ""));
      const typeKey = String(s.type ?? "Default").toLowerCase().replace(/[\s-]+/g, "_");
      return {
        service: String(s.service),
        name: String(s.name),
        type: String(s.type ?? "Default"),
        category: d.category,
        rate: String(s.rate),
        min: s.min,
        max: s.max,
        refill: !!s.refill,
        cancel: !!s.cancel,
        dripfeed: !!s.dripfeed,
        type_key: typeKey,
        platform: d.platform,
        fields: fieldsForType(typeKey),
        drip_feed: null,
        step: 1,
        availability: "available",
        average_time_minutes: 60,
      } as NpService;
    });
    return matched as T;
  }

  const outboundAction = action === "catalog" ? "services" : action;
  const body = new URLSearchParams({ key, action: outboundAction });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") body.set(k, String(v));
  let res: Response;
  const timeoutMs = outboundAction === "services" ? 60_000 : 25_000;
  try {
    res = await fetch(BASE, { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new NotPanelError(`Provider unreachable: ${(e as Error).message}`, "NETWORK", true, 0);
  }
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new NotPanelError(`Bad response from provider (${res.status})`, "BAD_RESPONSE", true, res.status);
  }
  if (data && typeof data === "object" && !Array.isArray(data) && data.error && (data.error_code || data.status === "error" || action !== "status")) {
    const errMsg = String(data.error);
    const errCode = (typeof data.error_code === "string" ? data.error_code : errMsg).toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
    throw new NotPanelError(errMsg, errCode, !!data.retryable, res.status, data.details);
  }
  if (!res.ok) throw new NotPanelError(`Provider error ${res.status}`, "HTTP_" + res.status, res.status >= 500, res.status);

  // If action is catalog:
  if (action === "catalog") {
    // If the provider/mock already returned a catalog-shaped object:
    if (data && typeof data === "object" && !Array.isArray(data) && data.catalog_updated_at && Array.isArray(data.items)) {
      return data as T;
    }
    // If array of services was returned:
    if (Array.isArray(data)) {
      const timestamp = new Date().toISOString();
      servicesCache = { key, at: Date.now(), timestamp, items: data };
      const page = Math.max(1, Number(params.page) || 1);
      const limit = Math.max(1, Number(params.limit) || 100);
      const start = (page - 1) * limit;
      const slice = data.slice(start, start + limit);
      const catalogItems = slice.map((s) => {
        const d = detectPlatformAndCategory(String(s.category ?? ""), String(s.name ?? ""));
        const typeKey = String(s.type ?? "Default").toLowerCase().replace(/[\s-]+/g, "_");
        return {
          service: String(s.service),
          name: String(s.name),
          description: null,
          type: String(s.type ?? "Default"),
          rate: String(s.rate),
          min: String(s.min),
          max: String(s.max),
          platform: { slug: d.platform, name: platformName(d.platform) },
          category: { slug: d.categorySlug, name: d.category },
          refill: !!s.refill,
          dripfeed: !!s.dripfeed,
          available: true,
          cancel: !!s.cancel,
          average_time_minutes: 60,
          input_fields: fieldsForType(typeKey),
        };
      });
      return {
        catalog_updated_at: timestamp,
        total: data.length,
        page,
        total_pages: Math.ceil(data.length / limit),
        items: catalogItems,
      } as T;
    }
  }

  // Normalize order placement response
  if (action === "add" && data && typeof data === "object" && data.order) {
    return {
      order: Number(data.order),
      status_key: "pending",
      charge: data.charge ?? "0",
      cancel_available: true,
    } as T;
  }

  // Normalize status response
  if (action === "status" && data && typeof data === "object") {
    if (params.order) {
      if (data.status && !data.status_key) data.status_key = String(data.status).toLowerCase().replace(/[\s-]+/g, "_");
      if (data.order == null) data.order = Number(params.order);
    } else if (params.orders && !Array.isArray(data)) {
      for (const [idStr, st] of Object.entries(data)) {
        if (st && typeof st === "object" && (st as any).status && !(st as any).status_key) {
          (st as any).status_key = String((st as any).status).toLowerCase().replace(/[\s-]+/g, "_");
          if ((st as any).order == null) (st as any).order = Number(idStr);
        }
      }
    }
  }

  // Normalize refill response
  if (action === "refill" && data && typeof data === "object" && data.refill) {
    data.refill = Number(data.refill);
  }
  if (action === "refill_status" && data && typeof data === "object" && data.status && !data.status_key) {
    data.status_key = String(data.status).toLowerCase().replace(/[\s-]+/g, "_");
  }

  return data as T;
}

/** Parses "0.40625" USD → micro-USD integer */
export function usdToMicro(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  return Math.round(Number(v) * 1_000_000);
}

/** np() with the effective key (settings are memoised, so this is cheap) */
export async function npCall<T = unknown>(env: Env, action: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  return np<T>(npKey(env, await getSettings(env)), action, params);
}

export type KeyCheck = { ok: true } | { ok: false; code: "NOT_NOTPANEL_KEY" | "NOTPANEL_REJECTED"; message: string };

/**
 * Accepts a key only if it looks like a valid key AND provider itself answers:
 * `balance` returns {balance, currency} and `catalog` returns a catalog page or list of services. Read-only calls.
 */
export async function verifyNotPanelKey(key: string): Promise<KeyCheck> {
  if (!looksLikeNotPanelKey(key)) return { ok: false, code: "NOT_NOTPANEL_KEY", message: "This is not a valid API key." };
  const rejected = (e: unknown): KeyCheck => ({
    ok: false,
    code: "NOTPANEL_REJECTED",
    message: e instanceof NotPanelError && e.code !== "NETWORK" && e.code !== "BAD_RESPONSE" ? e.message : "Provider did not give the expected answer. Check the key and try again.",
  });
  try {
    const bal = await np<{ balance?: unknown; currency?: unknown }>(key, "balance");
    if (!bal || typeof bal !== "object" || !(typeof bal.balance === "string" || typeof bal.balance === "number") || typeof bal.currency !== "string")
      return { ok: false, code: "NOT_NOTPANEL_KEY", message: "This key did not answer like a provider account." };
    const cat = await np<{ catalog_updated_at?: unknown; total_pages?: unknown; items?: { service?: unknown; platform?: { slug?: unknown } | null }[] }>(key, "catalog", { page: 1, limit: 1 });
    const first = Array.isArray(cat?.items) ? cat.items[0] : undefined;
    if (!cat || typeof cat.catalog_updated_at !== "string" || typeof cat.total_pages !== "number" || !first || first.service === undefined || (first.platform != null && typeof first.platform.slug !== "string"))
      return { ok: false, code: "NOT_NOTPANEL_KEY", message: "This key did not return the catalog." };
    return { ok: true };
  } catch (e) {
    return rejected(e);
  }
}
