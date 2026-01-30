'use client';

import { supabase } from '@/lib/supabase/config';

// Interfaces
export interface ShippingLabel {
  id: string;
  organization_id: number;
  shipment_id: string;
  label_number: string;
  label_type: 'shipping' | 'return' | 'customs';
  format: 'pdf' | 'zpl' | 'png' | 'epl';
  file_url: string;
  file_size_bytes?: number;
  barcode_value?: string;
  barcode_type?: 'code128' | 'code39' | 'qrcode' | 'datamatrix';
  carrier_id?: string;
  carrier_label_id?: string;
  carrier_tracking?: string;
  width_mm?: number;
  height_mm?: number;
  is_printed: boolean;
  printed_at?: string;
  printed_by?: string;
  print_count: number;
  expires_at?: string;
  is_void: boolean;
  voided_at?: string;
  void_reason?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LabelWithDetails extends ShippingLabel {
  shipments?: {
    id: string;
    shipment_number: string;
    tracking_number?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_contact_name?: string;
    delivery_contact_phone?: string;
    weight_kg?: number;
    status?: string;
    customers?: {
      id: string;
      full_name?: string;
      email?: string;
    };
  };
  transport_carriers?: {
    id: string;
    name: string;
    code: string;
    carrier_type: string;
  };
}

export interface LabelCreateInput {
  shipment_id: string;
  label_type?: 'shipping' | 'return' | 'customs';
  format?: 'pdf' | 'zpl' | 'png' | 'epl';
  carrier_id?: string;
  width_mm?: number;
  height_mm?: number;
  barcode_type?: 'code128' | 'code39' | 'qrcode' | 'datamatrix';
  metadata?: Record<string, unknown>;
}

export interface LabelUpdateInput {
  label_type?: 'shipping' | 'return' | 'customs';
  format?: 'pdf' | 'zpl' | 'png' | 'epl';
  carrier_id?: string;
  width_mm?: number;
  height_mm?: number;
  metadata?: Record<string, unknown>;
}

export interface LabelFilters {
  shipmentId?: string;
  carrierId?: string;
  status?: 'active' | 'printed' | 'void' | 'all';
  labelType?: string;
  search?: string;
}

class LabelsService {
  private readonly BUCKET_NAME = 'shipping-labels';

  /**
   * Genera un número único de etiqueta
   */
  private generateLabelNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `LBL-${timestamp}-${random}`;
  }

  /**
   * Obtiene todas las etiquetas de una organización
   */
  async getLabels(organizationId: number, filters?: LabelFilters): Promise<LabelWithDetails[]> {
    let query = supabase
      .from('shipping_labels')
      .select(`
        *,
        shipments(
          id, shipment_number, tracking_number, delivery_address, 
          delivery_city, delivery_contact_name, delivery_contact_phone,
          weight_kg, status,
          customers(id, full_name, email)
        ),
        transport_carriers(id, name, code, carrier_type)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filters?.shipmentId) {
      query = query.eq('shipment_id', filters.shipmentId);
    }

    if (filters?.carrierId) {
      query = query.eq('carrier_id', filters.carrierId);
    }

    if (filters?.labelType) {
      query = query.eq('label_type', filters.labelType);
    }

    if (filters?.status && filters.status !== 'all') {
      if (filters.status === 'printed') {
        query = query.eq('is_printed', true).eq('is_void', false);
      } else if (filters.status === 'void') {
        query = query.eq('is_void', true);
      } else if (filters.status === 'active') {
        query = query.eq('is_void', false);
      }
    }

    if (filters?.search) {
      query = query.or(`label_number.ilike.%${filters.search}%,barcode_value.ilike.%${filters.search}%,carrier_tracking.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []) as LabelWithDetails[];
  }

