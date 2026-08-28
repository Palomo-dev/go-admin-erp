import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM - Programa de referidos y canal indirecto (FASE 5).
 *
 * Gestiona:
 * 1. Configuración del programa de referidos (guardada en
 *    organization_preferences.settings.crm.referral_program JSONB)
 * 2. Registro de referidos (tabla `referrals` si existe, o `customers.metadata`)
 * 3. Partners (customers con customer_type='partner' + metadata)
 *
 * Tabla: organization_preferences (organization_id, settings JSONB)
 * Tabla: customers (id, organization_id, customer_type, metadata JSONB)
 * Tabla: referrals (id, organization_id, origin_customer_id, referred_customer_id,
 *        estado, recompensa, created_at, updated_at) — fallback a customers.metadata
 */

// ============== Tipos ==============

export interface ReferralProgramConfig {
  enabled: boolean;
  incentive_type: 'discount' | 'cashback' | 'credit' | 'gift';
  incentive_value: number;
  incentive_description: string;
  eligibility: {
    min_purchase?: number;
    valid_for_days?: number;
    new_customers_only: boolean;
  };
  reward_to: 'referrer' | 'referred' | 'both';
  reward_description: string;
}

export interface Referral {
  id: string;
  organization_id: number;
  origin_customer_id: string;
  origin_customer_name: string;
  referred_customer_id: string;
  referred_customer_name: string;
  estado: 'pending' | 'completed' | 'rewarded' | 'cancelled';
  recompensa: string | null;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  organization_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  customer_type: string;
  nivel: string;
  comision: number;
  metadata: Record<string, unknown>;
}

export interface CreateReferralInput {
  origin_customer_id: string;
  referred_customer_id: string;
  recompensa?: string;
}

// ============== Servicio ==============

class ReferralsService {
  private getOrgId(): number {
    return getOrganizationId();
  }

  /**
   * Obtiene la configuración del programa de referidos desde
   * organization_preferences.settings.crm.referral_program.
   */
  async getReferralProgram(): Promise<ReferralProgramConfig | null> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return null;

