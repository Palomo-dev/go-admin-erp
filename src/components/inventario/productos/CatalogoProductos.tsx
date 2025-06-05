"use client";

import React, { useState } from 'react';
// Importamos los tipos centralizados
import { Producto, FiltrosProducto, MovimientoInventario, TipoMovimientoInventario } from '@/components/inventario/productos/types';
import ProductosPageHeader from '@/components/inventario/productos/ProductosPageHeader';
import FiltrosProductos from '@/components/inventario/productos/FiltrosProductos';
import ProductosTable from '@/components/inventario/productos/ProductosTable';
import FormularioProducto from '@/components/inventario/productos/FormularioProducto';
import DetalleProducto from '@/components/inventario/productos/DetalleProducto';
import ImportarProductos from '@/components/inventario/productos/ImportarProductos';

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

  // Movimientos de inventario de ejemplo (en producción vendrían de Supabase)
  React.useEffect(() => {
    // Generar algunos movimientos de ejemplo para demostración
    const movimientosEjemplo: MovimientoInventario[] = [
      {
        id: '1',
        fecha: new Date(2025, 5, 1, 9, 30),
        productoId: '1',
        productoNombre: 'Camiseta Básica',
        productoSku: 'CAM-001',
        tipoMovimiento: TipoMovimientoInventario.ENTRADA,
        cantidad: 20,
        stockPrevio: 30,
        stockResultante: 50,
        motivo: 'Ingreso inicial de inventario',
        responsable: 'Juan Pérez',
        documentoReferencia: 'OC-2025-001'
      },
      {
        id: '2',
        fecha: new Date(2025, 5, 2, 14, 15),
        productoId: '1',
        productoNombre: 'Camiseta Básica',
        productoSku: 'CAM-001',
        tipoMovimiento: TipoMovimientoInventario.SALIDA,
        cantidad: -5,
        stockPrevio: 50,
        stockResultante: 45,
        motivo: 'Venta en tienda',
        responsable: 'María González',
        documentoReferencia: 'FAC-2025-042'
      },
      {
        id: '3',
        fecha: new Date(2025, 5, 3, 11, 0),
        productoId: '1',
        productoNombre: 'Camiseta Básica',
        productoSku: 'CAM-001',
        tipoMovimiento: TipoMovimientoInventario.AJUSTE,
        cantidad: 5,
        stockPrevio: 45,
        stockResultante: 50,
        motivo: 'Ajuste por inventario físico',
        responsable: 'Carlos López',
        documentoReferencia: 'INV-2025-001'
      },
      {
        id: '4',
        fecha: new Date(2025, 5, 4, 16, 20),
        productoId: '2',
        productoNombre: 'Pantalón Vaquero',
        productoSku: 'PAN-001',
        tipoMovimiento: TipoMovimientoInventario.ENTRADA,
        cantidad: 15,
        stockPrevio: 15,
        stockResultante: 30,
        motivo: 'Recepción de mercancía',
        responsable: 'Juan Pérez',
        documentoReferencia: 'OC-2025-002'
      },
      {
        id: '5',
        fecha: new Date(2025, 5, 5, 10, 45),
        productoId: '3',
        productoNombre: 'Zapatillas Running',
        productoSku: 'ZAP-001',
        tipoMovimiento: TipoMovimientoInventario.ENTRADA,
        cantidad: 10,
        stockPrevio: 5,
        stockResultante: 15,
        motivo: 'Compra de mercancía',
        responsable: 'Ana Torres',
        documentoReferencia: 'OC-2025-004'
      }
    ];
    
    setMovimientos(movimientosEjemplo);
  }, []); // Array vacío para que solo se ejecute una vez al montar el componente

  // Productos de ejemplo (en producción vendrían de Supabase)
  const [productos, setProductos] = useState<Producto[]>([  
    { 
      id: '1', 
      nombre: 'Camiseta Básica', 
      sku: 'CAM-001', 
      categoria: 'Ropa', 
      precio: 25000, 
      stock: 50,
      estado: 'activo',
      tieneVariantes: true
    },
    { 
      id: '2', 
      nombre: 'Pantalón Vaquero', 
      sku: 'PAN-001', 
      categoria: 'Ropa', 
      precio: 59900, 
      stock: 30,
      estado: 'activo',
      tieneVariantes: true
    },
    { 
      id: '3', 
      nombre: 'Zapatillas Running', 
      sku: 'ZAP-001', 
      categoria: 'Calzado', 
      precio: 89900, 
      stock: 15,
      estado: 'inactivo',
      tieneVariantes: true
    }
  ]);

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
      <ProductosTable 
        productos={filteredProducts}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
};

export default CatalogoProductos;
