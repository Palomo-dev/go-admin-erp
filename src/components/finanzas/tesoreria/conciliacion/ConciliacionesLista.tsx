'use client';

/**
 * Conciliación bancaria · lista (Figma `2328:130232`), con el kit. Sustituye a
 * `ConciliacionPage` (ruta vieja `/finanzas/conciliacion-bancaria`, redirige).
 *
 * Conserva lo de la vieja: KPIs Total · Borradores · En progreso · Cerradas,
 * filtros por estado y por cuenta, diferencia con su sentido («falta
 * extracto», «sobra en el banco»…), abrir el detalle, nueva conciliación y
 * actualizar. Nuevo: buscador por cuenta o periodo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, ListChecks, Plus, RefreshCw } from 'lucide-react';
import {
  BranchBadgeActiva,
  DataTable,
  KpiStrip,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  StatCard,
  StatusBadge,
  clasesBoton,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { ConciliacionService, type ConciliacionStats } from '@/components/finanzas/conciliacion-bancaria/ConciliacionService';
import type { BankAccount, BankReconciliation } from '@/components/finanzas/bancos/BancosService';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { sentidoDiferencia } from '@/lib/finanzas/conciliacion/diferencia';
import { RUTA_NUEVA_CONCILIACION, RUTAS_TESORERIA, rutaConciliacion } from '@/lib/finanzas/tesoreria/rutas';
import { SelectNativo } from '../compartido';

type FiltroEstado = 'todos' | 'draft' | 'in_progress' | 'closed';

export function ConciliacionesLista() {
  const t = useTranslations('finanzasTesoreriaR3.conciliacion');
  const tc = useTranslations('finanzasTesoreriaR3.comun');
  const tCierre = useTranslations('conciliacionCierre');
  const router = useRouter();
  const { branchFilter } = useBranch();
  const { paraDocumento } = useMonedaOrganizacion();
  const { formatPlain } = useFormatDate();
  const [filas, setFilas] = useState<BankReconciliation[]>([]);
  const [cuentas, setCuentas] = useState<BankAccount[]>([]);
  const [stats, setStats] = useState<ConciliacionStats | null>(null);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [filtroCuenta, setFiltroCuenta] = useState('');
  const [termino, setTermino] = useState('');

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const [r, c, s] = await Promise.all([
        ConciliacionService.obtenerConciliaciones({ branchId: branchFilter }),
        ConciliacionService.obtenerCuentasBancarias(branchFilter),
        ConciliacionService.obtenerEstadisticas(branchFilter),
      ]);
      setFilas(r);
      setCuentas(c);
      setStats(s);
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [branchFilter]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const monedaDe = useCallback(
    (r: BankReconciliation) => {
      const ctx = paraDocumento(cuentas.find((a) => a.id === r.bank_account_id)?.currency);
      return { formatear: (v: number) => formatMoneda(v, ctx) };
    },
    [cuentas, paraDocumento],
  );
  const periodo = useCallback((r: BankReconciliation) => `${formatPlain(r.period_start)} – ${formatPlain(r.period_end)}`, [formatPlain]);

  const visibles = useMemo(() => {
    const q = termino.trim().toLowerCase();
    return filas.filter(
      (r) =>
        (filtroEstado === 'todos' || r.status === filtroEstado) &&
        (!filtroCuenta || String(r.bank_account_id) === filtroCuenta) &&
        (!q || (r.bank_account?.name ?? '').toLowerCase().includes(q) || periodo(r).toLowerCase().includes(q)),
    );
  }, [filas, filtroEstado, filtroCuenta, termino, periodo]);

  const columnas: ColumnaTabla<BankReconciliation>[] = [
    { id: 'cuenta', encabezado: t('columnas.cuenta'), celda: (r) => <span className="font-medium text-fg">{r.bank_account?.name ?? t('cuentaSinNombre')}</span> },
    { id: 'periodo', encabezado: t('columnas.periodo'), celda: periodo, ocultarDebajo: 'md' },
    { id: 'extracto', encabezado: t('columnas.saldoExtracto'), variante: 'importe', celda: (r) => (r.statement_balance === null ? '—' : monedaDe(r).formatear(r.statement_balance)), ocultarDebajo: 'lg' },
    {
      id: 'diferencia',
      encabezado: t('columnas.diferencia'),
      variante: 'importe',
      celda: (r) =>
        r.statement_balance === null ? (
          <span className="text-fg-secondary">{tCierre('sentido.faltaExtracto')}</span>
        ) : (
          <div>
            <span className={(r.difference ?? 0) === 0 ? 'text-fg' : 'font-medium text-warning-text'}>{monedaDe(r).formatear(r.difference ?? 0)}</span>
            {(r.difference ?? 0) !== 0 && <p className="text-xs text-fg-secondary">{tCierre(`sentido.${sentidoDiferencia(r.difference ?? 0)}`)}</p>}
          </div>
        ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (r) => <StatusBadge estado={r.status} etiqueta={t(`estados.${r.status}`)} /> },
  ];

  const filtroKpi = (f: FiltroEstado) => () => setFiltroEstado((x) => (x === f ? 'todos' : f));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ListChecks}
        migas={[{ etiqueta: tc('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: tc('migas.tesoreria'), href: RUTAS_TESORERIA.movimientos }, { etiqueta: t('titulo') }]}
        movil={{ accionesEnFila: true }}
        acciones={
          <>
            <Link href={RUTA_NUEVA_CONCILIACION} className={clasesBoton({ variante: 'primario' })}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('nueva')}
            </Link>
            <RowActionsMenu
              acciones={[{ id: 'actualizar', etiqueta: tc('actualizar'), icono: RefreshCw, onSelect: () => void cargar() }]}
              titulo={t('titulo')}
              orientacion="horizontal"
              tamano="md"
            />
          </>
        }
        debajo={<BranchBadgeActiva />}
      />

      <div className="flex flex-col gap-3 lg:flex-row">
        <SearchInput value={termino} onChange={setTermino} placeholder={t('buscar')} etiqueta={t('buscar')} className="flex-1" />
        <div className="grid grid-cols-2 gap-3 lg:w-[420px]">
          <SelectNativo
            valor={filtroEstado === 'todos' ? '' : filtroEstado}
            onCambiar={(v) => setFiltroEstado((v || 'todos') as FiltroEstado)}
            vacio={t('filtros.todosEstados')}
            opciones={(['draft', 'in_progress', 'closed'] as const).map((s) => ({ valor: s, etiqueta: t(`estados.${s}`) }))}
            aria-label={t('filtros.estado')}
          />
          <SelectNativo
            valor={filtroCuenta}
            onCambiar={setFiltroCuenta}
            vacio={t('filtros.todasCuentas')}
            opciones={cuentas.map((c) => ({ valor: String(c.id), etiqueta: c.name }))}
            aria-label={t('filtros.cuenta')}
          />
        </div>
      </div>

      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard etiqueta={t('kpi.total')} valor={stats?.total ?? 0} tamano="sm" cargando={estado === 'cargando'} onClick={() => setFiltroEstado('todos')} />
        <StatCard etiqueta={t('kpi.borradores')} valor={stats?.draft ?? 0} tamano="sm" cargando={estado === 'cargando'} onClick={filtroKpi('draft')} resaltada={filtroEstado === 'draft'} />
        <StatCard
          etiqueta={t('kpi.enProgreso')}
          valor={stats?.in_progress ?? 0}
          tamano="sm"
          tono="informacion"
          cargando={estado === 'cargando'}
          onClick={filtroKpi('in_progress')}
          resaltada={filtroEstado === 'in_progress'}
        />
        <StatCard etiqueta={t('kpi.cerradas')} valor={stats?.closed ?? 0} tamano="sm" tono="exito" cargando={estado === 'cargando'} onClick={filtroKpi('closed')} resaltada={filtroEstado === 'closed'} />
      </KpiStrip>

      <DataTable<BankReconciliation>
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(r) => r.id}
        estado={estado === 'listo' && filas.length > 0 && visibles.length === 0 ? 'sinResultados' : estado}
        termino={termino}
        onLimpiarFiltros={() => {
          setTermino('');
          setFiltroEstado('todos');
          setFiltroCuenta('');
        }}
        onReintentar={() => void cargar()}
        onFilaClick={(r) => router.push(rutaConciliacion(r.id))}
        etiquetaFila={(r) => r.bank_account?.name ?? t('titulo')}
        acciones={(r) => [{ id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => router.push(rutaConciliacion(r.id)) }]}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), accion: { etiqueta: t('nueva'), href: RUTA_NUEVA_CONCILIACION } }}
        tarjetaMovil={(r) => (
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{r.bank_account?.name ?? t('cuentaSinNombre')}</p>
              <p className="text-xs text-fg-secondary">{periodo(r)}</p>
            </div>
            <StatusBadge estado={r.status} etiqueta={t(`estados.${r.status}`)} />
          </div>
        )}
      />
    </div>
  );
}
