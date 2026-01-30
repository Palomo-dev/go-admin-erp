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
  municipality_id: number;
}

export interface FactusCustomer {
  identification_document_id: number;
  identification: string;
  dv?: number;
  company?: string;
  trade_name?: string;
  names: string;
  address: string;
  email: string;
  phone: string;
  legal_organization_id: number;
  tribute_id: number;
  municipality_id: number;
}

export interface FactusItem {
  code_reference: string;
  name: string;
  quantity: number;
  discount_rate: number;
  price: number;
  tax_rate: string;
  unit_measure_id: number;
  standard_code_id: number;
  is_excluded: number;
  tribute_id: number;
  withholding_taxes?: Array<{
    code: string;
    withholding_tax_rate: number;
  }>;
}

export interface FactusAllowanceCharge {
  concept_type: string;
  is_surcharge: boolean;
  reason: string;
  base_amount: string;
  amount: string;
}

export interface FactusInvoiceRequest {
  document: FactusDocumentType;
  numbering_range_id: number;
  reference_code: string;
  observation?: string;
  payment_form?: '1' | '2';
  payment_method_code: string;
  payment_due_date?: string;
  send_email?: boolean;
  establishment: FactusEstablishment;
  customer: FactusCustomer;
  items: FactusItem[];
  allowance_charges?: FactusAllowanceCharge[];
}

export interface FactusInvoiceResponse {
  status: string;
  message: string;
  data?: {
    bill: {
      id: number;
      number: string;
      cufe: string;
      qr: string;
      qr_image?: string;
      validated: boolean;
      status: string;
      created_at: string;
    };
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

  const response = await fetch(`${baseUrl}/v1/bills/validate`, {
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
    throw new Error(result.message || 'Error al crear factura en Factus');
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
    `${baseUrl}/v1/bills/${referenceCode}/show-by-reference-code`,
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
 */
export async function downloadPDF(
  environment: 'sandbox' | 'production',
  accessToken: string,
  invoiceNumber: string
): Promise<Blob> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(
    `${baseUrl}/v1/bills/${invoiceNumber}/download-pdf`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Error al descargar PDF de Factus');
  }

  return response.blob();
}

/**
 * Descarga el XML de una factura
 */
export async function downloadXML(
  environment: 'sandbox' | 'production',
  accessToken: string,
  invoiceNumber: string
): Promise<string> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(
    `${baseUrl}/v1/bills/${invoiceNumber}/download-xml`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Error al descargar XML de Factus');
  }

  return response.text();
}

/**
 * Obtiene los rangos de numeración configurados
 */
export async function getNumberingRanges(
  environment: 'sandbox' | 'production',
  accessToken: string
): Promise<FactusNumberingRange[]> {
  const baseUrl = getBaseUrl(environment);

  const response = await fetch(`${baseUrl}/v1/numbering-ranges`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Error al obtener rangos de numeración');
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

  const response = await fetch(`${baseUrl}/v1/municipalities`, {
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

  const response = await fetch(`${baseUrl}/v1/measurement-units`, {
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
 * Mapea el tipo de identificación del sistema a ID de Factus
 */
export function mapIdentificationType(type: string | undefined): number {
  const mapping: Record<string, number> = {
    'CC': 3,  // Cédula de ciudadanía
    'NIT': 6, // NIT
    'CE': 5,  // Cédula extranjería
    'TI': 2,  // Tarjeta de identidad
    'PP': 7,  // Pasaporte
    'RC': 1,  // Registro civil
    'TE': 4,  // Tarjeta extranjería
    'NUIP': 11, // NUIP
  };
  return mapping[type || 'CC'] || 3;
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

// Exportar servicio como objeto
const factusService = {
  authenticate,
  refreshToken,
  createInvoice,
  getInvoiceByReference,
  downloadPDF,
  downloadXML,
  getNumberingRanges,
  getMunicipalities,
  getUnitMeasures,
  mapIdentificationType,
  mapDocumentType,
  mapPaymentMethod,
  FACTUS_URLS,
};

export default factusService;
