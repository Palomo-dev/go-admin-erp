"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  FileText,
  HeartPulse,
  Phone,
  RefreshCw,
  ListTodo,
  MessageCircle,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/kit/PageHeader";
import { EmptyState } from "@/components/kit/EmptyState";
import { FormSection } from "@/components/kit/FormSection";
import { useKitT, useLocaleIntl } from "@/components/kit/useIdiomaKit";
import { clasesBoton } from "@/components/kit/botonClases";
import { useOrgTimezone } from "@/lib/context/OrganizationTimezoneContext";
import { formatDateTimeInTz } from "@/lib/utils/dateDisplay";
import { useReturnFocus } from "@/lib/hooks/useReturnFocus";
import { healthScoreService } from "@/lib/services/crm/healthScoreService";
import type { HealthCustomerDetail } from "@/lib/services/crm/healthReadService";
import { claveError } from "@/components/crm/acciones/apiCrm";
import { AccionesRapidasCrm } from "@/components/crm/acciones/AccionesRapidasCrm";
import type { AccionRapidaCrm as AccionRapida } from "@/components/crm/kit/quickActionLogica";
import { HealthGauge } from "./HealthGauge";
import { HealthTrend } from "./HealthTrend";
import { HealthAlerts } from "./HealthAlerts";
import { HealthDimensions } from "./HealthDimensions";
export interface HealthDetailDrawerProps {
  presentation?: "sheet" | "page";
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
export function HealthDetailDrawer({
  customerId,
  open,
  onOpenChange,
  presentation = "sheet",
}: HealthDetailDrawerProps) {
  const locale = useLocaleIntl();
  const kit = useKitT();
  const t = useTranslations("crm.salud");
  const errors = useTranslations("crm.accionesRapidas.errores");
  const { timezone } = useOrgTimezone();
  const onCloseAutoFocus = useReturnFocus(open);
  const [data, setData] = useState<HealthCustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<{
    accion: AccionRapida;
    clave: number;
  } | null>(null);
  const version = useRef(0);
  const writeLock = useRef(false);
  const load = useCallback(async () => {
    if (!customerId || !open) return;
    const current = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const result = await healthScoreService.getDetail(customerId, 40);
      if (current === version.current) setData(result);
    } catch (e) {
      if (current === version.current) setError(errors(claveError(e)));
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [customerId, open, errors]);
  useEffect(() => {
    setData(null);
    setNotice(null);
    setAction(null);
    void load();
    return () => {
      version.current += 1;
    };
  }, [load]);
  const snapshot = async () => {
    if (!customerId || writeLock.current) return;
    const current = version.current;
    writeLock.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await healthScoreService.snapshotHealthScore(customerId);
      if (current === version.current) {
        setNotice(
          t(
            result.snapshot_written ? "measurementSaved" : "measurementCurrent",
          ),
        );
        await load();
      }
    } catch (e) {
      if (current === version.current) setError(errors(claveError(e)));
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  };
  const health = data?.health;
  const actions: { key: AccionRapida; icon: typeof Phone; label: string }[] = [
    { key: "llamar", icon: Phone, label: t("call") },
    { key: "whatsapp", icon: MessageCircle, label: t("whatsapp") },
    { key: "tarea", icon: ListTodo, label: t("createTask") },
  ];
  const content = (
    <>
      {presentation === "page" && (
        <PageHeader
          titulo={health?.customer_name || t("detailTitle")}
          subtitulo={t("detailSubtitle")}
          migas={[
            { etiqueta: "CRM", href: "/app/crm" },
            { etiqueta: t("title"), href: "/app/crm/salud" },
            { etiqueta: health?.customer_name || t("detailTitle") },
          ]}
          movil={{
            accion: (
              <button
                type="button"
                aria-label={kit("comun.cerrar")}
                className={clasesBoton({
                  patron: "button",
                  variante: "fantasma",
                  className: "size-10 p-0",
                })}
                onClick={() => onOpenChange(false)}
              >
                <X className="size-4" aria-hidden />
              </button>
            ),
          }}
          acciones={
            <div className="flex gap-2">
              {health && (
                <>
                  <Link
                    className={clasesBoton({
                      patron: "button",
                      variante: "secundario",
                    })}
                    href={`/app/crm/clientes/${encodeURIComponent(health.customer_id)}`}
                  >
                    <FileText className="size-4" aria-hidden />
                    {t("customerRecord")}
                  </Link>
                  <button
                    type="button"
                    className={clasesBoton({ patron: "button" })}
                    onClick={() =>
                      setAction({ accion: "llamar", clave: Date.now() })
                    }
                  >
                    <Phone className="size-4" aria-hidden />
                    {t("call")}
                  </button>
                  {data?.can_measure && (
                    <button
                      type="button"
                      aria-label={t("measureNow")}
                      className={clasesBoton({
                        patron: "button",
                        variante: "fantasma",
                        className: "size-10 p-0",
                      })}
                      disabled={saving}
                      onClick={() => void snapshot()}
                    >
                      <RefreshCw
                        className={`size-4 ${saving ? "animate-spin" : ""}`}
                        aria-hidden
                      />
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                aria-label={kit("comun.cerrar")}
                className={clasesBoton({
                  patron: "button",
                  variante: "fantasma",
                  className: "size-10 p-0",
                })}
                onClick={() => onOpenChange(false)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          }
        />
      )}
      {presentation === "sheet" && (
        <>
          <SheetClose asChild>
            <button
              type="button"
              aria-label={kit("comun.cerrar")}
              className={`${clasesBoton({ patron: "button", variante: "fantasma", tamano: "sm" })} absolute right-4 top-4`}
            >
              <X className="size-4" aria-hidden />
            </button>
          </SheetClose>
          <SheetHeader className="pb-5 pr-10 text-left">
            <SheetTitle className="flex items-center gap-2 text-fg">
              <HeartPulse className="size-5 text-brand" aria-hidden />
              {health?.customer_name || t("detailTitle")}
            </SheetTitle>
            <SheetDescription className="text-fg-secondary">
              {t("detailSubtitle")}
            </SheetDescription>
          </SheetHeader>
        </>
      )}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
          <span className="sr-only">{t("loading")}</span>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : error && !data?.health ? (
        <EmptyState
          variante="error"
          titulo={t("loadError")}
          descripcion={error}
          onReintentar={() => void load()}
        />
      ) : !health ? (
        <EmptyState
          icono={HeartPulse}
          titulo={t("emptyTitle")}
          descripcion={t("emptyDescription")}
        />
      ) : (
        <>
          {presentation === "sheet" && (
            <div className="mb-4 flex flex-wrap gap-2">
              <Link
                className={clasesBoton({
                  patron: "button",
                  variante: "secundario",
                  tamano: "sm",
                })}
                href={`/app/crm/clientes/${encodeURIComponent(health.customer_id)}`}
              >
                <FileText className="size-4" aria-hidden />
                {t("customerRecord")}
              </Link>
              {data?.can_measure && (
                <button
                  type="button"
                  className={clasesBoton({
                    patron: "button",
                    variante: "secundario",
                    tamano: "sm",
                  })}
                  disabled={saving}
                  onClick={() => void snapshot()}
                >
                  <RefreshCw
                    className={`size-4 ${saving ? "animate-spin" : ""}`}
                    aria-hidden
                  />
                  {t(saving ? "saving" : "measureNow")}
                </button>
              )}
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-danger-subtle p-3 text-sm text-danger-text"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="mb-4 rounded-lg bg-success-subtle p-3 text-sm text-success-text"
            >
              {notice}
            </p>
          )}
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="space-y-4">
              <FormSection titulo={t("currentHealth")}>
                <div className="flex justify-center">
                  <HealthGauge
                    score={health.score}
                    band={health.band}
                    size="lg"
                  />
                </div>
                <p className="text-xs text-fg-secondary">
                  {health.measured_at
                    ? t("measuredAt", {
                        date: formatDateTimeInTz(health.measured_at, timezone, {
                          locale,
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      })
                    : t("measurementPending")}
                </p>
              </FormSection>
              <FormSection titulo={t("trend.title")}>
                {data?.history_error ? (
                  <EmptyState
                    variante="error"
                    titulo={t("trend.error")}
                    onReintentar={() => void load()}
                  />
                ) : (
                  <HealthTrend
                    snapshots={data?.history ?? []}
                    band={health.band}
                  />
                )}
              </FormSection>
            </div>
            <FormSection titulo={t("indicators")}>
              <HealthDimensions indicators={health.indicators} />
              <HealthAlerts alerts={health.alerts ?? []} raw={health.raw} />
            </FormSection>
            <div className="space-y-4">
              <FormSection
                titulo={t("whatToDo")}
                descripcion={t("actionDescription")}
              >
                {actions.map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={clasesBoton({
                      patron: "button",
                      variante: "secundario",
                      className: "w-full justify-start",
                    })}
                    onClick={() =>
                      setAction({ accion: key, clave: Date.now() })
                    }
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </FormSection>
              <FormSection titulo={t("recentMeasurements")}>
                {data?.history_error ? (
                  <p className="text-xs text-danger-text">{t("trend.error")}</p>
                ) : data?.history.length ? (
                  <ul className="divide-y divide-line">
                    {[...data.history]
                      .reverse()
                      .slice(0, 4)
                      .map((point) => (
                        <li
                          key={point.id}
                          className="flex justify-between gap-3 py-2 text-xs"
                        >
                          <span className="text-fg-secondary">
                            {formatDateTimeInTz(point.created_at, timezone, {
                              locale,
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                          <span className="font-medium">
                            {t("measurementScore", { score: point.score })}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-xs text-fg-secondary">
                    {t("measurementPending")}
                  </p>
                )}
              </FormSection>
            </div>
          </div>
          {action && (
            <AccionesRapidasCrm
              sinBarra
              variante="tarjetaMovil"
              clienteId={health.customer_id}
              cliente={{
                id: health.customer_id,
                full_name: health.customer_name,
                phone: health.phone,
                email: health.email,
                do_not_call: health.do_not_call,
              }}
              abrirAccion={action}
              onCerrado={() => setAction(null)}
              onAccionCompletada={() => {
                setAction(null);
                void load();
              }}
            />
          )}
        </>
      )}
    </>
  );
  if (presentation === "page")
    return open ? (
      <section
        aria-label={health?.customer_name || t("detailTitle")}
        className="min-h-full space-y-4 bg-canvas p-4 lg:p-6"
      >
        {content}
      </section>
    ) : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        hideCloseButton
        onCloseAutoFocus={onCloseAutoFocus}
        className="w-full overflow-y-auto border-line bg-canvas text-fg sm:max-w-[1120px]"
      >
        {content}
      </SheetContent>
    </Sheet>
  );
}
export default HealthDetailDrawer;
