'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/Utils';

type Opcion = 'cargar' | 'sobrescribir';

interface DialogoConflictoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  versionLocal: number;
  versionServidor: number | null;
  onCargarNueva: () => Promise<void>;
  onSobrescribir: () => Promise<void>;
}

/**
 * Conflicto de versión (Figma 05i, F03-01): otra persona u otra pestaña guardó o publicó después
 * de que empezaste. Nada se pierde en silencio: el usuario elige. «Combinar» no se ofrece todavía
 * (necesita un diff por sección, fuera de esta etapa).
 */
export function DialogoConflicto({
  abierto,
  onAbiertoChange,
  versionLocal,
  versionServidor,
  onCargarNueva,
  onSobrescribir,
}: DialogoConflictoProps) {
  const [opcion, setOpcion] = useState<Opcion>('cargar');
  const [ocupado, setOcupado] = useState(false);

  const ejecutar = async () => {
    setOcupado(true);
    try {
      await (opcion === 'cargar' ? onCargarNueva() : onSobrescribir());
      onAbiertoChange(false);
    } finally {
      setOcupado(false);
    }
  };

  const tarjeta = (valor: Opcion, titulo: string, texto: string, peligro = false) => (
    <button
      type="button"
      role="radio"
      aria-checked={opcion === valor}
      onClick={() => setOpcion(valor)}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        opcion === valor
          ? peligro
            ? 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/30'
            : 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30'
          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
      )}
    >
      <p className={cn('text-sm font-medium', peligro ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-gray-100')}>{titulo}</p>
      <p className="text-xs text-gray-600 dark:text-gray-400">{texto}</p>
    </button>
  );

  return (
    <Dialog open={abierto} onOpenChange={(v) => !ocupado && onAbiertoChange(v)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Hay una versión más nueva</DialogTitle>
          <DialogDescription>
            Otra persona (u otra pestaña) guardó el borrador después de que empezaste
            {versionServidor ? ` (versión ${versionServidor}; tú partías de la ${versionLocal})` : ''}. Tus cambios siguen
            en el editor.
          </DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Qué hacer con el conflicto" className="space-y-2">
          {tarjeta('cargar', 'Descartar mis cambios y cargar la versión nueva', 'Recargas el borrador guardado. Lo que cambiaste aquí se pierde.')}
          {tarjeta(
            'sobrescribir',
            'Guardar los míos de todos modos',
            'Tu versión reemplaza lo que guardó la otra persona en el borrador. Lo publicado no cambia.',
            true,
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)} disabled={ocupado}>
            Decidir después
          </Button>
          <Button type="button" onClick={() => void ejecutar()} disabled={ocupado} variant={opcion === 'sobrescribir' ? 'destructive' : 'default'}>
            {ocupado ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            {opcion === 'cargar' ? 'Cargar la versión nueva' : 'Guardar los míos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
