/**
 * Servicios CRM - FASE 1
 * Punto de entrada centralizado para los servicios CRM nuevos.
 */

export { verticalsService, default as verticalsServiceDefault } from './verticalsService';
export type { Vertical, VerticalInput, VerticalUpdateInput } from './verticalsService';

export { lossReasonsService, default as LossReasonsServiceDefault } from './lossReasonsService';
export type { LossReason, LossReasonInput, LossReasonUpdateInput } from './lossReasonsService';

export { scoringService, default as ScoringServiceDefault } from './scoringService';
export type {
  Temperature,
  ScoringOption,
  ScoringIndicator,
  ScoringBand,
  ScoringBands,
  ScoringConfig,
  ScoreAnswer,
  ScoreResult,
} from './scoringService';

export { stageGateService, default as StageGateServiceDefault } from './stageGateService';
export type {
  RequirementType,
  StageRequirement,
  ExitCriteria,
  StageGateResult,
  StageWithCriteria,
} from './stageGateService';

export { commissionService, default as CommissionServiceDefault } from './commissionService';
export type {
  CommissionRate,
  CommissionRateInput,
  CommissionAccrualResult,
  SimulationResult,
  VendorCommissionRate,
} from './commissionService';

export { pipelineSeedService, default as pipelineSeedServiceDefault } from './pipelineSeedService';

// FASE 2 - Flujo vivo del CRM
export { leadCaptureService, default as leadCaptureServiceDefault } from './leadCaptureService';
export type { EnsureLeadInput, EnsureLeadResult } from './leadCaptureService';

export { followupService, default as followupServiceDefault } from './followupService';
export type {
  OverdueFollowup,
  StaleOpportunity,
  LeadWithoutContact,
  ScheduleNextContactInput,
} from './followupService';

export { crmIntegrations, default as crmIntegrationsDefault } from './crmIntegrations';
export type {
  PosSaleIntegrationInput,
  ActivityCalendarInput,
  CrmNotificationType,
} from './crmIntegrations';

// FASE 3 - Cierre conectado al dinero
export { proposalService, default as proposalServiceDefault } from './proposalService';
export type {
  ProposalSections,
  Proposal,
  GenerateProposalResult,
} from './proposalService';

// FASE 3 Parte B - Cierre conectado al dinero
export { posCrmLink, default as posCrmLinkDefault } from './posCrmLink';
export type {
  OpportunityProductRow as PosOpportunityProductRow,
  OpportunityRow as PosOpportunityRow,
  CreatePosSaleFromOpportunityResult,
} from './posCrmLink';

export { pmsCrmLink, default as pmsCrmLinkDefault } from './pmsCrmLink';
export type {
  OpportunitySpaceRow,
  OpportunityRow as PmsOpportunityRow,
  CreateReservationFromOpportunityResult,
} from './pmsCrmLink';

export { inventoryCrmLink, default as inventoryCrmLinkDefault } from './inventoryCrmLink';
export type {
  ReserveStockResult,
} from './inventoryCrmLink';
