import { supabase } from '@/lib/supabase/config';
import {
  CRMFilters,
  KPIData,
  FunnelData,
  ActivityByDay,
  MessagesByChannel,
  TopAgent,
  TopChannel,
  TopOpportunity,
  DashboardData,
  Channel,
  Pipeline,
  Agent,
  PipelineStageData,
} from './types';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

class CRMDashboardService {
  // Obtener KPIs principales
  async getKPIs(organizationId: number, filters: CRMFilters): Promise<KPIData> {
    const dateFrom = filters.dateRange.from || subDays(new Date(), 30);
    const dateTo = filters.dateRange.to || new Date();

    // Conversaciones abiertas
    let conversationsQuery = supabase
      .from('conversations')
      .select('id, status, first_response_time_seconds', { count: 'exact' })
      .eq('organization_id', organizationId)
      .in('status', ['open', 'pending']);

    if (filters.channelId) {
      conversationsQuery = conversationsQuery.eq('channel_id', filters.channelId);
    }
    if (filters.agentId) {
      conversationsQuery = conversationsQuery.eq('assigned_member_id', filters.agentId);
    }

    const { data: conversationsData, count: conversationsCount } = await conversationsQuery;

    // Calcular tiempo promedio de respuesta
    const responseTimes = conversationsData
      ?.filter(c => c.first_response_time_seconds)
      .map(c => c.first_response_time_seconds) || [];
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Conversaciones pendientes
    const { count: pendingCount } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    // Oportunidades abiertas
    let opportunitiesQuery = supabase
      .from('opportunities')
      .select('id, amount, currency')
      .eq('organization_id', organizationId)
      .eq('status', 'open');

    if (filters.pipelineId) {
      opportunitiesQuery = opportunitiesQuery.eq('pipeline_id', filters.pipelineId);
    }

    const { data: opportunitiesData } = await opportunitiesQuery;
    const opportunitiesOpen = opportunitiesData?.length || 0;
    const opportunitiesValue = opportunitiesData?.reduce((sum, o) => sum + (o.amount || 0), 0) || 0;

    // Pronóstico del mes (oportunidades que cierran este mes)
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    
    const { data: forecastData } = await supabase
      .from('opportunities')
      .select('amount, stages!inner(probability)')
      .eq('organization_id', organizationId)
      .eq('status', 'open')
      .gte('expected_close_date', format(monthStart, 'yyyy-MM-dd'))
      .lte('expected_close_date', format(monthEnd, 'yyyy-MM-dd'));

    const monthForecast = forecastData?.reduce((sum, o) => {
      const probability = (o.stages as any)?.probability || 0;
      return sum + ((o.amount || 0) * (probability / 100));
    }, 0) || 0;

    // Campañas activas
    const { count: activeCampaigns } = await supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', ['scheduled', 'sending', 'sent']);

    // Clientes nuevos en el periodo
    const { count: newCustomers } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', format(dateFrom, 'yyyy-MM-dd'))
      .lte('created_at', format(dateTo, 'yyyy-MM-dd'));

    // Total de clientes
    const { count: totalCustomers } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    // Calcular SLA (% de conversaciones con respuesta < 5 min)
    const slaThreshold = 300; // 5 minutos en segundos
    const withinSLA = responseTimes.filter(t => t <= slaThreshold).length;
    const slaCompliance = responseTimes.length > 0
      ? (withinSLA / responseTimes.length) * 100
      : 100;

    return {
      conversationsOpen: conversationsCount || 0,
      conversationsPending: pendingCount || 0,
      avgResponseTime,
      slaCompliance,
      opportunitiesOpen,
      opportunitiesValue,
      monthForecast,
      activeCampaigns: activeCampaigns || 0,
      newCustomers: newCustomers || 0,
      totalCustomers: totalCustomers || 0,
    };
  }

