import { useEffect, useState } from "preact/hooks";
import type { LedgerItem } from "../../shared/types";
import { api } from "../api";
import { ArtBalanceCard } from "../art";
import { balanceStars, underOneStar } from "../../shared/stars";
import { amount as amountText, balance as balanceText, dateTime, isoIds, stars, starsRate } from "../format";
import { t } from "../i18n";
import { Icon, StarIcon, type IconName } from "../icons";
import { useCountUp } from "../motion";
import { navigate } from "../router";
import { meStore } from "../store";
import { haptic } from "../tg";
import { PaymentMethodSheet } from "../components/PaymentMethodSheet";
import { EmptyState, ErrorState, LargeTitle, List, Num, Row, Screen, Section, SkeletonList, errText, toast, useAsync } from "../ui";

/** Ledger page size (the API returns 30 per page). */
const PAGE = 30;

/** Balance shown on the last Wallet visit in this app launch. A credit since then counts up from it (spec §7.7). */
let lastSeenBalance: number | undefined;

/** Leading tile per ledger kind (spec §5.10). No icon = the gold Telegram Stars icon. */
const KIND: Record<LedgerItem["kind"], { icon?: IconName; plate: string }> = {
  order: { icon: "receipt", plate: "var(--lavender)" },
  refund: { icon: "refill", plate: "var(--lime)" },
  topup: { plate: "var(--cream)" },
  admin: { icon: "sliders", plate: "var(--sky)" },
  referral: { icon: "users", plate: "var(--lime)" },
  stars_refund: { icon: "star", plate: "var(--pink)" },
};

/** Cream plate with the gold Stars icon. */
function StarsTile() {
  return (
    <span class="tile cream">
      <StarIcon size={18} />
    </span>
  );
}

function ledgerTitle(i: LedgerItem): string {
  if (i.kind === "order") return isoIds(t("ledger.order", { id: i.orderNumber ?? i.ref ?? "" }));
  if (i.kind === "refund") return isoIds(t("ledger.refund", { id: i.orderNumber ?? i.ref ?? "" }));
  return t(`ledger.${i.kind}`);
}

function LedgerRow({ item }: { item: LedgerItem }) {
  const k = KIND[item.kind] ?? KIND.admin;
  const opensOrder = !!item.ref && (item.kind === "order" || item.kind === "refund");
  // The sign is always shown; green only reinforces money coming in (never colour alone).
  const amount = (
    <b class={item.delta > 0 ? "num-s ok-text" : "num-s fg-text"}>
      <Num>{amountText(item.delta, { sign: true })}</Num>
    </b>
  );
  return (
    <Row
      icon={k.icon}
      plate={k.plate}
      lead={k.icon ? undefined : <StarsTile />}
      title={ledgerTitle(item)}
      meta={dateTime(item.createdAt)}
      value={amount}
      onClick={opensOrder ? () => navigate(`/order/${item.ref}`) : undefined}
    />
  );
}

function BalanceCard({ balance: micro, onAdd }: { balance: number; onAdd: () => void }) {
  // Stored in micro-USD, shown as whole Stars (rounded down)
  const balance = balanceStars(micro, starsRate());
  // Less than one Star left: "<1 ⭐", not a misleading 0
  const tiny = underOneStar(micro, starsRate());
  // Count up only when the balance went up since the last visit. `from` is read once, at mount.
  const [from] = useState(() => (lastSeenBalance !== undefined && balance > lastSeenBalance ? lastSeenBalance : undefined));
  const shown = useCountUp(balance, { from, delay: 200, step: 1 });
  useEffect(() => {
    lastSeenBalance = balance;
  }, [balance]);

  return (
    <div class="balance-card">
      <ArtBalanceCard />
      <div class="lbl">
        <span>{t("wallet.balance")}</span>
        <b class="num-xl count" aria-hidden="true">
          <Num>{tiny ? balanceText(micro) : stars(shown)}</Num>
        </b>
        <span class="sr">{balanceText(micro)}</span>
      </div>
      <button type="button" class="white-pill press" onClick={() => (haptic.tap(), onAdd())}>
        <Icon name="plus" size={16} stroke={2.6} />
        {t("wallet.add")}
      </button>
    </div>
  );
}

export function Wallet() {
  const me = meStore.use()!;
  const res = useAsync(() => api<{ balance: number; items: LedgerItem[] }>("/wallet"), []);
  const [extra, setExtra] = useState<LedgerItem[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showMethodSheet, setShowMethodSheet] = useState(false);
  const items = [...(res.data?.items ?? []), ...extra];
  const canMore = !!res.data && items.length >= PAGE && more;

  const loadMore = async () => {
    if (busy || !items.length) return;
    setBusy(true);
    try {
      const r = await api<{ items: LedgerItem[] }>(`/wallet?before=${items[items.length - 1].id}`);
      setExtra((x) => [...x, ...r.items]);
      setMore(r.items.length === PAGE);
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const balance = res.data?.balance ?? me.balance;
  const onAddFunds = () => {
    if (me.piprapayEnabled) {
      setShowMethodSheet(true);
    } else {
      navigate("/topup");
    }
  };

  return (
    <Screen overlay={showMethodSheet ? <PaymentMethodSheet onClose={() => setShowMethodSheet(false)} /> : undefined}>
      <LargeTitle title={t("wallet.title")} />

      <BalanceCard balance={balance} onAdd={onAddFunds} />

      <Section header={t("wallet.addWith")}>
        <List>
          <Row lead={<StarsTile />} title={t("wallet.stars")} meta={t("wallet.starsSub")} href="/topup?method=stars" />
          {me.piprapayEnabled ? (
            <Row
              lead={
                <span
                  class="tile"
                  style={{
                    background: "var(--card-sub, #f8fafc)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    padding: "2px 4px",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/mfs-gateways.png"
                    alt="MFS"
                    style={{ width: "100%", height: "auto", maxHeight: 36, objectFit: "contain", display: "block" }}
                  />
                </span>
              }
              title={t("wallet.mfs")}
              meta={t("wallet.mfsSub")}
              href="/topup?method=mfs"
            />
          ) : null}
        </List>
      </Section>

      <Section header={t("wallet.history")} class="day">
        {res.error ? (
          <div class="card">
            <ErrorState compact error={res.error} onRetry={res.reload} />
          </div>
        ) : !res.data ? (
          <SkeletonList rows={3} lead="tile" />
        ) : !items.length ? (
          <div class="card">
            <EmptyState compact art="wallet" title={t("wallet.empty")} body={t("wallet.emptySub")} />
          </div>
        ) : (
          <List stagger>
            {items.map((i) => (
              <LedgerRow key={i.id} item={i} />
            ))}
            {canMore ? <Row key="more" center title={busy ? t("common.loading") : t("common.showMore")} onClick={loadMore} disabled={busy} /> : null}
          </List>
        )}
      </Section>
    </Screen>
  );
}
