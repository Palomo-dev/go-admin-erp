import { supabase } from '@/lib/supabase/config';
import type { ChannelIdentity, DuplicateGroup, IdentityFilters, MergeResult } from './types';

class IdentidadesService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getIdentities(filters: IdentityFilters): Promise<ChannelIdentity[]> {
    // Obtener customers y generar identidades virtuales desde email/phone
    let query = supabase
      .from('customers')
      .select('id, full_name, email, phone, created_at, updated_at, last_seen_at')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });

    // Filtro de búsqueda
    if (filters.search) {
      query = query.or(`email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`);
    }

    const { data: customers, error } = await query.limit(300);

    if (error) {
      console.error('Error fetching customers:', error);
      return [];
    }

    // Generar identidades virtuales desde customers
    const identities: ChannelIdentity[] = [];
    
    for (const customer of customers || []) {
      // Identidad de email (si no es visitor_session)
      if (customer.email && !customer.email.includes('@widget.local')) {
        if (!filters.identityType || filters.identityType === 'email') {
          identities.push({
            id: `email_${customer.id}`,
            organization_id: this.organizationId,
            customer_id: customer.id,
            channel_id: '',
            identity_type: 'email',
            identity_value: customer.email,
            verified: true,
            metadata: null,
            first_seen_at: customer.created_at,
            last_seen_at: customer.last_seen_at || customer.updated_at,
            created_at: customer.created_at,
            updated_at: customer.updated_at,
            customer: {
              id: customer.id,
              full_name: customer.full_name,
              email: customer.email,
              phone: customer.phone
            }
          });
        }
      }

      // Identidad de teléfono
      if (customer.phone) {
        if (!filters.identityType || filters.identityType === 'phone') {
          identities.push({
            id: `phone_${customer.id}`,
            organization_id: this.organizationId,
            customer_id: customer.id,
            channel_id: '',
            identity_type: 'phone',
            identity_value: customer.phone,
            verified: true,
            metadata: null,
            first_seen_at: customer.created_at,
            last_seen_at: customer.last_seen_at || customer.updated_at,
            created_at: customer.created_at,
            updated_at: customer.updated_at,
            customer: {
              id: customer.id,
              full_name: customer.full_name,
              email: customer.email,
              phone: customer.phone
            }
          });
        }
      }

      // WhatsApp (basado en el teléfono con formato internacional)
      if (customer.phone && customer.phone.startsWith('+')) {
        if (!filters.identityType || filters.identityType === 'whatsapp_id') {
          identities.push({
            id: `whatsapp_${customer.id}`,
            organization_id: this.organizationId,
            customer_id: customer.id,
            channel_id: '',
            identity_type: 'whatsapp_id',
            identity_value: customer.phone,
            verified: false,
            metadata: null,
            first_seen_at: customer.created_at,
            last_seen_at: customer.last_seen_at || customer.updated_at,
            created_at: customer.created_at,
            updated_at: customer.updated_at,
            customer: {
              id: customer.id,
              full_name: customer.full_name,
              email: customer.email,
              phone: customer.phone
            }
          });
        }
      }
    }

    return identities;
  }

  async getDuplicates(): Promise<DuplicateGroup[]> {
    // Obtener todos los customers con email o phone
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, full_name, email, phone, created_at')
      .eq('organization_id', this.organizationId);

    if (error || !customers) {
      console.error('Error fetching customers for duplicates:', error);
      return [];
    }

    // Buscar duplicados por email
    const emailGroups: Record<string, DuplicateGroup> = {};
    const phoneGroups: Record<string, DuplicateGroup> = {};

    for (const customer of customers) {
      // Agrupar por email (excluyendo widget.local)
      if (customer.email && !customer.email.includes('@widget.local')) {
        const emailKey = customer.email.toLowerCase();
        if (!emailGroups[emailKey]) {
          emailGroups[emailKey] = {
            identity_type: 'email',
            identity_value: customer.email,
            customers: []
          };
        }
        emailGroups[emailKey].customers.push({
          id: customer.id,
          full_name: customer.full_name,
          email: customer.email,
          phone: customer.phone,
          conversations_count: 0,
          opportunities_count: 0,
          last_activity: null
        });
      }

      // Agrupar por teléfono
      if (customer.phone) {
        const phoneKey = customer.phone.replace(/\D/g, '');
        if (!phoneGroups[phoneKey]) {
          phoneGroups[phoneKey] = {
            identity_type: 'phone',
            identity_value: customer.phone,
            customers: []
          };
        }
        phoneGroups[phoneKey].customers.push({
          id: customer.id,
          full_name: customer.full_name,
          email: customer.email,
          phone: customer.phone,
          conversations_count: 0,
          opportunities_count: 0,
          last_activity: null
        });
      }
    }

    // Filtrar solo duplicados (más de 1 cliente)
    const duplicates: DuplicateGroup[] = [
      ...Object.values(emailGroups).filter(g => g.customers.length > 1),
      ...Object.values(phoneGroups).filter(g => g.customers.length > 1)
    ];

    // Obtener conteos para duplicados
    for (const group of duplicates) {
      for (const customer of group.customers) {
        const [convResult, oppResult] = await Promise.all([
          supabase
            .from('conversations')
            .select('id', { count: 'exact' })
            .eq('customer_id', customer.id),
          supabase
            .from('opportunities')
            .select('id', { count: 'exact' })
            .eq('customer_id', customer.id)
        ]);
        customer.conversations_count = convResult.count || 0;
        customer.opportunities_count = oppResult.count || 0;
      }
    }

    return duplicates;
  }

  async updateIdentity(
    id: string, 
    updates: Partial<Pick<ChannelIdentity, 'identity_value' | 'verified'>>
  ): Promise<boolean> {
    const { error } = await supabase
      .from('customer_channel_identities')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error updating identity:', error);
      return false;
    }

    return true;
  }

  async verifyIdentity(id: string): Promise<boolean> {
    return this.updateIdentity(id, { verified: true });
  }

  async deleteIdentity(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('customer_channel_identities')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error deleting identity:', error);
      return false;
    }

    return true;
  }

  async mergeCustomers(
    primaryCustomerId: string, 
    secondaryCustomerIds: string[]
  ): Promise<MergeResult> {
    try {
      // Actualizar conversaciones
      for (const secondaryId of secondaryCustomerIds) {
        await supabase
          .from('conversations')
          .update({ customer_id: primaryCustomerId })
          .eq('customer_id', secondaryId)
          .eq('organization_id', this.organizationId);

        // Actualizar oportunidades
        await supabase
          .from('opportunities')
          .update({ customer_id: primaryCustomerId })
          .eq('customer_id', secondaryId)
          .eq('organization_id', this.organizationId);

        // Actualizar campaign_contacts
        await supabase
          .from('campaign_contacts')
          .update({ customer_id: primaryCustomerId })
          .eq('customer_id', secondaryId);

        // Actualizar activities
        await supabase
          .from('activities')
          .update({ customer_id: primaryCustomerId })
          .eq('customer_id', secondaryId)
          .eq('organization_id', this.organizationId);

        // Actualizar identidades
        await supabase
          .from('customer_channel_identities')
          .update({ customer_id: primaryCustomerId })
          .eq('customer_id', secondaryId)
          .eq('organization_id', this.organizationId);

        // Marcar cliente secundario como inactivo
        await supabase
          .from('customers')
          .update({ 
            is_active: false,
            metadata: { merged_into: primaryCustomerId, merged_at: new Date().toISOString() }
          })
          .eq('id', secondaryId)
          .eq('organization_id', this.organizationId);
      }

      return {
        success: true,
        message: `${secondaryCustomerIds.length} cliente(s) fusionado(s) correctamente`,
        mergedCustomerId: primaryCustomerId
      };
    } catch (error) {
      console.error('Error merging customers:', error);
      return {
        success: false,
        message: 'Error al fusionar clientes'
      };
    }
  }

  async getChannels() {
    const { data } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', this.organizationId)
      .order('name');
    return data || [];
  }

  async getStats() {
    // Obtener customers y calcular stats desde email/phone
    const { data: customers } = await supabase
      .from('customers')
      .select('id, email, phone')
      .eq('organization_id', this.organizationId);

    const list = customers || [];
    
    // Contar emails válidos (no widget.local)
    const emailCount = list.filter(c => c.email && !c.email.includes('@widget.local')).length;
    const phoneCount = list.filter(c => c.phone).length;
    const whatsappCount = list.filter(c => c.phone && c.phone.startsWith('+')).length;
    
    // Total de identidades (cada customer puede tener email + phone + whatsapp)
    const total = emailCount + phoneCount + whatsappCount;

    return {
      total,
      phone: phoneCount,
      email: emailCount,
      whatsapp: whatsappCount,
      verified: emailCount + phoneCount, // emails y phones se consideran verificados
      unverified: whatsappCount // whatsapp no verificado
    };
  }

  async exportToCSV(data: ChannelIdentity[]): Promise<void> {
    const csvData = data.map(i => ({
      'Tipo': i.identity_type,
      'Valor': i.identity_value,
      'Verificado': i.verified ? 'Sí' : 'No',
      'Cliente': i.customer?.full_name || 'Sin nombre',
      'Email Cliente': i.customer?.email || '',
      'Teléfono Cliente': i.customer?.phone || '',
      'Canal': i.channel?.name || '',
      'Primera vez': i.first_seen_at || '',
      'Última vez': i.last_seen_at || '',
      'Creado': i.created_at
    }));

    const headers = Object.keys(csvData[0] || {});
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => 
        headers.map(h => {
          const val = row[h as keyof typeof row];
          if (typeof val === 'string' && val.includes(',')) {
            return `"${val}"`;
          }
          return val ?? '';
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `identidades_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }
}

export const createIdentidadesService = (organizationId: number) => new IdentidadesService(organizationId);
export default IdentidadesService;
