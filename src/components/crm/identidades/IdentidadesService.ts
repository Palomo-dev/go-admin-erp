import { supabase } from '@/lib/supabase/config';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';
import { todayInTz } from '@/lib/utils/dateDisplay';
import type { ChannelIdentity, IdentityFilters } from './types';

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
      // Término entrecomillado (helper único): comas, paréntesis o comillas no rompen el `or`.
      const filter = ilikeAnyOf(['email', 'phone', 'full_name'], filters.search);
      if (filter) query = query.or(filter);
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
    // Día del nombre del archivo: la fecha de hoy sin pasar por UTC.
    link.download = `identidades_${todayInTz()}.csv`;
    link.click();
  }
}

export const createIdentidadesService = (organizationId: number) => new IdentidadesService(organizationId);
export default IdentidadesService;
