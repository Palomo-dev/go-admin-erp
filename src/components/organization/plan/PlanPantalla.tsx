'use client';

/**
 * Organización › Plan y facturación › Plan (Figma 08, secciones 7 y 9).
 *
 * - Un solo juego de botones: la acción principal vive en la tarjeta del plan
 *   y el resto en el «⋯» de la cabecera (portal, ciclo, reanudar, cancelar).
 * - Estados «Suscripción vencida» y «Prueba vencida» con su acción (pagar la
 *   factura pendiente, elegir plan), en lugar de la redirección silenciosa.
 * - «Uso del plan»: medidores proporcionales (amarillo ≥ 80 %, rojo ≥ 95 %) con
 *   «Comprar más» al lado; créditos de IA «del plan · comprados · se renuevan
 *   el …» de `GET /api/me/plan`.
 * - Cancelar con ConfirmDialog; en prueba se cancela al terminar la prueba
 *   (P1-1). Se acabaron `alert()` y `confirm()`.
 * - Una sola fuente de datos (`/api/me/plan`): antes la tarjeta hacía
 *   `.maybeSingle()` sin orden sobre `subscriptions` y fallaba con dos filas
 *   (P1-9), y el permiso se decidía por `role_id` (P1-2).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  ExternalLink,
  Info,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { RowActionsMenu, StatusBadge, Tarjeta, clasesBoton, type AccionFila } from '@/components/kit';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { useOrganizacionesUsuario } from '@/components/shell/header/useOrganizacionesUsuario';
import {
  accionesPlan,
  avancePrueba,
  estadoPlan,
  resultadoCompraEnUrl,
  tonoEstadoPlan,
  type EstadoPlan,
  type TipoCompra,
} from '@/lib/organizacion/plan';
import { cn } from '@/utils/Utils';
import { formatMoneda } from '@/lib/utils/moneda';
import ChangePlanModal from '../ChangePlanModal';
import PaymentMethodCard from '../PaymentMethodCard';
import { PantallaOrganizacion } from '../acceso/PantallaOrganizacion';
import { MedidorUso } from '../acceso/Cupo';
import { DialogoCompra } from '../acceso/DialogoCompra';
import { useCupoPlan } from '../acceso/useCupoPlan';
import { useAccesoOrganizacion } from '../acceso/useAccesoOrganizacion';

interface FacturaStripe {
  id: string;
  status: string | null;
  amount: number;
  currency: string;
  dueDate: string | null;
  created: string;
  hostedInvoiceUrl: string | null;
}

type Confirmacion = 'cancelar' | 'ciclo' | 'reactivar';

function usePlanFechas() {
  const { timezone } = useFormatDate();
  const locale = useLocaleIntl();
  return useCallback(
    (valor: string | null | undefined) => (valor ? formatDateInTz(valor, timezone, { locale, day: 'numeric', month: 'long' }) : ''),
    [timezone, locale],
  );
}

function ContenidoPlan({
  organizationId,
  onConfirmar,
  abrirPortal,
}: {
  organizationId: number;
  onConfirmar: (c: Confirmacion) => void;
  abrirPortal: () => Promise<void>;
}) {
  const t = useTranslations('org.acceso.plan');
  const tc = useTranslations('org.acceso.compras');
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const fecha = usePlanFechas();
  const cupo = useCupoPlan();
  const params = useSearchParams();
  const router = useRouter();
  const { organizaciones } = useOrganizacionesUsuario();
  const nombreOrg = organizaciones?.find((o) => o.id === organizationId)?.nombre ?? '';

  const [facturas, setFacturas] = useState<FacturaStripe[] | null>(null);
  const [cambiarPlan, setCambiarPlan] = useState(false);
  const [compra, setCompra] = useState<{ tipo: TipoCompra; exito?: boolean } | null>(null);

  const plan = cupo.datos?.plan ?? null;
  const uso = cupo.datos?.uso;
  const estado: EstadoPlan = estadoPlan(plan);
  const acciones = accionesPlan(estado, !!plan?.conStripe);

  // Decimales por moneda (COP sin decimales, USD con 2): la regla única de `lib/utils/moneda`.
  const dinero = useMemo(() => (valor: number, moneda: string) => formatMoneda(valor, moneda.toUpperCase(), { locale }), [locale]);

  // Facturas de Stripe (para «Pagar» la vencida y «Próxima factura»).
  useEffect(() => {
    if (!plan?.clienteStripe) {
      setFacturas([]);
      return;
    }
    let vivo = true;
    fetch(`/api/subscriptions/invoices?organizationId=${organizationId}&limit=5`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((j: { invoices?: FacturaStripe[] }) => vivo && setFacturas(j.invoices ?? []))
      .catch(() => vivo && setFacturas([]));
    return () => {
      vivo = false;
    };
  }, [organizationId, plan?.clienteStripe]);
  const pendiente = facturas?.find((f) => f.status === 'open') ?? null;

  // Regreso de la pasarela (?addon=success, ?ai_credits=…, ?checkout=…).
  useEffect(() => {
    if (!params) return;
    const r = resultadoCompraEnUrl(new URLSearchParams(params.toString()));
    if (!r) return;
    if (r.ok && r.tipo !== 'plan') setCompra({ tipo: r.tipo === 'creditos' ? 'creditos' : 'usuarios', exito: true });
    else if (r.ok) toast.success(t('toasts.planPagado'));
    else toast.info(t('toasts.pagoCancelado'));
    void cupo.recargar();
    router.replace('/app/organizacion/plan', { scroll: false });
    // Solo al llegar con los parámetros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (cupo.error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-line-danger bg-danger-subtle p-4">
        <p className="text-sm font-semibold text-danger-text">{t('error.titulo')}</p>
        <p className="text-[13px] text-fg-secondary">{t('error.descripcion')}</p>
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void cupo.recargar()}>
          {t('error.reintentar')}
        </button>
      </div>
    );
  }
  if (cupo.cargando || !uso) {
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-32 rounded-xl lg:col-span-2" />
      </div>
    );
  }

  const avance = plan?.estado === 'prueba' ? avancePrueba(plan.diasPruebaRestantes, plan.diasPruebaTotales) : null;
  const ia = uso.creditosIa;
  const iaUsados = ia.cupoMensual !== null ? Math.max(0, ia.cupoMensual - ia.restantesPlan) : 0;
  const puedeComprar = acciones.comprar;

  const primaria = (() => {
    switch (acciones.primaria) {
      case 'pagar':
        return pendiente?.hostedInvoiceUrl ? (
          <a href={pendiente.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className={clasesBoton({ anchoCompleto: true })}>
            {t('acciones.pagar', { total: dinero(pendiente.amount / 100, pendiente.currency) })}
          </a>
        ) : (
          <button type="button" className={clasesBoton({ anchoCompleto: true })} onClick={() => void abrirPortal()}>
            {t('acciones.irAlPortal')}
          </button>
        );
      case 'renovar':
        return (
          <button type="button" className={clasesBoton({ anchoCompleto: true })} onClick={() => setCambiarPlan(true)}>
            {t('acciones.renovar')}
          </button>
        );
      case 'elegirPlan':
        return (
          <button type="button" className={clasesBoton({ anchoCompleto: true })} onClick={() => setCambiarPlan(true)}>
            {t('acciones.elegirPlan')}
          </button>
        );
      default:
        return (
          <button type="button" className={clasesBoton({ anchoCompleto: true })} onClick={() => setCambiarPlan(true)}>
            {t('acciones.cambiarPlan')}
          </button>
        );
    }
  })();

  const secundaria =
    estado === 'prueba' || estado === 'pruebaVencida' || estado === 'sinPlan' ? (
      <button type="button" className={clasesBoton({ variante: 'tinte', anchoCompleto: true })} onClick={() => setCambiarPlan(true)}>
        {t('acciones.compararPlanes')}
      </button>
    ) : (
      <Link href="/app/plan/billing" className={clasesBoton({ variante: 'tinte', anchoCompleto: true })}>
        {t('acciones.verFacturas')}
      </Link>
    );

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {estado === 'vencida' && (
        <Banner tono="peligro" icono={AlertCircle} titulo={t('banner.vencida.titulo', { fecha: fecha(plan?.finPeriodo) })} descripcion={t('banner.vencida.descripcion')}>
          {pendiente?.hostedInvoiceUrl ? (
            <a href={pendiente.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('acciones.pagar', { total: dinero(pendiente.amount / 100, pendiente.currency) })}
            </a>
          ) : (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void abrirPortal()}>
              {t('acciones.irAlPortal')}
            </button>
          )}
        </Banner>
      )}
      {estado === 'pruebaVencida' && (
        <Banner tono="advertencia" icono={AlertTriangle} titulo={t('banner.pruebaVencida.titulo', { dias: plan?.diasPruebaTotales ?? 0, fecha: fecha(plan?.finPrueba) })} descripcion={t('banner.pruebaVencida.descripcion')}>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setCambiarPlan(true)}>
            {t('acciones.elegirPlan')}
          </button>
        </Banner>
      )}
      {estado === 'cancelaAlFinal' && (
        <Banner tono="informacion" icono={Info} titulo={t('banner.cancelaAlFinal.titulo', { fecha: fecha(plan?.proximoCobro) })} descripcion={t('banner.cancelaAlFinal.descripcion')}>
          {acciones.reactivar && (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => onConfirmar('reactivar')}>
              {t('acciones.reactivar')}
            </button>
          )}
        </Banner>
      )}
      {estado === 'cancelada' && (
        <Banner tono="neutro" icono={XCircle} titulo={t('banner.cancelada.titulo')} descripcion={t('banner.cancelada.descripcion')}>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setCambiarPlan(true)}>
            {t('acciones.renovar')}
          </button>
        </Banner>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-4 lg:gap-6">
          <Tarjeta
            titulo={t('tarjeta.titulo')}
            accion={plan?.nombre ? <StatusBadge estado="plan" tono="marca" etiqueta={plan.nombre} tamano="sm" /> : undefined}
          >
            {plan ? (
              <div className="flex flex-col gap-4">
                {avance !== null && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-fg-secondary">{t('tarjeta.diasPrueba')}</span>
                      <span className="tabular-nums text-fg">
                        {t('tarjeta.diasDe', { usados: Math.max(0, (plan.diasPruebaTotales ?? 0) - (plan.diasPruebaRestantes ?? 0)), total: plan.diasPruebaTotales ?? 0 })}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                      <div className={cn('h-full rounded-full', estado === 'pruebaVencida' || avance >= 0.95 ? 'bg-danger' : avance >= 0.8 ? 'bg-warning' : 'bg-brand-action')} style={{ width: `${Math.round(avance * 100)}%` }} />
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-base font-semibold tabular-nums text-fg">
                    {plan.precio !== null ? t(plan.periodo === 'anual' ? 'tarjeta.precioAnual' : 'tarjeta.precioMensual', { precio: dinero(plan.precio, plan.moneda) }) : t('tarjeta.aMedida')}
                  </p>
                  <p className="text-[13px] text-fg-secondary">{lineaEstado(t, estado, plan, fecha)}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {primaria}
                  {secundaria}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-fg-secondary">{t('tarjeta.sinPlan')}</p>
                {primaria}
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo={estado === 'vencida' && pendiente ? t('factura.vencidaTitulo') : t('factura.titulo')} icono={CalendarClock}>
            {estado === 'vencida' && pendiente ? (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('factura.emitida')}</dt>
                  <dd className="text-fg">{fecha(pendiente.created)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                  <dt className="text-fg">{t('factura.totalPendiente')}</dt>
                  <dd className="tabular-nums text-fg">{dinero(pendiente.amount / 100, pendiente.currency)}</dd>
                </div>
                <p className="text-xs text-fg-secondary">{t('factura.notaVencida')}</p>
              </dl>
            ) : plan && plan.proximoCobro && estado !== 'cancelada' && estado !== 'pruebaVencida' ? (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{estado === 'prueba' ? t('factura.primerCobro') : t('factura.fecha')}</dt>
                  <dd className="text-fg">{fecha(plan.proximoCobro)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('factura.lineaPlan', { plan: plan.nombre ?? '', periodo: t(`periodo.${plan.periodo}`) })}</dt>
                  <dd className="tabular-nums text-fg">{plan.precio !== null ? dinero(plan.precio, plan.moneda) : '—'}</dd>
                </div>
                {((uso.usuarios.comprados ?? 0) > 0 || (uso.sucursales.comprados ?? 0) > 0) && (
                  <p className="text-xs text-fg-secondary">
                    {t('factura.complementos', { usuarios: uso.usuarios.comprados ?? 0, sucursales: uso.sucursales.comprados ?? 0 })}
                  </p>
                )}
                <p className="text-xs text-fg-secondary">{t('factura.notaImpuestos')}</p>
              </dl>
            ) : (
              <p className="text-sm text-fg-secondary">{estado === 'pruebaVencida' ? t('factura.alElegir') : t('factura.sinProxima')}</p>
            )}
          </Tarjeta>
        </div>

        <Tarjeta titulo={t('uso.titulo')} descripcion={t('uso.descripcion')}>
          <div className="flex flex-col gap-5">
            <MedidorUso
              etiqueta={t('uso.usuarios')}
              actual={cupo.usuarios?.usados ?? 0}
              maximo={cupo.usuarios?.maximo ?? null}
              valor={cupo.usuarios?.maximo == null ? t('uso.sinTope', { n: entero(cupo.usuarios?.usados ?? 0) }) : t('uso.de', { actual: entero(cupo.usuarios.usados), maximo: entero(cupo.usuarios.maximo) })}
              detalle={(uso.usuarios.invitacionesVigentes ?? 0) > 0 ? t('uso.incluyeInvitaciones', { n: uso.usuarios.invitacionesVigentes ?? 0 }) : undefined}
              onComprar={puedeComprar && cupo.usuarios?.maximo != null ? () => setCompra({ tipo: 'usuarios' }) : undefined}
              textoComprar={tc('comprarMas')}
            />
            <MedidorUso
              etiqueta={t('uso.sucursales')}
              actual={cupo.sucursales?.usados ?? 0}
              maximo={cupo.sucursales?.maximo ?? null}
              valor={cupo.sucursales?.maximo == null ? t('uso.sinTope', { n: entero(cupo.sucursales?.usados ?? 0) }) : t('uso.de', { actual: entero(cupo.sucursales.usados), maximo: entero(cupo.sucursales.maximo) })}
              onComprar={puedeComprar && cupo.sucursales?.maximo != null ? () => setCompra({ tipo: 'sucursales' }) : undefined}
              textoComprar={tc('comprarMas')}
            />
            <MedidorUso
              etiqueta={t('uso.creditos')}
              actual={iaUsados}
              maximo={ia.cupoMensual}
              valor={ia.cupoMensual === null ? t('uso.saldo', { n: entero(ia.restantesPlan + ia.comprados) }) : t('uso.usadosDe', { actual: entero(iaUsados), maximo: entero(ia.cupoMensual) })}
              detalle={
                ia.seRenuevan
                  ? t('uso.creditosDetalle', { plan: entero(ia.restantesPlan), comprados: entero(ia.comprados), fecha: fecha(ia.seRenuevan) })
                  : t('uso.creditosDetalleSinFecha', { plan: entero(ia.restantesPlan), comprados: entero(ia.comprados) })
              }
              onComprar={puedeComprar ? () => setCompra({ tipo: 'creditos' }) : undefined}
              textoComprar={tc('comprarMas')}
            />
          </div>
        </Tarjeta>
      </div>

      <PaymentMethodCard stripeCustomerId={plan?.clienteStripe ? 'cliente' : null} organizationId={organizationId} onPaymentMethodUpdated={() => void cupo.recargar()} />

      {cambiarPlan && (
        <ChangePlanModal
          isOpen
          onClose={() => setCambiarPlan(false)}
          organizationId={organizationId}
          organizationName={nombreOrg}
          currentPlanId={plan?.codigo ?? 'free'}
          onPlanChanged={() => {
            setCambiarPlan(false);
            void cupo.recargar();
          }}
        />
      )}
      {compra && (
        <DialogoCompra
          abierto
          onAbiertoChange={(a) => !a && setCompra(null)}
          tipo={compra.tipo}
          organizationId={organizationId}
          estadoPlan={estado}
          maximo={compra.tipo === 'usuarios' ? cupo.usuarios?.maximo ?? null : compra.tipo === 'sucursales' ? cupo.sucursales?.maximo ?? null : undefined}
          faseInicial={compra.exito ? 'exito' : undefined}
        />
      )}
    </div>
  );
}

function lineaEstado(
  t: ReturnType<typeof useTranslations>,
  estado: EstadoPlan,
  plan: { finPeriodo?: string | null; finPrueba?: string | null; proximoCobro: string | null; diasPruebaRestantes: number | null },
  fecha: (v: string | null | undefined) => string,
): string {
  switch (estado) {
    case 'prueba':
      return t('tarjeta.lineaPrueba', { dias: plan.diasPruebaRestantes ?? 0, fecha: fecha(plan.finPrueba ?? plan.proximoCobro) });
    case 'pruebaVencida':
      return t('tarjeta.lineaPruebaVencida', { fecha: fecha(plan.finPrueba) });
    case 'vencida':
      return t('tarjeta.lineaVencida', { fecha: fecha(plan.finPeriodo) });
    case 'cancelaAlFinal':
      return t('tarjeta.lineaCancelaAlFinal', { fecha: fecha(plan.proximoCobro) });
    case 'cancelada':
      return t('tarjeta.lineaCancelada');
    default:
      return plan.proximoCobro ? t('tarjeta.lineaActiva', { fecha: fecha(plan.proximoCobro) }) : '';
  }
}

const TONO_BANNER = {
  peligro: 'border-line-danger bg-danger-subtle text-danger-text',
  advertencia: 'border-line-warning bg-warning-subtle text-warning-text',
  informacion: 'border-line-info bg-info-subtle text-info-text',
  neutro: 'border-line bg-subtle text-fg',
} as const;

function Banner({
  tono,
  icono: Icono,
  titulo,
  descripcion,
  children,
}: {
  tono: keyof typeof TONO_BANNER;
  icono: typeof AlertCircle;
  titulo: string;
  descripcion: string;
  children?: React.ReactNode;
}) {
  return (
    <div role={tono === 'peligro' ? 'alert' : 'status'} className={cn('flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between', TONO_BANNER[tono])}>
      <div className="flex min-w-0 gap-3">
        <Icono aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="text-[13px] text-fg-secondary">{descripcion}</p>
        </div>
      </div>
      {children && <div className="flex shrink-0 gap-2">{children}</div>}
    </div>
  );
}

/** «⋯» de la cabecera de Plan: solo acciones de página (Figma 08, sección 7). */
function MenuPlan({
  estado,
  conPortal,
  anual,
  reactivar,
  cancelar,
  onPortal,
  onConfirmar,
}: {
  estado: EstadoPlan;
  conPortal: boolean;
  anual: boolean;
  reactivar: boolean;
  cancelar: boolean;
  onPortal: () => void;
  onConfirmar: (c: Confirmacion) => void;
}) {
  const t = useTranslations('org.acceso.plan');
  const router = useRouter();
  const acciones: AccionFila[] = [
    { id: 'portal', etiqueta: t('menu.portal'), icono: ExternalLink, onSelect: onPortal, oculta: !conPortal },
    { id: 'facturas', etiqueta: t('menu.facturas'), icono: CreditCard, onSelect: () => router.push('/app/plan/billing') },
    {
      id: 'ciclo',
      etiqueta: anual ? t('menu.pasarMensual') : t('menu.pasarAnual'),
      icono: ArrowLeftRight,
      onSelect: () => onConfirmar('ciclo'),
      oculta: estado !== 'activa' || !conPortal,
    },
    { id: 'reactivar', etiqueta: t('menu.reactivar'), icono: RotateCcw, onSelect: () => onConfirmar('reactivar'), oculta: !reactivar },
    { id: 'cancelar', etiqueta: t('menu.cancelar'), icono: XCircle, destructiva: true, onSelect: () => onConfirmar('cancelar'), oculta: !cancelar },
  ];
  return <RowActionsMenu acciones={acciones} orientacion="horizontal" tamano="md" titulo={t('titulo')} />;
}

