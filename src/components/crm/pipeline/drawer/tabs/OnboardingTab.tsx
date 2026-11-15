'use client';

import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { PestanaOnboarding } from '@/components/crm/oportunidad/pestanas/PestanaOnboarding';
import type { DrawerTabProps } from './types';

/**
 * Pestaña Onboarding (F11; Figma 822:237627): solo se monta en oportunidades
 * del pipeline de onboarding (`isOnboardingOpportunity`). Al completar, la
 * oportunidad pasa a la etapa `is_won` en el servidor y se refresca la ficha.
 */
export function OnboardingTab({ opportunity, active, data, onMutated }: DrawerTabProps & { onMutated?: () => void }) {
  const cat = useCatalogosCrm();
  if (!active) return null;
  return <PestanaOnboarding oportunidadId={opportunity.id} usuarios={cat.usuarios} onCompletado={() => { void data.refetch.opportunity(); onMutated?.(); }} />;
}
