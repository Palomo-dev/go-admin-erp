import { supabase } from '@/lib/supabase/config';
import {
  Opportunity,
  OpportunityFilters,
  OpportunityStats,
  CreateOpportunityInput,
  UpdateOpportunityInput,
  Pipeline,
  Stage,
  Customer,
  Activity,
  ForecastData,
  OpportunityProduct,
} from './types';

class OpportunitiesService {
  private getOrganizationId(): number {
    if (typeof window === 'undefined') {
      return 2; // Default para SSR
    }
    const orgId = localStorage.getItem('currentOrganizationId');
    return orgId ? Number(orgId) : 2;
  }

  async getPipelines(): Promise<Pipeline[]> {
    try {
      const { data, error } = await supabase
        .from('pipelines')
        .select('*')
        .eq('organization_id', this.getOrganizationId())
        .order('name');

      if (error) {
        console.warn('Advertencia obteniendo pipelines:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('Advertencia en getPipelines');
      return [];
    }
  }

  async getStages(pipelineId?: string): Promise<Stage[]> {
    try {
      let query = supabase.from('stages').select('*');

      if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId);
      }

      const { data, error } = await query.order('position');
      if (error) {
        console.warn('Advertencia obteniendo stages:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('Advertencia en getStages');
      return [];
    }
  }

  async getCustomers(): Promise<Customer[]> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, email, phone, avatar_url, organization_id')
        .eq('organization_id', this.getOrganizationId())
        .order('full_name');

      if (error) {
        console.warn('Advertencia obteniendo customers:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('Advertencia en getCustomers');
      return [];
    }
  }

  async getAgents(): Promise<{ id: string; email: string; full_name: string }[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        user_id,
        users:user_id (
          id,
          email
        )
      `)
      .eq('organization_id', this.getOrganizationId())
      .eq('is_active', true);

    if (error) throw error;
    return (data || []).map((m: any) => ({
      id: m.user_id,
      email: m.users?.email || '',
      full_name: m.users?.email?.split('@')[0] || 'Usuario',
    }));
  }

  async getOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]> {
    let query = supabase
      .from('opportunities')
      .select(`
        *,
        customer:customers(id, full_name, email, phone),
        stage:stages(id, name, position, probability, color),
        pipeline:pipelines(id, name)
      `)
      .eq('organization_id', this.getOrganizationId());

    if (filters?.pipelineId) {
      query = query.eq('pipeline_id', filters.pipelineId);
    }

    if (filters?.stageId) {
      query = query.eq('stage_id', filters.stageId);
    }

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }

    if (filters?.agentId) {
      query = query.eq('created_by', filters.agentId);
    }

    if (filters?.dateFrom) {
      query = query.gte('expected_close_date', filters.dateFrom);
    }

    if (filters?.dateTo) {
      query = query.lte('expected_close_date', filters.dateTo);
    }

    if (filters?.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getOpportunityById(id: string): Promise<Opportunity | null> {
    const { data, error } = await supabase
      .from('opportunities')
      .select(`
        *,
        customer:customers(id, full_name, email, phone),
        stage:stages(id, name, position, probability, color, pipeline_id),
        pipeline:pipelines(id, name, goal_amount, goal_period, goal_currency)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async getOpportunityProducts(opportunityId: string): Promise<OpportunityProduct[]> {
    const { data, error } = await supabase
      .from('opportunity_products')
      .select(`
        *,
        product:products(id, name, sku)
      `)
      .eq('opportunity_id', opportunityId);

    if (error) throw error;
    return data || [];
  }

  async getOpportunityActivities(opportunityId: string): Promise<Activity[]> {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('related_id', opportunityId)
      .eq('related_type', 'opportunity')
      .order('occurred_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> {
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('opportunities')
      .insert({
        organization_id: this.getOrganizationId(),
        pipeline_id: input.pipeline_id,
        stage_id: input.stage_id,
        customer_id: input.customer_id || null,
        name: input.name,
        amount: input.amount,
        currency: input.currency || 'COP',
        expected_close_date: input.expected_close_date || null,
        status: 'open',
        created_by: userData.user?.id || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Agregar productos si existen
    if (input.products && input.products.length > 0) {
      const productsToInsert = input.products.map((p) => ({
        opportunity_id: data.id,
        product_id: p.product_id,
        quantity: p.quantity,
        unit_price: p.unit_price,
        total_price: p.quantity * p.unit_price,
      }));

      await supabase.from('opportunity_products').insert(productsToInsert);
    }

    return data;
  }

  async updateOpportunity(id: string, input: UpdateOpportunityInput): Promise<Opportunity> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.stage_id !== undefined) updateData.stage_id = input.stage_id;
    if (input.customer_id !== undefined) updateData.customer_id = input.customer_id;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.amount !== undefined) updateData.amount = input.amount;
    if (input.currency !== undefined) updateData.currency = input.currency;
    if (input.expected_close_date !== undefined) updateData.expected_close_date = input.expected_close_date;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.loss_reason !== undefined) updateData.loss_reason = input.loss_reason;

    const { data, error } = await supabase
      .from('opportunities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteOpportunity(id: string): Promise<void> {
    // Primero eliminar productos asociados
    await supabase.from('opportunity_products').delete().eq('opportunity_id', id);

    const { error } = await supabase.from('opportunities').delete().eq('id', id);

    if (error) throw error;
  }

  async duplicateOpportunity(id: string): Promise<Opportunity> {
    const original = await this.getOpportunityById(id);
    if (!original) throw new Error('Oportunidad no encontrada');

    const products = await this.getOpportunityProducts(id);

    const newOpportunity = await this.createOpportunity({
      pipeline_id: original.pipeline_id,
      stage_id: original.stage_id,
      customer_id: original.customer_id || undefined,
      name: `${original.name} (copia)`,
      amount: original.amount,
      currency: original.currency,
      expected_close_date: original.expected_close_date || undefined,
      products: products.map((p) => ({
        product_id: p.product_id,
        quantity: p.quantity,
        unit_price: p.unit_price,
      })),
    });

    return newOpportunity;
  }

  async markAsWon(id: string): Promise<Opportunity> {
    return this.updateOpportunity(id, { status: 'won' });
  }

  async markAsLost(id: string, lossReason: string): Promise<Opportunity> {
    return this.updateOpportunity(id, { status: 'lost', loss_reason: lossReason });
  }

  async moveToStage(id: string, stageId: string): Promise<Opportunity> {
    return this.updateOpportunity(id, { stage_id: stageId });
  }

  async getStats(filters?: OpportunityFilters): Promise<OpportunityStats> {
    const opportunities = await this.getOpportunities(filters);

    const total = opportunities.length;
    const open = opportunities.filter((o) => o.status === 'open').length;
    const won = opportunities.filter((o) => o.status === 'won').length;
    const lost = opportunities.filter((o) => o.status === 'lost').length;
    const totalAmount = opportunities.reduce((sum, o) => sum + (o.amount || 0), 0);
    const weightedAmount = opportunities.reduce((sum, o) => {
      const probability = o.stage?.probability || 0;
      return sum + (o.amount || 0) * probability;
    }, 0);
    const avgDealSize = total > 0 ? totalAmount / total : 0;
    const winRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;

    return {
      total,
      open,
      won,
      lost,
      totalAmount,
      weightedAmount,
      avgDealSize,
      winRate,
    };
  }

  async getForecastByPeriod(
    pipelineId: string,
    period: 'weekly' | 'monthly' | 'quarterly'
  ): Promise<ForecastData[]> {
    const opportunities = await this.getOpportunities({ pipelineId });
    const pipeline = (await this.getPipelines()).find((p) => p.id === pipelineId);
    const goal = pipeline?.goal_amount || 0;

    const groupedData: Record<string, ForecastData> = {};

    opportunities.forEach((opp) => {
      if (!opp.expected_close_date) return;

      const date = new Date(opp.expected_close_date);
      let periodKey: string;

      if (period === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
      } else if (period === 'monthly') {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        periodKey = `${date.getFullYear()}-Q${quarter}`;
      }

      if (!groupedData[periodKey]) {
        groupedData[periodKey] = {
          period: periodKey,
          openAmount: 0,
          weightedAmount: 0,
          wonAmount: 0,
          lostAmount: 0,
          goal,
          goalCompletion: 0,
        };
      }

      const probability = opp.stage?.probability || 0;
      const amount = opp.amount || 0;

      if (opp.status === 'open') {
        groupedData[periodKey].openAmount += amount;
        groupedData[periodKey].weightedAmount += amount * probability;
      } else if (opp.status === 'won') {
        groupedData[periodKey].wonAmount += amount;
      } else if (opp.status === 'lost') {
        groupedData[periodKey].lostAmount += amount;
      }
    });

    // Calcular porcentaje de meta
    Object.values(groupedData).forEach((data) => {
      if (data.goal > 0) {
        data.goalCompletion = ((data.wonAmount + data.weightedAmount) / data.goal) * 100;
      }
    });

    return Object.values(groupedData).sort((a, b) => a.period.localeCompare(b.period));
  }

  async createActivity(
    opportunityId: string,
    type: Activity['activity_type'],
    notes: string
  ): Promise<Activity> {
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('activities')
      .insert({
        organization_id: this.getOrganizationId(),
        activity_type: type,
        user_id: userData.user?.id || null,
        notes,
        related_type: 'opportunity',
        related_id: opportunityId,
        occurred_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async addProduct(
    opportunityId: string,
    productId: number,
    quantity: number,
    unitPrice: number
  ): Promise<OpportunityProduct> {
    const { data, error } = await supabase
      .from('opportunity_products')
      .insert({
        opportunity_id: opportunityId,
        product_id: productId,
        quantity,
        unit_price: unitPrice,
        total_price: quantity * unitPrice,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async removeProduct(productLineId: string): Promise<void> {
    const { error } = await supabase
      .from('opportunity_products')
      .delete()
      .eq('id', productLineId);

    if (error) throw error;
  }

  async getProducts(): Promise<{ id: number; name: string; sku: string; price: number; image?: string }[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, 
          name, 
          sku,
          product_prices (
            price
          ),
          product_images (
            image_url
          )
        `)
        .eq('organization_id', this.getOrganizationId())
        .eq('status', 'active')
        .order('name');

      if (error) {
        console.warn('Advertencia obteniendo productos:', error.message);
        return [];
      }
      
      return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        price: parseFloat(p.product_prices?.[0]?.price) || 0,
        image: p.product_images?.[0]?.image_url || undefined,
      }));
    } catch (err) {
      console.warn('Advertencia en getProducts');
      return [];
    }
  }

  // ============== ESPACIOS (PMS) ==============
  
  async getSpaces(): Promise<{ id: string; label: string; floor_zone?: string; status: string; type_name?: string; base_rate: number }[]> {
    try {
      const branchIds = await this.getBranchIds();
      
      // Si no hay branches, retornar array vacío
      if (!branchIds || branchIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('spaces')
        .select(`
          id,
          label,
          floor_zone,
          status,
          space_types (
            name,
            base_rate
          )
        `)
        .in('branch_id', branchIds)
        .order('label');

      if (error) {
        console.warn('Advertencia obteniendo espacios:', error.message);
        return [];
      }
      
      return (data || []).map((s: any) => ({
        id: s.id,
        label: s.label,
        floor_zone: s.floor_zone,
        status: s.status,
        type_name: s.space_types?.name,
        base_rate: parseFloat(s.space_types?.base_rate) || 0,
      }));
    } catch (err) {
      console.warn('Advertencia en getSpaces');
      return [];
    }
  }

  private async getBranchIds(): Promise<number[]> {
    try {
      const orgId = this.getOrganizationId();
      if (!orgId) return [];
      
      const { data, error } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', orgId);
      
      if (error) {
        console.warn('Advertencia obteniendo branches:', error.message);
        return [];
      }
      return (data || []).map(b => b.id);
    } catch (err) {
      console.warn('Advertencia en getBranchIds');
      return [];
    }
  }

  async getOpportunitySpaces(opportunityId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('opportunity_spaces')
      .select(`
        *,
        space:spaces(id, label, floor_zone, status, space_types(name, base_rate))
      `)
      .eq('opportunity_id', opportunityId);

    if (error) throw error;
    return data || [];
  }

  async addSpace(
    opportunityId: string,
    spaceId: string,
    nights: number,
    unitPrice: number
  ): Promise<any> {
    const { data, error } = await supabase
      .from('opportunity_spaces')
      .insert({
        opportunity_id: opportunityId,
        space_id: spaceId,
        nights,
        unit_price: unitPrice,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async removeSpace(spaceLineId: string): Promise<void> {
    const { error } = await supabase
      .from('opportunity_spaces')
      .delete()
      .eq('id', spaceLineId);

    if (error) throw error;
  }
}

export const opportunitiesService = new OpportunitiesService();
