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
        .maybeSingle();
      pipeline = defaultPipeline?.id;
    }

    if (!pipeline) {
      return { stages: [], totalValue: 0, weightedValue: 0 };
    }

    // Obtener etapas del pipeline
    const { data: stages } = await supabase
      .from('stages')
      .select('id, name, position, probability, color')
      .eq('pipeline_id', pipeline)
      .order('position', { ascending: true });

    if (!stages || stages.length === 0) {
      return { stages: [], totalValue: 0, weightedValue: 0 };
    }

    // Consulta batch: obtener todas las oportunidades de las etapas en una sola consulta
    const stageIds = stages.map(s => s.id);
    const { data: allOpportunities } = await supabase
      .from('opportunities')
      .select('stage_id, amount')
      .eq('organization_id', organizationId)
      .in('stage_id', stageIds)
      .eq('status', 'open');

    // Agrupar oportunidades por etapa en memoria
    const opportunitiesByStage = new Map<string, { count: number; value: number }>();
    for (const opp of allOpportunities || []) {
      const existing = opportunitiesByStage.get(opp.stage_id) || { count: 0, value: 0 };
      existing.count++;
      existing.value += opp.amount || 0;
      opportunitiesByStage.set(opp.stage_id, existing);
    }

    const stagesData: PipelineStageData[] = stages.map(stage => {
      const data = opportunitiesByStage.get(stage.id) || { count: 0, value: 0 };
      return {
        id: stage.id,
        name: stage.name,
        color: stage.color || '#3b82f6',
        count: data.count,
        value: data.value,
        probability: stage.probability || 0,
      };
    });

    const totalValue = stagesData.reduce((sum, s) => sum + s.value, 0);
    const weightedValue = stagesData.reduce((sum, s) => sum + s.value * ((s.probability) / 100), 0);

    return { stages: stagesData, totalValue, weightedValue };
  }

  // Obtener actividad por día (optimizado: 4 consultas batch en lugar de N*4)
  async getActivityByDay(organizationId: number, filters: CRMFilters): Promise<ActivityByDay[]> {
    const dateFrom = filters.dateRange.from || subDays(new Date(), 7);
    const dateTo = filters.dateRange.to || new Date();
    const dateFromStr = format(dateFrom, 'yyyy-MM-dd');
    const dateToStr = format(new Date(dateTo.getTime() + 86400000), 'yyyy-MM-dd');

    // Generar todas las fechas del rango
    const dateMap = new Map<string, ActivityByDay>();
    let currentDate = new Date(dateFrom);
    while (currentDate <= dateTo) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      dateMap.set(dateStr, {
        date: dateStr,
        conversations: 0,
        messages: 0,
        opportunities: 0,
        activities: 0,
      });
      currentDate = new Date(currentDate.getTime() + 86400000);
    }

    // 4 consultas batch en paralelo (una por tabla) en lugar de 4*N secuenciales
    const [conversationsRes, messagesRes, opportunitiesRes, activitiesRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', dateFromStr)
        .lt('created_at', dateToStr),
      supabase
        .from('messages')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', dateFromStr)
        .lt('created_at', dateToStr),
      supabase
        .from('opportunities')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', dateFromStr)
        .lt('created_at', dateToStr),
      supabase
        .from('activities')
        .select('created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', dateFromStr)
        .lt('created_at', dateToStr),
    ]);

    // Agrupar por fecha en memoria
    const countByDate = (data: any[] | null) => {
      const counts = new Map<string, number>();
      for (const row of data || []) {
        const dateStr = format(new Date(row.created_at), 'yyyy-MM-dd');
        counts.set(dateStr, (counts.get(dateStr) || 0) + 1);
      }
      return counts;
    };

    const convCounts = countByDate(conversationsRes.data);
    const msgCounts = countByDate(messagesRes.data);
    const oppCounts = countByDate(opportunitiesRes.data);
    const actCounts = countByDate(activitiesRes.data);

    for (const [dateStr, entry] of dateMap) {
      entry.conversations = convCounts.get(dateStr) || 0;
      entry.messages = msgCounts.get(dateStr) || 0;
      entry.opportunities = oppCounts.get(dateStr) || 0;
      entry.activities = actCounts.get(dateStr) || 0;
    }

    return Array.from(dateMap.values());
  }

  // Obtener mensajes por canal (optimizado: 2 consultas en lugar de N+1)
  async getMessagesByChannel(organizationId: number): Promise<MessagesByChannel[]> {
    const { data: channels } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', organizationId);

    if (!channels || channels.length === 0) return [];

    // Una sola consulta para contar mensajes por canal_id
    const { data: messagesData } = await supabase
      .from('messages')
      .select('channel_id')
      .eq('organization_id', organizationId);

    // Agrupar por channel_id en memoria
    const countsByChannel = new Map<string, number>();
    for (const msg of messagesData || []) {
      countsByChannel.set(msg.channel_id, (countsByChannel.get(msg.channel_id) || 0) + 1);
    }

    let totalMessages = 0;
    const result: MessagesByChannel[] = channels.map(channel => {
      const count = countsByChannel.get(channel.id) || 0;
      totalMessages += count;
      return {
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
        count,
        percentage: 0,
      };
    });

    return result.map(r => ({
      ...r,
      percentage: totalMessages > 0 ? (r.count / totalMessages) * 100 : 0,
    }));
  }

  // Obtener top agentes (optimizado: 2 consultas en lugar de 3*N)
  async getTopAgents(organizationId: number, limit: number = 5): Promise<TopAgent[]> {
    const { data: members } = await supabase
      .from('organization_members')
      .select(`
        id,
        profiles!inner(first_name, last_name, email)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (!members || members.length === 0) return [];

    const memberIds = members.map(m => m.id);

    // Una sola consulta para todas las conversaciones de todos los agentes
    const { data: allConversations } = await supabase
      .from('conversations')
      .select('assigned_member_id, status, first_response_time_seconds')
      .eq('organization_id', organizationId)
      .in('assigned_member_id', memberIds);

    // Agrupar por miembro en memoria
    const statsByMember = new Map<number, { total: number; resolved: number; responseTimes: number[] }>();
    for (const conv of allConversations || []) {
      const memberId = conv.assigned_member_id as number;
      if (!statsByMember.has(memberId)) {
        statsByMember.set(memberId, { total: 0, resolved: 0, responseTimes: [] });
      }
      const stats = statsByMember.get(memberId)!;
      stats.total++;
      if (conv.status === 'resolved') stats.resolved++;
      if (conv.first_response_time_seconds) stats.responseTimes.push(conv.first_response_time_seconds);
    }

    const result: TopAgent[] = members.map(member => {
      const stats = statsByMember.get(member.id) || { total: 0, resolved: 0, responseTimes: [] };
      const avgResponseTime = stats.responseTimes.length > 0
        ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
        : 0;
      const profile = member.profiles as any;
      return {
        memberId: member.id,
        name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Sin nombre',
        email: profile?.email || '',
        conversationsCount: stats.total,
        avgResponseTime,
        resolvedCount: stats.resolved,
      };
    });

    return result
      .sort((a, b) => b.conversationsCount - a.conversationsCount)
      .slice(0, limit);
  }

  // Obtener top canales (optimizado: 3 consultas en lugar de 2*N+1)
  async getTopChannels(organizationId: number, limit: number = 5): Promise<TopChannel[]> {
    const { data: channels } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', organizationId);

    if (!channels || channels.length === 0) return [];

    const channelIds = channels.map(c => c.id);

    // 2 consultas batch en paralelo
    const [messagesRes, conversationsRes] = await Promise.all([
      supabase
        .from('messages')
        .select('channel_id')
        .eq('organization_id', organizationId)
        .in('channel_id', channelIds),
      supabase
        .from('conversations')
        .select('channel_id')
        .eq('organization_id', organizationId)
        .in('channel_id', channelIds),
    ]);

    // Agrupar por channel_id en memoria
    const msgCounts = new Map<string, number>();
    for (const msg of messagesRes.data || []) {
      msgCounts.set(msg.channel_id, (msgCounts.get(msg.channel_id) || 0) + 1);
    }
    const convCounts = new Map<string, number>();
    for (const conv of conversationsRes.data || []) {
      convCounts.set(conv.channel_id, (convCounts.get(conv.channel_id) || 0) + 1);
    }

    const result: TopChannel[] = channels.map(channel => ({
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      messagesCount: msgCounts.get(channel.id) || 0,
      conversationsCount: convCounts.get(channel.id) || 0,
    }));

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
