'use client';

import { supabase } from '@/lib/supabase/config';
import Logger from '@/lib/utils/logger';

/**
 * Obtiene el nombre de usuario a partir de su ID
 * @param userId ID del usuario
 * @returns Nombre del usuario o undefined si no se encuentra
 */
export const getUserName = async (userId: string): Promise<string | undefined> => {
  try {
    if (!userId) return undefined;

    Logger.debug('UI', `Buscando nombre de usuario: ${userId}`);
    const { data, error } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error al obtener perfil de usuario:', error);
      return undefined;
    }

    if (!data) {
      console.error('No se encontró el perfil para el ID:', userId);
      return undefined;
    }

    Logger.debug('UI', 'Datos de perfil obtenidos');

    // Si tenemos nombre y apellido, los combinamos; de lo contrario, usamos el email
    const nombreCompleto = data.first_name && data.last_name 
      ? `${data.first_name} ${data.last_name}` 
      : data.email || 'Usuario sin nombre';

    Logger.debug('UI', `Nombre generado: ${nombreCompleto}`);
    return nombreCompleto;
  } catch (error) {
    console.error('Error en getUserName:', error);
    return undefined;
  }
};

/**
 * Obtiene varios nombres de usuario a partir de sus IDs
 * @param userIds Array de IDs de usuarios
 * @returns Mapa de ID de usuario a nombre
 */
export const getUserNames = async (userIds: string[]): Promise<Record<string, string>> => {
  try {
    if (!userIds || userIds.length === 0) return {};

    // Filtramos IDs vacíos o inválidos
    const validUserIds = userIds.filter(id => id && id.trim() !== '');
    if (validUserIds.length === 0) return {};

    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', validUserIds);

    if (error) {
      console.error('Error al obtener perfiles de usuarios:', error);
      return {};
    }

    // Convertimos el array de resultados en un mapa ID -> Nombre
    const userMap: Record<string, string> = {};
    data.forEach(user => {
      userMap[user.id] = user.first_name && user.last_name 
        ? `${user.first_name} ${user.last_name}` 
        : user.email || 'Usuario desconocido';
    });

    return userMap;
  } catch (error) {
    console.error('Error en getUserNames:', error);
    return {};
  }
};

/**
 * Obtiene la lista de usuarios disponibles para asignación
 * @returns Lista de usuarios con su id y nombre
 */
export const getAssignableUsers = async (): Promise<Array<{id: string, nombre: string, full_name?: string, email: string}>> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .order('first_name', { ascending: true });
      
    if (error) {
      console.error('Error al obtener usuarios asignables:', error);
      return [];
    }
    
    return data.map(user => {
      const fullName = user.first_name && user.last_name 
        ? `${user.first_name} ${user.last_name}` 
        : null;
      
      return {
        id: user.id,
        nombre: fullName || user.email || 'Usuario sin nombre',
        full_name: fullName || undefined,
        email: user.email || ''
      };
    });
  } catch (error) {
    console.error('Error en getAssignableUsers:', error);
    return [];
  }
};
