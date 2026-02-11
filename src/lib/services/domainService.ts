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
  vercel_state: Record<string, any>;
  last_vercel_sync_at: string | null;
  redirect_to_domain_id: string | null;
  redirect_status_code: number | null;
  metadata: Record<string, any>;
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
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface UpdateDomainInput {
  host?: string;
  domain_type?: DomainType;
  is_primary?: boolean;
  is_active?: boolean;
  redirect_to_domain_id?: string | null;
  redirect_status_code?: number | null;
  metadata?: Record<string, any>;
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

    // Si es subdominio, marcarlo como verificado automáticamente
    const isSubdomain = input.domain_type === 'subdomain';

    const { data, error } = await supabase
      .from('organization_domains')
      .insert({
        ...input,
        verification_type: isSubdomain ? null : 'TXT',
        verification_token: isSubdomain ? null : verificationToken,
        verification_record: isSubdomain ? null : verificationRecord,
        verification_value: isSubdomain ? null : verificationValue,
        status: isSubdomain ? 'verified' : 'pending',
        verified_at: isSubdomain ? new Date().toISOString() : null,
        verification_attempts: 0,
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

  // Verificar dominio (simular verificación DNS)
  async verifyDomain(id: string): Promise<{ success: boolean; message: string }> {
    // Obtener el dominio actual
    const domain = await this.getDomainById(id);
    if (!domain) {
      return { success: false, message: 'Dominio no encontrado' };
    }

    // Incrementar intentos de verificación
    const newAttempts = (domain.verification_attempts || 0) + 1;

    // Simular verificación DNS (en producción, esto consultaría DNS real)
    // Por ahora, marcamos como verificado después de 3 intentos o si es subdominio
    const isVerified = domain.domain_type === 'subdomain' || newAttempts >= 3;

    const { error } = await supabase
      .from('organization_domains')
      .update({
        status: isVerified ? 'verified' : 'pending',
        verified_at: isVerified ? new Date().toISOString() : null,
        verification_attempts: newAttempts,
        last_verification_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error verifying domain:', error);
      return { success: false, message: 'Error al verificar dominio' };
    }

    if (isVerified) {
      return { success: true, message: 'Dominio verificado exitosamente' };
    }

    return { 
      success: false, 
      message: `Verificación pendiente. Intento ${newAttempts} de 3. Asegúrate de haber configurado el registro DNS correctamente.` 
    };
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

  // Sincronizar con Vercel (simulado)
  async syncWithVercel(id: string): Promise<{ success: boolean; message: string }> {
    const domain = await this.getDomainById(id);
    if (!domain) {
      return { success: false, message: 'Dominio no encontrado' };
    }

    // Simular sincronización con Vercel
    const { error } = await supabase
      .from('organization_domains')
      .update({
        vercel_state: {
          synced: true,
          last_check: new Date().toISOString(),
          status: 'active',
        },
        last_vercel_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error syncing with Vercel:', error);
      return { success: false, message: 'Error al sincronizar con Vercel' };
    }

    return { success: true, message: 'Dominio sincronizado con Vercel exitosamente' };
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
      } catch (error: any) {
        failed++;
        errors.push(`Error al importar ${domainData.host}: ${error.message}`);
      }
    }

    return { success, failed, errors };
  },
};

export default domainService;
