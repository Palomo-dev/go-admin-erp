// Tipos para el Dashboard del CRM

export interface CRMFilters {
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
  channelId: string | null;
  pipelineId: string | null;
  agentId: string | null;
  branchId: number | null;
}

export interface KPIData {
  conversationsOpen: number;
  conversationsPending: number;
  avgResponseTime: number; // en segundos
  slaCompliance: number; // porcentaje
  opportunitiesOpen: number;
  opportunitiesValue: number;
  monthForecast: number;
  activeCampaigns: number;
  newCustomers: number;
  totalCustomers: number;
}

export interface PipelineStageData {
  id: string;
  name: string;
  color: string;
  count: number;
  value: number;
  probability: number;
}

export interface FunnelData {
  stages: PipelineStageData[];
  totalValue: number;
  weightedValue: number;
}

export interface ActivityByDay {
  date: string;
  conversations: number;
  messages: number;
  opportunities: number;
  activities: number;
}

export interface MessagesByChannel {
  channelId: string;
  channelName: string;
  channelType: string;
  count: number;
  percentage: number;
}

export interface TopAgent {
  memberId: number;
  name: string;
  email: string;
  conversationsCount: number;
  avgResponseTime: number;
  resolvedCount: number;
}

export interface TopChannel {
  channelId: string;
  channelName: string;
  channelType: string;
  messagesCount: number;
  conversationsCount: number;
}

export interface TopOpportunity {
  id: string;
  name: string;
  customerName: string;
  amount: number;
  currency: string;
  expectedCloseDate: string;
  stageName: string;
  stageColor: string;
  probability: number;
}

export interface DashboardData {
  kpis: KPIData;
  funnel: FunnelData;
  activityByDay: ActivityByDay[];
  messagesByChannel: MessagesByChannel[];
  topAgents: TopAgent[];
  topChannels: TopChannel[];
  topOpportunities: TopOpportunity[];
}

export interface Channel {
  id: string;
  name: string;
  type: string;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface Agent {
  id: number;
  name: string;
  email: string;
}

export interface Branch {
  id: number;
  name: string;
}
