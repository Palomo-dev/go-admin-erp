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
