import { supabase } from '@/lib/supabase/config';
import { pedirDespachoAvisos } from '@/lib/services/avisos/pedirDespacho';
import { getOrganizationId as getOrgId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { applyBranchFilterInclusive } from '@/lib/services/branchFilterHelper';
import { DEFAULT_TIMEZONE, toPlainDate } from '@/lib/utils/timezone';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import {
  Opportunity,
  OpportunityFilters,
  OpportunityStats,
  CreateOpportunityInput,
  UpdateOpportunityInput,
  Pipeline,
  Stage,
  Customer,
  ForecastData,
  OpportunityProduct,
  OpportunityCustomLine,
  OpportunitySpace,
  OpportunityTask,
  OpportunityNote,
  CustomerDetails,
  LossReasonData,
} from './types';
import {
  crmTaskService,
  normalizeTaskPriority,
  normalizeTaskStatus,
} from '@/lib/services/crm/taskService';
// Cerrar como ganada pasa por el MISMO PATCH del servidor que usan el detalle,
// el drawer y el tablero. No hay una segunda implementación del cierre.
import { requestStageChange } from '@/components/crm/pipeline/drawer/StageSelect';
import { crearOportunidad as crearOportunidadServidor, editarOportunidad as editarOportunidadServidor, eliminarOportunidad as eliminarOportunidadServidor, guardarSeguimiento, moverEtapa } from '@/components/crm/oportunidad/apiOportunidades';

/** Fila de `organization_members` con el perfil embebido. */
interface MiembroConPerfil {
  user_id: string;
  profiles: { first_name: string | null; last_name: string | null } | null;
}

/** Fila de `products` con precio e imagen embebidos (numeric llega como texto). */
interface ProductoConPrecio {
  id: number;
  name: string;
  sku: string | null;
  product_prices: Array<{ price: number | string | null }> | null;
  product_images: Array<{ storage_path: string | null }> | null;
}

/** Fila de `spaces` con su tipo embebido. */
interface EspacioConTipo {
  id: string;
  label: string;
  floor_zone?: string;
  status: string;
  space_types: { name: string; base_rate: number | string | null } | null;
}

class OpportunitiesService {
  private getOrganizationId(): number {
    if (typeof window === 'undefined') {
      return 0;
    }
    return getOrgId();
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
    } catch {
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
    } catch {
      console.warn('Advertencia en getStages');
      return [];
    }
  }

  async getCustomers(branchId?: number | null): Promise<Customer[]> {
    try {
      let query = supabase
        .from('customers')
        .select('id, full_name, email, phone, avatar_url, organization_id')
        .eq('organization_id', this.getOrganizationId());

      if (branchId != null) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query.order('full_name');

      if (error) {
        console.warn('Advertencia obteniendo customers:', error.message);
        return [];
      }
      return data || [];
    } catch {
      console.warn('Advertencia en getCustomers');
      return [];
    }
  }

  /**
   * Búsqueda de clientes contra el servidor, para alimentar `CustomerSearchSelect`
   * cuando la organización tiene más clientes de los que caben en una carga
   * completa (`getCustomers` se queda en el tope de filas de PostgREST y el
   * filtrado en memoria no vería al resto).
   */
  async searchCustomers(term: string, branchId?: number | null, limit = 20): Promise<Customer[]> {
    const orgId = this.getOrganizationId();
    if (!orgId) return [];

    try {
      // Búsqueda única de clientes (RPC): sin tildes, todas las palabras, dígitos,
      // por relevancia. Con sucursal se piden 100 y se filtra aquí (la RPC no
      // filtra por sucursal).
      const { filas } = await buscarClientes(supabase, { organizationId: orgId, texto: term, limite: branchId != null ? 100 : limit });
      return filas
        .filter((c) => branchId == null || c.branch_id === branchId)
        .slice(0, limit)
        .map((c) => ({ id: c.id, full_name: c.full_name, email: c.email, phone: c.phone, avatar_url: c.avatar_url, organization_id: c.organization_id })) as Customer[];
    } catch (err) {
      // El llamador decide qué enseñar: aquí solo se propaga.
      throw err instanceof Error ? err : new Error('No se pudieron buscar clientes');
    }
  }

  async getAgents(): Promise<{ id: string; email: string; full_name: string }[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        user_id,
        profiles:user_id (
          first_name,
          last_name
        )
      `)
      .eq('organization_id', this.getOrganizationId())
      .eq('is_active', true);

    if (error) throw error;
    return ((data || []) as unknown as MiembroConPerfil[]).map((m) => ({
      id: m.user_id,
      email: '',
      full_name: `${m.profiles?.first_name || ''} ${m.profiles?.last_name || ''}`.trim() || 'Usuario',
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

    if (filters?.record_type) {
      query = query.eq('record_type', filters.record_type);
    }

    // INCLUSIVO, no estricto: una oportunidad sin sucursal es de toda la
    // organización y tiene que aparecer bajo cualquier sucursal. Con `eq` la
    // lista salía vacía (2026-09-11: el 100 % de las oportunidades de la
    // plataforma tenían `branch_id` nulo, porque la creación no lo escribía).
    query = applyBranchFilterInclusive(query, filters?.branchId);

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
        pipeline:pipelines(id, name, goal_amount, goal_period, goal_currency, pipeline_type)
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

  /**
   * Alta por `POST /api/crm/opportunities` (CRM ola 3B, guardarraíl 36): la
   * RPC `crm_create_opportunity` crea oportunidad, líneas (productos,
   * espacios y conceptos) y actividad en UNA transacción, con la organización
   * de la sesión, el permiso `crm.opportunities.create` y la moneda base si
   * no se indica. Siempre `record_type='deal'` (D2).
   */
  async createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> {
    const branchId = input.branch_id ?? getCurrentBranchId();
    return (await crearOportunidadServidor({
      pipeline_id: input.pipeline_id,
      stage_id: input.stage_id,
      customer_id: input.customer_id || null,
      name: input.name,
      amount: Number(input.amount) || 0,
      ...(input.currency ? { currency: input.currency } : {}),
      expected_close_date: input.expected_close_date || null,
      salesperson_id: input.salesperson_id || null,
      commission_rate: input.commission_rate || 0,
      commission_type: input.salesperson_id && input.commission_rate && input.commission_rate > 0 ? input.commission_type ?? 'salesperson' : 'none',
      source: input.source || null,
      vertical_id: input.vertical_id || null,
      next_contact_at: input.next_contact_at || null,
      ...(branchId ? { branch_id: branchId } : {}),
      origen: 'general',
      products: (input.products ?? []).map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
      spaces: (input.spaces ?? []).map((l) => ({ space_id: l.space_id, nights: Number(l.nights), unit_price: Number(l.unit_price) })),
      custom_lines: (input.customLines ?? []).map((l) => ({ concept: l.concept, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
    })) as unknown as Opportunity;
  }

  /**
   * Edición por el servidor (CRM ola 3B, guardarraíl 36):
   * - la etapa → `PATCH …/stage` (gate, permisos y bloqueo);
   * - canal y resultado del último contacto → `PATCH …/seguimiento`;
   * - el resto → `PATCH …/[id]` (RPC `crm_update_opportunity`, líneas por
   *   diferencia en la misma transacción).
   * Estado, cierre, pérdida y ficha de venta NO se editan aquí: van por
   * `…/win` y `…/lose` (se rechaza en vez de escribirlos a pelo).
   */
  async updateOpportunity(id: string, input: UpdateOpportunityInput): Promise<Opportunity> {
    const cierre = (['status', 'loss_reason', 'loss_reason_value', 'win_data', 'closed_at', 'record_type', 'competitor_name', 'competitor_price', 'missing_features', 'recontact_at', 'objection_id', 'last_contact_at'] as const).filter((k) => input[k] !== undefined);
    if (cierre.length > 0) throw new Error(`No editable aquí (${cierre.join(', ')}): se cambia al ganar o perder la oportunidad`);
    if (input.stage_id !== undefined) await moverEtapa(id, { stage_id: input.stage_id });

    const seguimiento = input.contact_channel !== undefined || input.contact_result !== undefined;
    const cuerpo: Record<string, unknown> = {};
    const copiar = ['customer_id', 'name', 'amount', 'currency', 'expected_close_date', 'metadata', 'salesperson_id', 'commission_rate', 'commission_type', 'source', 'vertical_id', 'next_contact_at', 'discovery_data', 'next_action', 'temperature'] as const;
    for (const k of copiar) if (input[k] !== undefined) cuerpo[k] = input[k] === '' ? null : input[k];
    if (input.products !== undefined) cuerpo.products = input.products.map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity), unit_price: Number(l.unit_price) }));
    if (input.spaces !== undefined) cuerpo.spaces = input.spaces.map((l) => ({ space_id: l.space_id, nights: Number(l.nights), unit_price: Number(l.unit_price) }));
    if (input.customLines !== undefined) cuerpo.custom_lines = input.customLines.map((l) => ({ concept: l.concept, quantity: Number(l.quantity), unit_price: Number(l.unit_price) }));

    if (seguimiento) {
      const { next_action, next_contact_at, temperature, ...resto } = cuerpo;
      await guardarSeguimiento(id, { next_action, next_contact_at, temperature, contact_channel: input.contact_channel || null, contact_result: input.contact_result || null });
      if (Object.keys(resto).length > 0) return (await editarOportunidadServidor(id, resto)) as unknown as Opportunity;
      return (await this.getOpportunityById(id)) as Opportunity;
    }
    if (Object.keys(cuerpo).length === 0) return (await this.getOpportunityById(id)) as Opportunity;
    return (await editarOportunidadServidor(id, cuerpo)) as unknown as Opportunity;
  }

  /** Borrado por `DELETE …/[id]` (RPC con guarda: ganada o con documentos → 409; limpia líneas, notas y tareas). */
  async deleteOpportunity(id: string): Promise<void> {
    await eliminarOportunidadServidor(id);
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

  /**
   * Etapa ganadora de un pipeline (`stages.is_won`), la de menor posición si
   * hubiera varias. `is_won`/`is_lost` son la fuente de verdad del cierre.
   */
  async getWinningStage(pipelineId: string): Promise<Stage | null> {
    const { data, error } = await supabase
      .from('stages')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .eq('is_won', true)
      .order('position')
      .limit(1);

    if (error) throw error;
    return data?.[0] ?? null;
  }

  /**
   * Marca la oportunidad como ganada por el MISMO camino que el flujo completo:
   * el PATCH de etapa del servidor. Antes hacía `update({status:'won'})` a pelo
   * desde el navegador, así que la oportunidad quedaba cerrada **sin moverse de
   * etapa**, saltándose el gate, la exigencia de `win_data` y el devengo de la
   * comisión (regla 7 de CLAUDE.md: una sola implementación del negocio).
   *
   * Si el servidor exige la ficha de venta devuelve `needs_won`: quien llame
   * desde la interfaz debe abrir `ClosedWonDialog` (ver `MarkWonFlow`), no
   * insistir sin datos.
   */
  async markAsWon(id: string, winData: Record<string, unknown> = {}): Promise<Opportunity> {
    const actual = await this.getOpportunityById(id);
    if (!actual) throw new Error('Oportunidad no encontrada');

    const etapaGanadora = await this.getWinningStage(actual.pipeline_id);
    if (!etapaGanadora) {
      throw new Error(
        'El pipeline no tiene ninguna etapa marcada como ganadora. Configúrala antes de cerrar la oportunidad.',
      );
    }

    const resultado = await requestStageChange(id, {
      stage_id: etapaGanadora.id,
      won_data: winData,
    });

    if (!resultado.ok) {
      switch (resultado.reason) {
        case 'needs_won':
          throw new Error('Para cerrar como ganada hace falta la ficha de venta.');
        case 'gate':
          throw new Error('La etapa ganadora tiene criterios de salida sin cumplir.');
        case 'needs_lost':
          throw new Error('El servidor pidió un motivo de pérdida para esta etapa.');
        default:
          throw new Error(resultado.message);
      }
    }

    const cerrada = await this.getOpportunityById(id);
    if (!cerrada) throw new Error('Oportunidad no encontrada tras cerrarla');
    return cerrada;
  }

  /**
   * Marca la oportunidad como perdida POR EL SERVIDOR (CRM ola 1, paso 1.3):
   * `POST /api/crm/opportunities/[id]/lose` la mueve a la etapa `is_lost` del
   * pipeline con el motivo estructurado, exige `crm.opportunities.close` y
   * conserva `metadata.gate_overrides` (fusiona `loss_notes`). Antes se
   * escribía `status='lost'` desde el navegador sin mover la etapa.
   */
  async markAsLost(id: string, data: LossReasonData): Promise<Opportunity> {
    const res = await fetch(`/api/crm/opportunities/${id}/lose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loss_data: {
          lossReasonId: data.lossReasonId || undefined,
          lossReasonLabel: data.lossReasonLabel || undefined,
          competitor: data.competitor || undefined,
          competitorPrice: data.competitorPrice || undefined,
          missingFeatures: data.missingFeatures?.length ? data.missingFeatures : undefined,
          recontactDate: data.recontactDate || undefined,
          notes: data.notes || undefined,
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      if (json?.reason === 'gate') throw new Error('La oportunidad no cumple los criterios para pasar a la etapa de pérdida');
      throw new Error(json?.error || `Error ${res.status}`);
    }
    return (json.data?.opportunity ?? {}) as Opportunity;
  }

  /** Por `PATCH …/stage` (gate y permisos del servidor). */
  async moveToStage(id: string, stageId: string): Promise<Opportunity> {
    await moverEtapa(id, { stage_id: stageId });
    return (await this.getOpportunityById(id)) as Opportunity;
  }

  /**
   * Registra canal y resultado del último contacto por `PATCH …/seguimiento`.
   * `last_contact_at` lo mantiene la base (trigger de actividades), no el navegador.
   */
  async registerContact(
    id: string,
    channel: string,
    result: string
  ): Promise<Opportunity> {
    return this.updateOpportunity(id, { contact_channel: channel, contact_result: result });
  }

  async getStats(filters?: OpportunityFilters): Promise<OpportunityStats> {
    const opportunities = await this.getOpportunities(filters);

    const total = opportunities.length;
    const open = opportunities.filter((o) => o.status === 'open').length;
    const won = opportunities.filter((o) => o.status === 'won').length;
    const lost = opportunities.filter((o) => o.status === 'lost').length;
    const totalAmount = opportunities.reduce((sum, o) => sum + (o.amount || 0), 0);
    // `stages.probability` es un porcentaje 0-100 (integer; verificado por MCP
    // el 2026-09-23: min 0, max 100). Multiplicar sin dividir entre 100 inflaba
    // el KPI ×100. Y solo se pondera lo ABIERTO: una ganada o una perdida ya no
    // es pronóstico, es resultado — el mismo criterio que getForecastByPeriod.
    const weightedAmount = opportunities.reduce((sum, o) => {
      if (o.status !== 'open') return sum;
      const probability = o.stage?.probability || 0;
      return sum + (o.amount || 0) * (probability / 100);
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
    period: 'weekly' | 'monthly' | 'quarterly',
    timezone: string = DEFAULT_TIMEZONE
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
        periodKey = toPlainDate(weekStart, timezone);
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

      const probability = (opp.stage?.probability || 0);
      const amount = opp.amount || 0;

      if (opp.status === 'open') {
        groupedData[periodKey].openAmount += amount;
        groupedData[periodKey].weightedAmount += amount * (probability / 100);
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
        // `total_price` es GENERATED ALWAYS: enviarla devuelve 428C9.
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
      // Paginar porque Supabase devuelve máximo 1000 filas por defecto
      const PAGE_SIZE = 1000;
      let allData: ProductoConPrecio[] = [];
      let offset = 0;
      while (true) {
        const { data: pageData, error: pageError } = await supabase
          .from('products')
          .select(`
            id, 
            name, 
            sku,
            product_prices (
              price
            ),
            product_images (
              storage_path
            )
          `)
          .eq('organization_id', this.getOrganizationId())
          .eq('status', 'active')
          .order('name')
          .range(offset, offset + PAGE_SIZE - 1);

        if (pageError) {
          console.warn('Advertencia obteniendo productos:', pageError.message);
          break;
        }
        if (!pageData || pageData.length === 0) break;
        allData = allData.concat(pageData as unknown as ProductoConPrecio[]);
        if (pageData.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      
      return (allData || []).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        price: parseFloat(String(p.product_prices?.[0]?.price ?? '')) || 0,
        image: p.product_images?.[0]?.storage_path || undefined,
      }));
    } catch {
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
      
      return ((data || []) as unknown as EspacioConTipo[]).map((s) => ({
        id: s.id,
        label: s.label,
        floor_zone: s.floor_zone,
        status: s.status,
        type_name: s.space_types?.name,
        base_rate: parseFloat(String(s.space_types?.base_rate ?? '')) || 0,
      }));
    } catch {
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
    } catch {
      console.warn('Advertencia en getBranchIds');
      return [];
    }
  }

  async getOpportunitySpaces(opportunityId: string): Promise<OpportunitySpace[]> {
    const { data, error } = await supabase
      .from('opportunity_spaces')
      .select(`
        *,
        space:spaces(id, label, floor_zone, status, space_types(name, base_rate))
      `)
      .eq('opportunity_id', opportunityId);

    if (error) throw error;
    return (data || []) as OpportunitySpace[];
  }

  async addSpace(
    opportunityId: string,
    spaceId: string,
    nights: number,
    unitPrice: number
  ): Promise<OpportunitySpace> {
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
    return data as OpportunitySpace;
  }

  async removeSpace(spaceLineId: string): Promise<void> {
    const { error } = await supabase
      .from('opportunity_spaces')
      .delete()
      .eq('id', spaceLineId);

    if (error) throw error;
  }

  async getOpportunityCustomLines(opportunityId: string): Promise<OpportunityCustomLine[]> {
    const { data, error } = await supabase
      .from('opportunity_custom_lines')
      .select('*')
      .eq('opportunity_id', opportunityId);

    if (error) throw error;
    return data || [];
  }

  // ============== TAREAS ==============

  async getOpportunityTasks(opportunityId: string): Promise<OpportunityTask[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        assigned_user:assigned_to (
          id,
          email
        )
      `)
      .eq('related_to_id', opportunityId)
      .eq('related_to_type', 'opportunity')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createTask(
    opportunityId: string,
    title: string,
    options?: {
      description?: string;
      due_date?: string;
      priority?: string;
      assigned_to?: string;
    }
  ): Promise<OpportunityTask> {
    // Delegado en el servicio único de tareas del CRM: allí viven la
    // validación y la normalización (antes aquí se escribía `priority:
    // 'medium'`, valor que rechaza el CHECK `tasks_priority_check`).
    const created = await crmTaskService.createTask({
      title,
      description: options?.description ?? null,
      due_date: options?.due_date ?? null,
      priority: options?.priority ?? null,
      assigned_to: options?.assigned_to ?? null,
      related_to_type: 'opportunity',
      related_to_id: opportunityId,
      type: 'crm',
    });
    if (options?.assigned_to) pedirDespachoAvisos();
    return created as unknown as OpportunityTask;
  }

  async updateTask(taskId: string, updates: Partial<OpportunityTask>): Promise<void> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.due_date !== undefined) updateData.due_date = updates.due_date;
    if (updates.assigned_to !== undefined) updateData.assigned_to = updates.assigned_to;
    if (updates.status !== undefined) {
      updateData.status = normalizeTaskStatus(updates.status);
      if (updateData.status === 'done') {
        updateData.completed_at = new Date().toISOString();
      }
    }
    if (updates.priority !== undefined) updateData.priority = normalizeTaskPriority(updates.priority);

    const { error } = await supabase.from('tasks').update(updateData).eq('id', taskId);
    if (error) throw error;
    if (updates.assigned_to !== undefined || updates.status !== undefined) pedirDespachoAvisos();
  }

  async deleteTask(taskId: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
  }

  // ============== NOTAS ==============

  async getOpportunityNotes(opportunityId: string): Promise<OpportunityNote[]> {
    const { data, error } = await supabase
      .from('notes')
      .select(`
        *,
        profiles:user_id (
          first_name,
          last_name
        )
      `)
      .eq('related_type', 'opportunity')
      .eq('related_id', opportunityId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createNote(opportunityId: string, body: string): Promise<OpportunityNote> {
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('notes')
      .insert({
        organization_id: this.getOrganizationId(),
        user_id: userData.user?.id,
        body,
        related_type: 'opportunity',
        related_id: opportunityId,
        is_pinned: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteNote(noteId: string): Promise<void> {
    const { error } = await supabase.from('notes').delete().eq('id', noteId);
    if (error) throw error;
  }

  async toggleNotePin(noteId: string, isPinned: boolean): Promise<void> {
    const { error } = await supabase
      .from('notes')
      .update({ is_pinned: !isPinned, updated_at: new Date().toISOString() })
      .eq('id', noteId);
    if (error) throw error;
  }

  // ============== CLIENTE DETALLADO ==============

  async getCustomerDetails(customerId: string): Promise<CustomerDetails | null> {
    const { data, error } = await supabase
      .from('customers')
      .select(`
        id, full_name, email, phone, avatar_url, organization_id,
        identification_type, identification_number, address, city,
        company_name, customer_type, tags, roles, notes
      `)
      .eq('id', customerId)
      .single();

    if (error) {
      console.warn('Advertencia obteniendo detalles del cliente:', error.message);
      return null;
    }
    return data;
  }
}

export const opportunitiesService = new OpportunitiesService();
