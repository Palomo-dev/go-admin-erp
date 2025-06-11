import { supabase } from '@/lib/supabase/config';
import { Producto, MovimientoInventario, Proveedor } from '@/types/products';

// Servicio para trabajar con los productos y tablas relacionadas
export const ProductosService = {
  // Crear un nuevo producto en la base de datos
  async createProducto(producto: Producto): Promise<{data: Producto | null, error: any}> {
    try {
      // Insertar producto principal
      const { data, error } = await supabase
        .from('products')
        .insert([
          {
            name: producto.nombre,
            sku: producto.sku,
            category_id: producto.categoria,
            precio: producto.precio,
            cost: producto.precios?.mayorista ?? 0,
            track_stock: true,
            image_url: producto.imagenUrl ?? '',
            unit_code: producto.unidad ?? '',
            description: producto.descripcion ?? '',
            supplier_id: producto.proveedorId ?? null,
            // Otros campos según estructura de la tabla
          },
        ])
        .select()
        .single();
      if (error) {
        return { data: null, error };
      }
      const productId = data.id;
      // Lotes
      if (producto.lotes && producto.lotes.length > 0) {
        const lotesToInsert = producto.lotes.map(lote => ({
          product_id: productId,
          lot_code: lote.numeroLote,
          expiry_date: lote.fechaVencimiento,
          cantidad: lote.cantidad,
          observaciones: lote.observaciones ?? '',
        }));
        await supabase.from('lots').insert(lotesToInsert);
      }
      // Números de serie
      if (producto.numerosSerie && producto.numerosSerie.length > 0) {
        const serialesToInsert = producto.numerosSerie.map(serial => ({
          product_id: productId,
          serial: serial.numeroSerie,
          status: serial.vendido ? 'sold' : 'available',
          observaciones: serial.observaciones ?? '',
        }));
        await supabase.from('serial_numbers').insert(serialesToInsert);
      }
      // Etiquetas (si hay tabla relacional)
      // TODO: Implementar si corresponde
      return { data: { ...producto, id: productId }, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  },

  // Actualizar un producto existente en la base de datos
  async updateProducto(id: string, producto: Producto): Promise<{data: Producto | null, error: any}> {
    try {
      // Actualizar producto principal
      const { data, error } = await supabase
        .from('products')
        .update({
          name: producto.nombre,
          sku: producto.sku,
          category_id: producto.categoria,
          precio: producto.precio, // Asegúrate que la columna 'precio' existe en la tabla 'products'
          cost: producto.precios?.mayorista ?? 0,
          track_stock: true,
          image_url: producto.imagenUrl ?? '',
          unit_code: producto.unidad ?? '',
          description: producto.descripcion ?? '',
          supplier_id: producto.proveedorId ?? null,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) {
        return { data: null, error };
      }
      // Lotes: eliminar y volver a insertar (simplificación)
      if (producto.lotes) {
        await supabase.from('lots').delete().eq('product_id', id);
        if (producto.lotes.length > 0) {
          const lotesToInsert = producto.lotes.map(lote => ({
            product_id: id,
            lot_code: lote.numeroLote,
            expiry_date: lote.fechaVencimiento,
            cantidad: lote.cantidad,
            observaciones: lote.observaciones ?? '',
          }));
          await supabase.from('lots').insert(lotesToInsert);
        }
      }
      // Números de serie: eliminar y volver a insertar (simplificación)
      if (producto.numerosSerie) {
        await supabase.from('serial_numbers').delete().eq('product_id', id);
        if (producto.numerosSerie.length > 0) {
          const serialesToInsert = producto.numerosSerie.map(serial => ({
            product_id: id,
            serial: serial.numeroSerie,
            status: serial.vendido ? 'sold' : 'available',
            observaciones: serial.observaciones ?? '',
          }));
          await supabase.from('serial_numbers').insert(serialesToInsert);
        }
      }
      // Etiquetas (si hay tabla relacional)
      // TODO: Implementar si corresponde
      return { data: { ...producto, id }, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  },

  // Obtener todos los productos con datos relacionados
  async getAllProductos(): Promise<{data: Producto[] | null, error: any}> {
    console.log('%cObteniendo todos los productos...', 'background:#34495e;color:white;padding:4px');
    try {
      // Intentar primero la consulta con joins para obtener datos relacionados
      console.log('%cIntentando consulta con relaciones...', 'color:#3498db');
      let data;
      let error;
      
      try {
        // Intentar con relaciones primero
        const result = await supabase
          .from('products')
          .select(`
            id,
            organization_id,
            sku, 
            name,
            category_id,
            categories(id, name, slug),
            description,
            unit_code,
            units(code, name, conversion_factor),
            track_stock, 
            cost, 
            price,
            image_url,
            is_menu_item
          `);
          
        data = result.data;
        error = result.error;
        
        if (error) {
          console.warn('%cError en consulta con joins, intentando consulta simple...', 'color:#f39c12');
          throw error; // Forzar el catch para hacer la consulta simple
        }
      } catch (joinError) {
        // Si falla, hacer consulta simple sin joins
        const simpleResult = await supabase.from('products').select('*');
        data = simpleResult.data;
        error = simpleResult.error;
      }
      
      console.log('%cResultados de consulta:', 'background:#2980b9;color:white;padding:4px', 
                 error ? error : (data && data.length > 0 ? `${data.length} productos encontrados` : 'No hay productos'));

      if (error) {
        console.error('%cError al consultar productos:', 'background:#e74c3c;color:white;padding:4px', error);
        return { data: null, error };
      }
      
      // Mostrar los primeros 3 productos para depurar
      if (data && data.length > 0) {
        console.log('%cMuestra de productos:', 'color:#2ecc71', data.slice(0, 3));
      } else {
        console.warn('%cNo se encontraron productos en la base de datos', 'background:#f39c12;color:white;padding:4px');
        return { data: [], error: null };
      }
      
      // Transformar los datos al formato esperado por la interfaz Producto con manejo inteligente
      const productos: Producto[] = data.map(item => {
        // Verificar si tenemos datos de categoría de una relación
        let nombreCategoria = 'General';
        if (item.categories) {
          if (Array.isArray(item.categories) && item.categories.length > 0) {
            nombreCategoria = item.categories[0].name || 'General';
          } else if (typeof item.categories === 'object' && item.categories !== null) {
            nombreCategoria = item.categories.name || 'General';
          }
        }
        
        // Verificar si tenemos datos de unidad de una relación
        let nombreUnidad = 'Unidad';
        if (item.units) {
          if (Array.isArray(item.units) && item.units.length > 0) {
            nombreUnidad = item.units[0].name || 'Unidad';
          } else if (typeof item.units === 'object' && item.units !== null) {
            nombreUnidad = item.units.name || 'Unidad';
          }
        }
        
        // Mapear el producto a la interfaz Producto
        return {
          id: item.id,
          nombre: item.name || 'Sin nombre',
          sku: item.sku || 'N/A',
          categoria: nombreCategoria,
          precio: item.price || 0,
          precios: {
            mayorista: item.cost || 0,
            minorista: item.price || 0,
          },
          stock: 0, // Valor predeterminado, se llenará después con datos reales si están disponibles
          estado: item.track_stock === true ? 'activo' : 'inactivo',
          descripcion: item.description || '',
          unidad: nombreUnidad,
          imagenUrl: item.image_url || '',
          tieneVariantes: false,
          variantes: [],
          etiquetas: [],
          lotes: [],
          seriales: [],
          proveedorId: undefined,
        };
      });
      
      console.log('%cProductos mapeados:', 'background:#2ecc71;color:white;padding:4px', 
                  `${productos.length} productos transformados correctamente`);
      
      if (productos.length > 0) {
        console.log('%cEjemplo de producto transformado:', 'color:#3498db', productos[0]);
      } else {
        console.warn('%cNo hay productos para mostrar en el catálogo', 'color:#e74c3c');
      }
      
      return { data: productos, error: null };
    } catch (error) {
      console.error('%cError inesperado:', 'background:#e74c3c;color:white;padding:4px', error);
      return { data: null, error };
    }
  },
  
  // Obtener un producto específico por ID con detalles adicionales
  async getProductoById(id: string): Promise<{data: Producto | null, error: any}> {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        organization_id,
        sku, 
        name,
        category_id,
        categories(id, name, slug),
        description,
        unit_code,
        units(code, name, conversion_factor),
        track_stock, 
        cost, 
        precio,
        image_url,
        is_menu_item
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      console.error(`Error al obtener el producto con ID ${id}:`, error);
      return { data: null, error };
    }
    
    if (!data) {
      return { data: null, error: { message: 'Producto no encontrado' } };
    }
    
    // Obtener niveles de stock para este producto
    const { data: stockData } = await supabase
      .from('stock_levels')
      .select('branch_id, qty_on_hand, qty_reserved, avg_cost')
      .eq('product_id', id);
    
    // Calcular stock total
    const totalStock = stockData?.reduce((acc, item) => acc + (item.qty_on_hand - item.qty_reserved), 0) || 0;
    
    // Obtener lotes asociados al producto
    const { data: lotes } = await supabase
      .from('lots')
      .select(`
        id, 
        lot_code, 
        expiry_date,
        supplier_id
      `)
      .eq('product_id', id);
    
    // Transformar lotes al formato esperado
    const lotesFormateados = lotes?.map(lote => ({
      id: lote.id,
      numeroLote: lote.lot_code,
      cantidad: 0, // Se debe obtener de stock_levels para este lote
      fechaVencimiento: lote.expiry_date,
      observaciones: ''
    })) || [];
    
    // Obtener números de serie si existen
    const { data: seriales } = await supabase
      .from('serial_numbers')
      .select('id, serial, status, sale_id')
      .eq('product_id', id);
    
    // Transformar seriales al formato esperado
    const serialesFormateados = seriales?.map(serial => ({
      id: serial.id,
      numeroSerie: serial.serial,
      observaciones: '',
      vendido: serial.status === 'sold',
      fechaVenta: serial.sale_id ? new Date().toISOString() : undefined, // Se debería obtener de la tabla de ventas
    })) || [];

    // Obtener los movimientos de stock (kardex)
    const { data: movimientos } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', id)
      .order('id', { ascending: false });
    
    // Crear el objeto producto con todos los datos
    const producto: Producto = {
      id: data.id,
      nombre: data.name,
      sku: data.sku,
      categoria: data.categories && Array.isArray(data.categories) && data.categories.length > 0 ? data.categories[0].name : '',
      precio: data.precio || 0,
      precios: {
        mayorista: data.cost || 0,
        minorista: data.precio || 0,
      },
      tieneVariantes: false,
      stock: totalStock,
      estado: data.track_stock ? 'activo' : 'inactivo',
      descripcion: data.description || '',
      unidad: data.units && Array.isArray(data.units) && data.units.length > 0 ? data.units[0].name : '',
      imagenUrl: data.image_url || '',
      ubicacion: '',
      lotes: lotesFormateados,
      numerosSerie: serialesFormateados,
      etiquetas: [],
      variantes: []
    };
    
    return { data: producto, error: null };
  },
  
  // Obtener niveles de stock por sucursal para un producto
  async getStockPorSucursal(productoId: string): Promise<{data: any[] | null, error: any}> {
    const { data, error } = await supabase
      .from('stock_levels')
      .select(`
        product_id,
        branch_id,
        branches(id, name),
        qty_on_hand,
        qty_reserved,
        avg_cost
      `)
      .eq('product_id', productoId);
    
    if (error) {
      console.error('Error al obtener stock por sucursal:', error);
      return { data: null, error };
    }
    
    // Transformar los datos al formato esperado
    const stockSucursales = data.map(item => ({
      sucursalId: item.branch_id,
      nombreSucursal: item.branches?.name || 'Desconocida',
      unidades: item.qty_on_hand - item.qty_reserved,
      costoPromedio: item.avg_cost
    }));
    
    return { data: stockSucursales, error: null };
  },
  
  // Obtener movimientos de inventario (kardex) para un producto
  async getMovimientosInventario(productoId: string): Promise<{data: MovimientoInventario[] | null, error: any}> {
    const { data, error } = await supabase
      .from('stock_movements')
      .select(`
        id,
        organization_id,
        branch_id,
        branches(name),
        product_id,
        lot_id,
        direction,
        qty,
        unit_cost,
        source,
        source_id,
        note,
        created_at
      `)
      .eq('product_id', productoId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error al obtener movimientos de inventario:', error);
      return { data: null, error };
    }
    
    // Obtener datos del producto para tener nombre y SKU
    const { data: producto } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('id', productoId)
      .single();
    
    // Transformar los movimientos al formato esperado por la UI
    const movimientosFormateados: MovimientoInventario[] = data.map(item => {
      // Mapear direction a TipoMovimientoInventario
      let tipoMovimiento;
      
      if (item.direction === 'in') tipoMovimiento = 'entrada';
      else if (item.direction === 'out') tipoMovimiento = 'salida';
      else if (item.direction === 'transfer') tipoMovimiento = 'traslado';
      else if (item.direction === 'adjustment') tipoMovimiento = 'ajuste';
      else if (item.direction === 'waste') tipoMovimiento = 'merma';
      else tipoMovimiento = 'inventario';
      
      return {
        id: item.id,
        fecha: new Date(item.created_at),
        productoId: item.product_id,
        productoNombre: producto?.name || 'Desconocido',
        productoSku: producto?.sku || 'N/A',
        tipoMovimiento: tipoMovimiento,
        cantidad: item.qty,
        stockPrevio: 0, // Estos valores tendrían que calcularse
        stockResultante: 0, // usando movimientos previos o asociarse en el backend
        precioUnitario: item.unit_cost,
        motivo: item.note || 'Sin detalle',
        documentoReferencia: item.source_id || '',
        responsable: 'Sistema', // Debería obtenerse del usuario que realizó el movimiento
        ubicacion: item.branches?.name || '',
      };
    });
    
    return { data: movimientosFormateados, error: null };
  },
  
  // Registrar un movimiento de inventario
  async registrarMovimientoInventario(
    movimiento: Omit<MovimientoInventario, 'id'>, 
    productoId: string, 
    branchId: string
  ): Promise<{data: any, error: any}> {
    // Mapear tipo de movimiento a la dirección esperada por la tabla
    let direction;
    
    switch (movimiento.tipoMovimiento) {
      case 'entrada':
        direction = 'in';
        break;
      case 'salida':
        direction = 'out';
        break;
      case 'traslado':
        direction = 'transfer';
        break;
      case 'ajuste':
        direction = 'adjustment';
        break;
      case 'merma':
        direction = 'waste';
        break;
      case 'inventario':
        direction = 'inventory';
        break;
      default:
        direction = 'adjustment';
    }
    
    // Registrar el movimiento en la tabla
    const { data, error } = await supabase
      .from('stock_movements')
      .insert({
        organization_id: '1', // Debería obtenerse del contexto de la aplicación
        branch_id: branchId,
        product_id: productoId,
        direction: direction,
        qty: movimiento.cantidad,
        unit_cost: movimiento.precioUnitario || 0,
        source: 'manual', // O podría ser 'purchase', 'sale', etc.
        source_id: movimiento.documentoReferencia,
        note: movimiento.motivo
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error al registrar movimiento:', error);
      return { data: null, error };
    }
    
    // Actualizar el stock_levels en función del movimiento
    // Esto depende de la lógica de negocio específica
    
    return { data, error: null };
  },
  
  // Obtener categorías
  async getCategorias(): Promise<{data: any[] | null, error: any}> {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug, parent_id');
    
    if (error) {
      console.error('Error al obtener categorías:', error);
      return { data: null, error };
    }
    
    return { data, error: null };
  },
  
  // Obtener unidades de medida
  async getUnidades(): Promise<{data: any[] | null, error: any}> {
    const { data, error } = await supabase
      .from('units')
      .select('code, name, conversion_factor');
    
    if (error) {
      console.error('Error al obtener unidades:', error);
      return { data: null, error };
    }
    
    return { data, error: null };
  },
  
  // Obtener proveedores para el formulario de producto
  async getProveedores(): Promise<{data: Proveedor[] | null, error: any}> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, nit, contact, phone, email, notes');
    
    if (error) {
      console.error('Error al obtener proveedores:', error);
      return { data: null, error };
    }
    
    // Transformar los datos al formato esperado por la interfaz Proveedor
    const proveedores: Proveedor[] = data.map(item => ({
      id: item.id,
      nombre: item.name,
      contacto: item.contact || '',
      telefono: item.phone || '',
      email: item.email || '',
      notas: item.notes || '',
      direccion: '' // Este campo no está en la tabla suppliers
    }));
    
    return { data: proveedores, error: null };
  },
  
  // Obtener sucursales
  async getSucursales(): Promise<{data: any[] | null, error: any}> {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, organization_id');
    
    if (error) {
      console.error('Error al obtener sucursales:', error);
      return { data: null, error };
    }
    
    return { data, error: null };
  }
};

export default ProductosService;
