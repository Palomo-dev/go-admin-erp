/**
 * Servicio de gestion de consentimientos Open Finance.
 * Cumplimiento Decreto 0368 de 2026 (Open Finance Colombia).
 * Gestiona el ciclo de vida de consentimientos: creacion, revocacion,
 * verificacion, renovacion y estadisticas.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { OpenFinanceConsent, OpenFinanceConsentType } from './openFinanceTypes';

/** Tipos de consentimiento validos segun esquema de BD */
type ConsentType = OpenFinanceConsentType;

/** Input para crear un consentimiento */
export interface CreateConsentInput {
  organizationId: number;
  linkId?: string;
  consentType: ConsentType;
  purpose: string;
  scope?: Record<string, unknown>;
  expiresAt?: string;
  ipAddress?: string;
  userAgent?: string;
  userId: string;
}

/** Estadisticas de consentimientos de una organizacion */
export interface ConsentStats {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  byType: { data_access: number; payment_initiation: number; account_validation: number };
}

/** Consentimiento con informacion del link asociado */
type ConsentWithLink = OpenFinanceConsent & {
  link?: { id: string; institution_name: string | null; status: string | null } | null;
};

/** Duracion por defecto del consentimiento en dias */
const DEFAULT_CONSENT_DURATION_DAYS = 90;

/** Minimo de caracteres para considerar un proposito claro y especifico */
const MIN_PURPOSE_LENGTH = 10;

/**
 * Calcula la fecha de expiracion por defecto (90 dias desde ahora).
 */
function defaultExpirationDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_CONSENT_DURATION_DAYS);
  return date.toISOString();
}

