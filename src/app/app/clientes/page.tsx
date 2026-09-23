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
  mensajeErrorClientes,
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
import { construirAccionesCliente, MOTIVO_UNIFICAR, type ClienteParaAcciones } from '@/components/clientes/listado/accionesCliente';
import { useOperacionesClientes } from '@/components/clientes/listado/useOperacionesClientes';
import { CamposFiltroClientes, chipsClientes } from '@/components/clientes/listado/FiltrosClientes';
import { columnasClientes, TarjetaCliente } from '@/components/clientes/listado/columnasClientes';
import { EtiquetaMasivaDialog } from '@/components/clientes/listado/EtiquetaMasivaDialog';
import { EliminarClientesDialog } from '@/components/clientes/listado/EliminarClientesDialog';
import { ImportarClientesDialog, descargarPlantillaClientes } from '@/components/clientes/listado/ImportarClientesDialog';

const SUSTANTIVO = { singular: 'cliente', plural: 'clientes' } as const;
const OPCIONES_VACIAS: OpcionesFiltroClientes = { roles: [], etiquetas: [], municipios: [] };
const entero = (n: number) => new Intl.NumberFormat('es-CO').format(n);

export default function ClientesPage() {
  return (
    <Suspense fallback={null}>
      <ListadoClientes />
    </Suspense>
  );
}

