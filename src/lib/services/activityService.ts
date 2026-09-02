/**
 * Servicio para gestión de actividades CRM
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase/config';
import { obtenerOrganizacionActiva, getCurrentUserId } from '../hooks/useOrganization';

import type { 
  Activity, 
  ActivityFilter, 
  ActivityResponse, 
  NewActivity,
  ActivityType 
} from '../../types/activity';

/**
 * Obtiene actividades con filtros y paginación
 */
export async function getActivities(filters: ActivityFilter = {}): Promise<ActivityResponse> {
  try {
    console.log('🔍 getActivities iniciado con filtros:', filters);
    
    const organizacion = obtenerOrganizacionActiva();
    if (!organizacion?.id) {
      throw new Error('No se pudo obtener la organización activa');
    }
    
    console.log('🏢 Organización activa:', organizacion.id);

    // Valores por defecto para filtros
    const filtersWithDefaults = {
      page: 1,
      limit: 50,
      ...filters
    };

    console.log('📋 Filtros con valores por defecto:', filtersWithDefaults);

    // Construir query base SIN foreign key problemática
    let query = supabase
      .from('activities')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizacion.id)
      .order('occurred_at', { ascending: false });

    // Aplicar filtros
    if (filtersWithDefaults.dateFrom) {
      query = query.gte('occurred_at', filtersWithDefaults.dateFrom);
    }
    
    if (filtersWithDefaults.dateTo) {
      query = query.lte('occurred_at', filtersWithDefaults.dateTo);
    }
    
    if (filtersWithDefaults.userId) {
      query = query.eq('user_id', filtersWithDefaults.userId);
    }
    
    if (filtersWithDefaults.activityType) {
      if (Array.isArray(filtersWithDefaults.activityType)) {
        query = query.in('activity_type', filtersWithDefaults.activityType);
      } else {
        query = query.eq('activity_type', filtersWithDefaults.activityType);
      }
    }
    
    if (filtersWithDefaults.relatedType) {
      query = query.eq('related_type', filtersWithDefaults.relatedType);
    }
    
    if (filtersWithDefaults.relatedId) {
      query = query.eq('related_id', filtersWithDefaults.relatedId);
    }
    
    if (filtersWithDefaults.search) {
      query = query.ilike('notes', `%${filtersWithDefaults.search}%`);
    }

    // Paginación con page en lugar de offset
    const limit = filtersWithDefaults.limit;
    const offset = (filtersWithDefaults.page - 1) * limit;
    
    query = query.range(offset, offset + limit - 1);

    console.log('📊 Ejecutando consulta de actividades...');
    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error en consulta de actividades:', error);
      throw error;
    }

    console.log(`✅ Actividades obtenidas: ${data?.length || 0} de ${count || 0} total`);

    // Enriquecer con datos de usuario por separado
    let enrichedActivities = data || [];
    
    if (enrichedActivities.length > 0) {
      // Obtener user_ids únicos
      const userIds = Array.from(new Set(
        enrichedActivities
          .map(activity => activity.user_id)
          .filter(id => id)
      ));

      console.log('👥 User IDs únicos encontrados:', userIds);

      if (userIds.length > 0) {
        // Consultar profiles por separado
        const { data: userProfiles, error: userError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', userIds);

        if (userError) {
          console.warn('⚠️ Error al obtener perfiles de usuario:', userError);
        } else {
          console.log('👤 Perfiles de usuario obtenidos:', userProfiles?.length || 0);
          
          // Enriquecer actividades con datos de usuario
          enrichedActivities = enrichedActivities.map(activity => ({
            ...activity,
            user_name: (() => {
              const user = userProfiles?.find(u => u.id === activity.user_id);
              if (!user) return 'Usuario desconocido';
              const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
              return fullName || user.email || 'Usuario desconocido';
            })()
          }));
        }
      }
    }

    // Calcular totalPages
    const totalPages = Math.ceil((count || 0) / limit);

    const response = {
      data: enrichedActivities,
      count: count || 0,
      page: filtersWithDefaults.page,
      limit: limit,
      totalPages: totalPages
    };

    console.log('📤 Respuesta final:', {
      dataLength: response.data.length,
      count: response.count,
      page: response.page,
      totalPages: response.totalPages
    });

    return response;

  } catch (error) {
    console.error('💥 Error en getActivities:', error);
    throw error;
  }
}

/**
 * Enriquece actividades con datos relacionados
 */
