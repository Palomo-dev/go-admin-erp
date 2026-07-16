'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Wallet, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency, parseLocalDate } from '@/utils/Utils';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { saldosAFavorService, SaldoAFavor } from './saldosAFavorService';
import { NuevoSaldoFavorDialog } from './NuevoSaldoFavorDialog';
import { AplicarSaldoFavorDialog } from './AplicarSaldoFavorDialog';

const statusMap: Record<string, { label: string; className: string }> = {
  active: { label: 'Activo', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  used: { label: 'Usado', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  expired: { label: 'Vencido', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
};

export function SaldosAFavorPage() {
  const [organizationId, setOrganizationId] = useState<number>(0);
  const [saldos, setSaldos] = useState<SaldoAFavor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogNuevoOpen, setDialogNuevoOpen] = useState(false);
  const [dialogAplicarOpen, setDialogAplicarOpen] = useState(false);
  const [saldoSel, setSaldoSel] = useState<SaldoAFavor | null>(null);

  const cargar = useCallback(async (orgId: number) => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const data = await saldosAFavorService.listar(orgId);
      setSaldos(data);
    } catch (error) {
      console.error('Error al cargar saldos a favor:', error);
      setSaldos([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(orgId);
    cargar(orgId);
  }, [cargar]);

  const totalDisponible = saldos
    .filter((s) => s.status === 'active')
    .reduce((acc, s) => acc + Number(s.balance), 0);

  const handleAplicar = (saldo: SaldoAFavor) => {
    setSaldoSel(saldo);
    setDialogAplicarOpen(true);
  };

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return '—';
    try {
      return format(parseLocalDate(fecha), 'dd MMM yyyy', { locale: es });
    } catch {
      return '—';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-500 dark:text-gray-400">Total disponible</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(totalDisponible)}
          </p>
        </CardContent>
      </Card>

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
              ) : saldos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No hay saldos a favor registrados.
                  </TableCell>
                </TableRow>
              ) : (
                saldos.map((s) => {
                  const st = statusMap[s.status] || { label: s.status, className: '' };
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
                        <Badge className={st.className}>{st.label}</Badge>
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
        onSuccess={() => cargar(organizationId)}
      />

      <AplicarSaldoFavorDialog
        open={dialogAplicarOpen}
        onOpenChange={setDialogAplicarOpen}
        organizationId={organizationId}
        saldo={saldoSel}
        onSuccess={() => cargar(organizationId)}
      />
    </div>
  );
}
