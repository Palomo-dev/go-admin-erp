'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Bell, ExternalLink, User, DollarSign, Hotel, Package,
  ClipboardList, CreditCard, UserPlus, Calendar, AlertTriangle,
  Hash, Clock, TrendingDown, Building2, Mail, Info, AlertCircle, RefreshCw, Trash2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { supabase } from '@/lib/supabase/config';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz, formatPlainDate } from '@/lib/utils/dateDisplay';

// ── Tipos ──────────────────────────────────────────────
interface NotificationForSheet {
  id: string;
  organization_id: number;
  recipient_user_id?: string | null;
  channel: string;
  payload: Record<string, unknown>;
  status: string;
  read_at: string | null; // Deprecado: usar is_read_by_me
  is_read_by_me?: boolean; // true si el usuario actual tiene fila en notification_reads
  created_at: string;
}

interface NotificationDetailSheetProps {
  notification: NotificationForSheet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (url: string) => void;
  /** «Marcar como no leída» (solo para quien la abre). Sin él no se muestra. */
  onMarkUnread?: () => void;
  /** «Descartar» (solo para quien la abre). Sin él no se muestra. */
  onDismiss?: () => void;
}

/** Tono del tipo (Badge y chip del icono, manual de marca: tinte + texto profundo). */
type Tono = 'peligro' | 'advertencia' | 'info' | 'marca' | 'neutro';

export function getTypeTone(type: string): Tono {
  if (type === 'ar_overdue' || type === 'ap_overdue' || type === 'stock_out' || type === 'payment_failed' || type.endsWith('_cancelled') || type === 'no_show' || type === 'opportunity_lost') return 'peligro';
  if (type.startsWith('stock_') || type === 'trial_expiring' || type === 'ai_credits_low' || type === 'transfer_rejected') return 'advertencia';
  if (type.includes('invoice') || type.includes('payment') || type.startsWith('cash_') || type.startsWith('payroll')) return 'info';
  if (type.startsWith('task_') || type.startsWith('opportunity_') || type.startsWith('reservation') || type.startsWith('calendar_')) return 'marca';
  return 'neutro';
}

const TONOS: Record<Tono, { chip: string; badge: string }> = {
  peligro: { chip: 'bg-danger-subtle text-danger-text', badge: 'border-line-danger bg-danger-subtle text-danger-text' },
  advertencia: { chip: 'bg-warning-subtle text-warning-text', badge: 'border-line-warning bg-warning-subtle text-warning-text' },
  info: { chip: 'bg-info-subtle text-info-text', badge: 'border-line-info bg-info-subtle text-info-text' },
  marca: { chip: 'bg-brand-tint text-brand-deep', badge: 'border-line-brand bg-brand-tint text-brand-deep' },
  neutro: { chip: 'bg-subtle text-fg-secondary', badge: 'border-line bg-subtle text-fg-secondary' },
};

// ── Helpers de tipo ────────────────────────────────────
export function getTypeIcon(type: string) {
  if (type.includes('invoice') || type.includes('payment') || type.includes('ar_') || type.includes('ap_')) return DollarSign;
  if (type.includes('reservation') || type.includes('checkin') || type.includes('checkout') || type.includes('housekeeping') || type.includes('no_show')) return Hotel;
  if (type.includes('opportunity') || type.includes('task_')) return ClipboardList;
  if (type.includes('stock') || type.includes('transfer')) return Package;
  if (type.includes('cash_')) return CreditCard;
  if (type.includes('payroll') || type.includes('shift') || type.includes('member') || type.includes('role')) return UserPlus;
  if (type.includes('calendar')) return Calendar;
  if (type.includes('subscription') || type.includes('trial') || type.includes('ai_credits')) return AlertTriangle;
  return Bell;
}

/**
 * Tipos con etiqueta propia en `header.notificationDetail.types`. Un tipo que
 * no esté aquí se muestra como «Notificación».
 */
