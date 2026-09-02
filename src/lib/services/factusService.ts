/**
 * Servicio de integración con Factus API
 * Facturación Electrónica Colombia - DIAN
 */

// URLs de la API de Factus
const FACTUS_URLS = {
  sandbox: 'https://api-sandbox.factus.com.co',
  production: 'https://api.factus.com.co',
};

// Tipos de documentos electrónicos
export type FactusDocumentType = '01' | '03' | '91' | '92';

export interface FactusCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  environment: 'sandbox' | 'production';
}

export interface FactusToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface FactusEstablishment {
  name: string;
  address: string;
  phone_number: string;
  email: string;
  municipality_code: string;
}

export interface FactusCustomer {
  identification_document_code: string;
  identification: string;
  dv?: string;
  company?: string;
  trade_name?: string;
  names: string;
  address: string;
  email: string;
  phone: string;
  legal_organization_code: string;
  tribute_code: string;
  country_code?: string;
  municipality_code: string;
}

export interface FactusItem {
  code_reference: string;
  name: string;
  quantity: string;
  discount_rate?: string;
  discount_amount?: string;
  price: string;
  unit_measure_code: string;
  standard_code: string;
  note?: string;
  taxes: Array<{
    code: string;
    rate: string;
    is_excluded?: boolean;
  }>;
  withholding_taxes?: Array<{
    code: string;
    rate: string;
  }>;
}

export interface FactusAllowanceCharge {
  concept_type: string;
  is_surcharge: boolean;
  reason: string;
  base_amount: string;
  amount: string;
}

export interface FactusPaymentDetail {
  payment_form: string;
  payment_method_code: string;
  reference_code?: string;
  amount?: string;
  due_date?: string;
}

export interface FactusInvoiceRequest {
  reference_code: string;
  document?: FactusDocumentType;
  numbering_range_id: number;
  operation_type?: string;
  observation?: string;
  send_email?: boolean;
  cash_rounding_amount?: string;
  created_time?: string;
  currency?: { code: string; exchange_rate?: string };
  payment_details: FactusPaymentDetail[];
  establishment?: FactusEstablishment;
  customer: FactusCustomer;
  items: FactusItem[];
  allowance_charges?: FactusAllowanceCharge[];
}

export interface FactusInvoiceResponse {
  status: string;
  message: string;
  data?: {
    reference_code: string;
    number: string;
    order_reference: string | null;
    send_email: boolean;
    has_claim: boolean;
    is_negotiable_instrument: boolean;
    is_validated: boolean;
    validated_at: string | null;
    errors?: Record<string, string[]>;
    observation: string | null;
    created_at: string;
    cufe: string;
    document_type?: { code: string; name: string };
    operation_type?: { code: string; name: string };
    payment_details?: Array<{
      payment_form: { code: string; name: string };
      payment_method_code: { code: string; name: string };
      reference_code: string | null;
      amount: string;
      due_date: string | null;
    }>;
  };
  errors?: Record<string, string[]>;
}

export interface FactusNumberingRange {
  id: number;
  document: string;
  prefix: string;
  from: number;
  to: number;
  current: number;
  resolution_number: string;
  resolution_date: string;
  technical_key: string;
  is_expired: boolean;
}

export interface FactusAcquirerResponse {
  name: string;
  email: string;
}

// ============================================================
// Documentos Soporte (Support Documents) - Factus API v2
// Para compras a proveedores NO responsables de IVA
// ============================================================

export interface FactusSupportProvider {
  identification_document_code: string;
  identification: string;
  dv?: string;
  trade_name?: string;
  names: string;
  address: string;
  country_code: string;
  municipality_code?: string;
  email?: string;
  phone?: string;
  legal_organization_code?: string;
}

export interface FactusSupportItem {
  code_reference: string;
  name: string;
  quantity: string;
  discount_rate?: string;
  price: string;
  unit_measure_code: string;
  standard_code: string;
  note?: string;
  withholding_taxes?: Array<{ code: string; rate: string }>;
  taxes: Array<{ code: string; rate: string; is_excluded?: boolean }>;
}

