'use client';

/**
 * Listado de facturas de compra (plan FACTURAS-COMPRA-CXP F4; Figma «Facturas
 * de compra — listo · cargando · vacío · error · filtros y menú» y móvil).
 *
 * Filtrado, ordenado y paginado en la base (`fn_facturas_compra_listado`, RLS
 * de la sesión) con el estado en la URL (`useListadoServidor`). El estado de
 * pago y el de recepción son DERIVADOS (§3.4); los días de mora, con el día de
 * la organización. Pagar abre el diálogo único de pago; la recepción y la
 * anulación se hacen en el detalle.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CalendarClock,
  Download,
  Eye,
  FileText,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';
import {
  AccionRapida,
  BranchBadgeActiva,
  BulkActionBar,
  ChipDocumento,
  DataTable,
  DateRangeButton,
  Dialogo,
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
  SegmentedControl,
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
} from '@/components/kit';
import { useEtiquetaRango, useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';
import {
  buscarProveedores,
  listarFacturasCompra,
  resumenFacturasCompra,
  type FilaFacturaCompra,
  type FiltrosFacturasCompra,
  type ResumenFacturasCompra,
} from '@/lib/services/compras/lecturasCompras';
import { RegistrarPagoProveedor } from '@/components/finanzas/cuentas-por-pagar/RegistrarPagoProveedor';
import { RUTA_PROVEEDORES, useBaseCompras } from '../rutasCompras';

const ESTADOS = ['borrador', 'pendiente', 'parcial', 'vencida', 'pagada', 'anulada'] as const;
const RECEPCIONES = ['por_recibir', 'recibido', 'no_aplica'] as const;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d+$/;
/**
 * Tamaños de página del listado (Figma «Mostrando 1–25»). Van a
 * `useListadoServidor` y a `Pagination`: la lista por defecto del kit es
 * [10, 20, 50, 100] y un `tamanoPorDefecto` fuera de ella se cambia en silencio
 * por el primero (10). Lo fija src/__tests__/finanzas/compras/paginacionListados.test.ts.
 */
const TAMANOS_PAGINA_COMPRAS = [25, 50, 100] as const;

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

function filtrosServidor(l: ListadoServidor, branch: number | null): Omit<FiltrosFacturasCompra, 'offset' | 'limite'> {
  const f = l.filtros;
  return {
    busqueda: l.busqueda || null,
    estado: (ESTADOS as readonly string[]).includes(f.estado ?? '') ? f.estado : null,
    recepcion: (RECEPCIONES as readonly string[]).includes(f.recepcion ?? '') ? f.recepcion : null,
    proveedor: ID_RE.test(f.proveedor ?? '') ? Number(f.proveedor) : null,
    desde: DIA_RE.test(f.desde ?? '') ? f.desde : null,
    hasta: DIA_RE.test(f.hasta ?? '') ? f.hasta : null,
    branch,
    orden: l.orden?.campo ?? 'fecha',
    direccion: l.orden?.direccion ?? 'desc',
  };
}

/** Estado visible: la mora lleva los días («Vencida 12 d»). */
function textoEstado(f: FilaFacturaCompra): string {
  if (f.estado_pago === 'vencida' && f.dias_vencida && f.dias_vencida > 0) return `vencida ${f.dias_vencida} d`;
  return f.estado_pago;
}

