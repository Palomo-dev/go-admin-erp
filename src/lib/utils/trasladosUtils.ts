import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../supabase/config';
import { getOrganizationId } from '../hooks/useOrganization';

/**
 * Formatea una fecha para mostrarla en la interfaz de usuario
 * @param dateStr Fecha en formato string
 * @param formatStr Formato a aplicar (opcional)
 * @returns Fecha formateada
 */
export const formatDate = (dateStr: string, formatStr = "dd MMM yyyy, HH:mm") => {
  try {
    return format(new Date(dateStr), formatStr, { locale: es });
  } catch (e) {
    return dateStr;
  }
};

/**
 * Obtiene texto descriptivo para el estado de un traslado
 * @param status Código de estado
 * @returns Texto descriptivo
 */
export const getStatusText = (status: string) => {
  switch (status) {
    case 'pending': return 'Pendiente';
    case 'in_transit': return 'En tránsito';
    case 'received': return 'Recibido';
    default: return status;
  }
};

/**
 * Obtiene las sucursales de la organización actual
 * @returns Promesa que resuelve a un array de sucursales
 */
export const getBranches = async () => {
  try {
    const organizationId = getOrganizationId();
    
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, is_main, address')
      .eq('organization_id', organizationId)
      .order('is_main', { ascending: false })
      .order('name');
      
    if (error) throw error;
    
    return { data, error: null };
  } catch (err: any) {
    console.error('Error al obtener sucursales:', err);
    return { data: null, error: err.message };
  }
};

/**
 * Verifica que haya stock suficiente para realizar un traslado
 * @param branchId ID de la sucursal origen
 * @param productId ID del producto
 * @param quantity Cantidad a verificar
 * @param lotId ID del lote (opcional)
 * @returns Objeto con el resultado de la verificación
 */
export const checkStockAvailability = async (
  branchId: number,
  productId: number,
  quantity: number,
  lotId?: number | null
) => {
  try {
    const { data, error } = await supabase
      .from('stock_levels')
      .select('qty_on_hand')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .eq('lot_id', lotId || null)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') {
        // PGRST116 = Not found
        return { available: false, stock: 0, error: 'No hay stock disponible' };
      }
      throw error;
    }
    
    const availableStock = parseFloat(data?.qty_on_hand || '0');
    const isAvailable = availableStock >= quantity;
    
    return {
      available: isAvailable,
      stock: availableStock,
      error: isAvailable ? null : `Solo hay ${availableStock} unidades disponibles`
    };
  } catch (err: any) {
    console.error('Error al verificar stock:', err);
    return { available: false, stock: 0, error: err.message };
  }
};

/**
 * Valida los campos de un nuevo traslado
 * @param origin Sucursal origen
 * @param destination Sucursal destino
 * @param products Productos a trasladar
 * @returns Objeto con el resultado de la validación
 */
export const validateTransfer = (
  origin: number, 
  destination: number, 
  products: any[]
) => {
  if (!origin) {
    return { valid: false, error: 'Selecciona una sucursal de origen' };
  }
  
  if (!destination) {
    return { valid: false, error: 'Selecciona una sucursal de destino' };
  }
  
  if (origin === destination) {
    return { valid: false, error: 'Las sucursales de origen y destino no pueden ser iguales' };
  }
  
  if (!products || products.length === 0) {
    return { valid: false, error: 'Agrega al menos un producto para realizar el traslado' };
  }
  
  // Verificar que todas las cantidades sean mayores a 0
  const invalidProduct = products.find(p => p.quantity <= 0);
  if (invalidProduct) {
    return { valid: false, error: `La cantidad del producto ${invalidProduct.name} debe ser mayor a 0` };
  }
  
  return { valid: true, error: null };
};