const TIPOS_CON_ETIQUETA = new Set([
  'purchase_invoice_created', 'payment_registered', 'ar_overdue', 'ap_overdue',
  'reservation_created', 'checkin', 'checkout', 'reservation_cancelled', 'no_show', 'housekeeping_assigned',
  'opportunity_stage_change', 'opportunity_won', 'opportunity_lost', 'task_assigned', 'task_completed',
  'stock_low', 'stock_out', 'stock_low_periodic', 'transfer_created', 'transfer_approved', 'transfer_rejected',
  'cash_opened', 'cash_closed', 'payroll_approved', 'payroll_paid', 'shift_assigned',
  'calendar_event_assigned', 'calendar_event_cancelled',
  'subscription_cancelled', 'trial_ended', 'trial_expiring', 'payment_failed', 'ai_credits_low',
  'new_member', 'role_changed',
]);

/** Traductor de `header.notificationDetail` (lo crea el componente con `useTranslations`). */
type Traductor = ReturnType<typeof useTranslations>;

/** Destino del botón principal; `accion` es la clave en `header.notificationDetail.actions`. */
function getRedirect(notif: NotificationForSheet): { url: string; accion: string } | null {
  const type = String(notif.payload?.type ?? '');
  const p = (notif.payload || {}) as Record<string, string | undefined>;
  switch (type) {
    case 'ar_overdue':
      return p.ar_id ? { url: `/app/finanzas/cuentas-por-cobrar/${p.ar_id}`, accion: 'viewReceivable' } : { url: '/app/finanzas/cuentas-por-cobrar', accion: 'viewReceivables' };
    case 'ap_overdue':
      return p.ap_id ? { url: `/app/finanzas/cuentas-por-pagar/${p.ap_id}`, accion: 'viewPayable' } : { url: '/app/finanzas/cuentas-por-pagar', accion: 'viewPayables' };
    case 'purchase_invoice_created':
      return p.invoice_id ? { url: `/app/finanzas/facturas-compra/${p.invoice_id}`, accion: 'viewInvoice' } : { url: '/app/finanzas/facturas-compra', accion: 'viewInvoices' };
    case 'payment_registered':
      return { url: '/app/finanzas', accion: 'viewFinance' };
    case 'reservation_created': case 'checkin': case 'checkout': case 'reservation_cancelled': case 'no_show':
      return p.reservation_id ? { url: `/app/pms/reservas/${p.reservation_id}`, accion: 'viewReservation' } : { url: '/app/pms/reservas', accion: 'viewReservations' };
    case 'housekeeping_assigned':
      return { url: '/app/pms/housekeeping', accion: 'viewHousekeeping' };
    case 'opportunity_stage_change': case 'opportunity_won': case 'opportunity_lost':
      return p.opportunity_id ? { url: `/app/crm/oportunidades/${p.opportunity_id}`, accion: 'viewOpportunity' } : { url: '/app/crm/oportunidades', accion: 'viewOpportunities' };
    case 'task_agent': case 'task_rescheduled': case 'task_reschedule_summary':
    case 'task_assigned': case 'task_completed':
      return p.task_id ? { url: `/app/pm/tareas?taskId=${p.task_id}`, accion: 'viewTask' } : { url: '/app/pm/tareas', accion: 'viewTasks' };
    case 'stock_low': case 'stock_out': case 'stock_low_periodic':
      return p.product_id ? { url: `/app/inventario/productos/${p.product_id}`, accion: 'viewProduct' } : { url: '/app/inventario/stock', accion: 'viewStock' };
    case 'transfer_created': case 'transfer_approved': case 'transfer_rejected':
      return p.transfer_id ? { url: `/app/inventario/transferencias/${p.transfer_id}`, accion: 'viewTransfer' } : { url: '/app/inventario/transferencias', accion: 'viewTransfers' };
    case 'cash_opened': case 'cash_closed':
      return { url: '/app/pos', accion: 'viewPos' };
    case 'payroll_approved': case 'payroll_paid':
      return { url: '/app/hrm', accion: 'viewPayroll' };
    case 'shift_assigned':
      return { url: '/app/hrm', accion: 'viewShifts' };
    case 'calendar_event_assigned': case 'calendar_event_cancelled':
      return { url: '/app/calendario', accion: 'viewCalendar' };
    case 'subscription_cancelled': case 'trial_ended': case 'trial_expiring': case 'payment_failed':
    case 'ai_credits_low': case 'new_member': case 'role_changed':
      return { url: '/app/organizacion', accion: 'viewOrganization' };
    default:
      return null;
  }
}

// ── Fetch de datos relacionados desde tablas específicas ──
const FECHA_CORTA: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

