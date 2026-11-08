'use client';

/**
 * Detalle de cuenta bancaria (Tesorería v2, `1009:85377`) y su variante «sin
 * cuenta contable» (`2329:132244`), con pestañas Movimientos · Conciliaciones ·
 * Datos. Sustituye a `/bancos/cuentas/[id]` y `/bancos/cuentas/[id]/movimientos`
 * (las dos redirigen aquí).
 *
 * Acciones viejas que se conservan: movimiento manual (entrada/salida),
 * actualizar, sincronizar con Open Finance (si la cuenta tiene vínculo),
 * asignar la cuenta contable (PUC) cuando falta, nueva conciliación, ver los
 * movimientos con búsqueda y filtro Pendientes/Conciliados. Nuevas: editar,
 * activar/desactivar (vivían en la tarjeta de la lista), transferir. «Importar
 * extracto» (sin `onClick` en la vieja) lleva a la nueva conciliación, que es
 * donde se importa el extracto.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeftRight, FileUp, Landmark, Pencil, Plus, Power, RefreshCw, Zap } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  CampoNumero,
  ConfirmDialog,
  DataTable,
  Dialogo,
  EmptyState,
  FilaDato,
  FormField,
  KpiStrip,
  ListaDatos,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  Skeleton,
  StatCard,
  StatusBadge,
  TabBar,
  Tarjeta,
  clasesBoton,
  idPanel,
  idPestana,
  useOpcionUrl,
  type ColumnaTabla,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { BancosService, type BankAccount, type BankReconciliation, type BankTransaction } from '@/components/finanzas/bancos/BancosService';
import { ConciliacionService, type ExtractoDeCuenta } from '@/components/finanzas/conciliacion-bancaria/ConciliacionService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { cuentasBancariasElegibles } from '@/lib/finanzas/mapeoImpuesto';
import { efectoEnCuenta } from '@/lib/finanzas/tesoreria/efectoEnCuenta';
import {
  estaConciliadoBanco,
  filtrarMovimientosBanco,
  mascaraCuenta,
  resumirExtracto,
  resumirMovimientosBanco,
  type FiltroConciliacion,
} from '@/lib/finanzas/tesoreria/cuentasDinero';
import {
  PESTANAS_CUENTA_BANCARIA,
  RUTA_NUEVA_CONCILIACION,
  RUTAS_TESORERIA,
  rutaConciliacion,
  type PestanaCuentaBancaria,
} from '@/lib/finanzas/tesoreria/rutas';
import { EfectoEnCuentaTarjeta, NuevaTransferenciaDialogo, SelectNativo } from '../compartido';
import { CuentaBancariaPanel } from './CuentaBancariaPanel';

const ID = 'cuenta-bancaria';
const TAMANO = 25;
type Plan = { account_code: string; name: string; type: string; parent_code: string | null; is_active?: boolean | null };

interface VinculoOpenFinance {
  link_id: string;
  last_balance: number | null;
  last_balance_at: string | null;
}

export function CuentaBancariaDetalle({ id }: { id: string }) {
  const t = useTranslations('finanzasTesoreriaR3.cuentaBancaria');
  const tc = useTranslations('finanzasTesoreriaR3.comun');
  const tCon = useTranslations('finanzasTesoreriaR3.conciliacion');
  const router = useRouter();
  const cuentaId = Number(id);
  const { paraDocumento, code: monedaBase } = useMonedaOrganizacion();
  const { formatDate, formatDateTime, formatPlain, getToday, toDate } = useFormatDate();
  const [pestana, setPestana] = useOpcionUrl<PestanaCuentaBancaria>('tab', PESTANAS_CUENTA_BANCARIA, 'movimientos');
  const [cuenta, setCuenta] = useState<BankAccount | null>(null);
  const [txs, setTxs] = useState<BankTransaction[]>([]);
  const [conciliaciones, setConciliaciones] = useState<BankReconciliation[] | null>(null);
  const [extractos, setExtractos] = useState<ExtractoDeCuenta[] | null>(null);
  const [vinculo, setVinculo] = useState<VinculoOpenFinance | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'noEncontrada'>('cargando');
  const [plan, setPlan] = useState<Plan[]>([]);
  const [puc, setPuc] = useState('');
  const [guardandoPuc, setGuardandoPuc] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [termino, setTermino] = useState('');
  const [filtro, setFiltro] = useState<FiltroConciliacion>('todos');
  const [pagina, setPagina] = useState(1);
  const [manual, setManual] = useState(false);
  const [editar, setEditar] = useState(false);
  const [transferir, setTransferir] = useState(false);
  const [cambiarEstado, setCambiarEstado] = useState(false);

  const cargar = useCallback(async () => {
    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
      setEstado('noEncontrada');
      return;
    }
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    try {
      const [c, movimientos] = await Promise.all([
        BancosService.obtenerCuentaBancaria(cuentaId),
        BancosService.obtenerTransacciones(cuentaId, { limit: 200 }),
      ]);
      if (!c) {
        setEstado('noEncontrada');
        return;
      }
      setCuenta(c);
      setPuc(c.account_code ?? '');
      setTxs(movimientos);
      // Vínculo de Open Finance de ESTA organización; sin vínculo no es error.
      const { data: of, error: ofError } = await supabase
        .from('open_finance_accounts')
        .select('link_id, last_balance, last_balance_at')
        .eq('organization_id', getOrganizationId())
        .eq('bank_account_id', cuentaId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (ofError) throw ofError;
      setVinculo(of as VinculoOpenFinance | null);
      setEstado('listo');
    } catch {
      setEstado('error');
    }
    BancosService.obtenerConciliaciones(cuentaId)
      .then(setConciliaciones)
      .catch(() => setConciliaciones(null));
    ConciliacionService.obtenerExtractosCuenta(cuentaId)
      .then(setExtractos)
      .catch(() => setExtractos(null));
  }, [cuentaId]);

  useEffect(() => {
    void cargar();
    BancosService.obtenerPlanCuentas().then(setPlan).catch(() => setPlan([]));
  }, [cargar]);

  useEffect(() => setPagina(1), [termino, filtro]);

  useCabeceraMovil({ modo: 'page', titulo: cuenta?.name, subtitulo: cuenta?.bank_name || undefined, volverA: RUTAS_TESORERIA.cuentas });

  const ctxMoneda = paraDocumento(cuenta?.currency);
  const moneda = { formatear: (v: number) => formatMoneda(v, ctxMoneda) };
  const hoy = getToday();
  const diaDe = useCallback((iso: string) => toDate(new Date(iso)), [toDate]);
  const resumen = useMemo(() => resumirMovimientosBanco(txs, hoy, diaDe), [txs, hoy, diaDe]);
  const visibles = useMemo(() => filtrarMovimientosBanco(txs, filtro, termino), [txs, filtro, termino]);
  const elegibles = useMemo(() => cuentasBancariasElegibles(plan), [plan]);

  // Saldo corrido: el saldo de libros hacia atrás por la lista (los movimientos llegan del más reciente al más viejo).
  const saldoTras = useMemo(() => {
    const mapa = new Map<number, number>();
    let saldo = Number(cuenta?.balance ?? 0);
    for (const tx of txs) {
      mapa.set(tx.id, saldo);
      saldo -= Number(tx.amount);
    }
    return mapa;
  }, [txs, cuenta]);

  const guardarPuc = async () => {
    if (!puc) {
      toast.error(t('puc.falta'));
      return;
    }
    setGuardandoPuc(true);
    try {
      await BancosService.actualizarCuentaBancaria(cuentaId, { account_code: puc });
      toast.success(t('puc.guardada'));
      await cargar();
    } catch {
      toast.error(t('puc.error'));
    } finally {
      setGuardandoPuc(false);
    }
  };

  const sincronizar = async () => {
    if (!vinculo) return;
    setSincronizando(true);
    try {
      const r = await fetch('/api/integrations/open-finance/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId: vinculo.link_id }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { stats?: { synced: number; imported: number } };
      toast.success(t('sincronizado', { sincronizadas: d.stats?.synced ?? 0, importadas: d.stats?.imported ?? 0 }));
      await cargar();
    } catch {
      toast.error(t('errorSincronizar'));
    } finally {
      setSincronizando(false);
    }
  };

  const alternarActiva = async () => {
    if (!cuenta) return;
    try {
      await BancosService.toggleActivoCuenta(cuenta.id, !cuenta.is_active);
      toast.success(cuenta.is_active ? t('desactivada') : t('activada'));
      await cargar();
    } catch {
      toast.error(t('errorEstado'));
    } finally {
      setCambiarEstado(false);
    }
  };

  if (estado === 'cargando' && !cuenta) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (estado === 'noEncontrada' || (estado === 'error' && !cuenta)) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <EmptyState
          variante={estado === 'error' ? 'error' : 'empty'}
          titulo={estado === 'error' ? t('errorCarga') : t('noEncontrada')}
          onReintentar={estado === 'error' ? () => void cargar() : undefined}
          accion={{ etiqueta: t('volver'), href: RUTAS_TESORERIA.cuentas }}
        />
      </div>
    );
  }
  if (!cuenta) return null;

  const titulo = `${cuenta.name}${cuenta.account_number ? ` ${mascaraCuenta(cuenta.account_number)}` : ''}`;
  const tipoCuenta = cuenta.account_type ? (t.has(`form.tipos.${cuenta.account_type}`) ? t(`form.tipos.${cuenta.account_type}`) : cuenta.account_type) : '';

  const columnas: ColumnaTabla<BankTransaction>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (tx) => <span className="whitespace-nowrap text-fg-secondary">{formatDate(tx.trans_date ?? tx.created_at)}</span>, ancho: 120 },
    {
      id: 'descripcion',
      encabezado: t('columnas.descripcion'),
      celda: (tx) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{tx.description || (t.has(`origenes.${tx.transaction_type}`) ? t(`origenes.${tx.transaction_type}`) : tx.transaction_type)}</p>
          {tx.reference && <p className="truncate text-xs text-fg-secondary">{tx.reference}</p>}
        </div>
      ),
    },
    {
      id: 'origen',
      encabezado: t('columnas.origen'),
      celda: (tx) => (tx.import_source && t.has(`fuentes.${tx.import_source}`) ? t(`fuentes.${tx.import_source}`) : t('fuentes.manual')),
      ocultarDebajo: 'lg',
    },
    { id: 'entrada', encabezado: t('columnas.entrada'), variante: 'importe', celda: (tx) => (Number(tx.amount) >= 0 ? <span className="text-success-text">{moneda.formatear(Number(tx.amount))}</span> : '—') },
    { id: 'salida', encabezado: t('columnas.salida'), variante: 'importe', celda: (tx) => (Number(tx.amount) < 0 ? <span className="text-danger-text">−{moneda.formatear(Math.abs(Number(tx.amount)))}</span> : '—') },
    { id: 'saldo', encabezado: t('columnas.saldo'), variante: 'importe', celda: (tx) => moneda.formatear(saldoTras.get(tx.id) ?? 0), ocultarDebajo: 'xl' },
    {
      id: 'conciliacion',
      encabezado: t('columnas.conciliacion'),
      celda: (tx) => (
        <StatusBadge
          estado={tx.status ?? 'unmatched'}
          etiqueta={estaConciliadoBanco(tx.status) ? t('conciliado') : t('porConciliar')}
          tono={estaConciliadoBanco(tx.status) ? 'exito' : 'advertencia'}
        />
      ),
      ocultarDebajo: 'md',
    },
  ];

  const columnasExt: ColumnaTabla<ExtractoDeCuenta>[] = [
    {
      id: 'archivo',
      encabezado: t('extractos.columnas.archivo'),
      celda: (x) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{x.nombre_archivo || t('extractos.sinNombre')}</p>
          <p className="text-xs uppercase text-fg-secondary">{x.formato}</p>
        </div>
      ),
    },
    { id: 'importado', encabezado: t('extractos.columnas.importado'), celda: (x) => formatDateTime(x.created_at), ocultarDebajo: 'md' },
    { id: 'lineas', encabezado: t('extractos.columnas.lineas'), variante: 'importe', celda: (x) => x.lineas.length },
    {
      id: 'estado',
      encabezado: t('extractos.columnas.estado'),
      celda: (x) => {
        const r = resumirExtracto(x.lineas);
        return (
          <StatusBadge
            estado={r.pendientes > 0 ? 'pendiente' : 'conciliado'}
            etiqueta={r.pendientes > 0 ? t('extractos.pendientes', { n: r.pendientes }) : t('extractos.completo')}
            tono={r.pendientes > 0 ? 'advertencia' : 'exito'}
          />
        );
      },
    },
    {
      id: 'movimientos',
      encabezado: t('extractos.columnas.movimientos'),
      variante: 'importe',
      ocultarDebajo: 'lg',
      celda: (x) => {
        const r = resumirExtracto(x.lineas);
        return `+${moneda.formatear(r.entradas)} · −${moneda.formatear(r.salidas)}`;
      },
    },
  ];

  const columnasCon: ColumnaTabla<BankReconciliation>[] = [
    { id: 'periodo', encabezado: tCon('columnas.periodo'), celda: (r) => `${formatPlain(r.period_start)} – ${formatPlain(r.period_end)}` },
    { id: 'extracto', encabezado: tCon('columnas.saldoExtracto'), variante: 'importe', celda: (r) => (r.statement_balance === null ? '—' : moneda.formatear(r.statement_balance)) },
    { id: 'diferencia', encabezado: tCon('columnas.diferencia'), variante: 'importe', celda: (r) => (r.difference === null ? '—' : moneda.formatear(r.difference)) },
    { id: 'estado', encabezado: tCon('columnas.estado'), celda: (r) => <StatusBadge estado={r.status} etiqueta={tCon(`estados.${r.status}`)} /> },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variante="detail"
        titulo={titulo}
        subtitulo={[tipoCuenta, cuenta.currency ?? monedaBase, cuenta.bank_name, cuenta.account_code ? t('cuentaContable', { codigo: cuenta.account_code }) : null].filter(Boolean).join(' · ')}
        icono={Landmark}
        badge={!cuenta.is_active ? <StatusBadge estado="inactive" etiqueta={t('inactiva')} tono="neutro" /> : undefined}
        migas={[{ etiqueta: tc('migas.tesoreria'), href: RUTAS_TESORERIA.movimientos }, { etiqueta: t('migaCuentas'), href: RUTAS_TESORERIA.cuentas }, { etiqueta: titulo }]}
        volverA={RUTAS_TESORERIA.cuentas}
        movil={{ accionesEnFila: true }}
        acciones={
          <>
            <Link href={`${RUTA_NUEVA_CONCILIACION}?cuenta=${cuenta.id}`} className={clasesBoton({ variante: 'secundario' })}>
              <FileUp className="h-4 w-4" aria-hidden />
              {t('importarExtracto')}
            </Link>
            <button type="button" onClick={() => setManual(true)} disabled={!cuenta.is_active} className={clasesBoton({ variante: 'primario' })}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('movimientoManual')}
            </button>
            <RowActionsMenu
              titulo={titulo}
              orientacion="horizontal"
              tamano="md"
              acciones={[
                { id: 'actualizar', etiqueta: tc('actualizar'), icono: RefreshCw, onSelect: () => void cargar() },
                { id: 'transferir', etiqueta: t('transferir'), icono: ArrowLeftRight, onSelect: () => setTransferir(true), oculta: !cuenta.is_active },
                {
                  id: 'sincronizar',
                  etiqueta: sincronizando ? t('sincronizando') : t('sincronizar'),
                  icono: Zap,
                  onSelect: () => void sincronizar(),
                  deshabilitada: !vinculo || sincronizando,
                  motivo: vinculo ? undefined : t('sinVinculo'),
                },
                { id: 'editar', etiqueta: t('editar'), icono: Pencil, onSelect: () => setEditar(true), separadorAntes: true },
                { id: 'estado', etiqueta: cuenta.is_active ? t('desactivar') : t('activar'), icono: Power, onSelect: () => setCambiarEstado(true), destructiva: cuenta.is_active },
              ]}
            />
          </>
        }
        debajo={
          <TabBar
            id={ID}
            etiqueta={t('pestanas.etiqueta')}
            valor={pestana}
            onValorChange={setPestana}
            pestanas={[
              { valor: 'movimientos', etiqueta: t('pestanas.movimientos'), contador: txs.length },
              { valor: 'extractos', etiqueta: t('pestanas.extractos'), contador: extractos?.length },
              { valor: 'conciliaciones', etiqueta: t('pestanas.conciliaciones'), contador: conciliaciones?.length },
              { valor: 'datos', etiqueta: t('pestanas.datos') },
            ]}
          />
        }
      />

      {!cuenta.account_code && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('puc.titulo')}
          descripcion={t('puc.descripcion')}
          accion={pestana !== 'datos' ? { etiqueta: t('puc.asignar'), onClick: () => setPestana('datos') } : undefined}
        />
      )}

      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard etiqueta={t('kpi.libros')} valor={moneda.formatear(Number(cuenta.balance))} detalle={t('kpi.librosAyuda')} />
        <StatCard
          etiqueta={t('kpi.banco')}
          valor={vinculo?.last_balance != null ? moneda.formatear(Number(vinculo.last_balance)) : t('kpi.sinConectar')}
          detalle={vinculo?.last_balance_at ? t('kpi.bancoAl', { fecha: formatDate(vinculo.last_balance_at) }) : t('kpi.bancoAyuda')}
        />
        <StatCard
          etiqueta={t('kpi.porConciliar')}
          valor={resumen.porConciliar}
          detalle={resumen.porConciliar > 0 ? moneda.formatear(resumen.importePorConciliar) : undefined}
          tono={resumen.porConciliar > 0 ? 'advertencia' : 'neutro'}
          onClick={() => {
            setPestana('movimientos');
            setFiltro('pendientes');
          }}
        />
        <StatCard
          etiqueta={t('kpi.mes')}
          valor={resumen.mes}
          detalle={t('kpi.mesAyuda', { entradas: moneda.formatear(resumen.entradasMes), salidas: moneda.formatear(resumen.salidasMes) })}
        />
      </KpiStrip>

      <div role="tabpanel" id={idPanel(ID, 'movimientos')} aria-labelledby={idPestana(ID, 'movimientos')} hidden={pestana !== 'movimientos'} className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={termino} onChange={setTermino} placeholder={t('buscar')} etiqueta={t('buscar')} className="flex-1" />
          <SegmentedControl<FiltroConciliacion>
            etiqueta={t('filtro.etiqueta')}
            valor={filtro}
            onValorChange={setFiltro}
            opciones={[
              { valor: 'todos', etiqueta: t('filtro.todos') },
              { valor: 'pendientes', etiqueta: t('filtro.pendientes') },
              { valor: 'conciliados', etiqueta: t('filtro.conciliados') },
            ]}
          />
        </div>
        <DataTable<BankTransaction>
          etiqueta={t('pestanas.movimientos')}
          columnas={columnas}
          filas={visibles.slice((pagina - 1) * TAMANO, pagina * TAMANO)}
          obtenerId={(tx) => String(tx.id)}
          estado={estado === 'error' ? 'error' : txs.length > 0 && visibles.length === 0 ? 'sinResultados' : 'listo'}
          termino={termino}
          onLimpiarFiltros={() => {
            setTermino('');
            setFiltro('todos');
          }}
          onReintentar={() => void cargar()}
          vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), accion: { etiqueta: t('movimientoManual'), onClick: () => setManual(true) } }}
          tarjetaMovil={(tx) => (
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{tx.description || (t.has(`origenes.${tx.transaction_type}`) ? t(`origenes.${tx.transaction_type}`) : tx.transaction_type)}</p>
                <p className="text-xs text-fg-secondary">{formatDate(tx.trans_date ?? tx.created_at)}</p>
              </div>
              <span className={Number(tx.amount) < 0 ? 'font-semibold tabular-nums text-danger-text' : 'font-semibold tabular-nums text-success-text'}>
                {Number(tx.amount) < 0 ? '−' : '+'}
                {moneda.formatear(Math.abs(Number(tx.amount)))}
              </span>
            </div>
          )}
          pie={
            visibles.length > TAMANO ? (
              <Pagination pagina={pagina} tamano={TAMANO} total={visibles.length} onPaginaChange={setPagina} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }} />
            ) : undefined
          }
        />
        {txs.length >= 200 && <p className="text-xs text-fg-secondary">{t('limite')}</p>}
      </div>

      <div role="tabpanel" id={idPanel(ID, 'extractos')} aria-labelledby={idPestana(ID, 'extractos')} hidden={pestana !== 'extractos'} className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg-secondary">{t('extractos.ayuda')}</p>
          <Link href={`${RUTA_NUEVA_CONCILIACION}?cuenta=${cuenta.id}`} className={clasesBoton({ variante: 'secundario' })}>
            <FileUp className="h-4 w-4" aria-hidden />
            {t('importarExtracto')}
          </Link>
        </div>
        <DataTable<ExtractoDeCuenta>
          etiqueta={t('pestanas.extractos')}
          columnas={columnasExt}
          filas={extractos ?? []}
          obtenerId={(x) => x.id}
          estado={extractos === null ? 'error' : 'listo'}
          onReintentar={() => void cargar()}
          onFilaClick={(x) => x.reconciliation_id && router.push(rutaConciliacion(x.reconciliation_id))}
          vacio={{ titulo: t('extractos.vacio.titulo'), descripcion: t('extractos.vacio.descripcion'), compacto: true }}
          tarjetaMovil={(x) => {
            const r = resumirExtracto(x.lineas);
            return (
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{x.nombre_archivo || t('extractos.sinNombre')}</p>
                  <p className="text-xs text-fg-secondary">{formatDateTime(x.created_at)}</p>
                </div>
                <span className="text-sm text-fg-secondary">{t('extractos.resumenMovil', { lineas: r.lineas, pendientes: r.pendientes })}</span>
              </div>
            );
          }}
        />
      </div>

      <div role="tabpanel" id={idPanel(ID, 'conciliaciones')} aria-labelledby={idPestana(ID, 'conciliaciones')} hidden={pestana !== 'conciliaciones'} className="space-y-4">
        <div className="flex justify-end">
          <Link href={`${RUTA_NUEVA_CONCILIACION}?cuenta=${cuenta.id}`} className={clasesBoton({ variante: 'secundario' })}>
            <Plus className="h-4 w-4" aria-hidden />
            {tCon('nueva')}
          </Link>
        </div>
        <DataTable<BankReconciliation>
          etiqueta={t('pestanas.conciliaciones')}
          columnas={columnasCon}
          filas={conciliaciones ?? []}
          obtenerId={(r) => r.id}
          estado={conciliaciones === null ? 'error' : 'listo'}
          onReintentar={() => void cargar()}
          onFilaClick={(r) => router.push(rutaConciliacion(r.id))}
          vacio={{ titulo: tCon('vacio.titulo'), descripcion: tCon('vacio.descripcion'), compacto: true }}
        />
      </div>

      <div role="tabpanel" id={idPanel(ID, 'datos')} aria-labelledby={idPestana(ID, 'datos')} hidden={pestana !== 'datos'} className="grid gap-6 lg:grid-cols-2">
        <Tarjeta
          titulo={t('datos.titulo')}
          accion={
            <button type="button" onClick={() => setEditar(true)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              <Pencil className="h-4 w-4" aria-hidden />
              {t('editar')}
            </button>
          }
        >
          <ListaDatos etiqueta={t('datos.titulo')}>
            <FilaDato etiqueta={t('form.nombre')} valor={cuenta.name} />
            <FilaDato etiqueta={t('form.banco')} valor={cuenta.bank_name ?? '—'} />
            <FilaDato etiqueta={t('form.tipo')} valor={tipoCuenta || '—'} />
            <FilaDato etiqueta={t('form.numero')} valor={mascaraCuenta(cuenta.account_number) || '—'} />
            <FilaDato etiqueta={t('form.moneda')} valor={cuenta.currency ?? monedaBase} />
            <FilaDato etiqueta={t('form.cuentaContable')} valor={cuenta.account_code ?? t('puc.sin')} tono={cuenta.account_code ? 'neutro' : 'advertencia'} />
            <FilaDato
              etiqueta={t('datos.saldoInicial')}
              valor={cuenta.initial_balance === null ? '—' : moneda.formatear(cuenta.initial_balance)}
              descripcion={cuenta.initial_balance_date ? t('datos.alCorte', { fecha: formatPlain(cuenta.initial_balance_date) }) : undefined}
            />
            <FilaDato
              etiqueta={t('datos.fechaCorte')}
              valor={cuenta.initial_balance_date ? formatPlain(cuenta.initial_balance_date) : t('datos.sinFechaCorte')}
              tono={cuenta.initial_balance_date ? 'neutro' : 'advertencia'}
            />
            <FilaDato etiqueta={t('datos.estado')} valor={cuenta.is_active ? t('activa') : t('inactiva')} />
            <FilaDato etiqueta={t('datos.creada')} valor={formatDate(cuenta.created_at)} />
          </ListaDatos>
        </Tarjeta>
        {!cuenta.account_code && (
          <Tarjeta titulo={t('puc.titulo')} tono="advertencia" descripcion={t('puc.descripcion')}>
            <div className="space-y-3">
              <FormField etiqueta={t('form.cuentaContable')} obligatorio ayuda={t('form.cuentaContableAyuda')}>
                {(c) => (
                  <SelectNativo
                    id={c.id}
                    valor={puc}
                    onCambiar={setPuc}
                    vacio={t('form.elegirCuenta')}
                    opciones={elegibles.map((x) => ({ valor: x.account_code, etiqueta: `${x.account_code} · ${x.name}` }))}
                  />
                )}
              </FormField>
              <button type="button" onClick={() => void guardarPuc()} disabled={guardandoPuc} className={clasesBoton({ variante: 'primario' })}>
                {guardandoPuc ? tc('guardando') : t('puc.guardar')}
              </button>
            </div>
          </Tarjeta>
        )}
      </div>

      <MovimientoManualDialogo
        abierto={manual}
        onAbiertoChange={setManual}
        cuenta={cuenta}
        onHecho={() => {
          setManual(false);
          void cargar();
        }}
      />
      <CuentaBancariaPanel
        abierto={editar}
        onAbiertoChange={setEditar}
        cuenta={cuenta}
        onGuardada={() => {
          setEditar(false);
          void cargar();
        }}
      />
      <NuevaTransferenciaDialogo
        abierto={transferir}
        onAbiertoChange={setTransferir}
        origenInicial={cuenta.id}
        onHecha={() => {
          setTransferir(false);
          void cargar();
        }}
      />
      <ConfirmDialog
        abierto={cambiarEstado}
        onAbiertoChange={setCambiarEstado}
        titulo={cuenta.is_active ? t('confirmarDesactivar.titulo') : t('confirmarActivar.titulo')}
        descripcion={cuenta.is_active ? t('confirmarDesactivar.descripcion') : t('confirmarActivar.descripcion')}
        textoConfirmar={cuenta.is_active ? t('desactivar') : t('activar')}
        tono={cuenta.is_active ? 'peligro' : undefined}
        onConfirmar={alternarActiva}
      />
    </div>
  );
}

/**
 * Movimiento manual de la cuenta (comisión, GMF, rendimiento…): el de la
 * pantalla vieja de movimientos, con «Efecto en la cuenta». Una salida que deja
 * el banco en negativo se BLOQUEA (decisión del dueño). El saldo lo mueve el
 * disparador `trg_bank_tx_saldo`.
 */
