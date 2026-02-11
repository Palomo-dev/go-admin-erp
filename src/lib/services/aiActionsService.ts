import { supabase } from '@/lib/supabase/config';

// ==================== TIPOS DE ACCIONES ====================

export type AIActionType = 
  // Productos
  | 'create_product'
  | 'update_product'
  | 'update_product_stock'
  | 'update_product_price'
  // Clientes
  | 'create_customer'
  | 'update_customer'
  // Pedidos/Ventas
  | 'create_order'
  | 'update_order_status'
  // Compras
  | 'create_purchase_order'
  | 'update_purchase_order'
  // Inventario
  | 'create_stock_adjustment'
  | 'create_stock_transfer'
  // Categorías
  | 'create_category'
  | 'update_category'
  // Proveedores
  | 'create_supplier'
  | 'update_supplier';

export type AIActionStatus = 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed';

export type UserRole = 'admin' | 'employee';

// ==================== INTERFACES ====================

export interface AIActionField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'date' | 'boolean';
  value: any;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  placeholder?: string;
  readonly?: boolean;
}

export interface AIAction {
  id: string;
  type: AIActionType;
  title: string;
  description: string;
  fields: AIActionField[];
  status: AIActionStatus;
  createdAt: Date;
  organizationId: number;
  userId: string;
  userRole: UserRole;
  result?: {
    success: boolean;
    message: string;
    data?: any;
  };
}

export interface ActionPermission {
  action: AIActionType;
  allowedRoles: UserRole[];
  requiresConfirmation: boolean;
  description: string;
}

// ==================== PERMISOS POR ACCIÓN ====================

export const ACTION_PERMISSIONS: ActionPermission[] = [
  // Productos
  { action: 'create_product', allowedRoles: ['admin', 'employee'], requiresConfirmation: true, description: 'Crear nuevo producto' },
  { action: 'update_product', allowedRoles: ['admin', 'employee'], requiresConfirmation: true, description: 'Actualizar producto' },
  { action: 'update_product_stock', allowedRoles: ['admin', 'employee'], requiresConfirmation: true, description: 'Actualizar stock de producto' },
  { action: 'update_product_price', allowedRoles: ['admin'], requiresConfirmation: true, description: 'Cambiar precio de producto' },
  
  // Clientes
  { action: 'create_customer', allowedRoles: ['admin', 'employee'], requiresConfirmation: true, description: 'Crear nuevo cliente' },
  { action: 'update_customer', allowedRoles: ['admin', 'employee'], requiresConfirmation: true, description: 'Actualizar cliente' },
  
  // Pedidos
  { action: 'create_order', allowedRoles: ['admin', 'employee'], requiresConfirmation: true, description: 'Crear pedido/venta' },
  { action: 'update_order_status', allowedRoles: ['admin', 'employee'], requiresConfirmation: true, description: 'Cambiar estado de pedido' },
  
  // Compras
  { action: 'create_purchase_order', allowedRoles: ['admin'], requiresConfirmation: true, description: 'Crear orden de compra' },
  { action: 'update_purchase_order', allowedRoles: ['admin'], requiresConfirmation: true, description: 'Actualizar orden de compra' },
  
  // Inventario
  { action: 'create_stock_adjustment', allowedRoles: ['admin'], requiresConfirmation: true, description: 'Ajuste de inventario' },
  { action: 'create_stock_transfer', allowedRoles: ['admin', 'employee'], requiresConfirmation: true, description: 'Transferencia de stock' },
  
  // Categorías
  { action: 'create_category', allowedRoles: ['admin'], requiresConfirmation: true, description: 'Crear categoría' },
  { action: 'update_category', allowedRoles: ['admin'], requiresConfirmation: true, description: 'Actualizar categoría' },
  
  // Proveedores
  { action: 'create_supplier', allowedRoles: ['admin'], requiresConfirmation: true, description: 'Crear proveedor' },
  { action: 'update_supplier', allowedRoles: ['admin'], requiresConfirmation: true, description: 'Actualizar proveedor' },
];

// ==================== ACCIONES PROHIBIDAS ====================

export const FORBIDDEN_ACTIONS = [
  'delete_profile',
  'delete_member',
  'delete_organization',
  'update_organization_owner',
  'delete_user',
  'change_user_role_to_admin',
  'access_other_organization',
];

// ==================== SERVICIO ====================

class AIActionsService {
  
