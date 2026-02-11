'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  Bell, ExternalLink, Loader2, User, DollarSign, Hotel, Package,
  ClipboardList, CreditCard, UserPlus, Calendar, AlertTriangle,
  MapPin, Hash, Clock, TrendingDown, Building2, Mail,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';

// ── Tipos ──────────────────────────────────────────────
interface NotificationForSheet {
  id: string;
  organization_id: number;
  recipient_user_id?: string | null;
  channel: string;
  payload: Record<string, any>;
  status: string;
  read_at: string | null;
  created_at: string;
}

interface NotificationDetailSheetProps {
  notification: NotificationForSheet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (url: string) => void;
}

// ── Helpers de tipo ────────────────────────────────────
function getTypeIcon(type: string) {
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

const typeLabels: Record<string, string> = {
  purchase_invoice_created: 'Factura compra', payment_registered: 'Pago', ar_overdue: 'CxC vencida', ap_overdue: 'CxP vencida',
  reservation_created: 'Reserva', checkin: 'Check-in', checkout: 'Check-out', reservation_cancelled: 'Reserva cancelada', no_show: 'No-show', housekeeping_assigned: 'Limpieza',
  opportunity_stage_change: 'Oportunidad', opportunity_won: 'Oportunidad ganada', opportunity_lost: 'Oportunidad perdida', task_assigned: 'Tarea', task_completed: 'Tarea completada',
  stock_low: 'Stock bajo', stock_out: 'Sin stock', stock_low_periodic: 'Stock bajo', transfer_created: 'Transferencia', transfer_approved: 'Transferencia', transfer_rejected: 'Transferencia',
  cash_opened: 'Caja abierta', cash_closed: 'Caja cerrada', payroll_approved: 'Nómina', payroll_paid: 'Nómina pagada', shift_assigned: 'Turno',
  calendar_event_assigned: 'Evento', calendar_event_cancelled: 'Evento cancelado',
  subscription_cancelled: 'Suscripción', trial_ended: 'Trial', trial_expiring: 'Trial por vencer', payment_failed: 'Pago fallido', ai_credits_low: 'Créditos IA',
  new_member: 'Nuevo miembro', role_changed: 'Cambio de rol',
};

function getRedirect(notif: NotificationForSheet): { url: string; label: string } | null {
  const type = notif.payload?.type || '';
  const p = notif.payload || {};
  switch (type) {
    case 'ar_overdue':
      return p.ar_id ? { url: `/app/finanzas/cuentas-por-cobrar/${p.ar_id}`, label: 'Ver cuenta por cobrar' } : { url: '/app/finanzas/cuentas-por-cobrar', label: 'Ver CxC' };
    case 'ap_overdue':
      return p.ap_id ? { url: `/app/finanzas/cuentas-por-pagar/${p.ap_id}`, label: 'Ver cuenta por pagar' } : { url: '/app/finanzas/cuentas-por-pagar', label: 'Ver CxP' };
    case 'purchase_invoice_created':
      return p.invoice_id ? { url: `/app/finanzas/facturas-compra/${p.invoice_id}`, label: 'Ver factura' } : { url: '/app/finanzas/facturas-compra', label: 'Ver facturas' };
    case 'payment_registered':
      return { url: '/app/finanzas', label: 'Ver finanzas' };
    case 'reservation_created': case 'checkin': case 'checkout': case 'reservation_cancelled': case 'no_show':
      return p.reservation_id ? { url: `/app/pms/reservas/${p.reservation_id}`, label: 'Ver reserva' } : { url: '/app/pms/reservas', label: 'Ver reservas' };
    case 'housekeeping_assigned':
      return { url: '/app/pms/housekeeping', label: 'Ver housekeeping' };
    case 'opportunity_stage_change': case 'opportunity_won': case 'opportunity_lost':
      return p.opportunity_id ? { url: `/app/crm/oportunidades/${p.opportunity_id}`, label: 'Ver oportunidad' } : { url: '/app/crm/oportunidades', label: 'Ver oportunidades' };
    case 'task_assigned': case 'task_completed':
      return p.task_id ? { url: `/app/crm/tareas?taskId=${p.task_id}`, label: 'Ver tarea' } : { url: '/app/crm/tareas', label: 'Ver tareas' };
    case 'stock_low': case 'stock_out': case 'stock_low_periodic':
      return p.product_id ? { url: `/app/inventario/productos/${p.product_id}`, label: 'Ver producto' } : { url: '/app/inventario/stock', label: 'Ver stock' };
    case 'transfer_created': case 'transfer_approved': case 'transfer_rejected':
      return p.transfer_id ? { url: `/app/inventario/transferencias/${p.transfer_id}`, label: 'Ver transferencia' } : { url: '/app/inventario/transferencias', label: 'Ver transferencias' };
    case 'cash_opened': case 'cash_closed':
      return { url: '/app/pos', label: 'Ver POS' };
    case 'payroll_approved': case 'payroll_paid':
      return { url: '/app/hrm', label: 'Ver nómina' };
    case 'shift_assigned':
      return { url: '/app/hrm', label: 'Ver turnos' };
    case 'calendar_event_assigned': case 'calendar_event_cancelled':
      return { url: '/app/calendario', label: 'Ver calendario' };
    case 'subscription_cancelled': case 'trial_ended': case 'trial_expiring': case 'payment_failed':
    case 'ai_credits_low': case 'new_member': case 'role_changed':
      return { url: '/app/organizacion', label: 'Ver organización' };
    default:
      return null;
  }
}

// ── Fetch de datos relacionados desde tablas específicas ──
interface RelatedData {
  label: string;
  fields: { icon: typeof Bell; label: string; value: string }[];
}

async function fetchRelatedData(notif: NotificationForSheet): Promise<RelatedData | null> {
  const type = notif.payload?.type || '';
  const p = notif.payload || {};

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
        let cust: any = null;
        if (ar.customer_id) {
          const { data: c } = await supabase
            .from('customers')
            .select('first_name, last_name, email, phone')
            .eq('id', ar.customer_id)
            .maybeSingle();
          cust = c;
        }
        return {
          label: 'Cuenta por Cobrar',
          fields: [
            { icon: User, label: 'Cliente', value: cust ? `${cust.first_name || ''} ${cust.last_name || ''}`.trim() : '—' },
            { icon: Mail, label: 'Email', value: cust?.email || '—' },
            { icon: DollarSign, label: 'Monto original', value: `$${Number(ar.amount).toLocaleString('es')}` },
            { icon: TrendingDown, label: 'Saldo pendiente', value: `$${Number(ar.balance).toLocaleString('es')}` },
            { icon: Calendar, label: 'Fecha vencimiento', value: ar.due_date ? new Date(ar.due_date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
            { icon: Clock, label: 'Días vencida', value: `${ar.days_overdue ?? 0} días` },
            { icon: Hash, label: 'Estado', value: ar.status || '—' },
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
        let sup: any = null;
        if (ap.supplier_id) {
          const { data: s } = await supabase
            .from('suppliers')
            .select('name, email, phone')
            .eq('id', ap.supplier_id)
            .maybeSingle();
          sup = s;
        }
        return {
          label: 'Cuenta por Pagar',
          fields: [
            { icon: Building2, label: 'Proveedor', value: sup?.name || '—' },
            { icon: Mail, label: 'Email', value: sup?.email || '—' },
            { icon: DollarSign, label: 'Monto original', value: `$${Number(ap.amount).toLocaleString('es')}` },
            { icon: TrendingDown, label: 'Saldo pendiente', value: `$${Number(ap.balance).toLocaleString('es')}` },
            { icon: Calendar, label: 'Fecha vencimiento', value: ap.due_date ? new Date(ap.due_date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
            { icon: Clock, label: 'Días vencida', value: `${ap.days_overdue ?? 0} días` },
            { icon: Hash, label: 'Estado', value: ap.status || '—' },
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
        let prod: any = null;
        const { data: pr } = await supabase
          .from('products')
          .select('name, sku, description')
          .eq('id', p.product_id)
          .maybeSingle();
        prod = pr;

        return {
          label: 'Producto — Stock',
          fields: [
            { icon: Package, label: 'Producto', value: prod?.name || p.product_name || '—' },
            { icon: Hash, label: 'SKU', value: prod?.sku || '—' },
            { icon: TrendingDown, label: 'Stock actual', value: `${Number(sl.qty_on_hand).toLocaleString('es')} uds` },
            { icon: AlertTriangle, label: 'Mínimo requerido', value: `${sl.min_level ?? 0} uds` },
            { icon: Package, label: 'Reservado', value: `${Number(sl.qty_reserved ?? 0).toLocaleString('es')} uds` },
            { icon: DollarSign, label: 'Costo promedio', value: sl.avg_cost ? `$${Number(sl.avg_cost).toLocaleString('es')}` : '—' },
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
        let cust: any = null;
        if (res.customer_id) {
          const { data: c } = await supabase
            .from('customers')
            .select('first_name, last_name, email, phone')
            .eq('id', res.customer_id)
            .maybeSingle();
          cust = c;
        }
        return {
          label: 'Reservación',
          fields: [
            { icon: User, label: 'Huésped', value: cust ? `${cust.first_name || ''} ${cust.last_name || ''}`.trim() : '—' },
            { icon: Mail, label: 'Email', value: cust?.email || '—' },
            { icon: Calendar, label: 'Check-in', value: res.checkin ? new Date(res.checkin).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
            { icon: Calendar, label: 'Check-out', value: res.checkout ? new Date(res.checkout).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
            { icon: DollarSign, label: 'Total estimado', value: res.total_estimated ? `$${Number(res.total_estimated).toLocaleString('es')}` : '—' },
            { icon: UserPlus, label: 'Ocupantes', value: `${res.occupant_count ?? 1}` },
            { icon: Hash, label: 'Estado', value: res.status || '—' },
          ],
        };
      }
    }

    // Factura de compra
    if (type === 'purchase_invoice_created' && p.invoice_id) {
      const { data: inv, error: invErr } = await supabase
        .from('invoice_purchase')
        .select('id, invoice_number, total, status, due_date, supplier_id')
        .eq('id', p.invoice_id)
        .maybeSingle();

      if (invErr) console.error('[NotifSheet] invoice query error:', invErr.message);
      if (inv) {
        let sup: any = null;
        if (inv.supplier_id) {
          const { data: s } = await supabase
            .from('suppliers')
            .select('name')
            .eq('id', inv.supplier_id)
            .maybeSingle();
          sup = s;
        }
        return {
          label: 'Factura de Compra',
          fields: [
            { icon: Hash, label: 'Número', value: inv.invoice_number || inv.id.substring(0, 8) },
            { icon: Building2, label: 'Proveedor', value: sup?.name || '—' },
            { icon: DollarSign, label: 'Total', value: inv.total ? `$${Number(inv.total).toLocaleString('es')}` : '—' },
            { icon: Calendar, label: 'Vencimiento', value: inv.due_date ? new Date(inv.due_date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
            { icon: Hash, label: 'Estado', value: inv.status || '—' },
          ],
        };
      }
    }

  } catch (err) {
    console.error('[NotifSheet] Error fetching related data:', err);
  }

  return null;
}

// ── Componente principal ──────────────────────────────
export function NotificationDetailSheet({ notification, open, onOpenChange, onNavigate }: NotificationDetailSheetProps) {
  const [relatedData, setRelatedData] = useState<RelatedData | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    if (notification && open) {
      setLoadingRelated(true);
      setRelatedData(null);
      fetchRelatedData(notification).then(data => {
        setRelatedData(data);
        setLoadingRelated(false);
      });
    }
  }, [notification?.id, open]);

  if (!notification) return null;

  const n = notification;
  const type = n.payload?.type || '';
  const title = n.payload?.title || type || 'Notificación';
  const content = n.payload?.content || '';
  const TypeIcon = getTypeIcon(type);
  const typeLabel = typeLabels[type] || 'Notificación';
  const redirect = getRedirect(n);

  // Payload extra (excluir keys ya mostradas)
  const hiddenKeys = new Set(['type', 'title', 'content', 'ar_id', 'ap_id', 'invoice_id', 'reservation_id', 'product_id', 'transfer_id', 'task_id', 'opportunity_id', 'event_id']);
  const extraPayload = Object.entries(n.payload || {}).filter(([key]) => !hiddenKeys.has(key));

  const formatVal = (key: string, value: unknown): string => {
    const str = String(value);
    if (key === 'balance' || key === 'amount' || key === 'difference') {
      const num = parseFloat(str);
      return isNaN(num) ? str : `$${num.toLocaleString('es')}`;
    }
    if (key === 'due_date' && str.length > 8) {
      try { return new Date(str).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return str; }
    }
    return str;
  };

  const payloadKeyLabels: Record<string, string> = {
    balance: 'Saldo', due_date: 'Vencimiento', qty: 'Cantidad', min: 'Mínimo',
    product_name: 'Producto', amount: 'Monto', difference: 'Diferencia',
    new_role_id: 'Nuevo rol', priority: 'Prioridad', event_type: 'Tipo evento',
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800">
        {/* Header */}
        <SheetHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mt-0.5">
              <TypeIcon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">{title}</SheetTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
                <Badge variant="secondary" className="text-xs capitalize">{n.channel}</Badge>
                {n.read_at
                  ? <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Leída</span>
                  : <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />Nueva</span>
                }
              </div>
              <SheetDescription className="sr-only">Detalle de notificación</SheetDescription>
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
              <span className="text-gray-500 dark:text-gray-400 block mb-1">Fecha</span>
              <span className="font-medium text-gray-900 dark:text-white block">
                {new Date(n.created_at).toLocaleString('es', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <span className="text-gray-500 dark:text-gray-400 block mb-1">Destinatario</span>
              <span className="font-medium text-gray-900 dark:text-white block">
                {n.recipient_user_id ? 'Individual' : 'Toda la organización'}
              </span>
            </div>
          </div>

          {/* Payload extra */}
          {extraPayload.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3.5">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Datos de la notificación</span>
              <div className="space-y-2">
                {extraPayload.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs gap-2">
                    <span className="text-gray-500 dark:text-gray-400">{payloadKeyLabels[key] || key.replace(/_/g, ' ')}</span>
                    <span className="font-medium text-gray-900 dark:text-white text-right">{formatVal(key, value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Datos reales de tablas relacionadas */}
          {loadingRelated && (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Cargando información del recurso...</span>
            </div>
          )}

          {relatedData && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-blue-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{relatedData.label}</span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg divide-y divide-blue-100 dark:divide-blue-800">
                {relatedData.fields.map((field, idx) => {
                  const FieldIcon = field.icon;
                  return (
                    <div key={idx} className="flex items-center gap-3 px-3.5 py-2.5">
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
              <span className="text-xs text-gray-400 dark:text-gray-500">No hay datos adicionales del recurso</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <Separator />
        <SheetFooter className="pt-4 gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {redirect && (
            <Button className="flex-1 gap-2" onClick={() => { onOpenChange(false); onNavigate(redirect.url); }}>
              <ExternalLink className="h-4 w-4" />
              {redirect.label}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
