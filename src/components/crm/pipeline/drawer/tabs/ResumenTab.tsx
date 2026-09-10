'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Calendar, CircleDot, Clock, DollarSign, Mail, MapPin, Phone, SquarePen, Trophy, User, XCircle, Package, BedDouble, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/utils/Utils';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import { ScoringSection } from '@/components/crm/oportunidades/ScoringSection';
import { CustomerEditDialog } from '@/components/crm/shared/CustomerEditDialog';
import { FollowupSection } from '../FollowupSection';
import { SalesTeamTerritorySelectors } from '../SalesTeamTerritorySelectors';
import { DiscoverySection } from '../DiscoverySection';
import { DiscoveryConfigDialog } from '../DiscoveryConfigDialog';
import type { DrawerTabProps } from './types';

/**
 * Pestaña Resumen: seguimiento, info, equipo/territorio, scoring, discovery,
 * cliente (+ editar), pérdida/handoff y resumen de líneas (productos/espacios/
 * conceptos) con link al detalle. Conserva todo lo del drawer anterior.
 */
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A');

interface Line { id: string; label: string; qty: string; total: number }

export function ResumenTab({ opportunity, customer, data, active }: DrawerTabProps) {
  const [editCustomer, setEditCustomer] = useState(false);
  const [discoveryConfig, setDiscoveryConfig] = useState(false);
  const [lines, setLines] = useState<{ products: Line[]; spaces: Line[]; custom: Line[] } | null>(null);
  const currency = opportunity.currency || 'COP';

  const loadLines = useCallback(async () => {
    const [p, s, c] = await Promise.allSettled([
      opportunitiesService.getOpportunityProducts(opportunity.id),
      opportunitiesService.getOpportunitySpaces(opportunity.id),
      opportunitiesService.getOpportunityCustomLines(opportunity.id),
    ]);
    setLines({
      products: p.status === 'fulfilled' ? p.value.map((x) => ({ id: x.id, label: x.product?.name ?? 'Producto', qty: `x${x.quantity}`, total: x.total_price })) : [],
      spaces: s.status === 'fulfilled' ? (s.value as Array<{ id: string; nights: number; total_price: number; space?: { label?: string } }>).map((x) => ({ id: x.id, label: x.space?.label ?? 'Espacio', qty: `${x.nights} noche(s)`, total: x.total_price })) : [],
      custom: c.status === 'fulfilled' ? c.value.map((x) => ({ id: x.id, label: x.concept, qty: `x${x.quantity}`, total: x.total_price })) : [],
    });
  }, [opportunity.id]);

  useEffect(() => {
    if (active && lines === null) void loadLines();
  }, [active, lines, loadLines]);

  if (!active) return null;
  const isLost = opportunity.status === 'lost';
  const isWon = opportunity.status === 'won';
  const win = (opportunity.win_data ?? {}) as Record<string, string>;

  const LineBlock = ({ title, icon: Icon, items }: { title: string; icon: typeof Package; items: Line[] }) =>
    items.length === 0 ? null : (
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"><Icon className="h-4 w-4 text-blue-500" />{title} ({items.length})</h3>
        <div className="space-y-1.5">
          {items.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-sm">
              <span className="min-w-0 truncate text-gray-900 dark:text-gray-100">{l.label} <span className="text-xs text-gray-500">{l.qty}</span></span>
              <span className="font-medium text-blue-600 dark:text-blue-400 shrink-0">{formatCurrency(l.total, currency)}</span>
            </div>
          ))}
        </div>
      </section>
    );

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"><Clock className="h-4 w-4 text-blue-500" />Seguimiento</h3>
        <FollowupSection opportunityId={opportunity.id} initialData={opportunity} onUpdated={() => void data.refetch.opportunity()} />
      </section>
      <Separator />
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"><CircleDot className="h-4 w-4 text-blue-500" />Información</h3>
        <Card className="p-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500 dark:text-gray-400 text-xs block">Monto</span><span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 text-blue-500" />{formatCurrency(Number(opportunity.amount ?? 0), currency)}</span></div>
            <div><span className="text-gray-500 dark:text-gray-400 text-xs block">Cierre estimado</span><span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-blue-500" />{fmtDate(opportunity.expected_close_date)}</span></div>
            <div><span className="text-gray-500 dark:text-gray-400 text-xs block">Creada</span><span className="font-medium text-gray-900 dark:text-gray-100">{fmtDate(opportunity.created_at)}</span></div>
            <div><span className="text-gray-500 dark:text-gray-400 text-xs block">Moneda</span><span className="font-medium text-gray-900 dark:text-gray-100">{currency}</span></div>
          </div>
        </Card>
      </section>
      <Separator />
      <SalesTeamTerritorySelectors opportunityId={opportunity.id} initialTeamId={opportunity.sales_team_id} initialTerritoryId={opportunity.territory_id} initialSalespersonId={opportunity.salesperson_id} onUpdated={() => void data.refetch.opportunity()} />
      <Separator />
      <ScoringSection opportunityId={opportunity.id} />
      <Separator />
      <DiscoverySection opportunityId={opportunity.id} initialData={opportunity.discovery_data} onUpdated={() => void data.refetch.opportunity()} onConfigure={() => setDiscoveryConfig(true)} />
      <Separator />
      <section>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
          <User className="h-4 w-4 text-blue-500" />Cliente
          {customer && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs ml-auto" onClick={() => setEditCustomer(true)}><SquarePen className="h-3 w-3 mr-1" />Editar</Button>}
        </h3>
        {customer ? (
          <Card className="p-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 space-y-2 text-sm">
            <div className="flex items-center gap-2"><User className="h-4 w-4 text-gray-400 shrink-0" /><Link href={`/app/crm/clientes/${customer.id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">{customer.full_name}</Link></div>
            {customer.company_name && <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-gray-400 shrink-0" /><span className="text-gray-700 dark:text-gray-300">{customer.company_name}</span></div>}
            {customer.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400 shrink-0" /><span className="text-gray-700 dark:text-gray-300 truncate">{customer.email}</span></div>}
            {customer.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400 shrink-0" /><span className="text-gray-700 dark:text-gray-300">{customer.phone}</span></div>}
            {(customer.address || customer.city) && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400 shrink-0" /><span className="text-gray-700 dark:text-gray-300">{[customer.city, customer.address].filter(Boolean).join(', ')}</span></div>}
            {customer.identification_number && <div className="text-xs text-gray-600 dark:text-gray-400">{customer.identification_type ? `${customer.identification_type}: ` : 'ID: '}{customer.identification_number}</div>}
            {customer.customer_type && <Badge variant="secondary" className="text-xs">{customer.customer_type}</Badge>}
            {customer.notes && <p className="pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">{customer.notes}</p>}
          </Card>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay información detallada del cliente.</p>
        )}
      </section>
      {isLost && (
        <>
          <Separator />
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" />Razón de pérdida</h3>
            <Card className="p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-sm space-y-1.5">
              <div><span className="text-xs text-gray-500 block">Razón</span><span className="font-medium">{opportunity.loss_reason || opportunity.loss_reason_value || 'N/A'}</span></div>
              {opportunity.competitor_name && <div><span className="text-xs text-gray-500 block">Competidor</span>{opportunity.competitor_name}</div>}
              {opportunity.competitor_price != null && <div><span className="text-xs text-gray-500 block">Precio competidor</span>{formatCurrency(Number(opportunity.competitor_price), currency)}</div>}
              {opportunity.missing_features && opportunity.missing_features.length > 0 && <div><span className="text-xs text-gray-500 block">Funcionalidades faltantes</span><ul className="list-disc list-inside text-xs">{opportunity.missing_features.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
              {opportunity.recontact_at && <div><span className="text-xs text-gray-500 block">Recontactar</span>{fmtDate(opportunity.recontact_at)}</div>}
            </Card>
          </section>
        </>
      )}
      {isWon && Object.keys(win).length > 0 && (
        <>
          <Separator />
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"><Trophy className="h-4 w-4 text-green-500" />Ficha de handoff</h3>
            <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 grid grid-cols-2 gap-3 text-sm">
              {win.product && <div className="col-span-2"><span className="text-xs text-gray-500 block">Qué compró</span><span className="font-medium">{win.product}</span></div>}
              {win.modules && <div className="col-span-2"><span className="text-xs text-gray-500 block">Módulos</span>{win.modules}</div>}
              {win.users_count && <div><span className="text-xs text-gray-500 block">Usuarios</span>{win.users_count}</div>}
              {win.branches_count && <div><span className="text-xs text-gray-500 block">Sucursales</span>{win.branches_count}</div>}
              {win.responsible && <div className="col-span-2"><span className="text-xs text-gray-500 block">Responsable</span>{win.responsible}</div>}
            </Card>
          </section>
        </>
      )}
      {lines && (lines.products.length + lines.spaces.length + lines.custom.length > 0) && (
        <>
          <Separator />
          <LineBlock title="Productos" icon={Package} items={lines.products} />
          <LineBlock title="Espacios" icon={BedDouble} items={lines.spaces} />
          <LineBlock title="Conceptos" icon={FileText} items={lines.custom} />
          <Link href={`/app/crm/oportunidades/${opportunity.id}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Gestionar líneas en el detalle →</Link>
        </>
      )}

      {opportunity.customer_id && <CustomerEditDialog customerId={opportunity.customer_id} open={editCustomer} onOpenChange={setEditCustomer} onSaved={() => void data.refetch.customer()} editMode />}
      <DiscoveryConfigDialog open={discoveryConfig} onOpenChange={setDiscoveryConfig} onSaved={() => void data.refetch.opportunity()} />
    </div>
  );
}
