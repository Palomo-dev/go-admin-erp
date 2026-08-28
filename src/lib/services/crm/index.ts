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

// FASE 4 - Post-venta del CRM
export { onboardingService, default as onboardingServiceDefault } from './onboardingService';
export type {
  OnboardingStep,
  OnboardingTemplate,
  OnboardingTask,
} from './onboardingService';

export { healthScoreService, default as healthScoreServiceDefault } from './healthScoreService';
export type {
  HealthBand,
  HealthThreshold,
  HealthIndicator,
  HealthBands,
  HealthScoreConfig,
  CustomerHealth,
  HealthScoreResult,
  HealthSnapshot,
} from './healthScoreService';

export { renewalService, default as renewalServiceDefault } from './renewalService';
export type {
  UpcomingRenewal,
} from './renewalService';

export { expansionService, default as expansionServiceDefault } from './expansionService';
export type {
  ExpansionType,
  ExpansionSignal,
} from './expansionService';

// FASE 5 - Escala del CRM
export { followupEngineService, default as followupEngineServiceDefault } from './followupEngineService';
export type {
  AutomationTrigger,
  AutomationAction,
  AutomationActions,
  Automation,
  TriggerContext,
  ExecutionResult,
  RunResult,
} from './followupEngineService';

export { referralsService, default as referralsServiceDefault } from './referralsService';
export type {
  ReferralProgramConfig,
  Referral,
  Partner,
  CreateReferralInput,
} from './referralsService';

export { commercialMetricsService, default as commercialMetricsServiceDefault } from './commercialMetricsService';
export type {
  Period,
  CommercialMetrics,
  VendorBreakdown,
  FunnelStageMetric,
  FunnelMetrics,
} from './commercialMetricsService';
