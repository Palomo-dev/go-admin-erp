'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckSquare, Loader2, Plus } from 'lucide-react';
import { FormField } from '@/components/kit/FormField';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_AREA, CLASE_AVISO_INFO, CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import { PRIORIDADES_TAREA, validarTarea, valoresInicialesTarea, type PrioridadTarea, type ValoresTarea } from './accionesRapidasLogica';

/**
 * Tarea rápida del CRM (Figma 773:472975, «Tarea»): título, vencimiento en la
 * hora de la organización, prioridad y descripción. Se asigna al usuario
 * actual (lo pone el servidor). Es el paso intermedio hasta el `TaskForm` del
 * PM (ola 4): escribe por `POST /api/crm/tasks`, nunca desde el navegador.
 */
export interface TareaRapidaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** «Ana Gómez · Uniformes 2026». */
  contexto: string;
  onGuardar: (valores: ValoresTarea) => void;
  ocupado?: boolean;
  error?: string | null;
}

export function TareaRapidaDialog({ abierto, onAbiertoChange, contexto, onGuardar, ocupado, error }: TareaRapidaDialogProps) {
  const t = useTranslations('crm.accionesRapidas.tarea');
  const { getToday, timezone } = useFormatDate();
  const hoy = getToday();
  const [v, setV] = useState<ValoresTarea>(() => valoresInicialesTarea(addPlainDays(hoy, 1)));
  const [intentado, setIntentado] = useState(false);
  useEffect(() => {
    if (abierto) {
      setV(valoresInicialesTarea(addPlainDays(hoy, 1)));
      setIntentado(false);
    }
  }, [abierto, hoy]);

  const codigos = validarTarea(v, hoy);
  const err = (k: keyof ValoresTarea) => (intentado && codigos[k] ? t(`error.${codigos[k]}`) : null);
  const cambiar = (p: Partial<ValoresTarea>) => setV((x) => ({ ...x, ...p }));
  const guardar = () => {
    setIntentado(true);
    if (Object.keys(codigos).length === 0) onGuardar(v);
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={contexto}
      icono={CheckSquare}
      ancho={520}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" onClick={() => onAbiertoChange(false)} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>
            {t('cancelar')}
          </button>
          <button type="button" onClick={guardar} disabled={ocupado} aria-busy={ocupado || undefined} className={clasesBoton()}>
            {ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {t('crear')}
          </button>
        </>
      }
    >
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      <FormField etiqueta={t('campoTitulo')} obligatorio error={err('titulo')}>
        <input value={v.titulo} onChange={(e) => cambiar({ titulo: e.target.value })} maxLength={300} placeholder={t('tituloEj')} className={CLASE_CAMPO} />
      </FormField>
      <FormField etiqueta={t('descripcion')}>
        <textarea value={v.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} rows={3} className={CLASE_AREA} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField etiqueta={t('fecha')} error={err('fecha')}>
          <input type="date" value={v.fecha} min={hoy} onChange={(e) => cambiar({ fecha: e.target.value })} className={CLASE_CAMPO} />
        </FormField>
        <FormField etiqueta={t('hora')} error={err('hora')}>
          <input type="time" value={v.hora} onChange={(e) => cambiar({ hora: e.target.value })} className={CLASE_CAMPO} />
        </FormField>
        <FormField etiqueta={t('prioridad')}>
          <select value={v.prioridad} onChange={(e) => cambiar({ prioridad: e.target.value as PrioridadTarea })} className={CLASE_CAMPO}>
            {PRIORIDADES_TAREA.map((p) => (
              <option key={p} value={p}>{t(`prioridades.${p}`)}</option>
            ))}
          </select>
        </FormField>
      </div>
      <p className={CLASE_AVISO_INFO}>{t('aviso', { zona: timezone })}</p>
    </PanelAdaptable>
  );
}
