'use client';

/**
 * Estado vacío con propósito (brief UX §3): ilustración ligera de una
 * línea de tiempo, una frase y la acción principal. Nunca «No hay datos».
 */

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChannelIcon } from './channelMeta';

interface Props {
  /** `true` cuando hay secuencias pero el filtro no deja ninguna. */
  filtered: boolean;
  onCreate: () => void;
  onClearFilters: () => void;
}

const EXAMPLE = [
  { channel: 'email', label: 'Día 0' },
  { channel: 'call', label: 'Día 1' },
  { channel: 'whatsapp', label: 'Día 3' },
];

export function SequenceEmptyState({ filtered, onCreate, onClearFilters }: Props) {
  if (filtered) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
        <p className="font-medium text-gray-900 dark:text-gray-100">Ninguna secuencia coincide con el filtro</p>
        <Button variant="outline" className="mt-3" onClick={onClearFilters}>Quitar filtros</Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
      <div className="mx-auto flex w-fit items-center" aria-hidden="true">
        {EXAMPLE.map((s, i) => (
          <div key={s.channel} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <ChannelIcon channel={s.channel} />
              <span className="text-xs text-gray-500 dark:text-gray-400">{s.label}</span>
            </div>
            {i < EXAMPLE.length - 1 && <span className="mb-4 h-px w-10 bg-gray-300 dark:bg-gray-600" />}
          </div>
        ))}
      </div>
      <p className="mt-5 text-base font-medium text-gray-900 dark:text-gray-100">
        Tu primera secuencia: un email hoy, una llamada mañana y un WhatsApp al tercer día.
      </p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Cada paso sale de la cola del servidor una sola vez; se pausa si el cliente responde (si así se configura) y termina si la oportunidad se cierra.
      </p>
      <Button className="mt-5 bg-blue-600 text-white hover:bg-blue-700" onClick={onCreate}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Crear la primera secuencia
      </Button>
    </div>
  );
}
