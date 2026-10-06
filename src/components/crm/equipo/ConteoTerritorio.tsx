'use client';

/**
 * Clientes de un territorio (Figma CRM 1411:838455): «1.284 clientes · 37 en
 * varios territorios», con el mismo motor que la asignación automática.
 */
import { useTranslations } from 'next-intl';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { notaTerritorio, type ConteoTerritorioUi } from './simulacionLogica';

export function ConteoTerritorio({ conteo, cargando }: { conteo: ConteoTerritorioUi | undefined; cargando: boolean }) {
  const t = useTranslations('crm.equipoAsignacion.territorios');
  const entero = useFormatoEntero();
  if (cargando) return <div aria-hidden="true" className="h-4 w-32 animate-pulse rounded bg-subtle" />;
  if (!conteo) return null;
  const nota = notaTerritorio(conteo);
  return (
    <div className="space-y-0.5">
      {!conteo.sinReglas && <p className="text-[13px] font-medium text-fg">{t('clientes', { n: conteo.clientes, valor: entero(conteo.clientes) })}</p>}
      {nota && <p className="text-xs text-fg-secondary">{t(`notas.${nota}`, { n: entero(conteo.solapados) })}</p>}
    </div>
  );
}