  // Obtener datos del embudo de ventas
  async getFunnelData(organizationId: number, pipelineId?: string): Promise<FunnelData> {
    // Obtener pipeline (usar default si no se especifica)
    let pipeline = pipelineId;
    if (!pipeline) {
      const { data: defaultPipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_default', true)
        .single();
      pipeline = defaultPipeline?.id;
    }

    if (!pipeline) {
      return { stages: [], totalValue: 0, weightedValue: 0 };
    }

    // Obtener etapas con oportunidades
    const { data: stages } = await supabase
      .from('stages')
      .select('id, name, position, probability, color')
      .eq('pipeline_id', pipeline)
      .order('position', { ascending: true });

    if (!stages) {
      return { stages: [], totalValue: 0, weightedValue: 0 };
    }

    // Contar oportunidades por etapa
    const stagesData: PipelineStageData[] = [];
    let totalValue = 0;
    let weightedValue = 0;

    for (const stage of stages) {
      const { data: opportunities } = await supabase
        .from('opportunities')
        .select('amount')
        .eq('organization_id', organizationId)
        .eq('stage_id', stage.id)
        .eq('status', 'open');

      const count = opportunities?.length || 0;
      const value = opportunities?.reduce((sum, o) => sum + (o.amount || 0), 0) || 0;

      stagesData.push({
        id: stage.id,
        name: stage.name,
        color: stage.color || '#3b82f6',
        count,
        value,
        probability: stage.probability || 0,
      });

      totalValue += value;
      weightedValue += value * ((stage.probability || 0) / 100);
    }

    return { stages: stagesData, totalValue, weightedValue };
  }

  // Obtener actividad por día
  async getActivityByDay(organizationId: number, filters: CRMFilters): Promise<ActivityByDay[]> {
    const dateFrom = filters.dateRange.from || subDays(new Date(), 7);
    const dateTo = filters.dateRange.to || new Date();

    const result: ActivityByDay[] = [];
    let currentDate = new Date(dateFrom);

    while (currentDate <= dateTo) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const nextDate = format(new Date(currentDate.getTime() + 86400000), 'yyyy-MM-dd');

      // Conversaciones creadas ese día
      const { count: conversations } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', dateStr)
        .lt('created_at', nextDate);

      // Mensajes ese día
      const { count: messages } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', dateStr)
        .lt('created_at', nextDate);

      // Oportunidades creadas ese día
      const { count: opportunities } = await supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', dateStr)
        .lt('created_at', nextDate);

      // Actividades ese día
      const { count: activities } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', dateStr)
        .lt('created_at', nextDate);

      result.push({
        date: dateStr,
        conversations: conversations || 0,
        messages: messages || 0,
        opportunities: opportunities || 0,
        activities: activities || 0,
      });

      currentDate = new Date(currentDate.getTime() + 86400000);
    }

    return result;
  }

  // Obtener mensajes por canal
  async getMessagesByChannel(organizationId: number): Promise<MessagesByChannel[]> {
    const { data: channels } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', organizationId);

    if (!channels) return [];

    const result: MessagesByChannel[] = [];
    let totalMessages = 0;

    for (const channel of channels) {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('channel_id', channel.id);

      result.push({
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
        count: count || 0,
        percentage: 0,
      });
      totalMessages += count || 0;
    }

    // Calcular porcentajes
    return result.map(r => ({
      ...r,
      percentage: totalMessages > 0 ? (r.count / totalMessages) * 100 : 0,
    }));
  }

