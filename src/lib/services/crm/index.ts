/**
 * Servicios CRM - FASE 1
 * Punto de entrada centralizado para los servicios CRM nuevos.
 */

export { verticalsService, default as verticalsServiceDefault, importVerticalTemplate } from './verticalsService';
export type { Vertical, VerticalInput, VerticalUpdateInput } from './verticalsService';

// FASE 1 Revenue OS - ICP y estructura comercial
export {
  getICPProfiles,
  createICPProfile,
  updateICPProfile,
  deleteICPProfile,
  evaluateICP,
  evaluateICPCriteria,
  assignICPBand,
} from './icpService';
export type {
  ICPOperator,
  ICPFieldKey,
  ICPCriterion,
  ICPProfile,
  ICPProfileInput,
  ICPProfileUpdateInput,
  ICPCriterionInput,
  ICPEvaluationResult,
  ICPAssignmentResult,
} from './icpService';

export {
  getSalesRoles,
  createSalesRole,
  updateSalesRole,
  deleteSalesRole,
  getSalesTeams,
  createSalesTeam,
  updateSalesTeam,
  deleteSalesTeam,
  getTeamMembers,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  getTerritories,
  createTerritory,
  updateTerritory,
  deleteTerritory,
} from './salesStructureService';
export type {
  SalesRole,
  SalesRoleInput,
  SalesRoleUpdateInput,
  SalesTeam,
  SalesTeamInput,
  SalesTeamUpdateInput,
  SalesTeamMember,
  TeamMemberInput,
  TeamMemberUpdateInput,
  Territory,
  TerritoryInput,
  TerritoryUpdateInput,
} from './salesStructureService';

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

// FASE 2 Parte B — Objeciones y Discovery
export {
  getObjections,
  createObjection,
  updateObjection,
  deleteObjection,
  getOpportunityObjections,
  addOpportunityObjection,
  resolveOpportunityObjection,
} from './objectionService';
export type {
  Objection,
  ObjectionInput,
  ObjectionUpdateInput,
  ObjectionFilters,
  OpportunityObjection,
  OpportunityObjectionInput,
} from './objectionService';

export {
  getDiscoveryTemplates,
  createDiscoveryTemplate,
  updateDiscoveryTemplate,
  deleteDiscoveryTemplate,
  getDiscoveryData,
  saveDiscoveryData,
  initializeDiscoveryFromTemplate,
} from './discoveryService';
export type {
  DiscoverySection,
  DiscoveryQuestion,
  DiscoveryAnswer,
  DiscoveryData,
  DiscoveryTemplate,
  DiscoveryTemplateInput,
  DiscoveryTemplateUpdateInput,
} from './discoveryService';

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

export {
  getReferralPrograms,
  createReferralProgram,
  updateReferralProgram,
  deleteReferralProgram,
  getReferrals,
  createReferral,
  updateReferralStatus,
  markRewardPaid,
} from './referralsService';
export type {
  ReferralProgram,
  ReferralProgramInput,
  ReferralProgramUpdateInput,
  Referral,
  ReferralInput,
  ReferralFilters,
} from './referralsService';
export type { Partner } from './partnerService';

export { commercialMetricsService, default as commercialMetricsServiceDefault } from './commercialMetricsService';
export type {
  Period,
  CommercialMetrics,
  VendorBreakdown,
  FunnelStageMetric,
  FunnelMetrics,
  RevenueMetricRPCRow,
  PipelineFunnelRPCRow,
  CohortRetentionRPCRow,
} from './commercialMetricsService';
export {
  getRevenueMetricsFromRPC,
  getPipelineFunnelFromRPC,
  getCohortRetentionFromRPC,
} from './commercialMetricsService';

// FASE 14 - Revenue OS
export { revenueOsService, default as revenueOsServiceDefault } from './revenueOsService';
export type {
  RevenueMetricRow,
  PipelineFunnelRow,
  CohortRetentionRow,
  RevenueKpis,
  RevenueDashboard,
  KpiCard,
} from './revenueOsService';

// FASE 9 - Ficha 360°
export {
  getDocuments,
  getDocument,
  uploadDocument,
  updateDocument,
  deleteDocument,
  getDownloadUrl,
  getDocumentFolders,
  createDocumentFolder,
  deleteDocumentFolder,
} from './documentService';
export type {
  CRMDocument,
  DocumentFolder,
  UploadDocumentInput,
  UpdateDocumentInput,
  CreateFolderInput,
  DocumentFilters,
  FolderFilters,
  DocumentRelatedType,
} from './documentService';

export { getTimeline } from './timelineService';
export type {
  TimelineEntityType,
  TimelineEntryType,
  TimelineEntry,
  TimelineFilters,
  TimelineResult,
} from './timelineService';

export {
  getCustomerFinance360,
  getOpportunityFinance360,
} from './crmFinanceService';
export type {
  InvoiceSalesRow,
  PaymentRow,
  AccountsReceivableRow,
  CommissionRow,
  CreditNoteRow,
  QuotationFinanceRow,
  CustomerFinance360,
  OpportunityFinance360,
} from './crmFinanceService';

// FASE 10 - Propuesta, contrato y pago
export {
  getDemos,
  createDemo,
  updateDemo,
  getDemo,
} from './demoService';
export type {
  DemoSession,
  Attendee,
  ChecklistItem,
  CreateDemoInput,
  UpdateDemoInput,
  DemoFilters,
  DemoStatus,
} from './demoService';

export {
  getRoiCalculators,
  createRoiCalculator,
  updateRoiCalculator,
  deleteRoiCalculator,
  calculateRoi,
} from './roiService';
export type {
  RoiCalculator,
  RoiInputDef,
  RoiOutputDef,
  RoiFormula,
  RoiFormulaOperation,
  CreateRoiInput,
  UpdateRoiInput,
  RoiCalculationResult,
} from './roiService';

export {
  getContracts,
  createContract,
  getContract,
  updateContractStatus,
  handleContractWebhook,
} from './contractService';
export type {
  ContractSignature,
  ContractSigner,
  ContractStatus,
  CreateContractInput,
  ContractFilters,
  DocumensoWebhookPayload,
} from './contractService';

export { registerCrmPayment } from './paymentService';
export type {
  RegisterPaymentInput,
  RegisterPaymentResult,
} from './paymentService';
