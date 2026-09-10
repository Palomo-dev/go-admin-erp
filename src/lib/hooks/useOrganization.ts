'use client';

import { useState, useEffect } from 'react';
import { supabase } from "../supabase/config";
import { getMobileStorage, setMobileStorage, removeMobileStorage } from '@/lib/utils/mobileStorage';

// Constante para el almacenamiento local de la organización
const STORAGE_KEY = 'organizacionActiva';
const BRANCH_ID_KEY = 'currentBranchId';
const BRANCH_ALL_KEY_LOCAL = 'branchFilterAll';

/**
 * Claves "legacy" que leen el AppLayout, el OrganizationSelector y varias
 * páginas de auth. Antes se escribían por separado de `organizacionActiva`,
 * así que las dos fuentes divergían: el selector del sidebar mostraba una
 * organización y `useOrganization()` devolvía otra. Ahora SOLO se escriben
 * desde `guardarOrganizacionActiva`, para que no puedan desincronizarse.
 */
const ORG_ID_KEY = 'currentOrganizationId';
const ORG_NAME_KEY = 'currentOrganizationName';

/**
 * Cookies de organización. Las dos apuntan al mismo id; cada capa lee la suya:
 * - `org_id`: la lee `src/middleware.ts` para el gating de plan y módulos.
 * - `goadmin_org_id`: la lee `getServerOrgContext()` (ORG_COOKIE en
 *   `src/lib/utils/orgContext.ts`) en cada route handler.
 *
 * La cookie la escribe el navegador, así que NO es una credencial: el servidor
 * siempre verifica que el usuario sea miembro activo de esa organización y
 * responde 403 si no lo es.
 */