export default function FacturasCompraListado() {
  const router = useRouter();
  const base = useBaseCompras();
  const t = useTranslations('facturasCompra');
  const entero = useFormatoEntero();
  const moneda = useMonedaOrganizacion();
  const { formatDate, getToday } = useFormatDate();
  const { branchFilter } = useBranch();
  const formatearBase = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const formatear = useCallback(
    (valor: number, codigo?: string | null) => crearFormateadorMoneda(moneda.paraDocumento(codigo))(valor),
    [moneda],
  );
  const rangoLegible = useEtiquetaRango();
  // El género va en los mensajes: «factura» es femenino en es/fr/pt.
  const sustantivo = {
    singular: t('sustantivo.singular'),
    plural: t('sustantivo.plural'),
    genero: t('sustantivo.genero') === 'femenino' ? ('femenino' as const) : ('masculino' as const),
  };

  const l = useListadoServidor({
    filtros: ['estado', 'recepcion', 'desde', 'hasta', 'proveedor'],
    camposOrden: ['fecha', 'vencimiento', 'total', 'saldo', 'numero'],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
    tamanosPermitidos: TAMANOS_PAGINA_COMPRAS,
  });

  const [filas, setFilas] = useState<FilaFacturaCompra[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [resumen, setResumen] = useState<ResumenFacturasCompra | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [pagando, setPagando] = useState<FilaFacturaCompra | null>(null);
  const [exportando, setExportando] = useState(false);
  const [eliminando, setEliminando] = useState<FilaFacturaCompra | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [proveedorElegido, setProveedorElegido] = useState<ProveedorPicker | null>(null);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const filtros = filtrosServidor(l, branchFilter ?? null);
  const claveConsulta = JSON.stringify({ ...filtros, offset: l.rango.desde, limite: l.tamano });

  useEffect(() => {
    let cancelado = false;
    const consulta = JSON.parse(claveConsulta) as FiltrosFacturasCompra;
    setCargando(true);
    setError(false);
    listarFacturasCompra(getOrganizationId(), consulta)
      .then((r) => {
        if (cancelado) return;
        setFilas(r.items);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        console.error('Error cargando facturas de compra:', e);
        setError(true);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [claveConsulta, recarga]);

  useEffect(() => {
    let cancelado = false;
    resumenFacturasCompra(getOrganizationId(), branchFilter ?? null)
      .then((r) => !cancelado && setResumen(r))
      .catch(() => !cancelado && setResumen(null));
    return () => {
      cancelado = true;
    };
  }, [branchFilter, recarga]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  // ── Exportar CSV (todo lo filtrado o la selección) ───────────────────────
  const exportar = async (soloSeleccion: boolean) => {
    setExportando(true);
    try {
      const todas: FilaFacturaCompra[] = [];
      for (let offset = 0; offset < 5000; offset += 200) {
        const r = await listarFacturasCompra(getOrganizationId(), { ...filtros, offset, limite: 200 });
        todas.push(...r.items);
        if (r.items.length < 200) break;
      }
      const elegidas = soloSeleccion ? todas.filter((f) => seleccion.has(f.id)) : todas;
      if (elegidas.length === 0) {
        toastError(t('listado.exportar.sinDatos'));
        return;
      }
      const cab = ['numero', 'proveedor', 'nit', 'emitida', 'vence', 'moneda', 'total', 'neto', 'saldo', 'estado', 'recepcion'].map((c) =>
        t(`listado.exportar.columnas.${c}`),
      );
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lineas = elegidas.map((f) =>
        [
          f.number_ext,
          f.supplier_name,
          f.supplier_nit ?? '',
          formatDate(f.issue_date),
          formatDate(f.due_date),
          f.currency ?? moneda.code,
          f.total,
          f.neto,
          f.balance,
          t(`estadoPago.${f.estado_pago}`),
          t(`recepcion.${f.recepcion}`),
        ]
          .map(esc)
          .join(','),
      );
      const blob = new Blob(['﻿' + [cab.map(esc).join(','), ...lineas].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t('listado.exportar.archivo')}_${getToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess(t('listado.exportar.listo', { n: entero(elegidas.length) }));
    } catch (e) {
      console.error('Error exportando facturas de compra:', e);
      toastError(t('listado.exportar.error'));
    } finally {
      setExportando(false);
    }
  };

  // Se confirma con el diálogo del manual (PATRONES §8), no con el confirm del navegador.
  const eliminar = async (f: FilaFacturaCompra) => {
    setBorrando(true);
    try {
      await clienteCompras.eliminarBorrador(f.id);
      toastSuccess(t('listado.eliminada', { numero: f.number_ext }));
      recargar();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
      toastError(t.has(`errores.${codigo}`) ? t(`errores.${codigo}` as never) : t('errores.error_desconocido'));
    } finally {
      setBorrando(false);
      setEliminando(null);
    }
  };

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
        ? aProveedorPicker({ id: filaProveedor.supplier_id, name: filaProveedor.supplier_name, nit: filaProveedor.supplier_nit })
        : { id: idProveedor, nombre: t('listado.filtros.proveedor') };

  const accionesDe = (f: FilaFacturaCompra): AccionFila[] => {
    const abierta = f.status !== 'draft' && f.status !== 'void' && f.balance > 0;
    const acciones: AccionFila[] = [
      { id: 'ver', etiqueta: t('listado.acciones.ver'), icono: Eye, onSelect: () => router.push(`${base}/${f.id}`) },
      {
        id: 'pagar',
        etiqueta: t('listado.acciones.pagar'),
        icono: Wallet,
        onSelect: () => setPagando(f),
        deshabilitada: !abierta,
        motivo: f.status === 'draft' ? t('listado.motivos.borrador') : t('listado.motivos.sinSaldo'),
      },
      {
        id: 'recepcionar',
        etiqueta: t('listado.acciones.recepcionar'),
        icono: PackageCheck,
        onSelect: () => router.push(`${base}/${f.id}?accion=recepcionar`),
        deshabilitada: f.recepcion !== 'por_recibir' || f.status === 'draft' || f.status === 'void',
        motivo: f.status === 'draft' ? t('listado.motivos.borrador') : t('listado.motivos.yaRecibida'),
      },
      { id: 'pdf', etiqueta: t('listado.acciones.pdf'), icono: Printer, onSelect: () => abrirDocumento('factura-compra', f.id) },
    ];
    if (f.status === 'draft') {
      acciones.push(
        { id: 'editar', etiqueta: t('listado.acciones.editar'), icono: Pencil, onSelect: () => router.push(`${base}/${f.id}/editar`) },
        { id: 'eliminar', etiqueta: t('listado.acciones.eliminar'), icono: Trash2, onSelect: () => setEliminando(f), destructiva: true },
      );
    }
    return acciones;
  };

  /** «Emisión: 1 – 22 sep 2026» (no el `YYYY-MM-DD` crudo); con un solo extremo, «Emisión: 1 sep 2026 – …». */
  const etiquetaChipRango = (desde: string | undefined, hasta: string | undefined): string => {
    const d = desde && DIA_RE.test(desde) ? desde : null;
    const h = hasta && DIA_RE.test(hasta) ? hasta : null;
    if (d && h) return t('listado.chips.emision', { rango: rangoLegible({ desde: d, hasta: h }) });
    return t('listado.chips.rango', {
      desde: d ? rangoLegible({ desde: d, hasta: d }) : '…',
      hasta: h ? rangoLegible({ desde: h, hasta: h }) : '…',
    });
  };

  const chips: ChipFiltro[] = [
    l.filtros.estado ? { clave: 'estado', etiqueta: t(`estadoPago.${l.filtros.estado}` as never) } : null,
    l.filtros.recepcion ? { clave: 'recepcion', etiqueta: t(`recepcion.${l.filtros.recepcion}` as never) } : null,
    l.filtros.desde || l.filtros.hasta ? { clave: 'desde', etiqueta: etiquetaChipRango(l.filtros.desde, l.filtros.hasta) } : null,
    proveedorFiltro ? { clave: 'proveedor', etiqueta: t('listado.chips.proveedor', { nombre: proveedorFiltro.nombre }) } : null,
  ].filter((c): c is ChipFiltro => !!c);

  const columnas: ColumnaTabla<FilaFacturaCompra>[] = [
    {
      id: 'numero',
      encabezado: t('listado.columnas.numero'),
      ordenable: true,
      variante: 'mono',
      celda: (f) => <span className="whitespace-nowrap font-medium text-fg">{f.number_ext}</span>,
    },
    {
      id: 'proveedor',
      encabezado: t('listado.columnas.proveedor'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{f.supplier_name}</span>
          {f.supplier_nit && <span className="truncate text-xs text-fg-secondary">{f.supplier_nit}</span>}
        </div>
      ),
    },
    { id: 'fecha', encabezado: t('listado.columnas.emitida'), ordenable: true, ocultarDebajo: 'xl', celda: (f) => <span className="whitespace-nowrap tabular-nums">{formatDate(f.issue_date)}</span> },
    {
      id: 'vencimiento',
      encabezado: t('listado.columnas.vence'),
      ordenable: true,
      celda: (f) => (
        <div className="flex flex-col">
          <span className="whitespace-nowrap tabular-nums">{formatDate(f.due_date)}</span>
          {f.dias_vencida !== null && f.dias_vencida > 0 && (
            <span className="text-xs text-danger-text">{t('listado.vencidaHace', { dias: entero(f.dias_vencida) })}</span>
          )}
        </div>
      ),
    },
    {
      id: 'total',
      encabezado: t('listado.columnas.total'),
      variante: 'importe',
      ordenable: true,
      celda: (f) => (
        <div className="flex flex-col items-end">
          <span>{formatear(f.total, f.currency)}</span>
          <span className="text-xs text-fg-secondary">{f.currency ?? moneda.code}</span>
        </div>
      ),
    },
    { id: 'saldo', encabezado: t('listado.columnas.saldo'), variante: 'importe', ordenable: true, celda: (f) => formatear(f.balance, f.currency) },
    { id: 'recepcion', encabezado: t('listado.columnas.recepcion'), ocultarDebajo: 'lg', celda: (f) => <StatusBadge estado={f.recepcion} etiqueta={t(`recepcion.${f.recepcion}`)} /> },
    { id: 'estado', encabezado: t('listado.columnas.estado'), celda: (f) => <StatusBadge estado={textoEstado(f)} etiqueta={f.estado_pago === 'vencida' && f.dias_vencida ? t('estadoVencida', { dias: f.dias_vencida }) : t(`estadoPago.${f.estado_pago}`)} /> },
    {
      id: 'ds',
      encabezado: t('listado.columnas.documentoSoporte'),
      ocultarDebajo: 'xl',
      celda: (f) =>
        f.documento_soporte ? (
          <ChipDocumento tipo="documentoSoporte" numero={f.documento_soporte.referencia} href={`/app/finanzas/documentos-soporte/${f.documento_soporte.id}`} />
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
  ];

  const estadoTabla = cargando ? 'cargando' : error ? 'error' : filas.length === 0 && l.hayCriterios ? 'sinResultados' : 'listo';

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('listado.subtitulo', { n: entero(total) })}
        icono={ReceiptText}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <Link href={RUTA_PROVEEDORES} className={clasesBoton({ variante: 'secundario' })}>
              <Truck aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('listado.proveedores')}
            </Link>
            <Link href={`${base}/nuevo`} className={clasesBoton({ variante: 'primario' })}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('listado.nueva')}
            </Link>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[{ id: 'csv', etiqueta: t('listado.exportar.csv'), icono: FileText, onSelect: () => void exportar(false), deshabilitada: exportando, motivo: t('listado.exportar.exportando') }]}
            />
          </>
        }
        movil={{
          subtitulo: t('listado.subtitulo', { n: entero(total) }),
          accion: (
            <Link href={`${base}/nuevo`} aria-label={t('listado.nueva')} className={clasesBoton({ variante: 'fantasma', className: 'w-10 px-0 text-fg' })}>
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
          ),
        }}
      />

      <KpiStrip etiqueta={t('listado.kpis.etiqueta')} className="hidden sm:grid">
        <StatCard
          etiqueta={t('listado.kpis.porPagar')}
          icono={Wallet}
          cargando={!resumen}
          valor={formatearBase(resumen?.total_por_pagar ?? 0)}
          detalle={resumen ? t('listado.kpis.abiertas', { n: entero(resumen.abiertas) }) : undefined}
          onClick={() => l.setFiltro('estado', 'pendiente')}
        />
        <StatCard
          etiqueta={t('listado.kpis.vencidas')}
          icono={AlertTriangle}
          cargando={!resumen}
          valor={formatearBase(resumen?.vencidas_total ?? 0)}
          tono={resumen && resumen.vencidas > 0 ? 'peligro' : 'neutro'}
          detalle={resumen ? t('listado.kpis.nFacturas', { n: entero(resumen.vencidas) }) : undefined}
          onClick={() => l.setFiltro('estado', 'vencida')}
        />
        <StatCard
          etiqueta={t('listado.kpis.proximas')}
          icono={CalendarClock}
          cargando={!resumen}
          valor={resumen ? entero(resumen.proximas) : '—'}
          tono={resumen && resumen.criticas > 0 ? 'advertencia' : 'neutro'}
          detalle={resumen ? t('listado.kpis.criticas', { n: entero(resumen.criticas) }) : undefined}
        />
        <StatCard
          etiqueta={t('listado.kpis.porRecibir')}
          icono={PackageCheck}
          cargando={!resumen}
          valor={resumen ? entero(resumen.por_recibir) : '—'}
          tono={resumen && resumen.por_recibir > 0 ? 'advertencia' : 'neutro'}
          detalle={resumen ? t('listado.kpis.borradores', { n: entero(resumen.borradores) }) : undefined}
          onClick={() => l.setFiltro('recepcion', 'por_recibir')}
        />
      </KpiStrip>

      {/* Móvil: una franja de cifras en lugar de las cuatro tarjetas (Figma KpiCompacto, patrón Y6). */}
      <KpiCompacto
        className="sm:hidden"
        etiqueta={t('listado.kpis.etiqueta')}
        cargando={!resumen}
        cifras={[
          { id: 'porPagar', etiqueta: t('listado.kpis.porPagar'), valor: formatearBase(resumen?.total_por_pagar ?? 0), onClick: () => l.setFiltro('estado', 'pendiente') },
          {
            id: 'vencidas',
            etiqueta: t('listado.kpis.vencidas'),
            valor: formatearBase(resumen?.vencidas_total ?? 0),
            tono: resumen && resumen.vencidas > 0 ? 'peligro' : 'neutro',
            onClick: () => l.setFiltro('estado', 'vencida'),
          },
          {
            id: 'porRecibir',
            etiqueta: t('listado.kpis.porRecibir'),
            valor: resumen ? entero(resumen.por_recibir) : '—',
            tono: resumen && resumen.por_recibir > 0 ? 'advertencia' : 'neutro',
            onClick: () => l.setFiltro('recepcion', 'por_recibir'),
          },
        ]}
      />

      <ListToolbar
        busqueda={
          <SearchInput
            value={l.busqueda}
            onChange={l.setBusqueda}
            cargando={cargando}
            placeholder={t('listado.buscar.placeholder')}
            etiqueta={t('listado.buscar.etiqueta')}
          />
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
                        {t(`estadoPago.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.recepcion')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.recepcion ?? 'todas'}
                  onValorChange={(v) => l.setFiltro('recepcion', v === 'todas' ? null : v)}
                  opciones={[
                    { valor: 'todas', etiqueta: t('listado.filtros.todas') },
                    { valor: 'por_recibir', etiqueta: t('recepcion.por_recibir') },
                    { valor: 'recibido', etiqueta: t('recepcion.recibido') },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.emision')}>
              {() => (
                <DateRangeButton
                  hoy={getToday()}
                  etiqueta={t('listado.filtros.emision')}
                  valor={{ desde: l.filtros.desde ?? '', hasta: l.filtros.hasta ?? '' }}
                  onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde || '', hasta: r.hasta || '' } })}
                />
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
        chips={
          <FilterChips
            chips={chips}
            onQuitar={(c) => (c === 'desde' ? l.actualizar({ filtros: { ...l.filtros, desde: '', hasta: '' } }) : l.setFiltro(c, null))}
            onLimpiarTodo={l.limpiarFiltros}
          />
        }
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
        onFilaClick={(f) => router.push(`${base}/${f.id}`)}
        etiquetaFila={(f) => t('listado.etiquetaFila', { numero: f.number_ext, proveedor: f.supplier_name })}
        acciones={accionesDe}
        accionesRapidas={(f) => (
          <>
            <AccionRapida
              soloIcono
              icono={Wallet}
              etiqueta={t('listado.pagarA', { numero: f.number_ext })}
              onClick={() => setPagando(f)}
              deshabilitada={f.status === 'draft' || f.status === 'void' || f.balance <= 0}
              motivo={f.status === 'draft' ? t('listado.motivos.borrador') : t('listado.motivos.sinSaldo')}
            />
            <AccionRapida soloIcono icono={Printer} etiqueta={t('listado.imprimirA', { numero: f.number_ext })} onClick={() => imprimirDocumento('factura-compra', f.id)} />
          </>
        )}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={ReceiptText}
            titulo={f.number_ext}
            subtitulo={f.supplier_name}
            meta={
              <span className={f.dias_vencida && f.dias_vencida > 0 ? 'text-danger-text' : undefined}>
                {f.dias_vencida && f.dias_vencida > 0 ? t('listado.vencidaHace', { dias: entero(f.dias_vencida) }) : t('listado.vence', { fecha: formatDate(f.due_date) })}
              </span>
            }
            valor={formatear(f.balance > 0 ? f.balance : f.total, f.currency)}
            estado={<StatusBadge estado={textoEstado(f)} etiqueta={t(`estadoPago.${f.estado_pago}`)} />}
            acciones={accionesDe(f)}
            onClick={() => router.push(`${base}/${f.id}`)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
          />
        )}
        vacio={{
          titulo: t('listado.vacio.titulo'),
          descripcion: t('listado.vacio.descripcion'),
          icono: ReceiptText,
          accion: { etiqueta: t('listado.nueva'), href: `${base}/nuevo`, icono: Plus },
        }}
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
            opcionesTamano={TAMANOS_PAGINA_COMPRAS}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        sustantivo={sustantivo}
        acciones={[{ id: 'exportar', etiqueta: t('listado.exportar.seleccion'), icono: Download, onClick: () => void exportar(true), cargando: exportando }]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      {eliminando && (
        <Dialogo
          abierto
          onAbiertoChange={(v) => !v && !borrando && setEliminando(null)}
          titulo={t('listado.eliminarTitulo', { numero: eliminando.number_ext })}
          descripcion={t('listado.eliminarDescripcion')}
          ancho={440}
          primario={{ etiqueta: t('listado.acciones.eliminar'), onClick: () => void eliminar(eliminando), destructiva: true, cargando: borrando }}
        />
      )}

      {pagando && (
        <RegistrarPagoProveedor
          abierto={!!pagando}
          onAbiertoChange={(v) => !v && setPagando(null)}
          documento="invoice_purchase"
          id={pagando.id}
          origen="factura_compra"
          onRegistrado={recargar}
        />
      )}
    </div>
  );
}
