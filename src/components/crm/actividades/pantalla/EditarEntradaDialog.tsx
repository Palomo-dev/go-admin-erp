'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Save } from 'lucide-react';
import { FormField } from '@/components/kit/FormField';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_AREA, CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { RESULTADOS_LLAMADA } from '@/components/crm/kit/activityDialogLogica';
import { textoPlano, tipoEntradaFeed, type EntradaFeed } from './actividadesPantallaLogica';

/**
 * Editar una actividad o nota propia (Figma 769:13838 «editar nota»): el
 * texto, «fijar» en las notas y el resultado en las llamadas. Solo llega aquí
 * lo que el servidor marcó `editable`; el `PATCH` vuelve a comprobarlo.
 */
export interface EditarEntradaDialogProps {
  entrada: EntradaFeed | null;
  onCerrar: () => void;
  onGuardar: (v: { texto: string; fijada?: boolean; outcome?: string | null }) => void;
  ocupado?: boolean;
  error?: string | null;
}

export function EditarEntradaDialog({ entrada, onCerrar, onGuardar, ocupado, error }: EditarEntradaDialogProps) {
  const t = useTranslations('crm.pantallaActividades.editar');
  const tr = useTranslations('crm.kit.actividad.llamada.resultados');
  const [texto, setTexto] = useState('');
  const [fijada, setFijada] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [intentado, setIntentado] = useState(false);
  useEffect(() => {
    if (!entrada) return;
    setTexto(entrada.fuente === 'note' ? textoPlano(entrada.texto, 50000) ?? '' : entrada.texto ?? '');
    setFijada(entrada.fijada);
    setOutcome(entrada.outcome ?? '');
    setIntentado(false);
  }, [entrada]);
  if (!entrada) return null;
  const esNota = entrada.fuente === 'note';
  const esLlamada = tipoEntradaFeed(entrada) === 'llamada';
  const vacio = esNota && !texto.trim();
  const guardar = () => {
    setIntentado(true);
    if (vacio) return;
    onGuardar({ texto, ...(esNota ? { fijada } : {}), ...(esLlamada ? { outcome: outcome || null } : {}) });
  };

  return (
    <PanelAdaptable
      abierto
      onAbiertoChange={(x) => !x && !ocupado && onCerrar()}
      titulo={esNota ? t('tituloNota') : t('titulo')}
      descripcion={[entrada.cliente?.nombre, entrada.oportunidad?.nombre].filter(Boolean).join(' · ') || undefined}
      icono={Pencil}
      ancho={520}
      ocupado={ocupado}
      pie={
        <>
          <button type="button" onClick={onCerrar} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>{t('cancelar')}</button>
          <button type="button" onClick={guardar} disabled={ocupado} aria-busy={ocupado || undefined} className={clasesBoton()}>
            {ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {t('guardar')}
          </button>
        </>
      }
    >
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      {esLlamada && (
        <FormField etiqueta={t('resultado')}>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={CLASE_CAMPO}>
            <option value="">{t('sinResultado')}</option>
            {RESULTADOS_LLAMADA.map((r) => (
              <option key={r} value={r}>{tr(r)}</option>
            ))}
          </select>
        </FormField>
      )}
      <FormField etiqueta={esNota ? t('nota') : t('notas')} obligatorio={esNota} error={intentado && vacio ? t('obligatorio') : null}>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} className={CLASE_AREA} />
      </FormField>
      {esNota && (
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={fijada} onChange={(e) => setFijada(e.target.checked)} className="size-4 rounded border-line-strong accent-brand-action" />
          {t('fijar')}
        </label>
      )}
    </PanelAdaptable>
  );
}
