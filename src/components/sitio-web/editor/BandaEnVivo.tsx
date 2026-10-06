'use client';

/**
 * Banda neutra de los sitios sin borrador (legacy): «Editas el sitio en vivo: al guardar, los
 * cambios salen en la web.» con «Crear borrador» para revisar antes de publicar (plan de
 * restaurante, paquete F). Sin color de estado: informa el modo, no alerta. El borrador se crea
 * con el mismo diálogo de confirmación del menú «⋯»; nada se crea sin confirmar.
 */
import { Radio } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { useTextosEditor } from './textos';

export interface BandaEnVivoProps {
  /** Sin esto no se ofrece «Crear borrador» (sin permiso o sin API V2). */
  onCrearBorrador?: () => void;
}

export function BandaEnVivo({ onCrearBorrador }: BandaEnVivoProps) {
  const t = useTextosEditor();
  return (
    <div role="status" className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <Radio aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <p className="min-w-0 flex-1 text-sm text-fg-secondary lg:truncate">
        <span className="font-medium text-fg">{t('enVivo.titulo')}</span> {t('enVivo.descripcion')}
      </p>
      {onCrearBorrador && (
        <button type="button" onClick={onCrearBorrador} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          {t('enVivo.crearBorrador')}
        </button>
      )}
    </div>
  );
}
