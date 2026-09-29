'use client';

/**
 * Clientes — listado (Figma «GO Admin — Sistema de diseño», página 06
 * Clientes: escritorio CAT-* y móvil 711:352480…711:352552).
 *
 * Todo lo que escala con el número de clientes va al servidor: búsqueda,
 * filtros, orden y página viven en la URL (useListadoServidor) y se resuelven
 * en `fn_clientes_listado`, que además agrega saldo, cartera y compras en la
 * misma llamada. Ver src/lib/services/clientesListadoService.ts.
 *
 * `/app/crm/clientes` reutiliza esta misma página.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Download,
  FileSpreadsheet,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Tag,
  Tags,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  Merge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BulkActionBar,
  DataTable,
  EmptyState,
  FilterChips,
  FilterPanel,
  KpiStrip,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  useEsEscritorio,
  useListadoServidor,
  type AccionFila,
  type AccionMasiva,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero, useKitT, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz, todayInTz } from '@/lib/utils/dateDisplay';
import { formatMonedaSinDecimales, useOrgCurrency } from '@/lib/hooks/useOrgCurrency';
import {
  CAMPOS_ORDEN_CLIENTES,
  FILTROS_CLIENTES,
  cambiarRolMasivo,
  construirCsvClientes,
  descargarCsv,
  listarClientes,
  nombreCliente,
  obtenerIdsClientes,
  obtenerOpcionesFiltroClientes,
  obtenerResumenClientes,
  obtenerTodasLasFilas,
  type CriteriosClientes,
  type FilaCliente,
  type OpcionesFiltroClientes,
  type ResumenClientes,
} from '@/lib/services/clientesListadoService';
import { construirAccionesCliente, type ClienteParaAcciones } from '@/components/clientes/listado/accionesCliente';
import { useMensajeErrorClientes, useOperacionesClientes } from '@/components/clientes/listado/useOperacionesClientes';
import { CamposFiltroClientes, chipsClientes } from '@/components/clientes/listado/FiltrosClientes';
import { columnasClientes, TarjetaCliente } from '@/components/clientes/listado/columnasClientes';
import { EtiquetaMasivaDialog } from '@/components/clientes/listado/EtiquetaMasivaDialog';
import { EliminarClientesDialog } from '@/components/clientes/listado/EliminarClientesDialog';
import { ImportarClientesDialog, descargarPlantillaClientes } from '@/components/clientes/listado/ImportarClientesDialog';

const OPCIONES_VACIAS: OpcionesFiltroClientes = { roles: [], etiquetas: [], municipios: [] };

export default function ClientesPage() {
  return (
    <Suspense fallback={null}>
      <ListadoClientes />
    </Suspense>
  );
}

function ListadoClientes() {
  const t = useTranslations('clientes.listado');
  const tk = useKitT();
  const entero = useFormatoEntero();
  const localeIntl = useLocaleIntl();
  const mensajeError = useMensajeErrorClientes();
  const sustantivo = useMemo(() => ({ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }), [t]);
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const { organization, isLoading: cargandoOrg, error: errorOrg } = useOrganization();
  const orgId = organization?.id ? Number(organization.id) : null;
  const { branchFilter } = useBranch();
  const moneda = useOrgCurrency();
  const { timezone } = useFormatDate();

  const listado = useListadoServidor({
    filtros: FILTROS_CLIENTES,
    camposOrden: CAMPOS_ORDEN_CLIENTES,
    ordenPorDefecto: { campo: 'nombre', direccion: 'asc' },
    tamanoPorDefecto: 10,
  });
  const { busqueda, filtros, orden, pagina, tamano } = listado;
  const criterios: CriteriosClientes = useMemo(() => ({ busqueda, ...filtros }), [busqueda, filtros]);
  const claveCriterios = JSON.stringify([criterios, branchFilter]);

  const [filas, setFilas] = useState<FilaCliente[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenClientes | null>(null);
  const [opciones, setOpciones] = useState<OpcionesFiltroClientes>(OPCIONES_VACIAS);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [dialogoEtiqueta, setDialogoEtiqueta] = useState<'agregar' | 'quitar' | null>(null);
  const [eliminar, setEliminar] = useState<{ ids: string[]; nombre?: string } | null>(null);
  const [importarAbierto, setImportarAbierto] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  // ── Página actual ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    listarClientes({
      organizationId: orgId,
      branchId: branchFilter ?? null,
      criterios,
      orden,
      desde: (pagina - 1) * tamano,
      tamano,
    })
      .then(({ filas: f, total: t }) => {
        if (cancelado) return;
        setFilas(f);
        setTotal(t);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(mensajeError(err, tk('vacio.error.descripcion')));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // `criterios` y `branchFilter` van por su clave serializada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, claveCriterios, orden?.campo, orden?.direccion, pagina, tamano, recarga]);

  // ── Resumen y catálogos de filtro ─────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    obtenerResumenClientes(orgId, branchFilter ?? null)
      .then((r) => !cancelado && setResumen(r))
      .catch(() => !cancelado && setResumen(null));
    return () => {
      cancelado = true;
    };
  }, [orgId, branchFilter, recarga]);

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    obtenerOpcionesFiltroClientes(orgId)
      .then((o) => !cancelado && setOpciones(o))
      .catch(() => !cancelado && setOpciones(OPCIONES_VACIAS));
    return () => {
      cancelado = true;
    };
  }, [orgId, recarga]);

  // Cambiar de criterio vacía la selección: nunca se actúa sobre lo que no se ve.
  useEffect(() => {
    setSeleccion(new Set());
  }, [claveCriterios]);

  // ── Operaciones ───────────────────────────────────────────────────────────
  const { cambiarEstado, copiarId } = useOperacionesClientes(orgId, recargar);
  const formatearFecha = useCallback(
    (v: string) => formatDateInTz(v, timezone, { locale: localeIntl, day: '2-digit', month: 'short', year: 'numeric' }),
    [timezone, localeIntl],
  );

  const accionesDe = useCallback(
    (fila: FilaCliente): AccionFila[] => {
      const cliente: ClienteParaAcciones = { id: fila.id, nombre: nombreCliente(fila), phone: fila.phone, status: fila.status };
      return construirAccionesCliente(cliente, {
        navegar: (ruta) => router.push(ruta),
        onCambiarEstado: (c, estado) => void cambiarEstado([c.id], estado, c.nombre),
        onEliminar: (c) => setEliminar({ ids: [c.id], nombre: c.nombre }),
        onCopiarId: (c) => void copiarId(c.id),
        t,
      });
    },
    [router, cambiarEstado, copiarId, t],
  );

  const exportar = async (ids?: string[]) => {
    if (!orgId) return;
    setOcupado('exportar');
    try {
      const todas = await obtenerTodasLasFilas({ organizationId: orgId, branchId: branchFilter ?? null, criterios, orden, ids });
      if (todas.length === 0) {
        toast.info(t('toasts.sinExportar'));
        return;
      }
      const hoy = todayInTz(timezone);
      descargarCsv(construirCsvClientes(todas, timezone), ids ? `clientes_seleccionados_${hoy}.csv` : `clientes_${hoy}.csv`);
      toast.success(t('toasts.exportados', { count: todas.length, n: entero(todas.length) }));
    } catch (err) {
      toast.error(mensajeError(err, t('toasts.errorExportar')));
    } finally {
      setOcupado(null);
    }
  };

  const seleccionarTodos = async () => {
    if (!orgId) return;
    setOcupado('seleccionar');
    try {
      const ids = await obtenerIdsClientes(orgId, branchFilter ?? null, criterios);
      setSeleccion(new Set(ids));
      if (ids.length < total) toast.info(t('toasts.primerosSeleccionados', { n: entero(ids.length) }));
    } catch (err) {
      toast.error(mensajeError(err, t('toasts.errorSeleccionar')));
    } finally {
      setOcupado(null);
    }
  };

  const cambiarRol = async (rol: string, quitar: boolean) => {
    if (!orgId) return;
    setOcupado('roles');
    try {
      const n = await cambiarRolMasivo(orgId, [...seleccion], rol, quitar);
      const nombre = opciones.roles.find((r) => r.valor === rol)?.etiqueta ?? rol;
      toast.success(t(quitar ? 'toasts.rolQuitado' : 'toasts.rolAgregado', { rol: nombre, count: n, n: entero(n) }));
      setSeleccion(new Set());
      recargar();
    } catch (err) {
      toast.error(mensajeError(err, t('toasts.errorRoles')));
    } finally {
      setOcupado(null);
    }
  };

  // ── Estado de la tabla ────────────────────────────────────────────────────
  const estado: EstadoTabla = error
    ? 'error'
    : cargando || cargandoOrg || !orgId
      ? 'cargando'
      : filas.length === 0 && listado.hayCriterios
        ? 'sinResultados'
        : 'listo';

  const columnas = useMemo(
    () => columnasClientes({ moneda, formatearFecha, roles: opciones.roles, t, entero }),
    [moneda, formatearFecha, opciones.roles, t, entero],
  );
  const chips = chipsClientes(filtros, opciones, t);
  const verInactivos = filtros.estado === 'inactivos';

  const subtituloMovil = resumen
    ? t('cabecera.subtituloMovil', {
        count: resumen.total,
        total: entero(resumen.total),
        conSaldo: entero(resumen.con_saldo),
        vencidos: entero(resumen.vencidos),
      })
    : undefined;

  // ── Barra masiva ──────────────────────────────────────────────────────────
  const idsSeleccion = [...seleccion];
  // Solo los roles del catálogo `customer_roles` (fn_clientes_rol_masivo rechaza
  // los demás). Los que solo existen en los datos llegan con etiqueta = valor.
  const rolesCatalogo = opciones.roles.filter((r) => r.etiqueta && r.etiqueta !== r.valor);
  const accionesMasivas: AccionMasiva[] = [
    {
      id: 'exportar',
      etiqueta: t('masivas.exportar'),
      icono: Download,
      onClick: () => void exportar(idsSeleccion),
      cargando: ocupado === 'exportar',
    },
    { id: 'etiquetar', etiqueta: t('masivas.etiquetar'), icono: Tag, onClick: () => setDialogoEtiqueta('agregar') },
    { id: 'quitar-etiqueta', etiqueta: t('masivas.quitarEtiqueta'), icono: Tags, onClick: () => setDialogoEtiqueta('quitar') },
    {
      id: 'roles',
      etiqueta: t('masivas.roles'),
      icono: Users,
      onClick: () => undefined,
      cargando: ocupado === 'roles',
      menu: [
        {
          titulo: t('masivas.agregarRol'),
          acciones: rolesCatalogo.map((r) => ({
            id: `agregar-${r.valor}`,
            etiqueta: r.etiqueta ?? r.valor,
            icono: UserPlus,
            onSelect: () => void cambiarRol(r.valor, false),
          })),
        },
        {
          titulo: t('masivas.quitarRol'),
          acciones: rolesCatalogo.map((r) => ({
            id: `quitar-${r.valor}`,
            etiqueta: r.etiqueta ?? r.valor,
            icono: UserMinus,
            onSelect: () => void cambiarRol(r.valor, true),
          })),
        },
      ],
    },
    {
      id: 'eliminar',
      etiqueta: t('masivas.eliminar'),
      icono: Trash2,
      destructiva: true,
      onClick: () => setEliminar({ ids: idsSeleccion }),
    },
  ];
  const accionesSecundarias: AccionFila[] = [
    verInactivos
      ? {
          id: 'reactivar',
          etiqueta: t('masivas.reactivar'),
          icono: RotateCcw,
          onSelect: () => void cambiarEstado(idsSeleccion, 'active').then(() => setSeleccion(new Set())),
        }
      : {
          id: 'inactivar',
          etiqueta: t('masivas.marcarInactivos'),
          icono: Power,
          onSelect: () => void cambiarEstado(idsSeleccion, 'inactive').then(() => setSeleccion(new Set())),
        },
    {
      id: 'unificar',
      etiqueta: t('masivas.unificar'),
      icono: Merge,
      onSelect: () => undefined,
      deshabilitada: true,
      motivo: t('motivos.unificar'),
    },
  ];

  // ── Cabecera ──────────────────────────────────────────────────────────────
  const masAcciones: AccionFila[] = [
    { id: 'importar', etiqueta: t('cabecera.importarClientes'), icono: Upload, onSelect: () => setImportarAbierto(true) },
    {
      id: 'plantilla',
      etiqueta: t('cabecera.descargarPlantilla'),
      icono: FileSpreadsheet,
      onSelect: descargarPlantillaClientes,
    },
  ];
  const masAccionesMovil: AccionFila[] = [
    { id: 'exportar', etiqueta: t('cabecera.exportar'), icono: Download, onSelect: () => void exportar() },
    ...masAcciones,
    { id: 'actualizar', etiqueta: t('cabecera.actualizar'), icono: RefreshCw, onSelect: recargar },
  ];

  if ((errorOrg || !orgId) && !cargandoOrg) {
    return (
      <div className="min-h-full bg-canvas p-4 lg:p-6">
        <EmptyState
          variante="error"
          titulo={t('errorOrg.titulo')}
          descripcion={typeof errorOrg === 'string' ? errorOrg : t('errorOrg.descripcion')}
          onReintentar={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('cabecera.titulo')}
        subtitulo={t('cabecera.subtitulo')}
        icono={Users}
        cargando={cargando}
        migas={[{ etiqueta: t('cabecera.inicio'), href: '/app/inicio' }, { etiqueta: t('cabecera.clientes') }]}
        acciones={
          <>
            <Button
              variant="outline"
              size="icon"
              className="size-10"
              onClick={recargar}
              disabled={cargando}
              aria-label={t('cabecera.actualizar')}
              title={t('cabecera.actualizar')}
            >
              <RefreshCw aria-hidden="true" className={cargando ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => void exportar()}
              disabled={ocupado === 'exportar'}
              title={t('cabecera.exportarCsv')}
            >
              <Download aria-hidden="true" className="mr-2 size-4" />
              {t('cabecera.exportar')}
            </Button>
            <Button asChild className="h-10">
              <Link href="/app/clientes/new">
                <Plus aria-hidden="true" className="mr-2 size-4" />
                {t('cabecera.nuevoCliente')}
              </Link>
            </Button>
            <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="md" titulo={t('cabecera.masAcciones')} />
          </>
        }
        movil={{
          titulo: t('cabecera.clientes'),
          subtitulo: subtituloMovil,
          accion: (
            <div className="flex items-center gap-1">
              <Link
                href="/app/clientes/new"
                aria-label={t('cabecera.nuevoCliente')}
                className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </Link>
              <RowActionsMenu acciones={masAccionesMovil} orientacion="horizontal" titulo={t('cabecera.clientes')} />
            </div>
          ),
        }}
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')} className="hidden lg:grid">
        <StatCard
          etiqueta={t('kpi.total')}
          icono={Users}
          valor={resumen ? entero(resumen.total) : '—'}
          detalle={resumen ? t('kpi.nuevosMes', { n: entero(resumen.nuevos_mes) }) : undefined}
          cargando={!resumen}
        />
        <StatCard
          etiqueta={t('kpi.conSaldo')}
          valor={resumen ? entero(resumen.con_saldo) : '—'}
          detalle={resumen ? t('kpi.deTotal', { count: resumen.total, n: entero(resumen.total) }) : undefined}
          tono="advertencia"
          cargando={!resumen}
          onClick={() => listado.setFiltro('saldo', 'con_saldo')}
        />
        <StatCard
          etiqueta={t('kpi.cuentasPorCobrar')}
          valor={resumen ? formatMonedaSinDecimales(resumen.cartera_total, moneda) : '—'}
          detalle={t('kpi.monedaOrg', { moneda })}
          cargando={!resumen}
        />
        <StatCard
          etiqueta={t('kpi.vencidas')}
          valor={resumen ? entero(resumen.vencidos) : '—'}
          detalle={
            resumen ? t('kpi.montoVencido', { monto: formatMonedaSinDecimales(resumen.cartera_vencida, moneda) }) : undefined
          }
          tono="peligro"
          tendencia={resumen && resumen.vencidos > 0 ? 'baja' : undefined}
          cargando={!resumen}
          onClick={() => listado.setFiltro('saldo', 'vencido')}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={
          <SearchInput
            value={busqueda}
            onChange={listado.setBusqueda}
            placeholder={escritorio ? t('busqueda.placeholderEscritorio') : t('busqueda.placeholderMovil')}
            etiqueta={t('busqueda.etiqueta')}
            cargando={cargando && !!busqueda}
          />
        }
        filtros={
          <FilterPanel
            conteo={listado.filtrosActivos}
            onLimpiar={listado.limpiarFiltros}
            textoVerResultados={cargando ? undefined : t('filtros.verN', { count: total, n: entero(total) })}
          >
            <CamposFiltroClientes listado={listado} opciones={opciones} conOrden={!escritorio} />
          </FilterPanel>
        }
        chips={
          <FilterChips chips={chips} onQuitar={(clave) => listado.setFiltro(clave, null)} onLimpiarTodo={listado.limpiarFiltros} />
        }
      />

      <DataTable
        etiqueta={t('cabecera.clientes')}
        columnas={columnas}
        filas={filas}
        obtenerId={(c) => c.id}
        estado={estado}
        orden={orden}
        onOrdenar={listado.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={(c) => router.push(`/app/clientes/${c.id}`)}
        etiquetaFila={nombreCliente}
        acciones={accionesDe}
        tarjetaMovil={(c, ctx) => (
          <TarjetaCliente
            cliente={c}
            ctx={ctx}
            acciones={accionesDe(c)}
            onAbrir={() => router.push(`/app/clientes/${c.id}`)}
          />
        )}
        vacio={{
          titulo: verInactivos ? t('vacio.inactivosTitulo') : t('vacio.titulo'),
          descripcion: verInactivos ? t('vacio.inactivosDescripcion') : t('vacio.descripcion'),
          icono: Users,
          accion: { etiqueta: t('cabecera.nuevoCliente'), href: '/app/clientes/new', icono: Plus },
          accionSecundaria: { etiqueta: t('vacio.importarCsv'), onClick: () => setImportarAbierto(true), icono: Upload },
        }}
        sinResultados={{ descripcion: t('vacio.sinResultados') }}
        error={{ descripcion: error ?? undefined }}
        onReintentar={recargar}
        onLimpiarFiltros={listado.limpiarTodo}
        termino={busqueda}
        pie={
          <Pagination
            pagina={pagina}
            tamano={tamano}
            total={total}
            onPaginaChange={listado.setPagina}
            onTamanoChange={listado.setTamano}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        onSeleccionarTodos={ocupado === 'seleccionar' ? undefined : () => void seleccionarTodos()}
        sustantivo={sustantivo}
        acciones={accionesMasivas}
        accionesSecundarias={accionesSecundarias}
        onLimpiar={() => setSeleccion(new Set())}
      />

      <EtiquetaMasivaDialog
        abierto={dialogoEtiqueta !== null}
        onAbiertoChange={(v) => !v && setDialogoEtiqueta(null)}
        modo={dialogoEtiqueta ?? 'agregar'}
        organizationId={orgId}
        ids={idsSeleccion}
        sugerencias={opciones.etiquetas}
        onHecho={() => {
          setSeleccion(new Set());
          recargar();
        }}
      />

      <EliminarClientesDialog
        abierto={eliminar !== null}
        onAbiertoChange={(v) => !v && setEliminar(null)}
        organizationId={orgId}
        ids={eliminar?.ids ?? SIN_IDS}
        nombre={eliminar?.nombre}
        onHecho={() => {
          setSeleccion(new Set());
          recargar();
        }}
      />

      <ImportarClientesDialog
        abierto={importarAbierto}
        onAbiertoChange={setImportarAbierto}
        organizationId={orgId}
        onImportado={recargar}
      />
    </div>
  );
}

const SIN_IDS: string[] = [];