      const { data, error } = await supabase
        .from('organization_preferences')
        .select('settings')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error || !data) return null;

      const settings = data.settings as Record<string, unknown> | null;
      if (!settings) return null;

      const crmSettings = settings.crm as Record<string, unknown> | null;
      if (!crmSettings) return null;

      const program = crmSettings.referral_program as ReferralProgramConfig | null;
      return program || null;
    } catch (err) {
      console.error('Error en referralsService.getReferralProgram:', err);
      return null;
    }
  }

  /**
   * Guarda la configuración del programa de referidos en
   * organization_preferences.settings.crm.referral_program (upsert).
   */
  async saveReferralProgram(config: ReferralProgramConfig): Promise<boolean> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return false;

      // 1. Obtener settings actuales
      const { data: existing, error: fetchError } = await supabase
        .from('organization_preferences')
        .select('settings')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.warn('Advertencia obteniendo preferences:', fetchError.message);
      }

      const currentSettings = (existing?.settings as Record<string, unknown>) || {};
      const crmSettings = (currentSettings.crm as Record<string, unknown>) || {};

      // 2. Merge: preservar otros settings de CRM
      const updatedSettings = {
        ...currentSettings,
        crm: {
          ...crmSettings,
          referral_program: config,
        },
      };

      // 3. Upsert
      if (existing) {
        const { error: updateError } = await supabase
          .from('organization_preferences')
          .update({ settings: updatedSettings as unknown as Record<string, unknown> })
          .eq('organization_id', orgId);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('organization_preferences')
          .insert({
            organization_id: orgId,
            settings: updatedSettings as unknown as Record<string, unknown>,
          });

        if (insertError) throw insertError;
      }

      return true;
    } catch (err) {
      console.error('Error en referralsService.saveReferralProgram:', err);
      return false;
    }
  }

  /**
   * Crea un registro de referido.
   * Intenta usar la tabla `referrals`; si no existe, usa customers.metadata.
   */
  async createReferral(input: CreateReferralInput): Promise<Referral | null> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return null;

      // Intentar insertar en tabla referrals
      const { data, error } = await supabase
        .from('referrals')
        .insert({
          organization_id: orgId,
          origin_customer_id: input.origin_customer_id,
          referred_customer_id: input.referred_customer_id,
          estado: 'pending',
          recompensa: input.recompensa || null,
        })
        .select('id, created_at, updated_at')
        .single();

      if (!error && data) {
        // Obtener nombres de clientes
        const [origin, referred] = await Promise.all([
          this.getCustomerName(input.origin_customer_id),
          this.getCustomerName(input.referred_customer_id),
        ]);

        return {
          id: (data as { id: string }).id,
          organization_id: orgId,
          origin_customer_id: input.origin_customer_id,
          origin_customer_name: origin,
          referred_customer_id: input.referred_customer_id,
          referred_customer_name: referred,
          estado: 'pending',
          recompensa: input.recompensa || null,
          created_at: (data as { created_at: string }).created_at,
          updated_at: (data as { updated_at: string }).updated_at,
        };
      }

      // Fallback: usar customers.metadata del cliente referido
      if (error && (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist'))) {
        return await this.createReferralViaMetadata(input, orgId);
      }

      // Otro error
      console.warn('Error creando referral:', error?.message);
      return null;
    } catch (err) {
      console.error('Error en referralsService.createReferral:', err);
      return null;
    }
  }

  /**
   * Lista los referidos de la organización.
   */
  async listReferrals(): Promise<Referral[]> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('referrals')
        .select(`
          id,
          organization_id,
          origin_customer_id,
          referred_customer_id,
          estado,
          recompensa,
          created_at,
          updated_at
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback a metadata
        if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
          return await this.listReferralsViaMetadata(orgId);
        }
        console.warn('Advertencia listando referrals:', error.message);
        return [];
      }

      if (!data || data.length === 0) return [];

      // Obtener nombres de clientes
      const customerIds = new Set<string>();
      for (const row of data as Array<Record<string, unknown>>) {
        customerIds.add(row.origin_customer_id as string);
        customerIds.add(row.referred_customer_id as string);
      }

      const nameMap = await this.getCustomerNames(Array.from(customerIds));

      return (data as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        organization_id: row.organization_id as number,
        origin_customer_id: row.origin_customer_id as string,
        origin_customer_name: nameMap[row.origin_customer_id as string] || 'N/A',
        referred_customer_id: row.referred_customer_id as string,
        referred_customer_name: nameMap[row.referred_customer_id as string] || 'N/A',
        estado: (row.estado as Referral['estado']) || 'pending',
        recompensa: (row.recompensa as string) || null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      }));
    } catch (err) {
      console.error('Error en referralsService.listReferrals:', err);
      return [];
    }
  }

  /**
   * Actualiza el estado de un referido.
   */
  async updateReferralStatus(
    id: string,
    status: Referral['estado']
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('referrals')
        .update({
          estado: status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        console.warn('Error actualizando referral status:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error en referralsService.updateReferralStatus:', err);
      return false;
    }
  }

  /**
   * Lista los partners (customers con customer_type='partner').
   */
  async listPartners(): Promise<Partner[]> {
    try {
      const orgId = this.getOrgId();
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('customers')
        .select('id, organization_id, full_name, email, phone, customer_type, metadata')
        .eq('organization_id', orgId)
        .eq('customer_type', 'partner')
        .order('full_name');

      if (error || !data) return [];

      return (data as Array<Record<string, unknown>>).map((row) => {
        const metadata = (row.metadata as Record<string, unknown>) || {};
        return {
          id: row.id as string,
          organization_id: row.organization_id as number,
          full_name: row.full_name as string,
          email: (row.email as string) || null,
          phone: (row.phone as string) || null,
          customer_type: (row.customer_type as string) || 'partner',
          nivel: (metadata.nivel as string) || 'standard',
          comision: Number(metadata.comision) || 0,
          metadata,
        };
      });
    } catch (err) {
      console.error('Error en referralsService.listPartners:', err);
      return [];
    }
  }

  // ============== Helpers internos ==============

  private async getCustomerName(customerId: string): Promise<string> {
    try {
      const { data } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', customerId)
        .maybeSingle();

      return (data as { full_name?: string })?.full_name || 'N/A';
    } catch {
      return 'N/A';
    }
  }

  private async getCustomerNames(
    customerIds: string[]
  ): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    if (customerIds.length === 0) return map;

    try {
      const { data } = await supabase
        .from('customers')
        .select('id, full_name')
        .in('id', customerIds);

      for (const row of (data || []) as Array<{ id: string; full_name: string }>) {
        map[row.id] = row.full_name;
      }
    } catch {
      // Silencioso
    }
    return map;
  }

  /**
   * Fallback: crea un referido usando customers.metadata del cliente referido.
   */
  private async createReferralViaMetadata(
    input: CreateReferralInput,
    orgId: number
  ): Promise<Referral | null> {
    try {
      const now = new Date().toISOString();
      const referralEntry = {
        referred_by: input.origin_customer_id,
        estado: 'pending',
        recompensa: input.recompensa || null,
        created_at: now,
      };

      // Obtener metadata actual del cliente referido
      const { data: customer } = await supabase
        .from('customers')
        .select('metadata')
        .eq('id', input.referred_customer_id)
        .maybeSingle();

      const currentMetadata = (customer?.metadata as Record<string, unknown>) || {};
      const referrals = (currentMetadata.referrals as unknown[]) || [];
      referrals.push(referralEntry);

      const { error: updateError } = await supabase
        .from('customers')
        .update({
          metadata: { ...currentMetadata, referrals },
        })
        .eq('id', input.referred_customer_id);

      if (updateError) throw updateError;

      const [origin, referred] = await Promise.all([
        this.getCustomerName(input.origin_customer_id),
        this.getCustomerName(input.referred_customer_id),
      ]);

      return {
        id: `${input.referred_customer_id}-${referrals.length}`,
        organization_id: orgId,
        origin_customer_id: input.origin_customer_id,
        origin_customer_name: origin,
        referred_customer_id: input.referred_customer_id,
        referred_customer_name: referred,
        estado: 'pending',
        recompensa: input.recompensa || null,
        created_at: now,
        updated_at: now,
      };
    } catch (err) {
      console.error('Error en createReferralViaMetadata:', err);
      return null;
    }
  }

  /**
   * Fallback: lista referidos desde customers.metadata.
   */
  private async listReferralsViaMetadata(orgId: number): Promise<Referral[]> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, metadata')
        .eq('organization_id', orgId)
        .not('metadata', 'is', null);

      if (error || !data) return [];

      const results: Referral[] = [];

      for (const customer of data as Array<Record<string, unknown>>) {
        const metadata = customer.metadata as Record<string, unknown> | null;
        const referrals = (metadata?.referrals as Array<Record<string, unknown>>) || [];

        for (const ref of referrals) {
          const originId = ref.referred_by as string;
          const originName = await this.getCustomerName(originId);
          results.push({
            id: `${customer.id}-${results.length}`,
            organization_id: orgId,
            origin_customer_id: originId,
            origin_customer_name: originName,
            referred_customer_id: customer.id as string,
            referred_customer_name: customer.full_name as string,
            estado: (ref.estado as Referral['estado']) || 'pending',
            recompensa: (ref.recompensa as string) || null,
            created_at: (ref.created_at as string) || new Date().toISOString(),
            updated_at: (ref.created_at as string) || new Date().toISOString(),
          });
        }
      }

      return results;
    } catch (err) {
      console.error('Error en listReferralsViaMetadata:', err);
      return [];
    }
  }
}

export const referralsService = new ReferralsService();
export default referralsService;