export interface FactusSupportDocumentRequest {
  reference_code: string;
  numbering_range_id?: number;
  created_time?: string;
  observation?: string;
  payment_details: FactusPaymentDetail[];
  cash_rounding_amount?: string;
  establishment?: FactusEstablishment;
  provider: FactusSupportProvider;
  items: FactusSupportItem[];
}

export interface FactusSupportDocumentResponse {
  status: string;
  message: string;
  data?: {
    reference_code: string;
    number: string;
    observation: string | null;
    created_at: string;
    cufe: string;
    is_validated: boolean;
    validated_at: string | null;
    errors?: Record<string, string[]>;
    provider?: Record<string, unknown>;
    items?: Array<Record<string, unknown>>;
    payment_details?: Array<Record<string, unknown>>;
  };
  errors?: Record<string, string[]>;
}

/**
 * Obtiene la URL base según el ambiente
 */
function getBaseUrl(environment: 'sandbox' | 'production'): string {
  return FACTUS_URLS[environment];
}

/**
 * Autentica con Factus API y obtiene tokens
 */
export async function authenticate(credentials: FactusCredentials): Promise<FactusToken> {
  const baseUrl = getBaseUrl(credentials.environment);
  
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Error de autenticación Factus: ${error}`);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Refresca el token de acceso
 */
export async function refreshToken(
  credentials: FactusCredentials,
  currentRefreshToken: string
): Promise<FactusToken> {
  const baseUrl = getBaseUrl(credentials.environment);
  
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: currentRefreshToken,
    }),
  });

  if (!response.ok) {
    // Si falla refresh, intentar autenticación completa
    return authenticate(credentials);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Crea/Valida una factura electrónica
 */
export async function createInvoice(
  environment: 'sandbox' | 'production',
  accessToken: string,
  invoiceData: FactusInvoiceRequest
): Promise<FactusInvoiceResponse> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(`${baseUrl}/v2/bills/validate`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(invoiceData),
  });

  const result = await response.json();

  if (!response.ok) {
    const errorMsg = result.message || result.error || 'Error al crear factura en Factus';
    const validationErrors = result.data?.errors || result.errors || result.data?.message;
    const fullError = validationErrors 
      ? `${errorMsg}: ${JSON.stringify(validationErrors)}`
      : errorMsg;
    console.error('Factus createInvoice error:', JSON.stringify(result));
    throw new Error(fullError);
  }

  return result;
}

/**
 * Crea/Valida una nota crédito electrónica
 */
export async function createCreditNote(
  environment: 'sandbox' | 'production',
  accessToken: string,
  data: {
    reference_code: string;
    billing_reference: { number: string; cufe: string; uuid: string };
    credit_note_reason: string;
    payment_method_code: string;
    observation?: string;
    send_email?: boolean;
    items: FactusItem[];
    allowance_charges?: FactusAllowanceCharge[];
  }
): Promise<FactusInvoiceResponse> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(`${baseUrl}/v2/credit-notes/validate`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Error al crear nota crédito en Factus');
  }

  return result;
}

/**
 * Crea/Valida una nota débito electrónica
 */
export async function createDebitNote(
  environment: 'sandbox' | 'production',
  accessToken: string,
  data: {
    reference_code: string;
    billing_reference: { number: string; cufe: string; uuid: string };
    debit_note_reason: string;
    payment_method_code: string;
    observation?: string;
    send_email?: boolean;
    items: FactusItem[];
    allowance_charges?: FactusAllowanceCharge[];
  }
): Promise<FactusInvoiceResponse> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(`${baseUrl}/v2/debit-notes/validate`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Error al crear nota débito en Factus');
  }

  return result;
}

/**
 * Consulta una factura por código de referencia
 */
export async function getInvoiceByReference(
  environment: 'sandbox' | 'production',
  accessToken: string,
  referenceCode: string
): Promise<FactusInvoiceResponse> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(
    `${baseUrl}/v2/bills/${referenceCode}/show-by-reference-code`,
    {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Error al consultar factura en Factus');
  }

  return response.json();
}

/**
 * Descarga el PDF de una factura
 * Factus devuelve JSON con pdf_base_64_encoded
 */
export async function downloadPDF(
  environment: 'sandbox' | 'production',
  accessToken: string,
  invoiceNumber: string
): Promise<Buffer> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(
    `${baseUrl}/v2/bills/${invoiceNumber}/download-pdf`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.message || errorData?.error || 'Error al descargar PDF de Factus';
    console.error('Factus downloadPDF error:', errorData);
    throw new Error(msg);
  }

  const jsonData = await response.json();
  const base64Data = jsonData?.data?.pdf_base_64_encoded || jsonData?.pdf_base_64_encoded;
  if (!base64Data) {
    throw new Error('Factus no devolvió el PDF en base64');
  }

  return Buffer.from(base64Data, 'base64');
}

/**
 * Descarga el XML de una factura
 * Factus devuelve JSON con xml_base_64_encoded
 */
export async function downloadXML(
  environment: 'sandbox' | 'production',
  accessToken: string,
  invoiceNumber: string
): Promise<string> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(
    `${baseUrl}/v2/bills/${invoiceNumber}/download-xml`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.message || errorData?.error || 'Error al descargar XML de Factus';
    console.error('Factus downloadXML error:', errorData);
    throw new Error(msg);
  }

  const jsonData = await response.json();
  const base64Data = jsonData?.data?.xml_base_64_encoded || jsonData?.xml_base_64_encoded;
  if (!base64Data) {
    throw new Error('Factus no devolvió el XML en base64');
  }

  return Buffer.from(base64Data, 'base64').toString('utf-8');
}

/**
 * Obtiene los rangos de numeración configurados
 */
export async function getNumberingRanges(
  environment: 'sandbox' | 'production',
  accessToken: string
): Promise<FactusNumberingRange[]> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(`${baseUrl}/v2/numbering-ranges`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Error ${response.status} al obtener rangos de numeración`);
  }

  const result = await response.json();
  return result.data || [];
}

