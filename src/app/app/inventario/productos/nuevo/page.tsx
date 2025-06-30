"use client"

import { useState } from 'react'
import { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import FormularioProducto from '@/components/inventario/productos/nuevo/FormularioProducto'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export default function NuevoProductoPage() {
  return (
    <div className="container mx-auto py-4 px-4">
      <div className="flex flex-col gap-2 mb-4">
        <a 
          className="flex items-center text-sm px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors w-fit" 
          href="/app/inventario/productos"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          <span>Volver a productos</span>
        </a>
        <h1 className="text-2xl font-bold dark:text-gray-100">Nuevo Producto</h1>
        <p className="text-gray-500 dark:text-gray-400">Completa el formulario para crear un nuevo producto en el catálogo.</p>
      </div>
      
      <FormularioProducto />
    </div>
  )
}
