'use client';

/**
 * Lista de partners en tarjetas: tier, tasa efectiva, deals y comisión
 * pendiente/pagada (registro, no dinero movido). Activo/inactivo con icono +
 * texto. La moneda de las cifras es la de las oportunidades de sus deals; si
 * mezclan monedas, no se suma: se dice.
 */

import { Award, BadgeCheck, CircleOff, Handshake, Mail, Pencil, Phone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StaggerItem, StaggerList } from '@/components/shared/motion/staggerList';
import { AnimatePresence } from 'motion/react';
import type { PartnerView } from '@/lib/services/crm/partnerService';
import { formatMoney, formatRate } from '@/lib/services/crm/partnerModel';
import { cn } from '@/utils/Utils';

interface Props {
  partners: PartnerView[];
  canManage: boolean;
  onEdit: (p: PartnerView) => void;
  onDeals: (p: PartnerView) => void;
  onDelete: (p: PartnerView) => void;
}

export function partnerButtonId(partnerId: string, action: 'edit' | 'deals' | 'delete'): string {
  return `partner-${partnerId}-${action}`;
}

export function PartnerList({ partners, canManage, onEdit, onDeals, onDelete }: Props) {
  return (
    <StaggerList as="ul" aria-label="Partners" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <AnimatePresence initial={false}>
        {partners.map((p) => (
          <StaggerItem key={p.id} as="li" layout className="list-none">
            <article aria-labelledby={`partner-${p.id}-name`} className={cn('flex h-full flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm dark:bg-gray-900', p.is_active ? 'border-gray-200 dark:border-gray-800' : 'border-dashed border-gray-300 dark:border-gray-700')}>
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 id={`partner-${p.id}-name`} className="truncate font-semibold text-gray-900 dark:text-gray-100">{p.name}</h3>
                  {p.company_name && <p className="truncate text-sm text-gray-600 dark:text-gray-400">{p.company_name}</p>}
                </div>
                <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', p.is_active ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')}>
                  {p.is_active ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleOff className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </header>

              <dl className="grid gap-1.5 text-sm text-gray-800 dark:text-gray-200">
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Tier y tasa</dt>
                  <Award className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                  <dd>
                    {p.tier ? <span className="font-medium">{p.tier.name}</span> : <span className="text-gray-600 dark:text-gray-400">Sin tier</span>}
                    <span className="text-gray-600 dark:text-gray-400"> · comisión {formatRate(p.effective_rate)}{Number(p.commission_rate) > 0 ? ' (propia)' : p.tier ? ' (del tier)' : ''}</span>
                  </dd>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-700 dark:text-gray-300">
                  <span className="inline-flex items-center gap-1.5"><Mail className="h-4 w-4 text-gray-500" aria-hidden="true" /><span className="sr-only">Correo:</span>{p.email}</span>
                  {p.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4 text-gray-500" aria-hidden="true" /><span className="sr-only">Teléfono:</span>{p.phone}</span>}
                </div>
                <div className="flex items-start gap-2">
                  <dt className="sr-only">Deals y comisiones</dt>
                  <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                  <dd>
                    {p.deals_count} deal{p.deals_count === 1 ? '' : 's'}
                    {p.commissions.count > 0 && (
                      <span className="block text-xs text-gray-600 dark:text-gray-400">
                        {p.currency_mixed
                          ? 'Comisiones en varias monedas: ver el detalle en Deals'
                          : `Comisión pendiente ${formatMoney(p.commissions.outstanding, p.commissions_currency)} · pagada ${formatMoney(p.commissions.paid, p.commissions_currency)}`}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              <footer className="mt-auto flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                <Button id={partnerButtonId(p.id, 'deals')} type="button" size="sm" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => onDeals(p)}>
                  <Handshake className="mr-1.5 h-4 w-4" aria-hidden="true" /> Deals
                </Button>
                {/* F12-misc: PATCH exige admin/manager; a un Empleado el botón solo le daría un 403. */}
                {canManage && (
                  <Button id={partnerButtonId(p.id, 'edit')} type="button" size="sm" variant="outline" onClick={() => onEdit(p)}>
                    <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" /> Editar
                  </Button>
                )}
                {canManage && (
                  <Button id={partnerButtonId(p.id, 'delete')} type="button" size="icon" variant="ghost" className="ml-auto text-red-700 hover:text-red-800 dark:text-red-300" aria-label={`Eliminar partner ${p.name}`} onClick={() => onDelete(p)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </footer>
            </article>
          </StaggerItem>
        ))}
      </AnimatePresence>
    </StaggerList>
  );
}