function MovimientoManualDialogo({
  abierto,
  onAbiertoChange,
  cuenta,
  onHecho,
}: {
  abierto: boolean;
  onAbiertoChange: (a: boolean) => void;
  cuenta: BankAccount;
  onHecho: () => void;
}) {
  const t = useTranslations('finanzasTesoreriaR3.cuentaBancaria.manual');
  const { paraDocumento } = useMonedaOrganizacion();
  const { getToday, toInstant } = useFormatDate();
  const ctxMoneda = paraDocumento(cuenta.currency);
  const moneda = { formatear: (v: number) => formatMoneda(v, ctxMoneda) };
  const [sentido, setSentido] = useState<'entrada' | 'salida'>('entrada');
  const [monto, setMonto] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setSentido('entrada');
    setMonto(null);
    setDescripcion('');
    setReferencia('');
    setFecha(getToday());
    setError(null);
  }, [abierto, getToday]);

  const efecto = efectoEnCuenta({ saldo: Number(cuenta.balance), importe: monto, sentido, cuenta: 'banco' });

  const guardar = async () => {
    setError(null);
    if (!descripcion.trim()) return setError(t('errores.descripcion'));
    if (!monto || monto <= 0) return setError(t('errores.monto'));
    if (efecto.bloquea) return setError(t('errores.supera'));
    if (fecha && fecha > getToday()) return setError(t('errores.fechaFutura'));
    setGuardando(true);
    try {
      await BancosService.crearTransaccion({
        bank_account_id: cuenta.id,
        transaction_type: sentido === 'entrada' ? 'deposit' : 'withdrawal',
        amount: monto,
        description: descripcion.trim(),
        reference: referencia.trim() || undefined,
        trans_date: fecha && fecha !== getToday() ? toInstant(fecha, '12:00') : undefined,
      });
      toast.success(t('exito'));
      onHecho();
    } catch {
      setError(t('errores.guardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !guardando && onAbiertoChange(a)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={880}
      primario={{ etiqueta: t('registrar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: efecto.bloquea, motivo: efecto.bloquea ? t('errores.supera') : undefined }}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <SegmentedControl<'entrada' | 'salida'>
            etiqueta={t('sentido')}
            valor={sentido}
            onValorChange={setSentido}
            anchoCompleto
            opciones={[
              { valor: 'entrada', etiqueta: t('entrada') },
              { valor: 'salida', etiqueta: t('salida') },
            ]}
          />
          <FormField etiqueta={t('concepto')} obligatorio>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={t('conceptoEjemplo')} maxLength={200} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('monto')} obligatorio>
              {(c) => <CampoNumero id={c.id} valor={monto} onValorChange={setMonto} minimo={0} alinear="derecha" />}
            </FormField>
            <FormField etiqueta={t('fecha')} obligatorio>
              {(c) => <CampoFecha id={c.id} valor={fecha} onValorChange={setFecha} limpiable={false} aria-labelledby={c.idEtiqueta} />}
            </FormField>
          </div>
          <FormField etiqueta={t('referencia')}>
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} />
          </FormField>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {error}
            </p>
          )}
        </div>
        <EfectoEnCuentaTarjeta cuenta={cuenta.name} efecto={efecto} formatear={moneda.formatear} nota={t('asientoNota')} />
      </div>
    </Dialogo>
  );
}