const ORG_COOKIE_MIDDLEWARE = 'org_id';
const ORG_COOKIE_SERVER = 'goadmin_org_id';
/** Subdominio de la organización activa; el middleware la usa como respaldo. */
const ORG_COOKIE_SUBDOMAIN = 'organization';
const ORG_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function escribirCookie(nombre: string, valor: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; secure' : '';
  document.cookie = `${nombre}=${valor}; path=/; max-age=${ORG_COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

function borrarCookie(nombre: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; secure' : '';
  document.cookie = `${nombre}=; path=/; max-age=0; samesite=lax${secure}`;
}

// Interfaz para la organización almacenada localmente
export type Organizacion = {
  id: number;
  name?: string;
  slug?: string;
  logo_url?: string;
  subdomain?: string;
};

// ----------------------------------------------------------------------------
// Caches en memoria para mantener flujo síncrono con persistencia async
// ----------------------------------------------------------------------------
let _orgCache: Organizacion | null | undefined = undefined;
let _branchFilterAllCache: boolean | undefined = undefined;

/**
 * Carga las preferencias persistidas (organización, branchFilterAll) desde
 * @capacitor/preferences (móvil) o localStorage (web) al cache en memoria.
 * Debe llamarse al inicio de la app (en un useEffect raíz) antes de usar
 * las funciones síncronas de este módulo en móvil.
 */
export async function initOrganizationCache(): Promise<void> {
  if (typeof window === 'undefined') return;
  // Organización activa
  if (_orgCache === undefined) {
    try {
      const data = await getMobileStorage(STORAGE_KEY);
      if (data) {
        _orgCache = JSON.parse(data) as Organizacion;
      } else {
        _orgCache = null;
      }
    } catch {
      _orgCache = null;
    }
  }
  // branchFilterAll
  if (_branchFilterAllCache === undefined) {
    try {
      const val = await getMobileStorage(BRANCH_ALL_KEY_LOCAL);
      _branchFilterAllCache = val === '1';
    } catch {
      _branchFilterAllCache = false;
    }
  }
}

/**
 * Punto ÚNICO de escritura de la organización activa en el cliente.
 *
 * Escribe a la vez las tres capas que antes se actualizaban por separado y
 * acababan divergiendo:
 *   1. `organizacionActiva` (localStorage + sessionStorage + storage móvil),
 *      que es lo que leen `obtenerOrganizacionActiva()` y `useOrganization()`.
 *   2. `currentOrganizationId` / `currentOrganizationName`, que es lo que leen
 *      el AppLayout (nombre del sidebar) y el OrganizationSelector.
 *   3. Las cookies `org_id` (middleware) y `goadmin_org_id` (servidor).
 *
 * Si el caller pasa datos parciales de la organización que YA está activa
 * (p. ej. `{ id, name }` desde el AppLayout), se conservan los campos que no
 * vienen —subdominio, logo, slug— en lugar de borrarlos. Si el id es distinto
 * se reemplaza entero: es un cambio de organización.
 */
export function guardarOrganizacionActiva(organizacion: Organizacion): void {
  try {
    // Verificar si la organización ya está guardada para evitar logs innecesarios
    const existingData = localStorage.getItem(STORAGE_KEY);
    const previa: Organizacion | null = existingData ? JSON.parse(existingData) : null;
    const isAlreadySaved = previa?.id === organizacion.id;

    // Fusionar solo dentro de la MISMA organización: un caller con datos
    // parciales no debe borrar el subdominio ni el logo ya conocidos.
    const completa: Organizacion = isAlreadySaved
      ? {
          ...previa,
          ...Object.fromEntries(
            Object.entries(organizacion).filter(([, v]) => v !== undefined && v !== null && v !== '')
          ),
          id: organizacion.id,
        }
      : organizacion;

    const serializada = JSON.stringify(completa);

    // Actualizar cache en memoria (síncrono)
    _orgCache = completa;

    // Guardar en localStorage como fuente principal (síncrono, para middleware/SSR)
    localStorage.setItem(STORAGE_KEY, serializada);

    // Guardar en sessionStorage como respaldo
    sessionStorage.setItem(STORAGE_KEY, serializada);

    // Persistir en almacenamiento móvil (async, fire and forget)
    void setMobileStorage(STORAGE_KEY, serializada);

    // Claves legacy: mismas fuentes, misma escritura. No pueden divergir.
    const idStr = completa.id.toString();
    localStorage.setItem(ORG_ID_KEY, idStr);
    sessionStorage.setItem(ORG_ID_KEY, idStr);
    void setMobileStorage(ORG_ID_KEY, idStr);
    if (completa.name) {
      localStorage.setItem(ORG_NAME_KEY, completa.name);
      void setMobileStorage(ORG_NAME_KEY, completa.name);
    } else if (!isAlreadySaved) {
      // Org nueva sin nombre: el nombre anterior ya no aplica.
      localStorage.removeItem(ORG_NAME_KEY);
      void removeMobileStorage(ORG_NAME_KEY);
    }

    // Cookies: `org_id` para el middleware, `goadmin_org_id` para
    // getServerOrgContext() en los route handlers.
    escribirCookie(ORG_COOKIE_MIDDLEWARE, idStr);
    escribirCookie(ORG_COOKIE_SERVER, idStr);
    if (completa.subdomain) {
      escribirCookie(ORG_COOKIE_SUBDOMAIN, completa.subdomain);
    } else if (!isAlreadySaved) {
      // Organización distinta y no sabemos su subdominio: la cookie anterior
      // es de OTRO tenant. Borrarla, nunca dejarla: el middleware la usa para
      // resolver la organización cuando falta `org_id`.
      borrarCookie(ORG_COOKIE_SUBDOMAIN);
    }

    // Solo hacer log si es una organización nueva o diferente
    if (!isAlreadySaved) {
      console.log('Organización guardada correctamente:', completa.id);
    }

    // Notificar globalmente que la organización cambió (para que BranchProvider
    // y otros contextos recarguen sus datos sin necesidad de reload manual)
    try {
      window.dispatchEvent(new CustomEvent(ORGANIZATION_CHANGED_EVENT, { detail: { id: completa.id } }));
    } catch {
      /* noop */
    }
  } catch (error) {
    console.error('Error al guardar organización:', error);
  }
}

/**
 * Borra la organización activa de todas las capas (storage, storage móvil y
 * cookies). Se usa cuando el usuario deja de tener organizaciones: si solo se
 * limpiara una de las capas, la siguiente carga resucitaría la organización
 * borrada desde la que quedó.
 */
export function limpiarOrganizacionActiva(): void {
  try {
    _orgCache = null;
    for (const key of [STORAGE_KEY, ORG_ID_KEY, ORG_NAME_KEY]) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      void removeMobileStorage(key);
    }
    for (const cookie of [ORG_COOKIE_MIDDLEWARE, ORG_COOKIE_SERVER, ORG_COOKIE_SUBDOMAIN]) {
      borrarCookie(cookie);
    }
  } catch (error) {
    console.error('Error al limpiar la organización activa:', error);
  }
}

/**
 * Persiste la organización activa en `profiles.last_org_id`.
 *
 * Es el respaldo que usa el servidor cuando la petición no trae header ni
 * cookie (`getServerOrgContext`, paso 3), y también de lo que parte el login
 * en el siguiente dispositivo. Sin esto, cambiar de organización solo movía el
 * cliente y el servidor seguía respondiendo con la organización anterior.
 */
export async function persistirOrganizacionEnPerfil(organizationId: number): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ last_org_id: organizationId })
      .eq('id', user.id);
    if (error) {
      console.error('No se pudo guardar last_org_id:', error.message);
    }
  } catch (error) {
    console.error('No se pudo guardar last_org_id:', error);
  }
}

/**
 * Cambia la organización activa desde dentro de la app (no usar en el login inicial).
 * Limpia primero el estado dependiente de la organización anterior (sucursal
 * seleccionada, modo "todas las sucursales" y caché de datos de usuario) para
 * evitar que queden visibles datos de la organización previa tras el cambio.
 */
export async function cambiarOrganizacionActiva(
  organizacion: Organizacion,
  options: { reload?: boolean } = { reload: true }
): Promise<void> {
  try {
    localStorage.removeItem('currentBranchId');
    sessionStorage.removeItem('currentBranchId');
    localStorage.removeItem('branchFilterAll');
    localStorage.removeItem('appLayout_userData_cache');
    // Limpiar también almacenamiento móvil (async, fire and forget)
    void removeMobileStorage('currentBranchId');
    void removeMobileStorage('branchFilterAll');
    // Resetear caches en memoria
    _branchFilterAllCache = false;
    invalidateBranchIdCache();
  } catch (error) {
    console.error('Error al limpiar estado de la organización anterior:', error);
  }

  // Escribe storage (incluidas las claves legacy) y las cookies `org_id` /
  // `goadmin_org_id`, que es lo que hace que el SERVIDOR vea la nueva org.
  guardarOrganizacionActiva(organizacion);

  // Se espera al UPDATE antes de recargar: si el reload ganara la carrera, el
  // perfil se quedaría apuntando a la organización anterior y cualquier
  // petición sin cookie (otro dispositivo, cookie caducada) volvería a ella.
  await persistirOrganizacionEnPerfil(organizacion.id);

  if (options.reload !== false) {
    window.location.reload();
  }
}

/**
 * Obtiene la organización activa de forma robusta
 * Intenta recuperarla de múltiples fuentes para mayor resiliencia
 */
export function obtenerOrganizacionActiva(): Organizacion {
  if (typeof window === 'undefined') {
    // SSR: sin acceso a storage. Retornar id:0 es intencional para no romper SSR.
    // Los consumidores DEBEN validar que id > 0 antes de usar el resultado.
    return { id: 0 };
  }

  try {
    // 0. Cache en memoria (respuesta inmediata, cargado por initOrganizationCache)
    if (_orgCache && _orgCache.id) {
      return _orgCache;
    }

    // 1. Fuente principal: clave JSON
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
      const parsed = JSON.parse(localData);
      if (parsed?.id) {
        _orgCache = parsed;
        return parsed;
      }
    }
    
    // 2. Respaldo: sessionStorage
    const sessionData = sessionStorage.getItem(STORAGE_KEY);
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      if (parsed?.id) return parsed;
    }
    
    // 3. Respaldo: clave simple del OrganizationSelector
    const simpleId = localStorage.getItem('currentOrganizationId');
    if (simpleId) {
      const id = parseInt(simpleId, 10);
      if (!isNaN(id) && id > 0) {
        const org: Organizacion = { id };
        guardarOrganizacionActiva(org);
        return org;
      }
    }
    
    // 4. Claves alternativas (migración)
    const alternativas = ['currentOrganization', 'activeOrganization', 'organizacion'];
    for (const key of alternativas) {
      const altData = localStorage.getItem(key);
      if (altData) {
        const parsed = JSON.parse(altData);
        if (parsed?.id) {
          guardarOrganizacionActiva(parsed);
          return parsed;
        }
      }
    }
    
    // Sin organización guardada — devolver id:0 para que los consumidores lo manejen.
    // NOTA: id:0 es un valor sentinel; los consumidores deben validar id > 0.
    return { id: 0 };
  } catch (error) {
    console.error('Error al recuperar organización:', error);
    // Error: devolver id:0 como sentinel. Los consumidores deben validar id > 0.
    return { id: 0 };
  }
}

/**
 * Para uso en componentes: obtiene la organización y proporciona el organization_id
 * Se recomienda usar este método siempre para obtener el ID de organización.
 * @returns organization_id o 0 si no hay organización activa.
 *          Los callers DEBEN validar que el resultado sea > 0 antes de usarlo.
 */
export function getOrganizationId(): number {
  const organizacion = obtenerOrganizacionActiva();
  return organizacion?.id || 0;
}

/**
 * Obtiene el nombre de la organización activa
 * @returns Nombre de la organización o un valor predeterminado
 */
export function getOrganizationName(): string {
  const organizacion = obtenerOrganizacionActiva();
  return organizacion?.name || 'Organización por defecto';
}

// Interfaces para tipos base de datos
interface DbBranch {
  id: number;
  name: string;
  address?: string;
  is_main?: boolean;
  created_at?: string;
  organization_id: number;
  [key: string]: any; // Para otros campos adicionales
}

interface DbOrganization {
  id: number;
  name: string;
  created_at?: string;
  [key: string]: any;
}

interface DbOrganizationMember {
  id: number;
  organization_id: number;
  user_id: string;
  role?: string;
  is_active: boolean;
  role_id?: number;
}

// Interfaces para la respuesta formateada
interface FormattedBranch {
  id: number;
  name: string;
  address?: string;
  is_main?: boolean;
  created_at?: string;
  organization_id: number;
}

interface FormattedOrganization {
  id: number;
  name: string;
  created_at: string | null;
  branches: FormattedBranch[];
  country_code?: string | null;  // Agregar country_code
  /**
   * Marca este objeto como degradado (construido desde localStorage sin datos
   * frescos de Supabase). Los objetos parciales tienen created_at: null y
   * branches: [], lo que puede alimentar bugs si se tratan como organización
   * completa. Los consumidores deben validar este flag antes de confiar en
   * created_at o branches.
   */
  isPartial?: boolean;
  [key: string]: any;
}

interface FormattedResponse {
  id: number;
  organization: FormattedOrganization;
  branch_id: number | null;
}

// Interface para la respuesta de la función
interface GetOrganizationResponse {
  data: FormattedResponse[] | null;
  error: Error | string | PostgrestError | null;
  /**
   * true si la organización devuelta NO coincide con la guardada en localStorage
   * (fallback). El hook useOrganization NO debe persistir este resultado con
   * guardarOrganizacionActiva, porque sería un cambio silencioso de org.
   */
  usedFallback?: boolean;
}

// Tipo para identificar errores de PostgreSQL/Supabase
interface PostgrestError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

// Función para obtener la organización del usuario utilizando un enfoque basado en consultas separadas
export async function getUserOrganization(userId: string): Promise<GetOrganizationResponse> {
  try {
    console.log("Obteniendo organización para userId:", userId);
    
    // Paso 1: Obtener el miembro de la organización
    // ORDER BY id garantiza un orden determinista (Postgres no garantiza
    // orden de filas sin ORDER BY). Sin esto, memberData[0] es arbitrario
    // y puede cambiar entre ejecuciones, causando un cambio silencioso de org.
    const { data: memberData, error: memberError } = await supabase
      .from("organization_members")
      .select("id, organization_id, role_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (memberError) {
      console.error("Error al consultar members:", memberError);
      throw memberError;
    }
    
    console.log("Datos de miembro encontrados:", JSON.stringify(memberData));
    
    if (!memberData || memberData.length === 0) {
      console.warn("No se encontraron organizaciones para el usuario");
      return { data: null, error: new Error("Usuario no asociado a ninguna organización") };
    }
    
    // Si el usuario tiene múltiples orgs, respetar la guardada en localStorage
    const savedOrg = obtenerOrganizacionActiva();
    let member: DbOrganizationMember;
    let usedFallback = false;
    if (memberData.length > 1 && savedOrg?.id) {
      const saved = memberData.find((m: any) => m.organization_id === savedOrg.id);
      if (saved) {
        member = saved as DbOrganizationMember;
      } else {
        // La org guardada no está entre las del usuario. No elegir otra en
        // silencio: usamos la primera (ordenada por id) para que la UI tenga
        // datos, pero marcamos usedFallback=true para que el hook NO persista
        // esta elección. El usuario debe seleccionar explícitamente.
        console.warn(
          `Organización guardada (id=${savedOrg.id}) no encontrada entre las del usuario. ` +
          `Usando fallback temporal (id=${memberData[0].organization_id}), NO se persistirá.`
        );
        member = memberData[0] as DbOrganizationMember;
        usedFallback = true;
      }
    } else {
      member = memberData[0] as DbOrganizationMember;
    }
    
    // Paso 2: Obtener datos de la organización
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, created_at, country_code, type_id, subdomain, logo_url")
      .eq("id", member.organization_id)
      .single();

    if (orgError) {
      console.error("Error al obtener datos de organización:", orgError);
      throw orgError;
    }
    
    if (!orgData) {
      console.error("No se encontraron datos para la organización ID:", member.organization_id);
      throw new Error("No se encontraron datos para la organización");
    }
    
    const organization = orgData as DbOrganization;
    console.log("Datos de organización encontrados:", JSON.stringify(organization));
    
    // Paso 3: Obtener las sucursales de la organización
    const { data: branchesData, error: branchesError } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", member.organization_id);
    
    if (branchesError) {
      console.error("Error al obtener sucursales:", branchesError);
      throw branchesError;
    }
    
    const branches = branchesData as FormattedBranch[] || [];
    console.log("Sucursales encontradas:", JSON.stringify(branches));
    console.log("Miembro procesado:", JSON.stringify(member));
    
    // Formato final de la respuesta - estructura exacta que espera el componente
    const formattedData = [
      {
        id: member.id,
        organization: {
          // Primero extraemos la mayoría de los campos de la organización
          ...Object.fromEntries(
            Object.entries(organization).filter(([key]) => 
              key !== 'id' && key !== 'name' && key !== 'created_at'
            )
          ),
          // Luego asignamos explícitamente los campos esenciales para garantizar el formato correcto
          id: organization.id,
          name: organization.name,
          created_at: organization.created_at || null,
          // Asignamos las sucursales
          branches: branches
        },
        // Preferir la sucursal principal (is_main === true); si no existe, usar la primera.
        branch_id: branches && branches.length > 0
          ? (branches.find((b) => b.is_main === true)?.id ?? branches[0].id)
          : null
      }
    ];
    
    console.log("Datos procesados de organización (FINAL):", JSON.stringify(formattedData));
    
    return { data: formattedData, error: null, usedFallback };
  } catch (error: any) {
    console.error("Error al obtener la organización:", error);
    return { data: null, error };
  }
}

// Función para obtener la sucursal principal de una organización
export async function getMainBranch(organizationId: number) {
  try {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_main", true)
      .single();

    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error("Error al obtener la sucursal principal:", error);
    return { data: null, error };
  }
}

// Caché para branch_id para evitar múltiples accesos a localStorage
let _branchIdCache: { value: number | null; timestamp: number } | null = null;
const BRANCH_ID_CACHE_TTL = 30000; // 30 segundos de TTL
let _lastBranchIdLogTime = 0;

// Función para obtener el branch_id actual desde localStorage con caché optimizado
export function getCurrentBranchId(): number | null {
  try {
    // Verificar si localStorage está disponible (cliente)
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      // En SSR no retornamos ningún branch_id para evitar consultas innecesarias
      return null;
    }
    
    const now = Date.now();
    
    // Verificar si tenemos un valor en caché válido
    if (_branchIdCache && (now - _branchIdCache.timestamp) < BRANCH_ID_CACHE_TTL) {
      return _branchIdCache.value;
    }
    
    // Obtener valor fresco de localStorage
    const branchId = localStorage.getItem('currentBranchId');
    const parsedBranchId = branchId ? parseInt(branchId, 10) : null;
    
    // Actualizar caché
    _branchIdCache = {
      value: parsedBranchId,
      timestamp: now
    };
    
    // Solo loguear debug si han pasado más de 5 segundos desde el último log
    // Esto reduce significativamente el spam en consola
    if (now - _lastBranchIdLogTime > 5000) {
      console.log('🏦 DEBUG getCurrentBranchId (actualizado):', { 
        branchId, 
        parsed: parsedBranchId,
        cached: true,
        timestamp: new Date(now).toISOString()
      });
      _lastBranchIdLogTime = now;
    }
    
    return parsedBranchId;
  } catch (error) {
    console.error('Error obteniendo branch_id:', error);
    return null; // No retornar valor por defecto en caso de error
  }
}

// Función para invalidar el caché del branch_id (útil cuando se cambia la sucursal)
export function invalidateBranchIdCache(): void {
  _branchIdCache = null;
  _lastBranchIdLogTime = 0;
  console.log('🏦 Caché de branch_id invalidado');
}

// Nombre del evento global emitido al cambiar de sucursal o de modo
export const BRANCH_CHANGED_EVENT = 'branch-changed';

// Nombre del evento global emitido al cambiar de organización activa
export const ORGANIZATION_CHANGED_EVENT = 'organization-changed';

/**
 * Indica si el usuario tiene activo el modo "Todas las sucursales".
 * En este modo no se debe filtrar por branch_id al listar/consultar.
 */
export function getBranchFilterAll(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    // Cache en memoria (cargado por initOrganizationCache)
    if (_branchFilterAllCache !== undefined) return _branchFilterAllCache;
    // Fallback síncrono: localStorage
    const val = localStorage.getItem(BRANCH_ALL_KEY_LOCAL) === '1';
    _branchFilterAllCache = val;
    return val;
  } catch {
    return false;
  }
}

/**
 * Devuelve el branch_id a usar para FILTRAR lecturas/consultas.
 * - Si el modo "Todas" está activo, retorna null (no filtrar).
 * - En caso contrario, retorna la sucursal seleccionada (o null si no hay).
 *
 * IMPORTANTE: para operaciones de ESCRITURA (crear ventas, pagos, etc.)
 * seguir usando getCurrentBranchId(), que siempre devuelve una sucursal concreta.
 */
export function getBranchFilter(): number | null {
  if (getBranchFilterAll()) return null;
  return getCurrentBranchId();
}

// Función auxiliar para obtener branch_id con fallback (solo usar cuando se necesite realmente)
// @deprecated Preferir useBranch().selectedBranchId en componentes React.
// @returns branch_id seleccionado o null si no hay sucursal seleccionada.
//          Los callers DEBEN validar que el resultado no sea null antes de usarlo.
export function getCurrentBranchIdWithFallback(): number | null {
  const branchId = getCurrentBranchId();
  if (branchId !== null) {
    return branchId;
  }

  // No hay sucursal seleccionada — retornar null en vez de un número mágico.
  // Los callers deben validar y manejar el caso null explícitamente.
  console.warn('🏦 getCurrentBranchIdWithFallback: no hay sucursal seleccionada, retornando null. Considerar usar useBranch().selectedBranchId');
  return null;
}

// Función para obtener el usuario actual desde Supabase Auth
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch (error) {
    console.error('Error obteniendo current user:', error);
    return null;
  }
}

/**
 * Hook para usar la organización del usuario en componentes React
 * Combina los datos almacenados en localStorage con datos actuales de Supabase
 * Integra las funcionalidades de almacenamiento local para mayor resiliencia
 */
export function useOrganization() {
  // Intentamos obtener la organización del localStorage en la inicialización
  const initOrg = () => {
    try {
      const organizacionLocal = obtenerOrganizacionActiva();
      if (organizacionLocal && organizacionLocal.id) {
        // Crear un objeto FormattedOrganization válido desde el inicio.
        // Marcado como isPartial porque se construye desde localStorage sin
        // datos frescos de Supabase (created_at: null, branches: []).
        return {
          organization: {
            id: organizacionLocal.id,
            name: organizacionLocal.name || `Organización ${organizacionLocal.id}`,
            created_at: null,
            branches: [],
            isPartial: true,
            slug: organizacionLocal.slug || '',
            logo_url: organizacionLocal.logo_url || '',
            subdomain: organizacionLocal.subdomain || ''
          } as FormattedOrganization,
          branch_id: getCurrentBranchId(), // Obtener branch_id actual desde localStorage
          isLoading: false,
          error: null
        };
      }
    } catch (e) {
      console.error('Error al inicializar organización:', e);
    }
    return {
      organization: null,
      branch_id: null,
      isLoading: true,
      error: null
    };
  };

  const [organizationData, setOrganizationData] = useState<{
    organization: FormattedOrganization | null;
    branch_id: number | null;
    isLoading: boolean;
    error: Error | string | null;
  }>(initOrg());

  useEffect(() => {
    // Intentamos recuperar el usuario actual del localStorage y consultar datos actuales
    const fetchOrganizationData = async () => {
      try {
        // Primero intentamos recuperar la organización del almacenamiento local
        const organizacionLocal = obtenerOrganizacionActiva();
        
        // Recuperamos datos del usuario para obtener más información de la organización
        const userDataStr = localStorage.getItem('userData');
        const userData = userDataStr ? JSON.parse(userDataStr) : null;
        const userId = userData?.id;
        
        if (!userId) {
          // Si no hay usuario pero hay organización en local, usamos esa
          if (organizacionLocal && organizacionLocal.id) {
            // Crear un objeto FormattedOrganization válido a partir de los datos locales.
            // Marcado como isPartial (sin datos frescos de Supabase).
            const formattedOrg: FormattedOrganization = {
              id: organizacionLocal.id,
              name: organizacionLocal.name || `Organización ${organizacionLocal.id}`,
              created_at: null,
              branches: [],
              isPartial: true,
              slug: organizacionLocal.slug || '',
              logo_url: organizacionLocal.logo_url || '',
              subdomain: organizacionLocal.subdomain || ''
            };
            
            setOrganizationData({
              organization: formattedOrg,
              branch_id: getCurrentBranchId(),
              isLoading: false,
              error: null
            });
            return;
          }
          // No hay userId ni organización local — la sesión podría estar cargando aún.
          // Mantener isLoading y reintentar en lugar de lanzar error.
          setOrganizationData({
            organization: null,
            branch_id: null,
            isLoading: true,
            error: null
          });
          // Reintentar después de 1.5s para dar tiempo a que Supabase Auth restaure la sesión
          setTimeout(() => fetchOrganizationData(), 1500);
          return;
        }
        
        // Obtenemos datos completos de la organización desde Supabase
        const { data, error, usedFallback } = await getUserOrganization(userId);
        
        if (error) {
          throw error;
        }
        
        if (data && data.length > 0) {
          const orgData = data[0].organization;
          // Solo persistir si la org devuelta coincide con la guardada, o si
          // no hay org guardada (primera vez). Si usedFallback es true, la org
          // devuelta NO es la guardada — no sobrescribir localStorage con un
          // fallback elegido en silencio.
          if (!usedFallback) {
            guardarOrganizacionActiva({
              id: orgData.id,
              name: orgData.name,
              slug: orgData.slug || undefined,
              logo_url: orgData.logo_url || undefined,
              subdomain: orgData.subdomain || undefined
            });
          }
          
          // Actualizar estado del componente
          setOrganizationData({
            organization: orgData,
            branch_id: data[0].branch_id,
            isLoading: false,
            error: null
          });
        } else if (organizacionLocal && organizacionLocal.id) {
          // Si no hay datos de API pero sí tenemos datos locales, usamos esos
          console.log('No se encontraron datos en API, usando almacenamiento local:', organizacionLocal.id);
          // Crear un objeto FormattedOrganization válido a partir de los datos locales
          const formattedOrg: FormattedOrganization = {
            id: organizacionLocal.id,
            name: organizacionLocal.name || `Organización ${organizacionLocal.id}`,
            created_at: null,
            branches: [],
            isPartial: true,
            slug: organizacionLocal.slug || '',
            logo_url: organizacionLocal.logo_url || '',
            subdomain: organizacionLocal.subdomain || ''
          };
          
          setOrganizationData({
            organization: formattedOrg,
            branch_id: getCurrentBranchId(),
            isLoading: false,
            error: null
          });
        } else {
          setOrganizationData({
            organization: null,
            branch_id: null,
            isLoading: false,
            error: 'No se encontraron datos de organización'
          });
        }
      } catch (err: any) {
        console.error('Error al obtener datos de organización:', err);
        
        // Intentar usar datos locales como respaldo si hay un error en la API
        const organizacionLocal = obtenerOrganizacionActiva();
        if (organizacionLocal && organizacionLocal.id) {
          console.log('Error en API, usando datos de respaldo del almacenamiento local:', organizacionLocal.id);
          const formattedOrg: FormattedOrganization = {
            id: organizacionLocal.id,
            name: organizacionLocal.name || `Organización ${organizacionLocal.id}`,
            created_at: null,
            branches: [],
            isPartial: true,
            slug: organizacionLocal.slug || '',
            logo_url: organizacionLocal.logo_url || '',
            subdomain: organizacionLocal.subdomain || ''
          };
          
          setOrganizationData({
            organization: formattedOrg,
            branch_id: getCurrentBranchId(),
            isLoading: false,
            error: null
          });
        } else {
          setOrganizationData({
            organization: null,
            branch_id: null,
            isLoading: false,
            error: err?.message || 'Error al cargar datos de organización'
          });
        }
      }
    };
    
    fetchOrganizationData();
  }, []);

  return organizationData;
}

// Exportar todo como objeto por defecto para compatibilidad con código existente
export default {
  useOrganization,
  getUserOrganization,
  getMainBranch,
  guardarOrganizacionActiva,
  obtenerOrganizacionActiva,
  getOrganizationId,
  getCurrentBranchId,
  getCurrentUserId,
  invalidateBranchIdCache,
  getCurrentBranchIdWithFallback,
  getBranchFilter,
  getBranchFilterAll,
  initOrganizationCache
};
