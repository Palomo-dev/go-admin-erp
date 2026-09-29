'use client';

/**
 * Ficha del instructor (reemplaza los cuatro diálogos de la pantalla vieja:
 * detalle, horario, desempeño y disponibilidad) en un panel con pestañas.
 * Desempeño con datos reales (reservas que asistieron / reservas), no el 75 %
 * fijo de antes.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { EmptyState, FilaDato, ListaDatos, PanelAdaptable, StatusBadge, TabBar, idPanel, idPestana } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  disponibilidadPorDefecto,
  getInstructorAvailability,
  getInstructorStats,
  saveInstructorAvailability,
  type DisponibilidadSemanal,
  type GymClass,
  type Instructor,
} from '@/lib/services/gymService';
import { TONO_ESTADO_CLASE, estadoClase } from '../logica';
import type { FechasOrg } from '../useFechasOrg';
import { addPlainDays } from '@/lib/utils/dateDisplay';

type Pestana = 'resumen' | 'horario' | 'disponibilidad';
type Stats = Awaited<ReturnType<typeof getInstructorStats>>;
const DIAS = [1, 2, 3, 4, 5, 6, 7] as const;

interface Props {
  instructor: Instructor | null;
  onCerrar: () => void;
  clases: readonly GymClass[];
  organizationId: number;
  puedeEditar: boolean;
  fechas: FechasOrg;
  nombre: (i: Instructor) => string;
}

export function PanelInstructor({ instructor, onCerrar, clases, organizationId, puedeEditar, fechas, nombre }: Props) {
  const t = useTranslations('membresias.instructores');
  const tc = useTranslations('membresias.clases');
  const moneda = useMonedaOrganizacion();
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [stats, setStats] = useState<Stats | null>(null);
  const [disp, setDisp] = useState<DisponibilidadSemanal | null>(null);
  const [errorDisp, setErrorDisp] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!instructor) return;
    setPestana('resumen');
    setStats(null);
    setDisp(null);
    setErrorDisp(false);
    let vivo = true;
    getInstructorStats(instructor.user_id, organizationId)
      .then((s) => vivo && setStats(s))
      .catch(() => vivo && setStats(null));
    getInstructorAvailability(instructor.user_id, organizationId)
      .then((d) => vivo && setDisp(d))
      .catch(() => {
        if (!vivo) return;
        setDisp(disponibilidadPorDefecto());
        setErrorDisp(true);
      });
    return () => {
      vivo = false;
    };
  }, [instructor, organizationId]);

  if (!instructor) return null;

  const hasta = addPlainDays(fechas.hoy, 14);
  const proximas = clases
    .filter((c) => c.instructor_id === instructor.user_id)
    .filter((c) => {
      const d = fechas.dia(c.start_at);
      return d >= fechas.hoy && d < hasta;
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  const guardar = async () => {
    if (!disp) return;
    if (DIAS.some((d) => disp[d].some((f) => f.desde >= f.hasta))) {
      toast.error(t('disponibilidad.rangoInvalido'));
      return;
    }
    setGuardando(true);
    try {
      await saveInstructorAvailability(instructor.user_id, disp, organizationId);
      toast.success(t('disponibilidad.guardada'));
    } catch {
      toast.error(t('disponibilidad.errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarFranja = (dia: (typeof DIAS)[number], i: number, campo: 'desde' | 'hasta', valor: string) =>
    setDisp((d) => (d ? { ...d, [dia]: d[dia].map((f, j) => (j === i ? { ...f, [campo]: valor } : f)) } : d));

  const nombreDia = (d: number) => fechas.diaPlano(addPlainDays('2026-09-21', d - 1), { weekday: 'long' });

  return (
    <PanelAdaptable
      abierto={!!instructor}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={nombre(instructor)}
      descripcion={instructor.position?.name ?? t('panel.sinCargo')}
      icono={User}
      ancho={800}
      ocupado={guardando}
      debajoCabecera={
        <TabBar<Pestana>
          id="instructor"
          etiqueta={t('panel.pestanas')}
          valor={pestana}
          onValorChange={setPestana}
          pestanas={[
            { valor: 'resumen', etiqueta: t('panel.resumen') },
            { valor: 'horario', etiqueta: t('panel.horario'), contador: proximas.length },
            { valor: 'disponibilidad', etiqueta: t('panel.disponibilidad') },
          ]}
        />
      }
      pie={
        pestana === 'disponibilidad' && puedeEditar ? (
          <>
            <Button variant="outline" onClick={onCerrar} disabled={guardando}>
              {t('panel.cerrar')}
            </Button>
            <Button onClick={() => void guardar()} disabled={guardando || !disp}>
              {guardando ? t('disponibilidad.guardando') : t('disponibilidad.guardar')}
            </Button>
          </>
        ) : undefined
      }
    >
      <div role="tabpanel" id={idPanel('instructor', pestana)} aria-labelledby={idPestana('instructor', pestana)} className="flex flex-col gap-4">
        {pestana === 'resumen' && (
          <>
            <ListaDatos>
              <FilaDato etiqueta={t('panel.correo')} valor={instructor.profiles?.email ?? '—'} />
              <FilaDato etiqueta={t('panel.telefono')} valor={instructor.profiles?.phone ?? '—'} />
              <FilaDato etiqueta={t('panel.cargo')} valor={instructor.position?.name ?? '—'} />
              <FilaDato etiqueta={t('panel.departamento')} valor={instructor.department?.name ?? '—'} />
              <FilaDato etiqueta={t('panel.codigo')} valor={instructor.employee_code ?? '—'} />
              <FilaDato etiqueta={t('panel.tarifaHora')} valor={instructor.hourly_rate ? moneda.formatear(instructor.hourly_rate) : '—'} />
              {instructor.position?.requirements?.specialties?.length ? (
                <FilaDato etiqueta={t('panel.especialidades')} valor={instructor.position.requirements.specialties.join(', ')} />
              ) : null}
            </ListaDatos>
            <h3 className="text-sm font-semibold text-fg">{t('panel.desempeno')}</h3>
            {stats ? (
              <ListaDatos>
                <FilaDato etiqueta={t('panel.clasesTotales')} valor={stats.totalClasses} />
                <FilaDato etiqueta={t('panel.completadas')} valor={stats.completedClasses} />
                <FilaDato etiqueta={t('panel.canceladas')} valor={stats.cancelledClasses} />
                <FilaDato etiqueta={t('panel.reservas')} valor={stats.totalReservations} />
                <FilaDato etiqueta={t('panel.asistencias')} valor={stats.totalAttendance} />
                <FilaDato
                  etiqueta={t('panel.tasaAsistencia')}
                  valor={stats.totalReservations ? new Intl.NumberFormat(fechas.locale, { style: 'percent', maximumFractionDigits: 0 }).format(stats.avgAttendanceRate / 100) : '—'}
                  tamano="lg"
                  separadorAntes
                />
              </ListaDatos>
            ) : (
              <div className="flex flex-col gap-2" aria-busy="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            )}
          </>
        )}

        {pestana === 'horario' &&
          (proximas.length === 0 ? (
            <EmptyState titulo={t('horario.vacio')} descripcion={t('horario.vacioDescripcion')} compacto />
          ) : (
            <>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {proximas.map((c) => {
                  const e = estadoClase(c.status);
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-28 shrink-0 text-sm capitalize text-fg-secondary">
                        {fechas.fechaCorta(c.start_at)}
                        <span className="block tabular-nums">
                          {fechas.hora(c.start_at)}–{fechas.hora(c.end_at)}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{c.title}</span>
                      <StatusBadge estado={e} etiqueta={tc(`estados.${e}`)} tono={TONO_ESTADO_CLASE[e]} />
                    </li>
                  );
                })}
              </ul>
              <Link href="/app/membresias/clases?vista=calendario" className="self-start text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                {t('horario.verCalendario')}
              </Link>
            </>
          ))}

        {pestana === 'disponibilidad' &&
          (!disp ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <p className="text-sm text-fg-secondary">{t('disponibilidad.descripcion')}</p>
              {errorDisp && (
                <p role="alert" className="text-sm text-warning-text">
                  {t('disponibilidad.errorCargar')}
                </p>
              )}
              <ul className="flex flex-col gap-3">
                {DIAS.map((d) => (
                  <li key={d} className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium capitalize text-fg">{nombreDia(d)}</span>
                      {puedeEditar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDisp({ ...disp, [d]: [...disp[d], { desde: '08:00', hasta: '12:00' }] })}
                          aria-label={t('disponibilidad.agregarEn', { dia: nombreDia(d) })}
                        >
                          <Plus aria-hidden="true" className="mr-1 size-4" />
                          {t('disponibilidad.agregar')}
                        </Button>
                      )}
                    </div>
                    {disp[d].length === 0 ? (
                      <p className="mt-1 text-xs text-fg-muted">{t('disponibilidad.noDisponible')}</p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-2">
                        {disp[d].map((f, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2">
                            <Input
                              type="time"
                              value={f.desde}
                              onChange={(e) => cambiarFranja(d, i, 'desde', e.target.value)}
                              disabled={!puedeEditar}
                              aria-label={t('disponibilidad.desdeEn', { dia: nombreDia(d) })}
                              className="h-9 w-32"
                            />
                            <span aria-hidden="true" className="text-fg-muted">
                              –
                            </span>
                            <Input
                              type="time"
                              value={f.hasta}
                              onChange={(e) => cambiarFranja(d, i, 'hasta', e.target.value)}
                              disabled={!puedeEditar}
                              aria-label={t('disponibilidad.hastaEn', { dia: nombreDia(d) })}
                              className="h-9 w-32"
                            />
                            {puedeEditar && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-9"
                                onClick={() => setDisp({ ...disp, [d]: disp[d].filter((_, j) => j !== i) })}
                                aria-label={t('disponibilidad.quitar')}
                              >
                                <Trash2 aria-hidden="true" className="size-4" />
                              </Button>
                            )}
                            {f.desde >= f.hasta && <span className="text-xs text-danger-text">{t('disponibilidad.rangoInvalido')}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ))}
      </div>
    </PanelAdaptable>
  );
}
