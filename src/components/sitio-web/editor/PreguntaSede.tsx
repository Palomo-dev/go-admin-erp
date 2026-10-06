'use client';

/**
 * Pregunta en línea al primer cambio sobre una sección que la sede comparte con el sitio
 * principal: «¿Cambiar solo en <Sede> o en todas las sedes?». Neutra, sin color de estado: no
 * es un aviso sino una decisión. «Solo en <Sede>» personaliza la sección en esa sede; «En
 * todas» lleva el cambio al sitio principal. Nunca se separa la sede en silencio.
 *
 * `flotante`: en el celular se pinta fija abajo, sobre la vista previa.
 */
import { Store } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton } from '@/components/kit';
import { useTextosEditor } from './textos';

export interface PreguntaSedeProps {
  sede: string;
  /** `quitar`: la pregunta nace de eliminar una sección compartida. */
  accion?: 'cambiar' | 'quitar';
  onResponder: (destino: 'sede' | 'todas') => void;
  onCancelar: () => void;
  flotante?: boolean;
  className?: string;
}

export function PreguntaSede({ sede, accion = 'cambiar', onResponder, onCancelar, flotante, className }: PreguntaSedeProps) {
  const t = useTextosEditor();
  return (
    <div
      role="alertdialog"
      aria-labelledby="pregunta-sede-titulo"
      aria-describedby="pregunta-sede-ayuda"
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-line bg-surface p-4',
        flotante && 'fixed inset-x-4 bottom-4 z-50',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Store aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        <div className="min-w-0">
          <p id="pregunta-sede-titulo" className="text-sm font-medium leading-5 text-fg">
            {t(accion === 'quitar' ? 'sede.preguntaTituloQuitar' : 'sede.preguntaTitulo', { sede })}
          </p>
          <p id="pregunta-sede-ayuda" className="text-[13px] leading-[18px] text-fg-secondary">
            {t('sede.preguntaAyuda')}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" autoFocus onClick={() => onResponder('sede')} className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })}>
          {t('sede.soloEn', { sede })}
        </button>
        <button type="button" onClick={() => onResponder('todas')} className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })}>
          {t('sede.enTodas')}
        </button>
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('sede.enTodasAyuda')}</p>
        <button type="button" onClick={onCancelar} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
          {t('acciones.cancelar')}
        </button>
      </div>
    </div>
  );
}
