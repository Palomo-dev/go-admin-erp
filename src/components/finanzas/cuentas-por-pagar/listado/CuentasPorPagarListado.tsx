'use client';

/**
 * Listado de cuentas por pagar (plan FACTURAS-COMPRA-CXP F8).
 *
 * - Filtrado, ordenado y paginado en la base (`fn_cxp_listado`, RLS de la
 *   sesión) con el estado en la URL; KPIs y banda de antigüedad de
 *   `fn_cxp_resumen`, con el día de la organización.
 * - Las CxP nacen al confirmar la factura (D2): las de borradores de los
 *   caminos viejos no salen salvo que se pidan (dato histórico, §5.3).
 * - Pagar abre el diálogo único de pago (dirección `pago`); programar deja una
 *   solicitud en `ap_payment_schedules` que aprueba otra persona (D3/D7).
 * - «Exportar a banca» reutiliza `ExportarBancaModal` con la selección.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Download, Eye, FileText, Landmark, ReceiptText, ScrollText, ShieldCheck, Wallet } from 'lucide-react';
import {
  AccionRapida,
  BranchBadgeActiva,
  BulkActionBar,
  ChipDocumento,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  KpiCompacto,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  StatusBadge,
  SupplierPicker,
  clasesBoton,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type ListadoServidor,
  type ProveedorPicker,
  BandaAntiguedad,
  TRAMOS_ANTIGUEDAD,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import {
  buscarProveedores,
  listarCxp,
  listarProgramacionesPendientes,
  resumenCxp,
  type FilaCxp,
  type FiltrosCxp,
  type ResumenCxp,
} from '@/lib/services/compras/lecturasCompras';
import { RUTA_COMPRAS_FINANZAS, RUTA_CXP } from '@/components/finanzas/facturas-compra/rutasCompras';
import { RegistrarPagoProveedor } from '../RegistrarPagoProveedor';
import { ProgramarPagoDialog } from '../ProgramarPagoDialog';
import { ExportarBancaModal } from '../ExportarBancaModal';
import { AprobacionesPanel, type ProgramacionPanel } from '../AprobacionesPanel';
import { EstadoCuentaProveedorDialog } from '../EstadoCuentaProveedorDialog';

const ESTADOS = ['pendiente', 'parcial', 'vencida', 'pagada', 'anulada'] as const;
const ID_RE = /^\d+$/;
/**
 * Tamaños de página del listado (Figma «Mostrando 1–25»). Van a
 * `useListadoServidor` y a `Pagination`: la lista por defecto del kit es
 * [10, 20, 50, 100] y un `tamanoPorDefecto` fuera de ella se cambia en silencio
 * por el primero (10). Lo fija src/__tests__/finanzas/compras/paginacionListados.test.ts.
 */
const TAMANOS_PAGINA_CXP = [25, 50, 100] as const;

/** Proveedor del buscador (o de la fila) en la forma del `SupplierPicker`. */
function aProveedorPicker(p: { id: number; name: string; nit: string | null; dv?: string | null; contact?: string | null; phone?: string | null }): ProveedorPicker {
  return {
    id: String(p.id),
    nombre: p.name,
    nit: p.nit ? `NIT ${p.nit}${p.dv ? `-${p.dv}` : ''}` : null,
    contacto: p.contact ?? null,
    telefono: p.phone ?? null,
  };
}

const TONO_TRAMO = { al_dia: 'exito', d1_30: 'advertencia' } as const;

function filtrosServidor(l: ListadoServidor, branch: number | null): Omit<FiltrosCxp, 'offset' | 'limite'> {
  const f = l.filtros;
  return {
    busqueda: l.busqueda || null,
    estado: (ESTADOS as readonly string[]).includes(f.estado ?? '') ? f.estado : null,
    tramo: (TRAMOS_ANTIGUEDAD as readonly string[]).includes(f.tramo ?? '') ? f.tramo : null,
    proveedor: ID_RE.test(f.proveedor ?? '') ? Number(f.proveedor) : null,
    branch,
    orden: l.orden?.campo ?? 'vencimiento',
    direccion: l.orden?.direccion ?? 'asc',
  };
}

