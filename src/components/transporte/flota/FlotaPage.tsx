'use client';

/**
 * Transporte › Flota (Figma «23 Transporte» › 3 y 13; vacío 2912:30486). Primera entrega de la
 * fase Cumplimiento: Documentos y vencimientos de vehículos y conductores con las StatCards de
 * arriba (vencidos, por vencer, vigentes, sin fecha), filtro «Vencidos o por vencer», tabla del
 * kit y barra masiva flotante.
 *
 * Fase 1 «Documentos completos» (2026-11-23): número, entidad, archivo (bucket privado, URL
 * firmada), «Subir documento», renovar (archiva el anterior) y archivar; avisos a 30, 15 y 7 días
 * por la campana y el correo (cron `transporte-avisar-vencimientos`).
 *
 * Lo que aún no está: Mantenimiento, Combustible y Costos (fase 3) y «Pedir renovación».
 * Vehículos y Conductores siguen en sus páginas del catálogo común.
 *
 * `?estado=vencido|por_vencer` deja la lista en ese estado (lo abre el Inicio desde «2 documentos
 * vencidos» y «Documentos por vencer», Figma `03` › Inicio 2917:45560); el chip lo quita de la URL.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Archive, Bus, Download, Eye, FileCheck2, FileUp, Paperclip, RefreshCw, User } from 'lucide-react';
import {
  AvisoTonal,
  BranchBadgeActiva,
  BulkActionBar,
  DataTable,
  EmptyState,
  FilterChips,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { AtajoConfigurar } from '@/components/configuracion/AtajoConfigurar';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { listarConductores } from '@/lib/services/transporte/despachosService';
import { DocumentoError, archivarDocumento, guardarDocumento, listarDocumentos, urlArchivo, type DatosDocumento } from '@/lib/services/transporte/documentosService';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { DialogoDocumento, type InicialDocumento } from './DialogoDocumento';
import {
  documentosACsv,
  documentosFlota,
  kpisDocumentos,
  type ConductorConFechas,
  type DocumentoFlota,
  type DocumentoTabla,
  type TipoDocumento,
  type VehiculoConFechas,
} from '@/lib/transporte/documentosFlota';

const TONO = { vencido: 'peligro', por_vencer: 'advertencia', vigente: 'exito' } as const;

/** Estados que se pueden pedir en `?estado=`. */
const ESTADOS_FILTRO = ['vencido', 'por_vencer'] as const;
type EstadoFiltro = (typeof ESTADOS_FILTRO)[number];