/**
 * Obtiene los municipios de Colombia
 */
export async function getMunicipalities(
  environment: 'sandbox' | 'production',
  accessToken: string
): Promise<Array<{ id: number; code: string; name: string; department: string }>> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(`${baseUrl}/v2/municipalities`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Error al obtener municipios');
  }

  const result = await response.json();
  return result.data || [];
}

/**
 * Obtiene las unidades de medida
 */
export async function getUnitMeasures(
  environment: 'sandbox' | 'production',
  accessToken: string
): Promise<Array<{ id: number; code: string; name: string }>> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(`${baseUrl}/v2/measurement-units`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Error al obtener unidades de medida');
  }

  const result = await response.json();
  return result.data || [];
}

/**
 * Consulta datos de adquiriente en DIAN via Factus
 * GET /v2/dian/acquirer
 *
 * Devuelve nombre y email del adquiriente desde la base oficial de DIAN.
 * No devuelve telefono, direccion, responsabilidades fiscales, etc.
 *
 * Rate limit: 80 req/min por usuario.
 */
export async function getAcquirer(
  environment: 'sandbox' | 'production',
  accessToken: string,
  identificationDocumentCode: string,
  identificationNumber: string
): Promise<FactusAcquirerResponse> {
  const baseUrl = getBaseUrl(environment);
  const url = `${baseUrl}/v2/dian/acquirer?identification_document_code=${encodeURIComponent(identificationDocumentCode)}&identification_number=${encodeURIComponent(identificationNumber)}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Factus getAcquirer error ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  const data = result?.data;
  if (!data || (!data.name && !data.email)) {
    throw new Error('Adquiriente no encontrado en DIAN');
  }

  return {
    name: data.name || '',
    email: data.email || '',
  };
}

/**
 * Mapea el tipo de identificación del sistema a código DIAN (string)
 */
export function mapIdentificationType(type: string | undefined): string {
  const mapping: Record<string, string> = {
    'CC': '13',  // Cédula de ciudadanía
    'NIT': '31', // NIT
    'CE': '22',  // Cédula extranjería
    'TI': '12',  // Tarjeta de identidad
    'PP': '41',  // Pasaporte
    'RC': '11',  // Registro civil
    'TE': '21',  // Tarjeta extranjería
    'NUIP': '91', // NUIP
  };
  return mapping[type || 'CC'] || '13';
}

/**
 * Mapea el tipo de documento del sistema a código Factus
 */
export function mapDocumentType(type: string | undefined): FactusDocumentType {
  const mapping: Record<string, FactusDocumentType> = {
    'invoice': '01',
    'credit_note': '91',
    'debit_note': '92',
    'support_document': '03',
  };
  return mapping[type || 'invoice'] || '01';
}

/**
 * Mapea el tipo de organización del sistema a código DIAN (string)
 */
export function mapLegalOrganization(customerType: string | undefined): string {
  if (customerType === 'company' || customerType === 'empresa') return '1'; // Persona Jurídica
  return '2'; // Persona Natural
}

/**
 * Mapea el ID de tributo interno a código DIAN (string)
 */
export function mapTribute(tributeId: number | null | undefined): string {
  const mapping: Record<number, string> = {
    1: '01',  // IVA
    2: 'ZZ',   // No responsable de IVA
    3: '04',   // Consumo
    4: '0A',   // Régimen simple
    5: '06',   // Renta
    6: '07',   // ICA
  };
  return mapping[tributeId || 2] || 'ZZ';
}

/**
 * Mapea el ID de unidad de medida interno a código DIAN (string)
 */
export function mapUnitMeasure(unitMeasureId: number | null | undefined): string {
  const mapping: Record<number, string> = {
    1: '94',   // Unidad
    2: '93',   // Decenas
    3: '95',   // Centenas
    4: '96',   // Millares
    5: '97',   // Centímetros
    6: '98',   // Gramos
    7: '99',   // Kilogramos
    8: '100',  // Litros
    9: '101',  // Metros
    10: '102', // Metros cuadrados
  };
  return mapping[unitMeasureId || 1] || '94';
}

/**
 * Mapea el ID de código estándar interno a código DIAN (string)
 */
export function mapStandardCode(standardCodeId: number | null | undefined): string {
  const mapping: Record<number, string> = {
    1: '999', // Estándar internacional
    2: '001', // Sector salud
    3: '002', // Sector telecomunicaciones
  };
  return mapping[standardCodeId || 1] || '999';
}

/**
 * Mapea el código de impuesto interno a código DIAN (string)
 */
export function mapTaxCode(taxCode: string | undefined): string {
  const mapping: Record<string, string> = {
    'IVA_19': '01',
    'IVA_5': '01',
    'IVA_0': '01',
    'IVA': '01',
    'RETE_4': '09',
    'RETE_11': '09',
    'ICA_0.966': '07',
    '01': '01',
    '04': '04',
    '06': '06',
    '07': '07',
    '08': '08',
    '09': '09',
    '10': '10',
  };
  return mapping[taxCode || '01'] || '01';
}

/**
 * Mapea el método de pago del sistema a código DIAN
 */
export function mapPaymentMethod(method: string | undefined): string {
  const mapping: Record<string, string> = {
    'cash': '10',
    'efectivo': '10',
    'transfer': '47',
    'transferencia': '47',
    'credit_card': '48',
    'tarjeta_credito': '48',
    'debit_card': '49',
    'tarjeta_debito': '49',
    'check': '20',
    'cheque': '20',
    'consignment': '42',
    'consignacion': '42',
  };
  return mapping[method?.toLowerCase() || 'cash'] || '10';
}

// ============================================================
// Documentos Soporte - Métodos de la API de Factus v2
// ============================================================

/**
 * Crea/Valida un documento soporte electrónico
 * POST /v2/support-documents/validate
 */
export async function createSupportDocument(
  environment: 'sandbox' | 'production',
  accessToken: string,
  data: FactusSupportDocumentRequest
): Promise<FactusSupportDocumentResponse> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(`${baseUrl}/v2/support-documents/validate`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    const errorMsg = result.message || result.error || 'Error al crear documento soporte en Factus';
    const validationErrors = result.data?.errors || result.errors || result.data?.message;
    const fullError = validationErrors
      ? `${errorMsg}: ${JSON.stringify(validationErrors)}`
      : errorMsg;
    console.error('Factus createSupportDocument error:', JSON.stringify(result));
    throw new Error(fullError);
  }

  return result;
}

/**
 * Consulta un documento soporte por código de referencia
 * GET /v2/support-documents/{reference_code}/show-by-reference-code
 */
export async function getSupportDocumentByReference(
  environment: 'sandbox' | 'production',
  accessToken: string,
  referenceCode: string
): Promise<FactusSupportDocumentResponse> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(
    `${baseUrl}/v2/support-documents/${referenceCode}/show-by-reference-code`,
    {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.message || errorData?.error || 'Error al consultar documento soporte en Factus';
    throw new Error(msg);
  }

  return response.json();
}

/**
 * Lista documentos soporte con filtros opcionales
 * GET /v2/support-documents?filter[...]=...
 */
export async function listSupportDocuments(
  environment: 'sandbox' | 'production',
  accessToken: string,
  filters?: { page?: number; status?: string; identification?: string; number?: string }
): Promise<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> }> {
  const baseUrl = getBaseUrl(environment);
  const params = new URLSearchParams();

  if (filters?.page) params.append('page', String(filters.page));
  if (filters?.status) params.append('filter[status]', filters.status);
  if (filters?.identification) params.append('filter[identification]', filters.identification);
  if (filters?.number) params.append('filter[number]', filters.number);

  const queryString = params.toString();
  const url = `${baseUrl}/v2/support-documents${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.message || errorData?.error || `Error ${response.status} al listar documentos soporte`;
    throw new Error(msg);
  }

  const result = await response.json();
  return { data: result.data || [], meta: result.meta };
}