function ListadoClientes() {
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
        setError(mensajeErrorClientes(err, 'Revisa tu conexión e inténtalo de nuevo.'));
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
    (v: string) => formatDateInTz(v, timezone, { locale: 'es-CO', day: '2-digit', month: 'short', year: 'numeric' }),
    [timezone],
  );

  const accionesDe = useCallback(
    (fila: FilaCliente): AccionFila[] => {
      const cliente: ClienteParaAcciones = { id: fila.id, nombre: nombreCliente(fila), phone: fila.phone, status: fila.status };
      return construirAccionesCliente(cliente, {
        navegar: (ruta) => router.push(ruta),
        onCambiarEstado: (c, estado) => void cambiarEstado([c.id], estado, c.nombre),
        onEliminar: (c) => setEliminar({ ids: [c.id], nombre: c.nombre }),
        onCopiarId: (c) => void copiarId(c.id),
      });
    },
    [router, cambiarEstado, copiarId],
  );

  const exportar = async (ids?: string[]) => {
    if (!orgId) return;
    setOcupado('exportar');
    try {
      const todas = await obtenerTodasLasFilas({ organizationId: orgId, branchId: branchFilter ?? null, criterios, orden, ids });
      if (todas.length === 0) {
        toast.info('No hay clientes para exportar');
        return;
      }
      const hoy = todayInTz(timezone);
      descargarCsv(construirCsvClientes(todas, timezone), ids ? `clientes_seleccionados_${hoy}.csv` : `clientes_${hoy}.csv`);
      toast.success(`${entero(todas.length)} ${todas.length === 1 ? 'cliente exportado' : 'clientes exportados'}`);
    } catch (err) {
      toast.error(mensajeErrorClientes(err, 'No se pudo exportar'));
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
      if (ids.length < total) toast.info(`Se seleccionaron los primeros ${entero(ids.length)} clientes`);
    } catch (err) {
      toast.error(mensajeErrorClientes(err, 'No se pudo seleccionar todo'));
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
      toast.success(`Rol «${nombre}» ${quitar ? 'quitado de' : 'agregado a'} ${n} ${n === 1 ? 'cliente' : 'clientes'}`);
      setSeleccion(new Set());
      recargar();
    } catch (err) {
      toast.error(mensajeErrorClientes(err, 'No se pudieron cambiar los roles'));
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
    () => columnasClientes({ moneda, formatearFecha, roles: opciones.roles }),
    [moneda, formatearFecha, opciones.roles],
  );
  const chips = chipsClientes(filtros, opciones);
  const verInactivos = filtros.estado === 'inactivos';

  const subtituloMovil = resumen
    ? `${entero(resumen.total)} clientes · ${entero(resumen.con_saldo)} con saldo · ${entero(resumen.vencidos)} vencidos`
    : undefined;

  // ── Barra masiva ──────────────────────────────────────────────────────────
  const idsSeleccion = [...seleccion];
  // Solo los roles del catálogo `customer_roles` (fn_clientes_rol_masivo rechaza
  // los demás). Los que solo existen en los datos llegan con etiqueta = valor.
  const rolesCatalogo = opciones.roles.filter((r) => r.etiqueta && r.etiqueta !== r.valor);
  const accionesMasivas: AccionMasiva[] = [
    { id: 'exportar', etiqueta: 'Exportar', icono: Download, onClick: () => void exportar(idsSeleccion), cargando: ocupado === 'exportar' },
    { id: 'etiquetar', etiqueta: 'Etiquetar', icono: Tag, onClick: () => setDialogoEtiqueta('agregar') },
    { id: 'quitar-etiqueta', etiqueta: 'Quitar etiqueta', icono: Tags, onClick: () => setDialogoEtiqueta('quitar') },
    {
      id: 'roles',
      etiqueta: 'Roles',
      icono: Users,
      onClick: () => undefined,
      cargando: ocupado === 'roles',
      menu: [
        {
          titulo: 'Agregar rol',
          acciones: rolesCatalogo.map((r) => ({
            id: `agregar-${r.valor}`,
            etiqueta: r.etiqueta ?? r.valor,
            icono: UserPlus,
            onSelect: () => void cambiarRol(r.valor, false),
          })),
        },
        {
          titulo: 'Quitar rol',
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
      etiqueta: 'Eliminar',
      icono: Trash2,
      destructiva: true,
      onClick: () => setEliminar({ ids: idsSeleccion }),
    },
  ];
  const accionesSecundarias: AccionFila[] = [
    verInactivos
      ? {
          id: 'reactivar',
          etiqueta: 'Reactivar',
          icono: RotateCcw,
          onSelect: () => void cambiarEstado(idsSeleccion, 'active').then(() => setSeleccion(new Set())),
        }
      : {
          id: 'inactivar',
          etiqueta: 'Marcar inactivos',
          icono: Power,
          onSelect: () => void cambiarEstado(idsSeleccion, 'inactive').then(() => setSeleccion(new Set())),
        },
    {
      id: 'unificar',
      etiqueta: 'Unificar duplicados',
      icono: Merge,
      onSelect: () => undefined,
      deshabilitada: true,
      motivo: MOTIVO_UNIFICAR,
    },
  ];

  // ── Cabecera ──────────────────────────────────────────────────────────────
  const masAcciones: AccionFila[] = [
    { id: 'importar', etiqueta: 'Importar clientes', icono: Upload, onSelect: () => setImportarAbierto(true) },
    { id: 'plantilla', etiqueta: 'Descargar plantilla', icono: FileSpreadsheet, onSelect: descargarPlantillaClientes },
  ];
  const masAccionesMovil: AccionFila[] = [
    { id: 'exportar', etiqueta: 'Exportar', icono: Download, onSelect: () => void exportar() },
    ...masAcciones,
    { id: 'actualizar', etiqueta: 'Actualizar', icono: RefreshCw, onSelect: recargar },
  ];

  if ((errorOrg || !orgId) && !cargandoOrg) {
    return (
      <div className="min-h-full bg-canvas p-4 lg:p-6">
        <EmptyState
          variante="error"
          titulo="No pudimos identificar tu organización"
          descripcion={typeof errorOrg === 'string' ? errorOrg : 'Vuelve a iniciar sesión e inténtalo de nuevo.'}
          onReintentar={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo="Gestión de Clientes"
        subtitulo="Administra tu cartera de clientes"
        icono={Users}
        cargando={cargando}
        migas={[{ etiqueta: 'Inicio', href: '/app/inicio' }, { etiqueta: 'Clientes' }]}
        acciones={
          <>
            <Button
              variant="outline"
              size="icon"
              className="size-10"
              onClick={recargar}
              disabled={cargando}
              aria-label="Actualizar"
              title="Actualizar"
            >
              <RefreshCw aria-hidden="true" className={cargando ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
            <Button variant="outline" className="h-10" onClick={() => void exportar()} disabled={ocupado === 'exportar'} title="Exportar a CSV">
              <Download aria-hidden="true" className="mr-2 size-4" />
              Exportar
            </Button>
            <Button asChild className="h-10">
              <Link href="/app/clientes/new">
                <Plus aria-hidden="true" className="mr-2 size-4" />
                Nuevo cliente
              </Link>
            </Button>
            <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="md" titulo="Más acciones" />
          </>
        }
        movil={{
          titulo: 'Clientes',
          subtitulo: subtituloMovil,
          ocultarBarra: seleccion.size > 0,
          accion: (
            <div className="flex items-center gap-1">
              <Link
                href="/app/clientes/new"
                aria-label="Nuevo cliente"
                className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </Link>
              <RowActionsMenu acciones={masAccionesMovil} orientacion="horizontal" titulo="Clientes" />
            </div>
          ),
        }}
      />

      <KpiStrip etiqueta="Resumen de clientes" className="hidden lg:grid">
        <StatCard
          etiqueta="Total clientes"
          icono={Users}
          valor={resumen ? entero(resumen.total) : '—'}
          detalle={resumen ? `+${entero(resumen.nuevos_mes)} este mes` : undefined}
          cargando={!resumen}
        />
        <StatCard
          etiqueta="Con saldo"
          valor={resumen ? entero(resumen.con_saldo) : '—'}
          detalle={resumen ? `de ${entero(resumen.total)} clientes` : undefined}
          tono="advertencia"
          cargando={!resumen}
          onClick={() => listado.setFiltro('saldo', 'con_saldo')}
        />
        <StatCard
          etiqueta="Cuentas por cobrar"
          valor={resumen ? formatMonedaSinDecimales(resumen.cartera_total, moneda) : '—'}
          detalle={`Moneda de la organización (${moneda})`}
          cargando={!resumen}
        />
        <StatCard
          etiqueta="Cuentas vencidas"
          valor={resumen ? entero(resumen.vencidos) : '—'}
          detalle={resumen ? `${formatMonedaSinDecimales(resumen.cartera_vencida, moneda)} vencidos` : undefined}
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
            placeholder={escritorio ? 'Buscar por nombre, documento, correo o teléfono' : 'Buscar cliente, NIT o teléfono'}
            etiqueta="Buscar clientes"
            cargando={cargando && !!busqueda}
          />
        }
        filtros={
          <FilterPanel
            conteo={listado.filtrosActivos}
            onLimpiar={listado.limpiarFiltros}
            textoVerResultados={cargando ? 'Ver resultados' : `Ver ${entero(total)} ${total === 1 ? 'cliente' : 'clientes'}`}
          >
            <CamposFiltroClientes listado={listado} opciones={opciones} conOrden={!escritorio} />
          </FilterPanel>
        }
        chips={
          <FilterChips chips={chips} onQuitar={(clave) => listado.setFiltro(clave, null)} onLimpiarTodo={listado.limpiarFiltros} />
        }
      />

      <DataTable
        etiqueta="Clientes"
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
          titulo: verInactivos ? 'No hay clientes inactivos' : 'Aún no tienes clientes',
          descripcion: verInactivos
            ? 'Cuando marques un cliente como inactivo aparecerá aquí.'
            : 'Crea el primero o impórtalos desde un archivo CSV o Excel.',
          icono: Users,
          accion: { etiqueta: 'Nuevo cliente', href: '/app/clientes/new', icono: Plus },
          accionSecundaria: { etiqueta: 'Importar desde CSV', onClick: () => setImportarAbierto(true), icono: Upload },
        }}
        sinResultados={{ descripcion: 'Prueba con otro nombre, NIT o teléfono, o quita un filtro.' }}
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
            sustantivo={SUSTANTIVO}
            cargando={cargando}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        onSeleccionarTodos={ocupado === 'seleccionar' ? undefined : () => void seleccionarTodos()}
        sustantivo={SUSTANTIVO}
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
