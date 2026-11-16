'use client';

/**
 * Recursos humanos › Mi equipo (Figma 20.15): la vista del jefe.
 *
 * - Resumen: por aprobar, faltas y llegadas tarde de hoy, ausentes de la
 *   semana, los pendientes de su equipo y la semana de turnos (solo publicado).
 * - Calendario: vacaciones y ausencias del mes con los cruces por área.
 * - Una persona: estado de hoy, turno, vacaciones disponibles y horas del
 *   periodo. Nunca salario, banco ni salud: una incapacidad es «Ausencia
 *   justificada» (decisión 2). Lo garantiza la base (`fn_hr_mi_equipo`,
 *   `fn_hr_equipo_persona`, `fn_hr_turnos_semana`); la pantalla solo lo pinta.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, ArrowDown, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Eye, LayoutDashboard, Lock, Stamp } from 'lucide-react';
import {
  AvatarIniciales,
  AvisoTonal,
  DataTable,
  Dialogo,
  EmptyState,
  FilaDato,
  KpiStrip,
  ListCard,
  PageHeader,
  SegmentedControl,
  StatCard,
  Tarjeta,
  clasesBoton,
  grillaMes,
  useOpcionUrl,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { toPlainDate } from '@/lib/utils/dateCore';
import { celdasDe, diasDeSemana, indexarSemana, lunesDe, partesHoras, type RespuestaSemana } from '@/lib/hrm/turnos/programacion';
import {
  conteoEquipo,
  crucesPorDia,
  diasEntre,
  esAusenciaDeSalud,
  nombreCorto,
  tramosDeCruce,
  type PendienteEquipo,
  type PersonaDetalle,
  type PersonaEquipo,
  type RespuestaEquipo,
} from '@/lib/hrm/equipo/equipo';
import { NavPestanasHrm } from '@/components/hrm/navegacion/NavPestanasHrm';
import { RUTA_HRM } from '@/components/hrm/estructura/comun';
import { BloqueTurno } from '@/components/hrm/turnos/BloqueTurno';
import { RUTA_TURNOS, useCarga } from '@/components/hrm/turnos/apiTurnos';
import { useFormatoHora } from '@/components/hrm/turnos/formatoHora';

const VISTAS = ['resumen', 'calendario'] as const;

export function MiEquipoPage() {
  const t = useTranslations('hrmEquipo');
  const [vista, setVista] = useOpcionUrl('vista', VISTAS, 'resumen');
  const { carga, recargar } = useCarga<RespuestaEquipo>('/api/hrm/equipo');
  const pest = useCarga<{ vista: 'rrhh' | 'jefe' | 'ninguna' }>('/api/hrm/pestanas');
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const [persona, setPersona] = useState<string | null>(null);
  const conteo = conteoEquipo(datos?.personas ?? []);
  const sinEquipo = !!datos && datos.personas.length === 0;
  const esRrhh = pest.carga.estado === 'listo' && pest.carga.datos.vista === 'rrhh';
  const sinPermiso = carga.estado === 'sinPermiso' || (sinEquipo && esRrhh);

  const lugar = [datos?.jefe?.area, datos?.jefe?.sede].filter(Boolean).join(' · ');
  const subtitulo = !datos
    ? undefined
    : sinEquipo || sinPermiso
      ? lugar || undefined
      : vista === 'calendario'
        ? undefined
        : [
            datos.jefe?.nombre,
            conteo.indirectas ? t('subtitulo.conIndirectas', { n: conteo.total, directas: conteo.directas, indirectas: conteo.indirectas }) : t('subtitulo.personas', { n: conteo.total }),
            lugar,
          ]
            .filter(Boolean)
            .join(' · ');

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={vista === 'calendario' && !sinEquipo && !sinPermiso ? t('calendario.titulo') : t('titulo')}
        subtitulo={subtitulo}
        icono={LayoutDashboard}
        migas={[{ etiqueta: t('rrhh'), href: RUTA_HRM }, { etiqueta: t('titulo') }]}
        debajo={sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        cargando={carga.estado === 'cargando'}
        acciones={
          sinPermiso ? undefined : (
            <Link href={RUTA_TURNOS} className={clasesBoton({ variante: 'secundario' })}>
              <CalendarDays aria-hidden className="size-4" strokeWidth={1.5} />
              {t('programar')}
            </Link>
          )
        }
      />

      {sinPermiso ? (
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('irInicio'), href: '/app/inicio' }} />
      ) : carga.estado === 'error' || carga.estado === 'noExiste' ? (
        <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />
      ) : sinEquipo ? (
        <EmptyState
          variante="empty"
          icono={LayoutDashboard}
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          accion={{ etiqueta: t('irInicio'), href: '/app/inicio' }}
        />
      ) : (
        <>
          <SegmentedControl
            etiqueta={t('vistas.etiqueta')}
            valor={vista}
            onValorChange={setVista}
            opciones={[
              { valor: 'resumen', etiqueta: t('vistas.resumen') },
              { valor: 'calendario', etiqueta: t('vistas.calendario') },
            ]}
          />
          {vista === 'resumen' ? (
            <Resumen datos={datos} cargando={carga.estado === 'cargando'} onPersona={setPersona} />
          ) : (
            <CalendarioEquipo personas={datos?.personas ?? []} hoy={datos?.hoy ?? null} onPersona={setPersona} />
          )}
          <AvisoTonal tono="informacion" icono={Lock} titulo={t('privacidad.titulo')} descripcion={t('privacidad.descripcion')} />
        </>
      )}

      <DialogoPersona id={persona} onCerrar={() => setPersona(null)} />
    </div>
  );
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

function useTextoPendiente(zona: string) {
  const t = useTranslations('hrmEquipo.pendientes');
  const f = useFormatoHora();
  const duracion = (m: number | null | undefined) => {
    const { h, m: mi } = partesHoras(m ?? 0);
    return h && mi ? t('hMin', { h, m: mi }) : h ? t('h', { h }) : t('min', { m: mi });
  };
  return (p: PendienteEquipo): { titulo: string; detalle: string } => {
    const dia = p.fecha ? f.diaCorto(p.fecha) : '';
    if (p.tipo === 'ausencia') {
      const titulo = esAusenciaDeSalud(p) ? t('ausenciaJustificada') : p.clase === 'vacaciones' ? t('vacaciones') : (p.etiqueta ?? t('ausencia'));
      const rango = p.fecha && p.hasta ? `${f.fecha(p.fecha)} – ${f.fecha(p.hasta)}` : '';
      return { titulo, detalle: [rango, p.dias_habiles ? t('diasHabiles', { n: p.dias_habiles }) : null].filter(Boolean).join(' · ') };
    }
    if (p.tipo === 'horas_extra') return { titulo: t('horasExtra'), detalle: [dia, duracion(p.minutos)].filter(Boolean).join(' · ') };
    if (p.tipo === 'cambio_turno') return { titulo: t('cambioTurno'), detalle: dia };
    if (p.tipo === 'novedad_asistencia') {
      const k = p.novedad === 'tardanza' ? 'tardanza' : p.novedad === 'salida_temprana' ? 'salidaTemprana' : 'ausencia';
      return { titulo: t(k), detalle: [dia, p.minutos ? duracion(p.minutos) : null].filter(Boolean).join(' · ') };
    }
    if (p.tipo === 'falta') return { titulo: t('ausencia'), detalle: t('faltaHoy') };
    if (p.tipo === 'marca_por_revisar') {
      return {
        titulo: t('marcaPorRevisar'),
        detalle: [dia, p.marca ? t(`marca.${p.marca}`) : null, p.motivo ? t(`revisar.${p.motivo}`) : null].filter(Boolean).join(' · '),
      };
    }
    return { titulo: p.tipo, detalle: zona ? dia : '' };
  };
}

function Resumen({ datos, cargando, onPersona }: { datos: RespuestaEquipo | null; cargando: boolean; onPersona: (id: string) => void }) {
  const t = useTranslations('hrmEquipo');
  const router = useRouter();
  const f = useFormatoHora();
  const zona = datos?.zona ?? 'America/Bogota';
  const hoy = datos?.hoy ?? null;
  const texto = useTextoPendiente(zona);
  const k = datos?.kpis;
  const persona = (id: string) => datos?.personas.find((p) => p.id === id);

  const desde = (p: PendienteEquipo) => {
    if (!hoy) return '';
    const dia = toPlainDate(new Date(p.desde), zona);
    const n = diasEntre(dia, hoy);
    return n <= 0 ? t('pendientes.hoy', { hora: f.hora(p.desde, zona) }) : n === 1 ? t('pendientes.ayer') : t('pendientes.haceDias', { n });
  };
  const insignia = (p: PendienteEquipo) =>
    p.estado === 'falta' ? (
      <Badge tono="peligro" apariencia="contorno" tamano="sm">{t('pendientes.estado.falta')}</Badge>
    ) : p.estado === 'por_revisar' ? (
      <Badge tono="informacion" apariencia="contorno" tamano="sm">{t('pendientes.estado.porRevisar')}</Badge>
    ) : (
      <Badge tono="advertencia" apariencia="contorno" tamano="sm">{t('pendientes.estado.porAprobar')}</Badge>
    );
  const subPersona = (id: string) => {
    const x = persona(id);
    return [x?.cargo, x?.directo ? t('directo') : t('indirecto')].filter(Boolean).join(' · ');
  };
  const acciones = (p: PendienteEquipo): AccionFila[] => [
    { id: 'persona', etiqueta: t('pendientes.verPersona'), icono: Eye, onSelect: () => onPersona(p.employment_id) },
    { id: 'aprobar', etiqueta: t('pendientes.revisarAprobaciones'), icono: Stamp, oculta: p.estado !== 'por_aprobar', onSelect: () => router.push('/app/hrm/aprobaciones') },
  ];
  const columnas: ColumnaTabla<PendienteEquipo>[] = [
    {
      id: 'persona',
      encabezado: t('pendientes.persona'),
      celda: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={persona(p.employment_id)?.nombre ?? '?'} tamano="md" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{persona(p.employment_id)?.nombre ?? '—'}</p>
            <p className="truncate text-xs text-fg-secondary">{subPersona(p.employment_id)}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'pendiente',
      encabezado: t('pendientes.pendiente'),
      celda: (p) => {
        const x = texto(p);
        return (
          <div className="min-w-0">
            <p className="truncate text-fg">{x.titulo}</p>
            <p className="truncate text-xs text-fg-secondary">{x.detalle}</p>
          </div>
        );
      },
    },
    { id: 'desde', encabezado: t('pendientes.desde'), ocultarDebajo: 'lg', celda: desde },
    { id: 'estado', encabezado: t('pendientes.estadoCol'), ancho: 140, celda: insignia },
  ];

  return (
    <>
      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard
          etiqueta={t('kpi.porAprobar')}
          valor={k?.por_aprobar ?? 0}
          detalle={k?.por_aprobar ? t('kpi.porAprobarDetalle', { ausencias: k.por_aprobar_ausencias, novedades: k.por_aprobar_novedades }) : undefined}
          tono={k?.por_aprobar ? 'advertencia' : 'neutro'}
          iconoDetalle={k?.por_aprobar ? AlertTriangle : undefined}
          cargando={cargando}
        />
        <StatCard
          etiqueta={t('kpi.faltan')}
          valor={k?.faltan_hoy ?? 0}
          detalle={k?.faltan_hoy ? t('kpi.faltanDetalle') : undefined}
          tono={k?.faltan_hoy ? 'peligro' : 'neutro'}
          iconoDetalle={k?.faltan_hoy ? ArrowDown : undefined}
          cargando={cargando}
        />
        <StatCard etiqueta={t('kpi.tarde')} valor={k?.tarde_hoy ?? 0} cargando={cargando} />
        <StatCard
          etiqueta={t('kpi.ausentes')}
          valor={k?.ausentes_semana ?? 0}
          detalle={k?.ausentes_semana ? t('kpi.ausentesDetalle') : undefined}
          cargando={cargando}
        />
      </KpiStrip>

      <Tarjeta titulo={t('pendientes.titulo')} sinRelleno>
        <DataTable
          etiqueta={t('pendientes.titulo')}
          columnas={columnas}
          filas={datos?.pendientes ?? []}
          obtenerId={(p) => p.id}
          estado={cargando ? 'cargando' : 'listo'}
          acciones={acciones}
          etiquetaFila={(p) => persona(p.employment_id)?.nombre ?? ''}
          onFilaClick={(p) => onPersona(p.employment_id)}
          tarjetaMovil={(p) => {
            const x = texto(p);
            return (
              <ListCard
                avatar={{ nombre: persona(p.employment_id)?.nombre ?? '?' }}
                titulo={persona(p.employment_id)?.nombre ?? '—'}
                subtitulo={[x.titulo, x.detalle].filter(Boolean).join(' · ')}
                meta={persona(p.employment_id)?.directo ? t('directo') : t('indirecto')}
                estado={insignia(p)}
                acciones={acciones(p)}
                onClick={() => onPersona(p.employment_id)}
              />
            );
          }}
          vacio={{ titulo: t('pendientes.vacio'), descripcion: t('pendientes.vacioDescripcion'), icono: CalendarCheck }}
        />
      </Tarjeta>

      {hoy && <SemanaEquipo personas={datos?.personas ?? []} hoy={hoy} onPersona={onPersona} />}
    </>
  );
}

function SemanaEquipo({ personas, hoy, onPersona }: { personas: PersonaEquipo[]; hoy: string; onPersona: (id: string) => void }) {
  const t = useTranslations('hrmEquipo.semana');
  const f = useFormatoHora();
  const lunes = lunesDe(hoy);
  const dias = diasDeSemana(lunes);
  const [dia, setDia] = useState(hoy);
  const { carga } = useCarga<RespuestaSemana>(`/api/hrm/turnos?desde=${lunes}&hasta=${dias[6]}`);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const ids = useMemo(() => new Set(personas.map((p) => p.id)), [personas]);
  // Solo lo publicado del equipo: el jefe nunca ve borradores (RLS y fn_hr_turnos_semana).
  const asignaciones = useMemo(() => (datos?.asignaciones ?? []).filter((a) => ids.has(a.employment_id) && !a.borrador), [datos, ids]);
  const indice = useMemo(() => indexarSemana({ asignaciones, ausencias: datos?.ausencias ?? [], festivos: datos?.festivos ?? [] }, null), [asignaciones, datos]);
  const filas = personas.filter((p) => asignaciones.some((a) => a.employment_id === p.id) || (datos?.ausencias ?? []).some((a) => a.employment_id === p.id));
  const zona = datos?.zona ?? 'America/Bogota';
  const columnas: ColumnaTabla<PersonaEquipo>[] = [
    {
      id: 'persona',
      encabezado: t('persona'),
      ancho: 220,
      celda: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={p.nombre} tamano="md" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{p.nombre}</p>
            <p className="truncate text-xs text-fg-secondary">{p.cargo ?? ''}</p>
          </div>
        </div>
      ),
    },
    ...dias.map<ColumnaTabla<PersonaEquipo>>((d) => ({
      id: d,
      encabezado: indice.festivos.has(d) ? `${f.diaCorto(d)} · ${t('festivo')}` : f.diaCorto(d),
      ancho: 141,
      celda: (p) => (
        <div className="flex flex-col gap-1">
          {celdasDe(indice, p.id, d, asignaciones).map((c, i) => (
            <BloqueTurno key={i} celda={c} zona={zona} vistaJefe />
          ))}
        </div>
      ),
    })),
  ];
  return (
    <section className="flex flex-col gap-3" aria-labelledby="semana-equipo">
      <h2 id="semana-equipo" className="text-base font-semibold text-fg">
        {t('titulo', { rango: f.rango(lunes, dias[6]) })}
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden [scrollbar-width:none]">
        {dias.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === dia}
            onClick={() => setDia(d)}
            className={clasesBoton({ variante: d === dia ? 'tinte' : 'secundario', tamano: 'sm' })}
          >
            {f.diaCorto(d)}
          </button>
        ))}
      </div>
      <DataTable
        etiqueta={t('titulo', { rango: f.rango(lunes, dias[6]) })}
        columnas={columnas}
        filas={filas}
        obtenerId={(p) => p.id}
        estado={carga.estado === 'cargando' ? 'cargando' : carga.estado === 'listo' ? 'listo' : 'error'}
        onFilaClick={(p) => onPersona(p.id)}
        tarjetaMovil={(p) => {
          const c = celdasDe(indice, p.id, dia, asignaciones)[0];
          const a = c?.asignacion;
          const sub =
            c?.tipo === 'ausencia'
              ? c.ausencia && esAusenciaDeSalud(c.ausencia)
                ? t('ausenciaJustificada')
                : (c.ausencia?.etiqueta ?? t('ausencia'))
              : !a
                ? t('sinTurno')
                : a.dia_descanso
                  ? t('descanso')
                  : `${a.plantilla ?? t('turno')} · ${f.hora(a.inicio, zona)} – ${f.hora(a.fin, zona)}`;
          return (
            <ListCard
              avatar={{ nombre: p.nombre }}
              titulo={p.nombre}
              subtitulo={sub}
              estado={
                c?.tipo === 'ausencia' ? (
                  <Badge tono="informacion" apariencia="contorno" tamano="sm">{t('ausente')}</Badge>
                ) : a && !a.dia_descanso ? (
                  <Badge tono="neutro" tamano="sm">{t('horas', { h: partesHoras(a.minutos ?? 0).h })}</Badge>
                ) : undefined
              }
              onClick={() => onPersona(p.id)}
            />
          );
        }}
        vacio={{ titulo: t('vacio'), icono: CalendarDays }}
        error={{ titulo: t('error') }}
      />
    </section>
  );
}

// ─── Calendario del mes ──────────────────────────────────────────────────────

function CalendarioEquipo({ personas, hoy, onPersona }: { personas: PersonaEquipo[]; hoy: string | null; onPersona: (id: string) => void }) {
  const t = useTranslations('hrmEquipo.calendario');
  const f = useFormatoHora();
  const locale = useLocale();
  const [mes, setMes] = useState<string>((hoy ?? '2026-01-01').slice(0, 7));
  const celdas = useMemo(() => grillaMes(mes, 1), [mes]);
  const desde = celdas[0].dia;
  const hasta = celdas[celdas.length - 1].dia;
  const { carga } = useCarga<RespuestaSemana>(`/api/hrm/turnos?desde=${desde}&hasta=${hasta}`);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const ids = useMemo(() => new Set(personas.map((p) => p.id)), [personas]);
  const ausencias = useMemo(() => (datos?.ausencias ?? []).filter((a) => ids.has(a.employment_id)), [datos, ids]);
  const dias = celdas.map((c) => c.dia);
  const cruces = useMemo(() => crucesPorDia(dias, ausencias, personas), [dias, ausencias, personas]);
  const tramos = tramosDeCruce(cruces, dias).filter((x) => x.desde.slice(0, 7) === mes || x.hasta.slice(0, 7) === mes);
  const festivos = new Map((datos?.festivos ?? []).map((x) => [x.fecha, x]));
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? '';
  const semanas = Array.from({ length: Math.ceil(celdas.length / 7) }, (_, i) => celdas.slice(i * 7, i * 7 + 7)).filter((s) => s.some((c) => c.delMes));
  const cabecera = diasDeSemana('2026-11-16').map((d) => new Intl.DateTimeFormat(locale === 'es' ? 'es-CO' : locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`)));
  const mover = (n: number) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <button type="button" aria-label={t('anterior')} className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={() => mover(-1)}>
          <ChevronLeft aria-hidden className="size-4" strokeWidth={1.5} />
        </button>
        <span className="min-w-36 text-center text-sm font-medium capitalize text-fg">{f.mes(`${mes}-01`)}</span>
        <button type="button" aria-label={t('siguiente')} className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={() => mover(1)}>
          <ChevronRight aria-hidden className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      {tramos.length > 0 && (
        <AvisoTonal
          tono="advertencia"
          icono={AlertTriangle}
          titulo={t('aviso', { area: tramos[0].area, quedan: tramos[0].quedan, total: tramos[0].total, desde: f.fecha(tramos[0].desde), hasta: f.fecha(tramos[0].hasta) })}
          descripcion={t('avisoDescripcion')}
        />
      )}
      {carga.estado === 'error' ? (
        <EmptyState variante="error" titulo={t('error')} compacto />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] table-fixed border-collapse" aria-label={t('titulo')}>
            <thead>
              <tr className="bg-subtle">
                {cabecera.map((c) => (
                  <th key={c} scope="col" className="px-3 py-3 text-left text-xs font-medium capitalize text-fg-secondary">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((s, i) => (
                <tr key={i}>
                  {s.map((c, j) => {
                    const fest = festivos.get(c.dia);
                    const deDia = ausencias.filter((a) => a.desde <= c.dia && a.hasta >= c.dia);
                    const gris = !!fest || j === 6;
                    return (
                      <td key={c.dia} className={`h-28 border-t border-line align-top ${j ? 'border-l' : ''} ${gris ? 'bg-subtle' : ''} px-2 py-2`}>
                        <p className={`flex items-center gap-2 text-xs ${!c.delMes ? 'text-fg-muted' : fest ? 'text-danger-text' : 'text-fg'}`}>
                          {c.dia === hoy ? <span className="flex size-6 items-center justify-center rounded-full bg-brand text-fg-on-brand">{c.numero}</span> : c.numero}
                          {fest && <span className="text-fg-muted">{t('festivo')}</span>}
                        </p>
                        {!loading(carga.estado) && (
                          <div className="mt-1 flex flex-col items-start gap-1">
                            {deDia.slice(0, 3).map((a) => (
                              <button key={a.id} type="button" onClick={() => onPersona(a.employment_id)} className="max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-full">
                                <Badge tono="informacion" apariencia="contorno" tamano="sm" className="max-w-full truncate">
                                  {nombreCorto(nombre(a.employment_id))}
                                </Badge>
                              </button>
                            ))}
                            {deDia.length > 3 && <span className="text-xs text-fg-secondary">{t('mas', { n: deDia.length - 3 })}</span>}
                            {(cruces.get(c.dia) ?? []).map((x) => (
                              <Badge key={x.area} tono="peligro" apariencia="contorno" tamano="sm" className="max-w-full truncate">
                                {t('cruce', { n: x.ausentes, area: x.area })}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-fg-secondary">{t('nota')}</p>
    </div>
  );
}

function loading(e: string): boolean {
  return e === 'cargando';
}

// ─── Una persona ─────────────────────────────────────────────────────────────

function DialogoPersona({ id, onCerrar }: { id: string | null; onCerrar: () => void }) {
  const t = useTranslations('hrmEquipo.persona');
  const f = useFormatoHora();
  const { timezone } = useFormatDate();
  const router = useRouter();
  const { carga } = useCarga<PersonaDetalle>(id ? `/api/hrm/equipo/${id}` : null);
  const p = carga.estado === 'listo' && id ? carga.datos : null;
  const estado = (() => {
    if (!p) return '—';
    const e = p.estado_hoy;
    if (e.tipo === 'ausente') {
      const que = esAusenciaDeSalud(e) ? t('ausenciaJustificada') : (e.etiqueta ?? t('ausente'));
      return t('ausenteRegresa', { que, dia: f.diaCorto(e.regresa).toLowerCase() });
    }
    if (e.tipo === 'en_turno') return t('enTurno');
    if (e.tipo === 'descanso') return t('descanso');
    if (e.tipo === 'programado') return t('programado', { hora: f.hora(e.inicio, timezone) });
    return t('sinTurno');
  })();
  const turnos = (() => {
    if (!p) return '—';
    const trabajados = p.turnos_semana.filter((x) => !x.dia_descanso);
    if (!trabajados.length) return t('sinTurnos');
    const nombres = Array.from(new Set(trabajados.map((x) => x.plantilla ?? t('turno'))));
    return t('turnoSemana', { plantilla: nombres.join(', '), desde: f.diaCorto(trabajados[0].fecha).toLowerCase().split(' ')[0], hasta: f.diaCorto(trabajados[trabajados.length - 1].fecha).toLowerCase().split(' ')[0] });
  })();
  const horas = (m: number) => partesHoras(m).h;
  return (
    <Dialogo
      abierto={!!id}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={p?.nombre ?? t('cargando')}
      descripcion={p ? [p.cargo, p.area, p.directo ? null : p.reporta_a ? t('reportaA', { nombre: p.reporta_a }) : t('indirecto')].filter(Boolean).join(' · ') : undefined}
      ancho={560}
      primario={{
        etiqueta: t('verHoja'),
        onClick: () => {
          if (id) router.push(`/app/hrm/asistencia?persona=${id}`);
        },
      }}
      secundarios={[{ etiqueta: t('verTurnos'), onClick: () => router.push(RUTA_TURNOS) }]}
      textoCancelar={t('cerrar')}
    >
      {carga.estado === 'sinPermiso' ? (
        <EmptyState variante="forbidden" titulo={t('sinPermiso')} compacto />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <FilaDato etiqueta={t('estadoHoy')} valor={<span className="font-semibold">{estado}</span>} />
            <FilaDato etiqueta={t('turnoSemanaEtiqueta')} valor={turnos} />
            <FilaDato etiqueta={t('vacaciones')} valor={p?.vacaciones_disponibles !== null && p ? t('diasHabiles', { n: Math.floor(p.vacaciones_disponibles ?? 0) }) : '—'} />
            <FilaDato etiqueta={t('horasPeriodo')} valor={p ? t('horasDe', { h: horas(p.minutos_periodo), de: horas(p.minutos_planeados_periodo) }) : '—'} />
            <FilaDato etiqueta={t('novedades')} valor={p?.novedades_por_aprobar ?? '—'} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tono="neutro" apariencia="contorno" tamano="sm" icono={Lock}>
              {t('salario')}
            </Badge>
            <Badge tono="neutro" apariencia="contorno" tamano="sm" icono={Lock}>
              {t('salud')}
            </Badge>
            <span className="text-xs text-fg-secondary">{t('soloRrhh')}</span>
          </div>
        </div>
      )}
    </Dialogo>
  );
}

