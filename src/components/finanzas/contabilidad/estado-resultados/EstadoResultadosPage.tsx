'use client';

import React, { useState, useEffect, useRef } from 'react';
import {TrendingUp, TrendingDown, Calendar} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReportesContablesService, IncomeStatementRow } from '../ReportesContablesService';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { primerDiaDelAnioDe } from '@/lib/services/fiscalCalendar';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { EmptyState } from '@/components/kit';
import { BranchBadge } from '@/components/inventario/BranchBadge';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatNumeroMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { importesPropios, type NivelPuc } from '@/lib/finanzas/reportes/nivelesPuc';
import { COMPARATIVO_POR_DEFECTO, TITULO_RESULTADO_INTEGRAL, gastosPorFuncion, importesPorCodigo, rangoComparativo, resultadoIntegral } from '@/lib/finanzas/reportes/estadosNiif';
import { BotonesExportar, FilasNivel, SelectorNivel, filasEnNivel } from '../NivelReporte';

// Cifra contable en la moneda base de la organizacion (los reportes contables
// se llevan en moneda base): sin simbolo, con los decimales y el formato de esa
// moneda; '-' cuando es cero.
function crearFormatoCifra(moneda: ContextoMoneda): (value: number) => string {
  return (value) => (Math.abs(value) < 0.01 ? '-' : formatNumeroMoneda(value, moneda));
}

function renderRow(
  row: IncomeStatementRow,
  formatCifra: (value: number) => string,
  level: number = 0,
  comparativo?: Map<string, number> | null,
): React.ReactNode {
  const indent = level * 20;
  const isParent = row.children.length > 0;

  return (
    <React.Fragment key={row.account_code}>
      <tr className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
        <td className="py-2 px-3" style={{ paddingLeft: `${12 + indent}px` }}>
          <span className={`font-mono text-xs text-gray-500 dark:text-gray-500 mr-2`}>{row.account_code}</span>
          <span className={`${isParent ? 'font-bold' : 'font-normal'} text-gray-900 dark:text-white`}>{row.name}</span>
        </td>
        <td className="py-2 px-3 text-right font-mono text-gray-900 dark:text-white">{formatCifra(row.amount)}</td>
        {comparativo && (
          <td className="py-2 px-3 text-right font-mono text-gray-500 dark:text-gray-400">{formatCifra(comparativo.get(row.account_code) ?? 0)}</td>
        )}
      </tr>
      {row.children.map(child => renderRow(child, formatCifra, level + 1, comparativo))}
    </React.Fragment>
  );
}

