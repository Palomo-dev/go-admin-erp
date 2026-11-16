'use client';

/**
 * Ausencias › Incapacidades y licencias (Figma 20.14.1–20.14.13, `96-hrm-f2-14-*`).
 *
 * Lista del mes con quién paga cada tramo y si llegó el soporte. Decisión 2: RR. HH.
 * sin el permiso de salud ve el tipo y las fechas, nunca el diagnóstico ni el soporte;
 * el jefe ve «Ausencia justificada» y nada más. Lo decide la base fila por fila.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban, Eye, FolderOpen, HeartPulse, Home, Plus, Upload } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  FilterChips,
  FilterPanel,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  StatusBadge,
  clasesBoton,
  useParametrosUrl,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateCore';
import { TIPOS_DOCUMENTO_PERMITIDOS } from '@/lib/services/hrm/tipos';
import { ErrorPersonas } from '../personas/apiPersonas';
import { NavPestanasHrm } from '../navegacion/NavPestanasHrm';
import { subirSoporte } from './apiAusencias';
import {
  FILTROS_VACIOS,
  conteoFiltros,
  esMes,
  estadoVisible,
  filtrarAusencias,
  mesDeDia,
  primerDia,
  ultimoDia,
  type EstadoVisible,
  type FilaAusencia,
  type FiltrosAusencias,
  type Seccion,
} from './ausenciasLogica';
import { DialogoAnular } from './DialogosAusencia';
import { DialogoRegistrarAusencia, type PrellenadoRegistro } from './DialogoRegistrarAusencia';
import { BarraSecciones, CeldaPersona, EstadoAusencia, RUTA_AUSENCIAS, useFechas, useListaAusencias, useQuienPaga } from './piezasAusencias';
import { claveError } from './useSimulacion';

const CLASES = ['incapacidad_comun', 'incapacidad_laboral', 'maternidad', 'paternidad', 'luto'] as const;
const ESTADOS_FILTRO: readonly EstadoVisible[] = ['en_curso', 'aprobada', 'terminada', 'por_aprobar', 'cancelada'];

/** «Incapacidad» + «Enfermedad general · origen común», «Licencia de maternidad» + «18 semanas»… */
export function useTipoAusencia() {
  const t = useTranslations('hrmAusencias.tipos');
  const f = useFechas();
  return useCallback((x: Pick<FilaAusencia, 'clase' | 'tipo_nombre' | 'dias_calendario' | 'dias_habiles'>): { titulo: string; detalle: string | null } => {
    switch (x.clase) {
      case 'incapacidad_comun':
        return { titulo: t('incapacidad'), detalle: t('comun') };
      case 'incapacidad_laboral':
        return { titulo: t('incapacidad'), detalle: t('laboral') };
      case 'maternidad':
        return { titulo: t('maternidad'), detalle: t('semanas', { n: f.dias(Number(x.dias_calendario) / 7) }) };
      case 'paternidad':
        return { titulo: t('paternidad'), detalle: t('semanas', { n: f.dias(Number(x.dias_calendario) / 7) }) };
      case 'luto':
        return { titulo: t('luto'), detalle: t('lutoDetalle', { n: f.dias(x.dias_habiles ?? x.dias_calendario) }) };
      case 'justificada':
        return { titulo: t('justificada'), detalle: null };
      default:
        return { titulo: x.tipo_nombre ?? t('ausencia'), detalle: null };
    }
  }, [t, f]);
}

