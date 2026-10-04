import type { AutomationTriggerType } from '../automationService';

/** Shared event mapping for live dispatch and read-only simulation. */
export function triggerTypeForEvent(eventType: string): AutomationTriggerType {
  if (eventType === 'opportunity.stage_changed' || eventType === 'opportunity.won' || eventType === 'opportunity.lost') return 'stage_change';
  if (eventType === 'opportunity.updated' || eventType === 'opportunity.field_changed') return 'field_change';
  return 'event';
}
