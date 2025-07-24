'use client';

import OrdenesCompra from '@/components/inventario/ordenes-compra/OrdenesCompra';
import { Button } from '@/components/ui/button';
import { MoveRight, Plus } from 'lucide-react';
import Link from 'next/link';

export default function OrdenesCompraPage() {

  return (
    <>
      {/* No necesitamos Head en Next.js App Router, los metadatos se manejan en otra parte */}

      <div className="flex flex-col space-y-6 p-6">
        <div className="flex justify-between items-center">
          <div className="flex flex-col space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Órdenes de Compra</h1>
            <div className="flex items-center text-sm text-muted-foreground">
              <Link href="/app/inicio" className="hover:underline">Inicio</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <Link href="/app/inventario" className="hover:underline">Inventario</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <span>Órdenes de Compra</span>
            </div>
          </div>
          <div className="flex space-x-2">
            <Link href="/app/inventario/ordenes-compra/nueva">
              <Button variant="default" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Nueva Orden
              </Button>
            </Link>
          </div>
        </div>

        <OrdenesCompra />
      </div>
    </>
  );
}
