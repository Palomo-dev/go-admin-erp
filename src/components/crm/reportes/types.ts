export interface ReportFilters {
  dateFrom: string | null;
  dateTo: string | null;
  channelId: string | null;
  pipelineId: string | null;
  agentId: string | null;
}

export interface ConversationStats {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  avgResponseTime: number;
  avgResolutionTime: number;
}

export interface ChannelMetrics {
  channelId: string;
  channelName: string;
  channelType: string;
  totalConversations: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
}

export interface PipelineMetrics {
  pipelineId: string;
  pipelineName: string;
  stages: StageMetrics[];
  totalOpportunities: number;
  totalValue: number;
  avgDealSize: number;
  conversionRate: number;
}

export interface StageMetrics {
  stageId: string;
  stageName: string;
  stageOrder: number;
  color: string;
  count: number;
  value: number;
  probability: number;
}

export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  status: string;
  totalContacts: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

export interface AgentMetrics {
  agentId: string;
  agentName: string;
  conversationsAssigned: number;
  conversationsResolved: number;
  avgResponseTime: number;
  activitiesCompleted: number;
}

export interface ReportData {
  conversationStats: ConversationStats;
  channelMetrics: ChannelMetrics[];
  pipelineMetrics: PipelineMetrics[];
  campaignMetrics: CampaignMetrics[];
  agentMetrics: AgentMetrics[];
}
