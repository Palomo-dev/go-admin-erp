'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchSelect } from '@/components/ui/search-select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  limitesMes,
  resumirCategorias,
  type FilaCategoria,
  type TipoCategoria,
} from '@/lib/finanzas/categoriasTesoreria';

function nombreDe(valor: unknown): string | null {
  const fila = Array.isArray(valor) ? valor[0] : valor;
  if (!fila || typeof fila !== 'object') return null;
  const nombre = (fila as { nombre?: unknown }).nombre;
  return typeof nombre === 'string' ? nombre : null;
}

function tipoBanco(tipo: string, monto: number): TipoCategoria {
  if (tipo === 'deposit' || tipo === 'interest') return 'ingreso';
  if (tipo === 'withdrawal' || tipo === 'fee') return 'egreso';
  return monto < 0 ? 'egreso' : 'ingreso';
}

export function ReporteCategoriasPage() {
  const t = useTranslations('tesoreria');
  const { branches } = useBranch();
  const { timezone, today } = useFormatDate();
  const { formatear: formatCurrency } = useMonedaOrganizacion();
  const [mes, setMes] = useState('');
  const [sede, setSede] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [filas, setFilas] = useState<ReturnType<typeof resumirCategorias>>([]);

  useEffect(() => {
    setMes((actual) => actual || today().slice(0, 7));
  }, [today]);

  const cargar = useCallback(async () => {
    const orgId = getOrganizationId();
    if (!orgId || !/^\d{4}-\d{2}$/.test(mes)) return;
    setCargando(true);
    try {
      const { desde, hasta } = limitesMes(mes, timezone);
      let caja = supabase
        .from('cash_movements')
        .select('amount, created_at, branch_id, type, categoria_id, categorias_tesoreria(nombre)')
        .eq('organization_id', orgId)
        .gte('created_at', desde)
        .lt('created_at', hasta);
      let banco = supabase
        .from('bank_transactions')
        .select('amount, trans_date, branch_id, transaction_type, categoria_id, categorias_tesoreria(nombre)')
        .eq('organization_id', orgId)
        .gte('trans_date', desde)
        .lt('trans_date', hasta);
      if (sede != null) {
        caja = caja.eq('branch_id', sede);
        banco = banco.eq('branch_id', sede);
      }
      const [cajaRes, bancoRes] = await Promise.all([caja, banco]);
      if (cajaRes.error) throw cajaRes.error;
      if (bancoRes.error) throw bancoRes.error;
      const movimientos: FilaCategoria[] = [
        ...(cajaRes.data ?? []).map((fila) => ({
          tipo: (fila.type === 'in' ? 'ingreso' : 'egreso') as TipoCategoria,
          categoriaId: fila.categoria_id == null ? null : Number(fila.categoria_id),
          categoriaNombre: nombreDe(fila.categorias_tesoreria),
          branchId: fila.branch_id == null ? null : Number(fila.branch_id),
          instante: String(fila.created_at),
          monto: Number(fila.amount),
        })),
        ...(bancoRes.data ?? []).map((fila) => ({
          tipo: tipoBanco(String(fila.transaction_type), Number(fila.amount)),
          categoriaId: fila.categoria_id == null ? null : Number(fila.categoria_id),
          categoriaNombre: nombreDe(fila.categorias_tesoreria),
          branchId: fila.branch_id == null ? null : Number(fila.branch_id),
          instante: String(fila.trans_date),
          monto: Number(fila.amount),
        })),
      ];
      setFilas(resumirCategorias(movimientos, mes, timezone, sede));
    } catch {
      toast({ title: t('errorTitulo'), description: t('categorias.errorCarga'), variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }, [mes, sede, t, timezone]);

  useEffect(() => {
    if (mes) void cargar();
  }, [mes, cargar]);

  const total = (tipo: TipoCategoria) => filas.filter((fila) => fila.tipo === tipo).reduce((suma, fila) => suma + fila.total, 0);
  const ingresos = total('ingreso');
  const egresos = total('egreso');
  const sedes = branches.filter((sedeFila) => sedeFila.id != null).map((sedeFila) => ({
    value: String(sedeFila.id),
    label: sedeFila.name,
  }));

  return (
    <div className="min-h-screen space-y-6 bg-gray-50 p-4 dark:bg-gray-900 md:p-6">
      <div className="flex items-center gap-3">
        <Link href="/app/finanzas/bancos">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="rounded-xl bg-blue-100 p-2 dark:bg-blue-900/30">
          <BarChart3 className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('reporte.titulo')}</h1>
          <p className="text-gray-500">{t('reporte.descripcion')}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mes-reporte">{t('reporte.mes')}</Label>
          <Input id="mes-reporte" type="month" value={mes} onChange={(event) => setMes(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('reporte.sede')}</Label>
          <SearchSelect
            options={sedes}
            value={sede == null ? 'todas' : String(sede)}
            onValueChange={(valor) => setSede(valor === 'todas' ? null : Number(valor))}
            noneLabel={t('reporte.todas')}
            noneValue="todas"
            placeholder={t('reporte.sede')}
            searchPlaceholder={t('reporte.sede')}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-gray-500">{t('reporte.ingresos')}</p><p className="text-xl font-semibold text-green-600">{formatCurrency(ingresos)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-gray-500">{t('reporte.egresos')}</p><p className="text-xl font-semibold text-red-600">{formatCurrency(egresos)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-gray-500">{t('reporte.neto')}</p><p className="text-xl font-semibold">{formatCurrency(ingresos - egresos)}</p></CardContent></Card>
      </div>

      {cargando ? <Loader2 className="h-6 w-6 animate-spin" /> : filas.length === 0 ? (
        <p className="text-sm text-gray-500">{t('reporte.vacio')}</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reporte.categoria')}</TableHead>
                  <TableHead>{t('reporte.tipo')}</TableHead>
                  <TableHead className="text-right">{t('reporte.movimientos')}</TableHead>
                  <TableHead className="text-right">{t('reporte.total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((fila) => (
                  <TableRow key={`${fila.tipo}-${fila.categoriaId ?? 'sin'}`}>
                    <TableCell>{fila.nombre === 'Sin categoría' ? t('reporte.sinCategoria') : fila.nombre}</TableCell>
                    <TableCell>{fila.tipo === 'ingreso' ? t('reporte.ingresos') : t('reporte.egresos')}</TableCell>
                    <TableCell className="text-right">{fila.movimientos}</TableCell>
                    <TableCell className="text-right">{formatCurrency(fila.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
