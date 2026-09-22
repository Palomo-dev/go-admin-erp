"use client"

import { ArrowLeft, PlusCircle } from 'lucide-react'
import NuevoProductoForm from '@/components/inventario/productos/NuevoProductoForm'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function NuevoProductoPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header mejorado */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Info izquierda */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Link
                  href="/app/inventario/productos"
                  prefetch={true}
                  aria-label="Volver al catálogo de productos"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <div className="shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-2 shadow-lg shadow-blue-500/20 sm:p-2.5">
                  <PlusCircle className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-bold text-gray-900 dark:text-white md:text-2xl">
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
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
        <NuevoProductoForm />
      </div>
    </div>
  )
}
