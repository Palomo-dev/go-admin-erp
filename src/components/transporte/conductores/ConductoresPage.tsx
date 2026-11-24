'use client';

/**
 * Catálogo común › Conductores y domiciliarios (Figma «23 Transporte» › 20: 2905:17692 desde
 * Logística; lista de la sección 4 2873:2228).
 *
 * La misma pantalla en `/app/transporte/conductores` y `/app/logistica/conductores`: la ruta decide
 * las migas y los enlaces. Lee con `listarPersonasCatalogo` (todas las personas de
 * `driver_credentials`, también los domiciliarios externos que antes no salían) y escribe SOLO con
 * `transportService` y los diálogos de siempre (crear/editar, duplicar, activar, historial,
 * importar), más `DialogoDocumento` de Flota para subir la licencia o el examen.
 *
 * «Cargo» es el cargo de Recursos humanos (`job_positions`), nunca un rol. Fuera por ahora (la base
 * no lo tiene, MCP 2026-11-24): la columna y el filtro «Uso» y la columna «Hoy» (viajes y envíos
 * del día de cada persona).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bus, Copy, Download, ExternalLink, FileCheck2, FileUp, History, IdCard, Pencil, Plus, Power, RefreshCw, Trash2, Upload, UserRound } from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  DataTable,
  EmptyState,
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
  StatusBadge,
  clasesBoton,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { transportService, type DriverCredential, type Trip, type Vehicle } from '@/lib/services/transportService';
import { listarPersonasCatalogo, type PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import { DocumentoError, guardarDocumento, listarDocumentos, type DatosDocumento } from '@/lib/services/transporte/documentosService';
import { documentosFlota, type DocumentoTabla } from '@/lib/transporte/documentosFlota';
import {
  CARGO_EXTERNO,
  CARGO_SIN,
  CATEGORIAS_LICENCIA,
  ESTADOS_PERSONA,
  FILTROS_DOCS,
  FILTROS_VEHICULO_PERSONA,
  RUTAS_CATALOGO,
  TONO_DOCS,
  aCsv,
  cargosDe,
  filasConductores,
  filtrarConductores,
  kpisConductores,
  moduloDeRuta,
  resumenDocumentos,
  type FilaConductor,
  type ResumenDocs,
} from '@/lib/transporte/catalogoComun';
import { RUTAS_LOGISTICA } from '@/lib/logistica/rutas';
import { DialogoDocumento, type InicialDocumento } from '@/components/transporte/flota/DialogoDocumento';
import { DriverDialog } from './DriverDialog';
import { DriverStatusDialog } from './DriverStatusDialog';
import { DriverHistoryDialog } from './DriverHistoryDialog';
import { ImportDriversDialog } from './ImportDriversDialog';

const TAMANOS = [10, 25, 50] as const;

type Empleado = { id: string; name: string; email: string };

/** `getAvailableEmployeesForDriver` devuelve el empleo con su miembro y perfil. */
function aEmpleado(e: Record<string, unknown>, sinNombre: string): Empleado {
  const miembro = e.organization_members as { profiles?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null } | undefined;
  const perfil = miembro?.profiles;
  return {
    id: String(e.id),
    name: `${perfil?.first_name ?? ''} ${perfil?.last_name ?? ''}`.trim() || sinNombre,
    email: perfil?.email ?? '',
  };
}

