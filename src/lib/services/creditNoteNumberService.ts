/**
 * Servicio centralizado para generar números consecutivos de notas de crédito
 * 
 * Este servicio garantiza que todos los módulos (POS, Finanzas) usen el mismo
 * formato y numeración consecutiva sin duplicados.
 */

import { supabase } from '@/lib/supabase/config';

export class CreditNoteNumberService {
  /**
   * Genera el siguiente número consecutivo de nota de crédito
   * Formato estándar: NC-0001, NC-0002, NC-0003, etc.
   * 
   * @param organizationId - ID de la organización
   * @returns Promise<string> - Siguiente número consecutivo
   */
  static async generateNextCreditNoteNumber(organizationId: string): Promise<string> {
    try {
      console.log('🔢 Generando siguiente número de nota de crédito...');
      
      // Buscar todas las notas de crédito para encontrar el número más alto
      const { data: creditNotes, error } = await supabase
        .from('invoice_sales')
        .select('number')
        .eq('document_type', 'credit_note')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error consultando notas de crédito:', error);
        throw new Error(`Error al consultar notas de crédito: ${error.message}`);
      }

      let maxNumber = 0;

      if (creditNotes && creditNotes.length > 0) {
        console.log(`📋 Encontradas ${creditNotes.length} notas de crédito existentes`);
        
        // Procesar cada número para encontrar el más alto
        creditNotes.forEach(note => {
          if (note.number) {
            const extractedNumber = this.extractNumberFromCreditNoteString(note.number);
            if (extractedNumber > maxNumber) {
              maxNumber = extractedNumber;
            }
          }
        });
        
        console.log(`🔍 Número más alto encontrado: ${maxNumber}`);
      } else {
        console.log('📝 No hay notas de crédito previas, iniciando desde 0');
      }

      // Generar siguiente número
      const nextNumber = maxNumber + 1;
      const formattedNumber = `NC-${String(nextNumber).padStart(4, '0')}`;
      
      console.log(`✅ Número generado: ${formattedNumber}`);
      return formattedNumber;

    } catch (error) {
      console.error('❌ Error en generateNextCreditNoteNumber:', error);
      throw error;
    }
  }

  /**
   * Extrae el número entero de una cadena de nota de crédito
   * Maneja diferentes formatos existentes:
   * - "NC-0001" → 1
   * - "NC00000004" → 4  
   * - "NC-0NaN" → 0 (casos con error)
   * 
   * @param creditNoteString - Cadena del número de nota de crédito
   * @returns number - Número extraído
   */
  private static extractNumberFromCreditNoteString(creditNoteString: string): number {
    try {
      // Remover prefijo NC y cualquier carácter no numérico del inicio
      let numberPart = creditNoteString.replace(/^NC[-]?/i, '');
      
      // Si contiene "NaN" o caracteres inválidos, retornar 0
      if (numberPart.includes('NaN') || numberPart.includes('undefined')) {
        console.warn(`⚠️ Número inválido detectado: ${creditNoteString}, usando 0`);
        return 0;
      }
      
      // Extraer solo dígitos
      const digits = numberPart.replace(/\D/g, '');
      
      if (digits === '') {
        console.warn(`⚠️ No se encontraron dígitos en: ${creditNoteString}, usando 0`);
        return 0;
      }
      
      const number = parseInt(digits, 10);
      
      if (isNaN(number)) {
        console.warn(`⚠️ Número inválido después del parsing: ${creditNoteString}, usando 0`);
        return 0;
      }
      
      return number;
      
    } catch (error) {
      console.warn(`⚠️ Error procesando número: ${creditNoteString}, usando 0. Error:`, error);
      return 0;
    }
  }

  /**
   * Valida si un número de nota de crédito ya existe
   * 
   * @param organizationId - ID de la organización
   * @param creditNoteNumber - Número a validar
   * @returns Promise<boolean> - true si existe, false si no existe
   */
  static async creditNoteNumberExists(organizationId: string, creditNoteNumber: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('invoice_sales')
        .select('id')
        .eq('document_type', 'credit_note')
        .eq('organization_id', organizationId)
        .eq('number', creditNoteNumber)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return !!data;
    } catch (error) {
      console.error('❌ Error validando existencia de número:', error);
      throw error;
    }
  }

  /**
   * Normaliza números existentes a formato estándar (para migración)
   * NOTA: Esta función es para uso administrativo solamente
   * 
   * @param organizationId - ID de la organización
   */
  static async normalizeExistingCreditNoteNumbers(organizationId: string): Promise<void> {
    console.log('🔧 ADVERTENCIA: Normalizando números existentes...');
    
    try {
      // Obtener todas las notas de crédito con formatos inconsistentes
      const { data: creditNotes, error } = await supabase
        .from('invoice_sales')
        .select('id, number')
        .eq('document_type', 'credit_note')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!creditNotes || creditNotes.length === 0) {
        console.log('📝 No hay notas de crédito para normalizar');
        return;
      }

      console.log(`📋 Normalizando ${creditNotes.length} notas de crédito...`);

      // Renumerar secuencialmente
      for (let i = 0; i < creditNotes.length; i++) {
        const note = creditNotes[i];
        const newNumber = `NC-${String(i + 1).padStart(4, '0')}`;
        
        if (note.number !== newNumber) {
          console.log(`🔄 Actualizando ${note.number} → ${newNumber}`);
          
          const { error: updateError } = await supabase
            .from('invoice_sales')
            .update({ number: newNumber })
            .eq('id', note.id);

          if (updateError) {
            console.error(`❌ Error actualizando ${note.id}:`, updateError);
          } else {
            console.log(`✅ Actualizado: ${note.number} → ${newNumber}`);
          }
        }
      }

      console.log('✅ Normalización completada');
      
    } catch (error) {
      console.error('❌ Error en normalización:', error);
      throw error;
    }
  }
}
