/**
 * Servicio de consulta DIAN/RUES con soporte multi-proveedor (Verifik + CoreSoft + Factus)
 * y cache en Supabase (tabla dian_lookup_cache, TTL 24h).
 *
 * Proveedores soportados:
 * - Verifik: https://docs.verifik.co (firma digital, RUES completo)
 * - CoreSoft: https://coresoft.solutions/api-rut.html (plan unico DIAN+RUES)
 * - Factus: https://developers.factus.com.co (endpoint adquirientes DIAN, nombre + email)
 *
 * Variables de entorno requeridas:
 * - DIAN_PROVIDER: "verifik" | "coresoft" (default: "verifik")
 * - VERIFIK_TOKEN: Bearer token de Verifik
 * - CORESOFT_API_KEY: API key de CoreSoft
 * - FACTUS_CLIENT_ID, FACTUS_CLIENT_SECRET, FACTUS_USERNAME, FACTUS_PASSWORD, FACTUS_ENVIRONMENT
 *
 * Flujo:
 * 1. Validar DV localmente (modulo 11) antes de consultar API
 * 2. Verificar cache en dian_lookup_cache (TTL 24h)
 * 3. Si no hay cache, consultar proveedor primario
 * 4. Si falla, intentar proveedor secundario (fallback)
 * 5. Si falla, intentar Factus como ultimo fallback (nombre + email)
 * 6. Normalizar respuesta y guardar en cache
 */

import { supabase } from '@/lib/supabase/config';
import { calcularDv } from '@/lib/utils/nitDv';

// ============ Tipos ============

export interface DianLookupRequest {
  documentType: string; // Codigo DIAN: "13"=CC, "31"=NIT, "41"=Pasaporte
  documentNumber: string; // Numero sin DV
  dv?: string; // Dígito de verificacion (opcional, se calcula si no viene)
  organizationId?: number;
  userId?: string;
}

export interface DianLookupResponse {
  success: boolean;
  provider: string;
  fromCache: boolean;
  data: DianNormalizedData;
  rawResponse?: Record<string, unknown>;
  error?: string;
}

export interface DianNormalizedData {
  documentType: string;
  documentNumber: string;
  dv?: string;
  name?: string; // Razon social o nombre completo
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  isActive?: boolean;
  isRegistered?: boolean;
  taxRegime?: string;
  fiscalResponsibilities?: string[]; // Codigos DIAN: O-13, O-15, O-23, O-47, O-48, O-49
  ciiu?: string;
  rues?: {
    matricula?: string;
    camara?: string;
    codigoCamara?: string;
    estado?: string;
    fechaMatricula?: string;
    fechaRenovacion?: string;
    representantes?: Array<{ nombre: string; documento?: string; cargo?: string }>;
    socios?: Array<{ nombre: string; documento?: string }>;
    actividadesEconomicas?: string[];
  };
  metadata?: Record<string, unknown>;
}

type Provider = 'verifik' | 'coresoft' | 'factus';

// ============ Configuracion ============

function getProvider(): Provider {
  const p = process.env.DIAN_PROVIDER?.toLowerCase();
  if (p === 'coresoft') return 'coresoft';
  if (p === 'factus') return 'factus';
  return 'verifik';
}

function getProviderToken(provider: Provider): string | null {
  if (provider === 'verifik') return process.env.VERIFIK_TOKEN || null;
  if (provider === 'coresoft') return process.env.CORESOFT_API_KEY || null;
  if (provider === 'factus') return process.env.FACTUS_CLIENT_ID || null; // truthy si hay credenciales
  return null;
}

// ============ Cache ============

const CACHE_TTL_HOURS = 24;

async function getFromCache(
  documentType: string,
  documentNumber: string,
  provider: Provider
): Promise<{ data: DianNormalizedData; rawResponse: Record<string, unknown> } | null> {
  const documentKey = `${documentType}:${documentNumber}`;
  const { data } = await supabase
    .from('dian_lookup_cache')
    .select('normalized_data, raw_response')
    .eq('document_key', documentKey)
    .eq('provider', provider)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.normalized_data) {
    return {
      data: data.normalized_data as DianNormalizedData,
      rawResponse: data.raw_response,
    };
  }
  return null;
}

