"use client";
import Link from "next/link";
import { Mail, Phone, MessageCircle, LoaderCircle } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useFormatDate } from "@/lib/context/OrganizationTimezoneContext";
import type { SegmentoRegistro } from "@/lib/services/crm/segmentosAudiencia";

export function SegmentoEstadoRecuento({
  segment,
  onlyChannels = false,
}: {
  segment: SegmentoRegistro;
  onlyChannels?: boolean;
}) {
  const t = useTranslations("crm.segmentosNuevo"),
    formatter = useFormatter();
  const { formatDateTime } = useFormatDate(null);
  const channels = [
    {
      icon: Phone,
      label: t("voiceContactable"),
      count: segment.counts_json?.voice_contactable,
    },
    {
      icon: Mail,
      label: t("email"),
      count: segment.counts_json?.email_contactable,
    },
    {
      icon: MessageCircle,
      label: t("whatsapp"),
      count: segment.counts_json?.whatsapp_contactable,
    },
  ];
  return (
    <div className="space-y-2 text-xs text-fg-secondary">
      <div className="flex flex-wrap gap-3">
        {channels.map(({ icon: Icon, label, count }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1"
            title={`${label}: ${count === undefined ? "—" : formatter.number(count, { useGrouping: true })}${segment.counted_at ? ` · ${formatDateTime(segment.counted_at)}` : ""}`}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{label}: </span>
            {count === undefined ? "—" : formatter.number(count, { useGrouping: true })}
          </span>
        ))}
      </div>
      {segment.count_job_id ? (
        <p role="status" className="flex items-center gap-1">
          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
          {t("countQueued")}
        </p>
      ) : segment.count_error ? (
        <p className="text-danger-text">{t("countFailed")}</p>
      ) : null}
      {!onlyChannels && segment.usage && (
        <p>
          {t("usedIn")}:{" "}
          <Link className="text-link hover:underline" href="/app/crm/campanas">
            {t("campaignUsage", {
              count: segment.usage.campaigns + segment.usage.voice_campaigns,
            })}
          </Link>
          {" · "}
          <Link
            className="text-link hover:underline"
            href="/app/crm/secuencias"
          >
            {t("sequenceUsage", { count: segment.usage.sequences })}
          </Link>
        </p>
      )}
    </div>
  );
}