  // Verificar si el usuario tiene permiso para ejecutar la acción
  canExecuteAction(actionType: AIActionType, userRole: UserRole): { allowed: boolean; reason?: string } {
    const permission = ACTION_PERMISSIONS.find(p => p.action === actionType);
    
    if (!permission) {
      return { allowed: false, reason: 'Acción no reconocida' };
    }
    
    if (!permission.allowedRoles.includes(userRole)) {
      return { 
        allowed: false, 
        reason: `Esta acción requiere rol de ${permission.allowedRoles.join(' o ')}. Tu rol actual es: ${userRole}` 
      };
    }
    
    return { allowed: true };
  }

  // Obtener esquema de campos para una acción
  getActionSchema(actionType: AIActionType): AIActionField[] {
    const schemas: Record<AIActionType, AIActionField[]> = {
      create_product: [
        { name: 'name', label: 'Nombre del producto', type: 'text', value: '', required: true, placeholder: 'Ej: Camiseta Azul XL' },
        { name: 'sku', label: 'SKU/Código', type: 'text', value: '', required: false, placeholder: 'Ej: CAM-AZU-XL' },
        { name: 'description', label: 'Descripción', type: 'textarea', value: '', required: false, placeholder: 'Descripción del producto...' },
        { name: 'price', label: 'Precio de venta', type: 'number', value: 0, required: true, min: 0 },
        { name: 'cost', label: 'Costo', type: 'number', value: 0, required: false, min: 0 },
        { name: 'stock', label: 'Stock inicial', type: 'number', value: 0, required: false, min: 0 },
        { name: 'category_id', label: 'Categoría', type: 'select', value: '', required: false, options: [], placeholder: 'Seleccionar categoría' },
        { name: 'supplier_id', label: 'Proveedor', type: 'select', value: '', required: false, options: [], placeholder: 'Seleccionar proveedor' },
        { name: 'image_url', label: 'Imagen del producto', type: 'text', value: '', required: false, placeholder: 'URL de la imagen o genera con IA' },
        { name: 'is_active', label: 'Activo', type: 'boolean', value: true, required: false },
      ],
      update_product: [
        { name: 'product_id', label: 'ID del producto', type: 'text', value: '', required: true, readonly: true },
        { name: 'name', label: 'Nombre', type: 'text', value: '', required: false },
        { name: 'description', label: 'Descripción', type: 'textarea', value: '', required: false },
        { name: 'price', label: 'Precio', type: 'number', value: 0, required: false, min: 0 },
        { name: 'is_active', label: 'Activo', type: 'boolean', value: true, required: false },
      ],
      update_product_stock: [
        { name: 'product_id', label: 'ID del producto', type: 'text', value: '', required: true, readonly: true },
        { name: 'product_name', label: 'Producto', type: 'text', value: '', required: false, readonly: true },
        { name: 'quantity', label: 'Nueva cantidad', type: 'number', value: 0, required: true, min: 0 },
        { name: 'reason', label: 'Motivo del ajuste', type: 'text', value: '', required: true, placeholder: 'Ej: Conteo físico' },
      ],
      update_product_price: [
        { name: 'product_id', label: 'ID del producto', type: 'text', value: '', required: true, readonly: true },
        { name: 'product_name', label: 'Producto', type: 'text', value: '', required: false, readonly: true },
        { name: 'current_price', label: 'Precio actual', type: 'number', value: 0, required: false, readonly: true },
        { name: 'new_price', label: 'Nuevo precio', type: 'number', value: 0, required: true, min: 0 },
      ],
      create_customer: [
        { name: 'full_name', label: 'Nombre completo', type: 'text', value: '', required: true },
        { name: 'email', label: 'Email', type: 'text', value: '', required: false, placeholder: 'correo@ejemplo.com' },
        { name: 'phone', label: 'Teléfono', type: 'text', value: '', required: false },
        { name: 'doc_type', label: 'Tipo de documento', type: 'select', value: '', required: false, options: [
          { value: 'CC', label: 'Cédula de Ciudadanía' },
          { value: 'NIT', label: 'NIT' },
          { value: 'CE', label: 'Cédula de Extranjería' },
          { value: 'PASSPORT', label: 'Pasaporte' },
        ]},
        { name: 'doc_number', label: 'Número de documento', type: 'text', value: '', required: false },
        { name: 'address', label: 'Dirección', type: 'text', value: '', required: false },
      ],
      update_customer: [
        { name: 'customer_id', label: 'ID del cliente', type: 'text', value: '', required: true, readonly: true },
        { name: 'full_name', label: 'Nombre completo', type: 'text', value: '', required: false },
        { name: 'email', label: 'Email', type: 'text', value: '', required: false },
        { name: 'phone', label: 'Teléfono', type: 'text', value: '', required: false },
        { name: 'address', label: 'Dirección', type: 'text', value: '', required: false },
      ],
      create_order: [
        { name: 'customer_id', label: 'Cliente', type: 'select', value: '', required: true, options: [] },
        { name: 'items', label: 'Productos (JSON)', type: 'textarea', value: '[]', required: true, placeholder: '[{"product_id": "...", "quantity": 1}]' },
        { name: 'notes', label: 'Notas', type: 'textarea', value: '', required: false },
        { name: 'payment_method', label: 'Método de pago', type: 'select', value: 'cash', required: true, options: [
          { value: 'cash', label: 'Efectivo' },
          { value: 'card', label: 'Tarjeta' },
          { value: 'transfer', label: 'Transferencia' },
        ]},
      ],
      update_order_status: [
        { name: 'order_id', label: 'ID del pedido', type: 'text', value: '', required: true, readonly: true },
        { name: 'current_status', label: 'Estado actual', type: 'text', value: '', required: false, readonly: true },
        { name: 'new_status', label: 'Nuevo estado', type: 'select', value: '', required: true, options: [
          { value: 'pending', label: 'Pendiente' },
          { value: 'processing', label: 'En proceso' },
          { value: 'completed', label: 'Completado' },
          { value: 'cancelled', label: 'Cancelado' },
        ]},
      ],
      create_purchase_order: [
        { name: 'supplier_id', label: 'Proveedor', type: 'select', value: '', required: true, options: [] },
        { name: 'items', label: 'Productos (JSON)', type: 'textarea', value: '[]', required: true },
        { name: 'expected_date', label: 'Fecha esperada', type: 'date', value: '', required: false },
        { name: 'notes', label: 'Notas', type: 'textarea', value: '', required: false },
      ],
      update_purchase_order: [
        { name: 'purchase_order_id', label: 'ID de orden', type: 'text', value: '', required: true, readonly: true },
        { name: 'status', label: 'Estado', type: 'select', value: '', required: true, options: [
          { value: 'draft', label: 'Borrador' },
          { value: 'sent', label: 'Enviada' },
          { value: 'received', label: 'Recibida' },
          { value: 'cancelled', label: 'Cancelada' },
        ]},
      ],
      create_stock_adjustment: [
        { name: 'product_id', label: 'Producto', type: 'select', value: '', required: true, options: [] },
        { name: 'adjustment_type', label: 'Tipo', type: 'select', value: 'add', required: true, options: [
          { value: 'add', label: 'Agregar' },
          { value: 'remove', label: 'Quitar' },
          { value: 'set', label: 'Establecer' },
        ]},
        { name: 'quantity', label: 'Cantidad', type: 'number', value: 0, required: true, min: 0 },
        { name: 'reason', label: 'Motivo', type: 'text', value: '', required: true },
      ],
      create_stock_transfer: [
        { name: 'product_id', label: 'Producto', type: 'select', value: '', required: true, options: [] },
        { name: 'from_branch_id', label: 'Sucursal origen', type: 'select', value: '', required: true, options: [] },
        { name: 'to_branch_id', label: 'Sucursal destino', type: 'select', value: '', required: true, options: [] },
        { name: 'quantity', label: 'Cantidad', type: 'number', value: 0, required: true, min: 1 },
      ],
      create_category: [
        { name: 'name', label: 'Nombre', type: 'text', value: '', required: true },
        { name: 'description', label: 'Descripción', type: 'textarea', value: '', required: false },
        { name: 'parent_id', label: 'Categoría padre', type: 'select', value: '', required: false, options: [] },
      ],
      update_category: [
        { name: 'category_id', label: 'ID de categoría', type: 'text', value: '', required: true, readonly: true },
        { name: 'name', label: 'Nombre', type: 'text', value: '', required: false },
        { name: 'description', label: 'Descripción', type: 'textarea', value: '', required: false },
      ],
      create_supplier: [
        { name: 'name', label: 'Nombre', type: 'text', value: '', required: true },
        { name: 'contact_name', label: 'Contacto', type: 'text', value: '', required: false },
        { name: 'email', label: 'Email', type: 'text', value: '', required: false },
        { name: 'phone', label: 'Teléfono', type: 'text', value: '', required: false },
        { name: 'address', label: 'Dirección', type: 'text', value: '', required: false },
      ],
      update_supplier: [
        { name: 'supplier_id', label: 'ID del proveedor', type: 'text', value: '', required: true, readonly: true },
        { name: 'name', label: 'Nombre', type: 'text', value: '', required: false },
        { name: 'contact_name', label: 'Contacto', type: 'text', value: '', required: false },
        { name: 'email', label: 'Email', type: 'text', value: '', required: false },
        { name: 'phone', label: 'Teléfono', type: 'text', value: '', required: false },
      ],
    };
    
    return schemas[actionType] || [];
  }

