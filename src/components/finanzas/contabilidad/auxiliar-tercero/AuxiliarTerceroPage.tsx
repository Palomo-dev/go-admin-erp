'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Users, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReportesContablesService, FilaAuxiliarRpc } from '../ReportesContablesService';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { primerDiaDelAnioDe } from '@/lib/services/fiscalCalendar';
import { PageHeaderSkeleton, TableSkeleton } from '@/components/common/PageSkeletons';
import { BranchBadge } from '@/components/inventario/BranchBadge';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatNumeroMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { BotonesExportar } from '../NivelReporte';

function crearFormatoCifra(moneda: ContextoMoneda): (value: number) => string {
  return (value) => (Math.abs(value) < 0.01 ? '-' : formatNumeroMoneda(value, moneda));
}

export function AuxiliarTerceroPage() {
  const formatCifra = crearFormatoCifra(useMonedaOrganizacion());
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [filas, setFilas] = useState<FilaAuxiliarRpc[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const arrancado = useRef(false);

  const loadData = async (desde: string = startDate, hasta: string = endDate, filtro = cuenta) => {
    if (!desde || !hasta) return;
    try {
      setIsLoading(true);
      const data = await ReportesContablesService.getAuxiliarTercero(desde, hasta, filtro);
      setFilas(data.filas);
      setTruncado(data.truncado);
    } catch (error) {
      console.error('Error cargando auxiliar:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (tzLoading || arrancado.current) return;
    arrancado.current = true;
    const hoy = getToday();
    const inicio = primerDiaDelAnioDe(hoy);
    setStartDate(inicio);
    setEndDate(hoy);
    void loadData(inicio, hoy, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tzLoading, getToday]);

  const exportables = filas.map((fila) => [
    fila.tercero_nit || '—',
    fila.tercero_nombre || '',
    fila.account_code,
    fila.debit,
    fila.credit,
    fila.debit - fila.credit,
  ] as (string | number)[]);

  if (isLoading && filas.length === 0) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <TableSkeleton columns={5} rows={8} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Auxiliar por tercero</h1>
            <p className="text-gray-500 dark:text-gray-400">Débito y crédito por NIT y cuenta</p>
          </div>
        </div>
        <BotonesExportar
          nombre={`auxiliar-tercero-${startDate}-${endDate}`}
          titulo="Auxiliar por tercero"
          columnas={['NIT', 'Nombre', 'Cuenta', 'Debito', 'Credito', 'Saldo']}
          filas={exportables}
        />
      </div>
      <BranchBadge className="mb-3" />
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2">
              <Label>Fecha inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <div className="space-y-2">
              <Label>Fecha fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <div className="space-y-2">
              <Label>Cuenta</Label>
              <Input value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="Todas" className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <Button onClick={() => { void loadData(); }} className="bg-blue-600 hover:bg-blue-700">
              <Calendar className="h-4 w-4 mr-2" />
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Saldos</CardTitle>
          <CardDescription className="dark:text-gray-400">
            {filas.length} filas{truncado ? '. Hay más: filtra por cuenta.' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-700 text-gray-600 dark:text-gray-400">
                <th className="text-left py-2 px-3">Tercero</th>
                <th className="text-left py-2 px-3">Cuenta</th>
                <th className="text-right py-2 px-3">Débito</th>
                <th className="text-right py-2 px-3">Crédito</th>
                <th className="text-right py-2 px-3">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={`${fila.tercero_nit}|${fila.account_code}`} className="border-b dark:border-gray-700/50">
                  <td className="py-2 px-3 text-gray-900 dark:text-white">
                    <span className="font-mono text-xs mr-2">{fila.tercero_nit || '—'}</span>
                    {fila.tercero_nombre}
                  </td>
                  <td className="py-2 px-3 font-mono">{fila.account_code}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatCifra(fila.debit)}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatCifra(fila.credit)}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatCifra(fila.debit - fila.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