/**
 * Elimina un documento soporte no validado
 * DELETE /v2/support-documents/{reference_code}
 */
export async function deleteSupportDocument(
  environment: 'sandbox' | 'production',
  accessToken: string,
  referenceCode: string
): Promise<{ status: string; message: string }> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(
    `${baseUrl}/v2/support-documents/${referenceCode}`,
    {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.message || errorData?.error || 'Error al eliminar documento soporte en Factus';
    throw new Error(msg);
  }

  return response.json();
}

/**
 * Descarga el PDF de un documento soporte
 * GET /v2/support-documents/{number}/download-pdf
 */
export async function downloadSupportDocumentPDF(
  environment: 'sandbox' | 'production',
  accessToken: string,
  documentNumber: string
): Promise<Buffer> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(
    `${baseUrl}/v2/support-documents/${documentNumber}/download-pdf`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.message || errorData?.error || 'Error al descargar PDF del documento soporte';
    console.error('Factus downloadSupportDocumentPDF error:', errorData);
    throw new Error(msg);
  }

  const jsonData = await response.json();
  const base64Data = jsonData?.data?.pdf_base_64_encoded || jsonData?.pdf_base_64_encoded;
  if (!base64Data) {
    throw new Error('Factus no devolvió el PDF del documento soporte en base64');
  }

  return Buffer.from(base64Data, 'base64');
}