  // Cargar opciones dinámicas para campos select (categorías, proveedores, etc.)
  async loadDynamicOptions(organizationId: number): Promise<{
    categories: Array<{ value: string; label: string }>;
    suppliers: Array<{ value: string; label: string }>;
    customers: Array<{ value: string; label: string }>;
  }> {
    const [categoriesRes, suppliersRes, customersRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name'),
      supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name'),
      supabase
        .from('customers')
        .select('id, full_name')
        .eq('organization_id', organizationId)
        .order('full_name')
        .limit(100),
    ]);

    return {
      categories: (categoriesRes.data || []).map(c => ({ value: String(c.id), label: c.name })),
      suppliers: (suppliersRes.data || []).map(s => ({ value: String(s.id), label: s.name })),
      customers: (customersRes.data || []).map(c => ({ value: String(c.id), label: c.full_name })),
    };
  }

  // Ejecutar una acción confirmada
  async executeAction(action: AIAction): Promise<{ success: boolean; message: string; data?: any }> {
    const { type, fields, organizationId, userRole } = action;
    
    // Verificar permisos
    const permission = this.canExecuteAction(type, userRole);
    if (!permission.allowed) {
      return { success: false, message: permission.reason || 'Sin permisos' };
    }
    
    // Convertir fields a objeto
    const data: Record<string, any> = {};
    fields.forEach(field => {
      if (field.value !== undefined && field.value !== '') {
        data[field.name] = field.value;
      }
    });
    
    try {
      switch (type) {
        case 'create_product':
          return await this.createProduct(data, organizationId);
        case 'update_product':
          return await this.updateProduct(data, organizationId);
        case 'update_product_stock':
          return await this.updateProductStock(data, organizationId);
        case 'update_product_price':
          return await this.updateProductPrice(data, organizationId);
        case 'create_customer':
          return await this.createCustomer(data, organizationId);
        case 'update_customer':
          return await this.updateCustomer(data, organizationId);
        case 'create_order':
          return await this.createOrder(data, organizationId);
        case 'update_order_status':
          return await this.updateOrderStatus(data, organizationId);
        case 'create_category':
          return await this.createCategory(data, organizationId);
        case 'create_supplier':
          return await this.createSupplier(data, organizationId);
        default:
          return { success: false, message: `Acción ${type} no implementada aún` };
      }
    } catch (error: any) {
      console.error('Error ejecutando acción:', error);
      return { success: false, message: error.message || 'Error desconocido' };
    }
  }

  // ==================== IMPLEMENTACIONES DE ACCIONES ====================

  private async createProduct(data: Record<string, any>, organizationId: number) {
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        organization_id: organizationId,
        name: data.name,
        sku: data.sku || null,
        description: data.description || null,
        price: data.price || 0,
        cost: data.cost || 0,
        category_id: data.category_id || null,
        is_active: data.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    // Si hay stock inicial, crear registro en inventory
    if (data.stock && data.stock > 0) {
      await supabase.from('inventory').insert({
        organization_id: organizationId,
        product_id: product.id,
        quantity: data.stock,
      });
    }

    return { success: true, message: `Producto "${data.name}" creado exitosamente`, data: product };
  }

  private async updateProduct(data: Record<string, any>, organizationId: number) {
    const updateData: Record<string, any> = {};
    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;

    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', data.product_id)
      .eq('organization_id', organizationId);

    if (error) throw new Error(error.message);
    return { success: true, message: 'Producto actualizado exitosamente' };
  }

  private async updateProductStock(data: Record<string, any>, organizationId: number) {
    const { error } = await supabase
      .from('inventory')
      .upsert({
        organization_id: organizationId,
        product_id: data.product_id,
        quantity: data.quantity,
      }, { onConflict: 'organization_id,product_id' });

    if (error) throw new Error(error.message);
    return { success: true, message: `Stock actualizado a ${data.quantity} unidades` };
  }

  private async updateProductPrice(data: Record<string, any>, organizationId: number) {
    const { error } = await supabase
      .from('products')
      .update({ price: data.new_price })
      .eq('id', data.product_id)
      .eq('organization_id', organizationId);

    if (error) throw new Error(error.message);
    return { success: true, message: `Precio actualizado a $${data.new_price}` };
  }

  private async createCustomer(data: Record<string, any>, organizationId: number) {
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        organization_id: organizationId,
        first_name: data.full_name?.split(' ')[0] || '',
        last_name: data.full_name?.split(' ').slice(1).join(' ') || '',
        email: data.email || null,
        phone: data.phone || null,
        identification_type: data.doc_type || null,
        identification_number: data.doc_number || null,
        address: data.address || null,
        roles: ['cliente', 'huesped'],
        fiscal_responsibilities: ['R-99-PN'],
        fiscal_municipality_id: 'aa4b6637-0060-41bb-9459-bc95f9789e08',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { success: true, message: `Cliente "${data.full_name}" creado exitosamente`, data: customer };
  }

  private async updateCustomer(data: Record<string, any>, organizationId: number) {
    const updateData: Record<string, any> = {};
    if (data.full_name) updateData.full_name = data.full_name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;

    const { error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', data.customer_id)
      .eq('organization_id', organizationId);

    if (error) throw new Error(error.message);
    return { success: true, message: 'Cliente actualizado exitosamente' };
  }

  private async createOrder(data: Record<string, any>, organizationId: number) {
    // Parsear items si viene como string
    let items = data.items;
    if (typeof items === 'string') {
      items = JSON.parse(items);
    }

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        organization_id: organizationId,
        customer_id: data.customer_id || null,
        status: 'pending',
        notes: data.notes || null,
        payment_method: data.payment_method || 'cash',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Insertar items del pedido
    if (items && items.length > 0) {
      const orderItems = items.map((item: any) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity || 1,
        price: item.price || 0,
      }));
      
      await supabase.from('order_items').insert(orderItems);
    }

    return { success: true, message: `Pedido #${order.id} creado exitosamente`, data: order };
  }

  private async updateOrderStatus(data: Record<string, any>, organizationId: number) {
    const { error } = await supabase
      .from('orders')
      .update({ status: data.new_status })
      .eq('id', data.order_id)
      .eq('organization_id', organizationId);

    if (error) throw new Error(error.message);
    return { success: true, message: `Estado del pedido actualizado a "${data.new_status}"` };
  }

  private async createCategory(data: Record<string, any>, organizationId: number) {
    const { data: category, error } = await supabase
      .from('categories')
      .insert({
        organization_id: organizationId,
        name: data.name,
        description: data.description || null,
        parent_id: data.parent_id || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { success: true, message: `Categoría "${data.name}" creada exitosamente`, data: category };
  }

  private async createSupplier(data: Record<string, any>, organizationId: number) {
    const { data: supplier, error } = await supabase
      .from('suppliers')
      .insert({
        organization_id: organizationId,
        name: data.name,
        contact_name: data.contact_name || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { success: true, message: `Proveedor "${data.name}" creado exitosamente`, data: supplier };
  }

  // Obtener descripción amigable de la acción
  getActionDescription(type: AIActionType): string {
    const descriptions: Record<AIActionType, string> = {
      create_product: 'Crear nuevo producto',
      update_product: 'Actualizar producto',
      update_product_stock: 'Actualizar stock',
      update_product_price: 'Cambiar precio',
      create_customer: 'Crear cliente',
      update_customer: 'Actualizar cliente',
      create_order: 'Crear pedido',
      update_order_status: 'Cambiar estado de pedido',
      create_purchase_order: 'Crear orden de compra',
      update_purchase_order: 'Actualizar orden de compra',
      create_stock_adjustment: 'Ajuste de inventario',
      create_stock_transfer: 'Transferencia de stock',
      create_category: 'Crear categoría',
      update_category: 'Actualizar categoría',
      create_supplier: 'Crear proveedor',
      update_supplier: 'Actualizar proveedor',
    };
    return descriptions[type] || type;
  }
}

export const aiActionsService = new AIActionsService();
export default AIActionsService;