  /**
   * Obtiene una etiqueta por ID
   */
  async getLabelById(labelId: string): Promise<LabelWithDetails | null> {
    const { data, error } = await supabase
      .from('shipping_labels')
      .select(`
        *,
        shipments(
          id, shipment_number, tracking_number, delivery_address, 
          delivery_city, delivery_contact_name, delivery_contact_phone,
          weight_kg, status,
          customers(id, full_name, email)
        ),
        transport_carriers(id, name, code, carrier_type)
      `)
      .eq('id', labelId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as LabelWithDetails;
  }

  /**
   * Crea una nueva etiqueta
   */
  async createLabel(organizationId: number, input: LabelCreateInput): Promise<LabelWithDetails> {
    const labelNumber = this.generateLabelNumber();
    const barcodeValue = labelNumber.replace(/-/g, '');

    // Crear registro en la base de datos
    const { data, error } = await supabase
      .from('shipping_labels')
      .insert({
        organization_id: organizationId,
        shipment_id: input.shipment_id,
        label_number: labelNumber,
        label_type: input.label_type || 'shipping',
        format: input.format || 'pdf',
        file_url: '', // Se actualizará después de generar el archivo
        barcode_value: barcodeValue,
        barcode_type: input.barcode_type || 'code128',
        carrier_id: input.carrier_id,
        width_mm: input.width_mm || 100,
        height_mm: input.height_mm || 150,
        is_printed: false,
        print_count: 0,
        is_void: false,
        metadata: input.metadata || {},
      })
      .select(`
        *,
        shipments(
          id, shipment_number, tracking_number, delivery_address, 
          delivery_city, delivery_contact_name, delivery_contact_phone,
          weight_kg, status,
          customers(id, full_name, email)
        ),
        transport_carriers(id, name, code, carrier_type)
      `)
      .single();

    if (error) throw error;
    return data as LabelWithDetails;
  }

  /**
   * Actualiza una etiqueta existente
   */
  async updateLabel(labelId: string, input: LabelUpdateInput): Promise<LabelWithDetails> {
    const { data, error } = await supabase
      .from('shipping_labels')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', labelId)
      .select(`
        *,
        shipments(
          id, shipment_number, tracking_number, delivery_address, 
          delivery_city, delivery_contact_name, delivery_contact_phone,
          weight_kg, status,
          customers(id, full_name, email)
        ),
        transport_carriers(id, name, code, carrier_type)
      `)
      .single();

    if (error) throw error;
    return data as LabelWithDetails;
  }

  /**
   * Duplica una etiqueta existente
   */
  async duplicateLabel(labelId: string): Promise<LabelWithDetails> {
    // Obtener la etiqueta original
    const original = await this.getLabelById(labelId);
    if (!original) throw new Error('Etiqueta no encontrada');

    // Crear nueva etiqueta con los mismos datos
    return this.createLabel(original.organization_id, {
      shipment_id: original.shipment_id,
      label_type: original.label_type,
      format: original.format,
      carrier_id: original.carrier_id || undefined,
      width_mm: original.width_mm,
      height_mm: original.height_mm,
      barcode_type: original.barcode_type,
      metadata: { ...original.metadata, duplicated_from: original.id },
    });
  }

  /**
   * Anula una etiqueta
   */
  async voidLabel(labelId: string, reason: string): Promise<LabelWithDetails> {
    const { data, error } = await supabase
      .from('shipping_labels')
      .update({
        is_void: true,
        voided_at: new Date().toISOString(),
        void_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', labelId)
      .select(`
        *,
        shipments(
          id, shipment_number, tracking_number, delivery_address, 
          delivery_city, delivery_contact_name, delivery_contact_phone,
          weight_kg, status,
          customers(id, full_name, email)
        ),
        transport_carriers(id, name, code, carrier_type)
      `)
      .single();

    if (error) throw error;
    return data as LabelWithDetails;
  }

  /**
   * Marca una etiqueta como impresa
   */
  async markAsPrinted(labelId: string, userId?: string): Promise<LabelWithDetails> {
    const { data: current } = await supabase
      .from('shipping_labels')
      .select('print_count')
      .eq('id', labelId)
      .single();

    const { data, error } = await supabase
      .from('shipping_labels')
      .update({
        is_printed: true,
        printed_at: new Date().toISOString(),
        printed_by: userId,
        print_count: (current?.print_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', labelId)
      .select(`
        *,
        shipments(
          id, shipment_number, tracking_number, delivery_address, 
          delivery_city, delivery_contact_name, delivery_contact_phone,
          weight_kg, status,
          customers(id, full_name, email)
        ),
        transport_carriers(id, name, code, carrier_type)
      `)
      .single();

    if (error) throw error;
    return data as LabelWithDetails;
  }

  /**
   * Regenera una etiqueta (crea nueva y anula la anterior)
   */
  async regenerateLabel(labelId: string, reason: string = 'Datos actualizados'): Promise<LabelWithDetails> {
    // Anular la etiqueta actual
    const oldLabel = await this.voidLabel(labelId, reason);

    // Crear nueva etiqueta con los mismos datos
    return this.createLabel(oldLabel.organization_id, {
      shipment_id: oldLabel.shipment_id,
      label_type: oldLabel.label_type,
      format: oldLabel.format,
      carrier_id: oldLabel.carrier_id || undefined,
      width_mm: oldLabel.width_mm,
      height_mm: oldLabel.height_mm,
      barcode_type: oldLabel.barcode_type,
      metadata: { ...oldLabel.metadata, regenerated_from: oldLabel.id },
    });
  }

  /**
   * Sube un archivo de etiqueta al Storage
   */
  async uploadLabelFile(labelId: string, file: File): Promise<string> {
    const extension = file.name.split('.').pop() || 'pdf';
    const filePath = `${labelId}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(this.BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from(this.BUCKET_NAME)
      .getPublicUrl(filePath);

    const fileUrl = urlData.publicUrl;

    // Actualizar el registro con la URL del archivo
    await supabase
      .from('shipping_labels')
      .update({
        file_url: fileUrl,
        file_size_bytes: file.size,
        updated_at: new Date().toISOString(),
      })
      .eq('id', labelId);

    return fileUrl;
  }

  /**
   * Descarga una etiqueta
   */
  async downloadLabel(label: LabelWithDetails): Promise<Blob | null> {
    if (!label.file_url) return null;

    try {
      const response = await fetch(label.file_url);
      if (!response.ok) throw new Error('Error descargando archivo');
      return await response.blob();
    } catch (error) {
      console.error('Error downloading label:', error);
      return null;
    }
  }

  /**
   * Obtiene los carriers disponibles
   */
  async getCarriers(organizationId: number): Promise<Array<{ id: string; name: string; code: string }>> {
    const { data, error } = await supabase
      .from('transport_carriers')
      .select('id, name, code')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene los envíos sin etiqueta
   */
  async getShipmentsWithoutLabel(organizationId: number): Promise<Array<{ id: string; shipment_number: string; tracking_number?: string }>> {
    // Obtener IDs de envíos que ya tienen etiqueta activa
    const { data: labelsData } = await supabase
      .from('shipping_labels')
      .select('shipment_id')
      .eq('organization_id', organizationId)
      .eq('is_void', false);

    const shipmentIdsWithLabel = (labelsData || []).map(l => l.shipment_id);

    // Obtener envíos sin etiqueta
    let query = supabase
      .from('shipments')
      .select('id, shipment_number, tracking_number')
      .eq('organization_id', organizationId)
      .in('status', ['pending', 'received', 'processing'])
      .order('created_at', { ascending: false });

    if (shipmentIdsWithLabel.length > 0) {
      query = query.not('id', 'in', `(${shipmentIdsWithLabel.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Importa etiquetas desde un archivo CSV
   */
  async importLabelsFromCSV(organizationId: number, csvData: string): Promise<{ success: number; errors: string[] }> {
    const lines = csvData.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    let success = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });

        if (!row.shipment_id) {
          errors.push(`Línea ${i + 1}: shipment_id es requerido`);
          continue;
        }

        await this.createLabel(organizationId, {
          shipment_id: row.shipment_id,
          label_type: (row.label_type as LabelCreateInput['label_type']) || 'shipping',
          format: (row.format as LabelCreateInput['format']) || 'pdf',
          carrier_id: row.carrier_id || undefined,
        });

        success++;
      } catch (error) {
        errors.push(`Línea ${i + 1}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      }
    }

    return { success, errors };
  }
}

export const labelsService = new LabelsService();
export default labelsService;
