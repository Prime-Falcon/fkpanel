import { Fragment, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api, pollDelay } from "../api";
import { ArtTopUpSuccess } from "../art";
import { balanceStars } from "../../shared/stars";
import { balance, num, stars, starsRate } from "../format";
import { t, type Key } from "../i18n";
import { Icon, StarIcon } from "../icons";
import { refreshMe } from "../me";
import { Confetti, reducedMotion, useCountUp } from "../motion";
import { back, navigate, useRoute } from "../router";
import { meStore } from "../store";
import { haptic, openInvoice, openLink } from "../tg";
import { BackNav, BottomButtons, LargeTitle, Num, Presets, Screen, Section, Seg, errText, toast } from "../ui";

const STARS_PRESETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
const MFS_PRESETS = [100, 250, 500, 1000, 2500, 5000];
/** The "Custom" chip: clears the field for any amount within the limits */
const CUSTOM = -1;
/** Pre-selected amount when the route has no `?amount=`. */
const DEFAULT_STARS = 250;
const DEFAULT_BDT = 500;

/** Entrance delay for `.rise` (spec §7.8 timeline). */
const at = (ms: number) => `--d:${ms}ms`;

/** t() with nodes (e.g. <Num>) dropped into the sentence, so each language keeps its own word order. */
function tn(key: Key, vars: Record<string, ComponentChildren>): ComponentChildren {
  const marks: Record<string, string> = {};
  for (const k in vars) marks[k] = `\u0001${k}\u0001`;
  return t(key, marks)
    .split("\u0001")
    .map((part, i) => (i % 2 ? <Fragment key={i}>{vars[part]}</Fragment> : part));
}

/** `?amount=` prefill in whole Stars (OrderForm "Add {amount}"), else a default, kept within the top-up limits. */
function prefill(v: string | null, min: number, max: number): string {
  const n = v && /^\d{1,7}$/.test(v) ? Number(v) : DEFAULT_STARS;
  return String(Math.min(Math.max(n, min), max > 0 ? max : n));
}