export function PlanPantalla() {
  const t = useTranslations('org.acceso.plan');
  const cupo = useCupoPlan();
  const acceso = useAccesoOrganizacion();
  const organizationId = acceso.organizationId;
  const fecha = usePlanFechas();
  const plan = cupo.datos?.plan ?? null;
  const estado = estadoPlan(plan);
  const acciones = accionesPlan(estado, !!plan?.conStripe);
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const abrirPortal = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, returnUrl: window.location.href }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string };
      if (!res.ok || !json.url) throw new Error();
      window.location.href = json.url;
    } catch {
      toast.error(t('toasts.errorPortal'));
    }
  }, [organizationId, t]);

  const ejecutar = async () => {
    if (!confirmar || !organizationId) return;
    setTrabajando(true);
    try {
      let res: Response;
      if (confirmar === 'ciclo') {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        res = await fetch('/api/subscriptions/change-billing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ organizationId, billingPeriod: plan?.periodo === 'anual' ? 'monthly' : 'yearly' }),
        });
      } else {
        res = await fetch('/api/subscriptions/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId, action: confirmar === 'reactivar' ? 'reactivate' : 'cancel' }),
        });
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error);
      toast.success(t(`toasts.${confirmar}`));
      setConfirmar(null);
      await cupo.recargar();
    } catch (e) {
      toast.error(t(`toasts.error.${confirmar}`), { description: e instanceof Error && e.message ? e.message : undefined });
    } finally {
      setTrabajando(false);
    }
  };

  const subtitulo = plan
    ? [
        t('subtitulo.plan', { plan: plan.nombre ?? '', periodo: t(`periodo.${plan.periodo}`) }),
        estado === 'vencida'
          ? t('subtitulo.vencio', { fecha: fecha(plan.finPeriodo) })
          : estado === 'pruebaVencida'
            ? t('subtitulo.pruebaTermino', { fecha: fecha(plan.finPrueba) })
            : estado === 'prueba'
              ? t('subtitulo.pruebaHasta', { fecha: fecha(plan.finPrueba ?? plan.proximoCobro) })
              : plan.proximoCobro && estado === 'activa'
                ? t('subtitulo.renueva', { fecha: fecha(plan.proximoCobro) })
                : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  const menu = (
    <MenuPlan
      estado={estado}
      conPortal={!!plan?.clienteStripe}
      anual={plan?.periodo === 'anual'}
      reactivar={acciones.reactivar}
      cancelar={acciones.cancelar}
      onPortal={() => void abrirPortal()}
      onConfirmar={setConfirmar}
    />
  );
  return (
    <>
      <PantallaOrganizacion
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={CreditCard}
        permiso="facturacion"
        badge={plan ? <StatusBadge estado={estado} tono={tonoEstadoPlan(estado)} etiqueta={t(`estados.${estado}`)} tamano="md" /> : undefined}
        acciones={menu}
        movil={{ accion: menu }}
      >
        {({ organizationId: org }) => <ContenidoPlan organizationId={org} onConfirmar={setConfirmar} abrirPortal={abrirPortal} />}
      </PantallaOrganizacion>
      <ConfirmDialog
        open={confirmar !== null}
        onOpenChange={(o) => !o && !trabajando && setConfirmar(null)}
        title={confirmar === 'ciclo' ? t(plan?.periodo === 'anual' ? 'confirmar.cicloMensualTitulo' : 'confirmar.cicloAnualTitulo') : confirmar ? t(`confirmar.${confirmar}Titulo`) : ''}
        description={
          confirmar === 'cancelar'
            ? estado === 'prueba'
              ? t('confirmar.cancelarPrueba', { fecha: fecha(plan?.finPrueba) })
              : t('confirmar.cancelarDescripcion', { fecha: fecha(plan?.proximoCobro) })
            : confirmar
              ? t(`confirmar.${confirmar}Descripcion`)
              : ''
        }
        confirmLabel={confirmar ? t(`confirmar.${confirmar}`) : ''}
        cancelLabel={t('confirmar.volver')}
        variant={confirmar === 'cancelar' ? 'destructive' : 'default'}
        loading={trabajando}
        onConfirm={ejecutar}
      />
    </>
  );
}
