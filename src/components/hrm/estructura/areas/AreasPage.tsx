'use client';

/**
 * Recursos humanos › Áreas (Figma 20.1, `95-hrm-01-01` a `01-10`).
 *
 * - Escritorio: organigrama navegable o lista con sangría (`DataTable` con
 *   `TreeCell`); el detalle abre en `HojaDetalle`.
 * - Celular: la lista con sangría (`TreeCard`) y el detalle en hoja inferior.
 * - La sede sale del selector del header (PATRONES §9): un área sin sedes
 *   marcadas opera en todas.
 * - Estados: cargando, vacío, error y sin permiso, con `EmptyState`.
 *
 * Lectura: `GET /api/hrm/estructura/areas` (permiso «Ver cargos», lo decide la base).
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Network, Pencil, Plus, Rows3 } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  FilterChips,
  FilterPanel,
  ListToolbar,
  PageHeader,
  SearchInput,
  SegmentedControl,
  TreeCard,
  TreeCell,
  clasesBoton,
  useEsEscritorio,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import {
  FILTROS_AREAS,
  abiertasIniciales,
  aplanarOrganigrama,
  construirOrganigrama,
  filtrarOrganigrama,
  type AreaArbol,
  type FiltrosAreas,
} from '@/lib/hrm/estructura/logica';
import type { RespuestaAreas } from '@/lib/hrm/estructura/tipos';
import { NavPestanasHrm } from '@/components/hrm/navegacion/NavPestanasHrm';
import { RUTA_AREAS, RUTA_HRM, useCarga } from '../comun';
import { DetalleArea } from './DetalleArea';
import { Organigrama } from './Organigrama';

type Vista = 'organigrama' | 'lista';

export function AreasPage() {
  const t = useTranslations('hrmEstructura.areas');
  const tc = useTranslations('hrmEstructura.comun');
  const router = useRouter();
  const params = useSearchParams();
  const escritorio = useEsEscritorio();
  const sede = useBranchOpcional()?.branchFilter ?? null;
  const { carga, recargar } = useCarga<RespuestaAreas>('/api/hrm/estructura/areas');
  const datos = carga.estado === 'listo' ? carga.datos : null;

  const [vista, setVista] = useState<Vista>('organigrama');
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState<FiltrosAreas>(FILTROS_AREAS);
  const [abiertas, setAbiertas] = useState<Set<string> | null>(null);
  const [elegida, setElegida] = useState<string | null>(params?.get('area') ?? null);

  const raices = useMemo(() => construirOrganigrama(datos?.areas ?? []), [datos]);
  useEffect(() => {
    if (datos && abiertas === null) setAbiertas(abiertasIniciales(raices));
  }, [datos, raices, abiertas]);
  const filtrado = useMemo(() => filtrarOrganigrama(raices, texto, sede, filtros), [raices, texto, sede, filtros]);
  const conteoFiltros = (filtros.vacantes ? 1 : 0) + (filtros.sinResponsable ? 1 : 0);
  const buscando = texto.trim() !== '' || sede !== null || conteoFiltros > 0;
  const filas = useMemo(
    () => aplanarOrganigrama(filtrado.raices, abiertas ?? new Set(), buscando),
    [filtrado, abiertas, buscando]
  );
  const porId = useMemo(() => {
    const m = new Map<string, AreaArbol>();
    const recorrer = (n: AreaArbol) => {
      m.set(n.area.id, n);
      n.hijos.forEach(recorrer);
    };
    raices.forEach(recorrer);
    return m;
  }, [raices]);

  const alternar = (id: string) =>
    setAbiertas((s) => {
      const n = new Set(s ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const elegir = (id: string | null) => {
    setElegida(id);
    const url = id ? `${RUTA_AREAS}?area=${encodeURIComponent(id)}` : RUTA_AREAS;
    router.replace(url, { scroll: false });
  };

  const puedeGestionar = !!datos?.permisos.gestionar;
  const accionesDe = (n: AreaArbol): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => elegir(n.area.id) },
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => router.push(`${RUTA_AREAS}/${n.area.id}/editar`), oculta: !puedeGestionar },
  ];

  const columnas: ColumnaTabla<AreaArbol>[] = [
    {
      id: 'area',
      encabezado: t('columnas.area'),
      celda: (n) => (
        <TreeCell
          titulo={n.area.nombre}
          subtitulo={n.area.centro_costo?.codigo ?? undefined}
          nivel={n.nivel}
          tieneHijos={n.hijos.length > 0 && !buscando}
          abierto={abiertas?.has(n.area.id)}
          onAlternar={() => alternar(n.area.id)}
          icono={Network}
          contexto={buscando && filtrado.coincidencias.size > 0 && !filtrado.coincidencias.has(n.area.id)}
        />
      ),
    },
    { id: 'responsable', encabezado: t('columnas.responsable'), ocultarDebajo: 'md', celda: (n) => n.area.responsable?.nombre ?? '—' },
    { id: 'personas', encabezado: t('columnas.personas'), alinear: 'derecha', celda: (n) => n.personasTotal },
    {
      id: 'vacantes',
      encabezado: t('columnas.vacantes'),
      celda: (n) =>
        n.vacantesTotal > 0 ? (
          <Badge tono="advertencia" tamano="sm">
            {t('vacantes', { n: n.vacantesTotal })}
          </Badge>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
  ];

  const nuevaArea = () => router.push(`${RUTA_AREAS}/nueva`);
  const estado =
    carga.estado === 'sinPermiso'
      ? 'sinPermiso'
      : carga.estado === 'cargando'
        ? 'cargando'
        : carga.estado === 'error' || carga.estado === 'noExiste'
          ? 'error'
          : (datos?.areas.length ?? 0) === 0
            ? 'vacio'
            : filas.length === 0
              ? 'sinResultados'
              : 'listo';

  const vacio = {
    titulo: t('vacio.titulo'),
    descripcion: t('vacio.descripcion'),
    icono: Network,
    accion: puedeGestionar ? { etiqueta: t('vacio.crear'), onClick: nuevaArea, icono: Plus } : undefined,
  };
  const sinPermiso = {
    titulo: t('sinPermiso.titulo'),
    descripcion: t('sinPermiso.descripcion'),
    accion: { etiqueta: tc('volverInicio'), href: '/app/inicio' },
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={carga.estado === 'sinPermiso' ? undefined : escritorio ? t('subtitulo') : t('subtituloMovil')}
        icono={Network}
        migas={[{ etiqueta: tc('rrhh'), href: RUTA_HRM }, { etiqueta: t('titulo') }]}
        debajo={<NavPestanasHrm incrustada />}
        cargando={carga.estado === 'cargando'}
        acciones={
          estado === 'listo' || estado === 'sinResultados' ? (
            <>
              {puedeGestionar && (
                <button type="button" onClick={nuevaArea} className={clasesBoton({ variante: 'primario' })}>
                  <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                  {t('nueva')}
                </button>
              )}
            </>
          ) : undefined
        }
        movil={{
          accion: puedeGestionar ? (
            <button
              type="button"
              onClick={nuevaArea}
              aria-label={t('nueva')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      {(estado === 'listo' || estado === 'sinResultados') && (
        <ListToolbar
          busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} debounceMs={200} />}
          filtros={
            <div className="flex items-center gap-2 sm:gap-3">
              <FilterPanel conteo={conteoFiltros} onLimpiar={() => setFiltros(FILTROS_AREAS)} textoVerResultados={t('filtros.verN', { n: filas.length })}>
                <label className="flex items-center gap-3 text-sm text-fg">
                  <Checkbox checked={filtros.vacantes} onCheckedChange={(v) => setFiltros((f) => ({ ...f, vacantes: v === true }))} />
                  {t('filtros.vacantes')}
                </label>
                <label className="flex items-center gap-3 text-sm text-fg">
                  <Checkbox checked={filtros.sinResponsable} onCheckedChange={(v) => setFiltros((f) => ({ ...f, sinResponsable: v === true }))} />
                  {t('filtros.sinResponsable')}
                </label>
              </FilterPanel>
              {escritorio && (
                <SegmentedControl<Vista>
                  etiqueta={t('vista.etiqueta')}
                  tamano="sm"
                  valor={vista}
                  onValorChange={setVista}
                  opciones={[
                    { valor: 'organigrama', etiqueta: t('vista.organigrama'), icono: Network },
                    { valor: 'lista', etiqueta: t('vista.lista'), icono: Rows3 },
                  ]}
                />
              )}
            </div>
          }
          chips={
            conteoFiltros > 0 ? (
              <FilterChips
                chips={[
                  ...(filtros.vacantes ? [{ clave: 'vacantes', etiqueta: t('filtros.vacantes') }] : []),
                  ...(filtros.sinResponsable ? [{ clave: 'sinResponsable', etiqueta: t('filtros.sinResponsable') }] : []),
                ]}
                onQuitar={(clave) => setFiltros((f) => ({ ...f, [clave]: false }))}
                onLimpiarTodo={() => setFiltros(FILTROS_AREAS)}
              />
            ) : undefined
          }
        />
      )}

      {escritorio && vista === 'organigrama' && estado === 'listo' ? (
        <Organigrama
          raices={filtrado.raices}
          abiertas={buscando ? new Set(porId.keys()) : abiertas ?? new Set()}
          onAlternar={alternar}
          seleccionada={elegida}
          coincidencias={filtrado.coincidencias}
          onElegir={elegir}
        />
      ) : escritorio && vista === 'organigrama' && estado === 'cargando' ? (
        <div className="flex min-h-[560px] flex-col items-center gap-8 rounded-xl border border-line bg-subtle p-8" aria-busy="true">
          <Skeleton className="h-32 w-[232px] rounded-xl" />
          <div className="flex gap-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-[232px] rounded-xl" />
            ))}
          </div>
        </div>
      ) : estado === 'vacio' || estado === 'sinPermiso' || estado === 'error' ? (
        <EmptyState
          variante={estado === 'vacio' ? 'empty' : estado === 'sinPermiso' ? 'forbidden' : 'error'}
          {...(estado === 'vacio' ? vacio : estado === 'sinPermiso' ? sinPermiso : { titulo: t('error.titulo'), descripcion: t('error.descripcion') })}
          onReintentar={() => void recargar()}
        />
      ) : (
        <DataTable
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={filas}
          obtenerId={(n) => n.area.id}
          estado={estado}
          onFilaClick={(n) => elegir(n.area.id)}
          etiquetaFila={(n) => n.area.nombre}
          acciones={accionesDe}
          densidad="compacta"
          tarjetaMovil={(n) => (
            <TreeCard
              nivel={n.nivel}
              tieneHijos={n.hijos.length > 0 && !buscando}
              abierto={abiertas?.has(n.area.id)}
              onAlternar={() => alternar(n.area.id)}
              icono={Network}
              titulo={n.area.nombre}
              subtitulo={t('personas', { n: n.personasTotal })}
              estado={
                n.vacantesTotal > 0 ? (
                  <Badge tono="advertencia" tamano="sm">
                    {t('vacantes', { n: n.vacantesTotal })}
                  </Badge>
                ) : undefined
              }
              onClick={() => elegir(n.area.id)}
            />
          )}
          sinResultados={{ descripcion: t('sinResultados') }}
          onLimpiarFiltros={() => {
            setTexto('');
            setFiltros(FILTROS_AREAS);
          }}
          termino={texto}
        />
      )}

      {datos && (
        <DetalleArea
          nodo={elegida ? porId.get(elegida) ?? null : null}
          areas={datos.areas}
          sedes={datos.sedes}
          puedeEditar={puedeGestionar}
          onCerrar={() => elegir(null)}
        />
      )}
    </div>
  );
}
