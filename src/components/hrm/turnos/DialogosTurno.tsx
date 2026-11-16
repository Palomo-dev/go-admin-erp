'use client';

/**
 * Diálogos de la programación de turnos (Figma 20.8): cambiar el horario o la
 * plantilla de un turno, cambiarlo con otra persona, revisar cruces y topes
 * antes de publicar y aplicar una rotación. Todo con piezas del kit
 * (`Dialogo`, `FormField`, `DataTable`, `AvisoTonal`) y por las rutas del servidor.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, Info } from 'lucide-react';
import { AvisoTonal, DataTable, Dialogo, FormField, ListCard, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AsignacionSemana, Hallazgo, PersonaSemana, PlantillaSemana, Validacion } from '@/lib/hrm/turnos/programacion';
import { esTope, partesHoras } from '@/lib/hrm/turnos/programacion';
import { enviar, useMensajeErrorTurnos } from './apiTurnos';
import { useFormatoHora } from './formatoHora';

const PERSONALIZADO = '__personalizado__';
const HORAS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const DESCANSOS = [0, 15, 30, 45, 60, 90, 120];

// ─── Cambiar horario / usar otra plantilla / asignar ─────────────────────────

export interface DialogoTurnoProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  modo: 'horario' | 'plantilla' | 'nuevo';
  persona: PersonaSemana | null;
  fecha: string | null;
  asignacion: AsignacionSemana | null;
  plantillas: PlantillaSemana[];
  onGuardado: () => void;
}

export function DialogoTurno({ abierto, onAbiertoChange, modo, persona, fecha, asignacion, plantillas, onGuardado }: DialogoTurnoProps) {
  const t = useTranslations('hrmTurnos.dialogoTurno');
  const f = useFormatoHora();
  const mensaje = useMensajeErrorTurnos();
  const [plantilla, setPlantilla] = useState<string>(PERSONALIZADO);
  const [inicio, setInicio] = useState('06:00');
  const [fin, setFin] = useState('13:00');
  const [descanso, setDescanso] = useState(30);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const p = asignacion?.plantilla_id ?? (modo === 'horario' ? null : plantillas[0]?.id ?? null);
    setPlantilla(modo === 'horario' ? PERSONALIZADO : (p ?? PERSONALIZADO));
    setInicio(asignacion?.hora_inicio ?? plantillas[0]?.hora_inicio ?? '06:00');
    setFin(asignacion?.hora_fin ?? plantillas[0]?.hora_fin ?? '13:00');
    setDescanso(asignacion?.descanso_min ?? plantillas[0]?.descanso_min ?? 30);
  }, [abierto, asignacion, modo, plantillas]);

  const personalizado = plantilla === PERSONALIZADO;
  const guardar = async () => {
    if (!persona || !fecha) return;
    setEnviando(true);
    try {
      await enviar('/api/hrm/turnos', 'POST', {
        employment_id: persona.id,
        fecha,
        plantilla_id: personalizado ? (asignacion?.plantilla_id ?? null) : plantilla,
        hora_inicio: personalizado ? inicio : null,
        hora_fin: personalizado ? fin : null,
        descanso_min: personalizado ? descanso : null,
      });
      toast.success(t('guardado'));
      onAbiertoChange(false);
      onGuardado();
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t(`titulo.${modo}`, { nombre: persona?.nombre ?? '', dia: fecha ? f.diaLargo(fecha) : '' })}
      descripcion={t('descripcion')}
      ancho={520}
      primario={{ etiqueta: t('guardar'), onClick: () => void guardar(), cargando: enviando }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        {modo !== 'horario' && (
          <FormField etiqueta={t('plantilla')}>
            {(c) => (
              <Select value={plantilla} onValueChange={setPlantilla}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plantillas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {`${p.nombre} · ${f.pared(p.hora_inicio)} – ${f.pared(p.hora_fin)}`}
                    </SelectItem>
                  ))}
                  <SelectItem value={PERSONALIZADO}>{t('personalizado')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
        {personalizado && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SelectorHora etiqueta={t('empieza')} valor={inicio} onCambio={setInicio} />
              <SelectorHora etiqueta={t('termina')} valor={fin} onCambio={setFin} />
            </div>
            <FormField etiqueta={t('descanso')}>
              {(c) => (
                <Select value={String(descanso)} onValueChange={(v) => setDescanso(Number(v))}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESCANSOS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m === 0 ? t('sinDescanso') : t('descansoNoPagado', { min: m })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            {fin <= inicio && <p className="text-xs text-fg-secondary">{t('cruzaMedianoche')}</p>}
          </>
        )}
        <p className="text-xs text-fg-muted">{t('nota')}</p>
      </div>
    </Dialogo>
  );
}

function SelectorHora({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  const f = useFormatoHora();
  const opciones = HORAS.includes(valor) ? HORAS : [...HORAS, valor].sort();
  return (
    <FormField etiqueta={etiqueta} obligatorio>
      {(c) => (
        <Select value={valor} onValueChange={onCambio}>
          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
            <SelectValue>{f.pared(valor)}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {opciones.map((h) => (
              <SelectItem key={h} value={h}>
                {f.pared(h)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export { SelectorHora };

// ─── Cambiar con otra persona ────────────────────────────────────────────────

export function DialogoIntercambio({
  abierto,
  onAbiertoChange,
  asignacion,
  personas,
  asignaciones,
  zona,
  onGuardado,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  asignacion: AsignacionSemana | null;
  personas: PersonaSemana[];
  asignaciones: AsignacionSemana[];
  zona: string;
  onGuardado: () => void;
}) {
  const t = useTranslations('hrmTurnos.intercambio');
  const f = useFormatoHora();
  const mensaje = useMensajeErrorTurnos();
  const [otra, setOtra] = useState<string>('');
  const [enviando, setEnviando] = useState(false);
  const candidatas = useMemo(
    () => (asignacion ? asignaciones.filter((a) => a.fecha === asignacion.fecha && a.employment_id !== asignacion.employment_id) : []),
    [asignacion, asignaciones]
  );
  useEffect(() => {
    if (abierto) setOtra(candidatas[0]?.id ?? '');
  }, [abierto, candidatas]);
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? '—';
  const guardar = async () => {
    if (!asignacion || !otra) return;
    setEnviando(true);
    try {
      await enviar('/api/hrm/turnos/intercambiar', 'POST', { a: asignacion.id, b: otra });
      toast.success(t('hecho'));
      onAbiertoChange(false);
      onGuardado();
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { dia: asignacion ? f.diaLargo(asignacion.fecha) : '' })}
      descripcion={t('descripcion', { nombre: asignacion ? nombre(asignacion.employment_id) : '' })}
      ancho={520}
      primario={{ etiqueta: t('cambiar'), onClick: () => void guardar(), cargando: enviando, deshabilitada: !otra, motivo: t('sinCandidatas') }}
      textoCancelar={t('cancelar')}
    >
      {candidatas.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('sinCandidatas')}</p>
      ) : (
        <FormField etiqueta={t('con')}>
          {(c) => (
            <Select value={otra} onValueChange={setOtra}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidatas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {`${nombre(a.employment_id)} · ${a.dia_descanso ? t('descanso') : `${f.hora(a.inicio, zona)} – ${f.hora(a.fin, zona)}`}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
    </Dialogo>
  );
}

// ─── Revisar antes de publicar ───────────────────────────────────────────────

export function useTextoHallazgo(personas: PersonaSemana[], asignaciones: AsignacionSemana[], zona: string) {
  const t = useTranslations('hrmTurnos.hallazgos');
  const f = useFormatoHora();
  return (h: Hallazgo): { titulo: string; detalle: string; tipo: 'cruce' | 'tope' | 'aviso' } => {
    const dia = h.fechas?.[0] ? f.diaCorto(h.fechas[0]).toLowerCase() : '';
    const horas = (m: number | undefined) => partesHoras(m ?? 0).h;
    const desc = (id: string) => {
      const a = asignaciones.find((x) => x.id === id);
      return a ? `${a.plantilla ?? t('turno')} ${f.hora(a.inicio, zona)} – ${f.hora(a.fin, zona)}` : '';
    };
    switch (h.codigo) {
      case 'turno_cruzado':
        return { titulo: t('cruce', { dia }), detalle: (h.asignaciones ?? []).map(desc).join(t('y')), tipo: 'cruce' };
      case 'turno_en_ausencia':
        return { titulo: t('enAusencia', { dia }), detalle: t('enAusenciaDetalle'), tipo: 'cruce' };
      case 'extra_planeada':
        return { titulo: t('extraDia', { h: horas(h.minutos_extra), dia }), detalle: t('jornadaDiaria'), tipo: 'tope' };
      case 'extra_diaria_supera_tope':
        return { titulo: t('extraDia', { h: horas(h.minutos_extra), dia }), detalle: t('topeExtraDia', { h: horas(h.tope_minutos) }), tipo: 'tope' };
      case 'semana_supera_jornada':
        return { titulo: t('semana', { h: horas(h.minutos_planeados) }), detalle: t('topeSemana', { h: horas(h.tope_minutos) }), tipo: 'tope' };
      case 'extra_semanal_supera_tope':
        return { titulo: t('semana', { h: horas(h.minutos_planeados) }), detalle: t('topeExtraSemana', { h: horas(h.tope_minutos) }), tipo: 'tope' };
      case 'semana_sin_descanso':
        return { titulo: t('sinDescanso'), detalle: t('sinDescansoDetalle'), tipo: 'aviso' };
      case 'trabaja_dia_descanso':
        return {
          titulo: t('diaDescanso', { dia }),
          detalle: (h.en_el_mes ?? 0) >= (h.umbral_habitual ?? Infinity) ? t('habitual', { n: h.en_el_mes ?? 0 }) : t('ocasional', { n: h.en_el_mes ?? 0 }),
          tipo: 'aviso',
        };
      default:
        return { titulo: h.codigo, detalle: '', tipo: esTope(h) ? 'tope' : 'aviso' };
    }
  };
}

export function DialogoRevisar({
  abierto,
  onAbiertoChange,
  validacion,
  personas,
  asignaciones,
  zona,
  rango,
  onCorregir,
  onPublicar,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  validacion: Validacion | null;
  personas: PersonaSemana[];
  asignaciones: AsignacionSemana[];
  zona: string;
  rango: string;
  onCorregir: () => void;
  onPublicar: () => void;
}) {
  const t = useTranslations('hrmTurnos.revisar');
  const texto = useTextoHallazgo(personas, asignaciones, zona);
  const filas = useMemo(() => [...(validacion?.bloqueos ?? []), ...(validacion?.alertas ?? [])].map((h, i) => ({ h, i, ...texto(h) })), [validacion, texto]);
  const cruces = filas.filter((f) => f.tipo === 'cruce').length;
  const persona = (id: string) => personas.find((p) => p.id === id);
  const insignia = (tipo: 'cruce' | 'tope' | 'aviso') => (
    <Badge tono={tipo === 'cruce' ? 'peligro' : tipo === 'tope' ? 'advertencia' : 'neutro'} tamano="sm">
      {t(`tipo.${tipo}`)}
    </Badge>
  );
  const columnas: ColumnaTabla<(typeof filas)[number]>[] = [
    {
      id: 'persona',
      encabezado: t('persona'),
      celda: (f) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{persona(f.h.employment_id)?.nombre ?? '—'}</p>
          <p className="truncate text-xs text-fg-secondary">{persona(f.h.employment_id)?.cargo ?? ''}</p>
        </div>
      ),
    },
    {
      id: 'que',
      encabezado: t('quePasa'),
      celda: (f) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{f.titulo}</p>
          <p className="truncate text-xs text-fg-secondary">{f.detalle}</p>
        </div>
      ),
    },
    { id: 'tipo', encabezado: t('tipoCol'), ancho: 96, celda: (f) => insignia(f.tipo) },
  ];
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion', { rango, n: filas.length })}
      ancho={672}
      icono={AlertTriangle}
      primario={
        cruces > 0
          ? { etiqueta: t('corregir'), onClick: onCorregir }
          : { etiqueta: t('publicarConMotivo'), onClick: onPublicar }
      }
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        <DataTable
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={filas}
          obtenerId={(f) => String(f.i)}
          densidad="comoda"
          estado="listo"
          tarjetaMovil={(f) => (
            <ListCard
              icono={AlertTriangle}
              titulo={persona(f.h.employment_id)?.nombre ?? '—'}
              subtitulo={f.titulo}
              meta={f.detalle}
              estado={insignia(f.tipo)}
            />
          )}
          vacio={{ titulo: t('sinHallazgos') }}
        />
        <AvisoTonal tono="informacion" icono={Info} titulo={t('topesTitulo')} descripcion={t('topesDescripcion')} />
      </div>
    </Dialogo>
  );
}

// ─── Aplicar una rotación ────────────────────────────────────────────────────

export function DialogoAplicarRotacion({
  abierto,
  onAbiertoChange,
  rotaciones,
  personas,
  desde,
  hasta,
  rotacionInicial,
  onAplicada,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  rotaciones: Array<{ id: string; nombre: string; activa: boolean }>;
  personas: Array<{ id: string; nombre: string; cargo?: string | null }>;
  desde: string;
  hasta: string;
  rotacionInicial?: string | null;
  onAplicada: () => void;
}) {
  const t = useTranslations('hrmTurnos.aplicarRotacion');
  const f = useFormatoHora();
  const mensaje = useMensajeErrorTurnos();
  const activas = rotaciones.filter((r) => r.activa);
  const [rotacion, setRotacion] = useState('');
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    setRotacion(rotacionInicial ?? activas[0]?.id ?? '');
    setElegidas(new Set());
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
  const aplicar = async () => {
    setEnviando(true);
    try {
      const r = await enviar<{ creados: number; omitidos: unknown[] }>(`/api/hrm/turnos/rotaciones/${rotacion}/aplicar`, 'POST', {
        desde,
        hasta,
        vinculos: Array.from(elegidas),
      });
      toast.success(t('hecho', { n: r.creados, omitidos: r.omitidos.length }));
      onAbiertoChange(false);
      onAplicada();
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion', { rango: f.rango(desde, hasta) })}
      ancho={520}
      primario={{
        etiqueta: t('generar'),
        onClick: () => void aplicar(),
        cargando: enviando,
        deshabilitada: !rotacion || elegidas.size === 0,
        motivo: t('falta'),
      }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        {activas.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('sinRotaciones')}</p>
        ) : (
          <FormField etiqueta={t('rotacion')}>
            {(c) => (
              <Select value={rotacion} onValueChange={setRotacion}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activas.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">{t('personas')}</legend>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {personas.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-hover">
                  <Checkbox
                    checked={elegidas.has(p.id)}
                    onCheckedChange={(v) =>
                      setElegidas((s) => {
                        const n = new Set(s);
                        if (v === true) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 truncate text-sm text-fg">{p.nombre}</span>
                  {p.cargo && <span className="truncate text-xs text-fg-secondary">{p.cargo}</span>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <p className="text-xs text-fg-muted">{t('nota')}</p>
      </div>
    </Dialogo>
  );
}
