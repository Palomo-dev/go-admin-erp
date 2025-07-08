'use client';

import { useRouter } from 'next/navigation';
import { MoveRight, ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/ui/page-title';
import { FormularioOrdenCompra } from '@/components/inventario/ordenes-compra/FormularioOrdenCompra';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NuevaOrdenCompraPage() {
  const router = useRouter();
  
  return (
    <>
      {/* Título accesible para SEO y lectores de pantalla */}
      <div className="sr-only">Nueva Orden de Compra | GO Admin ERP</div>

      <div className="flex flex-col space-y-6 p-6">
        <div className="flex justify-between items-center">
          <div className="flex flex-col space-y-1">
            <PageTitle>
              Nueva Orden de Compra
            </PageTitle>
            <div className="flex items-center text-sm text-muted-foreground">
              <Link href="/app/inicio" className="hover:underline">Inicio</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <Link href="/app/inventario" className="hover:underline">Inventario</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <Link href="/app/inventario/ordenes-compra" className="hover:underline">Órdenes de Compra</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <span>Nueva</span>
            </div>
          </div>
          <div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push('/app/inventario/ordenes-compra')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver a la lista
            </Button>
          </div>
        </div>
        
        <FormularioOrdenCompra />
      </div>
    </>
  );
}
