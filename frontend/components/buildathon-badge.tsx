import Image from "next/image";

/**
 * Required buildathon branding.
 *
 * The official "Built For Ostad Presents YUNet AIgnite Buildathon 2026"
 * sticker must be clearly visible near the top of every page. It is rendered
 * as the supplied image in the sticky navbar and again at the top of the
 * homepage hero. The full wording is kept in the alt/title text so screen
 * readers and judges get the exact label even on narrow screens.
 */
const STICKER_ALT =
  "Built For Ostad Presents YUNet AIgnite Buildathon 2026 — National AI Hackathon for B2C Solutions";

export default function BuildathonBadge({ variant = "nav" }: { variant?: "nav" | "hero" }) {
  const isNav = variant === "nav";
  return (
    <span className={`buildathon-badge buildathon-${variant}`} title={STICKER_ALT}>
      <Image
        src={isNav ? "/built-for-aignite-2026-nav.jpg" : "/built-for-aignite-2026.png"}
        alt={STICKER_ALT}
        width={isNav ? 640 : 1400}
        height={isNav ? 227 : 497}
        priority={isNav}
        sizes={isNav ? "190px" : "(max-width: 760px) 88vw, 420px"}
        className="buildathon-sticker"
      />
    </span>
  );
}
