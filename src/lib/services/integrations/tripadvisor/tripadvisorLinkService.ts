/**
 * Servicio para vincular propiedades de la organización con ubicaciones de TripAdvisor.
 * Usa el conector tripadvisor_content_api y guarda el location_id en settings de la conexión.
 */

import { supabase } from '@/lib/supabase/config';

// ID del conector TripAdvisor Content API (creado en migración)
const TRIPADVISOR_CONTENT_API_CONNECTOR_ID = 'b8c3e7a1-2f4d-4a9b-8e1c-3d5f7a9b1c2e';

export interface TripAdvisorLinkedProperty {
  connectionId: string;
  locationId: string;
  locationName: string;
  locationAddress: string;
  rating?: number;
  numReviews?: number;
  category?: string;
  photoUrl?: string;
  webUrl?: string;
  branchId?: number;
  status: string;
  createdAt: string;
}

export interface LinkPropertyParams {
  organizationId: number;
  branchId?: number;
  locationId: string;
  locationName: string;
  locationAddress: string;
  rating?: number;
  numReviews?: number;
  category?: string;
  photoUrl?: string;
  webUrl?: string;
}

/**
 * Busca ubicaciones en TripAdvisor a través de la API route proxy
 */
export async function searchTripAdvisorLocations(
  query: string,
  category?: string,
  latLong?: string,
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const params = new URLSearchParams();
    params.set('searchQuery', query);
    if (category) params.set('category', category);
    if (latLong) params.set('latLong', latLong);

    const response = await fetch(`/api/integrations/tripadvisor/search?${params}`);
    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || `HTTP ${response.status}` };
    }

    return { success: true, data: result.data || [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error de red',
    };
  }
}

/**
 * Obtiene detalles de una ubicación específica
 */
export async function getTripAdvisorLocationDetails(
  locationId: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await fetch(
      `/api/integrations/tripadvisor/details?locationId=${locationId}`,
    );
    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || `HTTP ${response.status}` };
    }

    return { success: true, data: result.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error de red',
    };
  }
}

/**
 * Vincula una propiedad de TripAdvisor con la organización.
 * Crea una integration_connection con el location_id en settings.
 */
export async function linkTripAdvisorProperty(
  params: LinkPropertyParams,
): Promise<{ success: boolean; connectionId?: string; error?: string }> {
  try {
    // Verificar si ya existe una conexión con este location_id
    const { data: existing } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('organization_id', params.organizationId)
      .eq('connector_id', TRIPADVISOR_CONTENT_API_CONNECTOR_ID)
      .contains('settings', { location_id: params.locationId })
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: `Esta ubicación ya está vinculada (conexión: ${existing.id})`,
      };
    }

    // Crear la conexión
    const { data: connection, error } = await supabase
      .from('integration_connections')
      .insert({
        organization_id: params.organizationId,
        connector_id: TRIPADVISOR_CONTENT_API_CONNECTOR_ID,
        branch_id: params.branchId || null,
        name: `TripAdvisor – ${params.locationName}`,
        environment: 'production',
        status: 'connected',
        connected_at: new Date().toISOString(),
        settings: {
          location_id: params.locationId,
          location_name: params.locationName,
          location_address: params.locationAddress,
          rating: params.rating,
          num_reviews: params.numReviews,
          category: params.category,
          photo_url: params.photoUrl,
          web_url: params.webUrl,
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error('[TripAdvisor Link] Error creando conexión:', error);
      return { success: false, error: error.message };
    }

    return { success: true, connectionId: connection.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado',
    };
  }
}

/**
 * Obtiene las propiedades de TripAdvisor vinculadas a la organización
 */
export async function getLinkedProperties(
  organizationId: number,
): Promise<TripAdvisorLinkedProperty[]> {
  const { data, error } = await supabase
    .from('integration_connections')
    .select('id, settings, branch_id, status, created_at')
    .eq('organization_id', organizationId)
    .eq('connector_id', TRIPADVISOR_CONTENT_API_CONNECTOR_ID)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('[TripAdvisor Link] Error obteniendo propiedades:', error);
    return [];
  }

  return data.map((conn) => {
    const s = conn.settings as Record<string, any>;
    return {
      connectionId: conn.id,
      locationId: s.location_id || '',
      locationName: s.location_name || '',
      locationAddress: s.location_address || '',
      rating: s.rating,
      numReviews: s.num_reviews,
      category: s.category,
      photoUrl: s.photo_url,
      webUrl: s.web_url,
      branchId: conn.branch_id,
      status: conn.status,
      createdAt: conn.created_at,
    };
  });
}

/**
 * Desvincula una propiedad de TripAdvisor
 */
export async function unlinkTripAdvisorProperty(
  connectionId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('integration_connections')
    .delete()
    .eq('id', connectionId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
