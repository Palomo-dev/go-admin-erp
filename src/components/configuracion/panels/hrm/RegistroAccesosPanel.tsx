'use client';

/**
 * Configuración › Recursos humanos › Registro de accesos (diseño 10.RH.3,
 * Figma `2506:23427`; pantallazos 95-hrm-config-25…30).
 *
 * Queda registrado cada vez que alguien ve o cambia un dato sensible de un
 * empleado, y cada intento sin permiso. Nadie edita ni borra estos registros.
 *
 * Decisiones del dueño (2026-11-15): es una pestaña propia de RR. HH. (no la
 * Auditoría general); en el detalle, los valores anterior y nuevo quedan
 * ocultos hasta «Mostrar valores» y ese clic también se registra; la IP sale
 * parcialmente oculta (la oculta la base, `fn_hr_ip_parcial`).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Eye, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  DateRangeButton,
  EmptyState,
  FilaDato,
  FilterChips,
  FilterPanel,
  FormField,
  ListToolbar,
  ListaDatos,
  PaginationCompact,
  SearchInput,
  Tarjeta,
  clasesBoton,
  inicioDeMes,
  type ChipFiltro,
  type RangoFechas,
  type TonoBadge,
} from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import type { AccionRegistro, DetalleRegistro, FilaRegistro, ListaRegistro, ValoresRegistro } from '@/lib/hrm/configuracion/tipos';
import { agenteCorto } from '@/lib/hrm/configuracion/registroVista';
import { CargandoHrm, ErrorCargaHrm, ErrorHrm, PieHrm, SelectorHrm, SinPermisoHrm, VolverA, pedirHrm, useCargaHrm } from './comun';

const POR_PAGINA = 8;
const ACCIONES: readonly AccionRegistro[] = ['ver', 'editar', 'exportar', 'sin_permiso'];
const GRUPOS = ['identificacion', 'salario_pago', 'banco', 'salud', 'disciplinario', 'sst', 'basico'] as const;
const TONO_ACCION: Record<AccionRegistro, TonoBadge> = { ver: 'informacion', editar: 'advertencia', exportar: 'marca', sin_permiso: 'peligro' };

export function AccionBadge({ accion }: { accion: AccionRegistro }) {
  const t = useTranslations('hrmConfig.registro.accion');
  return (
    <Badge tono={TONO_ACCION[accion]} apariencia="contorno" tamano="sm" className="shrink-0">
      {t(accion)}
    </Badge>
  );
}

function useNombreGrupo() {
  const t = useTranslations('hrmConfig.registro.grupo');
  return (g: string) => (t.has(g) ? t(g) : g);
}

export function RegistroAccesosPanel() {
  const t = useTranslations('hrmConfig.registro');
  const { getToday, toInstant, timezone } = useFormatDate();
  const hoy = getToday();
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState<string | null>(null);
  const [accion, setAccion] = useState<AccionRegistro | null>(null);
  const [persona, setPersona] = useState<{ id: string; nombre: string } | null>(null);
  const [rango, setRango] = useState<RangoFechas>({ desde: inicioDeMes(hoy), hasta: hoy });
  const [pagina, setPagina] = useState(1);
  const [detalle, setDetalle] = useState<number | null>(null);
  const nombreGrupo = useNombreGrupo();

  const q = new URLSearchParams({
    desde: toInstant(rango.desde),
    hasta: toInstant(addPlainDays(rango.hasta, 1)),
    pagina: String(pagina),
  });
  if (busca.trim()) q.set('busca', busca.trim());
  if (grupo) q.set('grupo', grupo);
  if (accion) q.set('accion', accion);
  if (persona) q.set('persona', persona.id);
  const { carga, recargar } = useCargaHrm<ListaRegistro>(`/api/hrm/configuracion/accesos?${q.toString()}`);

  const cambiar = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPagina(1);
  };

  if (detalle !== null) {
    return (
      <DetalleAcceso
        id={detalle}
        onVolver={() => setDetalle(null)}
        onAbrir={setDetalle}
        onFiltrarPersona={(p) => {
          setPersona(p);
          setPagina(1);
          setDetalle(null);
        }}
      />
    );
  }
  if (carga.estado === 'sinPermiso') return <SinPermisoHrm permiso={t('permiso')} />;
  if (carga.estado === 'error') return <ErrorCargaHrm titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />;

  const chips: ChipFiltro[] = [
    ...(persona ? [{ clave: 'persona', etiqueta: t('chip.empleado', { nombre: persona.nombre }) }] : []),
    ...(grupo ? [{ clave: 'grupo', etiqueta: t('chip.grupo', { grupo: nombreGrupo(grupo) }) }] : []),
    ...(accion ? [{ clave: 'accion', etiqueta: t('chip.accion', { accion: t(`accion.${accion}`) }) }] : []),
  ];
  const limpiar = () => {
    setPersona(null);
    setGrupo(null);
    setAccion(null);
    setPagina(1);
  };
  const lista = carga.estado === 'listo' ? carga.datos : null;
  const filas = lista?.filas ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t('ayuda')}</p>
      <ListToolbar
        busqueda={<SearchInput value={busca} onChange={cambiar(setBusca)} placeholder={t('buscar')} etiqueta={t('buscar')} atajo={false} cargando={carga.estado === 'cargando'} />}
        filtros={
          <div className="flex items-center gap-2">
            <DateRangeButton valor={rango} onValorChange={cambiar(setRango)} hoy={hoy} max={hoy} etiqueta={t('fechas')} />
            <FilterPanel conteo={chips.length} onLimpiar={limpiar} textoVerResultados={t('verN', { n: lista?.total ?? 0 })}>
              <FormField etiqueta={t('filtro.grupo')}>
                {(c) => (
                  <SelectorHrm
                    id={c.id}
                    valor={grupo ?? 'todos'}
                    onValor={(v) => cambiar(setGrupo)(v === 'todos' ? null : v)}
                    etiqueta={t('filtro.grupo')}
                    opciones={[{ valor: 'todos', etiqueta: t('filtro.todos') }, ...GRUPOS.map((g) => ({ valor: g, etiqueta: nombreGrupo(g) }))]}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('filtro.accion')}>
                {(c) => (
                  <SelectorHrm
                    id={c.id}
                    valor={accion ?? 'todas'}
                    onValor={(v) => cambiar(setAccion)(v === 'todas' ? null : (v as AccionRegistro))}
                    etiqueta={t('filtro.accion')}
                    opciones={[{ valor: 'todas', etiqueta: t('filtro.todas') }, ...ACCIONES.map((a) => ({ valor: a, etiqueta: t(`accion.${a}`) }))]}
                  />
                )}
              </FormField>
            </FilterPanel>
          </div>
        }
        chips={
          chips.length > 0 ? (
            <FilterChips
              chips={chips}
              onQuitar={(clave) => {
                if (clave === 'persona') setPersona(null);
                if (clave === 'grupo') setGrupo(null);
                if (clave === 'accion') setAccion(null);
                setPagina(1);
              }}
              onLimpiarTodo={limpiar}
            />
          ) : undefined
        }
      />
      {lista?.conteos && (
        <div className="flex flex-wrap gap-2" aria-label={t('resumen')}>
          <Badge tono="neutro" apariencia="contorno" tamano="sm">
            {t('conteo.total', { n: lista.total ?? 0 })}
          </Badge>
          {ACCIONES.filter((a) => (lista.conteos?.[a] ?? 0) > 0).map((a) => (
            <Badge key={a} tono={TONO_ACCION[a]} apariencia="contorno" tamano="sm">
              {t(`conteo.${a}`, { n: lista.conteos?.[a] ?? 0 })}
            </Badge>
          ))}
        </div>
      )}

      {carga.estado === 'cargando' && !lista ? (
        <CargandoHrm filas={POR_PAGINA} />
      ) : filas.length === 0 ? (
        chips.length > 0 || busca ? (
          <EmptyState variante="search" icono={ShieldCheck} termino={busca || undefined} onLimpiarFiltros={() => { setBusca(''); limpiar(); }} />
        ) : (
          <EmptyState icono={ShieldCheck} titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} />
        )
      ) : (
        <ListaDatos divisores className="border-t border-line">
          {filas.map((r) => (
            <FilaAccesoKit key={r.id} r={r} onAbrir={() => setDetalle(r.id)} />
          ))}
        </ListaDatos>
      )}
      {(lista?.total ?? 0) > POR_PAGINA && <PaginationCompact pagina={pagina} tamano={POR_PAGINA} total={lista?.total ?? 0} onPaginaChange={setPagina} cargando={carga.estado === 'cargando'} />}
      <PieHrm etiqueta={t('soloLectura')} texto={t('zona', { zona: timezone })} />
    </div>
  );
}

/** Una fila del registro con `FilaDato` del kit (lista y «Otros registros»). */
function FilaAccesoKit({ r, onAbrir }: { r: FilaRegistro; onAbrir: () => void }) {
  const t = useTranslations('hrmConfig.registro');
  const { formatDateTime } = useFormatDate();
  const nombreGrupo = useNombreGrupo();
  const donde = [agenteCorto(r.agente) ?? t('origenDesconocido'), r.ip ? `IP ${r.ip}` : null].filter(Boolean).join(' · ');
  const quien = r.actor.nombre ?? t('alguien');
  const empleado = r.empleado ? [r.empleado.nombre, r.empleado.cargo, r.empleado.sede].filter(Boolean).join(' · ') : t('sinEmpleado');
  return (
    <FilaDato
      className="py-3"
      etiqueta={<span className="font-medium text-fg">{quien}</span>}
      descripcion={`${formatDateTime(r.cuando)} · ${donde}`}
      valor={
        <span className="flex flex-col items-end">
          <span className="text-fg">{nombreGrupo(r.grupo)}</span>
          <span className="text-xs text-fg-muted">{empleado}</span>
        </span>
      }
      accesorio={
        <>
          <AccionBadge accion={r.accion} />
          <button type="button" onClick={onAbrir} aria-label={t('verDetalle', { quien })} className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover">
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </>
      }
    />
  );
}

