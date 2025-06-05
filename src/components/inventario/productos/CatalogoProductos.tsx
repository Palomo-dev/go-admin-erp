"use client";

import React, { useState } from 'react';
// Importamos los tipos centralizados
import { Producto, FiltrosProducto } from '@/components/inventario/productos/types';
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
    } else if (isEditing && selectedProduct) {
      // En producción: actualizar en Supabase
      const updatedProduct = { ...selectedProduct, ...productData };
      const updatedProducts = productos.map((p) => 
        p.id === selectedProduct.id ? updatedProduct : p
      );
      setProductos(updatedProducts);
      savedProduct = updatedProduct;
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