async function saveToCache(
  documentType: string,
  documentNumber: string,
  provider: Provider,
  normalizedData: DianNormalizedData,
  rawResponse: Record<string, unknown>,
  organizationId?: number,
  userId?: string
): Promise<void> {
  try {
    await supabase.from('dian_lookup_cache').insert({
      document_type: documentType,
      document_number: documentNumber,
      provider,
      raw_response: rawResponse,
      normalized_data: normalizedData,
      organization_id: organizationId || null,
      queried_by: userId || null,
      expires_at: new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    // Error de cache no debe bloquear la respuesta
    console.error('Error guardando cache DIAN:', err);
  }
}

// ============ Helpers de tipado ============

/** Extrae un string de un valor unknown de forma segura */
function str(val: unknown): string | undefined {
  if (typeof val === 'string' && val) return val;
  return undefined;
}

/** Extrae un array de un valor unknown de forma segura */
function arr<T = unknown>(val: unknown): T[] {
  return Array.isArray(val) ? val as T[] : [];
}

// ============ Proveedores ============

/**
 * Consulta Verifik: DIAN + RUES
 * Endpoints:
 * - DIAN: GET https://api.verifik.co/v2/co/company/dian
 * - RUES completo: GET https://api.verifik.co/v3/co/rues-complete
 */
async function consultarVerifik(
  documentType: string,
  documentNumber: string
): Promise<{ data: DianNormalizedData; raw: Record<string, unknown> }> {
  const token = getProviderToken('verifik');
  if (!token) throw new Error('VERIFIK_TOKEN no configurado');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Mapear tipo doc DIAN a etiqueta Verifik
  const docTypeVerifik = documentType === '31' ? 'NIT' : documentType === '13' ? 'CC' : 'NIT';

  // 1. Consultar DIAN
  const dianUrl = `https://api.verifik.co/v2/co/company/dian?documentType=${docTypeVerifik}&documentNumber=${documentNumber}`;
  const dianRes = await fetch(dianUrl, { headers });
  if (!dianRes.ok) {
    const errText = await dianRes.text();
    throw new Error(`Verifik DIAN error ${dianRes.status}: ${errText}`);
  }
  const dianJson = await dianRes.json() as Record<string, unknown>;
  const dianData = (dianJson?.data as Record<string, unknown>) || {};

  // 2. Consultar RUES completo (solo para NIT/empresas)
  let ruesData: Record<string, unknown> | null = null;
  if (documentType === '31') {
    try {
      const ruesUrl = `https://api.verifik.co/v3/co/rues-complete?documentType=NIT&documentNumber=${documentNumber}&category=RM`;
      const ruesRes = await fetch(ruesUrl, { headers });
      if (ruesRes.ok) {
        const ruesJson = await ruesRes.json() as Record<string, unknown>;
        ruesData = (ruesJson?.data as Record<string, unknown>) || null;
      }
    } catch {
      // RUES es complementario, no fallar si no esta disponible
    }
  }

  // 3. Normalizar
  const normalized = normalizarVerifik(dianData, ruesData, documentType, documentNumber);
  return { data: normalized, raw: { dian: dianJson, rues: ruesData } };
}

function normalizarVerifik(
  dianData: Record<string, unknown>,
  ruesData: Record<string, unknown> | null,
  documentType: string,
  documentNumber: string
): DianNormalizedData {
  const result: DianNormalizedData = {
    documentType,
    documentNumber,
    name: str(dianData.nombreRazon) || str(dianData.name),
    isActive: dianData.estado === 'REGISTRO ACTIVO',
    isRegistered: dianData.estado === 'REGISTRO ACTIVO',
    email: str(dianData.email),
  };

  // Calcular DV si es NIT
  if (documentType === '31') {
    const dv = calcularDv(documentNumber);
    if (dv !== null) result.dv = String(dv);
  }

  // Mapear responsabilidades fiscales desde descripcion DIAN
  const desc = (str(dianData.descripcion) || '').toLowerCase();
  const responsibilities: string[] = [];
  if (desc.includes('gran contribuyente')) responsibilities.push('O-13');
  if (desc.includes('autorretenedor')) responsibilities.push('O-15');
  if (desc.includes('agente de retenci') && desc.includes('iva')) responsibilities.push('O-23');
  if (desc.includes('simple')) responsibilities.push('O-47');
  if (desc.includes('responsable de iva') && !desc.includes('no responsable')) responsibilities.push('O-48');
  if (desc.includes('no responsable de iva')) responsibilities.push('O-49');
  if (responsibilities.length === 0 && documentType !== '31') responsibilities.push('R-99-PN');
  if (responsibilities.length > 0) result.fiscalResponsibilities = responsibilities;

  // Datos RUES si disponibles
  if (ruesData) {
    result.rues = {
      matricula: str(ruesData.matricula),
      camara: str(ruesData.camara),
      codigoCamara: str(ruesData.codigoCamara),
      estado: str(ruesData.estado),
      fechaMatricula: str(ruesData.fechaMatricula) || str(ruesData.fecha_matricula),
      fechaRenovacion: str(ruesData.fechaRenovacion) || str(ruesData.fecha_renovacion),
      representantes: arr(ruesData.representantes),
      socios: arr(ruesData.socios),
      actividadesEconomicas: arr<string>(ruesData.actividadesEconomicas).length > 0
        ? arr<string>(ruesData.actividadesEconomicas)
        : arr<string>(ruesData.actividades_economicas),
    };
    // Direccion y ciudad pueden venir de RUES
    const dir = str(ruesData.direccion);
    const ciu = str(ruesData.ciudad);
    const dep = str(ruesData.departamento);
    const ciiu = str(ruesData.ciiu);
    if (dir && !result.address) result.address = dir;
    if (ciu && !result.city) result.city = ciu;
    if (dep && !result.state) result.state = dep;
    if (ciiu && !result.ciiu) result.ciiu = ciiu;
  }

  return result;
}

/**
 * Consulta CoreSoft: DIAN + RUES
 * Endpoints:
 * - RUT: POST https://api.coresoft.co/v1/rut
 * - RUES: GET https://api.coresoft.co/api/rues
 */
async function consultarCoreSoft(
  documentType: string,
  documentNumber: string
): Promise<{ data: DianNormalizedData; raw: Record<string, unknown> }> {
  const apiKey = getProviderToken('coresoft');
  if (!apiKey) throw new Error('CORESOFT_API_KEY no configurado');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  // 1. Consultar RUT
  const rutRes = await fetch('https://api.coresoft.co/v1/rut', {
    method: 'POST',
    headers,
    body: JSON.stringify({ documento: documentNumber }),
  });
  if (!rutRes.ok) {
    const errText = await rutRes.text();
    throw new Error(`CoreSoft RUT error ${rutRes.status}: ${errText}`);
  }
  const rutJson = await rutRes.json() as Record<string, unknown>;
  const rutData = (rutJson?.data as Record<string, unknown>) || {};

  // 2. Consultar RUES (solo NIT)
  let ruesData: Record<string, unknown> | null = null;
  if (documentType === '31') {
    try {
      const ruesRes = await fetch(`https://api.coresoft.co/api/rues?nit=${documentNumber}`, { headers });
      if (ruesRes.ok) {
        const ruesJson = await ruesRes.json() as Record<string, unknown>;
        ruesData = (ruesJson?.data as Record<string, unknown>) || null;
      }
    } catch {
      // RUES complementario
    }
  }

  const normalized = normalizarCoreSoft(rutData, ruesData, documentType, documentNumber);
  return { data: normalized, raw: { rut: rutJson, rues: ruesData } };
}

function normalizarCoreSoft(
  rutData: Record<string, unknown>,
  ruesData: Record<string, unknown> | null,
  documentType: string,
  documentNumber: string
): DianNormalizedData {
  const result: DianNormalizedData = {
    documentType,
    documentNumber,
    name: str(rutData.razon_social) || str(rutData.name),
    isActive: (str(rutData.estado) || '').toUpperCase() === 'ACTIVO',
    isRegistered: (str(rutData.estado) || '').toUpperCase() === 'ACTIVO',
    taxRegime: str(rutData.regimen),
    ciiu: str(rutData.actividad_principal),
  };

  if (documentType === '31') {
    const dv = calcularDv(documentNumber);
    if (dv !== null) result.dv = String(dv);
  }

  // Mapear responsabilidades desde obligaciones tributarias
  const obligaciones = arr(rutData.obligaciones_tributarias);
  const responsibilities: string[] = [];
  for (const ob of obligaciones) {
    const obStr = String(ob).toLowerCase();
    if (obStr.includes('gran contribuyente')) responsibilities.push('O-13');
    if (obStr.includes('autorretenedor')) responsibilities.push('O-15');
    if (obStr.includes('agente reten') && obStr.includes('iva')) responsibilities.push('O-23');
    if (obStr.includes('simple')) responsibilities.push('O-47');
    if (obStr.includes('responsable iva') && !obStr.includes('no responsable')) responsibilities.push('O-48');
    if (obStr.includes('no responsable iva')) responsibilities.push('O-49');
  }
  if (responsibilities.length === 0 && documentType !== '31') responsibilities.push('R-99-PN');
  if (responsibilities.length > 0) result.fiscalResponsibilities = responsibilities;

  if (ruesData) {
    const act = str(ruesData.actividad);
    result.rues = {
      matricula: str(ruesData.matricula),
      camara: str(ruesData.camara),
      estado: str(ruesData.estado),
      actividadesEconomicas: act ? [act] : [],
    };
    const dir = str(ruesData.direccion);
    const ciu = str(ruesData.ciudad);
    if (dir && !result.address) result.address = dir;
    if (ciu && !result.city) result.city = ciu;
  }

  return result;
}

/**
 * Consulta Factus: endpoint de adquirientes DIAN
 * Endpoint: GET https://api{,-sandbox}.factus.com.co/v2/dian/acquirer
 *
 * Devuelve solo nombre y email desde la base oficial de DIAN.
 * No devuelve telefono, direccion, responsabilidades, regimen, CIIU, RUES.
 * Es el unico proveedor que entrega email para personas naturales.
 */
async function consultarFactus(
  documentType: string,
  documentNumber: string
): Promise<{ data: DianNormalizedData; raw: Record<string, unknown> }> {
  // Importacion dinamica para evitar dependencia circular con factusTokenManager
  const { getValidToken, getCredentials } = await import('@/lib/services/factusTokenManager');
  const factusServiceModule = await import('@/lib/services/factusService');

  const credentials = getCredentials();
  if (!credentials) throw new Error('Credenciales de Factus no configuradas');

  const accessToken = await getValidToken();
  if (!accessToken) throw new Error('No se pudo obtener token de Factus');

  const acquirerData = await factusServiceModule.default.getAcquirer(
    credentials.environment,
    accessToken,
    documentType,
    documentNumber
  );

  const normalized = normalizarFactus(acquirerData, documentType, documentNumber);
  return { data: normalized, raw: { acquirer: acquirerData } };
}

function normalizarFactus(
  acquirerData: { name: string; email: string },
  documentType: string,
  documentNumber: string
): DianNormalizedData {
  const result: DianNormalizedData = {
    documentType,
    documentNumber,
    name: acquirerData.name || undefined,
    email: acquirerData.email || undefined,
  };

  // Calcular DV si es NIT
  if (documentType === '31') {
    const dv = calcularDv(documentNumber);
    if (dv !== null) result.dv = String(dv);
  }

  return result;
}

// ============ API publica ============

/**
 * Consulta DIAN/RUES con cache y fallback entre proveedores.
 * @param req Datos de consulta (tipo doc, numero, dv opcional)
 * @returns Respuesta normalizada lista para mapear a customers/suppliers
 */
export async function consultarDian(req: DianLookupRequest): Promise<DianLookupResponse> {
  const { documentType, documentNumber, organizationId, userId } = req;
  if (!documentNumber) {
    return { success: false, provider: '', fromCache: false, data: {} as DianNormalizedData, error: 'Numero de documento requerido' };
  }

  const providerPrimario = getProvider();

  // 1. Verificar cache del proveedor primario
  const cached = await getFromCache(documentType, documentNumber, providerPrimario);
  if (cached) {
    return { success: true, provider: providerPrimario, fromCache: true, data: cached.data, rawResponse: cached.rawResponse };
  }

  // 2. Consultar proveedores en orden, sin duplicar el primario
  const todosProveedores: Provider[] = ['verifik', 'coresoft', 'factus'];
  const providers: Provider[] = [
    providerPrimario,
    ...todosProveedores.filter(p => p !== providerPrimario),
  ];
  let ultimoError = '';

  for (const provider of providers) {
    if (!getProviderToken(provider)) continue;
    try {
      let resultado: { data: DianNormalizedData; raw: Record<string, unknown> };
      if (provider === 'verifik') {
        resultado = await consultarVerifik(documentType, documentNumber);
      } else if (provider === 'coresoft') {
        resultado = await consultarCoreSoft(documentType, documentNumber);
      } else {
        resultado = await consultarFactus(documentType, documentNumber);
      }

      // 3. Guardar en cache
      await saveToCache(
        documentType,
        documentNumber,
        provider,
        resultado.data,
        resultado.raw,
        organizationId,
        userId
      );

      return { success: true, provider, fromCache: false, data: resultado.data, rawResponse: resultado.raw };
    } catch (err: unknown) {
      ultimoError = err instanceof Error ? err.message : String(err);
      console.error(`Error consultando ${provider}:`, ultimoError);
      // Intentar siguiente proveedor
    }
  }

  return {
    success: false,
    provider: '',
    fromCache: false,
    data: {} as DianNormalizedData,
    error: ultimoError || 'No se pudo consultar DIAN/RUES. Verifique configuracion de API keys (Verifik, CoreSoft, Factus).',
  };
}

/**
 * Limpia entradas expiradas del cache. Puede llamarse desde un cron job.
 */
export async function limpiarCacheExpirado(): Promise<number> {
  const { count } = await supabase
    .from('dian_lookup_cache')
    .delete()
    .lt('expires_at', new Date().toISOString());
  return count || 0;
}
