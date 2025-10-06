"use client"

import { ArrowLeft, Package } from 'lucide-react'
import NuevoProductoForm from '@/components/inventario/productos/NuevoProductoForm'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function NuevoProductoPage() {
  return (
    <>
      {/* Header con mejor diseño - sticky para que permanezca visible */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-3">
            <Link href="/app/inventario/productos">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 w-fit"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a productos
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Package className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Nuevo Producto
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                  Completa la información para crear un nuevo producto en el catálogo
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenedor del formulario */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-6">
        <NuevoProductoForm />
      </div>
    </>
  )
}
