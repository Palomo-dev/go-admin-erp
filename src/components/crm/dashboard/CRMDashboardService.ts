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
import { describeError, logError } from '@/lib/utils/errorMessage';

/**
 * Corta la ejecución si la consulta falló.
 *
 * Antes ninguna consulta de este servicio miraba `error`: con la base caída el
 * dashboard mostraba ceros y embudos vacíos como si fueran datos reales. Ahora
 * el fallo sube al componente, que enseña un error con botón de reintentar.
 */
function throwIfError(context: string, error: unknown): void {
  if (!error) return;
  logError(`[CRMDashboard] ${context}`, error);
  throw new Error(`No se pudo cargar ${context}: ${describeError(error)}`);
}

class CRMDashboardService {
  // Obtener KPIs principales
  async getKPIs(organizationId: number, filters: CRMFilters): Promise<KPIData> {
    const dateFrom = filters.dateRange.from || subDays(new Date(), 30);
    const dateTo = filters.dateRange.to || new Date();
    const { branchId } = filters;

    // Conversaciones abiertas
    let conversationsQuery = supabase
      .from('conversations')
      .select('id, status, first_response_time_seconds', { count: 'exact' })
      .eq('organization_id', organizationId)
      .in('status', ['open', 'pending']);

    if (branchId != null) {
      conversationsQuery = conversationsQuery.eq('branch_id', branchId);
    }
    if (filters.channelId) {
      conversationsQuery = conversationsQuery.eq('channel_id', filters.channelId);
    }
    if (filters.agentId) {
      conversationsQuery = conversationsQuery.eq('assigned_member_id', filters.agentId);
    }

    const { data: conversationsData, count: conversationsCount, error: conversationsError } = await conversationsQuery;
    throwIfError('las conversaciones', conversationsError);

    // Calcular tiempo promedio de respuesta
    const responseTimes = conversationsData
      ?.filter(c => c.first_response_time_seconds)
      .map(c => c.first_response_time_seconds) || [];
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Conversaciones pendientes
    let pendingQuery = supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    if (branchId != null) {
      pendingQuery = pendingQuery.eq('branch_id', branchId);
    }

    const { count: pendingCount, error: pendingError } = await pendingQuery;
    throwIfError('las conversaciones pendientes', pendingError);

    // Oportunidades abiertas
    let opportunitiesQuery = supabase
      .from('opportunities')
      .select('id, amount, currency')
      .eq('organization_id', organizationId)
      .eq('status', 'open');

    if (branchId != null) {
      opportunitiesQuery = opportunitiesQuery.eq('branch_id', branchId);
    }
    if (filters.pipelineId) {
      opportunitiesQuery = opportunitiesQuery.eq('pipeline_id', filters.pipelineId);
    }

    const { data: opportunitiesData, error: opportunitiesError } = await opportunitiesQuery;
    throwIfError('las oportunidades abiertas', opportunitiesError);
    const opportunitiesOpen = opportunitiesData?.length || 0;
    const opportunitiesValue = opportunitiesData?.reduce((sum, o) => sum + (o.amount || 0), 0) || 0;

    // Pronóstico del mes (oportunidades que cierran este mes)
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    let forecastQuery = supabase
      .from('opportunities')
      .select('amount, stages!inner(probability)')
      .eq('organization_id', organizationId)
      .eq('status', 'open')
      .gte('expected_close_date', format(monthStart, 'yyyy-MM-dd'))
      .lte('expected_close_date', format(monthEnd, 'yyyy-MM-dd'));

    if (branchId != null) {
      forecastQuery = forecastQuery.eq('branch_id', branchId);
    }

    const { data: forecastData, error: forecastError } = await forecastQuery;
    throwIfError('el pronóstico del mes', forecastError);

    const monthForecast = forecastData?.reduce((sum, o) => {
      const probability = (o.stages as any)?.probability || 0;
      return sum + ((o.amount || 0) * (probability || 0));
    }, 0) || 0;

    // Campañas activas
    const { count: activeCampaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .in('status', ['scheduled', 'sending', 'sent']);
    throwIfError('las campañas activas', campaignsError);

    // Clientes nuevos en el periodo
    let newCustomersQuery = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', format(dateFrom, 'yyyy-MM-dd'))
      .lte('created_at', format(dateTo, 'yyyy-MM-dd'));

    if (branchId != null) {
      newCustomersQuery = newCustomersQuery.eq('branch_id', branchId);
    }

    const { count: newCustomers, error: newCustomersError } = await newCustomersQuery;
    throwIfError('los clientes nuevos', newCustomersError);

    // Total de clientes
    let totalCustomersQuery = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    if (branchId != null) {
      totalCustomersQuery = totalCustomersQuery.eq('branch_id', branchId);
    }

    const { count: totalCustomers, error: totalCustomersError } = await totalCustomersQuery;
    throwIfError('el total de clientes', totalCustomersError);

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
  async getFunnelData(organizationId: number, filtersOrPipelineId: CRMFilters | string | undefined): Promise<FunnelData> {
    // Aceptar tanto filters (nuevo) como pipelineId string (compatibilidad)
    const filters: CRMFilters | null =
      typeof filtersOrPipelineId === 'string' || filtersOrPipelineId === undefined ? null : filtersOrPipelineId;
    const pipelineId = typeof filtersOrPipelineId === 'string' ? filtersOrPipelineId : filters?.pipelineId || undefined;
    const branchId = filters?.branchId ?? null;

    // Obtener pipeline (usar default si no se especifica)
    let pipeline = pipelineId;
    if (!pipeline) {
      const { data: defaultPipeline, error: defaultPipelineError } = await supabase
        .from('pipelines')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_default', true)
        .maybeSingle();
      throwIfError('el pipeline por defecto', defaultPipelineError);
      pipeline = defaultPipeline?.id;
    }

    if (!pipeline) {
      return { stages: [], totalValue: 0, weightedValue: 0 };
    }

    // Obtener etapas del pipeline
    const { data: stages, error: stagesError } = await supabase
      .from('stages')
      .select('id, name, position, probability, color')
      .eq('pipeline_id', pipeline)
      .order('position', { ascending: true });
    throwIfError('las etapas del pipeline', stagesError);

    if (!stages || stages.length === 0) {
      return { stages: [], totalValue: 0, weightedValue: 0 };
    }

    // Consulta batch: obtener todas las oportunidades de las etapas en una sola consulta
    const stageIds = stages.map(s => s.id);
    let oppQuery = supabase
      .from('opportunities')
      .select('stage_id, amount')
      .eq('organization_id', organizationId)
      .in('stage_id', stageIds)
      .eq('status', 'open');

    if (branchId != null) {
      oppQuery = oppQuery.eq('branch_id', branchId);
    }

    const { data: allOpportunities, error: allOpportunitiesError } = await oppQuery;
    throwIfError('las oportunidades del embudo', allOpportunitiesError);

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
    const weightedValue = stagesData.reduce((sum, s) => sum + s.value * ((s.probability || 0) / 100), 0);

    return { stages: stagesData, totalValue, weightedValue };
  }

  // Obtener actividad por día (optimizado: 4 consultas batch en lugar de N*4)
  async getActivityByDay(organizationId: number, filters: CRMFilters): Promise<ActivityByDay[]> {
    const dateFrom = filters.dateRange.from || subDays(new Date(), 7);
    const dateTo = filters.dateRange.to || new Date();
    const dateFromStr = format(dateFrom, 'yyyy-MM-dd');
    const dateToStr = format(new Date(dateTo.getTime() + 86400000), 'yyyy-MM-dd');
    const { branchId } = filters;

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
      (() => {
        let q = supabase
          .from('conversations')
          .select('created_at')
          .eq('organization_id', organizationId)
          .gte('created_at', dateFromStr)
          .lt('created_at', dateToStr);
        if (branchId != null) q = q.eq('branch_id', branchId);
        return q;
      })(),
      (() => {
        let q = supabase
          .from('messages')
          .select('created_at')
          .eq('organization_id', organizationId)
          .gte('created_at', dateFromStr)
          .lt('created_at', dateToStr);
        if (branchId != null) q = q.eq('branch_id', branchId);
        return q;
      })(),
      (() => {
        let q = supabase
          .from('opportunities')
          .select('created_at')
          .eq('organization_id', organizationId)
          .gte('created_at', dateFromStr)
          .lt('created_at', dateToStr);
        if (branchId != null) q = q.eq('branch_id', branchId);
        return q;
      })(),
      (() => {
        let q = supabase
          .from('activities')
          .select('created_at')
          .eq('organization_id', organizationId)
          .gte('created_at', dateFromStr)
          .lt('created_at', dateToStr);
        if (branchId != null) q = q.eq('branch_id', branchId);
        return q;
      })(),
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

    throwIfError('la actividad por día (conversaciones)', conversationsRes.error);
    throwIfError('la actividad por día (mensajes)', messagesRes.error);
    throwIfError('la actividad por día (oportunidades)', opportunitiesRes.error);
    throwIfError('la actividad por día (actividades)', activitiesRes.error);

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
  async getMessagesByChannel(organizationId: number, filters?: CRMFilters): Promise<MessagesByChannel[]> {
    const branchId = filters?.branchId ?? null;

    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', organizationId);
    throwIfError('los canales', channelsError);

    if (!channels || channels.length === 0) return [];

    // Una sola consulta para contar mensajes por canal_id
    let messagesQuery = supabase
      .from('messages')
      .select('channel_id')
      .eq('organization_id', organizationId);

    if (branchId != null) {
      messagesQuery = messagesQuery.eq('branch_id', branchId);
    }

    const { data: messagesData, error: messagesError } = await messagesQuery;
    throwIfError('los mensajes', messagesError);

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
  async getTopAgents(organizationId: number, filtersOrLimit: CRMFilters | number = 5, limitArg?: number): Promise<TopAgent[]> {
    // Aceptar filters (nuevo) o limit numérico (compatibilidad)
    const filters: CRMFilters | null = typeof filtersOrLimit === 'number' ? null : filtersOrLimit;
    const limit = typeof filtersOrLimit === 'number' ? filtersOrLimit : (limitArg ?? 5);
    const branchId = filters?.branchId ?? null;

    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select(`
        id,
        profiles!inner(first_name, last_name, email)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    throwIfError('los agentes', membersError);

    if (!members || members.length === 0) return [];

    const memberIds = members.map(m => m.id);

    // Una sola consulta para todas las conversaciones de todos los agentes
    let conversationsQuery = supabase
      .from('conversations')
      .select('assigned_member_id, status, first_response_time_seconds')
      .eq('organization_id', organizationId)
      .in('assigned_member_id', memberIds);

    if (branchId != null) {
      conversationsQuery = conversationsQuery.eq('branch_id', branchId);
    }

    const { data: allConversations, error: allConversationsError } = await conversationsQuery;
    throwIfError('las conversaciones por agente', allConversationsError);

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
  async getTopChannels(organizationId: number, filtersOrLimit: CRMFilters | number = 5, limitArg?: number): Promise<TopChannel[]> {
    // Aceptar filters (nuevo) o limit numérico (compatibilidad)
    const filters: CRMFilters | null = typeof filtersOrLimit === 'number' ? null : filtersOrLimit;
    const limit = typeof filtersOrLimit === 'number' ? filtersOrLimit : (limitArg ?? 5);
    const branchId = filters?.branchId ?? null;

    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', organizationId);
    throwIfError('los canales', channelsError);

    if (!channels || channels.length === 0) return [];

    const channelIds = channels.map(c => c.id);

    // 2 consultas batch en paralelo
    const [messagesRes, conversationsRes] = await Promise.all([
      (() => {
        let q = supabase
          .from('messages')
          .select('channel_id')
          .eq('organization_id', organizationId)
          .in('channel_id', channelIds);
        if (branchId != null) q = q.eq('branch_id', branchId);
        return q;
      })(),
      (() => {
        let q = supabase
          .from('conversations')
          .select('channel_id')
          .eq('organization_id', organizationId)
          .in('channel_id', channelIds);
        if (branchId != null) q = q.eq('branch_id', branchId);
        return q;
      })(),
    ]);

    throwIfError('los mensajes por canal', messagesRes.error);
    throwIfError('las conversaciones por canal', conversationsRes.error);

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
  async getTopOpportunities(organizationId: number, filtersOrLimit: CRMFilters | number = 5, limitArg?: number): Promise<TopOpportunity[]> {
    // Aceptar filters (nuevo) o limit numérico (compatibilidad)
    const filters: CRMFilters | null = typeof filtersOrLimit === 'number' ? null : filtersOrLimit;
    const limit = typeof filtersOrLimit === 'number' ? filtersOrLimit : (limitArg ?? 5);
    const branchId = filters?.branchId ?? null;

    let oppQuery = supabase
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

    if (branchId != null) {
      oppQuery = oppQuery.eq('branch_id', branchId);
    }

    const { data: opportunities, error: opportunitiesListError } = await oppQuery;
    throwIfError('las oportunidades destacadas', opportunitiesListError);

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
      this.getFunnelData(organizationId, filters),
      this.getActivityByDay(organizationId, filters),
      this.getMessagesByChannel(organizationId, filters),
      this.getTopAgents(organizationId, filters),
      this.getTopChannels(organizationId, filters),
      this.getTopOpportunities(organizationId, filters),
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
    const { data, error } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', organizationId)
      .order('name');
    throwIfError('la lista de canales', error);

    return (data || []).map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
    }));
  }

  // Obtener lista de pipelines para filtros
  async getPipelines(organizationId: number): Promise<Pipeline[]> {
    const { data, error } = await supabase
      .from('pipelines')
      .select('id, name, is_default')
      .eq('organization_id', organizationId)
      .order('name');
    throwIfError('la lista de pipelines', error);

    return (data || []).map(p => ({
      id: p.id,
      name: p.name,
      isDefault: p.is_default,
    }));
  }

  // Obtener lista de agentes para filtros
  async getAgents(organizationId: number): Promise<Agent[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        profiles!inner(first_name, last_name, email)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    throwIfError('la lista de agentes', error);

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
