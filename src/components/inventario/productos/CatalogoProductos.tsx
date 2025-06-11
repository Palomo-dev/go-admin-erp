"use client";

import React, { useState, useEffect } from 'react';
// Importamos los tipos centralizados
import { Producto, FiltrosProducto, MovimientoInventario, TipoMovimientoInventario, Proveedor } from '@/types/products';
import ProductosService from '@/lib/services/productos.service';
import ProductosPageHeader from '@/components/inventario/productos/ProductosPageHeader';
import FiltrosProductos from '@/components/inventario/productos/FiltrosProductos';
import ProductosTable from '@/components/inventario/productos/ProductosTable';
import FormularioProducto from '@/components/inventario/productos/FormularioProducto';
import DetalleProducto from '@/components/inventario/productos/DetalleProducto';
import ImportarProductos from '@/components/inventario/productos/ImportarProductos';
import Proveedores from './Proveedores';
import OrdenesCompra from './OrdenesCompra';

/**
 * Componente principal para el catálogo maestro de productos
 * 
 * Este componente orquesta la visualización y gestión de productos,
 * incluyendo listado, filtrado, creación, edición y visualización de detalles.
 */
const CatalogoProductos: React.FC = () => {
  // Estados para gestionar la interfaz y los datos
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isViewing, setIsViewing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null);
  const [filters, setFilters] = useState<FiltrosProducto>({
    categoria: '',
    estado: 'todos',
    busqueda: ''
  });
  
  // Estado para los movimientos de inventario (Kardex)
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);

  // Estado para proveedores (levantado para compartir entre componentes)
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);


  // Productos cargados desde la base de datos
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loadingProductos, setLoadingProductos] = useState<boolean>(true);
  const [errorProductos, setErrorProductos] = useState<string | null>(null);

  // Función definida fuera del useEffect para poder usarla en otros lugares del componente
  const fetchProductos = async () => {
    console.log('%cIniciando carga de productos...', 'background:#3498db;color:white;padding:4px;border-radius:4px');
    setLoadingProductos(true);
    setErrorProductos(null);
    try {
      console.log('%cLlamando a ProductosService.getAllProductos()', 'background:#2ecc71;color:white;padding:4px');
      const { data, error } = await ProductosService.getAllProductos();
      
      if (error) {
        console.error('%cError recibido del servicio:', 'background:#e74c3c;color:white;padding:4px', error);
        setErrorProductos(`Error al cargar productos: ${error.message || 'Error desconocido'}`);
      } else {
        if (data && data.length > 0) {
          console.log(`%cProductos recibidos: ${data.length}`, 'background:#2ecc71;color:white;padding:4px');
          console.table(data.map(p => ({ 
            id: p.id,
            nombre: p.nombre,
            sku: p.sku,
            precio: p.precio,
            stock: p.stock,
            estado: p.estado
          })));
        } else {
          console.warn('%cNo se recibieron productos del servicio', 'background:#f39c12;color:white;padding:4px');
        }
        setProductos(data || []);
      }
    } catch (err) {
      console.error('%cExcepción al cargar productos:', 'background:#e74c3c;color:white;padding:4px', err);
      setErrorProductos(`Error inesperado al cargar productos: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingProductos(false);
    }
  };

  useEffect(() => {
    fetchProductos();
  }, []);

  // Manejadores de eventos
  const handleCreateNew = () => {
    setIsCreating(true);
    setIsEditing(false);
    setIsViewing(false);
    setIsImporting(false);
    setSelectedProduct(null);
  };

  const handleImport = () => {
    setIsImporting(true);
    setIsCreating(false);
    setIsEditing(false);
    setIsViewing(false);
    setSelectedProduct(null);
  };

  const handleEdit = (product: Producto) => {
    setSelectedProduct(product);
    setIsEditing(true);
    setIsCreating(false);
    setIsViewing(false);
    setIsImporting(false);
  };

  const handleView = (product: Producto) => {
    setSelectedProduct(product);
    setIsViewing(true);
    setIsEditing(false);
    setIsCreating(false);
    setIsImporting(false);
  };

  const handleSave = (productData: Producto) => {
    let savedProduct: Producto;

    if (isCreating) {
      // En producción: guardar en Supabase
      const newProduct = {
        ...productData,
        id: Date.now().toString(), // En producción: ID generado por Supabase
      };
      setProductos([...productos, newProduct]);
      savedProduct = newProduct;

      // Registrar automáticamente un movimiento de entrada inicial
      const nuevoMovimiento: Omit<MovimientoInventario, 'id'> = {
        fecha: new Date(),
        productoId: savedProduct.id,
        productoNombre: savedProduct.nombre,
        productoSku: savedProduct.sku,
        tipoMovimiento: TipoMovimientoInventario.ENTRADA,
        cantidad: savedProduct.stock,
        stockPrevio: 0,
        stockResultante: savedProduct.stock,
        motivo: 'Creación inicial de producto',
        responsable: 'Admin', // Idealmente vendría del contexto de usuario
        documentoReferencia: 'NUEVO-PROD'
      };

      // Guardar el movimiento (en producción: guardar en Supabase)
      handleRegistrarMovimiento(nuevoMovimiento);

    } else if (isEditing && selectedProduct) {
      // En producción: actualizar en Supabase
      const updatedProduct = { ...selectedProduct, ...productData };
      const updatedProducts = productos.map((p) => 
        p.id === selectedProduct.id ? updatedProduct : p
      );
      setProductos(updatedProducts);
      savedProduct = updatedProduct;

      // Si el stock cambió, registrar un movimiento de ajuste
      if (updatedProduct.stock !== selectedProduct.stock) {
        const diferencia = updatedProduct.stock - selectedProduct.stock;
        const nuevoMovimiento: Omit<MovimientoInventario, 'id'> = {
          fecha: new Date(),
          productoId: updatedProduct.id,
          productoNombre: updatedProduct.nombre,
          productoSku: updatedProduct.sku,
          tipoMovimiento: TipoMovimientoInventario.AJUSTE,
          cantidad: diferencia,
          stockPrevio: selectedProduct.stock,
          stockResultante: updatedProduct.stock,
          motivo: 'Ajuste por edición de producto',
          responsable: 'Admin', // Idealmente vendría del contexto de usuario
          documentoReferencia: 'EDIT-' + updatedProduct.id
        };

        // Guardar el movimiento (en producción: guardar en Supabase)
        handleRegistrarMovimiento(nuevoMovimiento);
      }
    } else {
      // Caso no esperado, pero necesario para TypeScript
      return;
    }
    
    // Limpiar estados de edición y creación
    setIsCreating(false);
    setIsEditing(false);
    
    // Establecer el producto guardado como seleccionado y mostrar su vista de detalle
    setSelectedProduct(savedProduct);
    setIsViewing(true);
  };

  const handleDelete = (productId: string) => {
    const producto = productos.find(p => p.id === productId);
    if (producto) {
      // Registrar movimiento de eliminación de inventario
      const nuevoMovimiento: Omit<MovimientoInventario, 'id'> = {
        fecha: new Date(),
        productoId: producto.id,
        productoNombre: producto.nombre,
        productoSku: producto.sku,
        tipoMovimiento: TipoMovimientoInventario.AJUSTE,
        cantidad: -producto.stock,
        stockPrevio: producto.stock,
        stockResultante: 0,
        motivo: 'Producto eliminado del catálogo',
        responsable: 'Admin', // Idealmente vendría del contexto de usuario
        documentoReferencia: 'DEL-' + producto.id
      };
      handleRegistrarMovimiento(nuevoMovimiento);
    }
    
    // En producción: eliminar de Supabase
    setProductos(productos.filter((p) => p.id !== productId));
  };

  const handleCancel = () => {
    setIsCreating(false);
    setIsEditing(false);
    setIsViewing(false);
    setIsImporting(false);
    setSelectedProduct(null);
  };

  // Función para registrar un movimiento de inventario
  const handleRegistrarMovimiento = (movimientoDatos: Omit<MovimientoInventario, 'id'>) => {
    // En producción: guardar en Supabase
    const nuevoMovimiento: MovimientoInventario = {
      ...movimientoDatos,
      id: Date.now().toString(), // En producción: ID generado por Supabase
    };
    
    setMovimientos([...movimientos, nuevoMovimiento]);
    
    // Actualizar el stock del producto afectado
    if (movimientoDatos.productoId) {
      const productoActualizado = productos.find(p => p.id === movimientoDatos.productoId);
      if (productoActualizado) {
        // Actualizar el stock según el movimiento
        const stockActualizado = movimientoDatos.stockResultante;
        
        // Actualizar el producto en el estado
        setProductos(productos.map(p => 
          p.id === movimientoDatos.productoId 
            ? {...p, stock: stockActualizado}
            : p
        ));
        
        // Si se está viendo el producto afectado, actualizar también el selectedProduct
        if (selectedProduct && selectedProduct.id === movimientoDatos.productoId) {
          setSelectedProduct({...selectedProduct, stock: stockActualizado});
        }
      }
    }
  };

  // Función para manejar los datos importados
  const handleImportComplete = (productosImportados: Producto[]) => {
    // Asignar IDs únicos a los productos importados
    const nuevosProductos = productosImportados.map((producto, index) => ({
      ...producto,
      id: `imported-${Date.now()}-${index}`, // En producción: ID generado por Supabase
    }));

    // Agregar los productos importados a la lista existente
    setProductos([...productos, ...nuevosProductos]);
    
    // Cerrar la vista de importación
    setIsImporting(false);
  };

  const filteredProducts = productos.filter(product => {
    const matchesCategoria = !filters.categoria || product.categoria === filters.categoria;
    const matchesEstado = filters.estado === 'todos' || product.estado === filters.estado;
    const matchesBusqueda = !filters.busqueda || 
      product.nombre.toLowerCase().includes(filters.busqueda.toLowerCase()) ||
      product.sku.toLowerCase().includes(filters.busqueda.toLowerCase());
    
    return matchesCategoria && matchesEstado && matchesBusqueda;
  });

  // Renderizado condicional según el estado
  if (isImporting) {
    return (
      <div className="space-y-6">
        <ProductosPageHeader 
          title="Importar Productos" 
          onBack={handleCancel}
        />
        <ImportarProductos 
          onImportComplete={handleImportComplete}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  if (isCreating || isEditing) {
    return (
      <div className="space-y-6">
        <ProductosPageHeader 
          title={isCreating ? "Nuevo Producto" : "Editar Producto"} 
          onBack={handleCancel}
        />
        <FormularioProducto 
          initialData={isEditing && selectedProduct ? selectedProduct : undefined}
          onSave={handleSave}
          onCancel={handleCancel}
          proveedores={proveedores}
        />
      </div>
    );
  }

  if (isViewing && selectedProduct) {
    return (
      <div className="space-y-6">
        <ProductosPageHeader 
          title="Detalle del Producto" 
          onBack={handleCancel}
          showActions 
          onEdit={() => handleEdit(selectedProduct)}
        />
        <DetalleProducto 
          product={selectedProduct}
          onEdit={() => handleEdit(selectedProduct)}
          movimientos={movimientos.filter(m => m.productoId === selectedProduct.id)}
          onRegistrarMovimiento={handleRegistrarMovimiento}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProductosPageHeader 
        title="Catálogo de Productos" 
        showActions
        onCreateNew={handleCreateNew}
        onImport={handleImport}
      />
      <FiltrosProductos 
        filters={filters}
        onFilterChange={setFilters}
      />
      
      {loadingProductos ? (
        <div className="p-4 text-center">
          <p>Cargando productos...</p>
        </div>
      ) : errorProductos ? (
        <div className="p-4 bg-red-50 text-red-800 border border-red-200 rounded">
          <p className="font-semibold">Error:</p> 
          <p>{errorProductos}</p>
          <button 
            onClick={() => fetchProductos()} 
            className="mt-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-600">
              {filteredProducts.length > 0 
                ? `Mostrando ${filteredProducts.length} producto${filteredProducts.length !== 1 ? 's' : ''}` 
                : 'No se encontraron productos con los filtros actuales'}
            </p>
          </div>
            
          {/* Tabla de productos */}
          <ProductosTable 
            productos={filteredProducts} 
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
          
          {/* Si no hay productos pero sí hay filtros, mostrar botón para limpiar filtros */}
          {productos.length > 0 && filteredProducts.length === 0 && (
            <div className="mt-4">
              <button 
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                onClick={() => {
                  // Limpiar filtros
                  setFilters({
                    busqueda: '',
                    categoria: '',
                    estado: ''
                  });
                }}
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </>
      )}
      {/* Sección de proveedores y órdenes de compra */}
      <div className="mt-10">
        {/* Proveedores */}
        <details className="mb-4 border rounded">
          <summary className="cursor-pointer px-4 py-2 bg-gray-100 text-gray-800 font-semibold rounded-t select-none">Proveedores</summary>
          <div className="p-4">
            {/* No se comparte estado real, solo ejemplo */}
            {/* En producción, los proveedores vendrían de Supabase */}
            <Proveedores proveedoresIniciales={proveedores} onProveedoresChange={setProveedores} />
          </div>
        </details>
        {/* Órdenes de compra */}
        <details className="border rounded">
          <summary className="cursor-pointer px-4 py-2 bg-gray-100 text-gray-800 font-semibold rounded-t select-none">Órdenes de compra</summary>
          <div className="p-4">
            {/* En producción, productos y proveedores vendrían de Supabase */}
            <OrdenesCompra productosDisponibles={productos} proveedores={proveedores} />
          </div>
        </details>
      </div>
    </div>
  );
};

export default CatalogoProductos;
