'use client';

/**
 * Devoluciones del POS — listado (Figma `873:573998`; cargando `873:575233`,
 * vacío `873:575889`, sin resultados `873:576468`, error `873:577079`, sin
 * permiso `873:577675`, menú ⋯ `873:578238`, móvil `873:578460`). Sustituye
 * al asistente de 3 pestañas (spec §3.3: listado + detalle como el resto).
 *
 * - Paginado, filtrado y ordenado en el servidor (`GET /api/pos/devoluciones`)
 *   con el estado en la URL (`useListadoServidor`).
 * - KPI sobre las devoluciones listadas (`GET /api/pos/devoluciones/cifras`).
 * - «Nueva devolución» busca la venta y abre «Crear devolución», que llama a
 *   `procesar_devolucion` como antes (sin lógica nueva de devolución).
 * - `?venta=<id>` abre «Crear devolución» de esa venta (enlaces de otras pantallas).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Ban, ClipboardList, Download, Eye, FileMinus, Mail, Percent, Plus, Printer, Receipt, RefreshCw, Tag, Undo2, Wallet } from 'lucide-react';
import {
  BranchBadgeActiva,
  DataTable,
  DateRangeButton,
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
  etiquetaRango,
  etiquetaRangoLarga,
  inicioDeMes,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { ChipDocumento } from '@/components/kit/documento';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { toastError } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { guardarArchivo, imprimirDocumento } from '@/lib/documents/cliente';
import { filasACsv } from '@/lib/utils/csv';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { pedirPermisosVentas } from '@/lib/pos/ventas/clienteVentas';
import { SIN_PERMISOS_VENTAS, type PermisosVentas } from '@/lib/pos/ventas/accionesVenta';
import { CAMPOS_ORDEN_DEVOLUCIONES, ESTADOS_DEVOLUCION, METODOS_REINTEGRO, TAMANO_DEVOLUCIONES_DEFECTO, TAMANOS_DEVOLUCIONES } from '@/lib/pos/devoluciones/filtrosDevoluciones';
import { esParcial, numeroDevolucion, porcentajeSobreVentas, textoPlano } from '@/lib/pos/devoluciones/presentacionDevoluciones';
import { ErrorPeticionDevoluciones, pedirCifrasDevoluciones, pedirDevoluciones } from '@/lib/pos/devoluciones/clienteDevoluciones';
import type { CifrasDevoluciones, FilaDevolucion, PaginaDevoluciones } from '@/lib/pos/devoluciones/listadoServidor';
import { ReturnReasonsService } from './motivos/returnReasonsService';
import type { ReturnReason } from './types';
import { BadgeEstadoDevolucion } from './BadgeEstadoDevolucion';
import { NuevaDevolucionDialog } from './NuevaDevolucionDialog';
import { CrearDevolucionDialog } from './CrearDevolucionDialog';

const RUTA = '/app/pos/devoluciones';
const FILTROS = ['estado', 'metodo', 'motivo', 'desde', 'hasta'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DevolucionesPage() {
  const t = useTranslations('posDevoluciones.listado');
  const tk = useTranslations('posDevoluciones.kpis');
  const ta = useTranslations('posDevolucionesAnular');
  const router = useRouter();
  const params = useSearchParams();
  const entero = useFormatoEntero();
  const moneda = useMonedaOrganizacion();
  const { branchFilter, branches } = useBranch();
  const { getToday, timezone } = useFormatDate();
  const locale = useLocaleIntl();
  const hoy = getToday();

  const l = useListadoServidor({
    filtros: [...FILTROS],
    camposOrden: [...CAMPOS_ORDEN_DEVOLUCIONES],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: TAMANO_DEVOLUCIONES_DEFECTO,
  });

  const [datos, setDatos] = useState<PaginaDevoluciones | null>(null);
  const [cifras, setCifras] = useState<CifrasDevoluciones | null>(null);
  const [cargandoCifras, setCargandoCifras] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [permisos, setPermisos] = useState<PermisosVentas>(SIN_PERMISOS_VENTAS);
  const [motivos, setMotivos] = useState<ReturnReason[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [buscarVenta, setBuscarVenta] = useState(false);
  const [ventaACrear, setVentaACrear] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const desde = l.filtros.desde ?? inicioDeMes(hoy);
  const hasta = l.filtros.hasta ?? hoy;
  const periodoElegido = !!(l.filtros.desde || l.filtros.hasta);

  const consultaFiltros = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    for (const [k, v] of Object.entries(l.filtros)) if (v) q.set(k, v);
    q.set('desde', desde);
    q.set('hasta', hasta);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    return q.toString();
  }, [l.busqueda, l.filtros, desde, hasta, branchFilter]);

  const consulta = useMemo(() => {
    const q = new URLSearchParams(consultaFiltros);
    q.set('orden', l.orden?.campo ?? 'fecha');
    q.set('dir', l.orden?.direccion ?? 'desc');
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [consultaFiltros, l.orden, l.pagina, l.tamano]);

  useEffect(() => {
    let vigente = true;
    pedirPermisosVentas()
      .then((p) => vigente && setPermisos(p))
      .catch(() => vigente && setPermisos(SIN_PERMISOS_VENTAS));
    ReturnReasonsService.getAll()
      .then((m) => vigente && setMotivos(m))
      .catch(() => vigente && setMotivos([]));
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    pedirDevoluciones(new URLSearchParams(consulta))
      .then((r) => vigente && setDatos(r))
      .catch((e) => vigente && setError(e instanceof ErrorPeticionDevoluciones ? e.codigo : 'lectura_fallida'))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [consulta, recarga]);

  useEffect(() => {
    let vigente = true;
    setCargandoCifras(true);
    pedirCifrasDevoluciones(new URLSearchParams(consultaFiltros))
      .then((c) => vigente && setCifras(c))
      .catch(() => vigente && setCifras(null))
      .finally(() => vigente && setCargandoCifras(false));
    return () => {
      vigente = false;
    };
  }, [consultaFiltros, recarga]);

  // Enlaces de otras pantallas: `?venta=<id>` abre «Crear devolución» de esa venta.
  const ventaUrl = params?.get('venta') ?? null;
  useEffect(() => {
    if (ventaUrl && UUID.test(ventaUrl) && permisos.devolver) setVentaACrear(ventaUrl);
  }, [ventaUrl, permisos.devolver]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: branchFilter });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const formatear = useCallback((v: number) => moneda.formatear(v), [moneda]);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural') };

  const fechaCorta = (v: string) => formatDateTimeInTz(v, timezone, { locale, day: '2-digit', month: '2-digit' });
  const hora = (v: string) => formatDateTimeInTz(v, timezone, { locale, hour: '2-digit', minute: '2-digit' });
  const cantidad = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(v);
  const motivoDe = (f: FilaDevolucion) => f.motivo.nombre ?? (textoPlano(f.motivo.texto) || t('sinMotivo'));
  const metodoDe = (f: FilaDevolucion) =>
    f.metodo === 'cash' && f.caja_sesion_id ? t('metodoCaja', { sesion: f.caja_sesion_id }) : t(`metodos.${f.metodo === 'cash' || f.metodo === 'store_credit' ? f.metodo : 'sin_definir'}`);
  const documentoCliente = (f: FilaDevolucion) =>
    f.cliente?.documento ? [f.cliente.tipo_documento, f.cliente.documento].filter(Boolean).join(' ') : f.cliente ? null : t('mostrador');
  const cerrarCrear = () => {
    setVentaACrear(null);
    if (ventaUrl) router.replace(RUTA);
  };

  const accionesDe = (f: FilaDevolucion): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => router.push(`${RUTA}/${f.id}`) },
    {
      id: 'venta',
      etiqueta: f.venta.factura_numero ? t('acciones.verVenta', { numero: f.venta.factura_numero }) : t('acciones.verVentaSinNumero'),
      icono: Receipt,
      onSelect: () => router.push(`/app/pos/ventas/${f.venta.id}`),
    },
    {
      id: 'nc',
      etiqueta: t('acciones.verNc', { numero: f.nota_credito?.numero ?? '' }),
      icono: FileMinus,
      oculta: !f.nota_credito,
      onSelect: () => f.nota_credito && router.push(`/app/finanzas/facturas-venta/${f.nota_credito.id}`),
    },
    {
      id: 'imprimir',
      etiqueta: t('acciones.imprimir'),
      icono: Printer,
      deshabilitada: !f.nota_credito,
      motivo: t('motivosAccion.sinNc'),
      onSelect: () => f.nota_credito && imprimirDocumento('nota-credito', f.nota_credito.id),
    },
    { id: 'enviar', etiqueta: t('acciones.enviar'), icono: Mail, deshabilitada: true, motivo: t('motivosAccion.enviarPronto'), onSelect: () => undefined },
    {
      id: 'anular',
      etiqueta: t('acciones.anular'),
      icono: Ban,
      destructiva: true,
      separadorAntes: true,
      // El diálogo vive en el detalle: elige el caso con el diagnóstico de la nota crédito.
      deshabilitada: f.estado === 'cancelled' || !permisos.anular,
      motivo: f.estado === 'cancelled' ? ta('menu.motivoAnulada') : ta('menu.motivoSinPermiso'),
      onSelect: () => router.push(`${RUTA}/${f.id}?anular=1`),
    },
  ];

  const exportar = async (ids?: ReadonlySet<string>) => {
    setExportando(true);
    try {
      // La exportación trae hasta 100 filas por página con los mismos filtros.
      const filasCsv: FilaDevolucion[] = [];
      for (let pagina = 1; pagina <= 50; pagina++) {
        const q = new URLSearchParams(consulta);
        q.set('pagina', String(pagina));
        q.set('tamano', '100');
        const r = await pedirDevoluciones(q);
        filasCsv.push(...r.filas);
        if (r.filas.length < 100 || filasCsv.length >= r.total) break;
      }
      const elegidas = ids && ids.size ? filasCsv.filter((f) => ids.has(String(f.id))) : filasCsv;
      const csv = filasACsv(
        [t('csv.numero'), t('csv.fecha'), t('csv.factura'), t('csv.notaCredito'), t('csv.cliente'), t('csv.documento'), t('csv.motivo'), t('csv.unidades'), t('csv.reintegro'), t('csv.metodo'), t('csv.estado'), t('csv.sucursal')],
        elegidas.map((f) => [
          numeroDevolucion(f.id),
          formatDateTimeInTz(f.fecha, timezone, { locale, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          f.venta.factura_numero,
          f.nota_credito?.numero,
          f.cliente?.nombre ?? t('consumidorFinal'),
          f.cliente?.documento,
          motivoDe(f),
          f.unidades,
          f.total,
          metodoDe(f),
          t(`estados.${f.estado === 'pending' || f.estado === 'cancelled' ? f.estado : 'processed'}`),
          f.sucursal.nombre,
        ]),
      );
      guardarArchivo(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `devoluciones_${desde}_${hasta}.csv`);
    } catch {
      toastError(t('exportarError'));
    } finally {
      setExportando(false);
    }
  };

  // ── Filtros ───────────────────────────────────────────────────────────────
  const lista = (v: string | undefined) => (v ? v.split(',').filter(Boolean) : []);
  const estadosFiltro = lista(l.filtros.estado);
  const metodosFiltro = lista(l.filtros.metodo);
  const motivosFiltro = lista(l.filtros.motivo);
  const nombreMotivo = (id: string) => motivos.find((m) => String(m.id) === id)?.name ?? `#${id}`;
  const sucursalActiva = branchFilter ? branches.find((b) => b.id === branchFilter) ?? null : null;
  const nombreSucursal = sucursalActiva?.name ?? (branchFilter ? null : t('todasSucursales'));

  const chips: ChipFiltro[] = [
    periodoElegido ? { clave: 'desde', etiqueta: t('filtros.periodoChip', { rango: etiquetaRango({ desde, hasta }, locale) }) } : null,
    estadosFiltro.length ? { clave: 'estado', etiqueta: t('filtros.estadoChip', { estado: estadosFiltro.map((e) => t(`estados.${e}` as never)).join(', ') }) } : null,
    metodosFiltro.length ? { clave: 'metodo', etiqueta: t('filtros.metodoChip', { metodo: metodosFiltro.map((m) => t(`metodos.${m}` as never)).join(', ') }) } : null,
    motivosFiltro.length ? { clave: 'motivo', etiqueta: t('filtros.motivoChip', { motivo: motivosFiltro.map(nombreMotivo).join(', ') }) } : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const quitarChip = (clave: string) => {
    if (clave === 'desde') l.actualizar({ filtros: Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'desde' && k !== 'hasta')) });
    else l.setFiltro(clave, null);
  };

  const textoPeriodo = etiquetaRangoLarga({ desde, hasta }, locale);
  const subtitulo = [nombreSucursal, textoPeriodo].filter(Boolean).join(' · ');

  // ── Tabla ─────────────────────────────────────────────────────────────────
  const columnas: ColumnaTabla<FilaDevolucion>[] = [
    {
      id: 'numero',
      encabezado: t('columnas.numero'),
      ordenable: true,
      className: 'whitespace-nowrap',
      celda: (f) => (
        <div className="flex flex-col">
          <span className="font-medium text-fg tabular-nums">{numeroDevolucion(f.id)}</span>
          <span className="text-xs text-fg-secondary">
            {fechaCorta(f.fecha)} · {hora(f.fecha)}
          </span>
        </div>
      ),
    },
    {
      id: 'documentos',
      encabezado: t('columnas.documentos'),
      celda: (f) => (
        <div className="flex flex-wrap items-center gap-1">
          <ChipDocumento
            tipo={f.venta.factura_numero ? 'factura' : 'venta'}
            numero={f.venta.factura_numero ?? t('ventaSinNumero')}
            href={f.venta.factura_id ? `/app/finanzas/facturas-venta/${f.venta.factura_id}` : `/app/pos/ventas/${f.venta.id}`}
          />
          {f.nota_credito?.numero && <ChipDocumento tipo="notaCredito" numero={f.nota_credito.numero} href={`/app/finanzas/facturas-venta/${f.nota_credito.id}`} />}
        </div>
      ),
    },
    {
      id: 'cliente',
      encabezado: t('columnas.cliente'),
      celda: (f) => (
        <div className="flex max-w-[13rem] flex-col">
          <span className="truncate text-fg">{f.cliente?.nombre ?? t('consumidorFinal')}</span>
          <span className="truncate text-xs text-fg-secondary">{documentoCliente(f) ?? '—'}</span>
        </div>
      ),
    },
    {
      id: 'motivo',
      encabezado: t('columnas.motivo'),
      ocultarDebajo: 'lg',
      celda: (f) => (
        <span className="block max-w-[9rem] truncate" title={motivoDe(f)}>
          {motivoDe(f)}
        </span>
      ),
    },
    {
      id: 'unidades',
      encabezado: t('columnas.unidades'),
      ocultarDebajo: 'xl',
      className: 'whitespace-nowrap',
      celda: (f) => t('unidadesDe', { devueltas: cantidad(f.unidades), vendidas: cantidad(f.unidades_vendidas) }),
    },
    {
      id: 'total',
      encabezado: t('columnas.reintegro'),
      ordenable: true,
      variante: 'importe',
      celda: (f) => <span className={f.estado === 'cancelled' ? 'text-fg-muted line-through' : 'text-fg'}>{formatear(f.total)}</span>,
    },
    {
      id: 'metodo',
      encabezado: t('columnas.metodo'),
      ocultarDebajo: 'lg',
      celda: (f) => (
        <span className="block max-w-[8.5rem] truncate" title={metodoDe(f)}>
          {metodoDe(f)}
        </span>
      ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), className: 'whitespace-nowrap', celda: (f) => <BadgeEstadoDevolucion estado={f.estado} /> },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios || chips.length > 0 ? 'sinResultados' : 'vacio') : 'listo';

  // ── KPI ───────────────────────────────────────────────────────────────────
  const pct = cifras ? porcentajeSobreVentas(cifras.devuelto, cifras.ventas) : null;
  const textoPct = pct === null ? '—' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pct)} %`;
  const detalleDevuelto = cifras
    ? cifras.por_metodo.length
      ? cifras.por_metodo.map((m) => t(`metodos.${m.metodo === 'cash' || m.metodo === 'store_credit' ? m.metodo : 'sin_definir'}`).toLowerCase()).join(', ')
      : tk('sinDevuelto')
    : undefined;
  const motivoPrincipal = cifras?.motivo_principal ?? null;

  const puedeCrear = permisos.devolver;
  const accionesCabecera: AccionFila[] = [
    { id: 'exportar', etiqueta: exportando ? t('exportando') : t('exportar'), icono: Download, deshabilitada: exportando || total === 0, onSelect: () => void exportar() },
    { id: 'ventas', etiqueta: t('irVentas'), icono: Receipt, onSelect: () => router.push('/app/pos/ventas') },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={Undo2}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.pos'), href: '/app/pos' }, { etiqueta: t('migas.devoluciones') }]}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            </Button>
            <Button asChild variant="outline" className="h-10 gap-2">
              <Link href={`${RUTA}/motivos`}>
                <ClipboardList aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('motivos')}
              </Link>
            </Button>
            {puedeCrear && (
              <Button className="h-10 gap-2" onClick={() => setBuscarVenta(true)}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('nueva')}
              </Button>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={accionesCabecera} />
          </>
        }
        movil={{
          subtitulo: [nombreSucursal, etiquetaRango({ desde, hasta }, locale)].filter(Boolean).join(' · '),
          accion: puedeCrear ? (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => setBuscarVenta(true)} aria-label={t('nueva')}>
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Button>
          ) : undefined,
        }}
        debajo={<BranchBadgeActiva />}
      />

      <div className="hidden md:block">
        <KpiStrip etiqueta={tk('etiqueta')}>
          <StatCard etiqueta={tk('devuelto')} icono={Wallet} cargando={cargandoCifras} valor={cifras ? formatear(cifras.devuelto) : '—'} detalle={detalleDevuelto} />
          <StatCard
            etiqueta={tk('devoluciones')}
            icono={Undo2}
            cargando={cargandoCifras}
            valor={cifras ? entero(cifras.devoluciones) : '—'}
            detalle={cifras ? tk('detalleUnidades', { unidades: cifras.unidades, parciales: cifras.parciales }) : undefined}
          />
          <StatCard
            etiqueta={tk('sobreVentas')}
            icono={Percent}
            cargando={cargandoCifras}
            valor={textoPct}
            tono={pct !== null && pct > 0 ? 'advertencia' : undefined}
            iconoDetalle={pct !== null && pct > 0 ? AlertTriangle : undefined}
            detalle={cifras ? (cifras.ventas > 0 ? tk('deVendido', { monto: formatear(cifras.ventas) }) : tk('sinVentas')) : undefined}
          />
          <StatCard
            etiqueta={tk('motivoPrincipal')}
            icono={Tag}
            cargando={cargandoCifras}
            valor={motivoPrincipal?.nombre ?? '—'}
            detalle={cifras ? (motivoPrincipal ? tk('motivoDetalle', { n: motivoPrincipal.n, total: cifras.procesadas }) : tk('sinDevuelto')) : undefined}
          />
        </KpiStrip>
      </div>
      <KpiCompacto
        className="md:hidden"
        etiqueta={tk('etiqueta')}
        cargando={cargandoCifras}
        cifras={[
          { id: 'devuelto', etiqueta: tk('devueltoCorto'), valor: cifras ? formatear(cifras.devuelto) : '—' },
          { id: 'pct', etiqueta: tk('sobreVentasCorto'), valor: textoPct, tono: pct !== null && pct > 0 ? 'advertencia' : undefined },
        ]}
      />

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel
            ancho="amplio"
            conteo={chips.length}
            onLimpiar={l.limpiarFiltros}
            nota={t('filtros.nota')}
            textoVerResultados={t('filtros.verN', { count: total, n: entero(total) })}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('filtros.desdeHasta')}>
                {() => (
                  <DateRangeButton
                    valor={{ desde, hasta }}
                    hoy={hoy}
                    max={hoy}
                    etiqueta={t('filtros.periodo')}
                    onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } })}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.estado')}>
                {(c) => (
                  <MultiSelect
                    id={c.id}
                    aria-labelledby={c.idEtiqueta}
                    opciones={ESTADOS_DEVOLUCION.map((e) => ({ valor: e, etiqueta: t(`estados.${e}`) }))}
                    valores={estadosFiltro}
                    onValoresChange={(v) => l.setFiltro('estado', v.length ? v.join(',') : null)}
                    placeholder={t('filtros.todos')}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.metodo')}>
                {(c) => (
                  <MultiSelect
                    id={c.id}
                    aria-labelledby={c.idEtiqueta}
                    opciones={METODOS_REINTEGRO.map((m) => ({ valor: m, etiqueta: t(`metodos.${m}`) }))}
                    valores={metodosFiltro}
                    onValoresChange={(v) => l.setFiltro('metodo', v.length ? v.join(',') : null)}
                    placeholder={t('filtros.todos')}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.motivo')}>
                {(c) => (
                  <MultiSelect
                    id={c.id}
                    aria-labelledby={c.idEtiqueta}
                    opciones={motivos.map((m) => ({ valor: String(m.id), etiqueta: m.name }))}
                    valores={motivosFiltro}
                    onValoresChange={(v) => l.setFiltro('motivo', v.length ? v.join(',') : null)}
                    placeholder={t('filtros.todos')}
                  />
                )}
              </FormField>
            </div>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => String(f.id)}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={(f) => router.push(`${RUTA}/${f.id}`)}
        etiquetaFila={(f) => numeroDevolucion(f.id)}
        acciones={accionesDe}
        tonoFila={(f) => (f.estado === 'cancelled' ? 'peligro' : undefined)}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={Undo2}
            titulo={[numeroDevolucion(f.id), f.cliente?.nombre ?? t('consumidorFinal')].join(' · ')}
            subtitulo={[
              f.venta.factura_numero,
              motivoDe(f),
              t('unidadesDe', { devueltas: cantidad(f.unidades), vendidas: cantidad(f.unidades_vendidas) }),
              esParcial(f.unidades, f.unidades_vendidas) ? t('parcial') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            meta={<span>{[fechaCorta(f.fecha), metodoDe(f)].join(' · ')}</span>}
            valor={formatear(f.total)}
            estado={<BadgeEstadoDevolucion estado={f.estado} />}
            acciones={accionesDe(f)}
            onClick={() => router.push(`${RUTA}/${f.id}`)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Undo2,
          accion: puedeCrear ? { etiqueta: t('nueva'), icono: Plus, onClick: () => setBuscarVenta(true) } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
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
            opcionesTamano={TAMANOS_DEVOLUCIONES}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <NuevaDevolucionDialog
        abierto={buscarVenta}
        onAbiertoChange={setBuscarVenta}
        sucursal={branchFilter}
        onElegir={(venta) => {
          setBuscarVenta(false);
          setVentaACrear(venta.id);
        }}
      />
      {ventaACrear && (
        <CrearDevolucionDialog
          abierto
          onAbiertoChange={(v) => !v && cerrarCrear()}
          ventaId={ventaACrear}
          onDevuelta={(r) => {
            cerrarCrear();
            recargar();
            if (r.return_id) router.push(`${RUTA}/${r.return_id}`);
          }}
        />
      )}
    </div>
  );
}
