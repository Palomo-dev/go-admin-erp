'use client';

/** Estado vacío con propósito (brief §3): una frase, la acción principal. */

import { Plus, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FadeIn } from '@/components/shared/motion';

interface Props {
  filtered: boolean;
  hasProgram: boolean;
  onRegister: () => void;
  onClearFilters: () => void;
}

export function ReferralsEmptyState({ filtered, hasProgram, onRegister, onClearFilters }: Props) {
  if (filtered) {
    return (
      <FadeIn className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
        <p className="font-medium text-gray-900 dark:text-gray-100">Ningún referido coincide con los filtros</p>
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>Quitar filtros</Button>
      </FadeIn>
    );
  }
  return (
    <FadeIn className="mx-auto max-w-xl rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/60">
        <UsersRound className="h-7 w-7 text-blue-600 dark:text-blue-400" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Tus mejores leads los traen tus clientes</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Registra a quién recomendó cada cliente, sigue el contacto hasta convertirlo en lead y deja constancia de la recompensa del programa.
        {!hasProgram && ' Aún no hay un programa activo: puedes registrar referidos igual y crear el programa cuando quieras.'}
      </p>
      <Button type="button" className="mt-5 bg-blue-600 text-white hover:bg-blue-700" onClick={onRegister}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Registrar el primer referido
      </Button>
    </FadeIn>
  );
}
