'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Archive,
  ArchiveRestore,
  Coins,
  Copy,
  Download,
  Pause,
  Pencil,
  Play,
  Plus,
  ReceiptText,
  RefreshCw,
  Upload,
} from 'lucide-react';
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
  SegmentedControl,
  StatCard,
  calcularRango,
  clasesBoton,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useBranch } from '@/lib/context/BranchContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { CargosServicioService } from './cargosServicioService';
import { codigoErrorCargo } from './cargosLogica';
import {
  FILTROS_CARGO_INICIALES,
  conteoFiltrosCargo,
  estadoCargo,
  filtrarCargos,
  ordenarCargos,
  resumirCargos,
  textoValorCargo,
  type EstadoCargo,
  type FiltrosCargo,
} from './cargosVista';
import { CargoFormDialog } from './CargoFormDialog';
import { ImportarCargosDialog, descargarPlantillaCargos } from './ImportarCargosDialog';
import { APPLIES_TO_VALUES, type AppliesTo, type ImpuestoCargo, type ServiceCharge } from './types';

const TONO_ESTADO: Record<EstadoCargo, 'exito' | 'neutro' | 'advertencia'> = {
  activo: 'exito',
  inactivo: 'neutro',
  archivado: 'advertencia',
};

/**
 * Cargos de servicio v2 (Figma 1088:714506: listo, cargando, vacío, sin
 * resultados, error, sin permiso, menú ⋯, tableta y móvil).
 *
 * - La sucursal sale del header (`BranchBadgeActiva`): la lista trae los cargos
 *   de esa sucursal más los globales. Esta página no tiene selector propio.
 * - «Archivar» reemplaza al borrado físico; «Activar / Desactivar» vive en el ⋯.
 * - Escribir exige `billing_management`, resuelto en la base (RLS); aquí solo
 *   decide qué botones se ven.
 * - Los KPI de cobro (cobrado, ventas con cargo, quitados) dependen de
 *   `sale_service_charges`, que aún no existe: el POS todavía no cobra cargos
 *   (POS-CARGOS-SERVICIO-EN-VENTAS.md §6). Se muestran en «—» con su motivo,
 *   nunca con cifras inventadas.
 *
 * `embedded`: dentro del diálogo de Configuración › POS (sin migas ni cabecera móvil).
 */
