'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Loader2, Save } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { CampoFechaHora } from '@/components/crm/kit/CampoFechaHora';
import { CLASE_AREA, CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { aFechaHoraLocal, deFechaHoraLocal } from '@/components/crm/kit/fechasCrm';
import { claveError, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { TimelineMeetingEvent } from '@/lib/services/crm/timeline/types';
import type { MeetingPatch } from '@/lib/services/crm/meetingsService';

/** Edita el evento hidratado; no reconstruye sus datos desde las notas del historial. */
export function EditarReunionDialog({ evento, timezone, onCerrar, onGuardada }: {
  evento: TimelineMeetingEvent;
  timezone: string;
  onCerrar: () => void;
  onGuardada: (evento: TimelineMeetingEvent) => void;
}) {
  const t = useTranslations('crm.historial.reunion');
  const campos = useTranslations('crm.kit.actividad');
  const errores = useTranslations('crm.accionesRapidas.errores');
  const formId = useId();
  const [titulo, setTitulo] = useState(evento.title ?? '');
  const [descripcion, setDescripcion] = useState(evento.description ?? '');
  const [lugar, setLugar] = useState(evento.location ?? '');
  const inicioOriginal = aFechaHoraLocal(evento.start_at, timezone);
  const finOriginal = aFechaHoraLocal(evento.end_at, timezone);
  const [inicio, setInicio] = useState(inicioOriginal);
  const [fin, setFin] = useState(finOriginal);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (ocupado) return;
    let start: string | null, end: string | null;
    try {
      // Conservar segundos y offset cuando el usuario no cambia la fecha.
      start = inicio === inicioOriginal ? evento.start_at : deFechaHoraLocal(inicio, timezone);
      end = fin === finOriginal ? evento.end_at : deFechaHoraLocal(fin, timezone);
    } catch { setError(errores('datos')); return; }
    if (!titulo.trim() || titulo.trim().length > 200 || descripcion.length > 5000 || lugar.length > 500 || !start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
      setError(errores('datos')); return;
    }
    const patch: MeetingPatch = {};
    if (titulo !== evento.title) patch.title = titulo.trim();
    if (descripcion !== (evento.description ?? '')) patch.description = descripcion || null;
    if (lugar !== (evento.location ?? '')) patch.location = lugar || null;
    if (inicio !== inicioOriginal) patch.start_at = start;
    if (fin !== finOriginal) patch.end_at = end;
    if (!Object.keys(patch).length) { onCerrar(); return; }
    setOcupado(true); setError(null);
    try {
      const { data } = await pedirCrm<TimelineMeetingEvent>(`/api/crm/meetings/${evento.id}`, { method: 'PATCH', cuerpo: patch });
      onGuardada(data);
    } catch (e) { setError(errores(claveError(e))); }
    finally { setOcupado(false); }
  };

  return <PanelAdaptable abierto onAbiertoChange={abierto => { if (!abierto && !ocupado) onCerrar(); }} titulo={t('editar')} icono={Calendar} ancho={520} ocupado={ocupado} pie={<>
    <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={ocupado} onClick={onCerrar}>{campos('cancelar')}</button>
    <button type="submit" form={formId} className={clasesBoton()} disabled={ocupado} aria-busy={ocupado || undefined}>{ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" />}{t('guardar')}</button>
  </>}>
    <form id={formId} className="space-y-4" onSubmit={e => { e.preventDefault(); void guardar(); }}>
    {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
    <FormField etiqueta={campos('reunion.titulo')} obligatorio><input className={CLASE_CAMPO} value={titulo} maxLength={200} disabled={ocupado} onChange={e => setTitulo(e.target.value)} /></FormField>
    <FormField etiqueta={campos('reunion.empieza')} obligatorio><CampoFechaHora valor={inicio} onValorChange={setInicio} disabled={ocupado} /></FormField>
    <FormField etiqueta={campos('reunion.termina')} obligatorio ayuda={campos('reunion.zona', { zona: timezone })}><CampoFechaHora valor={fin} onValorChange={setFin} disabled={ocupado} /></FormField>
    <FormField etiqueta={campos('reunion.lugar')}><input className={CLASE_CAMPO} value={lugar} maxLength={500} disabled={ocupado} onChange={e => setLugar(e.target.value)} /></FormField>
    <FormField etiqueta={t('descripcion')}><textarea className={CLASE_AREA} value={descripcion} maxLength={5000} disabled={ocupado} onChange={e => setDescripcion(e.target.value)} /></FormField>
    </form>
  </PanelAdaptable>;
}
