"use client"

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import FormularioEdicionProducto from '@/components/inventario/productos/editar/FormularioEdicionProducto'

// Interfaz para las props del componente
type PageProps = {
  params: {
    id: string
  }
}

export default function EditarProductoPage({ params }: PageProps) {
  // En Next.js 14+, params es una promesa, así que usamos React.use para desenvolverla
  const resolvedParams = React.use(params as any) as { id: string }
  // Convertir el ID de string a number para pasarlo al formulario
  const productoId = parseInt(resolvedParams.id)
  
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Encabezado de la página */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-4">
          <Link 
            href="/app/inventario/productos"
            className="flex items-center text-sm px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> 
            <span>Volver a productos</span>
          </Link>
          
          <Link 
            href={`/app/inventario/productos/${productoId}`}
            className="flex items-center text-sm px-3 py-1.5 text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900/20 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> 
            <span>Detalle del producto</span>
          </Link>
        </div>
        
        <h1 className="text-2xl font-bold dark:text-gray-100">
          Editar Producto
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Actualiza la información del producto, variantes, imágenes y stock
        </p>
      </div>
      
      {/* Formulario de edición */}
      <FormularioEdicionProducto productoId={productoId} />
    </div>
  )
}