function DetalleAcceso({
  id,
  onVolver,
  onAbrir,
  onFiltrarPersona,
}: {
  id: number;
  onVolver: () => void;
  onAbrir: (id: number) => void;
  onFiltrarPersona: (p: { id: string; nombre: string }) => void;
}) {
  const t = useTranslations('hrmConfig.registro');
  const td = useTranslations('hrmConfig.registro.detalle');
  const { toast } = useToast();
  const { formatDateTime, formatPlain } = useFormatDate();
  const nombreGrupo = useNombreGrupo();
  const { carga, recargar } = useCargaHrm<DetalleRegistro>(`/api/hrm/configuracion/accesos/${id}`);
  const [valores, setValores] = useState<ValoresRegistro | null>(null);
  const [mostrando, setMostrando] = useState(false);

  if (carga.estado === 'cargando') return <CargandoHrm filas={6} />;
  if (carga.estado === 'sinPermiso') return <SinPermisoHrm permiso={t('permiso')} />;
  if (carga.estado === 'error') return <ErrorCargaHrm titulo={td('error.titulo')} descripcion={td('error.descripcion')} onReintentar={() => void recargar()} />;
  const r = carga.datos;
  const quien = r.actor.nombre ?? t('alguien');
  const empleado = r.empleado?.nombre ?? t('sinEmpleado');

  const mostrar = async () => {
    setMostrando(true);
    try {
      setValores(await pedirHrm<ValoresRegistro>(`/api/hrm/configuracion/accesos/${id}/valores`, { metodo: 'POST', cuerpo: {} }));
    } catch (e) {
      toast({ title: e instanceof ErrorHrm && e.status === 403 ? td('valoresSinPermiso') : td('valoresError'), variant: 'destructive' });
    } finally {
      setMostrando(false);
    }
  };
  const texto = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

  return (
    <div className="flex flex-col gap-5">
      <VolverA texto={t('titulo')} onClick={onVolver} />
      <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-fg">
        {td(`titulo.${r.accion}`, { quien, empleado, grupo: nombreGrupo(r.grupo).toLocaleLowerCase() })}
        <AccionBadge accion={r.accion} />
      </h3>

      <Tarjeta titulo={td('quienCuando')}>
        <ListaDatos divisores>
          <FilaDato etiqueta={td('persona')} valor={[quien, r.actor.cargo].filter(Boolean).join(' · ')} />
          <FilaDato etiqueta={td('cuando')} valor={formatDateTime(r.cuando)} />
          <FilaDato etiqueta={td('desdeDonde')} valor={[agenteCorto(r.agente) ?? t('origenDesconocido'), r.ip ? `IP ${r.ip}` : null].filter(Boolean).join(' · ')} />
          {r.ruta && <FilaDato etiqueta={td('ruta')} valor={<code className="font-mono text-xs">{r.ruta}</code>} />}
        </ListaDatos>
      </Tarjeta>

      <Tarjeta titulo={r.accion === 'editar' ? td('queCambio') : td('queVio')}>
        <ListaDatos divisores>
          <FilaDato etiqueta={td('grupo')} valor={nombreGrupo(r.grupo)} />
          {r.empleado && (
            <FilaDato
              etiqueta={td('empleado')}
              valor={[r.empleado.nombre, r.empleado.cargo, r.empleado.sede].filter(Boolean).join(' · ')}
              accesorio={
                <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => onFiltrarPersona({ id: r.empleado!.id, nombre: empleado })}>
                  {td('verSusRegistros')}
                </button>
              }
            />
          )}
          {r.campos && r.campos.length > 0 && <FilaDato etiqueta={td('campos')} valor={r.campos.join(', ')} />}
          {r.evento_detalle && (
            <>
              <FilaDato etiqueta={td('campo')} valor={r.evento_detalle.campo} />
              <FilaDato etiqueta={td('antes')} valor={valores ? texto(valores.anterior) : '••••••••'} />
              <FilaDato
                etiqueta={td('despues')}
                valor={valores ? texto(valores.nuevo) : '••••••••'}
                accesorio={
                  !valores && r.evento_detalle.tiene_valores ? (
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={mostrando} onClick={() => void mostrar()}>
                      <Eye aria-hidden="true" className="size-4" />
                      {td('mostrarValores')}
                    </button>
                  ) : undefined
                }
              />
              <FilaDato etiqueta={td('fechaEfecto')} valor={formatPlain(r.evento_detalle.desde)} />
              <FilaDato etiqueta={td('motivo')} valor={r.evento_detalle.motivo} />
            </>
          )}
          {r.aprobacion && (
            <FilaDato
              etiqueta={td('aprobacion')}
              valor={td('aprobacionTexto', {
                estado: t.has(`estadoAprobacion.${r.aprobacion.estado}`) ? t(`estadoAprobacion.${r.aprobacion.estado}`) : r.aprobacion.estado,
                personas: r.aprobacion.aprobadores.join(', ') || '—',
              })}
            />
          )}
          {r.documento && <FilaDato etiqueta={td('documento')} valor={r.documento} />}
        </ListaDatos>
      </Tarjeta>
      <p className="text-xs text-fg-muted">{td('nota')}</p>

      {r.otros.length > 0 && (
        <section aria-labelledby="hrm-acceso-otros" className="flex flex-col gap-2">
          <h4 id="hrm-acceso-otros" className="text-base font-medium text-fg">
            {td('otros', { empleado })}
          </h4>
          <ListaDatos divisores className="border-t border-line">
            {r.otros.map((o) => (
              <FilaAccesoKit key={o.id} r={o} onAbrir={() => onAbrir(o.id)} />
            ))}
          </ListaDatos>
        </section>
      )}
      <PieHrm etiqueta={t('soloLectura')} />
    </div>
  );
}