export function FlotaPage() {
  const t = useTranslations('transporte.flota');
  const tCausas = useTranslations('transporte.despachos.causas');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pedido = params?.get('estado') ?? '';
  const filtroEstado = (ESTADOS_FILTRO as readonly string[]).includes(pedido) ? (pedido as EstadoFiltro) : null;
  const quitarFiltroEstado = useCallback(() => {
    const q = new URLSearchParams(params?.toString() ?? '');
    q.delete('estado');
    const r = q.toString();
    router.replace(r ? `${pathname ?? ''}?${r}` : pathname ?? '', { scroll: false });
  }, [params, pathname, router]);
  const entero = useFormatoEntero();
  const { formatPlain, getToday } = useFormatDate();
  const { branchFilter } = useBranch();
  const organizationId = Number(getOrganizationId()) || null;
  const hoy = getToday();

  const [vehiculos, setVehiculos] = useState<VehiculoConFechas[]>([]);
  const [conductores, setConductores] = useState<ConductorConFechas[]>([]);
  const [tabla, setTabla] = useState<DocumentoTabla[]>([]);
  const [dialogo, setDialogo] = useState<{ inicial: InicialDocumento | null } | null>(null);
  const [aArchivar, setAArchivar] = useState<DocumentoFlota | null>(null);
  const [enMantenimiento, setEnMantenimiento] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [soloAtencion, setSoloAtencion] = useState(true);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    setCargando(true);
    setError(false);
    let qv = supabase
      .from('vehicles')
      .select('id, plate, vehicle_type, status, soat_expiry, techno_expiry, insurance_expiry, operating_card_expiry')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('plate')
      .limit(1000);
    if (branchFilter) qv = qv.eq('branch_id', branchFilter);
    // Conductores en solo lectura con transporte.view (fn_transporte_conductores, columnas acotadas).
    const qc = listarConductores(supabase, organizationId).then((lista) =>
      lista
        .filter((c) => c.activo && (!branchFilter || c.sedeId === branchFilter))
        .map<ConductorConFechas>((c) => ({ id: c.id, full_name: c.nombre, license_category: c.licenciaCategoria, license_expiry: c.licenciaVence, medical_certificate_expiry: c.examenVence })),
    ).catch(() => [] as ConductorConFechas[]);
    // Documentos cargados (número, archivo); sin transporte.view la lista queda vacía.
    const qd = listarDocumentos(supabase, organizationId).catch(() => [] as DocumentoTabla[]);
    Promise.all([qv, qc, qd])
      .then(([v, c, d]) => {
        if (cancelado) return;
        if (v.error) throw v.error;
        const lista = (v.data ?? []) as (VehiculoConFechas & { status: string | null })[];
        setVehiculos(lista);
        setEnMantenimiento(lista.filter((x) => x.status === 'maintenance').length);
        // Sin transporte.view la lista de conductores queda vacía: no es error.
        setConductores(c);
        setTabla(d);
      })
      .catch(() => !cancelado && setError(true))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [organizationId, branchFilter, recarga]);

  const docs = useMemo(() => documentosFlota(vehiculos, conductores, hoy, tabla), [vehiculos, conductores, hoy, tabla]);
  const sinFecha = useMemo(
    () =>
      vehiculos.filter((v) => !v.soat_expiry && !v.techno_expiry && !v.insurance_expiry && !v.operating_card_expiry).length +
      conductores.filter((c) => !c.license_expiry && !c.medical_certificate_expiry).length,
    [vehiculos, conductores],
  );
  const k = kpisDocumentos(docs, sinFecha);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return docs.filter(
      (d) =>
        (filtroEstado ? d.estado === filtroEstado : !soloAtencion || d.estado !== 'vigente') &&
        (!q || [d.nombre, tCausas(d.tipo), d.detalle ?? '', d.numero ?? ''].some((x) => x.toLowerCase().includes(q))),
    );
  }, [docs, soloAtencion, filtroEstado, busqueda, tCausas]);
  const porId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const seleccionados = useMemo(() => Array.from(seleccion, (id) => porId.get(id)).filter((d): d is DocumentoFlota => !!d), [seleccion, porId]);
  useEffect(() => setSeleccion(new Set()), [soloAtencion, filtroEstado, busqueda, branchFilter]);

  const detalleDe = (d: DocumentoFlota) => (d.de === 'vehiculo' ? (d.detalle && tTipos.has(d.detalle) ? tTipos(d.detalle) : d.detalle ?? '') : t('conductor'));
  const relativo = (d: DocumentoFlota) => (d.dias < 0 ? t('hace', { n: -d.dias }) : d.dias === 0 ? t('hoy') : t('en', { n: d.dias }));
  const abrir = (d: DocumentoFlota) => router.push(d.de === 'vehiculo' ? '/app/transporte/vehiculos' : '/app/transporte/conductores');

  const exportar = (lista: readonly DocumentoFlota[]) => {
    const csv = documentosACsv(lista, [t('columnas.documento'), t('columnas.de'), t('columnas.vence'), t('columnas.estado')], (d) => [tCausas(d.tipo), `${d.nombre} (${detalleDe(d)})`, d.vence, t(`estados.${d.estado}`)]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `documentos-flota-${hoy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const verArchivo = async (d: DocumentoFlota) => {
    if (!d.archivo) return;
    // La pestaña se abre dentro del clic; la URL firmada (5 min) llega después.
    const ventana = window.open('', '_blank');
    try {
      const url = await urlArchivo(supabase, d.archivo);
      if (ventana) ventana.location.href = url;
      else window.location.href = url;
    } catch {
      ventana?.close();
      toastError(t('errores.archivo'));
    }
  };

  const guardar = async (datos: DatosDocumento, archivo: File | null) => {
    if (!organizationId) return false;
    try {
      await guardarDocumento(supabase, organizationId, datos, archivo);
      toastSuccess(t('toast.guardado'));
      recargar();
      return true;
    } catch (e) {
      toastError(t(`errores.${e instanceof DocumentoError ? e.codigo : 'error'}`));
      return false;
    }
  };

  const archivar = async (d: DocumentoFlota) => {
    if (!organizationId || !d.docId) return;
    try {
      await archivarDocumento(supabase, organizationId, d.docId);
      toastSuccess(t('toast.archivado'));
      setAArchivar(null);
      recargar();
    } catch (e) {
      toastError(t(`errores.${e instanceof DocumentoError ? e.codigo : 'error'}`));
    }
  };

  const renovar = (d: DocumentoFlota) => setDialogo({ inicial: { de: d.de, duenoId: d.duenoId, tipo: d.tipo as TipoDocumento } });

  const acciones = (d: DocumentoFlota): AccionFila[] => [
    { id: 'archivo', etiqueta: t('acciones.verArchivo'), icono: Paperclip, onSelect: () => void verArchivo(d), oculta: !d.archivo },
    { id: 'renovar', etiqueta: d.docId ? t('acciones.renovar') : t('acciones.cargar'), icono: FileUp, onSelect: () => renovar(d) },
    { id: 'ver', etiqueta: d.de === 'vehiculo' ? t('acciones.verVehiculos') : t('acciones.verConductores'), icono: Eye, onSelect: () => abrir(d), separadorAntes: true },
    { id: 'archivar', etiqueta: t('acciones.archivar'), icono: Archive, onSelect: () => setAArchivar(d), oculta: !d.docId, destructiva: true, separadorAntes: true },
  ];

  const columnas: ColumnaTabla<DocumentoFlota>[] = [
    { id: 'documento', encabezado: t('columnas.documento'), celda: (d) => <span className="font-medium text-fg">{tCausas(d.tipo)}</span> },
    {
      id: 'de',
      encabezado: t('columnas.de'),
      celda: (d) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{d.nombre}</span>
          <span className="truncate text-xs text-fg-muted">{detalleDe(d)}</span>
        </div>
      ),
    },
    {
      id: 'vence',
      encabezado: t('columnas.vence'),
      celda: (d) => (
        <div className="flex flex-col">
          <span className="tabular-nums text-fg">{formatPlain(d.vence)}</span>
          <span className={`text-xs ${d.estado === 'vencido' ? 'text-danger-text' : d.estado === 'por_vencer' ? 'text-warning-text' : 'text-fg-muted'}`}>{relativo(d)}</span>
        </div>
      ),
    },
    { id: 'numero', encabezado: t('columnas.numero'), ocultarDebajo: 'lg', variante: 'mono', celda: (d) => d.numero ?? '—' },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (d) => <StatusBadge estado={d.estado} tono={TONO[d.estado]} etiqueta={t(`estados.${d.estado}`)} /> },
    {
      id: 'bloquea',
      encabezado: t('columnas.bloquea'),
      ocultarDebajo: 'md',
      celda: (d) =>
        !d.bloquea ? (
          <span className="text-sm text-fg-secondary">{t('bloquea.no')}</span>
        ) : d.estado === 'vencido' ? (
          <StatusBadge estado="bloquea" tono="peligro" apariencia="solido" etiqueta={d.de === 'vehiculo' ? t('bloquea.vehiculo') : t('bloquea.conductor')} />
        ) : (
          <span className="text-sm text-fg-secondary">{t('bloquea.hasta', { fecha: formatPlain(d.vence) })}</span>
        ),
    },
    {
      id: 'archivo',
      encabezado: t('columnas.archivo'),
      ocultarDebajo: 'md',
      celda: (d) =>
        d.archivo ? (
          <button
            type="button"
            className="text-sm font-medium text-brand underline-offset-2 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              void verArchivo(d);
            }}
            title={d.archivoNombre ?? undefined}
          >
            {t('archivoVer')}
          </button>
        ) : (
          <span className="text-sm text-warning-text">{t('sinArchivo')}</span>
        ),
    },
  ];

  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'masculino' as const };
  const sinNada = !cargando && !error && vehiculos.length === 0 && conductores.length === 0;
  const estadoTabla = cargando && docs.length === 0 ? 'cargando' : error ? 'error' : visibles.length === 0 ? (busqueda || soloAtencion || filtroEstado ? 'sinResultados' : 'vacio') : 'listo';

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        icono={Bus}
        subtitulo={t('subtitulo')}
        migas={[{ etiqueta: t('migas.transporte'), href: '/app/transporte/viajes' }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva tamano="sm" />}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <AtajoConfigurar seccion="transporte.general" ancla="tipos-vehiculo" />
            <Link href="/app/transporte/vehiculos" className={clasesBoton({ variante: 'secundario' })}>
              <Bus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('irVehiculos')}
            </Link>
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setDialogo({ inicial: null })} disabled={vehiculos.length === 0 && conductores.length === 0}>
              <FileUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('subir')}
            </button>
          </>
        }
        movil={{ accion: <AtajoConfigurar seccion="transporte.general" ancla="tipos-vehiculo" soloIcono /> }}
      />

      {sinNada ? (
        <EmptyState
          icono={Bus}
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          accion={{ etiqueta: t('vacio.agregarVehiculo'), href: '/app/transporte/vehiculos' }}
          accionSecundaria={{ etiqueta: t('vacio.agregarConductor'), href: '/app/transporte/conductores' }}
        />
      ) : (
        <>
          <KpiStrip etiqueta={t('kpis.etiqueta')}>
            <StatCard
              etiqueta={t('kpis.vencidos')}
              cargando={cargando}
              valor={entero(k.vencidos)}
              tono={k.vencidos > 0 ? 'peligro' : 'neutro'}
              iconoDetalle={k.vencidos > 0 ? AlertTriangle : undefined}
              detalle={k.vencidos > 0 ? t('kpis.vencidosDetalle') : t('kpis.vencidosVacio')}
            />
            <StatCard
              etiqueta={t('kpis.porVencer')}
              cargando={cargando}
              valor={entero(k.porVencer)}
              tono={k.porVencer > 0 ? 'advertencia' : 'neutro'}
              detalle={k.primero ? t('kpis.primero', { fecha: formatPlain(k.primero) }) : t('kpis.porVencerVacio')}
            />
            <StatCard etiqueta={t('kpis.vigentes')} cargando={cargando} valor={entero(k.vigentes)} detalle={t('kpis.vigilados', { n: k.total })} />
            {/* Figma 2889:8513: «Sin archivo». Los vehículos en mantenimiento se siguen contando en el detalle. */}
            <StatCard
              etiqueta={t('kpis.sinArchivo')}
              cargando={cargando}
              valor={entero(k.sinArchivo)}
              tono={k.sinArchivo > 0 ? 'advertencia' : 'neutro'}
              detalle={[k.sinFecha > 0 ? t('kpis.sinFecha', { n: k.sinFecha }) : t('kpis.sinArchivoDetalle'), enMantenimiento > 0 ? t('kpis.enMantenimiento', { n: enMantenimiento }) : null].filter(Boolean).join(' · ')}
            />
          </KpiStrip>

          <AvisoTonal tono="informacion" titulo={t('aviso.titulo')} descripcion={t('aviso.descripcion')} compacto />

          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <FileCheck2 aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
            {t('documentos')}
          </h2>
          <ListToolbar
            busqueda={<SearchInput value={busqueda} onChange={setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
            chips={
              <FilterChips
                chips={
                  filtroEstado
                    ? [{ clave: 'estado', etiqueta: t(`estados.${filtroEstado}`) }]
                    : soloAtencion
                      ? [{ clave: 'atencion', etiqueta: t('filtroAtencion') }]
                      : []
                }
                onQuitar={(clave) => (clave === 'estado' ? quitarFiltroEstado() : setSoloAtencion(false))}
                onLimpiarTodo={() => {
                  if (filtroEstado) quitarFiltroEstado();
                  setSoloAtencion(false);
                }}
                textoLimpiarTodo={t('verTodos')}
              />
            }
          />
          <DataTable
            etiqueta={t('documentos')}
            columnas={columnas}
            filas={visibles}
            obtenerId={(d) => d.id}
            estado={estadoTabla}
            seleccion={seleccion}
            onSeleccionChange={setSeleccion}
            onFilaClick={abrir}
            etiquetaFila={(d) => `${tCausas(d.tipo)} · ${d.nombre}`}
            acciones={acciones}
            tonoFila={(d) => (d.estado === 'vencido' ? 'peligro' : undefined)}
            tarjetaMovil={(d, ctx) => (
              <ListCard
                icono={d.de === 'vehiculo' ? Bus : User}
                titulo={tCausas(d.tipo)}
                subtitulo={`${d.nombre} · ${detalleDe(d)}`}
                meta={`${formatPlain(d.vence)} · ${relativo(d)}`}
                estado={<StatusBadge estado={d.estado} tono={TONO[d.estado]} etiqueta={t(`estados.${d.estado}`)} />}
                acciones={acciones(d)}
                onClick={() => abrir(d)}
                seleccionable={ctx.modoSeleccion}
                seleccionado={ctx.seleccionado}
                onSeleccionChange={ctx.alternar}
              />
            )}
            vacio={{ icono: FileCheck2, titulo: t('sinDocumentos.titulo'), descripcion: t('sinDocumentos.descripcion') }}
            sinResultados={{ descripcion: soloAtencion || filtroEstado ? t('todoAlDia') : t('sinResultados') }}
            error={{ titulo: t('errorCarga') }}
            onLimpiarFiltros={() => {
              setBusqueda('');
              setSoloAtencion(false);
              if (filtroEstado) quitarFiltroEstado();
            }}
            onReintentar={recargar}
            termino={busqueda}
          />
        </>
      )}

      <BulkActionBar
        seleccionados={seleccion.size}
        total={visibles.length}
        sustantivo={sustantivo}
        onSeleccionarTodos={() => setSeleccion(new Set(visibles.map((d) => d.id)))}
        onLimpiar={() => setSeleccion(new Set())}
        acciones={[{ id: 'exportar', etiqueta: t('masivo.exportar'), icono: Download, onClick: () => exportar(seleccionados) }]}
      />

      {dialogo && (
        <DialogoDocumento
          vehiculos={vehiculos.map((v) => ({ id: v.id, nombre: v.plate }))}
          conductores={conductores.map((c) => ({ id: c.id, nombre: c.full_name?.trim() || '—' }))}
          inicial={dialogo.inicial}
          onCerrar={() => setDialogo(null)}
          onGuardar={guardar}
        />
      )}

      <ConfirmDialog
        abierto={aArchivar !== null}
        onAbiertoChange={(v) => !v && setAArchivar(null)}
        titulo={t('archivar.titulo', { documento: aArchivar ? tCausas(aArchivar.tipo) : '', de: aArchivar?.nombre ?? '' })}
        descripcion={t('archivar.descripcion')}
        textoConfirmar={t('archivar.confirmar')}
        textoCancelar={t('archivar.volver')}
        tono="peligro"
        icono={Archive}
        onConfirmar={() => {
          if (aArchivar) void archivar(aArchivar);
        }}
      />
    </div>
  );
}
