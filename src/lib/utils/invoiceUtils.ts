import { supabase } from '@/lib/supabase/config'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Genera el siguiente número de factura secuencial para una organización
 * @param organizationId - ID de la organización
 * @param prefix - Prefijo del número de factura (default: 'FACT')
 * @returns Número de factura formateado (ej: 'FACT-0001')
 */
export async function generateInvoiceNumber(
  organizationId: number,
  prefix: string = 'FACT',
  currentNumber?: string
): Promise<string> {
  try {
    // Consultar TODOS los números de factura de la organización con el prefijo
    const { data, error } = await supabase
      .from('invoice_sales')
      .select('number')
      .eq('organization_id', organizationId)
      .like('number', `${prefix}-%`);

    if (error) throw error;

    // Construir set de números existentes para verificación rápida
    // Incluir el número actual del input para que siempre genere uno diferente
    const existingNumbers = new Set<string>();
    for (const row of data || []) {
      if (row.number) existingNumbers.add(normalizeInvoiceNumber(row.number));
    }
    if (currentNumber) {
      existingNumbers.add(normalizeInvoiceNumber(currentNumber));
    }

    // Extraer el número secuencial máximo de los números en la BD
    // Esto maneja números con sufijos (FACT-0189 NEG), espacios (FACT- 8701 Y),
    // y formatos inconsistentes. Solo de la BD, no del currentNumber,
    // para evitar que un fallback con timestamp inflé el maxNumber.
    // Se filtran números con más de 7 dígitos (timestamp fallbacks como FACT-857464536)
    // que no son números secuenciales reales.
    let maxNumber = 0;
    const numberRegex = new RegExp(`${prefix}\\s*-\\s*(\\d{1,7})(?:\\D|$)`, 'i');
    for (const row of data || []) {
      if (!row.number) continue;
      const match = row.number.match(numberRegex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }

    // Generar el siguiente número y verificar que no exista ni coincida con el actual
    // Incrementar hasta encontrar uno disponible (maneja huecos y duplicados)
    let nextNumber = maxNumber + 1;
    let formattedNumber = `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
    while (existingNumbers.has(formattedNumber)) {
      nextNumber += 1;
      formattedNumber = `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
    }

    return formattedNumber;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    // Fallback con timestamp para evitar duplicados
    return `${prefix}-${Date.now()}`;
  }
}

/**
 * Normaliza un número de factura para comparación (sin espacios extra, en mayúsculas)
 */
function normalizeInvoiceNumber(number: string): string {
  return number.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Valida si un número de factura ya existe para una organización
 * @param invoiceNumber - Número de factura a validar
 * @param organizationId - ID de la organización
 * @returns true si el número ya existe, false si está disponible
 */
export async function validateInvoiceNumber(
  invoiceNumber: string, 
  organizationId: number
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('invoice_sales')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('number', invoiceNumber)
      .limit(1);

    if (error) throw error;
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Error validating invoice number:', error);
    return true; // En caso de error, asumir que existe para evitar duplicados
  }
}

/**
 * Versión server-side de generateInvoiceNumber que acepta un cliente Supabase
 * (service role) para usar desde API routes / webhooks sin sesión de browser.
 */
export async function generateInvoiceNumberWithClient(
  client: SupabaseClient,
  organizationId: number,
  prefix: string = 'FACT'
): Promise<string> {
  try {
    const { data, error } = await client
      .from('invoice_sales')
      .select('number')
      .eq('organization_id', organizationId)
      .like('number', `${prefix}-%`);

    if (error) throw error;

    const existingNumbers = new Set<string>();
    for (const row of data || []) {
      if (row.number) existingNumbers.add(normalizeInvoiceNumber(row.number));
    }

    let maxNumber = 0;
    const numberRegex = new RegExp(`${prefix}\\s*-\\s*(\\d{1,7})(?:\\D|$)`, 'i');
    for (const row of data || []) {
      if (!row.number) continue;
      const match = row.number.match(numberRegex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }

    let nextNumber = maxNumber + 1;
    let formattedNumber = `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
    while (existingNumbers.has(formattedNumber)) {
      nextNumber += 1;
      formattedNumber = `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
    }

    return formattedNumber;
  } catch (error) {
    console.error('Error generating invoice number (server):', error);
    return `${prefix}-${Date.now()}`;
  }
}