export function ConductoresPage() {
  const t = useTranslations('catalogoComun.conductores');
  const tc = useTranslations('catalogoComun.comun');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const tFlota = useTranslations('transporte.flota');
  const router = useRouter();
  const modulo = moduloDeRuta(usePathname());
  const rutas = RUTAS_CATALOGO[modulo];
  const entero = useFormatoEntero();
  const { formatPlain, getToday } = useFormatDate();
  const { branchFilter } = useBranch();
  const organizationId = Number(getOrganizationId()) || null;
  const hoy = getToday();

  const l = useListadoServidor({ filtros: ['cargo', 'estado', 'categoria', 'documentos', 'vehiculo'], tamanoPorDefecto: 10, tamanosPermitidos: TAMANOS });

  const [personas, setPersonas] = useState<PersonaCatalogo[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehicle[]>([]);
  const [tabla, setTabla] = useState<DocumentoTabla[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'sin_permiso' | 'error' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  const [editar, setEditar] = useState<{ credencial: DriverCredential | null } | null>(null);
  const [aEstado, setAEstado] = useState<DriverCredential | null>(null);
  const [historial, setHistorial] = useState<{ credencial: DriverCredential; viajes: Trip[]; cargando: boolean } | null>(null);
  const [importar, setImportar] = useState(false);
  const [aEliminar, setAEliminar] = useState<FilaConductor | null>(null);
  const [documento, setDocumento] = useState<{ inicial: InicialDocumento | null } | null>(null);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    Promise.all([
      listarPersonasCatalogo(supabase, organizationId),
      transportService.getVehicles(organizationId, null),
      listarDocumentos(supabase, organizationId).catch(() => [] as DocumentoTabla[]),
      transportService.getAvailableEmployeesForDriver(organizationId).catch(() => [] as Record<string, unknown>[]),
    ])
      .then(([p, v, d, e]) => {
        if (cancelado) return;
        setPersonas(p);
        setVehiculos(v);
        setTabla(d);
        setEmpleados((e as Record<string, unknown>[]).map((x) => aEmpleado(x, t('sinNombre'))));
      })
      .catch((e: { code?: string }) => !cancelado && setError(e?.code === '42501' ? 'sin_permiso' : 'error'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
    // `t` es estable por idioma; leerlo aquí no debe volver a cargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, recarga]);

  // La sede activa filtra a las personas de esa sede y a las que no tienen sede (sirven a todas).
  const enSede = useMemo(() => personas.filter((p) => !branchFilter || p.sedeId === null || p.sedeId === branchFilter), [personas, branchFilter]);
  const resumen = useMemo(
    () =>
      resumenDocumentos(
        documentosFlota(
          [],
          enSede.map((p) => ({ id: p.id, full_name: p.nombre, license_category: p.licenciaCategoria, license_expiry: p.licenciaVence, medical_certificate_expiry: p.examenVence })),
          hoy,
          tabla,
        ),
      ),
    [enSede, hoy, tabla],
  );
  const filas = useMemo(() => filasConductores(enSede, vehiculos, resumen), [enSede, vehiculos, resumen]);
  const cargos = useMemo(() => cargosDe(filas), [filas]);
  const filtros = {
    busqueda: l.busqueda,
    cargo: l.filtros.cargo || null,
    estado: (ESTADOS_PERSONA as readonly string[]).includes(l.filtros.estado ?? '') ? l.filtros.estado ?? null : null,
    categoria: (CATEGORIAS_LICENCIA as readonly string[]).includes(l.filtros.categoria ?? '') ? l.filtros.categoria ?? null : null,
    documentos: (FILTROS_DOCS as readonly string[]).includes(l.filtros.documentos ?? '') ? l.filtros.documentos ?? null : null,
    vehiculo: (FILTROS_VEHICULO_PERSONA as readonly string[]).includes(l.filtros.vehiculo ?? '') ? l.filtros.vehiculo ?? null : null,
  };
  const claveFiltros = JSON.stringify(filtros);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibles = useMemo(() => filtrarConductores(filas, filtros), [filas, claveFiltros]);
  const pagina = useMemo(() => visibles.slice((l.pagina - 1) * l.tamano, l.pagina * l.tamano), [visibles, l.pagina, l.tamano]);
  const k = useMemo(() => kpisConductores(filas), [filas]);
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const seleccionadas = useMemo(() => Array.from(seleccion, (id) => porId.get(id)).filter((f): f is FilaConductor => !!f), [seleccion, porId]);
  useEffect(() => setSeleccion(new Set()), [claveFiltros, branchFilter]);

  // ── Textos ─────────────────────────────────────────────────────────────────
  const cargoTexto = (clave: string) => (clave === CARGO_EXTERNO ? tc('externo') : clave === CARGO_SIN ? t('sinCargo') : clave);
  const cargoDe = (f: FilaConductor) => cargoTexto(f.cargo ?? (f.externo ? CARGO_EXTERNO : CARGO_SIN));
  const documentoTexto = (f: FilaConductor) => {
    if (!f.documento) return null;
    const numero = /^\d+$/.test(f.documento) ? entero(Number(f.documento)) : f.documento;
    return [f.documentoTipo, numero].filter(Boolean).join(' ');
  };
  const categoriaTexto = (c: string | null) => (c && t.has(`categorias.${c}`) ? t(`categorias.${c}`) : null);
  const tipoTexto = (tipo: string) => (tTipos.has(tipo) ? tTipos(tipo) : tipo);

  // ── Acciones ───────────────────────────────────────────────────────────────
  const verHistorial = async (c: DriverCredential) => {
    setHistorial({ credencial: c, viajes: [], cargando: true });
    try {
      const viajes = await transportService.getDriverTrips(c.id);
      setHistorial((h) => (h && h.credencial.id === c.id ? { ...h, viajes, cargando: false } : h));
    } catch {
      toastError(t('toast.errorHistorial'));
      setHistorial((h) => (h ? { ...h, cargando: false } : h));
    }
  };

  const guardar = async (datos: Partial<DriverCredential>) => {
    if (!organizationId || !editar) return;
    setGuardando(true);
    try {
      if (editar.credencial?.id) {
        await transportService.updateDriver(editar.credencial.id, datos);
        toastSuccess(t('toast.actualizado'));
      } else {
        await transportService.createDriver({ ...datos, organization_id: organizationId } as Partial<DriverCredential>);
        toastSuccess(t('toast.creado'));
      }
      setEditar(null);
      recargar();
    } catch {
      toastError(t('toast.errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (id: string, activo: boolean) => {
    setGuardando(true);
    try {
      await transportService.updateDriver(id, { is_active: activo });
      toastSuccess(activo ? t('toast.activado') : t('toast.desactivado'));
      setAEstado(null);
      recargar();
    } catch {
      toastError(t('toast.errorEstado'));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (f: FilaConductor) => {
    try {
      await transportService.deleteDriver(f.id);
      toastSuccess(t('toast.eliminado', { nombre: f.nombre }));
      setAEliminar(null);
      recargar();
    } catch {
      toastError(t('toast.errorEliminar'));
    }
  };

  const importarFilas = async (lista: Partial<DriverCredential>[]) => {
    if (!organizationId) return { success: 0, errors: [t('toast.sinOrganizacion')] };
    let success = 0;
    const errors: string[] = [];
    for (const d of lista) {
      try {
        await transportService.createDriver({ ...d, organization_id: organizationId } as Partial<DriverCredential>);
        success++;
      } catch (e) {
        errors.push(`${d.license_number}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (success > 0) recargar();
    return { success, errors };
  };

  const guardarDocumentoPersona = async (datos: DatosDocumento, archivo: File | null) => {
    if (!organizationId) return false;
    try {
      await guardarDocumento(supabase, organizationId, datos, archivo);
      toastSuccess(tFlota('toast.guardado'));
      recargar();
      return true;
    } catch (e) {
      toastError(tFlota(`errores.${e instanceof DocumentoError ? e.codigo : 'error'}`));
      return false;
    }
  };

  const exportar = (lista: readonly FilaConductor[]) => {
    const csv = aCsv(
      lista,
      [t('columnas.persona'), t('columnas.documento'), t('columnas.cargo'), t('columnas.licencia'), t('columnas.vence'), t('columnas.examen'), t('columnas.vehiculo'), t('columnas.estado')],
      (f) => [
        f.nombre,
        documentoTexto(f) ?? '',
        cargoDe(f),
        f.licenciaCategoria ?? '',
        f.licencia.vence ?? '',
        f.examen.vence ?? '',
        f.vehiculo?.placa ?? '',
        f.activo ? t('estados.activo') : t('estados.inactivo'),
      ],
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `conductores-${hoy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** La fila abre el formulario de siempre; sin empleo (externo) se edita en Logística › Domiciliarios. */
  const abrir = (f: FilaConductor) => (f.persona.employmentId ? setEditar({ credencial: f.persona.credencial }) : router.push(RUTAS_LOGISTICA.domiciliarios));

  const acciones = (f: FilaConductor): AccionFila[] => {
    const conEmpleo = !!f.persona.employmentId;
    return [
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setEditar({ credencial: f.persona.credencial }), oculta: !conEmpleo },
      { id: 'editarDomiciliario', etiqueta: t('acciones.editarEnDomiciliarios'), icono: ExternalLink, onSelect: () => router.push(RUTAS_LOGISTICA.domiciliarios), oculta: conEmpleo },
      { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => setEditar({ credencial: { ...f.persona.credencial, id: '', license_number: `${f.persona.credencial.license_number}-COPY` } }), oculta: !conEmpleo },
      { id: 'estado', etiqueta: f.activo ? t('acciones.desactivar') : t('acciones.activar'), icono: Power, onSelect: () => setAEstado(f.persona.credencial), separadorAntes: true },
      { id: 'documento', etiqueta: t('acciones.subirDocumento'), icono: FileUp, onSelect: () => setDocumento({ inicial: { de: 'conductor', duenoId: f.id, tipo: 'licencia' } }) },
      { id: 'historial', etiqueta: t('acciones.historial'), icono: History, onSelect: () => void verHistorial(f.persona.credencial) },
      { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, onSelect: () => setAEliminar(f), destructiva: true },
    ];
  };

  // ── Celdas ─────────────────────────────────────────────────────────────────
  const dosLineas = (principal: string, detalle: string | null, clasePrincipal = 'text-fg') => (
    <div className="flex min-w-0 flex-col">
      <span className={`truncate ${clasePrincipal}`}>{principal}</span>
      {detalle && <span className="truncate text-xs text-fg-muted">{detalle}</span>}
    </div>
  );
  const badgeDocs = (r: ResumenDocs, conFecha: boolean) => (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge estado={r.estado} tono={TONO_DOCS[r.estado]} etiqueta={tc(`docs.${r.estado}`)} />
      {conFecha && r.vence && <span className={`text-xs tabular-nums ${r.estado === 'vencido' ? 'text-danger-text' : 'text-fg-muted'}`}>{formatPlain(r.vence)}</span>}
    </div>
  );
  const estadoBadge = (f: FilaConductor) =>
    f.activo ? <StatusBadge estado="active" tono="exito" etiqueta={t('estados.activo')} /> : <StatusBadge estado="inactive" tono="neutro" etiqueta={t('estados.inactivo')} />;

  const columnas: ColumnaTabla<FilaConductor>[] = [
    { id: 'persona', encabezado: t('columnas.persona'), celda: (f) => dosLineas(f.nombre || '—', documentoTexto(f), 'font-medium text-fg') },
    { id: 'cargo', encabezado: t('columnas.cargo'), ocultarDebajo: 'md', celda: (f) => <span className="text-fg">{cargoDe(f)}</span> },
    { id: 'licencia', encabezado: t('columnas.licencia'), ocultarDebajo: 'lg', celda: (f) => dosLineas(f.licenciaCategoria ?? '—', categoriaTexto(f.licenciaCategoria)) },
    { id: 'vence', encabezado: t('columnas.vence'), celda: (f) => badgeDocs(f.licencia, true) },
    { id: 'examen', encabezado: t('columnas.examen'), ocultarDebajo: 'xl', celda: (f) => badgeDocs(f.examen, f.examen.estado !== 'vigente') },
    {
      id: 'vehiculo',
      encabezado: t('columnas.vehiculo'),
      ocultarDebajo: 'md',
      celda: (f) => (f.vehiculo ? dosLineas(f.vehiculo.placa, tipoTexto(f.vehiculo.tipo)) : <span className="text-fg-muted">{t('sinVehiculo')}</span>),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: estadoBadge },
  ];

  // ── Filtros ────────────────────────────────────────────────────────────────
  const chips: ChipFiltro[] = [
    ...(filtros.cargo ? [{ clave: 'cargo', etiqueta: t('filtros.chipCargo', { cargo: cargoTexto(filtros.cargo) }) }] : []),
    ...(filtros.estado ? [{ clave: 'estado', etiqueta: t(`estados.${filtros.estado}`) }] : []),
    ...(filtros.categoria ? [{ clave: 'categoria', etiqueta: t('filtros.chipCategoria', { categoria: filtros.categoria }) }] : []),
    ...(filtros.documentos ? [{ clave: 'documentos', etiqueta: t('filtros.chipDocumentos', { estado: tc(`docs.${filtros.documentos}`) }) }] : []),
    ...(filtros.vehiculo ? [{ clave: 'vehiculo', etiqueta: t(`filtros.vehiculo_${filtros.vehiculo}`) }] : []),
  ];
  const hayCriterios = !!(l.busqueda || chips.length);

  const selectFiltro = (clave: 'cargo' | 'estado' | 'categoria' | 'documentos' | 'vehiculo', opciones: readonly { valor: string; etiqueta: string }[]) => (
    <FormField etiqueta={t(`filtros.${clave}`)}>
      {(cp) => (
        <Select value={l.filtros[clave] ?? 'todos'} onValueChange={(v) => l.setFiltro(clave, v === 'todos' ? null : v)}>
          <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className="h-10 border-line-strong bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">{tc('todos')}</SelectItem>
            {opciones.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );

  const menuCabecera: AccionFila[] = [
    { id: 'actualizar', etiqueta: tc('actualizar'), icono: RefreshCw, onSelect: recargar },
    { id: 'exportar', etiqueta: t('exportarTodo'), icono: Download, onSelect: () => exportar(visibles), deshabilitada: visibles.length === 0, motivo: t('sinFilas') },
    { id: 'subirDocumento', etiqueta: t('acciones.subirDocumento'), icono: FileUp, onSelect: () => setDocumento({ inicial: null }), deshabilitada: personas.length === 0, motivo: t('sinFilas') },
    { id: 'documentos', etiqueta: t('irDocumentos'), icono: FileCheck2, onSelect: () => router.push('/app/transporte/flota'), separadorAntes: true },
    { id: 'vehiculos', etiqueta: t('irVehiculos'), icono: Bus, onSelect: () => router.push(rutas.vehiculos) },
    { id: 'domiciliarios', etiqueta: t('irDomiciliarios'), icono: UserRound, onSelect: () => router.push(RUTAS_LOGISTICA.domiciliarios), oculta: modulo !== 'logistica' },
  ];

  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'femenino' as const };
  const sinNada = !cargando && !error && filas.length === 0;
  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && filas.length === 0 ? 'cargando' : error ? 'error' : visibles.length === 0 ? (hayCriterios ? 'sinResultados' : 'vacio') : 'listo';
  const subtitulo = sinNada ? t('subtituloVacio') : t('subtitulo', { n: entero(k.total) });

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={IdCard}
        subtitulo={subtitulo}
        cargando={cargando && filas.length === 0}
        migas={[{ etiqueta: tc(`migas.${modulo}`), href: rutas.inicio }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva tamano="sm" />}
        acciones={
          <>
            {!sinNada && (
              <button type="button" className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={recargar} aria-label={tc('actualizar')} title={tc('actualizar')}>
                <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            )}
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setImportar(true)}>
              <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {tc('importar')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setEditar({ credencial: null })}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevo')}
            </button>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={menuCabecera} />
          </>
        }
        movil={{
          accion: (
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[
                { id: 'nuevo', etiqueta: t('nuevo'), icono: Plus, onSelect: () => setEditar({ credencial: null }) },
                { id: 'importar', etiqueta: tc('importar'), icono: Upload, onSelect: () => setImportar(true) },
                ...menuCabecera,
              ]}
            />
          ),
        }}
      />

      {sinNada ? (
        <EmptyState
          icono={IdCard}
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          accion={{ etiqueta: t('nuevo'), icono: Plus, onClick: () => setEditar({ credencial: null }) }}
          accionSecundaria={
            modulo === 'logistica'
              ? { etiqueta: t('vacio.domiciliario'), icono: UserRound, href: `${RUTAS_LOGISTICA.domiciliarios}?nuevo=1` }
              : { etiqueta: t('vacio.importar'), icono: Upload, onClick: () => setImportar(true) }
          }
        />
      ) : (
        <>
          <KpiStrip etiqueta={t('kpis.etiqueta')}>
            <StatCard
              etiqueta={t('kpis.personas')}
              cargando={cargando && filas.length === 0}
              valor={entero(k.total)}
              detalle={[t('kpis.activas', { n: entero(k.activos) }), k.externos > 0 ? t('kpis.externas', { n: entero(k.externos) }) : null].filter(Boolean).join(' · ')}
            />
            <StatCard
              etiqueta={t('kpis.documentos')}
              cargando={cargando && filas.length === 0}
              valor={entero(k.docsVencidos + k.docsPorVencer)}
              tono={k.docsVencidos > 0 ? 'peligro' : k.docsPorVencer > 0 ? 'advertencia' : 'neutro'}
              detalle={k.docsVencidos + k.docsPorVencer > 0 ? t('kpis.documentosDetalle', { vencidos: entero(k.docsVencidos), porVencer: entero(k.docsPorVencer) }) : t('kpis.documentosVacio')}
              onClick={k.docsVencidos > 0 ? () => l.setFiltro('documentos', 'vencido') : k.docsPorVencer > 0 ? () => l.setFiltro('documentos', 'por_vencer') : undefined}
            />
            <StatCard
              etiqueta={t('kpis.conVehiculo')}
              cargando={cargando && filas.length === 0}
              valor={entero(k.conVehiculo)}
              detalle={t('kpis.sinVehiculo', { n: entero(k.sinVehiculo) })}
              onClick={k.sinVehiculo > 0 ? () => l.setFiltro('vehiculo', 'sin') : undefined}
            />
            <StatCard
              etiqueta={t('kpis.sinLicencia')}
              cargando={cargando && filas.length === 0}
              valor={entero(k.sinLicencia)}
              tono={k.sinLicencia > 0 ? 'advertencia' : 'neutro'}
              detalle={k.sinLicencia > 0 ? t('kpis.sinLicenciaDetalle') : t('kpis.sinLicenciaVacio')}
              onClick={k.sinLicencia > 0 ? () => l.setFiltro('documentos', 'sin_fecha') : undefined}
            />
          </KpiStrip>

          <ListToolbar
            busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
            filtros={
              <FilterPanel conteo={chips.length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: visibles.length })}>
                {cargos.length > 0 && selectFiltro('cargo', cargos.map((c) => ({ valor: c, etiqueta: cargoTexto(c) })))}
                {selectFiltro('estado', ESTADOS_PERSONA.map((v) => ({ valor: v, etiqueta: t(`estados.${v}`) })))}
                {selectFiltro('categoria', CATEGORIAS_LICENCIA.map((v) => ({ valor: v, etiqueta: `${v} · ${categoriaTexto(v) ?? ''}` })))}
                {selectFiltro('documentos', FILTROS_DOCS.map((v) => ({ valor: v, etiqueta: tc(`docs.${v}`) })))}
                {selectFiltro('vehiculo', FILTROS_VEHICULO_PERSONA.map((v) => ({ valor: v, etiqueta: t(`filtros.vehiculo_${v}`) })))}
              </FilterPanel>
            }
            chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} textoLimpiarTodo={tc('limpiarTodo')} />}
          />

          <DataTable
            etiqueta={t('tabla')}
            columnas={columnas}
            filas={pagina}
            obtenerId={(f) => f.id}
            estado={estadoTabla}
            seleccion={seleccion}
            onSeleccionChange={setSeleccion}
            onFilaClick={abrir}
            etiquetaFila={(f) => f.nombre || f.id}
            acciones={acciones}
            tonoFila={(f) => (f.docs.estado === 'vencido' ? 'peligro' : undefined)}
            tarjetaMovil={(f, ctx) => (
              <ListCard
                icono={UserRound}
                titulo={f.nombre || '—'}
                subtitulo={[cargoDe(f), f.vehiculo?.placa].filter(Boolean).join(' · ')}
                meta={f.licencia.vence ? t('licenciaVence', { fecha: formatPlain(f.licencia.vence) }) : tc('docs.sin_fecha')}
                estado={<StatusBadge estado={f.licencia.estado} tono={TONO_DOCS[f.licencia.estado]} etiqueta={tc(`docs.${f.licencia.estado}`)} />}
                acciones={acciones(f)}
                onClick={() => abrir(f)}
                seleccionable={ctx.modoSeleccion}
                seleccionado={ctx.seleccionado}
                onSeleccionChange={ctx.alternar}
              />
            )}
            vacio={{ icono: IdCard, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
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
                total={visibles.length}
                onPaginaChange={l.setPagina}
                onTamanoChange={l.setTamano}
                opcionesTamano={TAMANOS}
                sustantivo={sustantivo}
                cargando={cargando}
              />
            }
          />
        </>
      )}

      <BulkActionBar
        seleccionados={seleccion.size}
        total={visibles.length}
        sustantivo={sustantivo}
        onSeleccionarTodos={() => setSeleccion(new Set(visibles.map((f) => f.id)))}
        onLimpiar={() => setSeleccion(new Set())}
        acciones={[{ id: 'exportar', etiqueta: t('masivo.exportar'), icono: Download, onClick: () => exportar(seleccionadas) }]}
      />

      <DriverDialog
        open={editar !== null}
        onOpenChange={(v) => !v && setEditar(null)}
        driver={editar?.credencial ?? null}
        employees={empleados}
        onSave={guardar}
        isSaving={guardando}
      />
      <DriverStatusDialog open={aEstado !== null} onOpenChange={(v) => !v && setAEstado(null)} driver={aEstado} onToggleStatus={cambiarEstado} isUpdating={guardando} />
      <DriverHistoryDialog
        open={historial !== null}
        onOpenChange={(v) => !v && setHistorial(null)}
        driver={historial?.credencial ?? null}
        trips={historial?.viajes ?? []}
        isLoading={historial?.cargando ?? false}
      />
      <ImportDriversDialog open={importar} onOpenChange={setImportar} onImport={importarFilas} />
      {documento && (
        <DialogoDocumento
          vehiculos={vehiculos.map((v) => ({ id: v.id, nombre: v.plate }))}
          conductores={personas.map((p) => ({ id: p.id, nombre: p.nombre || '—' }))}
          inicial={documento.inicial}
          onCerrar={() => setDocumento(null)}
          onGuardar={guardarDocumentoPersona}
        />
      )}
      <ConfirmDialog
        abierto={aEliminar !== null}
        onAbiertoChange={(v) => !v && setAEliminar(null)}
        titulo={t('eliminar.titulo', { nombre: aEliminar?.nombre ?? '' })}
        descripcion={t('eliminar.descripcion')}
        textoConfirmar={t('eliminar.confirmar')}
        textoCancelar={tc('cancelar')}
        tono="peligro"
        icono={Trash2}
        onConfirmar={() => {
          if (aEliminar) void eliminar(aEliminar);
        }}
      />
    </div>
  );
}