async function enrichActivities(activities: any[]): Promise<Activity[]> {
  const enriched: Activity[] = [];

  for (const activity of activities) {
    const enrichedActivity: Activity = {
      ...activity,
      user_name: activity.profiles 
        ? `${activity.profiles.first_name || ''} ${activity.profiles.last_name || ''}`.trim()
        : 'Sistema',
      user_avatar: activity.profiles?.avatar_url,
      metadata: activity.metadata || {}
    };

    // Enriquecer con datos de entidad relacionada
    if (activity.related_type && activity.related_id) {
      const relatedData = await getRelatedEntityData(
        activity.related_type, 
        activity.related_id
      );
      enrichedActivity.related_entity_name = relatedData?.name;
      enrichedActivity.related_entity_data = relatedData;
    }

    enriched.push(enrichedActivity);
  }

  return enriched;
}

/**
 * Obtiene datos de entidad relacionada
 */
async function getRelatedEntityData(relatedType: string, relatedId: string) {
  try {
    let tableName = '';
    let nameField = 'name';

    switch (relatedType) {
      case 'customer':
        tableName = 'customers';
        nameField = 'name';
        break;
      case 'opportunity':
        tableName = 'opportunities';
        nameField = 'title';
        break;
      case 'task':
        tableName = 'tasks';
        nameField = 'title';
        break;
      default:
        return null;
    }

    const { data, error } = await supabase
      .from(tableName)
      .select(`id, ${nameField}`)
      .eq('id', relatedId)
      .single();

    if (error || !data) return null;

    // Verificación de tipos segura
    const typedData = data as unknown as Record<string, any>;
    
    // Verificar que los campos requeridos existen
    if (!typedData || typeof typedData !== 'object' || !typedData.id) {
      return null;
    }

    return {
      id: String(typedData.id),
      name: String(typedData[nameField] || ''),
      type: relatedType
    };

  } catch (error) {
    console.error('Error al obtener datos relacionados:', error);
    return null;
  }
}

/**
 * Crea una nueva actividad
 * @param activityData - Datos de la actividad
 * @param organizationId - ID de organización (obligatorio en servidor, opcional en cliente)
 * @param supabaseClient - Cliente Supabase opcional (usar en servidor para bypass de RLS con service role)
 */
export async function createActivity(
  activityData: NewActivity,
  organizationId?: number,
  supabaseClient?: SupabaseClient
): Promise<Activity> {
  try {
    console.log('🎆 === CREANDO NUEVA ACTIVIDAD ===');
    console.log('📄 Datos recibidos:', activityData);
    
    // Obtener ID de organización
    let orgId: number;
    if (organizationId) {
      // Se proporcionó organizationId como parámetro
      orgId = organizationId;
      console.log('🏢 Usando organizationId del parámetro:', orgId);
    } else {
      // Intentar obtenerlo del cliente (solo válido en browser)
      try {
        const organizacion = obtenerOrganizacionActiva();
        orgId = organizacion.id;
        console.log('🏢 Organización obtenida del cliente:', organizacion);
      } catch (error) {
        // En servidor sin organizationId explícito, no hay fallback — lanzar error
        throw new Error('organizationId es requerido para crear actividades en el servidor');
      }
    }
    
    if (!orgId) {
      throw new Error('No se pudo determinar la organización para crear la actividad');
    }
    
    // Obtener usuario actual si no se proporcionó
    let userId: string | undefined = activityData.user_id;
    if (!userId) {
      try {
        const currentUserId = await getCurrentUserId();
        userId = currentUserId || undefined; // Convertir null a undefined
        console.log('👤 Usuario actual obtenido:', userId);
      } catch (error) {
        console.warn('⚠️ No se pudo obtener el usuario actual:', error);
        userId = undefined;
      }
    }
    
    // Construir objeto de actividad completo
    const newActivity = {
      activity_type: activityData.activity_type,
      organization_id: orgId, // Usar organizationId obtenido
      user_id: userId || undefined, // Incluir user_id si está disponible
      notes: activityData.notes || undefined,
      related_type: activityData.related_type || undefined, // Incluir related_type
      related_id: activityData.related_id || undefined, // Incluir related_id
      occurred_at: activityData.occurred_at || new Date().toISOString(),
      metadata: activityData.metadata || {}
    };
    
    console.log('💾 Objeto final a insertar:', newActivity);

    // Usar el cliente proporcionado (server-side con service role) o el cliente global (client-side)
    const clientToUse = supabaseClient || supabase;
    console.log('🔑 Usando cliente:', supabaseClient ? 'Cliente proporcionado' : 'Cliente global');

    const { data, error } = await clientToUse
      .from('activities')
      .insert([newActivity])
      .select()
      .single();

    if (error) {
      console.error('❌ Error al insertar en Supabase:', error);
      throw error;
    }
    
    console.log('✅ Actividad insertada exitosamente:', data);

    // Enriquecer y retornar
    const enriched = await enrichActivities([data]);
    const enrichedActivity = enriched[0];
    
    console.log('✨ Actividad enriquecida:', enrichedActivity);

    // Emitir evento en tiempo real para actualizar UI
    await emitActivityEvent(enrichedActivity, 'activity_created');
    
    console.log('🎆 === ACTIVIDAD CREADA EXITOSAMENTE ===');
    return enrichedActivity;

  } catch (error) {
    console.error('❌ Error en createActivity:', error);
    throw error;
  }
}

