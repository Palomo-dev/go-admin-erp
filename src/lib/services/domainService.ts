import { supabase } from '@/lib/supabase/config';

// Tipos
export type DomainType = 'subdomain' | 'custom_domain';
export type DomainStatus = 'pending' | 'verified' | 'failed';
export type VerificationType = 'TXT' | 'CNAME';

export interface OrganizationDomain {
  id: string;
  organization_id: number;
  host: string;
  domain_type: DomainType;
  status: DomainStatus;
  is_primary: boolean;
  is_active: boolean;
  verification_type: VerificationType | null;
  verification_token: string | null;
  verification_record: string | null;
  verification_value: string | null;
  verified_at: string | null;
  verification_attempts: number;
  last_verification_at: string | null;
  vercel_project_id: string | null;
  vercel_domain_id: string | null;
  vercel_state: Record<string, unknown>;
  last_vercel_sync_at: string | null;
  redirect_to_domain_id: string | null;
  redirect_status_code: number | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Relación para redirección
  redirect_to_domain?: OrganizationDomain | null;
}

export interface CreateDomainInput {
  organization_id: number;
  host: string;
  domain_type: DomainType;
  is_primary?: boolean;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  created_by?: string;
}

export interface UpdateDomainInput {
  host?: string;
  domain_type?: DomainType;
  is_primary?: boolean;
  is_active?: boolean;
  redirect_to_domain_id?: string | null;
  redirect_status_code?: number | null;
  metadata?: Record<string, unknown>;
}

// Función para generar token de verificación
function generateVerificationToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'go-admin-verify-';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Servicio de dominios
export const domainService = {
  // Obtener todos los dominios de una organización
  async getDomains(organizationId: number): Promise<OrganizationDomain[]> {
    const { data, error } = await supabase
      .from('organization_domains')
      .select('*')
      .eq('organization_id', organizationId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching domains:', error);
      throw error;
    }

    return data || [];
  },

  // Obtener un dominio por ID
  async getDomainById(id: string): Promise<OrganizationDomain | null> {
    const { data, error } = await supabase
      .from('organization_domains')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching domain:', error);
      return null;
    }

    return data;
  },

  // Crear un nuevo dominio
  async createDomain(input: CreateDomainInput): Promise<OrganizationDomain | null> {
    // Generar datos de verificación
    const verificationToken = generateVerificationToken();
    const verificationRecord = `_go-admin-challenge.${input.host}`;
    const verificationValue = verificationToken;

    const isSubdomain = input.domain_type === 'subdomain';

    // El estado NO lo decide el navegador (auditoría 2026-10, P0-8): todo
    // dominio nace `pending` y solo el servidor lo pasa a `verified` tras
    // consultar el DNS. Los subdominios del sistema los verifica la base.
    const { data, error } = await supabase
      .from('organization_domains')
      .insert({
        ...input,
        verification_type: isSubdomain ? null : 'TXT',
        verification_token: isSubdomain ? null : verificationToken,
        verification_record: isSubdomain ? null : verificationRecord,
        verification_value: isSubdomain ? null : verificationValue,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating domain:', error);
      throw error;
    }

    return data;
  },

  // Actualizar un dominio
  async updateDomain(id: string, input: UpdateDomainInput): Promise<OrganizationDomain | null> {
    const { data, error } = await supabase
      .from('organization_domains')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating domain:', error);
      throw error;
    }

    return data;
  },

  // Eliminar un dominio
  async deleteDomain(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('organization_domains')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting domain:', error);
      return false;
    }

    return true;
  },

  // Marcar dominio como primario
  async setPrimaryDomain(id: string, organizationId: number): Promise<boolean> {
    // Primero, desmarcar todos los dominios como no primarios
    const { error: resetError } = await supabase
      .from('organization_domains')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId);

    if (resetError) {
      console.error('Error resetting primary domains:', resetError);
      return false;
    }

    // Luego, marcar el dominio seleccionado como primario
    const { error } = await supabase
      .from('organization_domains')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error setting primary domain:', error);
      return false;
    }

    return true;
  },

  // Activar/Desactivar dominio
  async toggleDomainActive(id: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('organization_domains')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error toggling domain active:', error);
      return false;
    }

    return true;
  },

  /**
   * Verificar dominio: lo hace el servidor consultando el DNS real
   * (`POST /api/organizacion/dominios/[id]/verificar`, auditoría 2026-10,
   * P0-8). Antes se simulaba aquí y al tercer intento quedaba «verificado».
   */
  async verifyDomain(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`/api/organizacion/dominios/${encodeURIComponent(id)}/verificar`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
      if (res.ok) {
        return { success: json.success === true, message: json.message ?? json.error ?? '' };
      }
      return { success: false, message: json.error ?? json.message ?? 'Error al verificar dominio' };
    } catch {
      return { success: false, message: 'Error al verificar dominio' };
    }
  },

  // Configurar redirección
  async configureRedirect(
    id: string, 
    redirectToDomainId: string | null, 
    statusCode: number | null
  ): Promise<boolean> {
    const { error } = await supabase
      .from('organization_domains')
      .update({
        redirect_to_domain_id: redirectToDomainId,
        redirect_status_code: statusCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error configuring redirect:', error);
      return false;
    }

    return true;
  },

  /**
   * Sincronizar con Vercel: era una simulación que escribía `vercel_state`
   * desde el navegador (auditoría 2026-10, P0-8). Hasta que exista la
   * integración real en el servidor, no escribe nada y lo dice.
   */
  async syncWithVercel(id: string): Promise<{ success: boolean; message: string }> {
    void id; // misma firma que la pantalla; no hay nada que sincronizar todavía
    return {
      success: false,
      message: 'La sincronización con Vercel todavía no está disponible.',
    };
  },

  // Duplicar dominio
  async duplicateDomain(id: string): Promise<OrganizationDomain | null> {
    const domain = await this.getDomainById(id);
    if (!domain) {
      return null;
    }

    // Crear una copia del dominio con un nuevo host
    const newInput: CreateDomainInput = {
      organization_id: domain.organization_id,
      host: `copy-${domain.host}`,
      domain_type: 'custom_domain', // Por defecto, el duplicado es custom_domain
      is_primary: false,
      is_active: false,
      metadata: domain.metadata,
      created_by: domain.created_by || undefined,
    };

    return this.createDomain(newInput);
  },

  // Importar dominios desde CSV
  async importDomainsFromCSV(
    organizationId: number,
    domains: Array<{ host: string; domain_type?: DomainType }>
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const domainData of domains) {
      try {
        await this.createDomain({
          organization_id: organizationId,
          host: domainData.host,
          domain_type: domainData.domain_type || 'custom_domain',
          is_primary: false,
          is_active: true,
        });
        success++;
      } catch (error: unknown) {
        failed++;
        const mensaje = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
        errors.push(`Error al importar ${domainData.host}: ${mensaje}`);
      }
    }

    return { success, failed, errors };
  },
};

export default domainService;
