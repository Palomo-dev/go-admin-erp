import { supabase } from '@/lib/supabase/config';
import type { 
  ReportFilters, 
  ReportData, 
  ConversationStats, 
  ChannelMetrics, 
  PipelineMetrics, 
  CampaignMetrics 
} from './types';

class ReportesService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getConversationStats(filters: ReportFilters): Promise<ConversationStats> {
    let query = supabase
      .from('conversations')
      .select('id, status, created_at, updated_at, first_response_time_seconds, avg_response_time_seconds')
      .eq('organization_id', this.organizationId);

    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }
    if (filters.channelId) {
      query = query.eq('channel_id', filters.channelId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching conversation stats:', error);
      return {
        total: 0,
        open: 0,
        pending: 0,
        resolved: 0,
        closed: 0,
        avgResponseTime: 0,
        avgResolutionTime: 0
      };
    }

    const conversations = data || [];
    const stats: ConversationStats = {
      total: conversations.length,
      open: conversations.filter(c => c.status === 'open').length,
      pending: conversations.filter(c => c.status === 'pending').length,
      resolved: conversations.filter(c => c.status === 'resolved').length,
      closed: conversations.filter(c => c.status === 'closed').length,
      avgResponseTime: 0,
      avgResolutionTime: 0
    };

    // Calcular tiempo promedio de primera respuesta (en minutos)
    const withResponse = conversations.filter(c => c.first_response_time_seconds != null);
    if (withResponse.length > 0) {
      const totalSeconds = withResponse.reduce((acc, c) => acc + (c.first_response_time_seconds || 0), 0);
      stats.avgResponseTime = Math.round(totalSeconds / withResponse.length / 60); // segundos a minutos
    }

    // Calcular tiempo promedio de resolución (en horas)
    const resolved = conversations.filter(c => 
      (c.status === 'resolved' || c.status === 'closed') && c.updated_at && c.created_at
    );
    if (resolved.length > 0) {
      const totalResolutionTime = resolved.reduce((acc, c) => {
        const created = new Date(c.created_at).getTime();
        const updated = new Date(c.updated_at).getTime();
        return acc + (updated - created);
      }, 0);
      stats.avgResolutionTime = Math.round(totalResolutionTime / resolved.length / 3600000); // ms a horas
    }

    return stats;
  }

  async getChannelMetrics(filters: ReportFilters): Promise<ChannelMetrics[]> {
    const { data: channels } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', this.organizationId);

    if (!channels) return [];

    const metrics: ChannelMetrics[] = [];

    for (const channel of channels) {
      let convQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact' })
        .eq('organization_id', this.organizationId)
        .eq('channel_id', channel.id);

      let msgQuery = supabase
        .from('messages')
        .select('id', { count: 'exact' })
        .eq('organization_id', this.organizationId)
        .eq('channel_id', channel.id);

      if (filters.dateFrom) {
        convQuery = convQuery.gte('created_at', filters.dateFrom);
        msgQuery = msgQuery.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        convQuery = convQuery.lte('created_at', filters.dateTo);
        msgQuery = msgQuery.lte('created_at', filters.dateTo);
      }

      const [convResult, msgResult] = await Promise.all([convQuery, msgQuery]);
      
      const totalConversations = convResult.count || 0;
      const totalMessages = msgResult.count || 0;

      metrics.push({
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
        totalConversations,
        totalMessages,
        avgMessagesPerConversation: totalConversations > 0 
          ? Math.round(totalMessages / totalConversations * 10) / 10 
          : 0
      });
    }

    return metrics;
  }

  async getPipelineMetrics(filters: ReportFilters): Promise<PipelineMetrics[]> {
    let pipelineQuery = supabase
      .from('pipelines')
      .select('id, name')
      .eq('organization_id', this.organizationId);

    if (filters.pipelineId) {
      pipelineQuery = pipelineQuery.eq('id', filters.pipelineId);
    }

    const { data: pipelines } = await pipelineQuery;
    if (!pipelines) return [];

    const metrics: PipelineMetrics[] = [];

    for (const pipeline of pipelines) {
      const { data: stages } = await supabase
        .from('stages')
        .select('id, name, display_order, color, probability')
        .eq('pipeline_id', pipeline.id)
        .order('display_order');

      let oppQuery = supabase
        .from('opportunities')
        .select('id, stage_id, amount')
        .eq('organization_id', this.organizationId)
        .eq('pipeline_id', pipeline.id);

      if (filters.dateFrom) {
        oppQuery = oppQuery.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        oppQuery = oppQuery.lte('created_at', filters.dateTo);
      }

      const { data: opportunities } = await oppQuery;
      const opps = opportunities || [];
      const stageList = stages || [];

      const stageMetrics = stageList.map(stage => {
        const stageOpps = opps.filter(o => o.stage_id === stage.id);
        return {
          stageId: stage.id,
          stageName: stage.name,
          stageOrder: stage.display_order,
          color: stage.color || '#3B82F6',
          count: stageOpps.length,
          value: stageOpps.reduce((acc, o) => acc + (o.amount || 0), 0),
          probability: stage.probability || 0
        };
      });

      const totalValue = opps.reduce((acc, o) => acc + (o.amount || 0), 0);
      const wonStage = stageList.find(s => s.probability === 100);
      const wonOpps = wonStage 
        ? opps.filter(o => o.stage_id === wonStage.id).length 
        : 0;

      metrics.push({
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        stages: stageMetrics,
        totalOpportunities: opps.length,
        totalValue,
        avgDealSize: opps.length > 0 ? Math.round(totalValue / opps.length) : 0,
        conversionRate: opps.length > 0 ? Math.round(wonOpps / opps.length * 100) : 0
      });
    }

    return metrics;
  }

  async getCampaignMetrics(filters: ReportFilters): Promise<CampaignMetrics[]> {
    let query = supabase
      .from('campaigns')
      .select('id, name, status')
      .eq('organization_id', this.organizationId);

    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    const { data: campaigns } = await query;
    if (!campaigns) return [];

    const metrics: CampaignMetrics[] = [];

    for (const campaign of campaigns) {
      const { data: contacts } = await supabase
        .from('campaign_contacts')
        .select('*')
        .eq('campaign_id', campaign.id);

      const contactList = contacts || [];
      const total = contactList.length;
      const sent = contactList.filter(c => c.sent_at).length;
      const opened = contactList.filter(c => c.opened_at).length;
      const clicked = contactList.filter(c => c.clicked_at).length;
      const replied = contactList.filter(c => c.replied_at).length;
      const bounced = contactList.filter(c => c.bounced_at).length;

      metrics.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: campaign.status,
        totalContacts: total,
        sent,
        opened,
        clicked,
        replied,
        bounced,
        openRate: sent > 0 ? Math.round(opened / sent * 100) : 0,
        clickRate: opened > 0 ? Math.round(clicked / opened * 100) : 0,
        replyRate: sent > 0 ? Math.round(replied / sent * 100) : 0
      });
    }

    return metrics;
  }

  async getChannels() {
    const { data } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', this.organizationId)
      .order('name');
    return data || [];
  }

  async getPipelines() {
    const { data } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .order('name');
    return data || [];
  }

  async getAgents() {
    const { data } = await supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        profiles:user_id(full_name, email)
      `)
      .eq('organization_id', this.organizationId)
      .eq('is_active', true);
    
    return (data || []).map((m: any) => ({
      id: m.user_id,
      name: m.profiles?.full_name || m.profiles?.email || 'Sin nombre'
    }));
  }

  async exportToCSV(data: any[], filename: string): Promise<void> {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => {
          const val = row[h];
          if (typeof val === 'string' && val.includes(',')) {
            return `"${val}"`;
          }
          return val ?? '';
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }
}

export const createReportesService = (organizationId: number) => new ReportesService(organizationId);
export default ReportesService;
