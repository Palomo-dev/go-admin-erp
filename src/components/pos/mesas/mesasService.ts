import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId, getBranchFilter } from '@/lib/hooks/useOrganization';
import type {
  RestaurantTable,
  TableSession,
  TableWithSession,
  MesaFormData,
  TableState,
} from './types';

export class MesasService {
  /**
   * Obtener todas las mesas con sus sesiones activas
   * Incluye totales consolidados para mesas combinadas
   */
  static async obtenerMesasConSesiones(): Promise<TableWithSession[]> {
    const organizationId = getOrganizationId();
    // En modo "Todas las sucursales" branchFilter es null y se listan las mesas de todas
    const branchFilter = getBranchFilter();

    try {
      // 1. Obtener todas las mesas
      let mesasQuery = supabase
        .from('restaurant_tables')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name');

      if (branchFilter) {
        mesasQuery = mesasQuery.eq('branch_id', branchFilter);
      }

      const { data: mesas, error: mesasError } = await mesasQuery;

      if (mesasError) throw mesasError;

      if (!mesas || mesas.length === 0) {
        return [];
      }

      // 2. Obtener sesiones activas
      const { data: sesiones, error: sesionesError } = await supabase
        .from('table_sessions')
        .select('*')
        .eq('organization_id', organizationId)
        .in('status', ['active', 'bill_requested']);

      if (sesionesError) throw sesionesError;

      // 3. Obtener items de todas las sesiones para contabilizar
      const saleIds = sesiones
        ?.filter(s => s.sale_id)
        .map(s => s.sale_id) || [];

      let itemsBySale: Record<string, number> = {};
      let saleTotals: Record<string, number> = {};

      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from('sale_items')
          .select('sale_id, id')
          .in('sale_id', saleIds);

        if (items) {
          items.forEach(item => {
            if (!itemsBySale[item.sale_id]) {
              itemsBySale[item.sale_id] = 0;
            }
            itemsBySale[item.sale_id]++;
          });
        }

        const { data: sales } = await supabase
          .from('sales')
          .select('id, total')
          .in('id', saleIds);

        sales?.forEach((sale) => {
          saleTotals[sale.id] = Number(sale.total) || 0;
        });
      }

      // Mesero asignado a cada sesión
      const serverIds = Array.from(
        new Set((sesiones || []).map((s) => s.server_id).filter(Boolean))
      );
      let serverNames: Record<string, string> = {};

      if (serverIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', serverIds);

        profiles?.forEach((p) => {
          serverNames[p.id] =
            `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Mesero';
        });
      }

      // Items pendientes en cocina (sin entregar) por sesión
      const sessionIds = (sesiones || []).map((s) => s.id);
      let pendingKitchenBySession: Record<string, number> = {};

      if (sessionIds.length > 0) {
        const { data: kitchenTickets } = await supabase
          .from('kitchen_tickets')
          .select('table_session_id, kitchen_ticket_items(id, status)')
          .in('table_session_id', sessionIds);

        kitchenTickets?.forEach((ticket: any) => {
          const pendientes = (ticket.kitchen_ticket_items || []).filter(
            (i: any) => i.status !== 'delivered'
          ).length;
          pendingKitchenBySession[ticket.table_session_id] =
            (pendingKitchenBySession[ticket.table_session_id] || 0) + pendientes;
        });
      }

      // 4. Combinar mesas con sesiones (agregando datos de TODAS las sesiones por mesa)
      const mesasConSesiones: TableWithSession[] = mesas.map((mesa) => {
        // Obtener TODAS las sesiones de esta mesa
        const sesionesDeMesa = sesiones?.filter((s) => s.restaurant_table_id === mesa.id) || [];
        
        if (sesionesDeMesa.length === 0) {
          return {
            ...mesa,
            session: undefined,
          };
        }

        // Usar la sesión más reciente
        const sesionPrincipal = sesionesDeMesa.sort((a, b) => 
          new Date(b.opened_at || 0).getTime() - new Date(a.opened_at || 0).getTime()
        )[0];

        // Calcular totales consolidados
        // Para comensales, usar solo la sesión principal (no sumar)
        const customers = sesionPrincipal.customers || 0;
        
        // Para items, sí consolidar de todas las sesiones (para mesas combinadas)
        const totalItems = sesionesDeMesa.reduce((sum, s) => {
          if (s.sale_id && itemsBySale[s.sale_id]) {
            return sum + itemsBySale[s.sale_id];
          }
          return sum;
        }, 0);

        // Total consolidado (para mesas combinadas)
        const totalAmount = sesionesDeMesa.reduce((sum, s) => {
          return sum + (s.sale_id ? saleTotals[s.sale_id] || 0 : 0);
        }, 0);

        // Items pendientes en cocina consolidados
        const pendingKitchenItems = sesionesDeMesa.reduce((sum, s) => {
          return sum + (pendingKitchenBySession[s.id] || 0);
        }, 0);

        return {
          ...mesa,
          totalAmount,
          session: {
            ...sesionPrincipal,
            customers: customers, // Solo sesión principal
            serverName: sesionPrincipal.server_id ? serverNames[sesionPrincipal.server_id] : undefined,
            pendingKitchenItems,
            // Agregar información de items para la UI
            sale_items: Array(totalItems).fill(null).map((_, i) => ({ id: `item-${i}` })) as any
          },
        };
      });

      return mesasConSesiones;
    } catch (error) {
      console.error('Error obteniendo mesas:', error);
      throw error;
    }
  }

  /**
   * Crear nueva mesa
   */
  static async crearMesa(mesaData: MesaFormData): Promise<RestaurantTable> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();

    if (!branchId) {
      throw new Error('No se pudo obtener el branch_id');
    }

    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          name: mesaData.name,
          zone: mesaData.zone || null,
          capacity: mesaData.capacity,
          state: 'free' as TableState,
          position_x: mesaData.position_x || null,
          position_y: mesaData.position_y || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creando mesa:', error);
      throw error;
    }
  }

  /**
   * Actualizar mesa existente
   */
  static async actualizarMesa(
    id: string,
    mesaData: Partial<MesaFormData>
  ): Promise<RestaurantTable> {
    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .update({
          name: mesaData.name,
          zone: mesaData.zone || null,
          capacity: mesaData.capacity,
          position_x: mesaData.position_x,
          position_y: mesaData.position_y,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error actualizando mesa:', error);
      throw error;
    }
  }

  /**
   * Actualizar posiciones de múltiples mesas (batch)
   */
  static async actualizarPosiciones(
    batch: { id: string; position_x: number; position_y: number }[]
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      const promises = batch.map(({ id, position_x, position_y }) =>
        supabase
          .from('restaurant_tables')
          .update({ position_x, position_y, updated_at: now })
          .eq('id', id)
      );
      const results = await Promise.all(promises);
      const firstError = results.find((r) => r.error);
      if (firstError?.error) throw firstError.error;
    } catch (error) {
      console.error('Error actualizando posiciones:', error);
      throw error;
    }
  }

  /**
   * Eliminar mesa (solo si no tiene sesión activa)
   */
  static async eliminarMesa(id: string): Promise<void> {
    try {
      // Verificar si tiene sesión activa
      const { data: sesion } = await supabase
        .from('table_sessions')
        .select('id')
        .eq('restaurant_table_id', id)
        .in('status', ['active', 'bill_requested'])
        .maybeSingle();

      if (sesion) {
        throw new Error('No se puede eliminar una mesa con sesión activa');
      }

      const { error } = await supabase
        .from('restaurant_tables')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando mesa:', error);
      throw error;
    }
  }

  /**
   * Abrir sesión de mesa (crear nueva sesión y cambiar estado a ocupada)
   */
  static async abrirSesion(
    mesaId: string,
    options: { serverId?: string; customers?: number } = {}
  ): Promise<TableSession> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();

    if (!branchId) {
      throw new Error('No se pudo obtener el branch_id');
    }

    try {
      // 1. Verificar que la mesa no tenga sesión activa
      const { data: existingSession } = await supabase
        .from('table_sessions')
        .select('id')
        .eq('restaurant_table_id', mesaId)
        .in('status', ['active', 'bill_requested'])
        .single();

      if (existingSession) {
        throw new Error('Esta mesa ya tiene una sesión activa');
      }

      // 2. Obtener usuario actual si no se especifica server_id
      let serverId = options.serverId;
      if (!serverId) {
        const { data: { user } } = await supabase.auth.getUser();
        serverId = user?.id;
      }

      if (!serverId) {
        throw new Error('No se pudo determinar el mesero');
      }

      // 3. Crear sesión
      const { data: session, error: sessionError } = await supabase
        .from('table_sessions')
        .insert({
          organization_id: organizationId,
          restaurant_table_id: mesaId,
          server_id: serverId,
          customers: options.customers || 2,
          status: 'active',
          opened_at: new Date().toISOString()
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // 4. Actualizar estado de la mesa a ocupada
      await supabase
        .from('restaurant_tables')
        .update({
          state: 'occupied',
          updated_at: new Date().toISOString()
        })
        .eq('id', mesaId);

      return session;
    } catch (error) {
      console.error('Error abriendo sesión:', error);
      throw error;
    }
  }

  /**
   * Cambiar mesero de sesión
   */
  static async cambiarMesero(
    sessionId: string,
    serverId: string
  ): Promise<TableSession> {
    try {
      const { data, error } = await supabase
        .from('table_sessions')
        .update({
          server_id: serverId,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error cambiando mesero:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado de mesa
   */
  static async cambiarEstadoMesa(
    id: string,
    estado: TableState
  ): Promise<RestaurantTable> {
    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .update({
          state: estado,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error cambiando estado de mesa:', error);
      throw error;
    }
  }

  /**
   * Solicitar cuenta para la sesión activa de una mesa (acción rápida desde el listado)
   */
  static async solicitarCuenta(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('table_sessions')
        .update({ status: 'bill_requested', updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (error) {
      console.error('Error solicitando cuenta:', error);
      throw error;
    }
  }

  /**
   * Obtener zonas únicas
   */
  static async obtenerZonas(): Promise<string[]> {
    const organizationId = getOrganizationId();
    const branchFilter = getBranchFilter();

    try {
      let query = supabase
        .from('restaurant_tables')
        .select('zone')
        .eq('organization_id', organizationId)
        .not('zone', 'is', null);

      if (branchFilter) {
        query = query.eq('branch_id', branchFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Obtener zonas únicas
      const zonasSet = new Set(data.map((item) => item.zone as string));
      const zonasUnicas = Array.from(zonasSet);
      return zonasUnicas.sort();
    } catch (error) {
      console.error('Error obteniendo zonas:', error);
      throw error;
    }
  }

  /**
   * Actualizar nombre de zona (renombrar)
   */
  static async actualizarZona(
    zonaAntigua: string,
    zonaNueva: string
  ): Promise<void> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();

    if (!branchId) {
      throw new Error('No se pudo obtener el branch_id');
    }

    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .update({ zone: zonaNueva })
        .eq('organization_id', organizationId)
        .eq('branch_id', branchId)
        .eq('zone', zonaAntigua);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando zona:', error);
      throw error;
    }
  }

  /**
   * Eliminar zona (establece zone como null para todas las mesas de esa zona)
   */
  static async eliminarZona(zona: string): Promise<void> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();

    if (!branchId) {
      throw new Error('No se pudo obtener el branch_id');
    }

    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .update({ zone: null })
        .eq('organization_id', organizationId)
        .eq('branch_id', branchId)
        .eq('zone', zona);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando zona:', error);
      throw error;
    }
  }

  /**
   * Combinar mesas (mueve sesiones y pedidos a una mesa principal)
   */
  static async combinarMesas(
    mesaPrincipalId: string,
    mesasACombinar: string[]
  ): Promise<void> {
    try {
      // Obtener sesiones de las mesas a combinar
      const { data: sesiones, error: sesionesError } = await supabase
        .from('table_sessions')
        .select('*')
        .in('restaurant_table_id', mesasACombinar)
        .in('status', ['active', 'bill_requested']);

      if (sesionesError) throw sesionesError;

      if (!sesiones || sesiones.length === 0) {
        throw new Error('No hay sesiones activas para combinar');
      }

      // Actualizar sesiones para que apunten a la mesa principal
      for (const sesion of sesiones) {
        const { error: updateError } = await supabase
          .from('table_sessions')
          .update({ restaurant_table_id: mesaPrincipalId })
          .eq('id', sesion.id);

        if (updateError) throw updateError;
      }

      // Liberar las mesas combinadas
      const { error: updateMesasError } = await supabase
        .from('restaurant_tables')
        .update({ state: 'free' as TableState })
        .in('id', mesasACombinar);

      if (updateMesasError) throw updateMesasError;

      // Marcar mesa principal como ocupada
      await this.cambiarEstadoMesa(mesaPrincipalId, 'occupied');
    } catch (error) {
      console.error('Error combinando mesas:', error);
      throw error;
    }
  }

  /**
   * Dividir mesa (crear nuevas sesiones para mesas individuales)
   * Nota: Esta función crea nuevas sesiones basadas en una sesión existente
   */
  static async dividirMesa(
    mesaOrigenId: string,
    mesasDestino: string[],
    sesionId: string
  ): Promise<void> {
    try {
      // Obtener sesión original
      const { data: sesionOriginal, error: sesionError } = await supabase
        .from('table_sessions')
        .select('*')
        .eq('id', sesionId)
        .single();

      if (sesionError || !sesionOriginal) {
        throw new Error('No se encontró la sesión original');
      }

      // Crear nuevas sesiones para cada mesa destino
      for (const mesaDestinoId of mesasDestino) {
        const { error: insertError } = await supabase
          .from('table_sessions')
          .insert({
            organization_id: sesionOriginal.organization_id,
            restaurant_table_id: mesaDestinoId,
            server_id: sesionOriginal.server_id,
            customers: Math.floor(sesionOriginal.customers / mesasDestino.length),
            status: 'active',
            notes: `Dividida desde mesa ${mesaOrigenId}`,
          });

        if (insertError) throw insertError;

        // Marcar mesa como ocupada
        await this.cambiarEstadoMesa(mesaDestinoId, 'occupied');
      }

      // Cerrar sesión original
      const { error: closeError } = await supabase
        .from('table_sessions')
        .update({
          status: 'completed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', sesionId);

      if (closeError) throw closeError;

      // Liberar mesa original
      await this.cambiarEstadoMesa(mesaOrigenId, 'free');
    } catch (error) {
      console.error('Error dividiendo mesa:', error);
      throw error;
    }
  }

  /**
   * Mover pedido de una mesa a otra
   */
  static async moverPedido(
    sesionId: string,
    mesaDestinoId: string
  ): Promise<void> {
    try {
      // Obtener sesión original
      const { data: sesionOriginal, error: sesionError } = await supabase
        .from('table_sessions')
        .select('*, restaurant_tables!inner(id)')
        .eq('id', sesionId)
        .single();

      if (sesionError || !sesionOriginal) {
        throw new Error('No se encontró la sesión');
      }

      const mesaOrigenId = sesionOriginal.restaurant_table_id;

      // Actualizar sesión con nueva mesa
      const { error: updateError } = await supabase
        .from('table_sessions')
        .update({ restaurant_table_id: mesaDestinoId })
        .eq('id', sesionId);

      if (updateError) throw updateError;

      // Actualizar kitchen_tickets si existen
      const { error: ticketsError } = await supabase
        .from('kitchen_tickets')
        .update({ table_session_id: sesionId })
        .eq('table_session_id', sesionId);

      // Liberar mesa origen
      await this.cambiarEstadoMesa(mesaOrigenId, 'free');

      // Ocupar mesa destino
      await this.cambiarEstadoMesa(mesaDestinoId, 'occupied');
    } catch (error) {
      console.error('Error moviendo pedido:', error);
      throw error;
    }
  }

  /**
   * Liberar mesa (cerrar sesión y cambiar estado a libre)
   */
  static async liberarMesa(tableId: string): Promise<void> {
    try {
      if (!tableId) {
        throw new Error('ID de mesa requerido');
      }

      // 1. Obtener sesiones activas de la mesa + datos de la mesa para auditoría
      const { data: sessions, error: sessionsError } = await supabase
        .from('table_sessions')
        .select('id, sale_id, organization_id, branch_id')
        .eq('restaurant_table_id', tableId)
        .in('status', ['active', 'bill_requested']);

      if (sessionsError) {
        console.error('Error al obtener sesiones:', sessionsError);
        throw new Error(`Error al obtener sesiones: ${sessionsError.message || JSON.stringify(sessionsError)}`);
      }

      // 2. Cerrar todas las sesiones activas
      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);

        // Marcar comandas (digitales y físicas) como entregadas: se asume que
        // todo lo que quedó en la mesa al cerrarla/pagarla ya fue consumido.
        const { data: ticketIds } = await supabase
          .from('kitchen_tickets')
          .select('id')
          .in('table_session_id', sessionIds)
          .neq('status', 'delivered');

        if (ticketIds && ticketIds.length > 0) {
          const ids = ticketIds.map((t: any) => t.id);
          await supabase
            .from('kitchen_tickets')
            .update({ status: 'delivered', updated_at: new Date().toISOString() })
            .in('id', ids);
          await supabase
            .from('kitchen_ticket_items')
            .update({ status: 'delivered', updated_at: new Date().toISOString() })
            .in('kitchen_ticket_id', ids);
        }

        const { error: closeError } = await supabase
          .from('table_sessions')
          .update({ 
            status: 'completed',
            closed_at: new Date().toISOString()
          })
          .in('id', sessionIds);

        if (closeError) {
          console.error('Error al cerrar sesiones:', closeError);
          throw new Error(`Error al cerrar sesiones: ${closeError.message || JSON.stringify(closeError)}`);
        }
      }

      // 2.5 Registrar auditoría de liberación de mesa
      if (sessions && sessions.length > 0) {
        await this.registrarAuditoriaLiberacion(tableId, sessions);
      }

      // 3. Cambiar estado de la mesa a libre
      const { data, error: updateError } = await supabase
        .from('restaurant_tables')
        .update({
          state: 'free',
          updated_at: new Date().toISOString(),
        })
        .eq('id', tableId)
        .select()
        .single();

      if (updateError) {
        console.error('Error al actualizar mesa:', updateError);
        throw new Error(`Error al actualizar mesa: ${updateError.message || JSON.stringify(updateError)}`);
      }

      if (!data) {
        throw new Error('No se encontró la mesa para actualizar');
      }
    } catch (error: any) {
      const errorMsg = error?.message || JSON.stringify(error) || 'Error desconocido';
      console.error('Error liberando mesa:', errorMsg, error);
      throw new Error(`Error liberando mesa: ${errorMsg}`);
    }
  }

  /**
   * Registra en ops_audit_log la liberación de una mesa, para auditar
   * quién y cuándo liberó la mesa. No lanza error si falla.
   */
  private static async registrarAuditoriaLiberacion(
    tableId: string,
    sessions: { id: string; organization_id: number; branch_id: number | null }[]
  ): Promise<void> {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const now = new Date().toISOString();

      const inserts = sessions.map((s) => ({
        organization_id: s.organization_id,
        branch_id: s.branch_id,
        user_id: userId,
        entity_type: 'table_sessions',
        entity_id: s.id,
        action: 'RELEASE',
        previous_data: { status: 'active' },
        metadata: {
          table_id: tableId,
          table_session_id: s.id,
          released_at: now,
        },
      }));

      await supabase.from('ops_audit_log').insert(inserts);
    } catch (auditError) {
      console.error('No se pudo registrar auditoría de liberación de mesa:', auditError);
    }
  }

  /**
   * Actualizar número de comensales en una sesión
   */
  static async actualizarComensales(sessionId: string, customers: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('table_sessions')
        .update({ customers })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando comensales:', error);
      throw error;
    }
  }
}