export function EstadoResultadosPage() {
  const formatCifra = crearFormatoCifra(useMonedaOrganizacion());
  // `journal_entries.entry_date` es timestamptz: los extremos del filtro se
  // convierten a instantes DENTRO del servicio, con la zona de la organizacion.
  // Aqui solo hace falta el dia calendario de esa misma zona, y por eso los
  // valores por defecto se ponen cuando el contexto ya la sabe (`tzLoading`):
  // calcularlos en el primer render daria el dia de Bogota para todos.
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [nivel, setNivel] = useState<NivelPuc>('auxiliar');
  const [data, setData] = useState<{ income: IncomeStatementRow[]; expenses: IncomeStatementRow[]; totalIncome: number; totalExpenses: number; netIncome: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // NIIF Pymes 3.14: comparativo con el mismo periodo del año anterior, activado por defecto.
  const [conComparativo, setConComparativo] = useState(COMPARATIVO_POR_DEFECTO);
  const [previo, setPrevio] = useState<{ income: IncomeStatementRow[]; expenses: IncomeStatementRow[]; totalIncome: number; desde: string; hasta: string } | null>(null);

  const arrancado = useRef(false);

  useEffect(() => {
    if (tzLoading || arrancado.current) return;
    arrancado.current = true;
    const hoy = getToday();
    const inicio = primerDiaDelAnioDe(hoy);
    setStartDate(inicio);
    setEndDate(hoy);
    loadData(inicio, hoy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tzLoading, getToday]);

  const loadData = async (desde: string = startDate, hasta: string = endDate) => {
    if (!desde || !hasta) return;
    try {
      setIsLoading(true);
      const rango = rangoComparativo(desde, hasta);
      const [result, anterior] = await Promise.all([
        ReportesContablesService.getIncomeStatement(desde, hasta),
        ReportesContablesService.getIncomeStatement(rango.desde, rango.hasta).catch(() => null),
      ]);
      setData(result);
      setPrevio(anterior ? { ...anterior, ...rango } : null);
    } catch (error) {
      console.error('Error cargando estado de resultados:', error);
      // Sin esto la página hacía `return null`: el 500 quedaba en la consola
      // y recargar repetía el mismo fallo en blanco.
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-xl">
          <TrendingUp className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{TITULO_RESULTADO_INTEGRAL}</h1>
          <p className="text-gray-500 dark:text-gray-400">Ingresos menos costos y gastos por función (antes «Estado de resultados»)</p>
        </div>
      </div>

      <BranchBadge className="mb-3" />

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha Inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha Fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <SelectorNivel valor={nivel} onChange={setNivel} />
            <label className="flex items-center gap-2 h-10 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={conComparativo} onChange={(e) => setConComparativo(e.target.checked)} />
              Comparativo año anterior
            </label>
            <Button onClick={() => loadData()} className="bg-blue-600 hover:bg-blue-700">
              <Calendar className="h-4 w-4 mr-2" />
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      {!data ? (
        <EmptyState
          variante="error"
          titulo="No se pudo cargar el estado de resultados"
          onReintentar={() => void loadData()}
        />
      ) : (
        <>
          <div className="flex justify-end">
            <BotonesExportar
              nombre={`estado-resultados-${startDate}-${endDate}`}
              titulo={TITULO_RESULTADO_INTEGRAL}
              columnas={['Seccion', 'Codigo', 'Nombre', 'Importe']}
              filas={[
                ...(filasEnNivel(data.income, nivel) ?? importesPropios(data.income)).map((fila) => ['Ingreso', fila.codigo, fila.nombre, fila.importe] as (string | number)[]),
                ...(filasEnNivel(data.expenses, nivel) ?? importesPropios(data.expenses)).map((fila) => ['Gasto', fila.codigo, fila.nombre, fila.importe] as (string | number)[]),
              ]}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Ingresos
                </CardTitle>
                <CardDescription className="dark:text-gray-400">Total: {formatCifra(data.totalIncome)}</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody>
                    {filasEnNivel(data.income, nivel)
                      ? <FilasNivel filas={filasEnNivel(data.income, nivel) || []} formatCifra={formatCifra} />
                      : data.income.map(row => renderRow(row, formatCifra, 0, conComparativo && previo ? importesPorCodigo(previo.income) : null))}
                    <tr className="border-t-2 dark:border-gray-600 font-bold">
                      <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL INGRESOS</td>
                      <td className="py-3 px-3 text-right font-mono text-green-600 dark:text-green-400">{formatCifra(data.totalIncome)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
    
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  Gastos
                </CardTitle>
                <CardDescription className="dark:text-gray-400">Total: {formatCifra(data.totalExpenses)}</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody>
                    {filasEnNivel(data.expenses, nivel)
                      ? <FilasNivel filas={filasEnNivel(data.expenses, nivel) || []} formatCifra={formatCifra} />
                      : data.expenses.map(row => renderRow(row, formatCifra, 0, conComparativo && previo ? importesPorCodigo(previo.expenses) : null))}
                    <tr className="border-t-2 dark:border-gray-600 font-bold">
                      <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL GASTOS</td>
                      <td className="py-3 px-3 text-right font-mono text-red-600 dark:text-red-400">{formatCifra(data.totalExpenses)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
    
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">{TITULO_RESULTADO_INTEGRAL} — gastos por función</CardTitle>
              <CardDescription className="dark:text-gray-400">
                Los costos y gastos se muestran en positivo y se restan; un saldo crédito aparece negativo en su renglón.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const actual = gastosPorFuncion(data.expenses);
                const anterior = conComparativo && previo ? gastosPorFuncion(previo.expenses) : null;
                const celda = (valor: number, tenue = false) => (
                  <td className={`py-2 px-3 text-right font-mono ${tenue ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>{formatCifra(valor)}</td>
                );
                return (
                  <table className="w-full text-sm">
                    {anterior && (
                      <thead>
                        <tr className="text-xs text-gray-500 dark:text-gray-400">
                          <th />
                          <th className="px-3 text-right font-medium">{startDate} a {endDate}</th>
                          <th className="px-3 text-right font-medium">{previo?.desde} a {previo?.hasta}</th>
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      <tr className="border-b dark:border-gray-700/50 font-semibold">
                        <td className="py-2 px-3 text-gray-900 dark:text-white">Ingresos</td>
                        {celda(data.totalIncome)}
                        {anterior && celda(previo?.totalIncome ?? 0, true)}
                      </tr>
                      {actual.map((renglon, i) => (
                        <tr key={renglon.clave} className="border-b dark:border-gray-700/50">
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300">(−) {renglon.titulo}{renglon.clave.length === 2 ? ` (${renglon.clave})` : ''}</td>
                          {celda(renglon.importe)}
                          {anterior && celda(anterior[i]?.importe ?? 0, true)}
                        </tr>
                      ))}
                      <tr className="border-t-2 dark:border-gray-600 font-bold">
                        <td className="py-3 px-3 text-gray-900 dark:text-white">RESULTADO INTEGRAL DEL PERIODO</td>
                        {celda(resultadoIntegral(data.totalIncome, actual))}
                        {anterior && celda(resultadoIntegral(previo?.totalIncome ?? 0, anterior), true)}
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </CardContent>
          </Card>

          <Card className={`dark:bg-gray-800 dark:border-gray-700 ${data.netIncome >= 0 ? 'border-green-300 dark:border-green-700' : 'border-red-300 dark:border-red-700'}`}>
            <CardContent className="py-6">
              <div className="flex flex-wrap items-center justify-between">
                <div className="flex items-center gap-3">
                  {data.netIncome >= 0 ? (
                    <TrendingUp className="h-8 w-8 text-green-600" />
                  ) : (
                    <TrendingDown className="h-8 w-8 text-red-600" />
                  )}
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Resultado del Periodo</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {data.netIncome >= 0 ? 'Utilidad' : 'Perdida'}
                    </p>
                  </div>
                </div>
                <p className={`text-3xl font-bold font-mono ${data.netIncome >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCifra(Math.abs(data.netIncome))}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
