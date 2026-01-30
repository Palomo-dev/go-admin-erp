"use client"

import { ArrowLeft, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import FormularioEdicionProducto from '@/components/inventario/productos/editar/FormularioEdicionProducto'

export default function EditarProductoPage() {
  const params = useParams();
  // El id ahora es un UUID (string)
  const productoUuid = params?.id as string;
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header mejorado */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Info izquierda */}
            <div className="flex items-center gap-4">
              <Link href={`/app/inventario/productos/${productoUuid}`} prefetch={true}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20">
                  <Pencil className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                    Editar Producto
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                    Actualiza la información del producto
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenedor del formulario */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <FormularioEdicionProducto productoUuid={productoUuid} />
      </div>
    </div>
  )
}