export function IncapacidadesVista({ seccion, onSeccion }: { seccion: Seccion; onSeccion: (s: Seccion) => void }) {
  const t = useTranslations('hrmAusencias.incapacidades');
  const ta = useTranslations('hrmAusencias');
  const tc = useTranslations('hrmPersonas.comun');
  const te = useTranslations('hrmAusencias');
  const router = useRouter();
  const f = useFechas();
  const tipoDe = useTipoAusencia();
  const quienPaga = useQuienPaga();
  const { getToday } = useFormatDate();
  const { leer } = useParametrosUrl();
  const mesUrl = leer('mes');
  const mes = esMes(mesUrl) ? mesUrl : mesDeDia(getToday());
  const { carga, recargar } = useListaAusencias('incapacidades', primerDia(mes), ultimoDia(mes));
  const [filtros, setFiltros] = useState<FiltrosAusencias>(FILTROS_VACIOS);
  const [registrar, setRegistrar] = useState(false);
  const [prellenado, setPrellenado] = useState<PrellenadoRegistro | null>(null);
  const [anular, setAnular] = useState<FilaAusencia | null>(null);
  const [subiendo, setSubiendo] = useState<FilaAusencia | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const datos = carga.estado === 'listo' ? carga.datos : null;
  const hoy = datos?.hoy ?? getToday();
  const todas = useMemo(() => datos?.filas ?? [], [datos]);
  const filas = useMemo(() => filtrarAusencias(todas, filtros, hoy, (x) => tipoDe(x).titulo), [todas, filtros, hoy, tipoDe]);
  const permisos = datos?.permisos;
  const sinPermiso = carga.estado === 'sinPermiso';
  const enCurso = todas.filter((x) => estadoVisible(x, hoy) === 'en_curso').length;
  const sinSoporte = todas.filter((x) => x.soporte === 'falta' && x.estado !== 'cancelled').length;

  const abrir = (x: FilaAusencia) => router.push(`${RUTA_AUSENCIAS}/${x.id}`);
  const cambiar = (p: Partial<FiltrosAusencias>) => setFiltros((x) => ({ ...x, ...p }));
  const limpiar = () => setFiltros((x) => ({ ...FILTROS_VACIOS, texto: x.texto }));

  const pedirArchivo = (x: FilaAusencia) => {
    setSubiendo(x);
    entrada.current?.click();
  };
  const subir = async (archivo: File | null) => {
    const x = subiendo;
    if (entrada.current) entrada.current.value = '';
    if (!archivo || !x?.persona_id) return;
    try {
      await subirSoporte(x.id, x.persona_id, x.vinculo_id, archivo);
      toast.success(t('soporteSubido'));
      void recargar();
    } catch (e) {
      toast.error(e instanceof ErrorPersonas && e.status === 403 ? t('soporteSinPermiso') : te(`errores.${claveError(e instanceof ErrorPersonas ? e.codigo : null)}`));
    } finally {
      setSubiendo(null);
    }
  };

  const accionesDe = (x: FilaAusencia): AccionFila[] => {
    const e = estadoVisible(x, hoy);
    const viva = x.estado === 'requested' || x.estado === 'approved' || x.estado === 'taken';
    const incapacidad = x.clase === 'incapacidad_comun' || x.clase === 'incapacidad_laboral';
    return [
      { id: 'ver', etiqueta: t('menu.ver'), icono: Eye, onSelect: () => abrir(x) },
      { id: 'soporte', etiqueta: t('menu.soporte'), icono: Upload, onSelect: () => pedirArchivo(x), oculta: !permisos?.registrar || !viva || x.nivel !== 'completo' || !x.persona_id },
      {
        id: 'prorroga',
        etiqueta: t('menu.prorroga'),
        icono: Plus,
        oculta: !permisos?.registrar || !incapacidad || !viva,
        onSelect: () => {
          setPrellenado({
            vinculo_id: x.vinculo_id,
            persona_id: x.persona_id,
            nombre: x.nombre,
            origen: x.clase === 'incapacidad_laboral' ? 'laboral' : 'comun',
            prorroga_de: x.id,
            desde: addPlainDays(x.hasta, 1),
          });
          setRegistrar(true);
        },
      },
      {
        id: 'expediente',
        etiqueta: t('menu.expediente'),
        icono: FolderOpen,
        oculta: !x.persona_id || x.nivel === 'justificada',
        onSelect: () => router.push(`/app/hrm/empleados/${x.persona_id}?pestana=documentos`),
      },
      {
        id: 'anular',
        etiqueta: t('menu.anular'),
        icono: Ban,
        destructiva: true,
        separadorAntes: true,
        oculta: !permisos?.registrar || !viva || e === 'terminada',
        onSelect: () => setAnular(x),
      },
    ];
  };

  const chips: ChipFiltro[] = [
    ...(filtros.clases.length ? [{ clave: 'clases', etiqueta: filtros.clases.map((c) => ta(`clases.${c}`)).join(', ') }] : []),
    ...(filtros.estados.length ? [{ clave: 'estados', etiqueta: filtros.estados.map((e) => ta(`estados.${e}`)).join(', ') }] : []),
    ...(filtros.soloSinSoporte ? [{ clave: 'soporte', etiqueta: t('filtros.sinSoporte') }] : []),
  ];

  const columnas: ColumnaTabla<FilaAusencia>[] = [
    { id: 'persona', encabezado: t('columnas.persona'), celda: (x) => <CeldaPersona fila={x} /> },
    {
      id: 'tipo',
      encabezado: t('columnas.tipo'),
      celda: (x) => {
        const tp = tipoDe(x);
        return (
          <div className="min-w-0">
            <p className="truncate text-fg">{tp.titulo}</p>
            {tp.detalle ? <p className="truncate text-xs text-fg-secondary">{tp.detalle}</p> : null}
          </div>
        );
      },
    },
    {
      id: 'fechas',
      encabezado: t('columnas.fechas'),
      ocultarDebajo: 'md',
      celda: (x) => (
        <div>
          <p className="text-fg">{f.rango(x.desde, x.hasta)}</p>
          <p className="text-xs text-fg-secondary">{x.cuenta === 'habiles' ? t('nHabiles', { n: f.dias(x.dias_habiles) }) : t('nDias', { n: f.dias(x.dias_calendario) })}</p>
        </div>
      ),
    },
    { id: 'paga', encabezado: t('columnas.paga'), ocultarDebajo: 'lg', celda: (x) => <span>{x.tramos ? quienPaga(x.tramos) : '—'}</span> },
    {
      id: 'soporte',
      encabezado: t('columnas.soporte'),
      ocultarDebajo: 'md',
      celda: (x) =>
        x.soporte === 'recibido' ? (
          <StatusBadge estado="recibido" tono="exito" etiqueta={t('soporte.recibido')} />
        ) : x.soporte === 'falta' ? (
          <StatusBadge estado="falta" tono="peligro" etiqueta={t('soporte.falta')} />
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (x) => <EstadoAusencia fila={x} hoy={hoy} /> },
  ];

  const accion = permisos?.registrar ? (
    <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => { setPrellenado(null); setRegistrar(true); }}>
      <Plus aria-hidden className="size-4" strokeWidth={1.5} />
      {t('registrar')}
    </button>
  ) : null;
  const subtitulo = [f.mesAnio(mes), datos && enCurso ? t('nEnCurso', { n: enCurso }) : null, datos && sinSoporte ? t('nSinSoporte', { n: sinSoporte }) : null].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={HeartPulse}
        migas={[{ etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' }, { etiqueta: ta('titulo') }]}
        cargando={carga.estado === 'cargando'}
        acciones={sinPermiso ? undefined : accion}
        debajo={sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        movil={{ subtitulo }}
      />
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_DOCUMENTO_PERMITIDOS.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void subir(e.target.files?.[0] ?? null)}
      />

      {sinPermiso ? (
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('irInicio'), href: '/app/inicio', icono: Home }} />
      ) : (
        <>
          <BarraSecciones valor={seccion} onValor={onSeccion} />
          {(todas.length > 0 || carga.estado === 'cargando' || filtros.texto || conteoFiltros(filtros) > 0) && carga.estado !== 'error' ? (
            <ListToolbar
              busqueda={<SearchInput value={filtros.texto} onChange={(v) => cambiar({ texto: v })} placeholder={t('buscar')} etiqueta={t('buscar')} />}
              filtros={
                <FilterPanel conteo={conteoFiltros(filtros)} onLimpiar={limpiar} textoVerResultados={t('verN', { n: filas.length })}>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.tipo')}</legend>
                    {CLASES.map((c) => (
                      <label key={c} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                        <Checkbox checked={filtros.clases.includes(c)} onCheckedChange={(v) => cambiar({ clases: v === true ? [...filtros.clases, c] : filtros.clases.filter((x) => x !== c) })} />
                        {ta(`clases.${c}`)}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
                    {ESTADOS_FILTRO.map((e) => (
                      <label key={e} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                        <Checkbox checked={filtros.estados.includes(e)} onCheckedChange={(v) => cambiar({ estados: v === true ? [...filtros.estados, e] : filtros.estados.filter((x) => x !== e) })} />
                        {ta(`estados.${e}`)}
                      </label>
                    ))}
                  </fieldset>
                  <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                    <Checkbox checked={filtros.soloSinSoporte} onCheckedChange={(v) => cambiar({ soloSinSoporte: v === true })} />
                    {t('filtros.sinSoporte')}
                  </label>
                </FilterPanel>
              }
              chips={
                chips.length ? (
                  <FilterChips
                    chips={chips}
                    onQuitar={(c) => cambiar(c === 'clases' ? { clases: [] } : c === 'estados' ? { estados: [] } : { soloSinSoporte: false })}
                    onLimpiarTodo={limpiar}
                  />
                ) : undefined
              }
            />
          ) : null}

          <DataTable
            etiqueta={t('titulo')}
            columnas={columnas}
            filas={filas}
            obtenerId={(x) => x.id}
            estado={carga.estado === 'cargando' ? 'cargando' : carga.estado !== 'listo' ? 'error' : filas.length === 0 ? (todas.length === 0 ? 'vacio' : 'sinResultados') : 'listo'}
            onFilaClick={abrir}
            etiquetaFila={(x) => x.nombre ?? '—'}
            acciones={accionesDe}
            tarjetaMovil={(x) => {
              const tp = tipoDe(x);
              return (
                <ListCard
                  avatar={{ nombre: x.nombre ?? '?' }}
                  titulo={x.nombre ?? '—'}
                  subtitulo={`${tp.titulo} · ${f.rangoCorto(x.desde, x.hasta)}`}
                  meta={[x.tramos ? quienPaga(x.tramos) : null, x.soporte === 'falta' ? t('faltaSoporteCorto') : null].filter(Boolean).join(' · ') || undefined}
                  estado={
                    x.soporte === 'falta' && x.estado !== 'cancelled' ? (
                      <StatusBadge estado="falta" tono="peligro" etiqueta={t('faltaSoporte')} />
                    ) : (
                      <EstadoAusencia fila={x} hoy={hoy} />
                    )
                  }
                  onClick={() => abrir(x)}
                  acciones={accionesDe(x)}
                />
              );
            }}
            vacio={{
              titulo: t('vacio.titulo'),
              descripcion: t('vacio.descripcion'),
              icono: HeartPulse,
              accion: permisos?.registrar ? { etiqueta: t('registrar'), icono: Plus, onClick: () => setRegistrar(true) } : undefined,
            }}
            sinResultados={{ descripcion: t('sinResultados') }}
            onLimpiarFiltros={() => setFiltros(FILTROS_VACIOS)}
            termino={filtros.texto}
            error={{ titulo: t('error') }}
            onReintentar={() => void recargar()}
          />
          {carga.estado === 'listo' && todas.length > 0 ? <p className="text-sm text-fg-secondary">{t('nota')}</p> : null}
        </>
      )}

      <DialogoRegistrarAusencia abierto={registrar} onAbiertoChange={setRegistrar} hoy={hoy} datos={datos} prellenado={prellenado} onHecho={() => void recargar()} />
      <DialogoAnular fila={anular} onCerrar={() => setAnular(null)} onHecho={() => void recargar()} />
    </div>
  );
}