interface PersonaFila { first_name?: string | null; last_name?: string | null; email?: string | null }
interface ProveedorFila { name?: string | null; email?: string | null }
interface ProductoFila { name?: string | null; sku?: string | null }
interface RelatedData {
  label: string;
  fields: { icon: typeof Bell; label: string; value: string; peligro?: boolean }[];
}

/** Idioma y zona para los valores: los textos salen de `t`, los números y fechas de `locale`. */
interface Formato {
  t: Traductor;
  locale: string;
  timezone: string;
}

async function fetchRelatedData(notif: NotificationForSheet, { t, locale, timezone }: Formato): Promise<RelatedData | null> {
  const type = String(notif.payload?.type ?? '');
  const p = (notif.payload || {}) as Record<string, string | undefined>;
  const numero = (v: unknown) => Number(v ?? 0).toLocaleString(locale);
  const dinero = (v: unknown) => `$${numero(v)}`;
  const fecha = (v: string) => formatDateInTz(v, timezone, { ...FECHA_CORTA, locale });

  try {
    // CxC vencida → accounts_receivable + customers
    if (type === 'ar_overdue' && p.ar_id) {
      const { data: ar, error: arErr } = await supabase
        .from('accounts_receivable')
        .select('id, amount, balance, due_date, status, days_overdue, customer_id')
        .eq('id', p.ar_id)
        .maybeSingle();

      if (arErr) throw arErr;
      if (ar) {
        let cust: PersonaFila | null = null;
        if (ar.customer_id) {
          const { data: c } = await supabase
            .from('customers')
            .select('first_name, last_name, email, phone')
            .eq('id', ar.customer_id)
            .maybeSingle();
          cust = c;
        }
        return {
          label: t('related.receivable'),
          fields: [
            { icon: User, label: t('fields.customer'), value: cust ? `${cust.first_name || ''} ${cust.last_name || ''}`.trim() : '—' },
            { icon: Mail, label: t('fields.email'), value: cust?.email || '—' },
            { icon: DollarSign, label: t('fields.originalAmount'), value: dinero(ar.amount) },
            { icon: TrendingDown, label: t('fields.balanceDue'), value: dinero(ar.balance) },
            { icon: Calendar, label: t('fields.dueDate'), value: ar.due_date ? fecha(ar.due_date) : '—' },
            { icon: Clock, label: t('fields.daysOverdue'), value: t('days', { n: ar.days_overdue ?? 0 }) },
            { icon: Hash, label: t('fields.status'), value: ar.status || '—' },
          ],
        };
      }
    }

    // CxP vencida → accounts_payable + suppliers
    if (type === 'ap_overdue' && p.ap_id) {
      const { data: ap, error: apErr } = await supabase
        .from('accounts_payable')
        .select('id, amount, balance, due_date, status, days_overdue, supplier_id')
        .eq('id', p.ap_id)
        .maybeSingle();

      if (apErr) throw apErr;
      if (ap) {
        let sup: ProveedorFila | null = null;
        if (ap.supplier_id) {
          const { data: s } = await supabase
            .from('suppliers')
            .select('name, email, phone')
            .eq('id', ap.supplier_id)
            .maybeSingle();
          sup = s;
        }
        return {
          label: t('related.payable'),
          fields: [
            { icon: Building2, label: t('fields.supplier'), value: sup?.name || '—' },
            { icon: Mail, label: t('fields.email'), value: sup?.email || '—' },
            { icon: DollarSign, label: t('fields.originalAmount'), value: dinero(ap.amount) },
            { icon: TrendingDown, label: t('fields.balanceDue'), value: dinero(ap.balance) },
            { icon: Calendar, label: t('fields.dueDate'), value: ap.due_date ? fecha(ap.due_date) : '—' },
            { icon: Clock, label: t('fields.daysOverdue'), value: t('days', { n: ap.days_overdue ?? 0 }) },
            { icon: Hash, label: t('fields.status'), value: ap.status || '—' },
          ],
        };
      }
    }

    // Stock bajo → stock_levels + products
    if ((type === 'stock_low' || type === 'stock_out' || type === 'stock_low_periodic') && p.product_id) {
      const { data: sl, error: slErr } = await supabase
        .from('stock_levels')
        .select('qty_on_hand, qty_reserved, min_level, avg_cost, product_id')
        .eq('product_id', p.product_id)
        .limit(1)
        .maybeSingle();

      if (slErr) throw slErr;
      if (sl) {
        let prod: ProductoFila | null = null;
        const { data: pr } = await supabase
          .from('products')
          .select('name, sku, description')
          .eq('id', p.product_id)
          .maybeSingle();
        prod = pr;

        return {
          label: t('related.productStock'),
          fields: [
            { icon: Package, label: t('fields.product'), value: prod?.name || p.product_name || '—' },
            { icon: Hash, label: t('fields.sku'), value: prod?.sku || '—' },
            { icon: TrendingDown, label: t('fields.currentStock'), value: t('units', { qty: numero(sl.qty_on_hand) }), peligro: Number(sl.qty_on_hand) < Number(sl.min_level ?? 0) },
            { icon: AlertTriangle, label: t('fields.minimumRequired'), value: t('units', { qty: numero(sl.min_level) }) },
            { icon: Package, label: t('fields.reserved'), value: t('units', { qty: numero(sl.qty_reserved) }) },
            { icon: DollarSign, label: t('fields.averageCost'), value: sl.avg_cost ? dinero(sl.avg_cost) : '—' },
          ],
        };
      }
    }

    // Reservación → reservations + customers
    if (['reservation_created', 'checkin', 'checkout', 'reservation_cancelled', 'no_show'].includes(type) && p.reservation_id) {
      const { data: res, error: resErr } = await supabase
        .from('reservations')
        .select('id, status, checkin, checkout, total_estimated, occupant_count, notes, customer_id, space_id')
        .eq('id', p.reservation_id)
        .maybeSingle();

      if (resErr) throw resErr;
      if (res) {
        let cust: PersonaFila | null = null;
        if (res.customer_id) {
          const { data: c } = await supabase
            .from('customers')
            .select('first_name, last_name, email, phone')
            .eq('id', res.customer_id)
            .maybeSingle();
          cust = c;
        }
        return {
          label: t('related.reservation'),
          fields: [
            { icon: User, label: t('fields.guest'), value: cust ? `${cust.first_name || ''} ${cust.last_name || ''}`.trim() : '—' },
            { icon: Mail, label: t('fields.email'), value: cust?.email || '—' },
            { icon: Calendar, label: t('fields.checkIn'), value: res.checkin ? formatPlainDate(res.checkin, FECHA_CORTA) : '—' },
            { icon: Calendar, label: t('fields.checkOut'), value: res.checkout ? formatPlainDate(res.checkout, FECHA_CORTA) : '—' },
            { icon: DollarSign, label: t('fields.estimatedTotal'), value: res.total_estimated ? dinero(res.total_estimated) : '—' },
            { icon: UserPlus, label: t('fields.occupants'), value: numero(res.occupant_count ?? 1) },
            { icon: Hash, label: t('fields.status'), value: res.status || '—' },
          ],
        };
      }
    }

    // Factura de compra
    if (type === 'purchase_invoice_created' && p.invoice_id) {
      const { data: inv, error: invErr } = await supabase
        .from('invoice_purchase')
        .select('id, number_ext, total, status, due_date, supplier_id')
        .eq('id', p.invoice_id)
        .maybeSingle();

      if (invErr) throw invErr;
      if (inv) {
        let sup: ProveedorFila | null = null;
        if (inv.supplier_id) {
          const { data: s } = await supabase
            .from('suppliers')
            .select('name')
            .eq('id', inv.supplier_id)
            .maybeSingle();
          sup = s;
        }
        return {
          label: t('related.purchaseInvoice'),
          fields: [
            { icon: Hash, label: t('fields.number'), value: inv.number_ext || inv.id.substring(0, 8) },
            { icon: Building2, label: t('fields.supplier'), value: sup?.name || '—' },
            { icon: DollarSign, label: t('fields.total'), value: inv.total ? dinero(inv.total) : '—' },
            { icon: Calendar, label: t('fields.dueDate'), value: inv.due_date ? fecha(inv.due_date) : '—' },
            { icon: Hash, label: t('fields.status'), value: inv.status || '—' },
          ],
        };
      }
    }

  } catch (err) {
    console.error('[NotifSheet] Error fetching related data:', err);
    throw err;
  }

  return null;
}

