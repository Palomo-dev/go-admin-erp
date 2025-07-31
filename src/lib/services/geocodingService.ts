import { supabase } from '@/lib/supabase/config';
import { Branch } from '@/types/branch';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  display_name?: string;
  accuracy?: string;
}

export interface GeocodingError {
  error: string;
  address: string;
}

/**
 * Servicio para manejo de geocodificación y coordenadas de sucursales
 */
export class GeocodingService {
  private static readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
  private static readonly RATE_LIMIT_DELAY = 1000; // 1 segundo entre requests

  /**
   * Geocodifica una dirección usando Nominatim (OpenStreetMap)
   */
  static async geocodeAddress(
    address: string, 
    city?: string, 
    state?: string, 
    country?: string
  ): Promise<GeocodingResult | null> {
    try {
      const fullAddress = [address, city, state, country].filter(Boolean).join(', ');
      
      if (!fullAddress.trim()) {
        return null;
      }

      const url = `${this.NOMINATIM_BASE_URL}/search?` + new URLSearchParams({
        format: 'json',
        q: fullAddress,
        limit: '1',
        addressdetails: '1',
        'accept-language': 'es,en'
      });

      console.log(`Geocoding: ${fullAddress}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GO-Admin-ERP/1.0 (https://go-admin-erp.com)'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        return {
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
          display_name: result.display_name,
          accuracy: result.class
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error geocoding address:', error);
      throw error;
    }
  }

  /**
   * Geocodifica una sucursal y actualiza sus coordenadas en la base de datos
   */
  static async geocodeBranch(branch: Branch): Promise<Branch> {
    try {
      // Si ya tiene coordenadas, no hacer nada
      if (branch.latitude && branch.longitude) {
        return branch;
      }

      // Si no tiene dirección, no se puede geocodificar
      if (!branch.address && !branch.city) {
        throw new Error('La sucursal no tiene información de dirección para geocodificar');
      }

      const result = await this.geocodeAddress(
        branch.address || '',
        branch.city,
        branch.state,
        branch.country
      );

      if (!result) {
        throw new Error('No se pudo encontrar la ubicación para la dirección proporcionada');
      }

      // Actualizar coordenadas en la base de datos
      const { data, error } = await supabase
        .from('branches')
        .update({
          latitude: result.latitude,
          longitude: result.longitude
        })
        .eq('id', branch.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Error actualizando coordenadas: ${error.message}`);
      }

      return {
        ...branch,
        latitude: result.latitude,
        longitude: result.longitude
      };

    } catch (error) {
      console.error(`Error geocoding branch ${branch.id}:`, error);
      throw error;
    }
  }

  /**
   * Geocodifica múltiples sucursales con rate limiting
   */
  static async geocodeMultipleBranches(
    branches: Branch[],
    onProgress?: (current: number, total: number, branchName: string) => void
  ): Promise<{ success: Branch[], errors: GeocodingError[] }> {
    const success: Branch[] = [];
    const errors: GeocodingError[] = [];

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      
      try {
        onProgress?.(i + 1, branches.length, branch.name);
        
        const updatedBranch = await this.geocodeBranch(branch);
        success.push(updatedBranch);
        
        // Rate limiting para evitar ser bloqueados
        if (i < branches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY));
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        errors.push({
          error: errorMessage,
          address: [branch.address, branch.city, branch.state, branch.country]
            .filter(Boolean)
            .join(', ') || branch.name
        });
      }
    }

    return { success, errors };
  }

  /**
   * Obtiene coordenadas de una sucursal (de BD o geocodificando)
   */
  static async getBranchCoordinates(branch: Branch): Promise<[number, number] | null> {
    try {
      // Si ya tiene coordenadas en la BD, usarlas
      if (branch.latitude && branch.longitude) {
        return [parseFloat(branch.latitude.toString()), parseFloat(branch.longitude.toString())];
      }

      // Si no tiene coordenadas pero tiene dirección, geocodificar
      if (branch.address || branch.city) {
        const result = await this.geocodeAddress(
          branch.address || '',
          branch.city,
          branch.state,
          branch.country
        );

        if (result) {
          return [result.latitude, result.longitude];
        }
      }

      return null;
    } catch (error) {
      console.warn(`Could not get coordinates for branch ${branch.id}:`, error);
      return null;
    }
  }

  /**
   * Valida si unas coordenadas son válidas
   */
  static isValidCoordinates(lat: number, lng: number): boolean {
    return !isNaN(lat) && !isNaN(lng) && 
           lat >= -90 && lat <= 90 && 
           lng >= -180 && lng <= 180;
  }

  /**
   * Calcula la distancia entre dos puntos usando la fórmula de Haversine
   */
  static calculateDistance(
    lat1: number, lng1: number, 
    lat2: number, lng2: number
  ): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c; // Distancia en km
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Encuentra la sucursal más cercana a unas coordenadas dadas
   */
  static findNearestBranch(
    targetLat: number, 
    targetLng: number, 
    branches: Branch[]
  ): { branch: Branch, distance: number } | null {
    let nearestBranch: Branch | null = null;
    let minDistance = Infinity;

    for (const branch of branches) {
      if (branch.latitude && branch.longitude) {
        const distance = this.calculateDistance(
          targetLat, targetLng,
          parseFloat(branch.latitude.toString()),
          parseFloat(branch.longitude.toString())
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearestBranch = branch;
        }
      }
    }

    return nearestBranch ? { branch: nearestBranch, distance: minDistance } : null;
  }

  /**
   * Obtiene la ubicación actual del usuario
   */
  static async getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no soportada en este navegador'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutos
        }
      );
    });
  }
}

export const geocodingService = new GeocodingService();
