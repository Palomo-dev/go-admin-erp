'use client';

import { OnboardingChecklist } from '@/components/crm/postventa/OnboardingChecklist';
import type { DrawerTabProps } from './types';

/**
 * Pestaña Onboarding (F11): solo se monta en oportunidades del pipeline de
 * onboarding (`isOnboardingOpportunity`). Al completar, la oportunidad se
 * mueve a la etapa `is_won` en el servidor y se refresca la ficha.
 */
export function OnboardingTab({ opportunity, active, data, onMutated }: DrawerTabProps & { onMutated?: () => void }) {
  if (!active) return null;
  return (
    <OnboardingChecklist
      opportunityId={opportunity.id}
      active={active}
      onCompleted={() => { void data.refetch.opportunity(); onMutated?.(); }}
    />
  );
}
