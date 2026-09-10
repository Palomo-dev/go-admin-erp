'use client';

import { Building2, Calendar, CheckCircle, Clock, Edit, IdCard, Mail, MapPin, Phone, Tag, Target, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/Utils';
import type { OpportunityFull } from '@/components/crm/pipeline/hooks/useOpportunityData';
import type { CustomerDetails } from '../types';

/** Sidebar del detalle: valor total, info clave, comisión, cliente y razón de pérdida (sin cambios funcionales). */
export interface DetailSidebarProps {
  opportunity: OpportunityFull;
  customer: CustomerDetails | null;
  totals: { products: number; spaces: number; custom: number; items: number };
  displayAmount: number;
  onEditCustomer: () => void;
}

export function DetailSidebar({ opportunity, customer, totals, displayAmount, onEditCustomer }: DetailSidebarProps) {
  const lineTotal = totals.products + totals.spaces + totals.custom;
  const cust = opportunity.customer;
  return (
    <div className="space-y-5">
      <Card className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 border-0 text-white">
        <CardContent className="pt-6">
          <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Valor total</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(displayAmount)}</p>
          {totals.items > 0 && <p className="text-blue-200 text-xs mt-2">{totals.items} {totals.items === 1 ? 'item' : 'items'} cotizados</p>}
          {lineTotal > 0 && (
            <div className="mt-4 space-y-1.5 text-xs text-blue-100">
              {totals.products > 0 && <div className="flex justify-between"><span>Productos</span><span>{formatCurrency(totals.products)}</span></div>}
              {totals.spaces > 0 && <div className="flex justify-between"><span>Espacios</span><span>{formatCurrency(totals.spaces)}</span></div>}
              {totals.custom > 0 && <div className="flex justify-between"><span>Conceptos</span><span>{formatCurrency(totals.custom)}</span></div>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-5 space-y-4">
          <Row icon={<Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />} bg="bg-purple-100 dark:bg-purple-900/30" label="Probabilidad" value={opportunity.stage?.probability ? `${Math.round(Number(opportunity.stage.probability))}%` : '-'} />
          <Row icon={<Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />} bg="bg-blue-100 dark:bg-blue-900/30" label="Cierre estimado" value={opportunity.expected_close_date ? format(new Date(opportunity.expected_close_date), 'dd/MM/yyyy', { locale: es }) : '-'} />
          <Row icon={<Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />} bg="bg-gray-100 dark:bg-gray-700" label="Creada" value={format(new Date(opportunity.created_at), 'dd/MM/yyyy', { locale: es })} />
        </CardContent>
      </Card>

      {opportunity.commission_type && opportunity.commission_type !== 'none' && opportunity.commission_rate != null && opportunity.commission_rate > 0 && (
        <Card className="bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><User className="h-4 w-4 text-blue-600 dark:text-blue-400" /></div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Comisión {opportunity.commission_type === 'salesperson' ? 'de Vendedor' : 'de Intermediación'}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Tasa</span><span className="font-semibold text-gray-900 dark:text-white">{opportunity.commission_rate}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Monto</span><span className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrency((displayAmount * (opportunity.commission_rate || 0)) / 100)}</span></div>
              {opportunity.status === 'won' && <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 pt-1"><CheckCircle className="h-3 w-3" />Comisión generada</p>}
              {opportunity.status === 'open' && <p className="text-xs text-blue-600 dark:text-blue-500 pt-1">Se generará al marcar como ganada</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <User className="h-4 w-4 text-blue-500" />Cliente
            {opportunity.customer_id && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs ml-auto" onClick={onEditCustomer}><Edit className="h-3 w-3 mr-1" />Editar</Button>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cust ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">{cust.full_name?.charAt(0)?.toUpperCase() || '?'}</div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{cust.full_name}</p>
                  {customer?.customer_type && <Badge variant="secondary" className="text-xs mt-0.5">{customer.customer_type === 'company' ? 'Empresa' : 'Persona'}</Badge>}
                </div>
              </div>
              {cust.email && <Line icon={<Mail className="h-3.5 w-3.5 shrink-0" />}>{cust.email}</Line>}
              {cust.phone && <Line icon={<Phone className="h-3.5 w-3.5 shrink-0" />}>{cust.phone}</Line>}
              {customer?.identification_number && <Line icon={<IdCard className="h-3.5 w-3.5 shrink-0" />}>{customer.identification_type || 'Doc'}: {customer.identification_number}</Line>}
              {customer?.address && <Line icon={<MapPin className="h-3.5 w-3.5 shrink-0" />}>{customer.address}</Line>}
              {customer?.city && <Line icon={<Building2 className="h-3.5 w-3.5 shrink-0" />}>{customer.city}</Line>}
              {customer?.company_name && <Line icon={<Building2 className="h-3.5 w-3.5 shrink-0" />}>{customer.company_name}</Line>}
              {customer?.tags && customer.tags.length > 0 && (
                <div className="flex items-start gap-1.5 flex-wrap pt-1"><Tag className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />{customer.tags.slice(0, 4).map((t, i) => <Badge key={i} variant="outline" className="text-xs">{t}</Badge>)}</div>
              )}
            </div>
          ) : <p className="text-sm text-gray-500 dark:text-gray-400">Sin cliente asignado</p>}
        </CardContent>
      </Card>

      {opportunity.loss_reason && (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Razón de pérdida</p>
            <p className="text-sm text-red-700 dark:text-red-300">{opportunity.loss_reason}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5"><div className={`p-2 rounded-lg ${bg}`}>{icon}</div><span className="text-sm text-gray-600 dark:text-gray-400">{label}</span></div>
      <span className="font-medium text-sm text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">{icon}<span className="truncate">{children}</span></div>;
}
