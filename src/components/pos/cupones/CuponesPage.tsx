'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Archive, ArchiveRestore, Copy, Eye, Layers, Pause, Pencil, Play, Plus, RefreshCw, Ticket, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  BranchBadgeActiva,
  ChipsOpcion,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  calcularRango,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useBranch } from '@/lib/context/BranchContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { plainDateToInstant } from '@/lib/utils/dateDisplay';
import { CouponsService } from './couponsService';
import { CodigoCupon } from './CodigoCupon';
import { CrearLoteDialog } from './CrearLoteDialog';
import { CuponFormDialog } from './CuponFormDialog';
import { LoteCreadoDialog } from './LoteCreadoDialog';
import { TONO_ESTADO_CUPON, codigoErrorCupon, type CodigoErrorCupon } from './cuponesVista';
import { useFormatoCupones } from './useFormatoCupones';
import type { Coupon, CuponFila, DatosLote, FiltroEstadoCupon, ListadoCupones, LoteCreado, ResumenCupones } from './types';

const FILTROS_ESTADO: readonly FiltroEstadoCupon[] = ['todos', 'activo', 'programado', 'agotado', 'vencido', 'inactivo', 'archivados'];

/** Primer día del mes siguiente a 'YYYY-MM-DD'. */
function primerDiaMesSiguiente(dia: string): string {
  const y = Number(dia.slice(0, 4));
  const m = Number(dia.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

export const rutaCupon = (id: string) => `/app/pos/cupones/${id}`;

/**
 * Cupones v2 (Figma 1088:714507: listo, cargando, sin resultados, error, sin
 * permiso, «Crear lote», «Lote creado», tableta; sección 23 458:*: vacío,
 * nuevo cupón y móvil).
 *
 * - Lista paginada en el servidor (`pos_cupones_listar`) con el estado del
 *   código calculado en la base. Los KPI de canje salen de
 *   `coupon_redemptions` (`pos_cupones_resumen`), del mes de la organización.
 * - La sucursal sale del header: cupones sin promoción o con una promoción que
 *   aplica en esa sucursal.
 * - Escribir exige `pos.cupones.gestionar` (trigger en la base); aquí solo
 *   decide qué botones se ven.
 */
export function CuponesPage() {
  const t = useTranslations('posCupones');
  const router = useRouter();
  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  const formato = useFormatoCupones();

  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstadoCupon>('todos');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);

  const [listado, setListado] = useState<ListadoCupones | null>(null);
  const [resumen, setResumen] = useState<ResumenCupones | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<CodigoErrorCupon | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [promociones, setPromociones] = useState<{ id: string; name: string }[]>([]);

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Coupon | null>(null);
  const [loteAbierto, setLoteAbierto] = useState(false);
  const [loteCreado, setLoteCreado] = useState<{ lote: LoteCreado; datos: DatosLote } | null>(null);

  const hoy = formato.getToday();
  const mes = useMemo(() => {
    const inicio = `${hoy.slice(0, 8)}01`;
    return {
      desde: plainDateToInstant(inicio, formato.timezone, '00:00'),
      hasta: plainDateToInstant(primerDiaMesSiguiente(inicio), formato.timezone, '00:00'),
    };
  }, [hoy, formato.timezone]);

  const cargar = useCallback(async () => {
    if (!organization?.id) return;
    setCargando(true);
    setError(null);
    try {
      const [l, r] = await Promise.all([
        CouponsService.listar({ branchId: branchFilter, busqueda, estado, limite: tamano, desplazamiento: (pagina - 1) * tamano }),
        CouponsService.resumen({ branchId: branchFilter, desde: mes.desde, hasta: mes.hasta }),
      ]);
      setListado(l);
      setResumen(r);
    } catch (e) {
      setError(codigoErrorCupon(e));
    } finally {
      setCargando(false);
    }
  }, [organization?.id, branchFilter, busqueda, estado, tamano, pagina, mes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!organization?.id) return;
    let vigente = true;
    CouponsService.puedeGestionar().then((p) => vigente && setPuedeGestionar(p)).catch(() => vigente && setPuedeGestionar(false));
    CouponsService.promociones().then((p) => vigente && setPromociones(p)).catch(() => vigente && setPromociones([]));
    return () => {
      vigente = false;
    };
  }, [organization?.id]);

  const cambiarBusqueda = (v: string) => {
    setBusqueda(v);
    setPagina(1);
  };
  const cambiarEstado = (v: FiltroEstadoCupon) => {
    setEstado(v);
    setPagina(1);
  };
  const limpiarTodo = () => {
    setBusqueda('');
    setEstado('todos');
    setPagina(1);
  };

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    try {
      await accion();
      toast.success(exito);
      void cargar();
    } catch (e) {
      toast.error(t(`errores.${codigoErrorCupon(e)}`));
    }
  };

  const abrirNuevo = () => {
    setEditando(null);
    setFormAbierto(true);
  };
  const abrirEditar = async (c: CuponFila) => {
    try {
      const completo = await CouponsService.getById(c.id);
      if (!completo) return;
      setEditando(completo);
      setFormAbierto(true);
    } catch (e) {
      toast.error(t(`errores.${codigoErrorCupon(e)}`));
    }
  };

  const filas = listado?.filas ?? [];
  const total = listado?.total ?? 0;
  const rango = calcularRango(pagina, tamano, total);

  const badge = (c: CuponFila) => (
    <Badge tono={TONO_ESTADO_CUPON[c.estado]} apariencia="suave" tamano="sm">
      {t(`estado.${c.estado}`)}
    </Badge>
  );

  const acciones = (c: CuponFila): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => router.push(rutaCupon(c.id)) },
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => void abrirEditar(c), oculta: !puedeGestionar || c.estado === 'archivado' },
    {
      id: 'duplicar',
      etiqueta: t('acciones.duplicar'),
      icono: Copy,
      onSelect: () => void ejecutar(() => CouponsService.duplicate(c.id), t('toast.duplicado')),
      oculta: !puedeGestionar,
    },
    {
      id: 'activar',
      etiqueta: c.is_active ? t('acciones.desactivar') : t('acciones.activar'),
      icono: c.is_active ? Pause : Play,
      onSelect: () => void ejecutar(() => CouponsService.setActivo(c.id, !c.is_active), c.is_active ? t('toast.desactivado') : t('toast.activado')),
      oculta: !puedeGestionar || c.estado === 'archivado',
    },
    {
      id: 'archivar',
      etiqueta: t('acciones.archivar'),
      icono: Archive,
      separadorAntes: true,
      onSelect: () => void ejecutar(() => CouponsService.archive(c.id), t('toast.archivado')),
      oculta: !puedeGestionar || c.estado === 'archivado',
    },
    {
      id: 'restaurar',
      etiqueta: t('acciones.restaurar'),
      icono: ArchiveRestore,
      separadorAntes: true,
      onSelect: () => void ejecutar(() => CouponsService.restore(c.id), t('toast.restaurado')),
      oculta: !puedeGestionar || c.estado !== 'archivado',
    },
  ];

  const dosLineas = (linea: string, detalle: string | null, tonoDetalle?: string) => (
    <div className="min-w-0">
      <p className="truncate">{linea}</p>
      {detalle && <p className={tonoDetalle ?? 'truncate text-xs text-fg-secondary'}>{detalle}</p>}
    </div>
  );

  const columnas: ColumnaTabla<CuponFila>[] = [
    { id: 'codigo', encabezado: t('columnas.codigo'), celda: (c) => <CodigoCupon codigo={c.code} vivo={c.estado === 'activo'} /> },
    { id: 'descuento', encabezado: t('columnas.descuento'), celda: (c) => dosLineas(formato.descuento(c), formato.detalleDescuento(c)) },
    {
      id: 'condiciones',
      encabezado: t('columnas.condiciones'),
      ocultarDebajo: 'lg',
      celda: (c) => {
        const k = formato.condiciones(c);
        return dosLineas(k.linea, k.detalle);
      },
    },
    {
      id: 'usos',
      encabezado: t('columnas.usos'),
      celda: (c) => {
        const u = formato.usos(c, c.estado);
        return dosLineas(u.linea, u.detalle);
      },
    },
    {
      id: 'vigencia',
      encabezado: t('columnas.vigencia'),
      ocultarDebajo: 'md',
      celda: (c) => {
        const v = formato.vigencia(c, c.estado);
        return dosLineas(v.linea, v.detalle, 'truncate text-xs text-warning-text');
      },
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: badge },
  ];

  const tarjeta = (c: CuponFila) => {
    const u = formato.usos(c, c.estado);
    return (
      <ListCard
        titulo={c.code}
        subtitulo={c.name || formato.condiciones(c).linea}
        meta={`${formato.descuento(c)} · ${u.linea}`}
        estado={badge(c)}
        acciones={acciones(c)}
        onClick={() => router.push(rutaCupon(c.id))}
      />
    );
  };

  const sinPermiso = error === 'SIN_PERMISO';
  const hayFiltros = busqueda.trim() !== '' || estado !== 'todos';
  const estadoTabla: EstadoTabla = cargando && !listado
    ? 'cargando'
    : sinPermiso
      ? 'sinPermiso'
      : error
        ? 'error'
        : total === 0
          ? hayFiltros
            ? 'sinResultados'
            : 'vacio'
          : 'listo';
  const cifrasCargando = cargando && !resumen;
  const tasa = resumen && resumen.total > 0 ? Math.round((resumen.con_canje / resumen.total) * 100) : 0;
  const nombreSucursal = branchFilter ? branches.find((b) => b.id === branchFilter)?.name ?? null : null;

  const accionesCabecera: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: () => void cargar() },
    { id: 'archivados', etiqueta: t('verArchivados'), icono: Archive, onSelect: () => cambiarEstado('archivados') },
  ];

  const pie = (
    <Pagination
      pagina={rango.pagina}
      tamano={tamano}
      total={total}
      onPaginaChange={setPagina}
      onTamanoChange={(n) => {
        setTamano(n);
        setPagina(1);
      }}
      sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
      cargando={cargando}
    />
  );

  const subtitulo = nombreSucursal ? t('subtituloSucursal', { sucursal: nombreSucursal }) : t('subtitulo');

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        icono={Ticket}
        migas={[{ etiqueta: t('migaPos'), href: '/app/pos' }, { etiqueta: t('titulo') }]}
        subtitulo={subtitulo}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <button
              type="button"
              aria-label={t('actualizar')}
              title={t('actualizar')}
              className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })}
              onClick={() => void cargar()}
            >
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            {puedeGestionar && (
              <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setLoteAbierto(true)}>
                <Layers aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('crearLote')}
              </button>
            )}
            {puedeGestionar && (
              <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={abrirNuevo}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('nuevo')}
              </button>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={accionesCabecera.filter((a) => a.id !== 'actualizar')} />
          </>
        }
        movil={{
          subtitulo: resumen ? t('subtituloMovil', { total: resumen.total, activos: resumen.activos }) : undefined,
          accion: puedeGestionar ? (
            <button
              type="button"
              aria-label={t('nuevo')}
              onClick={abrirNuevo}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
          menu: [
            ...(puedeGestionar ? [{ id: 'lote', etiqueta: t('crearLote'), icono: Layers, onSelect: () => setLoteAbierto(true) }] : []),
            ...accionesCabecera,
          ],
        }}
      />

      {!sinPermiso && (
        <KpiStrip etiqueta={t('kpi.etiqueta')}>
          <StatCard
            etiqueta={t('kpi.activos')}
            valor={formato.numero(resumen?.activos ?? 0)}
            detalle={t('kpi.activosDetalle', { n: resumen?.total ?? 0 })}
            icono={Ticket}
            cargando={cifrasCargando}
            onClick={() => cambiarEstado('activo')}
          />
          <StatCard
            etiqueta={t('kpi.canjes')}
            valor={formato.numero(resumen?.canjes ?? 0)}
            detalle={t('kpi.canjesDetalle', { monto: formato.moneda.formatear(resumen?.descuento ?? 0) })}
            cargando={cifrasCargando}
          />
          <StatCard etiqueta={t('kpi.tasa')} valor={`${formato.numero(tasa)} %`} detalle={t('kpi.tasaDetalle')} cargando={cifrasCargando} />
          <StatCard
            etiqueta={t('kpi.agotados')}
            valor={formato.numero(resumen?.agotados_o_vencidos ?? 0)}
            detalle={(resumen?.agotados_o_vencidos ?? 0) > 0 ? t('kpi.agotadosDetalle') : t('kpi.agotadosNinguno')}
            iconoDetalle={(resumen?.agotados_o_vencidos ?? 0) > 0 ? TriangleAlert : undefined}
            tono={(resumen?.agotados_o_vencidos ?? 0) > 0 ? 'advertencia' : 'neutro'}
            cargando={cifrasCargando}
            onClick={() => cambiarEstado('agotado')}
          />
        </KpiStrip>
      )}

      <ListToolbar
        busqueda={<SearchInput value={busqueda} onChange={cambiarBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} />}
        filtros={
          <FilterPanel conteo={estado !== 'todos' ? 1 : 0} onLimpiar={() => cambiarEstado('todos')} textoVerResultados={t('filtros.verResultados', { n: total })}>
            <FormField etiqueta={t('filtros.estado')}>
              {(c) => (
                <ChipsOpcion<FiltroEstadoCupon>
                  aria-labelledby={c.idEtiqueta}
                  valor={estado}
                  onValorChange={cambiarEstado}
                  opciones={FILTROS_ESTADO.map((v) => ({ valor: v, etiqueta: t(`filtros.estados.${v}`) }))}
                />
              )}
            </FormField>
          </FilterPanel>
        }
        chips={
          <FilterChips
            chips={estado !== 'todos' ? [{ clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`filtros.estados.${estado}`)}` }] : []}
            onQuitar={() => cambiarEstado('todos')}
            onLimpiarTodo={limpiarTodo}
          />
        }
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(c) => c.id}
        estado={estadoTabla}
        onFilaClick={(c) => router.push(rutaCupon(c.id))}
        etiquetaFila={(c) => c.code}
        acciones={acciones}
        tarjetaMovil={(c) => tarjeta(c)}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Ticket,
          accion: puedeGestionar ? { etiqueta: t('nuevo'), onClick: abrirNuevo, icono: Plus } : undefined,
          accionSecundaria: puedeGestionar ? { etiqueta: t('crearLote'), onClick: () => setLoteAbierto(true), icono: Layers } : undefined,
        }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={limpiarTodo}
        termino={busqueda || undefined}
        pie={estadoTabla === 'listo' ? pie : undefined}
      />

      <CuponFormDialog
        abierto={formAbierto}
        onAbiertoChange={setFormAbierto}
        cupon={editando}
        promociones={promociones}
        onGuardado={() => void cargar()}
      />
      <CrearLoteDialog
        abierto={loteAbierto}
        onAbiertoChange={setLoteAbierto}
        promociones={promociones}
        onCreado={(lote, datos) => {
          setLoteCreado({ lote, datos });
          void cargar();
        }}
      />
      <LoteCreadoDialog
        abierto={loteCreado !== null}
        onAbiertoChange={(v) => !v && setLoteCreado(null)}
        lote={loteCreado?.lote ?? null}
        datos={loteCreado?.datos ?? null}
      />
    </div>
  );
}
