"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "../lib/language";
import { getStatusGuide, GuidanceItem } from "../lib/api";

/**
 * Fraud shield: the deterministic "official channels only" card.
 *
 * All lines are server-verified public content. When no verified warnings
 * exist for a service, the card silently renders nothing — it never invents
 * a warning.
 */
export default function FraudShield({
  serviceId,
  warnings,
}: {
  serviceId?: string;
  warnings?: GuidanceItem[];
}) {
  const { lang } = useLanguage();
  const [items, setItems] = useState<GuidanceItem[] | null>(warnings ?? null);

  useEffect(() => {
    if (warnings) {
      setItems(warnings);
      return;
    }
    if (!serviceId) return;
    let active = true;
    getStatusGuide(serviceId)
      .then((guide) => {
        if (active) setItems(guide.fraud_warnings);
      })
      .catch(() => {
        /* No verified warnings for this service: render nothing. */
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, warnings]);

  if (!items || items.length === 0) return null;

  return <section
    aria-labelledby="fraud-shield-title"
    className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm sm:p-7"
  >
    <h2 id="fraud-shield-title" className="text-lg font-bold text-amber-900">
      {lang === "bn" ? "সতর্কতা: দালাল ও প্রতারণা থেকে সাবধান" : "Warning: be careful of brokers and fraud"}
    </h2>
    <ul className="mt-3 space-y-3 text-sm text-amber-900">
      {items.map(item => <li key={item.id} className="rounded-lg border border-amber-200 bg-white/60 p-3">
        <p className="font-semibold">{lang === "bn" ? item.text_bn : item.text_en}</p>
        <p className="mt-1 text-xs">
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-amber-900 underline">{item.source_url} · {item.last_verified}</a>
        </p>
      </li>)}
    </ul>
    <p className="mt-3 text-xs text-amber-900">
      <Link href="/grs" className="underline">{lang === "bn" ? "অভিযোগ জানাতে চাইলে GRS পাতায় যান" : "To file a complaint, go to the GRS page"}</Link>
    </p>
  </section>;
}
