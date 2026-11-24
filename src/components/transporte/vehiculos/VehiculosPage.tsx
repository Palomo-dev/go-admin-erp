'use client';

/**
 * Catálogo común › Vehículos (Figma «23 Transporte» › 20: 2905:15549 desde Logística, 2905:16494
 * desde Transporte; lista de la sección 3 2871:992; vacío 2912:30486).
 *
 * La misma pantalla en `/app/transporte/vehiculos` y `/app/logistica/vehiculos`: la ruta decide las
 * migas y los enlaces. Lee con `transportService` (vehículos, transportadoras) y
 * `listarPersonasCatalogo` (conductores y domiciliarios, también los externos); escribe SOLO con
 * `transportService` (y `vehiculoAccionesService` para estado y conductor) y con
 * `DialogoDocumento` de Flota para subir documentos. La fila abre la ficha (`/[id]`); nuevo, editar
 * y duplicar son páginas; estado, conductor, importar e historial son los diálogos de la sección 25.
 *
 * Fuera por ahora (la base no lo tiene, MCP 2026-11-24): la columna y el filtro «Uso» y los estados
 * operativos del día (En entrega, Abordando, Con excepción); el estado es `vehicles.status`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Bus,
  Copy,
  Download,
  FileCheck2,
  FileUp,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  Upload,
  UserCog,
  Users,
} from 'lucide-react';
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
import { transportService, type TransportCarrier, type Vehicle } from '@/lib/services/transportService';
import { asignarConductorVehiculo, cambiarEstadoVehiculo } from '@/lib/services/transporte/vehiculoAccionesService';
import { listarPersonasCatalogo, type PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import { DocumentoError, guardarDocumento, listarDocumentos, type DatosDocumento } from '@/lib/services/transporte/documentosService';
import { documentosFlota, type DocumentoTabla } from '@/lib/transporte/documentosFlota';
import {
  ESTADOS_VEHICULO,
  FILTROS_DOCS,
  RUTAS_CATALOGO,
  TIPOS_VEHICULO,
  TONO_DOCS,
  TONO_ESTADO_VEHICULO,
  aCsv,
  filasVehiculos,
  filtrarVehiculos,
  kpisVehiculos,
  moduloDeRuta,
  resumenDocumentos,
  rutaFicha,
  type FilaVehiculo,
} from '@/lib/transporte/catalogoComun';
import { clavePlaca } from '@/lib/transporte/formulariosCatalogo';
import type { FilaImportacion } from '@/lib/transporte/importarCatalogo';
import { DialogoDocumento, type InicialDocumento } from '@/components/transporte/flota/DialogoDocumento';
import { HojaHistorial } from '@/components/transporte/fichas/HojaHistorial';
import { ImportarCatalogoDialogo, type ResultadoImportacion } from '@/components/transporte/fichas/ImportarCatalogoDialogo';
import { CambiarEstadoDialogo } from './CambiarEstadoDialogo';
import { AsignarConductorDialogo } from './AsignarConductorDialogo';

const TAMANOS = [10, 25, 50] as const;

export function VehiculosPage() {
  const t = useTranslations('catalogoComun.vehiculos');
  const tc = useTranslations('catalogoComun.comun');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const tCausas = useTranslations('transporte.despachos.causas');
  const tFlota = useTranslations('transporte.flota');
  const router = useRouter();
  const modulo = moduloDeRuta(usePathname());
  const rutas = RUTAS_CATALOGO[modulo];
  const entero = useFormatoEntero();
  const { formatPlain, getToday } = useFormatDate();
  const { branchFilter } = useBranch();
  const organizationId = Number(getOrganizationId()) || null;
  const hoy = getToday();

  const l = useListadoServidor({ filtros: ['tipo', 'estado', 'transportadora', 'documentos'], tamanoPorDefecto: 10, tamanosPermitidos: TAMANOS });

  const [vehiculos, setVehiculos] = useState<Vehicle[]>([]);
  const [personas, setPersonas] = useState<PersonaCatalogo[]>([]);
  const [tabla, setTabla] = useState<DocumentoTabla[]>([]);
  const [carriers, setCarriers] = useState<TransportCarrier[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  // Diálogos (los de la sección 25 de Figma); crear y editar son páginas.
  const [aEstado, setAEstado] = useState<Vehicle | null>(null);
  const [aConductor, setAConductor] = useState<Vehicle | null>(null);
  const [historial, setHistorial] = useState<Vehicle | null>(null);
  const [importar, setImportar] = useState(false);
  const [aEliminar, setAEliminar] = useState<FilaVehiculo | null>(null);
  const [documento, setDocumento] = useState<{ inicial: InicialDocumento | null } | null>(null);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    setCargando(true);
    setError(false);
    Promise.all([
      transportService.getVehicles(organizationId, branchFilter),
      listarPersonasCatalogo(supabase, organizationId).catch(() => [] as PersonaCatalogo[]),
      listarDocumentos(supabase, organizationId).catch(() => [] as DocumentoTabla[]),
      transportService.getCarriers(organizationId).catch(() => [] as TransportCarrier[]),
    ])
      .then(([v, p, d, c]) => {
        if (cancelado) return;
        setVehiculos(v);
        setPersonas(p);
        setTabla(d);
        setCarriers(c);
      })
      .catch(() => !cancelado && setError(true))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [organizationId, branchFilter, recarga]);

  const resumen = useMemo(
    () =>
      resumenDocumentos(
        documentosFlota(
          vehiculos.map((v) => ({
            id: v.id,
            plate: v.plate,
            vehicle_type: v.vehicle_type,
            soat_expiry: v.soat_expiry ?? null,
            techno_expiry: v.techno_expiry ?? null,
            insurance_expiry: v.insurance_expiry ?? null,
            operating_card_expiry: v.operating_card_expiry ?? null,
          })),
          [],
          hoy,
          tabla,
        ),
      ),
    [vehiculos, hoy, tabla],
  );
  const filas = useMemo(() => filasVehiculos(vehiculos, personas, resumen), [vehiculos, personas, resumen]);
  const filtros = {
    busqueda: l.busqueda,
    tipo: (TIPOS_VEHICULO as readonly string[]).includes(l.filtros.tipo ?? '') ? l.filtros.tipo ?? null : null,
    estado: (ESTADOS_VEHICULO as readonly string[]).includes(l.filtros.estado ?? '') ? l.filtros.estado ?? null : null,
    transportadora: l.filtros.transportadora || null,
    documentos: (FILTROS_DOCS as readonly string[]).includes(l.filtros.documentos ?? '') ? l.filtros.documentos ?? null : null,
  };
  const claveFiltros = JSON.stringify(filtros);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibles = useMemo(() => filtrarVehiculos(filas, filtros), [filas, claveFiltros]);
  const pagina = useMemo(() => visibles.slice((l.pagina - 1) * l.tamano, l.pagina * l.tamano), [visibles, l.pagina, l.tamano]);
  const k = useMemo(() => kpisVehiculos(filas), [filas]);
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const seleccionadas = useMemo(() => Array.from(seleccion, (id) => porId.get(id)).filter((f): f is FilaVehiculo => !!f), [seleccion, porId]);
  useEffect(() => setSeleccion(new Set()), [claveFiltros, branchFilter]);

  // ── Textos ─────────────────────────────────────────────────────────────────
  const tipoTexto = (tipo: string) => (tTipos.has(tipo) ? tTipos(tipo) : tipo);
  const capacidad = (f: FilaVehiculo): { principal: string; detalle: string | null } => {
    const carga = [f.kg ? t('capacidad.kg', { n: entero(f.kg) }) : null, f.m3 ? t('capacidad.m3', { n: entero(f.m3) }) : null].filter(Boolean).join(' · ');
    if (f.pasajeros) return { principal: t('capacidad.pasajeros', { count: f.pasajeros }), detalle: carga ? t('capacidad.o', { carga }) : null };
    return { principal: carga || '—', detalle: null };
  };
  const docsTexto = (f: FilaVehiculo) => tc(`docs.${f.docs.estado}`);
  const docsDetalle = (f: FilaVehiculo) => (f.docs.tipo && f.docs.vence && f.docs.estado !== 'vigente' ? `${tCausas.has(f.docs.tipo) ? tCausas(f.docs.tipo) : f.docs.tipo} · ${formatPlain(f.docs.vence)}` : null);
  const conductorDetalle = (f: FilaVehiculo) => (f.conductor ? f.conductor.cargo ?? (f.conductor.externo ? tc('externo') : null) : null);

  // ── Acciones ───────────────────────────────────────────────────────────────
  // Nuevo, editar y duplicar son páginas (Figma 2970:20719); la fila abre la ficha.
  const abrirEditar = (v: Vehicle | null) => router.push(v ? `${rutaFicha(modulo, 'vehiculo', v.id)}/editar` : `${rutas.vehiculos}/nuevo`);
  const duplicar = (v: Vehicle) => router.push(`${rutas.vehiculos}/nuevo?duplicar=${encodeURIComponent(v.id)}`);
  const verFicha = (f: FilaVehiculo) => router.push(rutaFicha(modulo, 'vehiculo', f.id));

  const cambiarEstado = async (v: Vehicle, estado: string, motivo: string | null) => {
    setGuardando(true);
    try {
      await cambiarEstadoVehiculo(v, estado, motivo);
      toastSuccess(t('toast.estado'));
      setAEstado(null);
      recargar();
    } catch {
      toastError(t('toast.errorEstado'));
    } finally {
      setGuardando(false);
    }
  };

  const asignarConductor = async (v: Vehicle, p: PersonaCatalogo | null) => {
    setGuardando(true);
    try {
      const antes = v.current_driver_id ? personas.find((x) => x.userId === v.current_driver_id)?.nombre ?? null : null;
      await asignarConductorVehiculo(v, p?.userId ?? null, { antes, ahora: p?.nombre ?? null });
      toastSuccess(p ? t('toast.conductorAsignado') : t('toast.conductorQuitado'));
      setAConductor(null);
      recargar();
    } catch {
      toastError(t('toast.errorConductor'));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (f: FilaVehiculo) => {
    try {
      await transportService.deleteVehicle(f.id);
      toastSuccess(t('toast.eliminado', { placa: f.placa }));
      setAEliminar(null);
      recargar();
    } catch {
      toastError(t('toast.errorEliminar'));
    }
  };

  // Lo que ya existe (misma placa) se actualiza; lo nuevo se crea con la organización de la sesión.
  const existentes = useMemo(() => new Map(vehiculos.map((v) => [clavePlaca(v.plate), v.id])), [vehiculos]);
  const importarFilas = async (lista: FilaImportacion[]): Promise<ResultadoImportacion> => {
    if (!organizationId) return { importados: 0, errores: [{ etiqueta: '—', mensaje: t('toast.sinOrganizacion') }] };
    let importados = 0;
    const errores: ResultadoImportacion['errores'] = [];
    for (const f of lista) {
      try {
        if (f.estado === 'existe' && f.id) await transportService.updateVehicle(f.id, f.datos as Partial<Vehicle>);
        else await transportService.createVehicle({ ...(f.datos as Partial<Vehicle>), organization_id: organizationId });
        importados++;
      } catch (e) {
        errores.push({ etiqueta: f.etiqueta, mensaje: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
      }
    }
    if (importados > 0) recargar();
    return { importados, errores };
  };

  const guardarDocumentoVehiculo = async (datos: DatosDocumento, archivo: File | null) => {
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

  const exportar = (lista: readonly FilaVehiculo[]) => {
    const csv = aCsv(
      lista,
      [t('columnas.vehiculo'), t('columnas.marcaModelo'), t('columnas.tipo'), t('columnas.capacidad'), t('columnas.conductor'), t('columnas.documentos'), t('columnas.estado'), t('columnas.transportadora'), t('columnas.sede')],
      (f) => [
        f.placa,
        [f.marcaModelo, f.anio].filter(Boolean).join(' · '),
        tipoTexto(f.tipo),
        [capacidad(f).principal, capacidad(f).detalle].filter(Boolean).join(' '),
        f.conductor?.nombre ?? '',
        docsTexto(f),
        t(`estados.${f.estado}`),
        f.transportadora ?? '',
        f.sede ?? '',
      ],
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `vehiculos-${hoy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const acciones = (f: FilaVehiculo): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => abrirEditar(f.vehiculo) },
    { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => duplicar(f.vehiculo) },
    { id: 'estado', etiqueta: t('acciones.cambiarEstado'), icono: Repeat, onSelect: () => setAEstado(f.vehiculo), separadorAntes: true },
    { id: 'conductor', etiqueta: f.conductor || f.conductorDesconocido ? t('acciones.cambiarConductor') : t('acciones.asignarConductor'), icono: UserCog, onSelect: () => setAConductor(f.vehiculo) },
    { id: 'documento', etiqueta: t('acciones.subirDocumento'), icono: FileUp, onSelect: () => setDocumento({ inicial: { de: 'vehiculo', duenoId: f.id, tipo: 'soat' } }) },
    { id: 'historial', etiqueta: t('acciones.historial'), icono: History, onSelect: () => setHistorial(f.vehiculo) },
    { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, onSelect: () => setAEliminar(f), destructiva: true },
  ];

  // ── Celdas ─────────────────────────────────────────────────────────────────
  const dosLineas = (principal: string, detalle: string | null, clasePrincipal = 'text-fg', claseDetalle = 'text-fg-muted') => (
    <div className="flex min-w-0 flex-col">
      <span className={`truncate ${clasePrincipal}`}>{principal}</span>
      {detalle && <span className={`truncate text-xs ${claseDetalle}`}>{detalle}</span>}
    </div>
  );
  const tipoBadge = (f: FilaVehiculo) => <StatusBadge estado={f.tipo} tono="marca" apariencia="contorno" etiqueta={tipoTexto(f.tipo)} />;
  const docsBadge = (f: FilaVehiculo) => (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge estado={f.docs.estado} tono={TONO_DOCS[f.docs.estado]} etiqueta={docsTexto(f)} />
      {docsDetalle(f) && <span className={`text-xs ${f.docs.estado === 'vencido' ? 'text-danger-text' : 'text-warning-text'}`}>{docsDetalle(f)}</span>}
    </div>
  );
  const estadoBadge = (f: FilaVehiculo) => <StatusBadge estado={f.estado} tono={TONO_ESTADO_VEHICULO[f.estado]} etiqueta={t(`estados.${f.estado}`)} />;

  const columnas: ColumnaTabla<FilaVehiculo>[] = [
    { id: 'vehiculo', encabezado: t('columnas.vehiculo'), celda: (f) => dosLineas(f.placa, [f.marcaModelo, f.anio].filter(Boolean).join(' · ') || null, 'font-medium text-fg') },
    { id: 'tipo', encabezado: t('columnas.tipo'), celda: tipoBadge },
    {
      id: 'capacidad',
      encabezado: t('columnas.capacidad'),
      ocultarDebajo: 'lg',
      celda: (f) => {
        const c = capacidad(f);
        return dosLineas(c.principal, c.detalle);
      },
    },
    {
      id: 'conductor',
      encabezado: t('columnas.conductor'),
      ocultarDebajo: 'md',
      celda: (f) =>
        f.conductor ? dosLineas(f.conductor.nombre || '—', conductorDetalle(f)) : <span className="text-fg-muted">{f.conductorDesconocido ? t('conductorDesconocido') : t('sinAsignar')}</span>,
    },
    { id: 'documentos', encabezado: t('columnas.documentos'), ocultarDebajo: 'md', celda: docsBadge },
    { id: 'estado', encabezado: t('columnas.estado'), celda: estadoBadge },
  ];

  // ── Filtros ────────────────────────────────────────────────────────────────
  const chips: ChipFiltro[] = [
    ...(filtros.tipo ? [{ clave: 'tipo', etiqueta: t('filtros.chipTipo', { tipo: tipoTexto(filtros.tipo) }) }] : []),
    ...(filtros.estado ? [{ clave: 'estado', etiqueta: t('filtros.chipEstado', { estado: t(`estados.${filtros.estado}`) }) }] : []),
    ...(filtros.transportadora
      ? [{ clave: 'transportadora', etiqueta: t('filtros.chipTransportadora', { nombre: carriers.find((c) => c.id === filtros.transportadora)?.name ?? '—' }) }]
      : []),
    ...(filtros.documentos ? [{ clave: 'documentos', etiqueta: t('filtros.chipDocumentos', { estado: tc(`docs.${filtros.documentos}`) }) }] : []),
  ];
  const hayCriterios = !!(l.busqueda || chips.length);

  const selectFiltro = (clave: 'tipo' | 'estado' | 'transportadora' | 'documentos', opciones: readonly { valor: string; etiqueta: string }[]) => (
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
    { id: 'subirDocumento', etiqueta: t('acciones.subirDocumento'), icono: FileUp, onSelect: () => setDocumento({ inicial: null }), deshabilitada: vehiculos.length === 0, motivo: t('sinFilas') },
    { id: 'documentos', etiqueta: t('irDocumentos'), icono: FileCheck2, onSelect: () => router.push('/app/transporte/flota'), separadorAntes: true },
    { id: 'conductores', etiqueta: t('irConductores'), icono: Users, onSelect: () => router.push(rutas.conductores) },
  ];

  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'masculino' as const };
  const sinNada = !cargando && !error && vehiculos.length === 0;
  const estadoTabla = cargando && filas.length === 0 ? 'cargando' : error ? 'error' : visibles.length === 0 ? (hayCriterios ? 'sinResultados' : 'vacio') : 'listo';
  const subtitulo = sinNada ? t('subtituloVacio') : t('subtitulo', { n: entero(k.total) });

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={Bus}
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
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => abrirEditar(null)}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevo')}
            </button>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={menuCabecera} />
          </>
        }
        movil={{ accion: <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={[{ id: 'nuevo', etiqueta: t('nuevo'), icono: Plus, onSelect: () => abrirEditar(null) }, { id: 'importar', etiqueta: tc('importar'), icono: Upload, onSelect: () => setImportar(true) }, ...menuCabecera]} /> }}
      />

      {sinNada ? (
        <EmptyState
          icono={Bus}
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          accion={{ etiqueta: t('nuevo'), icono: Plus, onClick: () => abrirEditar(null) }}
          accionSecundaria={{ etiqueta: t('vacio.importar'), icono: Upload, onClick: () => setImportar(true) }}
        />
      ) : (
        <>
          <KpiStrip etiqueta={t('kpis.etiqueta')}>
            <StatCard
              etiqueta={t('kpis.vehiculos')}
              cargando={cargando && filas.length === 0}
              valor={entero(k.total)}
              detalle={k.inactivos > 0 ? t('kpis.vehiculosInactivos', { n: entero(k.inactivos) }) : t('kpis.vehiculosDetalle')}
            />
            <StatCard
              etiqueta={t('kpis.disponibles')}
              cargando={cargando && filas.length === 0}
              valor={entero(k.disponibles)}
              tono={k.disponiblesBloqueados > 0 ? 'advertencia' : 'neutro'}
              detalle={k.disponiblesBloqueados > 0 ? t('kpis.disponiblesBloqueados', { n: entero(k.disponiblesBloqueados) }) : t('kpis.disponiblesDetalle')}
              onClick={() => l.setFiltro('estado', 'available')}
            />
            <StatCard etiqueta={t('kpis.enUso')} cargando={cargando && filas.length === 0} valor={entero(k.enUso)} detalle={t('kpis.enUsoDetalle')} onClick={() => l.setFiltro('estado', 'in_use')} />
            <StatCard
              etiqueta={t('kpis.mantenimiento')}
              cargando={cargando && filas.length === 0}
              valor={entero(k.mantenimiento)}
              tono={k.mantenimiento > 0 ? 'advertencia' : 'neutro'}
              detalle={k.mantenimiento > 0 ? k.placasMantenimiento.slice(0, 3).join(' · ') + (k.mantenimiento > 3 ? ' …' : '') : t('kpis.mantenimientoVacio')}
              onClick={() => l.setFiltro('estado', 'maintenance')}
            />
          </KpiStrip>

          <ListToolbar
            busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
            filtros={
              <FilterPanel conteo={chips.length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: visibles.length })}>
                {selectFiltro('tipo', TIPOS_VEHICULO.map((v) => ({ valor: v, etiqueta: tipoTexto(v) })))}
                {selectFiltro('estado', ESTADOS_VEHICULO.map((v) => ({ valor: v, etiqueta: t(`estados.${v}`) })))}
                {selectFiltro('documentos', FILTROS_DOCS.map((v) => ({ valor: v, etiqueta: tc(`docs.${v}`) })))}
                {carriers.length > 0 && selectFiltro('transportadora', carriers.map((c) => ({ valor: c.id, etiqueta: c.name })))}
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
            onFilaClick={verFicha}
            etiquetaFila={(f) => f.placa}
            acciones={acciones}
            tonoFila={(f) => (f.docs.estado === 'vencido' ? 'peligro' : undefined)}
            tarjetaMovil={(f, ctx) => (
              <ListCard
                icono={Bus}
                titulo={f.placa}
                subtitulo={[tipoTexto(f.tipo), f.marcaModelo].filter(Boolean).join(' · ')}
                meta={f.conductor?.nombre ?? t('sinAsignar')}
                estado={estadoBadge(f)}
                acciones={acciones(f)}
                onClick={() => verFicha(f)}
                seleccionable={ctx.modoSeleccion}
                seleccionado={ctx.seleccionado}
                onSeleccionChange={ctx.alternar}
              />
            )}
            vacio={{ icono: Bus, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
            sinResultados={{ descripcion: t('sinResultados') }}
            error={{ titulo: t('errorCarga') }}
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

      {aEstado && <CambiarEstadoDialogo vehiculo={aEstado} guardando={guardando} onCerrar={() => setAEstado(null)} onCambiar={(e, m) => void cambiarEstado(aEstado, e, m)} />}
      {aConductor && (
        <AsignarConductorDialogo vehiculo={aConductor} personas={personas} guardando={guardando} onCerrar={() => setAConductor(null)} onAsignar={(p) => void asignarConductor(aConductor, p)} />
      )}
      <HojaHistorial
        objetivo={historial ? { de: 'vehiculo', vehiculo: historial } : null}
        organizationId={organizationId}
        onCerrar={() => setHistorial(null)}
        nombreOtro={(v) => (v.driver_id ? personas.find((p) => p.userId === v.driver_id)?.nombre || null : null)}
      />
      {importar && <ImportarCatalogoDialogo tipo="vehiculos" abierto existentes={existentes} onCerrar={() => setImportar(false)} onImportar={importarFilas} />}
      {documento && (
        <DialogoDocumento
          vehiculos={vehiculos.map((v) => ({ id: v.id, nombre: v.plate }))}
          conductores={personas.map((p) => ({ id: p.id, nombre: p.nombre || '—' }))}
          inicial={documento.inicial}
          onCerrar={() => setDocumento(null)}
          onGuardar={guardarDocumentoVehiculo}
        />
      )}
      <ConfirmDialog
        abierto={aEliminar !== null}
        onAbiertoChange={(v) => !v && setAEliminar(null)}
        titulo={t('eliminar.titulo', { placa: aEliminar?.placa ?? '' })}
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