export function CargosServicioContent({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('posCargos');
  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  const moneda = useMonedaOrganizacion();

  const [cargos, setCargos] = useState<ServiceCharge[]>([]);
  const [impuestos, setImpuestos] = useState<ImpuestoCargo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);

  const [filtros, setFiltros] = useState<FiltrosCargo>(FILTROS_CARGO_INICIALES);
  const [orden, setOrden] = useState<'asc' | 'desc'>('asc');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<ServiceCharge | null>(null);
  const [importarAbierto, setImportarAbierto] = useState(false);

  const cargar = useCallback(async () => {
    if (!organization?.id) return;
    setCargando(true);
    setError(null);
    try {
      // Una sola lectura (activos, inactivos y archivados): los KPI y los filtros
      // salen de la misma lista, no de un segundo `getAll()` sin filtros.
      const lista = await CargosServicioService.getAll({ branch_id: branchFilter ?? undefined });
      setCargos(lista);
    } catch (e) {
      setError(codigoErrorCargo(e));
    } finally {
      setCargando(false);
    }
  }, [organization?.id, branchFilter]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!organization?.id) return;
    let vigente = true;
    CargosServicioService.puedeGestionar()
      .then((p) => vigente && setPuedeGestionar(p))
      .catch(() => vigente && setPuedeGestionar(false));
    CargosServicioService.getImpuestos()
      .then((lista) => vigente && setImpuestos(lista))
      .catch(() => vigente && setImpuestos([]));
    return () => {
      vigente = false;
    };
  }, [organization?.id]);

  const resumen = useMemo(() => resumirCargos(cargos), [cargos]);
  const filtrados = useMemo(() => ordenarCargos(filtrarCargos(cargos, filtros), orden), [cargos, filtros, orden]);
  const rango = calcularRango(pagina, tamano, filtrados.length);
  const visibles = filtrados.slice(Math.max(0, rango.desde - 1), rango.hasta);

  const cambiarFiltros = (cambio: Partial<FiltrosCargo>) => {
    setFiltros((prev) => ({ ...prev, ...cambio }));
    setPagina(1);
  };
  const limpiarTodo = () => {
    setFiltros(FILTROS_CARGO_INICIALES);
    setPagina(1);
  };

  const nombreSucursal = (c: ServiceCharge) =>
    c.branch_id ? c.branch?.name ?? branches.find((b) => b.id === c.branch_id)?.name ?? `#${c.branch_id}` : t('todas');
  const textoImpuesto = (c: ServiceCharge) => (c.tax ? `${c.tax.name} ${Number(c.tax.rate)} %` : t('sinImpuesto'));
  const valor = (c: ServiceCharge) =>
    textoValorCargo(c, (n) => moneda.formatear(n), (n) => new Intl.NumberFormat(moneda.locale).format(n));
  const condicion = (c: ServiceCharge) => {
    if (c.min_guests) return { linea: t('condicion.comensales', { n: c.min_guests }), detalle: c.min_amount ? t('condicion.compraMinimaCorta', { monto: moneda.formatear(c.min_amount) }) : t('condicion.sinCompraMinima') };
    if (c.min_amount) return { linea: t('condicion.compraMinima'), detalle: moneda.formatear(c.min_amount) };
    return { linea: t('condicion.siempre'), detalle: null };
  };
  const condicionCorta = (c: ServiceCharge) => {
    if (c.min_guests) return t('condicion.comensales', { n: c.min_guests });
    if (c.min_amount) return t('condicion.compraMinimaCorta', { monto: moneda.formatear(c.min_amount) });
    return t('condicion.siempre');
  };

  const badgeEstado = (c: ServiceCharge) => {
    const e = estadoCargo(c);
    return (
      <Badge tono={TONO_ESTADO[e]} apariencia="suave" tamano="sm">
        {t(`estado.${e}`)}
      </Badge>
    );
  };
  const badgeCobro = (c: ServiceCharge) => (
    <Badge tono={c.is_optional ? 'neutro' : 'marca'} apariencia="suave" tamano="sm">
      {c.is_optional ? t('cobro.opcional') : t('cobro.obligatorio')}
    </Badge>
  );

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    try {
      await accion();
      toast.success(exito);
      void cargar();
    } catch (e) {
      toast.error(t(`errores.${codigoErrorCargo(e)}`));
    }
  };

  const abrirNuevo = () => {
    setEditando(null);
    setFormAbierto(true);
  };
  const abrirEditar = (c: ServiceCharge) => {
    setEditando(c);
    setFormAbierto(true);
  };

  const acciones = (c: ServiceCharge): AccionFila[] => {
    const e = estadoCargo(c);
    return [
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => abrirEditar(c), oculta: !puedeGestionar || e === 'archivado' },
      {
        id: 'duplicar',
        etiqueta: t('acciones.duplicar'),
        icono: Copy,
        onSelect: () => void ejecutar(() => CargosServicioService.duplicate(c.id, t('copiaSufijo')), t('toast.duplicado')),
        oculta: !puedeGestionar,
      },
      {
        id: 'ventas',
        etiqueta: t('acciones.verVentas'),
        icono: ReceiptText,
        onSelect: () => undefined,
        deshabilitada: true,
        motivo: t('acciones.verVentasMotivo'),
      },
      {
        id: 'activar',
        etiqueta: e === 'activo' ? t('acciones.desactivar') : t('acciones.activar'),
        icono: e === 'activo' ? Pause : Play,
        onSelect: () =>
          void ejecutar(
            () => CargosServicioService.toggleActive(c.id, e !== 'activo'),
            e === 'activo' ? t('toast.desactivado') : t('toast.activado'),
          ),
        oculta: !puedeGestionar || e === 'archivado',
      },
      {
        id: 'archivar',
        etiqueta: t('acciones.archivar'),
        icono: Archive,
        separadorAntes: true,
        onSelect: () => void ejecutar(() => CargosServicioService.archive(c.id), t('toast.archivado')),
        oculta: !puedeGestionar || e === 'archivado',
      },
      {
        id: 'restaurar',
        etiqueta: t('acciones.restaurar'),
        icono: ArchiveRestore,
        separadorAntes: true,
        onSelect: () => void ejecutar(() => CargosServicioService.restore(c.id), t('toast.restaurado')),
        oculta: !puedeGestionar || e !== 'archivado',
      },
    ];
  };

  const columnas: ColumnaTabla<ServiceCharge>[] = [
    {
      id: 'nombre',
      encabezado: t('columnas.nombre'),
      ordenable: true,
      celda: (c) => <span className="block truncate font-medium text-fg">{c.name}</span>,
    },
    { id: 'tipo', encabezado: t('columnas.tipo'), ocultarDebajo: 'xl', celda: (c) => t(`tipo.${c.charge_type}`) },
    { id: 'valor', encabezado: t('columnas.valor'), celda: valor },
    { id: 'aplica', encabezado: t('columnas.aplicaA'), celda: (c) => t(`aplicaA.${c.applies_to}`) },
    { id: 'impuesto', encabezado: t('columnas.impuesto'), ocultarDebajo: 'lg', celda: textoImpuesto },
    {
      id: 'condicion',
      encabezado: t('columnas.condicion'),
      celda: (c) => {
        const k = condicion(c);
        return (
          <div className="min-w-0">
            <p className="truncate">{k.linea}</p>
            {k.detalle && <p className="truncate text-xs text-fg-secondary">{k.detalle}</p>}
          </div>
        );
      },
    },
    { id: 'sucursal', encabezado: t('columnas.sucursal'), ocultarDebajo: 'xl', celda: nombreSucursal },
    { id: 'cobro', encabezado: t('columnas.cobro'), ocultarDebajo: 'lg', celda: badgeCobro },
    { id: 'estado', encabezado: t('columnas.estado'), celda: badgeEstado },
  ];

  const tarjeta = (c: ServiceCharge) => (
    <ListCard
      icono={Coins}
      titulo={c.name}
      subtitulo={`${t(`aplicaA.${c.applies_to}`)} · ${c.tax ? `${c.tax.name} ${Number(c.tax.rate)} %` : t('sinImpuesto')}`}
      meta={condicionCorta(c)}
      valor={valor(c)}
      estado={badgeEstado(c)}
      acciones={acciones(c)}
      onClick={puedeGestionar && !c.archived_at ? () => abrirEditar(c) : undefined}
    />
  );

  const sinPermiso = error === 'SIN_PERMISO';
  const estadoTabla: EstadoTabla = cargando && cargos.length === 0
    ? 'cargando'
    : sinPermiso
      ? 'sinPermiso'
      : error
        ? 'error'
        : resumen.total + resumen.archivados === 0
          ? 'vacio'
          : filtrados.length === 0
            ? 'sinResultados'
            : 'listo';
  const cifrasCargando = cargando && cargos.length === 0;

  const chips: ChipFiltro[] = [
    ...(filtros.estado !== 'todos' ? [{ clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`filtros.estados.${filtros.estado}`)}` }] : []),
    ...(filtros.aplicaA ? [{ clave: 'aplicaA', etiqueta: `${t('filtros.aplicaA')}: ${t(`aplicaA.${filtros.aplicaA}`)}` }] : []),
    ...(filtros.cobro !== 'todos' ? [{ clave: 'cobro', etiqueta: `${t('filtros.cobro')}: ${t(`cobro.${filtros.cobro}`)}` }] : []),
  ];
  const quitarChip = (clave: string) => {
    if (clave === 'estado') cambiarFiltros({ estado: 'todos' });
    if (clave === 'aplicaA') cambiarFiltros({ aplicaA: null });
    if (clave === 'cobro') cambiarFiltros({ cobro: 'todos' });
  };

  const accionesCabecera: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: () => void cargar() },
    { id: 'importar', etiqueta: t('importarBoton'), icono: Upload, onSelect: () => setImportarAbierto(true), oculta: !puedeGestionar },
    { id: 'plantilla', etiqueta: t('plantilla'), icono: Download, onSelect: descargarPlantillaCargos, oculta: !puedeGestionar },
    { id: 'archivados', etiqueta: t('verArchivados'), icono: Archive, onSelect: () => cambiarFiltros({ estado: 'archivados' }), separadorAntes: true },
  ];

  const botonNuevo = puedeGestionar ? (
    <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={abrirNuevo}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('nuevo')}
    </button>
  ) : null;

  const pie = (
    <Pagination
      pagina={rango.pagina}
      tamano={tamano}
      total={filtrados.length}
      onPaginaChange={setPagina}
      onTamanoChange={(n) => {
        setTamano(n);
        setPagina(1);
      }}
      sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
      cargando={cargando}
    />
  );

  const subtituloMovil = branchFilter ? branches.find((b) => b.id === branchFilter)?.name : t('todasSucursales');

  return (
    <div className={embedded ? 'flex flex-col gap-4' : 'flex flex-col gap-4 p-4 sm:p-6'}>
      <PageHeader
        titulo={t('titulo')}
        icono={Coins}
        migas={embedded ? undefined : [{ etiqueta: t('migaPos'), href: '/app/pos' }, { etiqueta: t('titulo') }]}
        subtitulo={t('subtitulo')}
        debajo={embedded ? undefined : <BranchBadgeActiva />}
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
              <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setImportarAbierto(true)}>
                <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('importarBoton')}
              </button>
            )}
            {botonNuevo}
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={accionesCabecera.filter((a) => a.id !== 'actualizar' && a.id !== 'importar')}
            />
          </>
        }
        movil={
          embedded
            ? false
            : {
                subtitulo: subtituloMovil,
                menu: [
                  ...(puedeGestionar ? [{ id: 'nuevo', etiqueta: t('nuevo'), icono: Plus, onSelect: abrirNuevo }] : []),
                  ...accionesCabecera,
                ],
              }
        }
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard
          etiqueta={t('kpi.activos')}
          valor={t('kpi.activosValor', { activos: resumen.activos, total: resumen.total })}
          detalle={t('kpi.inactivos', { n: resumen.inactivos })}
          icono={Coins}
          cargando={cifrasCargando}
          onClick={() => cambiarFiltros({ estado: 'activos' })}
        />
        <StatCard etiqueta={t('kpi.cobrado')} valor="—" detalle={t('kpi.sinCobro')} cargando={cifrasCargando} />
        <StatCard etiqueta={t('kpi.ventasConCargo')} valor="—" detalle={t('kpi.sinCobro')} cargando={cifrasCargando} />
        <StatCard
          etiqueta={t('kpi.quitados')}
          valor="—"
          detalle={t('kpi.sinCobro')}
          cargando={cifrasCargando}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={
          <SearchInput
            value={filtros.q}
            onChange={(v: string) => cambiarFiltros({ q: v })}
            onValueChange={(v: string) => cambiarFiltros({ q: v })}
            placeholder={t('buscar')}
            etiqueta={t('buscar')}
          />
        }
        filtros={
          <FilterPanel
            conteo={conteoFiltrosCargo(filtros)}
            onLimpiar={limpiarTodo}
            textoVerResultados={t('filtros.verResultados', { n: filtrados.length })}
          >
            <FormField etiqueta={t('filtros.estado')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={filtros.estado}
                  onValorChange={(v) => cambiarFiltros({ estado: v })}
                  opciones={(['todos', 'activos', 'inactivos', 'archivados'] as const).map((v) => ({ valor: v, etiqueta: t(`filtros.estados.${v}`) }))}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.aplicaA')} ayuda={t('filtros.aplicaAAyuda')}>
              {(c) => (
                <ChipsOpcion<AppliesTo>
                  aria-labelledby={c.idEtiqueta}
                  opciones={APPLIES_TO_VALUES.filter((v) => v !== 'all').map((v) => ({ valor: v, etiqueta: t(`aplicaA.${v}`) }))}
                  valor={filtros.aplicaA}
                  onValorChange={(v) => cambiarFiltros({ aplicaA: filtros.aplicaA === v ? null : v })}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.cobro')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={filtros.cobro}
                  onValorChange={(v) => cambiarFiltros({ cobro: v })}
                  opciones={(['todos', 'obligatorio', 'opcional'] as const).map((v) => ({ valor: v, etiqueta: v === 'todos' ? t('filtros.estados.todos') : t(`cobro.${v}`) }))}
                />
              )}
            </FormField>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiarTodo} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(c) => String(c.id)}
        estado={estadoTabla}
        orden={{ campo: 'nombre', direccion: orden }}
        onOrdenar={() => setOrden((o) => (o === 'asc' ? 'desc' : 'asc'))}
        onFilaClick={puedeGestionar ? (c) => !c.archived_at && abrirEditar(c) : undefined}
        etiquetaFila={(c) => c.name}
        acciones={acciones}
        tarjetaMovil={(c) => tarjeta(c)}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Coins,
          accion: puedeGestionar ? { etiqueta: t('nuevo'), onClick: abrirNuevo, icono: Plus } : undefined,
          accionSecundaria: puedeGestionar ? { etiqueta: t('importarBoton'), onClick: () => setImportarAbierto(true), icono: Upload } : undefined,
        }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={limpiarTodo}
        termino={filtros.q || undefined}
        pie={estadoTabla === 'listo' ? pie : undefined}
      />

      <CargoFormDialog
        abierto={formAbierto}
        onAbiertoChange={setFormAbierto}
        cargo={editando}
        impuestos={impuestos}
        sucursales={branches.flatMap((b) => (typeof b.id === 'number' ? [{ id: b.id, name: b.name }] : []))}
        sucursalInicial={branchFilter}
        onGuardado={() => void cargar()}
      />
      <ImportarCargosDialog abierto={importarAbierto} onAbiertoChange={setImportarAbierto} onImportado={() => void cargar()} />
    </div>
  );
}
