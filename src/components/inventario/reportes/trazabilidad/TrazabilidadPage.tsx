'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, FileText, GitBranch, Layers, RefreshCw, ScanBarcode, ScanLine } from 'lucide-react';
import {
  BranchBadgeActiva,
  DataTable,
  EmptyState,
  KpiStrip,
  PageHeader,
  PaginationCompact,
  RowActionsMenu,
  SearchInput,
  StatCard,
  Tarjeta,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { filasACsv } from '@/lib/utils/csv';
import { ErrorPeticionSeriales, clienteTrazabilidad } from '@/lib/services/seriales/cliente';
import type {
  DocumentoSerial,
  MovimientoDocumento,
  PasoLote,
  ResultadoTrazabilidad,
  TrazabilidadDocumento,
  TrazabilidadLote,
  TrazabilidadSerial,
  VentaLote,
} from '@/lib/services/seriales/contrato';
import { diasEntre } from '@/components/inventario/productos/logica/seriales';
import { BadgeEstadoSerial, EnlaceDocumento, HistorialSerial, ICONO_DOCUMENTO_SERIAL, useEtiquetaDocumento } from '@/components/inventario/seriales/piezas';
import { documentoReclamo, numeroDocumento, rutaCliente, rutaDocumento, rutaProducto, rutaSerial, situacionGarantia } from '@/components/inventario/seriales/logica';
import { agregarReciente, estadoVencimientoLote, leerRecientes, tipoCodigoProbable } from './logica';

const VENTAS_POR_PAGINA = 5;

/**
 * Trazabilidad (Figma «Existencias — Trazabilidad» 594:126324): se escribe o
 * escanea un lote, un serial o un documento y se ve de dónde vino, por dónde
 * pasó y a quién llegó. Todo sale de `fn_trazabilidad` por
 * `GET /api/inventario/trazabilidad`; el código buscado vive en la URL
 * (`?codigo=`) para poder compartir el enlace.
 */
export function TrazabilidadPage() {
  const t = useTranslations('inventarioTrazabilidad');
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const { toast } = useToast();
  const { getToday } = useFormatDate();
  const { formatDate, formatDateTime, formatPlain } = useFormatDate();
  const { branchFilter, branches, isLoading: cargandoSucursales } = useBranch();
  const entero = useFormatoEntero();
  const { formatear } = useMonedaOrganizacion();
  const etiquetaDocumento = useEtiquetaDocumento();

  const codigo = (params?.get('codigo') ?? '').trim();
  const [resultado, setResultado] = useState<ResultadoTrazabilidad | null>(null);
  const [estado, setEstado] = useState<'inicial' | 'cargando' | 'listo' | 'error' | 'sinPermiso'>(codigo ? 'cargando' : 'inicial');
  const [paginaVentas, setPaginaVentas] = useState(1);
  const [recarga, setRecarga] = useState(0);
  const [recientes, setRecientes] = useState<string[]>([]);
  const entrada = useRef<HTMLInputElement>(null);
  const sinSucursal = !cargandoSucursales && branches.length === 0;
  const org = getOrganizationId();

  useEffect(() => setRecientes(leerRecientes(org)), [org]);
  useEffect(() => setPaginaVentas(1), [codigo, branchFilter]);

  const buscar = useCallback(
    (texto: string) => {
      const limpio = texto.trim();
      const p = new URLSearchParams(params?.toString() ?? '');
      if (limpio) p.set('codigo', limpio);
      else p.delete('codigo');
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (!codigo || sinSucursal || cargandoSucursales) {
      if (!codigo) {
        setResultado(null);
        setEstado('inicial');
      }
      return;
    }
    const control = new AbortController();
    setEstado((e) => (e === 'listo' && resultado?.codigo === codigo ? 'listo' : 'cargando'));
    clienteTrazabilidad
      .buscar(
        { codigo, sucursal: branchFilter ?? undefined, desde: (paginaVentas - 1) * VENTAS_POR_PAGINA, limite: VENTAS_POR_PAGINA },
        control.signal,
      )
      .then((r) => {
        setResultado(r);
        setEstado('listo');
        if (r.tipo !== 'ninguno') setRecientes(agregarReciente(org, codigo));
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (e instanceof ErrorPeticionSeriales && e.sinPermiso) setEstado('sinPermiso');
        else {
          console.error('Error en la trazabilidad:', e);
          setEstado('error');
        }
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, branchFilter, paginaVentas, recarga, sinSucursal, cargandoSucursales, org]);

  const recargar = () => setRecarga((n) => n + 1);

  // ── Exportar lo que se está viendo ───────────────────────────────────────
  const descargar = (cabecera: string[], filas: (string | number | null)[][], nombreClientes?: string) => {
    const csv = filasACsv(cabecera, filas);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    if (nombreClientes) link.download = nombreClientes;
    else link.download = `trazabilidad_${getToday()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportar = async (soloClientes = false) => {
    if (!resultado || resultado.tipo === 'ninguno') return;
    try {
      if (resultado.tipo === 'lote') {
        const todo = await clienteTrazabilidad.buscar({ codigo, sucursal: branchFilter ?? undefined, desde: 0, limite: 5000 });
        const ventas = todo.tipo === 'lote' ? todo.ventas.filas : [];
        const filas = ventas.map((v) => [formatDateTime(v.fecha), v.documento ? numeroDocumento(v.documento) : null, v.cliente?.nombre ?? null, v.sucursal, v.cantidad]);
        const cabecera = [t('csv.fecha'), t('csv.documento'), t('csv.cliente'), t('csv.sucursal'), t('csv.cantidad')];
        descargar(cabecera, filas, soloClientes ? `clientes_lote_${resultado.lote.codigo}_${getToday()}.csv` : undefined);
      } else if (resultado.tipo === 'serial') {
        descargar(
          [t('csv.fecha'), t('csv.evento'), t('csv.documento'), t('csv.sucursal'), t('csv.cliente')],
          resultado.serial.eventos.map((e) => [formatDateTime(e.fecha), e.tipo, e.documento ? numeroDocumento(e.documento) : null, e.a_sucursal ?? e.de_sucursal, e.cliente?.nombre ?? null]),
        );
      } else {
        descargar(
          [t('csv.fecha'), t('csv.producto'), t('csv.lote'), t('csv.cantidad'), t('csv.sucursal')],
          resultado.movimientos.map((m) => [formatDateTime(m.fecha), m.producto.nombre, m.lote, m.direccion === 'out' ? -m.cantidad : m.cantidad, m.sucursal]),
        );
      }
    } catch (e) {
      console.error('Error exportando la trazabilidad:', e);
      toast({ variant: 'destructive', title: t('exportar.error') });
    }
  };

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={t('subtitulo')}
      icono={GitBranch}
      cargando={estado === 'cargando'}
      migas={[{ etiqueta: t('migas.inventario'), href: '/app/inventario' }, { etiqueta: t('migas.informes') }]}
      debajo={<BranchBadgeActiva />}
      acciones={
        <>
          <Button variant="outline" size="icon" className="size-10" onClick={recargar} disabled={!codigo} aria-label={t('actualizar')} title={t('actualizar')}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </Button>
          <Button variant="outline" className="h-10 gap-2" onClick={() => void exportar()} disabled={!resultado || resultado.tipo === 'ninguno'}>
            <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('exportar.boton')}
          </Button>
        </>
      }
      movil={{
        subtitulo: codigo ? t(`movil.${resultado?.tipo === 'lote' ? 'lote' : resultado?.tipo === 'serial' ? 'serial' : 'codigo'}`, { codigo }) : undefined,
        accion: resultado && resultado.tipo !== 'ninguno' ? (
          <RowActionsMenu orientacion="horizontal" titulo={t('titulo')} acciones={[{ id: 'exportar', etiqueta: t('exportar.boton'), icono: Download, onSelect: () => void exportar() }]} />
        ) : undefined,
      }}
    />
  );

  if (sinSucursal) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        <EmptyState variante="sinSucursal" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      <SearchInput
        ref={entrada}
        value={codigo}
        onChange={buscar}
        debounceMs={600}
        cargando={estado === 'cargando'}
        placeholder={t('buscar.placeholder')}
        etiqueta={t('buscar.etiqueta')}
        accesorio={<ScanLine aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />}
      />

      {estado === 'inicial' && (
        <div className="flex flex-col items-center gap-6 py-6">
          <EmptyState
            titulo={t('inicial.titulo')}
            descripcion={t('inicial.descripcion')}
            icono={GitBranch}
            accion={{ etiqueta: t('inicial.escanear'), icono: ScanLine, onClick: () => entrada.current?.focus() }}
          />
          {recientes.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <span className="text-[13px] text-fg-secondary">{t('inicial.recientes')}</span>
              {recientes.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => buscar(r)}
                  className="h-7 rounded-full bg-subtle px-3 text-xs font-medium text-fg-secondary tabular-nums hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {estado === 'cargando' && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('cargando')}>
          <Skeleton className="h-20 rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      )}

      {estado === 'error' && <EmptyState variante="error" titulo={t('error')} onReintentar={recargar} />}
      {estado === 'sinPermiso' && <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />}

      {estado === 'listo' && resultado?.tipo === 'ninguno' && (
        <EmptyState
          variante="search"
          termino={codigo}
          descripcion={t('sinResultados', { tipo: t(`tipos.${tipoCodigoProbable(codigo)}`) })}
          onLimpiarFiltros={() => buscar('')}
        />
      )}

      {estado === 'listo' && resultado?.tipo === 'serial' && ResultadoSerial({ r: resultado })}
      {estado === 'listo' &&
        resultado?.tipo === 'lote' &&
        ResultadoLote({ r: resultado, pagina: paginaVentas, onPagina: setPaginaVentas, onExportarClientes: () => void exportar(true) })}
      {estado === 'listo' && resultado?.tipo === 'documento' && ResultadoDocumento({ r: resultado })}
    </div>
  );

  // ── Serial ─────────────────────────────────────────────────────────────────
  function ResultadoSerial({ r }: { r: TrazabilidadSerial }) {
    const s = r.serial;
    const abierto = s.reclamos.find((x) => ['pending', 'approved', 'in_process'].includes(x.estado)) ?? null;
    const g = situacionGarantia({ estado: s.estado, garantia: s.garantia, reclamo: null }, s.hoy);
    const partes = [
      s.estado === 'sold' || s.fecha_venta
        ? t('serial.vendidoA', { cliente: s.cliente?.nombre ?? t('serial.sinCliente'), fecha: s.fecha_venta ? formatDate(s.fecha_venta) : '—' })
        : null,
      g.tipo === 'vigente' || g.tipo === 'por_vencer' ? t('serial.garantiaHasta', { fecha: formatPlain(g.fin) }) : g.tipo === 'vencida' ? t('serial.garantiaVencida') : null,
      abierto?.codigo ? t('serial.reclamoAbierto', { codigo: abierto.codigo }) : null,
    ].filter(Boolean);
    const pendiente =
      abierto && (abierto.estado === 'pending' || abierto.estado === 'approved')
        ? { titulo: t('serial.pendienteProveedor'), detalle: [s.proveedor?.nombre, t('serial.rmaPorAsignar')].filter(Boolean).join(' · ') }
        : null;
    const documentos = [
      s.origen ? { doc: s.origen, detalle: s.proveedor?.nombre ?? null } : null,
      s.venta?.documento ? { doc: s.venta.documento, detalle: s.vendedor ? t('serial.por', { nombre: s.vendedor }) : null } : null,
      ...s.reclamos.map((x) => ({ doc: documentoReclamo(x.id, x.codigo), detalle: t('serial.reclamoGarantia') })),
    ].filter((d): d is NonNullable<typeof d> => d !== null);

    return (
      <>
        <CabeceraResultado
          icono={ScanBarcode}
          titulo={t('serial.titulo', { serial: s.serial, producto: s.producto.nombre })}
          badge={<BadgeEstadoSerial estado={s.estado} />}
          detalle={partes.join(' · ')}
          accion={{ etiqueta: t('serial.ver'), href: rutaSerial(s.id), icono: ScanBarcode }}
        />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Tarjeta titulo={t('recorrido')}>
            <HistorialSerial eventos={s.eventos} proveedor={s.proveedor?.nombre ?? null} pendiente={pendiente} etiqueta={t('recorrido')} />
          </Tarjeta>
          <Tarjeta titulo={t('documentos')}>
            {documentos.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('sinDocumentos')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {documentos.map((d) => (
                  <li key={`${d.doc.tipo}-${d.doc.source_id}`} className="flex flex-col">
                    <EnlaceDocumento documento={d.doc} />
                    {d.detalle && <span className="pl-5 text-xs text-fg-secondary">{d.detalle}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </>
    );
  }

  // ── Lote ───────────────────────────────────────────────────────────────────
  function ResultadoLote({ r, pagina, onPagina, onExportarClientes }: { r: TrazabilidadLote; pagina: number; onPagina: (p: number) => void; onExportarClientes: () => void }) {
    const k = r.kpis;
    const venc = estadoVencimientoLote(r.lote.vence, r.hoy);
    const detalle = [
      r.lote.producto.sku ? t('lote.sku', { sku: r.lote.producto.sku }) : null,
      r.lote.proveedor?.nombre ?? null,
      k.recibido_el ? t('lote.recibidoEl', { fecha: formatDate(k.recibido_el), documento: k.recepcion ? numeroDocumento(k.recepcion) : '—' }) : null,
      r.lote.vence
        ? diasEntre(r.hoy, r.lote.vence) >= 0
          ? t('lote.vence', { fecha: formatPlain(r.lote.vence), dias: diasEntre(r.hoy, r.lote.vence) })
          : t('lote.vencio', { fecha: formatPlain(r.lote.vence) })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const columnas: ColumnaTabla<VentaLote>[] = [
      { id: 'fecha', encabezado: t('lote.columnas.fecha'), celda: (v) => <span className="tabular-nums">{formatDate(v.fecha)}</span> },
      {
        id: 'venta',
        encabezado: t('lote.columnas.venta'),
        celda: (v) => (
          <div className="flex min-w-0 flex-col">
            {v.documento ? <EnlaceDocumento documento={v.documento} /> : <span className="text-fg-muted">—</span>}
            {v.vendedor && <span className="truncate text-xs text-fg-secondary">{t('serial.por', { nombre: v.vendedor })}</span>}
          </div>
        ),
      },
      {
        id: 'cliente',
        encabezado: t('lote.columnas.cliente'),
        celda: (v) => {
          const href = v.cliente?.id ? rutaCliente(v.cliente.id) : null;
          if (!v.cliente?.nombre) return <span className="text-fg-muted">{t('lote.consumidorFinal')}</span>;
          return href ? (
            <Link href={href} onClick={(e) => e.stopPropagation()} className="truncate rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {v.cliente.nombre}
            </Link>
          ) : (
            <span className="truncate">{v.cliente.nombre}</span>
          );
        },
      },
      { id: 'sucursal', encabezado: t('lote.columnas.sucursal'), ocultarDebajo: 'md', celda: (v) => v.sucursal ?? '—' },
      { id: 'uds', encabezado: t('lote.columnas.uds'), variante: 'importe', celda: (v) => entero(Number(v.cantidad)) },
    ];

    return (
      <>
        <CabeceraResultado
          icono={Layers}
          titulo={t('lote.titulo', { codigo: r.lote.codigo, producto: r.lote.producto.nombre })}
          badge={venc ? <Badge tono={venc === 'vencido' ? 'peligro' : venc === 'por_vencer' ? 'advertencia' : 'exito'} tamano="sm">{t(`lote.vencimiento.${venc}`)}</Badge> : null}
          detalle={detalle}
          nota={r.otros_lotes > 0 ? t('lote.otrosLotes', { count: r.otros_lotes }) : undefined}
          accion={{ etiqueta: t('lote.ver'), href: `/app/inventario/lotes?busqueda=${encodeURIComponent(r.lote.codigo)}`, icono: Layers }}
          hrefProducto={rutaProducto(r.lote.producto.uuid)}
        />
        <KpiStrip etiqueta={t('lote.kpis.etiqueta')}>
          <StatCard
            etiqueta={t('lote.kpis.recibidas')}
            valor={t('lote.uds', { n: entero(Number(k.recibidas)) })}
            detalle={[k.recepcion ? numeroDocumento(k.recepcion) : null, k.costo_unitario !== null ? t('lote.costoUnitario', { costo: formatear(Number(k.costo_unitario)) }) : null].filter(Boolean).join(' · ') || undefined}
          />
          <StatCard
            etiqueta={t('lote.kpis.vendidas')}
            valor={t('lote.uds', { n: entero(Number(k.vendidas)) })}
            detalle={k.ventas > 0 ? t('lote.kpis.aClientes', { count: k.clientes, n: entero(k.clientes), fecha: k.ultima_venta ? formatDate(k.ultima_venta) : '—' }) : t('lote.kpis.sinVentas')}
          />
          <StatCard
            etiqueta={t('lote.kpis.existencias')}
            valor={t('lote.uds', { n: entero(Number(k.existencias)) })}
            tono={Number(k.existencias) > 0 ? 'exito' : 'neutro'}
            detalle={k.existencias_por_sucursal.map((x) => `${x.sucursal} ${entero(Number(x.cantidad))}`).join(' · ') || undefined}
          />
          <StatCard
            etiqueta={t('lote.kpis.mermas')}
            valor={t('lote.uds', { n: entero(Number(k.mermas)) })}
            tono={Number(k.mermas) > 0 ? 'peligro' : 'neutro'}
            tendencia={Number(k.mermas) > 0 ? 'baja' : undefined}
            detalle={k.mermas_documentos.map(numeroDocumento).join(' · ') || undefined}
          />
        </KpiStrip>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <Tarjeta titulo={t('recorrido')}>
            {RecorridoLote({ pasos: r.recorrido })}
          </Tarjeta>
          <Tarjeta
            titulo={t('lote.aQuien')}
            accion={
              k.ventas > 0 ? (
                <Button variant="outline" className="h-9 gap-2" onClick={onExportarClientes}>
                  <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('lote.exportarClientes')}
                </Button>
              ) : undefined
            }
          >
            <DataTable
              etiqueta={t('lote.aQuien')}
              columnas={columnas}
              filas={r.ventas.filas}
              obtenerId={(v) => String(v.id)}
              estado="listo"
              densidad="compacta"
              vacio={{ titulo: t('lote.sinVentasTitulo'), descripcion: t('lote.sinVentasDescripcion'), compacto: true }}
              tarjetaMovil={(v) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{v.cliente?.nombre ?? t('lote.consumidorFinal')}</p>
                    <p className="truncate text-xs text-fg-secondary">{[formatDate(v.fecha), v.documento ? numeroDocumento(v.documento) : null, v.sucursal].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{entero(Number(v.cantidad))}</span>
                </div>
              )}
              pie={r.ventas.total > VENTAS_POR_PAGINA ? <PaginationCompact pagina={pagina} tamano={VENTAS_POR_PAGINA} total={r.ventas.total} onPaginaChange={onPagina} /> : undefined}
            />
          </Tarjeta>
        </div>
      </>
    );
  }

  function RecorridoLote({ pasos }: { pasos: PasoLote[] }) {
    if (pasos.length === 0) return <p className="text-sm text-fg-secondary">{t('sinRecorrido')}</p>;
    return (
      <ol aria-label={t('recorrido')} className="flex flex-col gap-4">
        {pasos.map((p, i) => {
          const titulo =
            p.tipo === 'vendido'
              ? t('pasos.vendido', { ventas: p.ventas ?? 0 })
              : t(`pasos.${p.tipo}`, { cantidad: entero(Number(p.cantidad)), sucursal: p.sucursal ?? '' });
          const detalle =
            p.tipo === 'vendido'
              ? t('pasos.vendidoDetalle', { clientes: p.clientes ?? 0, sucursales: p.sucursales ?? 0 })
              : [t('pasos.unidades', { signo: p.direccion === 'out' ? '−' : '', cantidad: entero(Number(p.cantidad)) }), p.sucursal, p.usuario].filter(Boolean).join(' · ');
          return (
            <li key={`${p.tipo}-${i}`} className="flex flex-col">
              <p className="text-sm font-medium text-fg">{titulo}</p>
              <p className="text-[13px] text-fg-secondary">{detalle}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                {p.tipo === 'vendido' ? (
                  <span className="tabular-nums">
                    {p.desde ? formatDate(p.desde) : ''} → {p.hasta ? formatDate(p.hasta) : ''}
                  </span>
                ) : (
                  <time className="tabular-nums" dateTime={p.fecha}>
                    {p.fecha ? formatDateTime(p.fecha) : ''}
                  </time>
                )}
                {p.documento && <EnlaceDocumento documento={p.documento} className="text-xs" />}
              </p>
            </li>
          );
        })}
      </ol>
    );
  }

  // ── Documento ──────────────────────────────────────────────────────────────
  function ResultadoDocumento({ r }: { r: TrazabilidadDocumento }) {
    const d = r.documento;
    const Icono = ICONO_DOCUMENTO_SERIAL[d.tipo] ?? FileText;
    const columnas: ColumnaTabla<MovimientoDocumento>[] = [
      { id: 'fecha', encabezado: t('documento.columnas.fecha'), celda: (m) => <span className="tabular-nums">{formatDateTime(m.fecha)}</span> },
      {
        id: 'producto',
        encabezado: t('documento.columnas.producto'),
        celda: (m) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-fg">{m.producto.nombre}</span>
            {m.producto.sku && <span className="truncate text-xs text-fg-secondary">{m.producto.sku}</span>}
          </div>
        ),
      },
      { id: 'lote', encabezado: t('documento.columnas.lote'), ocultarDebajo: 'md', celda: (m) => m.lote ?? <span className="text-fg-muted">—</span> },
      { id: 'sucursal', encabezado: t('documento.columnas.sucursal'), ocultarDebajo: 'lg', celda: (m) => m.sucursal ?? '—' },
      {
        id: 'cantidad',
        encabezado: t('documento.columnas.cantidad'),
        variante: 'importe',
        celda: (m) => (
          <span className={m.direccion === 'out' ? 'text-danger-text' : 'text-success-text'}>
            {m.direccion === 'out' ? '−' : '+'}
            {entero(Number(m.cantidad))}
          </span>
        ),
      },
    ];
    return (
      <>
        <CabeceraResultado
          icono={Icono}
          titulo={etiquetaDocumento(d)}
          detalle={[d.fecha ? formatDateTime(d.fecha) : null, d.cliente?.nombre ?? null].filter(Boolean).join(' · ')}
          accion={{ etiqueta: t('documento.abrir'), href: rutaDocumento(d) ?? undefined, icono: Icono }}
        />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Tarjeta titulo={t('documento.movimientos')} sinRelleno>
            <DataTable
              etiqueta={t('documento.movimientos')}
              columnas={columnas}
              filas={r.movimientos}
              obtenerId={(m) => String(m.id)}
              estado="listo"
              densidad="compacta"
              vacio={{ titulo: t('documento.sinMovimientosTitulo'), descripcion: t('documento.sinMovimientos'), compacto: true }}
              tarjetaMovil={(m) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{m.producto.nombre}</p>
                    <p className="truncate text-xs text-fg-secondary">{[m.lote, m.sucursal].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className={m.direccion === 'out' ? 'text-sm tabular-nums text-danger-text' : 'text-sm tabular-nums text-success-text'}>
                    {m.direccion === 'out' ? '−' : '+'}
                    {entero(Number(m.cantidad))}
                  </span>
                </div>
              )}
            />
          </Tarjeta>
          <Tarjeta titulo={t('documento.seriales')}>
            {r.seriales.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('documento.sinSeriales')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {r.seriales.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <Link href={rutaSerial(s.id)} className="min-w-0 truncate rounded text-sm text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      {s.serial}
                      <span className="sr-only"> · {s.producto}</span>
                    </Link>
                    <BadgeEstadoSerial estado={s.estado} />
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </>
    );
  }
}

/** Tarjeta de encabezado del resultado (Figma: icono, título, estado, línea de detalle y «Ver …»). */
function CabeceraResultado({
  icono: Icono,
  titulo,
  badge,
  detalle,
  nota,
  accion,
  hrefProducto,
}: {
  icono: typeof GitBranch;
  titulo: string;
  badge?: ReactNode;
  detalle?: string;
  nota?: string;
  accion?: { etiqueta: string; href?: string; icono?: typeof GitBranch; documento?: DocumentoSerial };
  hrefProducto?: string | null;
}) {
  const AccionIcono = accion?.icono;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center" aria-label={titulo}>
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
        <Icono className="size-5" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
          {hrefProducto ? (
            <Link href={hrefProducto} className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              {titulo}
            </Link>
          ) : (
            titulo
          )}
          {badge}
        </h2>
        {detalle && <p className="text-[13px] text-fg-secondary">{detalle}</p>}
        {nota && <p className="text-xs text-fg-muted">{nota}</p>}
      </div>
      {accion?.documento && !accion.href ? (
        <EnlaceDocumento documento={accion.documento} className="h-9 rounded-lg border border-line-strong px-3" />
      ) : accion?.href ? (
        <Link
          href={accion.href}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {AccionIcono && <AccionIcono aria-hidden="true" className="size-4" strokeWidth={1.5} />}
          {accion.etiqueta}
        </Link>
      ) : null}
    </section>
  );
}

export default TrazabilidadPage;
