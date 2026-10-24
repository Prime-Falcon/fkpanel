import type { ComponentProps } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { AnimationItem } from "lottie-web";
import lottie from "lottie-web/build/player/lottie_light";

export type StyleProp = ComponentProps<"span">["style"];

export function LottieEmoji({
  src,
  size = 18,
  class: cls,
  style,
}: {
  src: string | object;
  size?: number;
  class?: string;
  style?: StyleProp;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    try {
      const isUrl = typeof src === "string";
      animRef.current = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        path: isUrl ? src : undefined,
        animationData: !isUrl ? src : undefined,
      });
    } catch {
      /* ignore */
    }
    return () => {
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [src]);

  return (
    <span
      ref={containerRef}
      class={cls}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${size}px`,
        height: `${size}px`,
        verticalAlign: "middle",
        overflow: "hidden",
        flex: "none",
        ...(typeof style === "object" ? style : {}),
      }}
    />
  );
}

/** Animated Telegram Star (ID 6190358366842262799) */
export function StarIcon({ size = 18, style }: { size?: number; style?: StyleProp }) {
  return <LottieEmoji src="/emojis/star.json" size={size} style={style} />;
}

/** Animated Telegram Star Tile for Wallet History (ID 6190392129580175284) */
export function StarTileEmoji({ size = 22, style }: { size?: number; style?: StyleProp }) {
  return <LottieEmoji src="/emojis/star-tile.json" size={size} style={style} />;
}
