import { supabase } from '@/lib/supabase/config';
import { Organizacion } from '@/lib/hooks/useOrganization';

// Interfaz extendida de Organizacion para manejar todos los campos de la tabla
export interface Organization extends Organizacion {
  description?: string;
  website?: string;
  email?: string;
  phone?: string;
  tax_id?: string;
  status?: string;
  type_id?: number;
  owner_user_id?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  nit?: string;
  primary_color?: string;
  secondary_color?: string;
  subdomain?: string;
  custom_domain?: string;
  legal_name?: string;
  uuid?: string;
  // Campos relacionados al rol del miembro en la organización
  role?: string;
  is_super_admin?: boolean;
}

export const organizationService = {
  /**
   * Obtiene todas las organizaciones a las que pertenece un usuario
   */
  async getUserOrganizations(userId: string): Promise<Organization[]> {
    // Hacer la consulta a Supabase
    const { data, error } = await supabase
      .from('organization_members')
      .select(`
        organization_id,
        is_super_admin,
        is_active,
        role_id (id, name),
        organizations:organizations (id, name, description, logo_url, status, primary_color, secondary_color, subdomain, legal_name)
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Error al obtener organizaciones del usuario:', error);
      throw new Error(error.message);
    }

    // Transformar la respuesta para que tenga el formato correcto
    const organizations: Organization[] = [];
    
    if (data && Array.isArray(data)) {
      data.forEach((item: any) => {
        // Verificar que el item tiene la estructura esperada
        if (item && 
            item.organizations && 
            typeof item.organizations === 'object' && 
            'id' in item.organizations && 
            'name' in item.organizations) {
          
          organizations.push({
            id: Number(item.organizations.id),
            name: String(item.organizations.name),
            description: item.organizations.description ? String(item.organizations.description) : undefined,
            logo_url: item.organizations.logo_url ? String(item.organizations.logo_url) : undefined,
            status: item.organizations.status ? String(item.organizations.status) : undefined,
            primary_color: item.organizations.primary_color ? String(item.organizations.primary_color) : undefined,
            secondary_color: item.organizations.secondary_color ? String(item.organizations.secondary_color) : undefined,
            subdomain: item.organizations.subdomain ? String(item.organizations.subdomain) : undefined,
            legal_name: item.organizations.legal_name ? String(item.organizations.legal_name) : undefined,
            // Añadir el rol y estatus de miembro
            role: item.role_id.name ? String(item.role_id.name) : undefined,
            is_super_admin: Boolean(item.is_super_admin)
          });
        }
      });
    }
    
    return organizations;
  },

  /**
   * Obtiene una organización por su ID
   */
  async getOrganizationById(organizationId: number): Promise<Organization> {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single();

    if (error) {
      console.error('Error al obtener organización:', error);
      throw new Error(error.message);
    }

    return data;
  },

  /**
   * Crea una nueva organización
   */
  async createOrganization(organization: Organization, userId: string): Promise<Organization> {
    // Primero creamos la organización
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert([{
        ...organization,
        created_by: userId,
        owner_user_id: userId,
        status: 'active'
      }])
      .select()
      .single();

    if (orgError) {
      console.error('Error al crear organización:', orgError);
      throw new Error(orgError.message);
    }

    // Luego añadimos al usuario como miembro con rol de superadmin
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert([{
        organization_id: orgData.id,
        user_id: userId,
        role_id: 'admin',
        is_super_admin: true,
        is_active: true
      }]);

    if (memberError) {
      console.error('Error al agregar miembro a la organización:', memberError);
      // No lanzamos error aquí para no impedir la creación de la organización
    }

    return orgData;
  }
};

export default organizationService;
