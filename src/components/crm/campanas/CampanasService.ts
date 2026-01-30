import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  Campaign,
  CampaignContact,
  Channel,
  CreateCampaignInput,
  UpdateCampaignInput,
  CampaignStats,
  CampaignStatus,
} from './types';

class CampanasServiceClass {
  private getOrgId(): number {
    return getOrganizationId();
  }

  async getCampaigns(): Promise<Campaign[]> {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          segment:segments(id, name, customer_count)
        `)
        .eq('organization_id', this.getOrgId())
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error obteniendo campañas:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn('Error en getCampaigns');
      return [];
    }
  }

  async getCampaignById(id: string): Promise<Campaign | null> {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          segment:segments(id, name, customer_count)
        `)
        .eq('id', id)
        .eq('organization_id', this.getOrgId())
        .single();

      if (error) {
        console.warn('Error obteniendo campaña:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.warn('Error en getCampaignById');
      return null;
    }
  }

  async createCampaign(input: CreateCampaignInput): Promise<Campaign | null> {
    try {
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          organization_id: this.getOrgId(),
          name: input.name,
          channel: input.channel || null,
          segment_id: input.segment_id || null,
          content: input.content || null,
          scheduled_at: input.scheduled_at || null,
          status: 'draft',
          statistics: { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 },
          created_by: userData?.user?.id || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creando campaña:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error en createCampaign');
      return null;
    }
  }

  async updateCampaign(id: string, input: UpdateCampaignInput): Promise<Campaign | null> {
    try {
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.channel !== undefined) updateData.channel = input.channel;
      if (input.segment_id !== undefined) updateData.segment_id = input.segment_id;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.scheduled_at !== undefined) updateData.scheduled_at = input.scheduled_at;
      if (input.status !== undefined) updateData.status = input.status;

      const { data, error } = await supabase
        .from('campaigns')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', this.getOrgId())
        .select()
        .single();

      if (error) {
        console.error('Error actualizando campaña:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error en updateCampaign');
      return null;
    }
  }

  async deleteCampaign(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id)
        .eq('organization_id', this.getOrgId());

      if (error) {
        console.error('Error eliminando campaña:', error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error en deleteCampaign');
      return false;
    }
  }

  async duplicateCampaign(id: string): Promise<Campaign | null> {
    try {
      const original = await this.getCampaignById(id);
      if (!original) return null;

      return await this.createCampaign({
        name: `${original.name} (copia)`,
        channel: original.channel || undefined,
        segment_id: original.segment_id || undefined,
        content: original.content || undefined,
      });
    } catch (error) {
      console.error('Error en duplicateCampaign');
      return null;
    }
  }

  async getStats(): Promise<CampaignStats> {
    try {
      const campaigns = await this.getCampaigns();
      
      return {
        total: campaigns.length,
        draft: campaigns.filter(c => c.status === 'draft').length,
        scheduled: campaigns.filter(c => c.status === 'scheduled').length,
        sending: campaigns.filter(c => c.status === 'sending').length,
        sent: campaigns.filter(c => c.status === 'sent').length,
      };
    } catch (error) {
      console.warn('Error en getStats');
      return { total: 0, draft: 0, scheduled: 0, sending: 0, sent: 0 };
    }
  }

  async getCampaignContacts(campaignId: string): Promise<CampaignContact[]> {
    try {
      const { data, error } = await supabase
        .from('campaign_contacts')
        .select(`
          *,
          customer:customers(id, full_name, email, phone)
        `)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error obteniendo contactos:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn('Error en getCampaignContacts');
      return [];
    }
  }

  async getChannels(): Promise<Channel[]> {
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('id, organization_id, type, name, status')
        .eq('organization_id', this.getOrgId())
        .eq('status', 'active');

      if (error) {
        console.warn('Error obteniendo canales:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn('Error en getChannels');
      return [];
    }
  }

  async getSegments(): Promise<{ id: string; name: string; customer_count: number }[]> {
    try {
      const { data, error } = await supabase
        .from('segments')
        .select('id, name, customer_count')
        .eq('organization_id', this.getOrgId())
        .order('name');

      if (error) {
        console.warn('Error obteniendo segmentos:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn('Error en getSegments');
      return [];
    }
  }

  async updateCampaignStatus(id: string, status: CampaignStatus): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('campaigns')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', this.getOrgId());

      if (error) {
        console.error('Error actualizando estado:', error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error en updateCampaignStatus');
      return false;
    }
  }
}

export const CampanasService = new CampanasServiceClass();
