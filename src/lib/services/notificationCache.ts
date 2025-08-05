/**
 * Servicio de cache para notificaciones
 * Maneja la búsqueda local y cache en localStorage
 */

import { supabase } from '@/lib/supabase/config';
import type { NotificationResponse, NotificationFilter } from '@/types/notification';

// ========================
// CONSTANTES DE CACHE
// ========================

const CACHE_KEY = 'notifications_cache';
const CACHE_EXPIRY_KEY = 'notifications_cache_expiry';
const CACHE_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutos

// ========================
// FUNCIONES DE CACHE LOCAL
// ========================

/**
 * Carga todas las notificaciones y las guarda en localStorage
 */
export const loadAllNotificationsToCache = async (organizationId: number): Promise<any[]> => {
  try {
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', organizationId)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Guardar en localStorage con timestamp
    const cacheData = {
      data: notifications || [],
      timestamp: Date.now(),
      organizationId
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    localStorage.setItem(CACHE_EXPIRY_KEY, (Date.now() + CACHE_EXPIRY_TIME).toString());

    return notifications || [];
  } catch (error) {
    throw error;
  }
};

/**
 * Obtiene notificaciones del cache o las carga si no existen/están expiradas
 */
export const getCachedNotifications = async (organizationId: number): Promise<any[]> => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const expiry = localStorage.getItem(CACHE_EXPIRY_KEY);

    // Verificar si el cache existe y no ha expirado
    if (cached && expiry && Date.now() < parseInt(expiry)) {
      const cacheData = JSON.parse(cached);
      
      // Verificar que sea para la misma organización
      if (cacheData.organizationId === organizationId) {
        return cacheData.data || [];
      }
    }

    // Cache expirado o no existe, cargar datos frescos
    return await loadAllNotificationsToCache(organizationId);
  } catch (error) {
    throw error;
  }
};

/**
 * Realiza búsqueda local en las notificaciones cacheadas
 */
export const getNotificationsWithLocalSearch = async (
  organizationId: number,
  page: number = 1,
  limit: number = 10,
  filters: NotificationFilter = {}
): Promise<NotificationResponse> => {
  try {
    // Obtener todas las notificaciones del cache
    const allNotifications = await getCachedNotifications(organizationId);
    
    let filteredNotifications = [...allNotifications];

    // Aplicar filtros
    if (filters.channel) {
      filteredNotifications = filteredNotifications.filter(n => n.channel === filters.channel);
    }

    if (filters.status) {
      filteredNotifications = filteredNotifications.filter(n => n.status === filters.status);
    }

    if (filters.is_read !== undefined) {
      if (filters.is_read) {
        filteredNotifications = filteredNotifications.filter(n => n.read_at !== null);
      } else {
        filteredNotifications = filteredNotifications.filter(n => n.read_at === null);
      }
    }

    if (filters.source_module) {
      filteredNotifications = filteredNotifications.filter(n => 
        n.source_module === filters.source_module
      );
    }

    // Búsqueda de texto
    if (filters.search && filters.search.trim()) {
      const searchTerm = filters.search.trim().toLowerCase();
      filteredNotifications = filteredNotifications.filter(notification => {
        const payload = notification.payload || {};
        
        // Buscar en múltiples campos
        const searchFields = [
          notification.title,
          payload.title,
          payload.content,
          payload.message,
          payload.description,
          payload.opportunity_name,
          payload.client_name,
          payload.customer_name,
          payload.task_title,
        ].filter(Boolean);

        return searchFields.some(field => 
          field?.toString().toLowerCase().includes(searchTerm)
        );
      });
    }

    // Aplicar paginación
    const total = filteredNotifications.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedData = filteredNotifications.slice(offset, offset + limit);

    return {
      data: paginatedData,
      count: total,
      page: page,
      limit: limit,
      totalPages: totalPages
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Invalida el cache de notificaciones (llamar cuando se crean/actualizan notificaciones)
 */
export const invalidateNotificationsCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_EXPIRY_KEY);
  } catch (error) {
    // Silenciar errores de localStorage (modo incógnito, etc.)
  }
};