  // Obtener top agentes
  async getTopAgents(organizationId: number, limit: number = 5): Promise<TopAgent[]> {
    const { data: members } = await supabase
      .from('organization_members')
      .select(`
        id,
        profiles!inner(first_name, last_name, email)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (!members) return [];

    const result: TopAgent[] = [];

    for (const member of members) {
      const { count: conversationsCount } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('assigned_member_id', member.id);

      const { count: resolvedCount } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('assigned_member_id', member.id)
        .eq('status', 'resolved');

      const { data: conversations } = await supabase
        .from('conversations')
        .select('first_response_time_seconds')
        .eq('organization_id', organizationId)
        .eq('assigned_member_id', member.id)
        .not('first_response_time_seconds', 'is', null);

      const responseTimes = conversations?.map(c => c.first_response_time_seconds) || [];
      const avgResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      const profile = member.profiles as any;
      result.push({
        memberId: member.id,
        name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Sin nombre',
        email: profile?.email || '',
        conversationsCount: conversationsCount || 0,
        avgResponseTime,
        resolvedCount: resolvedCount || 0,
      });
    }

    return result
      .sort((a, b) => b.conversationsCount - a.conversationsCount)
      .slice(0, limit);
  }

  // Obtener top canales
  async getTopChannels(organizationId: number, limit: number = 5): Promise<TopChannel[]> {
    const { data: channels } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', organizationId);

    if (!channels) return [];

    const result: TopChannel[] = [];

    for (const channel of channels) {
      const { count: messagesCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('channel_id', channel.id);

      const { count: conversationsCount } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('channel_id', channel.id);

      result.push({
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
        messagesCount: messagesCount || 0,
        conversationsCount: conversationsCount || 0,
      });
    }

    return result
      .sort((a, b) => b.messagesCount - a.messagesCount)
      .slice(0, limit);
  }

  // Obtener oportunidades próximas a cerrar
  async getTopOpportunities(organizationId: number, limit: number = 5): Promise<TopOpportunity[]> {
    const { data: opportunities } = await supabase
      .from('opportunities')
      .select(`
        id,
        name,
        amount,
        currency,
        expected_close_date,
        customers!inner(first_name, last_name),
        stages!inner(name, color, probability)
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'open')
      .not('expected_close_date', 'is', null)
      .order('expected_close_date', { ascending: true })
      .limit(limit);

    return (opportunities || []).map(o => ({
      id: o.id,
      name: o.name,
      customerName: `${(o.customers as any)?.first_name || ''} ${(o.customers as any)?.last_name || ''}`.trim(),
      amount: o.amount || 0,
      currency: o.currency || 'USD',
      expectedCloseDate: o.expected_close_date,
      stageName: (o.stages as any)?.name || '',
      stageColor: (o.stages as any)?.color || '#3b82f6',
      probability: (o.stages as any)?.probability || 0,
    }));
  }

  // Obtener todos los datos del dashboard
  async getDashboardData(organizationId: number, filters: CRMFilters): Promise<DashboardData> {
    const [
      kpis,
      funnel,
      activityByDay,
      messagesByChannel,
      topAgents,
      topChannels,
      topOpportunities,
    ] = await Promise.all([
      this.getKPIs(organizationId, filters),
      this.getFunnelData(organizationId, filters.pipelineId || undefined),
      this.getActivityByDay(organizationId, filters),
      this.getMessagesByChannel(organizationId),
      this.getTopAgents(organizationId),
      this.getTopChannels(organizationId),
      this.getTopOpportunities(organizationId),
    ]);

    return {
      kpis,
      funnel,
      activityByDay,
      messagesByChannel,
      topAgents,
      topChannels,
      topOpportunities,
    };
  }

  // Obtener lista de canales para filtros
  async getChannels(organizationId: number): Promise<Channel[]> {
    const { data } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', organizationId)
      .order('name');

    return (data || []).map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
    }));
  }

  // Obtener lista de pipelines para filtros
  async getPipelines(organizationId: number): Promise<Pipeline[]> {
    const { data } = await supabase
      .from('pipelines')
      .select('id, name, is_default')
      .eq('organization_id', organizationId)
      .order('name');

    return (data || []).map(p => ({
      id: p.id,
      name: p.name,
      isDefault: p.is_default,
    }));
  }

  // Obtener lista de agentes para filtros
  async getAgents(organizationId: number): Promise<Agent[]> {
    const { data } = await supabase
      .from('organization_members')
      .select(`
        id,
        profiles!inner(first_name, last_name, email)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    return (data || []).map(m => {
      const profile = m.profiles as any;
      return {
        id: m.id,
        name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Sin nombre',
        email: profile?.email || '',
      };
    });
  }
}

export const crmDashboardService = new CRMDashboardService();