export class ConsentService {
  /**
   * Crea un registro de consentimiento en open_finance_consents.
   * Valida que el proposito sea claro y especifico.
   * @param input Datos del consentimiento a crear
   * @returns ID del consentimiento creado
   */
  static async createConsent(input: CreateConsentInput): Promise<{ consentId: string }> {
    try {
      // Validar proposito claro y especifico
      if (!input.purpose || input.purpose.trim().length < MIN_PURPOSE_LENGTH) {
        throw new Error('El proposito del consentimiento debe ser claro y especifico');
      }

      const supabase = getSupabaseAdmin();
      const expiresAt = input.expiresAt || defaultExpirationDate();

      const { data, error } = await supabase
        .from('open_finance_consents')
        .insert({
          organization_id: input.organizationId,
          link_id: input.linkId || null,
          consent_type: input.consentType,
          purpose: input.purpose.trim(),
          scope: input.scope || null,
          granted_at: new Date().toISOString(),
          expires_at: expiresAt,
          revoked_at: null,
          revoked_reason: null,
          ip_address: input.ipAddress || null,
          user_agent: input.userAgent || null,
          granted_by: input.userId,
          status: 'active',
        })
        .select('id')
        .single();

      if (error) throw new Error(`Error al crear consentimiento: ${error.message}`);
      return { consentId: data.id };
    } catch (err) {
      throw new Error(
        `Error al crear consentimiento Open Finance: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Revoca un consentimiento marcandolo como revocado.
   * Registra motivo y fecha de revocacion. Si hay link asociado,
   * tambien lo marca como revocado.
   * @param consentId ID del consentimiento a revocar
   * @param reason Motivo de la revocacion
   * @returns Confirmacion de la operacion
   */
  static async revokeConsent(
    consentId: string,
    reason: string,
  ): Promise<{ success: boolean }> {
    try {
      if (!reason || reason.trim().length === 0) {
        throw new Error('El motivo de revocacion es requerido');
      }

      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();

      // Marcar consentimiento como revocado
      const { data: consent, error: consentError } = await supabase
        .from('open_finance_consents')
        .update({
          status: 'revoked',
          revoked_at: now,
          revoked_reason: reason.trim(),
        })
        .eq('id', consentId)
        .select('link_id')
        .single();

      if (consentError) throw new Error(`Error al revocar consentimiento: ${consentError.message}`);

      // Si hay link asociado, marcarlo como revocado
      if (consent?.link_id) {
        const { error: linkError } = await supabase
          .from('open_finance_links')
          .update({ status: 'revoked', session_key: null })
          .eq('id', consent.link_id);

        if (linkError) {
          console.error('Error al revocar link asociado:', linkError.message);
        }
      }

      return { success: true };
    } catch (err) {
      throw new Error(
        `Error al revocar consentimiento: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Lista los consentimientos de una organizacion.
   * Filtros opcionales por estado y tipo. Incluye informacion del link asociado.
   * @param organizationId ID de la organizacion
   * @param filters Filtros opcionales (status, consentType)
   * @returns Lista de consentimientos
   */
  static async listConsents(
    organizationId: number,
    filters?: { status?: string; consentType?: string },
  ): Promise<ConsentWithLink[]> {
    try {
      const supabase = getSupabaseAdmin();
      let query = supabase
        .from('open_finance_consents')
        .select(
          '*, link:open_finance_links(id, institution_name, status)',
        )
        .eq('organization_id', organizationId);

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.consentType) {
        query = query.eq('consent_type', filters.consentType);
      }

      const { data, error } = await query.order('granted_at', { ascending: false });

      if (error) throw new Error(`Error al listar consentimientos: ${error.message}`);
      return (data || []) as unknown as ConsentWithLink[];
    } catch (err) {
      throw new Error(
        `Error al listar consentimientos: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Verifica que exista un consentimiento activo y no expirado
   * para un link y tipo de consentimiento especificos.
   * @param linkId ID del link
   * @param consentType Tipo de consentimiento a verificar
   * @returns Validez y motivo si no es valido
   */
  static async verifyConsent(
    linkId: string,
    consentType: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('open_finance_consents')
        .select('id, status, expires_at')
        .eq('link_id', linkId)
        .eq('consent_type', consentType)
        .order('granted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`Error al verificar consentimiento: ${error.message}`);

      if (!data) {
        return { valid: false, reason: 'No existe consentimiento para este link y tipo' };
      }

      if (data.status === 'revoked') {
        return { valid: false, reason: 'El consentimiento fue revocado' };
      }

      if (data.status === 'expired') {
        return { valid: false, reason: 'El consentimiento ha expirado' };
      }

      // Verificar expiracion por fecha aunque el status sea active
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return { valid: false, reason: 'El consentimiento ha expirado por fecha' };
      }

      return { valid: true };
    } catch (err) {
      throw new Error(
        `Error al verificar consentimiento: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Obtiene un consentimiento por su ID.
   * @param consentId ID del consentimiento
   * @returns Consentimiento o null si no existe
   */
  static async getConsent(consentId: string): Promise<OpenFinanceConsent | null> {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('open_finance_consents')
        .select('*')
        .eq('id', consentId)
        .maybeSingle();

      if (error) throw new Error(`Error al obtener consentimiento: ${error.message}`);
      return (data as unknown as OpenFinanceConsent) ?? null;
    } catch (err) {
      throw new Error(
        `Error al obtener consentimiento: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Renueva un consentimiento creando uno nuevo basado en uno existente.
   * Extiende la expiracion 90 dias mas y marca el anterior como expirado.
   * @param consentId ID del consentimiento a renovar
   * @param userId ID del usuario que renueva
   * @returns ID del nuevo consentimiento
   */
  static async renewConsent(
    consentId: string,
    userId: string,
  ): Promise<{ consentId: string }> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener consentimiento original
      const { data: original, error: fetchError } = await supabase
        .from('open_finance_consents')
        .select('*')
        .eq('id', consentId)
        .single();

      if (fetchError) throw new Error(`Consentimiento no encontrado: ${fetchError.message}`);
      if (!original) throw new Error('Consentimiento no encontrado');

      // Marcar el anterior como expirado
      const { error: expireError } = await supabase
        .from('open_finance_consents')
        .update({ status: 'expired' })
        .eq('id', consentId);

      if (expireError) {
        console.error('Error al expirar consentimiento anterior:', expireError.message);
      }

      // Crear nuevo consentimiento con expiracion extendida
      const newExpiresAt = defaultExpirationDate();
      const { data: newConsent, error: createError } = await supabase
        .from('open_finance_consents')
        .insert({
          organization_id: original.organization_id,
          link_id: original.link_id,
          consent_type: original.consent_type,
          purpose: original.purpose,
          scope: original.scope,
          granted_at: new Date().toISOString(),
          expires_at: newExpiresAt,
          revoked_at: null,
          revoked_reason: null,
          ip_address: original.ip_address,
          user_agent: original.user_agent,
          granted_by: userId,
          status: 'active',
        })
        .select('id')
        .single();

      if (createError) throw new Error(`Error al renovar consentimiento: ${createError.message}`);

      // Actualizar el link asociado con el nuevo consent_id
      if (original.link_id) {
        const { error: linkError } = await supabase
          .from('open_finance_links')
          .update({ consent_id: newConsent.id })
          .eq('id', original.link_id);

        if (linkError) {
          console.error('Error al actualizar link con nuevo consentimiento:', linkError.message);
        }
      }

      return { consentId: newConsent.id };
    } catch (err) {
      throw new Error(
        `Error al renovar consentimiento: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Obtiene estadisticas de consentimientos de una organizacion.
   * @param organizationId ID de la organizacion
   * @returns Totales por estado y por tipo
   */
  static async getConsentStats(organizationId: number): Promise<ConsentStats> {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('open_finance_consents')
        .select('status, consent_type')
        .eq('organization_id', organizationId);

      if (error) throw new Error(`Error al obtener estadisticas: ${error.message}`);

      const stats: ConsentStats = {
        total: 0,
        active: 0,
        revoked: 0,
        expired: 0,
        byType: { data_access: 0, payment_initiation: 0, account_validation: 0 },
      };

      for (const row of data || []) {
        stats.total += 1;
        if (row.status === 'active') stats.active += 1;
        else if (row.status === 'revoked') stats.revoked += 1;
        else if (row.status === 'expired') stats.expired += 1;

        if (row.consent_type === 'data_access') stats.byType.data_access += 1;
        else if (row.consent_type === 'payment_initiation') stats.byType.payment_initiation += 1;
        else if (row.consent_type === 'account_validation') stats.byType.account_validation += 1;
      }

      return stats;
    } catch (err) {
      throw new Error(
        `Error al obtener estadisticas de consentimientos: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/** Instancia singleton del servicio */
export const consentService = ConsentService;
