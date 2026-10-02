'use client';

import {useRedText} from '@/components/crm/red/useRedText';

/** Estado vacío con propósito (brief §3): una frase, la acción principal. */

import { Plus, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FadeIn } from '@/components/shared/motion';

interface Props {
  filtered: boolean;
  canRegister?: boolean;
  hasProgram: boolean;
  onRegister: () => void;
  onClearFilters: () => void;
}

export function ReferralsEmptyState({ filtered, canRegister = true, hasProgram, onRegister, onClearFilters }: Props) {
  const {tr} = useRedText();
  if (filtered) {
    return (
      <FadeIn className="rounded-xl border border-dashed border-line-strong p-8 text-center ">
        <p className="font-medium text-fg ">{tr("Ningún referido coincide con los filtros")}</p>
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>{tr("Quitar filtros")}</Button>
      </FadeIn>
    );
  }
  return (
    <FadeIn className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-8 text-center shadow-sm  ">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-subtle ">
        <UsersRound className="h-7 w-7 text-brand " aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-fg ">{tr("Tus mejores leads los traen tus clientes")}</h2>
      <p className="mt-1 text-sm text-fg-secondary ">
         {tr("Registra a quién recomendó cada cliente, sigue el contacto hasta convertirlo en lead y deja constancia de la recompensa del programa.")} {!hasProgram && tr(' Aún no hay un programa activo: puedes registrar referidos igual y crear el programa cuando quieras.')}
      </p>
      <Button type="button" className="mt-5 bg-brand text-white hover:bg-brand-hover" disabled={!canRegister} onClick={onRegister}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />  {tr("Registrar el primer referido")} </Button>
    </FadeIn>
  );
}