/**
 * Descarga el XML de un documento soporte
 * GET /v2/support-documents/{number}/download-xml
 */
export async function downloadSupportDocumentXML(
  environment: 'sandbox' | 'production',
  accessToken: string,
  documentNumber: string
): Promise<string> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(
    `${baseUrl}/v2/support-documents/${documentNumber}/download-xml`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const msg = errorData?.message || errorData?.error || 'Error al descargar XML del documento soporte';
    console.error('Factus downloadSupportDocumentXML error:', errorData);
    throw new Error(msg);
  }

  const jsonData = await response.json();
  const base64Data = jsonData?.data?.xml_base_64_encoded || jsonData?.xml_base_64_encoded;
  if (!base64Data) {
    throw new Error('Factus no devolvió el XML del documento soporte en base64');
  }

  return Buffer.from(base64Data, 'base64').toString('utf-8');
}

// Exportar servicio como objeto
const factusService = {
  authenticate,
  refreshToken,
  createInvoice,
  createCreditNote,
  createDebitNote,
  getInvoiceByReference,
  downloadPDF,
  downloadXML,
  getNumberingRanges,
  getMunicipalities,
  getUnitMeasures,
  getAcquirer,
  createSupportDocument,
  getSupportDocumentByReference,
  listSupportDocuments,
  deleteSupportDocument,
  downloadSupportDocumentPDF,
  downloadSupportDocumentXML,
  mapIdentificationType,
  mapDocumentType,
  mapPaymentMethod,
  mapLegalOrganization,
  mapTribute,
  mapUnitMeasure,
  mapStandardCode,
  mapTaxCode,
  FACTUS_URLS,
};

export default factusService;
