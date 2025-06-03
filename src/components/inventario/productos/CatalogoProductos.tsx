"use client";

import React, { useState } from 'react';
import ProductosPageHeader from '@/components/inventario/productos/ProductosPageHeader';
import FiltrosProductos from '@/components/inventario/productos/FiltrosProductos';
import ProductosTable from '@/components/inventario/productos/ProductosTable';
import FormularioProducto from '@/components/inventario/productos/FormularioProducto';
import DetalleProducto from '@/components/inventario/productos/DetalleProducto';

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
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [filters, setFilters] = useState<any>({
    categoria: '',
    estado: 'todos',
    busqueda: ''
  });

  // Productos de ejemplo (en producción vendrían de Supabase)
  const [productos, setProductos] = useState<any[]>([
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
    setSelectedProduct(null);
  };

  const handleEdit = (product: any) => {
    setSelectedProduct(product);
    setIsEditing(true);
    setIsCreating(false);
    setIsViewing(false);
  };

  const handleView = (product: any) => {
    setSelectedProduct(product);
    setIsViewing(true);
    setIsEditing(false);
    setIsCreating(false);
  };

  const handleSave = (productData: any) => {
    if (isCreating) {
      // En producción: guardar en Supabase
      const newProduct = {
        ...productData,
        id: Date.now().toString(), // En producción: ID generado por Supabase
      };
      setProductos([...productos, newProduct]);
    } else if (isEditing && selectedProduct) {
      // En producción: actualizar en Supabase
      const updatedProducts = productos.map((p) => 
        p.id === selectedProduct.id ? { ...p, ...productData } : p
      );
      setProductos(updatedProducts);
    }
    
    setIsCreating(false);
    setIsEditing(false);
    setSelectedProduct(null);
  };

  const handleDelete = (productId: string) => {
    // En producción: eliminar de Supabase
    setProductos(productos.filter((p) => p.id !== productId));
  };

  const handleCancel = () => {
    setIsCreating(false);
    setIsEditing(false);
    setIsViewing(false);
    setSelectedProduct(null);
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
  if (isCreating || isEditing) {
    return (
      <div className="space-y-6">
        <ProductosPageHeader 
          title={isCreating ? "Nuevo Producto" : "Editar Producto"} 
          onBack={handleCancel}
        />
        <FormularioProducto 
          initialData={isEditing ? selectedProduct : undefined}
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
