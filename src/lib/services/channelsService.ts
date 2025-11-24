import { supabase } from '@/lib/supabase/config';

export interface Channel {
  id: string;
  name: string;
  commission: number; // Porcentaje de comisión
  active: boolean;
  color: string;
  icon: string;
}

export interface ChannelStats {
  channel: string;
  total_reservations: number;
  total_revenue: number;
}

// Canales predefinidos
export const PREDEFINED_CHANNELS: Channel[] = [
  {
    id: 'web',
    name: 'Sitio Web',
    commission: 0,
    active: true,
    color: 'blue',
    icon: 'Globe',
  },
  {
    id: 'booking',
    name: 'Booking.com',
    commission: 15,
    active: true,
    color: 'blue',
    icon: 'Building',
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    commission: 12,
    active: true,
    color: 'red',
    icon: 'Home',
  },
  {
    id: 'expedia',
    name: 'Expedia',
    commission: 15,
    active: true,
    color: 'yellow',
    icon: 'Plane',
  },
  {
    id: 'agencia',
    name: 'Agencia de Viajes',
    commission: 10,
    active: true,
    color: 'purple',
    icon: 'Briefcase',
  },
  {
    id: 'telefono',
    name: 'Llamada Telefónica',
    commission: 0,
    active: true,
    color: 'green',
    icon: 'Phone',
  },
  {
    id: 'email',
    name: 'Correo Electrónico',
    commission: 0,
    active: true,
    color: 'gray',
    icon: 'Mail',
  },
  {
    id: 'walk_in',
    name: 'Walk-in',
    commission: 0,
    active: true,
    color: 'teal',
    icon: 'UserPlus',
  },
];

class ChannelsService {
  /**
   * Obtener todos los canales
   */
  async getChannels(): Promise<Channel[]> {
    // Por ahora retornamos los canales predefinidos
    // En el futuro se pueden cargar desde una tabla de configuración
    return Promise.resolve(PREDEFINED_CHANNELS);
  }

  /**
   * Obtener estadísticas por canal
   */
  async getChannelStats(organizationId?: number): Promise<ChannelStats[]> {
    try {
      let query = supabase
        .from('reservations')
        .select('channel, total_estimated');

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Agrupar por canal
      const stats: Record<string, ChannelStats> = {};
      
      data?.forEach((reservation) => {
        const channel = reservation.channel || 'unknown';
        if (!stats[channel]) {
          stats[channel] = {
            channel,
            total_reservations: 0,
            total_revenue: 0,
          };
        }
        stats[channel].total_reservations++;
        stats[channel].total_revenue += Number(reservation.total_estimated || 0);
      });

      return Object.values(stats);
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * Calcular comisión por canal
   */
  calculateCommission(amount: number, channelId: string): number {
    const channel = PREDEFINED_CHANNELS.find(c => c.id === channelId);
    if (!channel) return 0;
    return (amount * channel.commission) / 100;
  }

  /**
   * Obtener canal por ID
   */
  getChannelById(channelId: string): Channel | undefined {
    return PREDEFINED_CHANNELS.find(c => c.id === channelId);
  }
}

export default new ChannelsService();
