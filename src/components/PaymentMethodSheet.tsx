import { t } from "../i18n";
import { StarIcon } from "../icons";
import { navigate } from "../router";
import { haptic } from "../tg";
import { List, Row, Sheet } from "../ui";

export function PaymentMethodSheet({ onClose, ret }: { onClose: () => void; ret?: string | null }) {
  const retParam = ret ? `&ret=${encodeURIComponent(ret)}` : "";
  const starsUrl = `/topup?method=stars${retParam}`;
  const mfsUrl = `/topup?method=mfs${retParam}`;

  return (
    <Sheet title={t("wallet.chooseMethod")} sub={t("wallet.chooseMethodSub")} onClose={onClose}>
      <List>
        <Row
          lead={
            <span class="tile cream">
              <StarIcon size={20} />
            </span>
          }
          title={t("topup.methodStars")}
          meta={t("wallet.starsSub")}
          onClick={() => {
            haptic.tap();
            onClose();
            navigate(starsUrl);
          }}
        />
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
          onClick={() => {
            haptic.tap();
            onClose();
            navigate(mfsUrl);
          }}
        />
      </List>
    </Sheet>
  );
}