export default function CuentasPorPagarListado() {
  const router = useRouter();
  const t = useTranslations('cuentasPorPagar');
  const entero = useFormatoEntero();
  const moneda = useMonedaOrganizacion();
  const permisos = usePermisosFinanzas();
  const { formatDate, getToday } = useFormatDate();
  const { branchFilter } = useBranch();
  const formatearBase = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const formatear = useCallback(
    (valor: number, codigo?: string | null) => crearFormateadorMoneda(moneda.paraDocumento(codigo))(valor),
    [moneda],
  );
  // El género va en los mensajes: «cuenta» es femenino en es/pt y «compte», masculino en fr.
  const sustantivo = {
    singular: t('sustantivo.singular'),
    plural: t('sustantivo.plural'),
    genero: t('sustantivo.genero') === 'femenino' ? ('femenino' as const) : ('masculino' as const),
  };

  const l = useListadoServidor({
    filtros: ['estado', 'tramo', 'proveedor'],
    camposOrden: ['vencimiento', 'saldo', 'monto', 'proveedor'],
    ordenPorDefecto: { campo: 'vencimiento', direccion: 'asc' },
    tamanoPorDefecto: 25,
    tamanosPermitidos: TAMANOS_PAGINA_CXP,
  });

  const [filas, setFilas] = useState<FilaCxp[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [resumen, setResumen] = useState<ResumenCxp | null>(null);
  const [aprobaciones, setAprobaciones] = useState<ProgramacionPanel[]>([]);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [pagando, setPagando] = useState<FilaCxp | null>(null);
  const [programando, setProgramando] = useState<FilaCxp | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState<FilaCxp | null>(null);
  const [banca, setBanca] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [proveedorElegido, setProveedorElegido] = useState<ProveedorPicker | null>(null);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const filtros = filtrosServidor(l, branchFilter ?? null);
  const claveConsulta = JSON.stringify({ ...filtros, offset: l.rango.desde, limite: l.tamano });

  useEffect(() => {
    let cancelado = false;
    const consulta = JSON.parse(claveConsulta) as FiltrosCxp;
    setCargando(true);
    setError(false);
    listarCxp(getOrganizationId(), consulta)
      .then((r) => {
        if (cancelado) return;
        setFilas(r.items);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        console.error('Error cargando cuentas por pagar:', e);
        setError(true);
      })
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [claveConsulta, recarga]);

  useEffect(() => {
    let cancelado = false;
    const org = getOrganizationId();
    resumenCxp(org, branchFilter ?? null)
      .then((r) => !cancelado && setResumen(r))
      .catch(() => !cancelado && setResumen(null));
    listarProgramacionesPendientes(org)
      .then((r) => !cancelado && setAprobaciones(r))
      .catch(() => !cancelado && setAprobaciones([]));
    return () => {
      cancelado = true;
    };
  }, [branchFilter, recarga]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const exportarCsv = async (soloSeleccion: boolean) => {
    setExportando(true);
    try {
      const todas: FilaCxp[] = [];
      for (let offset = 0; offset < 5000; offset += 200) {
        const r = await listarCxp(getOrganizationId(), { ...filtros, offset, limite: 200 });
        todas.push(...r.items);
        if (r.items.length < 200) break;
      }
      const elegidas = soloSeleccion ? todas.filter((f) => seleccion.has(f.id)) : todas;
      if (elegidas.length === 0) {
        toastError(t('listado.exportar.sinDatos'));
        return;
      }
      const cab = ['proveedor', 'nit', 'factura', 'vence', 'moneda', 'monto', 'saldo', 'estado', 'dias'].map((c) => t(`listado.exportar.columnas.${c}`));
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lineas = elegidas.map((f) =>
        [f.supplier_name, f.supplier_nit ?? '', f.number_ext ?? '', formatDate(f.due_date), f.currency ?? moneda.code, f.amount, f.balance, t(`estado.${f.estado}`), f.dias_vencida ?? '']
          .map(esc)
          .join(','),
      );
      const url = URL.createObjectURL(new Blob(['﻿' + [cab.map(esc).join(','), ...lineas].join('\n')], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t('listado.exportar.archivo')}_${getToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess(t('listado.exportar.listo', { n: entero(elegidas.length) }));
    } catch (e) {
      console.error('Error exportando cuentas por pagar:', e);
      toastError(t('listado.exportar.error'));
    } finally {
      setExportando(false);
    }
  };

  const abierta = (f: FilaCxp) => f.estado !== 'pagada' && f.estado !== 'anulada' && f.balance > 0;

  const buscarProveedor = useCallback(
    async (texto: string, senal: AbortSignal) => (await buscarProveedores(getOrganizationId(), texto, senal)).map(aProveedorPicker),
    [],
  );
  // En la URL solo va el id: el nombre sale de lo elegido o de las filas ya filtradas por ese proveedor.
  const idProveedor = ID_RE.test(l.filtros.proveedor ?? '') ? l.filtros.proveedor : null;
  const filaProveedor = idProveedor ? filas.find((f) => String(f.supplier_id) === idProveedor) : undefined;
  const proveedorFiltro: ProveedorPicker | null = !idProveedor
    ? null
    : proveedorElegido?.id === idProveedor
      ? proveedorElegido
      : filaProveedor
        ? aProveedorPicker({ id: filaProveedor.supplier_id, name: filaProveedor.supplier_name, nit: filaProveedor.supplier_nit, phone: filaProveedor.supplier_phone })
        : { id: idProveedor, nombre: t('listado.filtros.proveedor') };

  const accionesDe = (f: FilaCxp): AccionFila[] => [
    { id: 'ver', etiqueta: t('listado.acciones.ver'), icono: Eye, onSelect: () => router.push(`${RUTA_CXP}/${f.id}`) },
    {
      id: 'pagar',
      etiqueta: t('listado.acciones.pagar'),
      icono: Wallet,
      onSelect: () => setPagando(f),
      deshabilitada: !abierta(f) || !permisos.crear,
      motivo: !permisos.crear ? t('listado.motivos.sinPermiso') : t('listado.motivos.sinSaldo'),
    },
    {
      id: 'programar',
      etiqueta: t('listado.acciones.programar'),
      icono: CalendarClock,
      onSelect: () => setProgramando(f),
      deshabilitada: !abierta(f) || !permisos.crear,
      motivo: !permisos.crear ? t('listado.motivos.sinPermiso') : t('listado.motivos.sinSaldo'),
    },
    { id: 'estadoCuenta', etiqueta: t('listado.acciones.estadoCuenta'), icono: ScrollText, onSelect: () => setEstadoCuenta(f) },
    {
      id: 'factura',
      etiqueta: t('listado.acciones.factura'),
      icono: ReceiptText,
      onSelect: () => router.push(`${RUTA_COMPRAS_FINANZAS}/${f.invoice_id}`),
      oculta: !f.invoice_id,
      separadorAntes: true,
    },
  ];

  const chips: ChipFiltro[] = [
    l.filtros.estado ? { clave: 'estado', etiqueta: t(`estado.${l.filtros.estado}` as never) } : null,
    l.filtros.tramo ? { clave: 'tramo', etiqueta: t(`antiguedad.tramos.${l.filtros.tramo}` as never) } : null,
    proveedorFiltro ? { clave: 'proveedor', etiqueta: t('listado.chips.proveedor', { nombre: proveedorFiltro.nombre }) } : null,
  ].filter((c): c is ChipFiltro => !!c);

  const etiquetaEstado = (f: FilaCxp) =>
    f.estado === 'vencida' && f.dias_vencida ? t('estadoVencida', { dias: f.dias_vencida }) : t(`estado.${f.estado}`);
  const estadoBadge = (f: FilaCxp) => (f.estado === 'vencida' && f.dias_vencida ? `vencida ${f.dias_vencida} d` : f.estado);

  const columnas: ColumnaTabla<FilaCxp>[] = [
    {
      id: 'proveedor',
      encabezado: t('listado.columnas.proveedor'),
      ordenable: true,
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.supplier_name}</span>
          {f.supplier_nit && <span className="truncate text-xs text-fg-secondary">{f.supplier_nit}</span>}
        </div>
      ),
    },
    {
      // Documento de origen (patrón Y2): la factura si existe; si no, la orden de compra.
      id: 'documento',
      encabezado: t('listado.columnas.documento'),
      ocultarDebajo: 'lg',
      celda: (f) =>
        f.invoice_id && f.number_ext ? (
          <ChipDocumento tipo="facturaCompra" numero={f.number_ext} href={`${RUTA_COMPRAS_FINANZAS}/${f.invoice_id}`} anulado={f.invoice_status === 'void'} />
        ) : f.po_id ? (
          <ChipDocumento tipo="ordenCompra" numero={`OC-${f.po_id}`} />
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      id: 'vencimiento',
      encabezado: t('listado.columnas.vence'),
      ordenable: true,
      celda: (f) => (
        <div className="flex flex-col">
          <span className="whitespace-nowrap tabular-nums">{formatDate(f.due_date)}</span>
          {f.dias_vencida !== null && f.dias_vencida > 0 && <span className="text-xs text-danger-text">{t('listado.vencidaHace', { dias: entero(f.dias_vencida) })}</span>}
        </div>
      ),
    },
    {
      id: 'antiguedad',
      encabezado: t('listado.columnas.antiguedad'),
      ocultarDebajo: 'xl',
      celda: (f) =>
        f.tramo ? (
          <Badge tono={f.tramo === 'al_dia' || f.tramo === 'd1_30' ? TONO_TRAMO[f.tramo] : 'peligro'} tamano="sm">
            {t(`antiguedad.tramos.${f.tramo}`)}
          </Badge>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    { id: 'monto', encabezado: t('listado.columnas.monto'), variante: 'importe', ordenable: true, ocultarDebajo: 'lg', celda: (f) => formatear(f.amount, f.currency) },
    { id: 'saldo', encabezado: t('listado.columnas.saldo'), variante: 'importe', ordenable: true, celda: (f) => formatear(f.balance, f.currency) },
    {
      id: 'cuotas',
      encabezado: t('listado.columnas.cuotas'),
      ocultarDebajo: 'xl',
      celda: (f) =>
        f.cuotas > 0 ? (
          <span className="tabular-nums">{t('listado.cuotasDe', { pagadas: f.cuotas_pagadas, total: f.cuotas })}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      id: 'estado',
      encabezado: t('listado.columnas.estado'),
      celda: (f) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge estado={estadoBadge(f)} etiqueta={etiquetaEstado(f)} />
          {f.programado > 0 && <span className="text-xs text-warning-text">{t('listado.programado', { monto: formatear(f.programado, f.currency) })}</span>}
        </div>
      ),
    },
  ];

  const estadoTabla = cargando ? 'cargando' : error ? 'error' : filas.length === 0 && l.hayCriterios ? 'sinResultados' : 'listo';
  const pendientesAprobar = aprobaciones.filter((p) => p.status === 'pending').length;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('listado.subtitulo', { n: entero(total) })}
        icono={ClipboardList}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            {pendientesAprobar > 0 && (
              <Link href="#aprobaciones" className={clasesBoton({ variante: 'secundario' })}>
                <ShieldCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('listado.aprobaciones', { n: pendientesAprobar })}
              </Link>
            )}
            <Link href={RUTA_COMPRAS_FINANZAS} className={clasesBoton({ variante: 'secundario' })}>
              <ReceiptText aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('listado.facturas')}
            </Link>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[{ id: 'csv', etiqueta: t('listado.exportar.csv'), icono: FileText, onSelect: () => void exportarCsv(false), deshabilitada: exportando, motivo: t('listado.exportar.exportando') }]}
            />
          </>
        }
        movil={{ subtitulo: t('listado.subtitulo', { n: entero(total) }) }}
      />

      <KpiStrip etiqueta={t('listado.kpis.etiqueta')} className="hidden sm:grid">
        <StatCard
          etiqueta={t('listado.kpis.porPagar')}
          icono={Wallet}
          cargando={!resumen}
          valor={formatearBase(resumen?.total_por_pagar ?? 0)}
          detalle={resumen ? t('listado.kpis.cuentas', { n: entero(resumen.cuentas) }) : undefined}
        />
        <StatCard
          etiqueta={t('listado.kpis.vencido')}
          icono={AlertTriangle}
          cargando={!resumen}
          valor={formatearBase(resumen?.vencida ?? 0)}
          tono={resumen && resumen.vencidas > 0 ? 'peligro' : 'neutro'}
          detalle={resumen ? t('listado.kpis.cuentas', { n: entero(resumen.vencidas) }) : undefined}
          onClick={() => l.setFiltro('estado', 'vencida')}
        />
        <StatCard
          etiqueta={t('listado.kpis.alDia')}
          icono={CheckCircle2}
          cargando={!resumen}
          valor={formatearBase(resumen?.al_dia ?? 0)}
          detalle={resumen?.proximo_vencimiento ? t('listado.kpis.proximo', { fecha: formatDate(resumen.proximo_vencimiento) }) : undefined}
        />
        <StatCard
          etiqueta={t('listado.kpis.aprobaciones')}
          icono={ShieldCheck}
          cargando={!resumen}
          valor={resumen ? entero(resumen.aprobaciones_pendientes) : '—'}
          tono={resumen && resumen.aprobaciones_pendientes > 0 ? 'advertencia' : 'neutro'}
          href={resumen && resumen.aprobaciones_pendientes > 0 ? '#aprobaciones' : undefined}
        />
      </KpiStrip>

      {/* Móvil: una franja de cifras en lugar de las cuatro tarjetas (Figma KpiCompacto, patrón Y6). */}
      <KpiCompacto
        className="sm:hidden"
        etiqueta={t('listado.kpis.etiqueta')}
        cargando={!resumen}
        cifras={[
          { id: 'porPagar', etiqueta: t('listado.kpis.porPagar'), valor: formatearBase(resumen?.total_por_pagar ?? 0) },
          {
            id: 'vencido',
            etiqueta: t('listado.kpis.vencido'),
            valor: formatearBase(resumen?.vencida ?? 0),
            tono: resumen && resumen.vencidas > 0 ? 'peligro' : 'neutro',
            onClick: () => l.setFiltro('estado', 'vencida'),
          },
          {
            id: 'aprobaciones',
            etiqueta: t('listado.kpis.aprobaciones'),
            valor: resumen ? entero(resumen.aprobaciones_pendientes) : '—',
            tono: resumen && resumen.aprobaciones_pendientes > 0 ? 'advertencia' : 'neutro',
            href: resumen && resumen.aprobaciones_pendientes > 0 ? '#aprobaciones' : undefined,
          },
        ]}
      />

      <BandaAntiguedad tramos={resumen?.tramos ?? null} formatear={formatearBase} seleccionado={l.filtros.tramo ?? null} onSeleccionar={(k) => l.setFiltro('tramo', k)} />

      <AprobacionesPanel id="aprobaciones" programaciones={aprobaciones} moneda={moneda} puedeAprobar={permisos.aprobar} onCambio={recargar} />

      <ListToolbar
        busqueda={
          <SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('listado.buscar.placeholder')} etiqueta={t('listado.buscar.etiqueta')} />
        }
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={t('listado.filtros.verN', { n: entero(total) })}>
            <FormField etiqueta={t('listado.filtros.estado')}>
              {(c) => (
                <Select value={l.filtros.estado ?? 'todos'} onValueChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    {ESTADOS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`estado.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.antiguedad')}>
              {(c) => (
                <Select value={l.filtros.tramo ?? 'todos'} onValueChange={(v) => l.setFiltro('tramo', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    {TRAMOS_ANTIGUEDAD.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`antiguedad.tramos.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <SupplierPicker
              layout="campo"
              proveedor={proveedorFiltro}
              etiqueta={t('listado.filtros.proveedor')}
              buscar={buscarProveedor}
              onCambiar={(p) => {
                setProveedorElegido(p);
                l.setFiltro('proveedor', p.id);
              }}
              onQuitar={() => {
                setProveedorElegido(null);
                l.setFiltro('proveedor', null);
              }}
            />
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={(f) => router.push(`${RUTA_CXP}/${f.id}`)}
        etiquetaFila={(f) => t('listado.etiquetaFila', { proveedor: f.supplier_name, saldo: formatear(f.balance, f.currency) })}
        acciones={accionesDe}
        accionesRapidas={(f) => {
          const motivo = !permisos.crear ? t('listado.motivos.sinPermiso') : t('listado.motivos.sinSaldo');
          const deshabilitada = !abierta(f) || !permisos.crear;
          return (
            <>
              <AccionRapida
                soloIcono
                icono={Wallet}
                etiqueta={t('listado.pagarA', { proveedor: f.supplier_name })}
                onClick={() => setPagando(f)}
                deshabilitada={deshabilitada}
                motivo={motivo}
              />
              <AccionRapida
                soloIcono
                icono={CalendarClock}
                etiqueta={t('listado.programarA', { proveedor: f.supplier_name })}
                onClick={() => setProgramando(f)}
                deshabilitada={deshabilitada}
                motivo={motivo}
              />
            </>
          );
        }}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={ClipboardList}
            titulo={f.supplier_name}
            subtitulo={f.number_ext ? t('listado.factura', { numero: f.number_ext }) : undefined}
            meta={
              <span className={f.dias_vencida && f.dias_vencida > 0 ? 'text-danger-text' : undefined}>
                {f.dias_vencida && f.dias_vencida > 0 ? t('listado.vencidaHace', { dias: entero(f.dias_vencida) }) : t('listado.vence', { fecha: formatDate(f.due_date) })}
              </span>
            }
            valor={formatear(f.balance, f.currency)}
            estado={<StatusBadge estado={estadoBadge(f)} etiqueta={etiquetaEstado(f)} />}
            acciones={accionesDe(f)}
            onClick={() => router.push(`${RUTA_CXP}/${f.id}`)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
          />
        )}
        vacio={{ titulo: t('listado.vacio.titulo'), descripcion: t('listado.vacio.descripcion'), icono: ClipboardList, accion: { etiqueta: t('listado.facturas'), href: RUTA_COMPRAS_FINANZAS, icono: ReceiptText } }}
        sinResultados={{ descripcion: t('listado.sinResultados') }}
        error={{ titulo: t('listado.errorCarga') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={
          <Pagination
            pagina={l.pagina}
            tamano={l.tamano}
            total={total}
            onPaginaChange={l.setPagina}
            onTamanoChange={l.setTamano}
            opcionesTamano={TAMANOS_PAGINA_CXP}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        sustantivo={sustantivo}
        acciones={[
          { id: 'banca', etiqueta: t('listado.exportar.banca'), icono: Landmark, onClick: () => setBanca(true) },
          { id: 'csv', etiqueta: t('listado.exportar.seleccion'), icono: Download, onClick: () => void exportarCsv(true), cargando: exportando },
        ]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      {pagando && (
        <RegistrarPagoProveedor abierto onAbiertoChange={(v) => !v && setPagando(null)} documento="account_payable" id={pagando.id} origen="cxp" onRegistrado={recargar} />
      )}
      {programando && (
        <ProgramarPagoDialog
          abierto
          onAbiertoChange={(v) => !v && setProgramando(null)}
          cuentaId={programando.id}
          saldo={programando.balance}
          programado={programando.programado}
          moneda={moneda.paraDocumento(programando.currency)}
          hoy={getToday()}
          onProgramado={recargar}
        />
      )}
      {estadoCuenta && (
        <EstadoCuentaProveedorDialog
          abierto
          onAbiertoChange={(v) => !v && setEstadoCuenta(null)}
          proveedorId={estadoCuenta.supplier_id}
          proveedorNombre={estadoCuenta.supplier_name}
        />
      )}
      <ExportarBancaModal
        cuentasSeleccionadas={[...seleccion]}
        isOpen={banca}
        onClose={() => setBanca(false)}
        onExportado={() => {
          setBanca(false);
          setSeleccion(new Set());
          recargar();
        }}
      />
    </div>
  );
}
