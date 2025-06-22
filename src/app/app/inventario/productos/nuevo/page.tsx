"use client"

import { useState } from 'react'
import { Metadata } from 'next'
import FormularioProducto from '@/components/inventario/productos/nuevo/FormularioProducto'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export default function NuevoProductoPage() {
  return (
    <div className="container mx-auto py-4 px-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo Producto</h1>
        <p className="text-muted-foreground mt-2">
          Completa el formulario para crear un nuevo producto en el catálogo.
        </p>
      </div>

      <FormularioProducto />
    </div>
  )
}