/** Claves del payload con etiqueta propia en `header.notificationDetail.payloadKeys`. */
const CLAVES_PAYLOAD = new Set(['balance', 'due_date', 'qty', 'min', 'product_name', 'amount', 'difference', 'new_role_id', 'priority', 'event_type']);

// ── Componente principal ──────────────────────────────
// Figma `02 Componentes` › NotificationDetail 625:14683: hoja lateral de 440 px
// en escritorio y hoja inferior en móvil. Cabecera con chip del tipo, título y
// badges (tipo · canal); texto; fecha y destinatario; datos relacionados del
// recurso con sus estados (cargando, sin datos, error con reintentar); acción
// principal a ancho completo y, debajo, «Marcar como no leída» y «Descartar».
export function NotificationDetailSheet({ notification, open, onOpenChange, onNavigate, onMarkUnread, onDismiss }: NotificationDetailSheetProps) {
  const t = useTranslations('header.notificationDetail');
  const locale = useLocale();
  const movil = useMediaQuery('(max-width: 1023px)');
  const [relatedData, setRelatedData] = useState<RelatedData | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [errorRelated, setErrorRelated] = useState(false);
  const [intento, setIntento] = useState(0);
  const { timezone } = useOrgTimezone();

  useEffect(() => {
    if (!notification || !open) return;
    let vivo = true;
    setLoadingRelated(true);
    setErrorRelated(false);
    setRelatedData(null);
    fetchRelatedData(notification, { t, locale, timezone })
      .then((data) => vivo && setRelatedData(data))
      .catch(() => vivo && setErrorRelated(true))
      .finally(() => vivo && setLoadingRelated(false));
    return () => {
      vivo = false;
    };
    // Se relee al cambiar de notificación (por id), de idioma o al reintentar,
    // no cuando el objeto se recrea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification?.id, open, timezone, locale, intento]);

  if (!notification) return null;

  const n = notification;
  const type = String(n.payload?.type ?? '');
  const title = String(n.payload?.title || type || t('notification'));
  // Algunos emisores (p. ej. cocina) mandan el texto en `message` en vez de `content`.
  const content = String(n.payload?.content ?? n.payload?.message ?? '');
  const TypeIcon = getTypeIcon(type);
  const tono = TONOS[getTypeTone(type)];
  const typeLabel = TIPOS_CON_ETIQUETA.has(type) ? t(`types.${type}`) : t('notification');
  const redirect = getRedirect(n);

  // Payload extra (excluir keys ya mostradas)
  const hiddenKeys = new Set(['type', 'title', 'content', 'message']);
  // Los identificadores (…_id, uuids) no le dicen nada a la persona: ya van en el
  // botón que abre el recurso. Solo se muestran valores legibles.
  const esTecnico = (key: string, value: unknown) =>
    key === 'id' || key.endsWith('_id') || key.endsWith('_uuid') ||
    (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) ||
    (value !== null && typeof value === 'object');
  const extraPayload = Object.entries(n.payload || {}).filter(([key, value]) => !hiddenKeys.has(key) && !esTecnico(key, value));

  const formatVal = (key: string, value: unknown): string => {
    const str = String(value);
    if (key === 'balance' || key === 'amount' || key === 'difference') {
      const num = parseFloat(str);
      return isNaN(num) ? str : `$${num.toLocaleString(locale)}`;
    }
    if (key === 'due_date' && str.length > 8) {
      // YYYY-MM-DD es un día calendario (no se convierte); con hora es un instante.
      return (str.length === 10 ? formatPlainDate(str, FECHA_CORTA) : formatDateInTz(str, timezone, { ...FECHA_CORTA, locale })) || str;
    }
    return str;
  };

  const etiquetaPayload = (key: string) => (CLAVES_PAYLOAD.has(key) ? t(`payloadKeys.${key}`) : key.replace(/_/g, ' '));
  const canal = t.has(`channels.${n.channel}`) ? t(`channels.${n.channel}`) : n.channel;
  const fecha = [
    formatDateInTz(n.created_at, timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', locale }),
    formatDateInTz(n.created_at, timezone, { hour: 'numeric', minute: '2-digit', locale }),
  ].join(' · ');
  const tituloRelacionados = relatedData ? t('relatedTitle', { label: relatedData.label }) : t('relatedTitleGeneric');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={movil ? 'bottom' : 'right'}
        hideCloseButton
        className={cn(
          'flex flex-col gap-0 border-line bg-surface p-0 text-fg',
          movil ? 'max-h-[92dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'h-full w-full sm:max-w-[440px]'
        )}
      >
        {movil && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />}

        {/* Cabecera */}
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tono.chip)} aria-hidden="true">
            <TypeIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-base font-semibold leading-[22px] text-fg">{title}</SheetTitle>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold leading-4', tono.badge)}>{typeLabel}</span>
              <span className="rounded-full border border-line bg-subtle px-2 py-0.5 text-xs font-semibold leading-4 text-fg-secondary">{canal}</span>
              {!n.is_read_by_me && <span className="sr-only">{t('new')}</span>}
            </div>
            <SheetDescription className="sr-only">{t('srDescription')}</SheetDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t('close')}
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-secondary outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {content && <p className="rounded-lg bg-subtle p-3 text-sm leading-5 text-fg-secondary">{content}</p>}

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-fg-muted">{t('date')}</dt>
              <dd className="mt-0.5 text-fg">{fecha}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-fg-muted">{t('recipient')}</dt>
              <dd className="mt-0.5 text-fg">{n.recipient_user_id ? t('onlyYou') : t('wholeOrganization')}</dd>
            </div>
          </dl>

          {extraPayload.length > 0 && (
            <div className="rounded-lg border border-line">
              <p className="border-b border-line px-3 py-2 text-xs font-semibold text-fg-secondary">{t('payloadData')}</p>
              <dl className="divide-y divide-line">
                {extraPayload.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <dt className="text-fg-secondary">{etiquetaPayload(key)}</dt>
                    <dd className="text-right font-medium text-fg">{formatVal(key, value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {type && (
            <section aria-busy={loadingRelated}>
              <h3 className="mb-2 text-xs font-semibold text-fg">{tituloRelacionados}</h3>
              {loadingRelated ? (
                <div className="space-y-2.5 rounded-lg border border-line p-3" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-3 w-2/5 animate-pulse rounded bg-subtle" />
                  ))}
                </div>
              ) : errorRelated ? (
                <div className="rounded-lg border border-line-danger bg-danger-subtle p-3" role="alert">
                  <p className="flex items-center gap-2 text-sm font-medium text-danger-text">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t('relatedError')}
                  </p>
                  <p className="mt-1 pl-6 text-xs text-fg-secondary">{t('relatedErrorHint')}</p>
                  <button
                    type="button"
                    onClick={() => setIntento((x) => x + 1)}
                    className="ml-4 mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-fg hover:bg-hover"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('retry')}
                  </button>
                </div>
              ) : relatedData ? (
                <dl className="divide-y divide-line rounded-lg border border-line">
                  {relatedData.fields.map((field, idx) => {
                    const FieldIcon = field.icon;
                    return (
                      <div key={idx} className="flex items-center gap-2.5 px-3 py-2.5 text-sm">
                        <FieldIcon className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
                        <dt className="text-fg-secondary">{field.label}</dt>
                        <dd className={cn('ml-auto text-right font-medium', field.peligro ? 'text-danger-text' : 'text-fg')}>{field.value}</dd>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <p className="flex gap-2 rounded-lg bg-subtle p-3 text-xs text-fg-secondary">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  {t('noRelatedHint')}
                </p>
              )}
            </section>
          )}
        </div>

        {/* Pie */}
        {(redirect || onMarkUnread || onDismiss) && (
          <div className="shrink-0 space-y-2 border-t border-line px-5 py-4">
            {redirect && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onNavigate(redirect.url);
                }}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-action text-sm font-medium text-fg-on-brand outline-none hover:bg-brand-action-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t(`actions.${redirect.accion}`)}
              </button>
            )}
            {(onMarkUnread || onDismiss) && (
              <div className="flex items-center justify-between">
                {onMarkUnread ? (
                  <button
                    type="button"
                    onClick={onMarkUnread}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-fg hover:bg-hover"
                  >
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    {t('markUnread')}
                  </button>
                ) : (
                  <span />
                )}
                {onDismiss && (
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-fg hover:bg-hover"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {t('dismiss')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