/**
 * Emite eventos en tiempo real para actualizaciones de UI
 */
async function emitActivityEvent(activity: Activity, eventType: string) {
  try {
    await supabase.channel('activities')
      .send({
        type: 'broadcast',
        event: eventType,
        payload: {
          activity_id: activity.id,
          activity_type: activity.activity_type,
          organization_id: activity.organization_id,
          user_id: activity.user_id,
          notes: activity.notes,
          occurred_at: activity.occurred_at,
          metadata: activity.metadata,
          // Datos adicionales para UI
          phone_number: activity.metadata?.phone_number,
          call_status: activity.metadata?.call_status,
          email_subject: activity.metadata?.email_subject,
          related_type: activity.related_type,
          related_id: activity.related_id,
          user_name: activity.user_name,
          related_entity_name: activity.related_entity_name
        }
      });
    
    console.log('✅ Evento en tiempo real emitido:', eventType, activity.id);
  } catch (error) {
    console.error('❌ Error emitiendo evento en tiempo real:', error);
    // No lanzar error para no interrumpir el flujo principal
  }
}

/**
 * Obtiene estadísticas de actividades
 */
export async function getActivityStats(filters: Partial<ActivityFilter> = {}) {
  try {
    const organizacion = obtenerOrganizacionActiva();
    const organizationId = organizacion.id;

    let query = supabase
      .from('activities')
      .select('activity_type, created_at')
      .eq('organization_id', organizationId);

    // Aplicar filtros de fecha si existen
    if (filters.dateFrom) {
      query = query.gte('occurred_at', filters.dateFrom);
    }
    
    if (filters.dateTo) {
      query = query.lte('occurred_at', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Procesar estadísticas
    const stats = {
      total: data?.length || 0,
      byType: {} as Record<string, number>,
      today: 0,
      thisWeek: 0,
      thisMonth: 0
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today.getTime() - (today.getDay() * 24 * 60 * 60 * 1000));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    data?.forEach(activity => {
      // Contar por tipo
      stats.byType[activity.activity_type] = (stats.byType[activity.activity_type] || 0) + 1;

      // Contar por período
      const activityDate = new Date(activity.created_at);
      if (activityDate >= today) stats.today++;
      if (activityDate >= weekStart) stats.thisWeek++;
      if (activityDate >= monthStart) stats.thisMonth++;
    });

    return stats;

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    throw error;
  }
}

/**
 * Obtiene usuarios disponibles para filtros
 */
export async function getActivityUsers() {
  try {
    console.log('👥 getActivityUsers iniciado');
    
    const organizacion = obtenerOrganizacionActiva();
    if (!organizacion?.id) {
      throw new Error('No se pudo obtener la organización activa');
    }
    
    console.log('🏢 Organización activa:', organizacion.id);

    // Paso 1: Obtener user_ids únicos de actividades
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('user_id')
      .eq('organization_id', organizacion.id)
      .not('user_id', 'is', null);

    if (activitiesError) {
      console.error('❌ Error al obtener user_ids:', activitiesError);
      throw activitiesError;
    }

    console.log('📊 Actividades con user_id obtenidas:', activities?.length || 0);

    // Obtener user_ids únicos
    const uniqueUserIds = Array.from(new Set(
      activities?.map(activity => activity.user_id).filter(id => id)
    ));

    console.log('👤 User IDs únicos encontrados:', uniqueUserIds);

    if (uniqueUserIds.length === 0) {
      console.log('ℹ️ No se encontraron usuarios en actividades');
      return [];
    }

    // Paso 2: Consultar profiles por separado
    const { data: userProfiles, error: userError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', uniqueUserIds);

    if (userError) {
      console.error('❌ Error al obtener perfiles de usuario:', userError);
      throw userError;
    }

    console.log('👥 Perfiles de usuario obtenidos:', userProfiles?.length || 0);

    // Formatear respuesta
    const users = userProfiles?.map(profile => ({
      id: profile.id,
      name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Usuario sin nombre'
    })) || [];

    console.log('✅ Usuarios formateados:', users);
    return users;

  } catch (error) {
    console.error('💥 Error en getActivityUsers:', error);
    return [];
  }
}
