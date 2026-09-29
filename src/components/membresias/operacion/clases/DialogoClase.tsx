'use client';

/**
 * Crear o editar una clase (fusiona el diálogo de Clases y el de Horarios).
 * Fecha y horas se interpretan en la zona de la organización: el instante se
 * arma con `horarioClase`, no con `new Date('YYYY-MM-DD')` del navegador.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampoFecha, CampoNumero, FormField, PanelAdaptable, SegmentedControl } from '@/components/kit';
import type { GymClass, Instructor } from '@/lib/services/gymService';
import { cn } from '@/utils/Utils';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import {
  NIVELES_CLASE,
  esTipoSugerido,
  horaEnZona,
  horarioClase,
  sumarMinutos,
  type NivelClase,
} from '../logica';
import type { FechasOrg } from '../useFechasOrg';

export interface DatosNuevaClase {
  dia: string;
  hora: string;
}

interface Props {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  clase: GymClass | null;
  /** Día y hora propuestos (clic en el calendario). */
  propuesta?: DatosNuevaClase | null;
  sucursales: ReadonlyArray<{ id: number; nombre: string }>;
  sucursalPorDefecto: number | null;
  instructores: readonly Instructor[];
  tipos: readonly string[];
  fechas: FechasOrg;
  onGuardar: (datos: Partial<GymClass>) => Promise<void>;
}

type Frecuencia = 'daily' | 'weekly' | 'monthly';
const NUEVO_TIPO = '__nuevo__';
const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

interface Formulario {
  titulo: string;
  tipo: string;
  tipoNuevo: string;
  nivel: NivelClase;
  sucursal: string;
  instructor: string;
  dia: string;
  hora: string;
  duracion: number | null;
  capacidad: number | null;
  sala: string;
  equipo: string;
  descripcion: string;
  repetir: boolean;
  frecuencia: Frecuencia;
  dias: number[];
  hasta: string;
}

