'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { listarNotasRapidas, type NotasRapidas } from './cocinaCliente';

/**
 * Notas rápidas de la organización/sucursal y las más usadas, cargadas una
 * vez por sucursal y compartidas entre todas las líneas del carrito.
 */
const cache = new Map<string, Promise<NotasRapidas>>();

export function useNotasRapidas(branchId: number | null | undefined, activo = true): NotasRapidas | null {
  const [datos, setDatos] = useState<NotasRapidas | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    const clave = String(branchId ?? 'org');
    let promesa = cache.get(clave);
    if (!promesa) {
      promesa = listarNotasRapidas(branchId ?? null);
      cache.set(clave, promesa);
      promesa.catch(() => cache.delete(clave));
    }
    promesa.then((d) => { if (vigente) setDatos(d); }).catch(() => { if (vigente) setDatos(null); });
    return () => { vigente = false; };
  }, [branchId, activo]);
  return datos;
}

/** Tras editar la configuración, la próxima carga vuelve a pedirlas. */
export function olvidarNotasRapidas(): void {
  cache.clear();
}

export type DestinoNota = 'cocina' | 'cliente';

interface ChipsNotasRapidasProps {
  branchId: number | null | undefined;
  destino: DestinoNota;
  /** Texto de la nota y si la nota rápida es una alergia. */
  onElegir: (texto: string, alergia: boolean) => void;
  className?: string;
}

/** Chips bajo el campo de nota: las configuradas del destino y, en cocina, las más usadas. */
export function ChipsNotasRapidas({ branchId, destino, onElegir, className }: ChipsNotasRapidasProps) {
  const t = useTranslations('posNotasLinea');
  const datos = useNotasRapidas(branchId);
  if (!datos) return null;

  const configuradas = datos.notas.filter((n) =>
    destino === 'cliente' ? n.kind === 'customer' : n.kind === 'kitchen' || n.kind === 'allergy',
  );
  const sugeridas = destino === 'cocina' ? datos.sugeridas : [];
  if (configuradas.length === 0 && sugeridas.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-1 flex-wrap mt-1', className)} aria-label={t('rapidas')}>
      {configuradas.map((n) => (
        <button
          key={`n-${n.id}`}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onElegir(n.label, n.kind === 'allergy')}
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.6rem] font-medium border',
            n.kind === 'allergy'
              ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
              : n.kind === 'customer'
                ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
          )}
        >
          {n.label}
        </button>
      ))}
      {sugeridas.length > 0 && (
        <span className="text-[0.6rem] text-gray-400 dark:text-gray-500">{t('masUsadas')}</span>
      )}
      {sugeridas.map((s) => (
        <button
          key={`s-${s.texto}`}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onElegir(s.texto, false)}
          title={t('usos', { usos: s.usos })}
          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.6rem] font-medium border border-dashed bg-gray-50 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600"
        >
          {s.texto}
        </button>
      ))}
    </div>
  );
}
