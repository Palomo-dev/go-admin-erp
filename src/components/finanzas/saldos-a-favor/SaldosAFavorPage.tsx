'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { EmptyState, StatCard, StatusBadge } from '@/components/kit';
import { Plus, Wallet, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { saldosAFavorService, SaldoAFavor, ErrorPeticionSaldoFavor } from './saldosAFavorService';
import { NuevoSaldoFavorDialog } from './NuevoSaldoFavorDialog';
import { AplicarSaldoFavorDialog } from './AplicarSaldoFavorDialog';
import { BranchBadge } from '@/components/inventario/BranchBadge';
import { useBranch } from '@/lib/context/BranchContext';

/** Estado del saldo → estado de la tabla única del kit (`expired` no está; «vencido» sí) y su texto. */
const statusMap: Record<string, { estado: string; label: string }> = {
  active: { estado: 'active', label: 'Activo' },
  used: { estado: 'used', label: 'Usado' },
  expired: { estado: 'vencido', label: 'Vencido' },
};

export function SaldosAFavorPage() {
  const [organizationId, setOrganizationId] = useState<number>(0);
  const { branchFilter } = useBranch();
  const t = useTranslations('saldosAFavor');
  // expiry_date es timestamptz: se muestra en la zona de la organización.
  const { formatDate } = useFormatDate();
  // Los saldos a favor no traen moneda propia: se muestran en la moneda base de la organización.
  const { formatear: formatCurrency } = useMonedaOrganizacion();
  const [saldos, setSaldos] = useState<SaldoAFavor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // El error de carga se muestra: una tabla vacía no debe parecer "sin saldos".
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [dialogNuevoOpen, setDialogNuevoOpen] = useState(false);
  const [dialogAplicarOpen, setDialogAplicarOpen] = useState(false);
  const [saldoSel, setSaldoSel] = useState<SaldoAFavor | null>(null);

  const cargar = useCallback(async (orgId: number, branchId?: number | null) => {
    if (!orgId) return;
    setIsLoading(true);
    setErrorCarga(null);
    try {
      const data = await saldosAFavorService.listar(branchId);
      setSaldos(data);
    } catch (error) {
      setSaldos([]);
      const codigo = error instanceof ErrorPeticionSaldoFavor ? error.codigo : 'error_desconocido';
      setErrorCarga(t.has(`errores.${codigo}`) && codigo !== 'error_desconocido' ? t(`errores.${codigo}`) : t('errorCarga'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(orgId);
    cargar(orgId, branchFilter);
  }, [cargar, branchFilter]);

  const totalDisponible = saldos
    .filter((s) => s.status === 'active')
    .reduce((acc, s) => acc + Number(s.balance), 0);

  const handleAplicar = (saldo: SaldoAFavor) => {
    setSaldoSel(saldo);
    setDialogAplicarOpen(true);
  };

  const formatFecha = (fecha: string | null) => (fecha ? formatDate(fecha) || '—' : '—');

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Wallet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Saldos a favor
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Anticipos y créditos de clientes aplicables a facturas.
          </p>
        </div>
        <Button onClick={() => setDialogNuevoOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo saldo
        </Button>
      </div>

      <BranchBadge className="mb-3" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard etiqueta="Total disponible" icono={Wallet} cargando={isLoading} valor={formatCurrency(totalDisponible)} tono={totalDisponible > 0 ? 'exito' : 'neutro'} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Usado</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  </TableCell>
                </TableRow>
              ) : errorCarga ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      compacto
                      variante="error"
                      titulo={errorCarga}
                      accion={{ etiqueta: t('reintentar'), onClick: () => cargar(organizationId, branchFilter) }}
                    />
                  </TableCell>
                </TableRow>
              ) : saldos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState compacto variante="empty" icono={Wallet} titulo="No hay saldos a favor registrados." />
                  </TableCell>
                </TableRow>
              ) : (
                saldos.map((s) => {
                  const st =
                    s.status === 'cancelled'
                      ? { estado: 'cancelled', label: t('estadoAnulado') }
                      : statusMap[s.status] || { estado: s.status, label: s.status };
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.customer_name || 'N/A'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(s.amount))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(s.used))}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(Number(s.balance))}
                      </TableCell>
                      <TableCell>{formatFecha(s.expiry_date)}</TableCell>
                      <TableCell>
                        <StatusBadge estado={st.estado} etiqueta={st.label} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={s.status !== 'active' || Number(s.balance) <= 0}
                          onClick={() => handleAplicar(s)}
                        >
                          Aplicar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NuevoSaldoFavorDialog
        open={dialogNuevoOpen}
        onOpenChange={setDialogNuevoOpen}
        organizationId={organizationId}
        onSuccess={() => cargar(organizationId, branchFilter)}
      />

      <AplicarSaldoFavorDialog
        open={dialogAplicarOpen}
        onOpenChange={setDialogAplicarOpen}
        organizationId={organizationId}
        saldo={saldoSel}
        onSuccess={() => cargar(organizationId, branchFilter)}
      />
    </div>
  );
}