export function DialogoClase({
  abierto,
  onAbiertoChange,
  clase,
  propuesta,
  sucursales,
  sucursalPorDefecto,
  instructores,
  tipos,
  fechas,
  onGuardar,
}: Props) {
  const t = useTranslations('membresias.clases');
  const idRepetir = useId();
  const [f, setF] = useState<Formulario>(() => vacio());
  const [guardando, setGuardando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  function vacio(): Formulario {
    return {
      titulo: '',
      tipo: 'other',
      tipoNuevo: '',
      nivel: 'all_levels',
      sucursal: sucursalPorDefecto ? String(sucursalPorDefecto) : sucursales.length === 1 ? String(sucursales[0].id) : '',
      instructor: instructores.length === 1 ? instructores[0].user_id : '',
      dia: fechas.hoy,
      hora: '07:00',
      duracion: 60,
      capacidad: 20,
      sala: '',
      equipo: '',
      descripcion: '',
      repetir: false,
      frecuencia: 'weekly',
      dias: [],
      hasta: '',
    };
  }

  useEffect(() => {
    if (!abierto) return;
    setIntentado(false);
    if (clase) {
      const duracion = Math.max(
        5,
        Math.round((new Date(clase.end_at).getTime() - new Date(clase.start_at).getTime()) / 60_000) || clase.duration_minutes || 60,
      );
      const rec = clase.recurrence && typeof clase.recurrence === 'object' ? clase.recurrence : null;
      setF({
        titulo: clase.title ?? '',
        tipo: clase.class_type || 'other',
        tipoNuevo: '',
        nivel: (NIVELES_CLASE as readonly string[]).includes(clase.difficulty_level ?? '') ? (clase.difficulty_level as NivelClase) : 'all_levels',
        sucursal: clase.branch_id ? String(clase.branch_id) : '',
        instructor: clase.instructor_id ?? '',
        dia: fechas.dia(clase.start_at),
        hora: horaEnZona(clase.start_at, fechas.zona),
        duracion,
        capacidad: clase.capacity ?? 20,
        sala: clase.room || clase.location || '',
        equipo: clase.equipment_needed ?? '',
        descripcion: clase.description ?? '',
        repetir: !!rec,
        frecuencia: rec?.type ?? 'weekly',
        dias: rec?.days ?? [],
        hasta: rec?.until ?? '',
      });
    } else {
      setF({ ...vacio(), ...(propuesta ? { dia: propuesta.dia, hora: propuesta.hora } : {}) });
    }
    // Solo al abrir: el formulario no se reinicia mientras se edita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, clase, propuesta]);

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((p) => ({ ...p, [k]: v }));

  const tipoFinal = f.tipo === NUEVO_TIPO ? f.tipoNuevo.trim() : f.tipo;
  const errores = useMemo(() => {
    const e: Partial<Record<'titulo' | 'tipo' | 'sucursal' | 'instructor' | 'dia' | 'hora' | 'duracion' | 'capacidad' | 'dias', string>> = {};
    if (!f.titulo.trim()) e.titulo = t('dialogo.errores.titulo');
    if (!tipoFinal) e.tipo = t('dialogo.errores.tipo');
    if (!f.sucursal) e.sucursal = t('dialogo.errores.sucursal');
    if (!f.instructor) e.instructor = instructores.length ? t('dialogo.errores.instructor') : t('dialogo.errores.sinInstructores');
    if (!f.dia) e.dia = t('dialogo.errores.dia');
    if (!/^\d{2}:\d{2}$/.test(f.hora)) e.hora = t('dialogo.errores.hora');
    if (!f.duracion || f.duracion < 5 || f.duracion > 480) e.duracion = t('dialogo.errores.duracion');
    if (!f.capacidad || f.capacidad < 1) e.capacidad = t('dialogo.errores.capacidad');
    if (f.repetir && f.frecuencia === 'weekly' && f.dias.length === 0) e.dias = t('dialogo.errores.dias');
    return e;
  }, [f, tipoFinal, instructores.length, t]);
  const valido = Object.keys(errores).length === 0;
  const err = (k: keyof typeof errores) => (intentado ? errores[k] ?? null : null);

  const guardar = async () => {
    setIntentado(true);
    if (!valido || !f.duracion || !f.capacidad) return;
    setGuardando(true);
    try {
      const { inicio, fin } = horarioClase(f.dia, f.hora, f.duracion, fechas.zona);
      await onGuardar({
        title: f.titulo.trim(),
        class_type: tipoFinal,
        difficulty_level: f.nivel,
        branch_id: Number(f.sucursal),
        instructor_id: f.instructor,
        start_at: inicio,
        end_at: fin,
        duration_minutes: f.duracion,
        capacity: f.capacidad,
        room: f.sala.trim() || undefined,
        equipment_needed: f.equipo.trim() || undefined,
        description: f.descripcion.trim() || undefined,
        recurrence: f.repetir
          ? { type: f.frecuencia, days: f.frecuencia === 'weekly' ? f.dias : undefined, until: f.hasta || undefined }
          : undefined,
      });
      onAbiertoChange(false);
    } catch {
      // La página muestra el error; el diálogo queda abierto para corregir.
    } finally {
      setGuardando(false);
    }
  };

  const etiquetaTipo = (tipo: string) => (esTipoSugerido(tipo) ? t(`tipos.${tipo}`) : tipo);
  // Días de la recurrencia en formato JS (0 = domingo), como los guardaba la pantalla anterior.
  // El nombre sale de una semana cualquiera que empieza en lunes (2026-09-21).
  const nombreDia = (d: number) => fechas.diaPlano(addPlainDays('2026-09-21', d === 0 ? 6 : d - 1), { weekday: 'short' });

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={clase ? t('dialogo.tituloEditar') : t('dialogo.tituloNueva')}
      descripcion={t('dialogo.descripcion', { zona: fechas.zona })}
      icono={Calendar}
      ocupado={guardando}
      ancho={672}
      pie={
        <>
          <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
            {t('dialogo.cancelar')}
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? t('dialogo.guardando') : clase ? t('dialogo.guardar') : t('dialogo.crear')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField etiqueta={t('dialogo.titulo')} obligatorio error={err('titulo')} className="sm:col-span-2">
          <Input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder={t('dialogo.tituloPlaceholder')} maxLength={120} />
        </FormField>

        <FormField etiqueta={t('dialogo.tipo')} obligatorio error={err('tipo')}>
          {(campo) => (
            <div className="flex flex-col gap-2">
              <Select value={f.tipo} onValueChange={(v) => set('tipo', v)}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>
                      {etiquetaTipo(tipo)}
                    </SelectItem>
                  ))}
                  <SelectItem value={NUEVO_TIPO}>{t('dialogo.tipoNuevo')}</SelectItem>
                </SelectContent>
              </Select>
              {f.tipo === NUEVO_TIPO && (
                <Input
                  value={f.tipoNuevo}
                  onChange={(e) => set('tipoNuevo', e.target.value)}
                  placeholder={t('dialogo.tipoNuevoPlaceholder')}
                  aria-label={t('dialogo.tipoNuevoPlaceholder')}
                  maxLength={40}
                />
              )}
            </div>
          )}
        </FormField>

        <FormField etiqueta={t('dialogo.nivel')}>
          {(campo) => (
            <Select value={f.nivel} onValueChange={(v) => set('nivel', v as NivelClase)}>
              <SelectTrigger id={campo.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NIVELES_CLASE.map((n) => (
                  <SelectItem key={n} value={n}>
                    {t(`niveles.${n}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField etiqueta={t('dialogo.sede')} obligatorio error={err('sucursal')}>
          {(campo) => (
            <Select value={f.sucursal} onValueChange={(v) => set('sucursal', v)}>
              <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']}>
                <SelectValue placeholder={t('dialogo.sedePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField etiqueta={t('dialogo.instructor')} obligatorio error={err('instructor')}>
          {(campo) => (
            <Select value={f.instructor} onValueChange={(v) => set('instructor', v)} disabled={instructores.length === 0}>
              <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']}>
                <SelectValue placeholder={t('dialogo.instructorPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {instructores.map((i) => (
                  <SelectItem key={i.user_id} value={i.user_id}>
                    {[i.profiles?.first_name, i.profiles?.last_name].filter(Boolean).join(' ') || i.profiles?.email || i.employee_code || i.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField etiqueta={t('dialogo.fecha')} obligatorio error={err('dia')}>
          <CampoFecha valor={f.dia} onValorChange={(d) => set('dia', d)} hoy={fechas.hoy} required />
        </FormField>

        <FormField etiqueta={t('dialogo.hora')} obligatorio error={err('hora')} ayuda={f.duracion ? t('dialogo.terminaA', { hora: sumarMinutos(f.hora || '00:00', f.duracion) }) : undefined}>
          <Input type="time" value={f.hora} onChange={(e) => set('hora', e.target.value)} step={300} />
        </FormField>

        <FormField etiqueta={t('dialogo.duracion')} obligatorio error={err('duracion')}>
          <CampoNumero valor={f.duracion} onValorChange={(v) => set('duracion', v)} decimales={0} minimo={5} maximo={480} sufijo={t('dialogo.minutos')} />
        </FormField>

        <FormField etiqueta={t('dialogo.capacidad')} obligatorio error={err('capacidad')}>
          <CampoNumero valor={f.capacidad} onValorChange={(v) => set('capacidad', v)} decimales={0} minimo={1} maximo={500} />
        </FormField>

        <FormField etiqueta={t('dialogo.sala')}>
          <Input value={f.sala} onChange={(e) => set('sala', e.target.value)} placeholder={t('dialogo.salaPlaceholder')} maxLength={80} />
        </FormField>

        <FormField etiqueta={t('dialogo.equipo')}>
          <Input value={f.equipo} onChange={(e) => set('equipo', e.target.value)} placeholder={t('dialogo.equipoPlaceholder')} maxLength={160} />
        </FormField>

        <FormField etiqueta={t('dialogo.descripcionCampo')} className="sm:col-span-2">
          <Textarea value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} rows={3} maxLength={1000} />
        </FormField>
      </div>

      <div className="rounded-lg border border-line p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <label htmlFor={idRepetir} className="flex items-center gap-2 text-sm font-medium text-fg">
              <Repeat aria-hidden="true" className="size-4 text-fg-secondary" />
              {t('dialogo.repetir')}
            </label>
            <p className="text-xs text-fg-secondary">{t('dialogo.repetirAyuda')}</p>
          </div>
          <Switch id={idRepetir} checked={f.repetir} onCheckedChange={(v) => set('repetir', v)} />
        </div>

        {f.repetir && (
          <div className="mt-4 flex flex-col gap-4">
            <SegmentedControl<Frecuencia>
              etiqueta={t('dialogo.frecuencia')}
              valor={f.frecuencia}
              onValorChange={(v) => set('frecuencia', v)}
              opciones={[
                { valor: 'daily', etiqueta: t('dialogo.frecuencias.daily') },
                { valor: 'weekly', etiqueta: t('dialogo.frecuencias.weekly') },
                { valor: 'monthly', etiqueta: t('dialogo.frecuencias.monthly') },
              ]}
            />
            {f.frecuencia === 'weekly' && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-fg">{t('dialogo.diasSemana')}</legend>
                <div className="flex flex-wrap gap-2">
                  {DIAS_SEMANA.map((d) => {
                    const activo = f.dias.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => set('dias', activo ? f.dias.filter((x) => x !== d) : [...f.dias, d].sort((a, b) => a - b))}
                        className={cn(
                          'h-9 min-w-11 rounded-full border px-3 text-sm font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                          activo ? 'border-brand bg-brand-action text-fg-on-brand' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
                        )}
                      >
                        {nombreDia(d)}
                      </button>
                    );
                  })}
                </div>
                {err('dias') && (
                  <p role="alert" className="mt-2 text-xs text-danger-text">
                    {err('dias')}
                  </p>
                )}
              </fieldset>
            )}
            <FormField etiqueta={t('dialogo.hasta')} ayuda={t('dialogo.hastaAyuda')}>
              <CampoFecha valor={f.hasta} onValorChange={(d) => set('hasta', d)} min={f.dia} hoy={fechas.hoy} limpiable />
            </FormField>
          </div>
        )}
      </div>
    </PanelAdaptable>
  );
}
