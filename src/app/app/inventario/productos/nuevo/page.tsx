"use client"

import { ArrowLeft, Package, PlusCircle } from 'lucide-react'
import NuevoProductoForm from '@/components/inventario/productos/NuevoProductoForm'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function NuevoProductoPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header mejorado */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Info izquierda */}
            <div className="flex items-center gap-4">
              <Link href="/app/inventario/productos" prefetch={true}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
                  <PlusCircle className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                    Nuevo Producto
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                    Completa la información para agregar un producto al catálogo
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenedor del formulario */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <NuevoProductoForm />
      </div>
    </div>
  )
}
