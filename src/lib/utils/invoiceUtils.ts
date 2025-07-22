import { supabase } from '@/lib/supabase/config'

/**
 * Genera el siguiente número de factura secuencial para una organización
 * @param organizationId - ID de la organización
 * @param prefix - Prefijo del número de factura (default: 'FACT')
 * @returns Número de factura formateado (ej: 'FACT-0001')
 */
export async function generateInvoiceNumber(
  organizationId: number, 
  prefix: string = 'FACT'
): Promise<string> {
  try {
    // Consultar el número más alto de factura para la organización
    const { data, error } = await supabase
      .from('invoice_sales')
      .select('number')
      .eq('organization_id', organizationId)
      .like('number', `${prefix}-%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextNumber = 1;

    // Si hay facturas existentes, incrementar el número
    if (data && data.length > 0) {
      const lastNumber = data[0].number;
      // Extraer el número específico del prefijo
      const match = lastNumber.match(new RegExp(`${prefix}-(\\d+)`));
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      } else {
        // Fallback: extraer cualquier número al final
        const fallbackMatch = lastNumber.match(/(\d+)$/);
        if (fallbackMatch) {
          nextNumber = parseInt(fallbackMatch[1], 10) + 1;
        }
      }
    }

    // Formatear el número con ceros a la izquierda
    return `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    // Fallback con timestamp para evitar duplicados
    return `${prefix}-${Date.now()}`;
  }
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
