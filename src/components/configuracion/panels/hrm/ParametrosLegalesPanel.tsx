'use client';

/**
 * Configuración › Recursos humanos › Parámetros legales (diseño 10.RH.1,
 * Figma `2506:23425`; pantallazos 95-hrm-config-01…09).
 *
 * - «Valores de ley»: los mantiene GO Admin; aquí se leen con su norma, su
 *   estado (vigente, transitorio, en litigio, suspendido, por confirmar) y su
 *   historial. «Valores al» muestra lo que regía o regirá en otra fecha.
 * - «Lo que define tu empresa»: lo que la ley deja decidir (adelantar la
 *   jornada o el recargo, exoneración, ARL, PILA, periodicidad, retención).
 *   Se guarda con la barra «N cambios sin guardar» del diálogo.
 *
 * Decisiones del dueño (2026-11-15): los valores [S] se muestran con su valor
 * y su estado; una nómina de 2027 no cierra sin el SMMLV y la UVT de 2027,
 * pero se puede preliquidar; la clase ARL gana por cargo en sede › cargo ›
 * sede › por defecto. El permiso lo resuelve la base (hr.parameters.manage).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock, ChevronRight, ExternalLink, Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  AvisoTonal,
  CampoFecha,
  ChipsOpcion,
  ConfirmDialog,
  Dialogo,
  EmptyState,
  FilaDato,
  FilterChips,
  FilterPanel,
  FormField,
  ListToolbar,
  ListaDatos,
  RowActionsMenu,
  SearchInput,
  SettingRow,
  clasesBoton,
  type ChipFiltro,
  type TonoBadge,
} from '@/components/kit';
import type { CambioEmpresa, DatosParametros, FilaParametro, ReglaArl } from '@/lib/hrm/configuracion/tipos';
import {
  CATALOGO_PARAMETROS,
  GRUPOS_PARAMETROS,
  estadoEn,
  filasOtros,
  lectorEn,
  type EstadoFila,
  type FilaCatalogo,
  type Lectura,
} from '@/lib/hrm/configuracion/parametrosCatalogo';
import { coincideBusqueda, historialDe, metaProgramada, periodoQueCruza, proximoDesde, valorEmpresa, vigenteEn } from '@/lib/hrm/configuracion/parametrosVista';
import { useRegistrarCambios } from '../../dialogo/cambiosSinGuardar';
import { GrupoAjustes } from '../../layout/EnlacesAjuste';
import { CargandoHrm, ErrorCargaHrm, PieHrm, SelectorHrm, SinPermisoHrm, VolverA, pedirHrm, useCargaHrm, useFormatoHrm } from './comun';

const URL = '/api/hrm/configuracion/parametros';
const OPERADORES_PILA = ['aportes_en_linea', 'mi_planilla', 'soi', 'simple', 'asopagos', 'enlace_operativo', 'arus'] as const;
const PERIODICIDADES = ['semanal', 'decadal', 'quincenal', 'mensual'] as const;
const CLASES_ARL = [1, 2, 3, 4, 5] as const;
const ROMANO = ['', 'I', 'II', 'III', 'IV', 'V'];
const FILTROS_ESTADO = ['todos', 'vigente', 'transitorio', 'litigio', 'programado', 'por_confirmar'] as const;
type FiltroEstado = (typeof FILTROS_ESTADO)[number];

const TONO_ESTADO: Record<EstadoFila | 'cerrada' | 'programada', TonoBadge> = {
  vigente: 'exito',
  transitorio: 'advertencia',
  litigio: 'advertencia',
  suspendido: 'peligro',
  por_confirmar: 'neutro',
  sin_valor: 'neutro',
  cerrada: 'neutro',
  programada: 'informacion',
};

function EstadoParametro({ estado }: { estado: keyof typeof TONO_ESTADO }) {
  const t = useTranslations('hrmConfig.parametros.estado');
  return (
    <Badge tono={TONO_ESTADO[estado]} apariencia="contorno" tamano="sm" className="shrink-0">
      {t(estado)}
    </Badge>
  );
}

export function ParametrosLegalesPanel() {
  const t = useTranslations('hrmConfig.parametros');
  const { carga, recargar } = useCargaHrm<DatosParametros>(URL);
  if (carga.estado === 'cargando') return <CargandoHrm filas={8} />;
  if (carga.estado === 'sinPermiso') return <SinPermisoHrm permiso={t('permiso')} />;
  if (carga.estado === 'error') return <ErrorCargaHrm titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />;
  return <ParametrosCargados datos={carga.datos} recargar={recargar} />;
}

// ─── Borrador de «Lo que define tu empresa» ─────────────────────────────────

interface Borrador {
  jornada: { activo: boolean; desde: string };
  dominical: { activo: boolean; desde: string };
  exoneracion: boolean;
  pila: string | null;
  periodicidad: string | null;
  retencion: string | null;
}

const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);

function borradorDe(d: DatosParametros): Borrador {
  const fila = (code: string) => valorEmpresa(d.empresa, code, d.hoy);
  const jornada = fila('jornada_max_semanal');
  const dominical = fila('recargo_dominical_festivo');
  const retencion = fila('retencion_procedimiento');
  return {
    jornada: { activo: Boolean(jornada), desde: jornada?.effective_from ?? d.hoy },
    dominical: { activo: Boolean(dominical), desde: dominical?.effective_from ?? d.hoy },
    exoneracion: fila('exoneracion_114_1_aplica')?.value_json === true,
    pila: texto(fila('pila_operador')?.value_json),
    periodicidad: texto(fila('periodicidad_pago')?.value_json),
    retencion: retencion?.value != null ? String(retencion.value) : null,
  };
}

function ParametrosCargados({ datos, recargar }: { datos: DatosParametros; recargar: () => Promise<void> }) {
  const t = useTranslations('hrmConfig.parametros');
  const { toast } = useToast();
  const [vista, setVista] = useState<'ley' | 'empresa'>('ley');
  const [detalle, setDetalle] = useState<string | null>(null);
  const original = useMemo(() => borradorDe(datos), [datos]);
  const [borrador, setBorrador] = useState<Borrador>(original);
  const [base, setBase] = useState(original);
  if (base !== original) {
    // Llegaron datos nuevos (tras guardar o reintentar): el borrador parte de ellos.
    setBase(original);
    setBorrador(original);
  }
  const [guardando, setGuardando] = useState(false);

  const metaJornada = metaProgramada(datos.ley, 'jornada_max_semanal', datos.hoy);
  const metaDominical = metaProgramada(datos.ley, 'recargo_dominical_festivo', datos.hoy);

  const cambios = useMemo(() => {
    const lista: CambioEmpresa[] = [];
    const o = original;
    const b = borrador;
    if (metaJornada && (b.jornada.activo !== o.jornada.activo || (b.jornada.activo && b.jornada.desde !== o.jornada.desde)))
      lista.push({ code: 'jornada_max_semanal', valor: metaJornada.valor, desde: b.jornada.activo ? b.jornada.desde : null, activo: b.jornada.activo });
    if (metaDominical && (b.dominical.activo !== o.dominical.activo || (b.dominical.activo && b.dominical.desde !== o.dominical.desde)))
      lista.push({ code: 'recargo_dominical_festivo', valor: metaDominical.valor, desde: b.dominical.activo ? b.dominical.desde : null, activo: b.dominical.activo });
    if (b.exoneracion !== o.exoneracion) lista.push({ code: 'exoneracion_114_1_aplica', valor_json: b.exoneracion, activo: true });
    if (b.pila !== o.pila) lista.push({ code: 'pila_operador', valor_json: b.pila, activo: b.pila !== null });
    if (b.periodicidad !== o.periodicidad) lista.push({ code: 'periodicidad_pago', valor_json: b.periodicidad, activo: b.periodicidad !== null });
    if (b.retencion !== o.retencion) lista.push({ code: 'retencion_procedimiento', valor: b.retencion === null ? null : Number(b.retencion), activo: b.retencion !== null });
    return lista;
  }, [borrador, original, metaJornada, metaDominical]);

  const guardar = async () => {
    if (cambios.length === 0) return;
    setGuardando(true);
    try {
      await pedirHrm(URL, { metodo: 'PUT', cuerpo: { cambios } });
      toast({ title: t('empresa.guardado') });
      await recargar();
    } catch {
      toast({ title: t('empresa.errorGuardar'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  useRegistrarCambios({ cambios: cambios.length, guardando, guardar, descartar: () => setBorrador(original) });

  const irAEmpresa = () => {
    setDetalle(null);
    setVista('empresa');
  };

  if (detalle) {
    const fila = [...CATALOGO_PARAMETROS, ...filasOtros(datos.ley)].find((f) => f.id === detalle);
    if (fila) return <DetalleParametro datos={datos} fila={fila} onVolver={() => setDetalle(null)} onIrAEmpresa={irAEmpresa} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <ChipsOpcion
        opciones={[
          { valor: 'ley', etiqueta: t('vistas.ley') },
          { valor: 'empresa', etiqueta: t('vistas.empresa') },
        ]}
        valor={vista}
        onValorChange={(v) => setVista(v)}
        etiqueta={t('vistas.etiqueta')}
      />
      {vista === 'ley' ? (
        <ValoresDeLey datos={datos} onAbrir={setDetalle} onIrAEmpresa={irAEmpresa} />
      ) : (
        <LoQueDefineEmpresa
          datos={datos}
          borrador={borrador}
          setBorrador={setBorrador}
          metaJornada={metaJornada}
          metaDominical={metaDominical}
          recargar={recargar}
        />
      )}
    </div>
  );
}

// ─── Valores de ley ─────────────────────────────────────────────────────────

function useLectura() {
  const t = useTranslations('hrmConfig.parametros.valor');
  return (l: Lectura | null) => (l ? t(l.clave, l.params ?? {}) : null);
}

function ValoresDeLey({ datos, onAbrir, onIrAEmpresa }: { datos: DatosParametros; onAbrir: (id: string) => void; onIrAEmpresa: () => void }) {
  const t = useTranslations('hrmConfig.parametros');
  const f = useFormatoHrm(datos.moneda);
  const leer = useLectura();
  const [busca, setBusca] = useState('');
  const [fecha, setFecha] = useState(datos.hoy);
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');
  const filas = useMemo(() => [...CATALOGO_PARAMETROS, ...filasOtros(datos.ley)], [datos.ley]);
  const lector = useMemo(() => lectorEn(datos.ley, fecha), [datos.ley, fecha]);
  const sinValores = lector('smmlv') === null;
  const nombre = (id: string) => (t.has(`fila.${id}`) ? t(`fila.${id}`) : id);

  const visibles = filas
    .map((fila) => {
      const code = fila.codigos[0];
      const vigente = vigenteEn(datos.ley, code, fecha);
      const prox = proximoDesde(datos.ley, code, fecha);
      return { fila, vigente, prox, estado: estadoEn(datos.ley, code, fecha), lectura: fila.leer(lector, f) };
    })
    .filter((x) => x.vigente || x.prox)
    .filter((x) => {
      if (filtro === 'todos') return true;
      if (filtro === 'programado') return x.prox !== null && x.prox.status !== 'por_confirmar';
      return x.estado === filtro;
    })
    .filter((x) => coincideBusqueda(`${nombre(x.fila.id)} ${x.vigente?.legal_source ?? ''} ${x.fila.codigos.join(' ')}`, busca));

  const chips: ChipFiltro[] = [
    ...(fecha !== datos.hoy ? [{ clave: 'fecha', etiqueta: t('ley.chipFecha', { fecha: f.dia(fecha) }) }] : []),
    ...(filtro !== 'todos' ? [{ clave: 'estado', etiqueta: t('ley.chipEstado', { estado: t(`ley.filtro.${filtro}`) }) }] : []),
  ];
  const limpiar = () => {
    setFecha(datos.hoy);
    setFiltro('todos');
  };

  return (
    <div className="flex flex-col gap-5">
      <AvisoTonal tono="informacion" titulo={t('ley.avisoTitulo')} descripcion={t('ley.avisoDescripcion')} />
      <ListToolbar
        busqueda={<SearchInput value={busca} onChange={setBusca} onValueChange={setBusca} placeholder={t('ley.buscar')} etiqueta={t('ley.buscar')} atajo={false} />}
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={limpiar} textoVerResultados={t('ley.verN', { n: visibles.length })}>
            <FormField etiqueta={t('ley.valoresAl')}>
              {(c) => <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={fecha} onValorChange={(d) => setFecha(d || datos.hoy)} hoy={datos.hoy} limpiable={false} />}
            </FormField>
            <FormField etiqueta={t('ley.estadoFiltro')}>
              {(c) => (
                <SelectorHrm
                  id={c.id}
                  valor={filtro}
                  onValor={(v) => setFiltro(v as FiltroEstado)}
                  etiqueta={t('ley.estadoFiltro')}
                  opciones={FILTROS_ESTADO.map((e) => ({ valor: e, etiqueta: t(`ley.filtro.${e}`) }))}
                />
              )}
            </FormField>
          </FilterPanel>
        }
        chips={
          chips.length > 0 ? (
            <FilterChips chips={chips} onQuitar={(clave) => (clave === 'fecha' ? setFecha(datos.hoy) : setFiltro('todos'))} onLimpiarTodo={limpiar} />
          ) : undefined
        }
      />

      {sinValores ? (
        <EmptyState
          icono={CalendarClock}
          titulo={t('ley.sinValores.titulo', { anio: fecha.slice(0, 4) })}
          descripcion={t('ley.sinValores.descripcion', { fecha: f.dia(fecha), anio: fecha.slice(0, 4) })}
          accion={{ etiqueta: t('ley.sinValores.verHoy'), onClick: () => setFecha(datos.hoy) }}
        />
      ) : visibles.length === 0 ? (
        <EmptyState
          variante="search"
          icono={Scale}
          termino={busca || undefined}
          onLimpiarFiltros={() => {
            setBusca('');
            limpiar();
          }}
        />
      ) : (
        GRUPOS_PARAMETROS.map((g) => {
          const delGrupo = visibles.filter((x) => x.fila.grupo === g);
          if (delGrupo.length === 0) return null;
          return (
            <GrupoAjustes key={g} id={`hrm-ley-${g}`} titulo={t(`grupo.${g}.titulo`)} descripcion={t(`grupo.${g}.descripcion`)} sinFilas>
              <ListaDatos divisores className="border-t border-line">
                {delGrupo.map(({ fila, vigente, prox, estado, lectura }) => {
                  const proxLectura = prox && prox.status !== 'por_confirmar' ? fila.leer(lectorEn(datos.ley, prox.effective_from), f) : null;
                  const segunda = lectura?.detalle ? leer({ clave: lectura.detalle.clave, params: lectura.detalle.params }) : vigente ? t('ley.desde', { fecha: f.dia(vigente.effective_from) }) : null;
                  return (
                    <FilaDato
                      key={fila.id}
                      className="py-3"
                      etiqueta={<span className="font-medium text-fg">{nombre(fila.id)}</span>}
                      descripcion={vigente?.legal_source ?? prox?.legal_source}
                      valor={
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="text-fg">{leer(lectura) ?? t('ley.porConfirmar')}</span>
                          {segunda && <span className="text-xs text-fg-muted">{segunda}</span>}
                          {proxLectura && prox && (
                            <span className="rounded bg-brand-tint px-1.5 py-0.5 text-xs text-brand-deep">
                              {t('ley.programado', { fecha: f.dia(prox.effective_from), valor: leer(proxLectura) ?? '' })}
                            </span>
                          )}
                        </span>
                      }
                      accesorio={
                        <>
                          <EstadoParametro estado={estado} />
                          <button
                            type="button"
                            onClick={() => onAbrir(fila.id)}
                            aria-label={t('ley.verDetalle', { nombre: nombre(fila.id) })}
                            data-parametro={fila.id}
                            className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover"
                          >
                            <ChevronRight aria-hidden="true" className="size-4" />
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </ListaDatos>
            </GrupoAjustes>
          );
        })
      )}
      <p className="text-xs text-fg-muted">{t('ley.leyenda')}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PieHrm etiqueta={t('soloLectura')} texto={t('ley.revision', { fecha: f.dia(datos.hoy) })} />
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={onIrAEmpresa}>
          {t('irAEmpresa')}
        </button>
      </div>
    </div>
  );
}

// ─── Detalle de un parámetro ────────────────────────────────────────────────

function estadoHistorial(fila: FilaParametro, hoy: string): keyof typeof TONO_ESTADO {
  if (fila.value === null && fila.value_json == null) return 'por_confirmar';
  if (fila.status !== 'vigente') return fila.status;
  if (fila.effective_from > hoy) return 'programada';
  if (fila.effective_to !== null && fila.effective_to < hoy) return 'cerrada';
  return 'vigente';
}

function DetalleParametro({ datos, fila, onVolver, onIrAEmpresa }: { datos: DatosParametros; fila: FilaCatalogo; onVolver: () => void; onIrAEmpresa: () => void }) {
  const t = useTranslations('hrmConfig.parametros');
  const f = useFormatoHrm(datos.moneda);
  const leer = useLectura();
  const code = fila.codigos[0];
  const vigente = vigenteEn(datos.ley, code, datos.hoy) ?? proximoDesde(datos.ley, code, datos.hoy);
  const historial = historialDe(datos.ley, code);
  const cruce = periodoQueCruza(datos.ley, code, datos.hoy);
  const lecturaHoy = fila.leer(lectorEn(datos.ley, datos.hoy), f);
  const estado = estadoEn(datos.ley, code, datos.hoy);
  const nombre = t.has(`fila.${fila.id}`) ? t(`fila.${fila.id}`) : fila.id;
  const valorHora = (fecha: string) => {
    const v = lectorEn(datos.ley, fecha);
    const smmlv = v('smmlv')?.value;
    const divisor = v('divisor_hora_mensual')?.value;
    return smmlv && divisor ? f.dinero(Number(smmlv) / Number(divisor)) : null;
  };
  const empresa = code === 'jornada_max_semanal' || code === 'recargo_dominical_festivo' ? valorEmpresa(datos.empresa, code, datos.hoy) : null;

  return (
    <div className="flex flex-col gap-6">
      <VolverA texto={t('vistas.ley')} onClick={onVolver} />
      <div className="flex flex-col gap-1">
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-fg">
          {nombre}
          <EstadoParametro estado={estado} />
        </h3>
        {vigente && <p className="text-sm text-fg-secondary">{vigente.legal_source}</p>}
        {vigente?.source_url && (
          <a href={vigente.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start text-sm font-medium text-brand hover:underline">
            {t('detalle.verNorma')}
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </div>

      {vigente?.notes && estado !== 'vigente' && <AvisoTonal tono={estado === 'suspendido' ? 'peligro' : 'advertencia'} titulo={t(`estado.${estado}`)} descripcion={vigente.notes} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-fg-muted">{t('detalle.hoy')}</p>
          <p className="text-base font-medium text-fg">{leer(lecturaHoy) ?? t('ley.porConfirmar')}</p>
        </div>
        {fila.id === 'jornada' && (
          <>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs text-fg-muted">{t('detalle.divisor')}</p>
              <p className="text-base font-medium text-fg">{lectorEn(datos.ley, datos.hoy)('divisor_hora_mensual')?.value ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs text-fg-muted">{t('detalle.valorHora')}</p>
              <p className="text-base font-medium text-fg">{valorHora(datos.hoy) ?? '—'}</p>
            </div>
          </>
        )}
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="hrm-param-historial">
        <div>
          <h4 id="hrm-param-historial" className="text-base font-medium text-fg">
            {t('detalle.historial')}
          </h4>
          <p className="text-sm text-fg-muted">{t('detalle.historialAyuda')}</p>
        </div>
        <ListaDatos divisores className="border-t border-line">
          {historial.map((h) => {
            const l = h.value === null && h.value_json == null ? null : fila.leer(lectorEn(datos.ley, h.effective_from), f);
            const hasta = h.effective_to ? t('detalle.hasta', { fecha: f.dia(h.effective_to) }) : t('detalle.sinFin');
            return (
              <FilaDato
                key={`${h.code}-${h.effective_from}`}
                className="py-3"
                etiqueta={<span className="font-medium text-fg">{t('detalle.desdeEl', { fecha: f.dia(h.effective_from) })}</span>}
                descripcion={`${hasta} · ${h.legal_source}`}
                valor={<span className="text-fg">{leer(l) ?? t('ley.porConfirmar')}</span>}
                accesorio={<EstadoParametro estado={estadoHistorial(h, datos.hoy)} />}
              />
            );
          })}
        </ListaDatos>
        {fila.id === 'jornada' && <p className="text-xs text-fg-muted">{t('detalle.notaDivisor')}</p>}
      </section>

      {cruce && (
        <section className="flex flex-col gap-2" aria-labelledby="hrm-param-cruce">
          <div>
            <h4 id="hrm-param-cruce" className="text-base font-medium text-fg">
              {t('detalle.cruce')}
            </h4>
            <p className="text-sm text-fg-muted">{t('detalle.cruceAyuda', { mes: f.dia(cruce[0].desde) })}</p>
          </div>
          <div className="grid overflow-hidden rounded-xl border border-line sm:grid-cols-2">
            {cruce.map((tr, i) => {
              const l = fila.leer(lectorEn(datos.ley, tr.desde), f);
              const hora = fila.id === 'jornada' ? valorHora(tr.desde) : null;
              return (
                <div key={tr.desde} className={i === cruce.length - 1 ? 'bg-brand-tint p-4' : 'bg-subtle p-4'}>
                  <p className="text-[13px] font-medium text-fg">{t('detalle.tramo', { desde: f.diaCorto(tr.desde), hasta: f.diaCorto(tr.hasta), dias: tr.dias })}</p>
                  <p className="text-sm text-fg-secondary">{leer(l) ?? t('ley.porConfirmar')}</p>
                  {hora && <p className="text-sm text-fg-secondary">{t('detalle.valorHoraEs', { valor: hora })}</p>}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-fg-muted">{t('detalle.cruceNota')}</p>
        </section>
      )}

      {code === 'smmlv' && (
        <section className="flex flex-col gap-1">
          <h4 className="text-base font-medium text-fg">{t('detalle.dependen')}</h4>
          <p className="text-sm text-fg-muted">{t('detalle.dependenSmmlv')}</p>
        </section>
      )}

      {(code === 'jornada_max_semanal' || code === 'recargo_dominical_festivo') && (
        <section className="flex flex-col gap-2">
          <h4 className="text-base font-medium text-fg">{t('detalle.enTuEmpresa')}</h4>
          <SettingRow
            className="border-t border-line px-0"
            titulo={empresa ? t('detalle.empresaPropia', { fecha: f.dia(empresa.effective_from) }) : t('detalle.empresaLaDeLey')}
            descripcion={t('detalle.empresaAyuda')}
          >
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={onIrAEmpresa}>
              {t('irAEmpresa')}
            </button>
          </SettingRow>
        </section>
      )}

      <PieHrm etiqueta={t('soloLectura')} texto={t('detalle.pie', { fecha: f.dia(datos.hoy) })} />
    </div>
  );
}

// ─── Lo que define tu empresa ───────────────────────────────────────────────

interface PropsEmpresa {
  datos: DatosParametros;
  borrador: Borrador;
  setBorrador: (fn: (b: Borrador) => Borrador) => void;
  metaJornada: { valor: number; desde: string } | null;
  metaDominical: { valor: number; desde: string } | null;
  recargar: () => Promise<void>;
}

function LoQueDefineEmpresa({ datos, borrador, setBorrador, metaJornada, metaDominical, recargar }: PropsEmpresa) {
  const t = useTranslations('hrmConfig.parametros.empresa');
  const f = useFormatoHrm(datos.moneda);
  const editable = datos.puedeEditar;
  const lectorHoy = lectorEn(datos.ley, datos.hoy);
  const jornadaHoy = lectorHoy('jornada_max_semanal')?.value;
  const ultimaJornada = historialDe(datos.ley, 'jornada_max_semanal')[0];
  const dominicalHoy = lectorHoy('recargo_dominical_festivo')?.value;
  const umbral = lectorHoy('exoneracion_114_1_umbral_smmlv')?.value;
  const smmlv = lectorHoy('smmlv')?.value;

  return (
    <div className="flex flex-col gap-8">
      <GrupoAjustes id="hrm-empresa-jornada" titulo={t('jornada.titulo')} descripcion={t('jornada.descripcion')}>
        <SettingRow
          className="px-0"
          htmlFor="hrm-empresa-jornada-switch"
          titulo={t('jornada.adelantar')}
          descripcion={
            metaJornada
              ? t('jornada.adelantarAyuda', { h: f.numero(metaJornada.valor), fecha: f.dia(metaJornada.desde) })
              : t('jornada.noAplica', { h: f.numero(Number(ultimaJornada?.value ?? jornadaHoy ?? 0)), fecha: f.dia(ultimaJornada?.effective_from ?? datos.hoy) })
          }
        >
          {metaJornada && borrador.jornada.activo && (
            <CampoFecha
              valor={borrador.jornada.desde}
              onValorChange={(d) => setBorrador((b) => ({ ...b, jornada: { ...b.jornada, desde: d || datos.hoy } }))}
              hoy={datos.hoy}
              max={metaJornada.desde}
              limpiable={false}
              aria-label={t('desde')}
              disabled={!editable}
              tamano="sm"
            />
          )}
          <Switch
            id="hrm-empresa-jornada-switch"
            checked={borrador.jornada.activo}
            disabled={!editable || !metaJornada}
            onCheckedChange={(v) => setBorrador((b) => ({ ...b, jornada: { ...b.jornada, activo: v } }))}
          />
        </SettingRow>
        <SettingRow
          className="px-0"
          htmlFor="hrm-empresa-dominical-switch"
          titulo={metaDominical ? t('dominical.titulo', { pct: f.pct(metaDominical.valor) }) : t('dominical.tituloSinMeta')}
          descripcion={
            metaDominical
              ? t('dominical.ayuda', { fecha: f.dia(metaDominical.desde), hoy: f.pct(Number(dominicalHoy ?? 0)) })
              : t('dominical.yaRige')
          }
        >
          {metaDominical && borrador.dominical.activo && (
            <CampoFecha
              valor={borrador.dominical.desde}
              onValorChange={(d) => setBorrador((b) => ({ ...b, dominical: { ...b.dominical, desde: d || datos.hoy } }))}
              hoy={datos.hoy}
              max={metaDominical.desde}
              limpiable={false}
              aria-label={t('desde')}
              disabled={!editable}
              tamano="sm"
            />
          )}
          <Switch
            id="hrm-empresa-dominical-switch"
            checked={borrador.dominical.activo}
            disabled={!editable || !metaDominical}
            onCheckedChange={(v) => setBorrador((b) => ({ ...b, dominical: { ...b.dominical, activo: v } }))}
          />
        </SettingRow>
      </GrupoAjustes>

      <GrupoAjustes id="hrm-empresa-aportes" titulo={t('aportes.titulo')} descripcion={t('aportes.descripcion')}>
        <SettingRow
          className="px-0"
          htmlFor="hrm-empresa-exoneracion"
          titulo={t('aportes.exoneracion')}
          descripcion={t('aportes.exoneracionAyuda', {
            n: f.numero(Number(umbral ?? 10)),
            valor: smmlv && umbral ? f.dinero(Number(smmlv) * Number(umbral)) : '—',
          })}
        >
          <Switch id="hrm-empresa-exoneracion" checked={borrador.exoneracion} disabled={!editable} onCheckedChange={(v) => setBorrador((b) => ({ ...b, exoneracion: v }))} />
        </SettingRow>
        <ReglasArl datos={datos} editable={editable} recargar={recargar} />
        <SettingRow className="px-0" titulo={t('aportes.pila')} descripcion={t('aportes.pilaAyuda')}>
          <SelectorHrm
            valor={borrador.pila}
            onValor={(v) => setBorrador((b) => ({ ...b, pila: v }))}
            etiqueta={t('aportes.pila')}
            marcador={t('elegir')}
            opciones={OPERADORES_PILA.map((o) => ({ valor: o, etiqueta: t(`aportes.operador.${o}`) }))}
            deshabilitado={!editable}
            className="w-56"
          />
        </SettingRow>
      </GrupoAjustes>

      <GrupoAjustes id="hrm-empresa-pago" titulo={t('pago.titulo')}>
        <SettingRow className="px-0" titulo={t('pago.periodicidad')} descripcion={t('pago.periodicidadAyuda')}>
          <SelectorHrm
            valor={borrador.periodicidad}
            onValor={(v) => setBorrador((b) => ({ ...b, periodicidad: v }))}
            etiqueta={t('pago.periodicidad')}
            marcador={t('elegir')}
            opciones={PERIODICIDADES.map((p) => ({ valor: p, etiqueta: t(`pago.periodo.${p}`) }))}
            deshabilitado={!editable}
            className="w-56"
          />
        </SettingRow>
        <SettingRow className="px-0" titulo={t('pago.retencion')} descripcion={t('pago.retencionAyuda')}>
          <SelectorHrm
            valor={borrador.retencion}
            onValor={(v) => setBorrador((b) => ({ ...b, retencion: v }))}
            etiqueta={t('pago.retencion')}
            marcador={t('elegir')}
            opciones={['1', '2'].map((p) => ({ valor: p, etiqueta: t(`pago.procedimiento${p}`) }))}
            deshabilitado={!editable}
            className="w-56"
          />
        </SettingRow>
      </GrupoAjustes>
      {!editable && <PieHrm etiqueta={t('soloLectura')} texto={t('soloLecturaAyuda')} />}
    </div>
  );
}

function ReglasArl({ datos, editable, recargar }: { datos: DatosParametros; editable: boolean; recargar: () => Promise<void> }) {
  const t = useTranslations('hrmConfig.parametros.empresa.arl');
  const f = useFormatoHrm(datos.moneda);
  const { toast } = useToast();
  const [editando, setEditando] = useState<(Partial<ReglaArl> & { abierta: true }) | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [quitando, setQuitando] = useState<ReglaArl | null>(null);
  const tarifas = (lectorEn(datos.ley, datos.hoy)('arl_tarifas')?.value_json ?? {}) as Record<string, { inicial?: number }>;
  const nombreSede = (id: number | null) => (id === null ? t('todasSedes') : datos.sedes.find((s) => s.id === String(id))?.nombre ?? '—');
  const nombreCargo = (id: string | null) => (id === null ? t('todosCargos') : datos.cargos.find((c) => c.id === id)?.nombre ?? '—');
  const tarifa = (clase: number) => {
    const x = tarifas[ROMANO[clase]]?.inicial;
    return typeof x === 'number' ? f.pct(x) : '—';
  };
  const reglas = [...datos.arl].sort((a, b) => Number(a.sedeId !== null) - Number(b.sedeId !== null) || Number(a.cargoId !== null) - Number(b.cargoId !== null));

  const guardar = async () => {
    if (!editando?.clase) return;
    setOcupado(true);
    try {
      await pedirHrm('/api/hrm/configuracion/arl', { metodo: 'POST', cuerpo: { id: editando.id ?? null, sedeId: editando.sedeId ?? null, cargoId: editando.cargoId ?? null, clase: editando.clase } });
      setEditando(null);
      toast({ title: t('guardada') });
      await recargar();
    } catch {
      toast({ title: t('errorGuardar'), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };
  const quitar = async (id: string) => {
    setOcupado(true);
    try {
      await pedirHrm(`/api/hrm/configuracion/arl?id=${encodeURIComponent(id)}`, { metodo: 'DELETE' });
      setEditando(null);
      toast({ title: t('quitada') });
      await recargar();
    } catch {
      toast({ title: t('errorGuardar'), variant: 'destructive' });
    } finally {
      setOcupado(false);
      setQuitando(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-sm font-medium text-fg">{t('titulo')}</p>
          <p className="text-[13px] text-fg-secondary">{t('ayuda')}</p>
        </div>
        {editable && (
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setEditando({ abierta: true, sedeId: null, cargoId: null, clase: 1 })}>
            <Plus aria-hidden="true" className="size-4" />
            {t('agregar')}
          </button>
        )}
      </div>
      {reglas.length === 0 ? (
        <p className="rounded-xl border border-line bg-subtle p-4 text-sm text-fg-muted">{t('vacio', { tarifa: tarifa(1) })}</p>
      ) : (
        <ListaDatos divisores className="rounded-xl border border-line px-4">
          {reglas.map((r) => (
            <FilaDato
              key={r.id}
              className="py-2.5"
              etiqueta={<span className="text-fg">{`${nombreSede(r.sedeId)} · ${nombreCargo(r.cargoId)}`}</span>}
              descripcion={r.sedeId === null && r.cargoId === null ? t('porDefecto') : undefined}
              valor={<span className="text-fg">{`${t('claseN', { n: ROMANO[r.clase] })} · ${tarifa(r.clase)}`}</span>}
              accesorio={
                editable ? (
                  <RowActionsMenu
                    titulo={`${nombreSede(r.sedeId)} · ${nombreCargo(r.cargoId)}`}
                    acciones={[
                      { id: 'editar', etiqueta: t('editar'), icono: Pencil, onSelect: () => setEditando({ ...r, abierta: true }) },
                      { id: 'quitar', etiqueta: t('quitar'), icono: Trash2, destructiva: true, onSelect: () => setQuitando(r) },
                    ]}
                  />
                ) : undefined
              }
            />
          ))}
        </ListaDatos>
      )}
      <Dialogo
        abierto={editando !== null}
        onAbiertoChange={(a) => !a && setEditando(null)}
        titulo={editando?.id ? t('editarTitulo') : t('agregarTitulo')}
        descripcion={t('ayuda')}
        ancho={440}
        primario={{ etiqueta: t('guardar'), onClick: () => void guardar(), cargando: ocupado }}

      >
        {editando && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t('sede')}
              <SelectorHrm
                valor={editando.sedeId == null ? 'todas' : String(editando.sedeId)}
                onValor={(v) => setEditando((e) => e && { ...e, sedeId: v === 'todas' ? null : Number(v) })}
                etiqueta={t('sede')}
                opciones={[{ valor: 'todas', etiqueta: t('todasSedes') }, ...datos.sedes.map((s) => ({ valor: s.id, etiqueta: s.nombre }))]}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t('cargo')}
              <SelectorHrm
                valor={editando.cargoId ?? 'todos'}
                onValor={(v) => setEditando((e) => e && { ...e, cargoId: v === 'todos' ? null : v })}
                etiqueta={t('cargo')}
                opciones={[{ valor: 'todos', etiqueta: t('todosCargos') }, ...datos.cargos.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t('clase')}
              <SelectorHrm
                valor={String(editando.clase ?? 1)}
                onValor={(v) => setEditando((e) => e && { ...e, clase: Number(v) })}
                etiqueta={t('clase')}
                opciones={CLASES_ARL.map((c) => ({ valor: String(c), etiqueta: `${t('claseN', { n: ROMANO[c] })} · ${tarifa(c)}` }))}
              />
            </label>
          </div>
        )}
      </Dialogo>
      <ConfirmDialog
        abierto={quitando !== null}
        onAbiertoChange={(a) => !a && setQuitando(null)}
        titulo={t('confirmarQuitar.titulo')}
        descripcion={t('confirmarQuitar.descripcion', { regla: quitando ? `${nombreSede(quitando.sedeId)} · ${nombreCargo(quitando.cargoId)}` : '' })}
        textoConfirmar={t('quitar')}
        tono="peligro"
        cargando={ocupado}
        onConfirmar={() => (quitando ? quitar(quitando.id) : undefined)}
      />
    </div>
  );
}
