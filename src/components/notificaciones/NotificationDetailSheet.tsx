'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bell, ExternalLink, User, DollarSign, Hotel, Package,
  ClipboardList, CreditCard, UserPlus, Calendar, AlertTriangle,
  Hash, Clock, TrendingDown, Building2, Mail,
} from 'lucide-react';
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
}

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
  fields: { icon: typeof Bell; label: string; value: string }[];
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

      if (arErr) console.error('[NotifSheet] ar query error:', arErr.message);
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

      if (apErr) console.error('[NotifSheet] ap query error:', apErr.message);
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

      if (slErr) console.error('[NotifSheet] stock query error:', slErr.message);
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
            { icon: TrendingDown, label: t('fields.currentStock'), value: t('units', { qty: numero(sl.qty_on_hand) }) },
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

      if (resErr) console.error('[NotifSheet] reservation query error:', resErr.message);
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

      if (invErr) console.error('[NotifSheet] invoice query error:', invErr.message);
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
  }

  return null;
}

/** Claves del payload con etiqueta propia en `header.notificationDetail.payloadKeys`. */
const CLAVES_PAYLOAD = new Set(['balance', 'due_date', 'qty', 'min', 'product_name', 'amount', 'difference', 'new_role_id', 'priority', 'event_type']);

// ── Componente principal ──────────────────────────────
export function NotificationDetailSheet({ notification, open, onOpenChange, onNavigate }: NotificationDetailSheetProps) {
  const t = useTranslations('header.notificationDetail');
  const locale = useLocale();
  const [relatedData, setRelatedData] = useState<RelatedData | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const { timezone } = useOrgTimezone();

  useEffect(() => {
    if (notification && open) {
      setLoadingRelated(true);
      setRelatedData(null);
      fetchRelatedData(notification, { t, locale, timezone }).then(data => {
        setRelatedData(data);
        setLoadingRelated(false);
      });
    }
    // Se relee al cambiar de notificación (por id) o de idioma, no cuando el
    // objeto se recrea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification?.id, open, timezone, locale]);

  if (!notification) return null;

  const n = notification;
  const type = String(n.payload?.type ?? '');
  const title = String(n.payload?.title || type || t('notification'));
  const content = String(n.payload?.content ?? '');
  const TypeIcon = getTypeIcon(type);
  const typeLabel = TIPOS_CON_ETIQUETA.has(type) ? t(`types.${type}`) : t('notification');
  const redirect = getRedirect(n);

  // Payload extra (excluir keys ya mostradas)
  const hiddenKeys = new Set(['type', 'title', 'content', 'ar_id', 'ap_id', 'invoice_id', 'reservation_id', 'product_id', 'transfer_id', 'task_id', 'opportunity_id', 'event_id']);
  const extraPayload = Object.entries(n.payload || {}).filter(([key]) => !hiddenKeys.has(key));

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
        {/* Header */}
        <SheetHeader className="pb-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mt-0.5">
              <TypeIcon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">{title}</SheetTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
                <Badge variant="secondary" className="text-xs capitalize">{n.channel}</Badge>
                {n.is_read_by_me
                  ? <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">{t('read')}</span>
                  : <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />{t('new')}</span>
                }
              </div>
              <SheetDescription className="sr-only">{t('srDescription')}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Separator />

        {/* Contenido */}
        <div className="space-y-4 py-4">
          {content && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3.5">
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{content}</p>
            </div>
          )}

          {/* Info básica */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <span className="text-gray-500 dark:text-gray-400 block mb-1">{t('date')}</span>
              <span className="font-medium text-gray-900 dark:text-white block">
                {formatDateInTz(n.created_at, timezone, { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', locale })}
              </span>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <span className="text-gray-500 dark:text-gray-400 block mb-1">{t('recipient')}</span>
              <span className="font-medium text-gray-900 dark:text-white block">
                {n.recipient_user_id ? t('individual') : t('wholeOrganization')}
              </span>
            </div>
          </div>

          {/* Payload extra */}
          {extraPayload.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3.5">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">{t('payloadData')}</span>
              <div className="space-y-2">
                {extraPayload.map(([key, value]) => (
                  <div key={key} className="flex flex-wrap items-center justify-between text-xs gap-2">
                    <span className="text-gray-500 dark:text-gray-400">{etiquetaPayload(key)}</span>
                    <span className="font-medium text-gray-900 dark:text-white text-right">{formatVal(key, value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Datos reales de tablas relacionadas */}
          {loadingRelated && (
            <div className="py-4 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </div>
          )}

          {relatedData && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-blue-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{relatedData.label}</span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg divide-y divide-blue-100 dark:divide-blue-800">
                {relatedData.fields.map((field, idx) => {
                  const FieldIcon = field.icon;
                  return (
                    <div key={idx} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                      <FieldIcon className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[100px]">{field.label}</span>
                      <span className="text-xs font-medium text-gray-900 dark:text-white ml-auto text-right">{field.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loadingRelated && !relatedData && type && (
            <div className="text-center py-4">
              <span className="text-xs text-gray-400 dark:text-gray-500">{t('noRelated')}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <Separator />
        <SheetFooter className="pt-4 gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          {redirect && (
            <Button className="flex-1 gap-2" onClick={() => { onOpenChange(false); onNavigate(redirect.url); }}>
              <ExternalLink className="h-4 w-4" />
              {t(`actions.${redirect.accion}`)}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