/** `?ret=` in-app route to go back to after paying; anything that isn't an app path is ignored. */
function safeRet(v: string | null): string | null {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

type Done = { added: number; oldBalance: number; paymentId: number; confirmed: boolean };

/** Add funds with Telegram Stars or MFS / Card / Crypto (OptimumPay / PipraPay). */
export function TopUp() {
  const me = meStore.use()!;
  const { query } = useRoute();
  const ret = safeRet(query.get("ret"));
  const methodParam = query.get("method");
  const initialMethod =
    methodParam === "stars"
      ? "stars"
      : methodParam === "mfs"
      ? "mfs"
      : me.piprapayEnabled
      ? "mfs"
      : "stars";
  const [method, setMethod] = useState<"stars" | "mfs">(initialMethod);
  const [done, setDone] = useState<Done | null>(null);

  return (
    <>
      <BackNav to={ret ?? "/wallet"} />
      {done ? (
        <TopUpSuccess {...done} ret={ret} />
      ) : method === "mfs" ? (
        <TopUpMfsForm
          onDone={setDone}
          backTo={ret ?? "/wallet"}
          method={method}
          onMethodChange={setMethod}
        />
      ) : (
        <TopUpStarsForm
          initial={query.get("amount")}
          onDone={setDone}
          backTo={ret ?? "/wallet"}
          method={method}
          onMethodChange={setMethod}
        />
      )}
    </>
  );
}

function TopUpStarsForm({
  initial,
  onDone,
  backTo,
  method,
  onMethodChange,
}: {
  initial: string | null;
  onDone: (d: Done) => void;
  backTo: string;
  method: "stars" | "mfs";
  onMethodChange: (m: "stars" | "mfs") => void;
}) {
  const me = meStore.use()!;
  const [text, setText] = useState(() => prefill(initial, me.minTopup, me.maxTopup));
  const [busy, setBusy] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const amount = Number(text) || 0;
  const valid = Number.isInteger(amount) && amount >= me.minTopup && amount <= me.maxTopup;
  const err = showErr && !valid;
  const limits = { min: <Num>{stars(me.minTopup)}</Num>, max: <Num>{stars(me.maxTopup)}</Num> };
  const presets = STARS_PRESETS.filter((p) => p >= me.minTopup && p <= me.maxTopup);

  const pay = async () => {
    if (busy) return;
    if (!valid) {
      setShowErr(true);
      haptic.error();
      const el = input.current;
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      return;
    }
    haptic.press();
    setBusy(true);
    const oldBalance = me.balance;
    try {
      const r = await api<{ invoice: string; stars: number; paymentId: number }>("/wallet/topup", { body: { stars: amount } });
      const status = await openInvoice(r.invoice);
      if (status === "paid") {
        let confirmed = false;
        for (let i = 0; i < 5; i++) {
          const p = await api<{ status: string }>(`/payments/${r.paymentId}`).catch(() => null);
          if (p?.status === "paid") {
            confirmed = true;
            break;
          }
          if (i === 1) toast(t("topup.waiting"));
          await new Promise((res) => setTimeout(res, pollDelay(i)));
        }
        await refreshMe().catch(() => {});
        onDone({ added: amount, oldBalance, paymentId: r.paymentId, confirmed });
        return;
      }
    } catch (e) {
      toast(errText(e), "error");
    }
    setBusy(false);
  };

  const onInput = (e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    const clean = el.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 7);
    if (clean !== el.value) el.value = clean;
    setText(clean);
    setShowErr(false);
  };

  return (
    <Screen
      bottom="native"
      overlay={
        <BottomButtons
          main={{ text: t("topup.pay", { stars: num(amount > 0 ? amount : me.minTopup) }), onClick: pay, progress: busy, shine: true }}
          secondary={{ text: t("common.back"), onClick: () => back(backTo) }}
        />
      }
    >
      <LargeTitle size="title" title={t("topup.title")} sub={tn("topup.balance", { amount: <Num>{balance(me.balance)}</Num> })} />

      {me.piprapayEnabled ? (
        <div style={{ marginBottom: "16px" }}>
          <Seg
            label="Payment method"
            value={method}
            onChange={onMethodChange}
            options={[
              ["mfs", t("topup.methodMfs")],
              ["stars", t("topup.methodStars")],
            ]}
          />
        </div>
      ) : null}

      <Section labelFor="amt" header={t("topup.amount")} footer={tn("topup.limits", limits)}>
        <div class={err ? "card amount-card invalid" : "card amount-card"}>
          <div class="row1" dir="ltr">
            <span class="stars-eq" aria-hidden="true">
              <StarIcon size={26} />
            </span>
            <input
              ref={input}
              id="amt"
              class="num-l"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
              dir="ltr"
              autoComplete="off"
              placeholder={num(me.minTopup)}
              aria-label={t("topup.amount")}
              value={text}
              aria-invalid={err ? true : undefined}
              aria-describedby={err ? "amt-err" : undefined}
              onInput={onInput}
              onBlur={() => setShowErr(!!text && !valid)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </div>
          <Presets
            value={presets.includes(amount) ? amount : CUSTOM}
            options={[...presets.map((p): [number, string] => [p, stars(p)]), [CUSTOM, t("topup.custom")]]}
            label={t("topup.amount")}
            onChange={(v) => {
              setShowErr(false);
              if (v === CUSTOM) {
                setText("");
                input.current?.focus();
              } else setText(String(v));
            }}
          />
        </div>
        {err ? (
          <p class="field-error" id="amt-err" role="alert">
            <Icon name="alert" size={15} stroke={2.2} />
            <span>{tn("err.INVALID_AMOUNT", limits)}</span>
          </p>
        ) : null}
      </Section>

      <div class="card info">
        <span class="tile cream">
          <StarIcon size={18} />
        </span>
        <span>{t("topup.note")}</span>
      </div>
    </Screen>
  );
}

function TopUpMfsForm({
  onDone,
  backTo,
  method,
  onMethodChange,
}: {
  onDone: (d: Done) => void;
  backTo: string;
  method: "stars" | "mfs";
  onMethodChange: (m: "stars" | "mfs") => void;
}) {
  const me = meStore.use()!;
  const minBdt = me.minTopupBdt ?? 50;
  const maxBdt = me.maxTopupBdt ?? 25000;
  const bdtPerUsd = me.bdtPerUsd && me.bdtPerUsd > 0 ? me.bdtPerUsd : 125;
  const starsRateVal = starsRate();

  const [text, setText] = useState(() => String(Math.min(Math.max(DEFAULT_BDT, minBdt), maxBdt)));
  const [busy, setBusy] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const [waitingPayment, setWaitingPayment] = useState<{ id: number; url: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const amount = Number(text) || 0;
  const valid = Number.isFinite(amount) && amount >= minBdt && amount <= maxBdt;
  const err = showErr && !valid;
  const limits = { min: `${minBdt} ৳`, max: `${maxBdt} ৳` };
  const presets = MFS_PRESETS.filter((p) => p >= minBdt && p <= maxBdt);

  const usd = amount > 0 ? amount / bdtPerUsd : 0;
  const starsEquivalent = Math.max(1, Math.round(usd * starsRateVal));

  const pay = async () => {
    if (busy) return;
    if (!valid) {
      setShowErr(true);
      haptic.error();
      const el = input.current;
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      return;
    }
    haptic.press();
    setBusy(true);
    const oldBalance = me.balance;
    try {
      const r = await api<{ ok: boolean; paymentId: number; paymentUrl: string; invoiceId: string }>("/wallet/topup-piprapay", {
        body: { amountBdt: amount },
      });

      if (!r.ok || !r.paymentUrl) {
        toast("Unable to create invoice. Please try again.", "error");
        setBusy(false);
        return;
      }

      setWaitingPayment({ id: r.paymentId, url: r.paymentUrl });
      toast(t("topup.redirecting"));
      openLink(r.paymentUrl);

      // Poll payment status up to ~100s
      let confirmed = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 2500));
        const p = await api<{ status: string }>(`/payments/${r.paymentId}`).catch(() => null);
        if (p?.status === "paid") {
          confirmed = true;
          break;
        }
      }

      if (confirmed) {
        await refreshMe().catch(() => {});
        onDone({ added: starsEquivalent, oldBalance, paymentId: r.paymentId, confirmed: true });
        return;
      }
    } catch (e) {
      toast(errText(e), "error");
    }
    setBusy(false);
  };

  const onInput = (e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    const clean = el.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 7);
    if (clean !== el.value) el.value = clean;
    setText(clean);
    setShowErr(false);
  };

  return (
    <Screen
      bottom="native"
      overlay={
        <BottomButtons
          main={{
            text: t("topup.payBdt", { amount: num(amount > 0 ? amount : minBdt) }),
            onClick: pay,
            progress: busy,
            shine: true,
          }}
          secondary={{ text: t("common.back"), onClick: () => back(backTo) }}
        />
      }
    >
      <LargeTitle size="title" title={t("topup.methodMfs")} sub={tn("topup.balance", { amount: <Num>{balance(me.balance)}</Num> })} />

      <div style={{ marginBottom: "16px" }}>
        <Seg
          label="Payment method"
          value={method}
          onChange={onMethodChange}
          options={[
            ["mfs", t("topup.methodMfs")],
            ["stars", t("topup.methodStars")],
          ]}
        />
      </div>

      {/* Gateway banner */}
      <div
        class="card"
        style={{
          padding: "14px 16px",
          marginBottom: "16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: "var(--card, #ffffff)",
          borderRadius: "16px",
        }}
      >
        <img
          src="/mfs-gateways.png"
          alt="MFS Gateways"
          style={{ width: "100%", maxWidth: "340px", height: "auto", objectFit: "contain", display: "block" }}
        />
        <span style={{ fontSize: "12px", color: "var(--hint, #64748b)", marginTop: "8px", fontWeight: 500 }}>
          bKash · Nagad · Rocket · Visa · Mastercard · Binance
        </span>
      </div>

      {waitingPayment ? (
        <div class="card pad" style={{ marginBottom: "16px", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "8px" }}>
            <Icon name="more" size={20} />
            <b style={{ fontSize: "16px" }}>{t("topup.waiting")}</b>
          </div>
          <p style={{ color: "var(--hint)", fontSize: "13px", lineHeight: "1.4", margin: "4px 0 12px" }}>
            Payment window opened. Once completed, your balance updates automatically.
          </p>
          <button
            type="button"
            class="white-pill press"
            style={{ width: "100%", padding: "10px", fontSize: "14px", fontWeight: 600 }}
            onClick={() => openLink(waitingPayment.url)}
          >
            Open Payment Gateway Again
          </button>
        </div>
      ) : null}

      <Section labelFor="amt-bdt" header={t("topup.amountBdt")} footer={tn("topup.limits", limits)}>
        <div class={err ? "card amount-card invalid" : "card amount-card"}>
          <div class="row1" dir="ltr">
            <span class="stars-eq" aria-hidden="true" style={{ fontSize: "24px", fontWeight: 700, color: "var(--acc, #2457ff)" }}>
              ৳
            </span>
            <input
              ref={input}
              id="amt-bdt"
              class="num-l"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
              dir="ltr"
              autoComplete="off"
              placeholder={num(minBdt)}
              aria-label={t("topup.amountBdt")}
              value={text}
              aria-invalid={err ? true : undefined}
              aria-describedby={err ? "amt-bdt-err" : undefined}
              onInput={onInput}
              onBlur={() => setShowErr(!!text && !valid)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          </div>
          <Presets
            value={presets.includes(amount) ? amount : CUSTOM}
            options={[...presets.map((p): [number, string] => [p, `${p} ৳`]), [CUSTOM, t("topup.custom")]]}
            label={t("topup.amountBdt")}
            onChange={(v) => {
              setShowErr(false);
              if (v === CUSTOM) {
                setText("");
                input.current?.focus();
              } else setText(String(v));
            }}
          />
        </div>
        {err ? (
          <p class="field-error" id="amt-bdt-err" role="alert">
            <Icon name="alert" size={15} stroke={2.2} />
            <span>{tn("err.INVALID_AMOUNT", limits)}</span>
          </p>
        ) : null}
      </Section>

      {/* Real-time conversion note */}
      <div class="card info">
        <span class="tile cream">
          <StarIcon size={18} />
        </span>
        <span>
          {tn("topup.bdtEquivalent", {
            usd: usd.toFixed(2),
            stars: num(starsEquivalent),
          })}
        </span>
      </div>

      <div class="card info" style={{ marginTop: "8px" }}>
        <Icon name="wallet" size={18} />
        <span>{t("topup.mfsNote")}</span>
      </div>
    </Screen>
  );
}

function TopUpSuccess({ added, oldBalance, paymentId, confirmed, ret }: Done & { ret: string | null }) {
  const me = meStore.use()!;
  const now = balanceStars(me.balance, starsRate());
  const shown = useCountUp(now, { from: balanceStars(oldBalance, starsRate()), duration: 900, delay: 300 });

  useEffect(() => {
    window.scrollTo(0, 0);
    const h = setTimeout(() => haptic.success(), 480);
    return () => clearTimeout(h);
  }, []);

  useEffect(() => {
    if (confirmed) return;
    let live = true;
    let tries = 0;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const p = await api<{ status: string }>(`/payments/${paymentId}`).catch(() => null);
      if (!live) return;
      if (p?.status === "paid") await refreshMe().catch(() => {});
      else if (Date.now() - started < 180_000) timer = setTimeout(check, pollDelay(tries++));
    };
    timer = setTimeout(check, pollDelay(tries++));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  const main = ret
    ? { text: t("topup.backToOrder"), onClick: () => back(ret) }
    : { text: t("common.done"), onClick: () => navigate("/wallet", { replace: true }) };

  return (
    <Screen
      bottom="native"
      center
      overlay={
        <>
          <Confetti n={10} delay={520} />
          <BottomButtons main={main} />
        </>
      }
    >
      <div class="success-art celebrate">
        <ArtTopUpSuccess />
      </div>
      <div class="rise" style={at(240)} role="status">
        <LargeTitle align="center" size="title" title={t("topup.successTitle")} sub={tn("topup.done", { amount: <Num>{stars(added, { sign: true })}</Num> })} />
      </div>
      <div class="card pad new-balance rise" style={at(340)}>
        <span>{t("topup.newBalance")}</span>
        <b class="num-xl count" dir="ltr" aria-hidden="true">
          <Num>{stars(shown)}</Num>
        </b>
        <span class="sr">{stars(now)}</span>
      </div>
    </Screen>
  );
}
