'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Receipt, Send, Clock, Split, DollarSign, UserCircle, AlertTriangle, LogOut } from 'lucide-react';
import { BotonImporte, FilaDato, ListaDatos, Tarjeta } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { CustomerSelector, type OccupiedSpace } from '@/components/pos/CustomerSelector';
import type { Customer } from '@/components/pos/types';
import type { BillSplit } from '@/components/pos/mesas/id/SplitBillDialog';
import { MesaTaxBreakdown } from './MesaTaxBreakdown';
import type { MesaTaxItem } from '@/hooks/useMesaTaxes';

interface MesaActionsSidebarProps {
  selectedCustomer?: Customer;
  selectedRoom?: OccupiedSpace;
  onCustomerSelect: (customer?: Customer, room?: OccupiedSpace) => void;

  subtotal: number;
  taxes: number;
  total: number;

  itemsCount: number;
  sessionStatus?: string;
  customers: number;

  billSplits: BillSplit[] | null;
  unassignedItemsCount: number;
  unassignedItemsTotal: number;

  taxItems: MesaTaxItem[];
  onTaxTotalsChange?: (totals: { subtotal: number; taxTotal: number; total: number; taxIncluded: boolean }) => void;

  onEnviarComanda: () => Promise<void>;
  onGenerarPreCuenta: () => Promise<void>;
  onSolicitarCuenta: () => void;
  onOpenSplitBill: () => void;
  onCancelSplit: () => void;
  onCheckout: () => void;
  onLiberarMesa: () => void;
  cashSessionActive?: boolean;
}

export function MesaActionsSidebar({
  selectedCustomer,
  selectedRoom,
  onCustomerSelect,
  subtotal,
  total,
  itemsCount,
  sessionStatus,
  customers,
  billSplits,
  unassignedItemsCount,
  unassignedItemsTotal,
  taxItems,
  onTaxTotalsChange,
  onEnviarComanda,
  onGenerarPreCuenta,
  onSolicitarCuenta,
  onOpenSplitBill,
  onCancelSplit,
  onCheckout,
  onLiberarMesa,
  cashSessionActive = true,
}: MesaActionsSidebarProps) {
  const t = useTranslations('posMesas.cuenta');
  const { formatear } = useMonedaOrganizacion();

  // El aviso (éxito o error) lo da la página con un toast: aquí solo se evita
  // la promesa rechazada sin manejar. Antes había además un chip flotante de 4 s.
  const handleEnviarComandaClick = () => {
    onEnviarComanda().catch(() => undefined);
  };

  const handleGenerarPreCuentaClick = () => {
    onGenerarPreCuenta().catch(() => undefined);
  };

  const partes = billSplits?.filter((s) => s.total > 0) ?? [];
  const bloqueadoPorDivision = !!billSplits && unassignedItemsCount > 0;

  return (
    <div className="lg:col-span-1 space-y-4">
      {/* Cliente */}
      <Tarjeta titulo={t('cliente')} icono={UserCircle}>
        <CustomerSelector
          onCustomerSelect={onCustomerSelect}
          selectedCustomer={selectedCustomer}
          selectedRoom={selectedRoom}
        />
      </Tarjeta>

      {/* Resumen de cuenta */}
      <Tarjeta titulo={t('resumen')} icono={Receipt} className="lg:sticky lg:top-24">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-fg-secondary">{t('subtotal')}</span>
              <span className="font-medium text-fg tabular-nums">{formatear(subtotal)}</span>
            </div>
            <MesaTaxBreakdown
              items={taxItems}
              onTotalsChange={onTaxTotalsChange}
            />
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span className="text-fg">{t('total')}</span>
              <span className="text-brand-deep tabular-nums">{formatear(total)}</span>
            </div>
          </div>

          <Separator />

          {/* Acciones */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleEnviarComandaClick}
              disabled={!itemsCount}
            >
              <Send aria-hidden="true" className="h-4 w-4 mr-2" />
              {t('enviarCocina')}
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleGenerarPreCuentaClick}
              disabled={!itemsCount}
            >
              <Receipt aria-hidden="true" className="h-4 w-4 mr-2" />
              {t('verPreCuenta')}
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onSolicitarCuenta}
              disabled={sessionStatus === 'bill_requested' || !itemsCount}
            >
              <Clock aria-hidden="true" className="h-4 w-4 mr-2" />
              {t('solicitarCuenta')}
            </Button>

            <Separator />

            {/* Dividir cuenta */}
            {!billSplits ? (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={onOpenSplitBill}
                disabled={!itemsCount || customers < 2}
              >
                <Split aria-hidden="true" className="h-4 w-4 mr-2" />
                {t('dividir', { n: customers })}
              </Button>
            ) : (
              <div className="space-y-2">
                <Tarjeta
                  titulo={t('divididaEn', { n: partes.length })}
                  icono={Split}
                  accion={
                    <Button size="sm" variant="ghost" onClick={onCancelSplit} className="h-7 text-xs">
                      {t('cancelarDivision')}
                    </Button>
                  }
                >
                  <ListaDatos>
                    {partes.map((split) => (
                      <FilaDato key={split.id} etiqueta={split.name} valor={formatear(split.total)} />
                    ))}
                  </ListaDatos>
                </Tarjeta>

                {/* Productos agregados después de dividir */}
                {unassignedItemsCount > 0 && (
                  <Tarjeta
                    tono="advertencia"
                    icono={AlertTriangle}
                    titulo={t('sinAsignar', { n: unassignedItemsCount })}
                    descripcion={t('sinAsignarDescripcion', { total: formatear(unassignedItemsTotal) })}
                  />
                )}

                <Button
                  variant={unassignedItemsCount > 0 ? 'default' : 'outline'}
                  size="sm"
                  onClick={onOpenSplitBill}
                  className="w-full text-xs"
                >
                  {unassignedItemsCount > 0 ? t('dividirDeNuevo') : t('modificarDivision')}
                </Button>
              </div>
            )}

            <Separator />

            {/* Cobrar: sin caja queda deshabilitado con el motivo (como antes); el
                estado `sinCaja` del kit abre la caja y esta pantalla no tiene ese flujo. */}
            <BotonImporte
              etiqueta={
                billSplits
                  ? unassignedItemsCount > 0
                    ? t('cobrar.divideDeNuevo')
                    : t('cobrar.pagosDivididos')
                  : t('cobrar.procesar')
              }
              importe={formatear(total)}
              icono={DollarSign}
              anchoCompleto
              tamano="lg"
              estado={!cashSessionActive || !itemsCount || bloqueadoPorDivision ? 'deshabilitado' : 'listo'}
              motivo={!cashSessionActive ? t('cobrar.sinCaja') : undefined}
              onClick={onCheckout}
            />

            <Separator />

            {/* Liberar mesa */}
            <Button
              variant="outline"
              className="w-full justify-start border-line-warning text-warning-text hover:bg-warning-subtle"
              onClick={onLiberarMesa}
            >
              <LogOut aria-hidden="true" className="h-4 w-4 mr-2" />
              {t('liberarMesa')}
            </Button>
          </div>
        </div>
      </Tarjeta>
    </div>
  );
}
