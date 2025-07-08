'use client';

// Eliminamos react-helmet y usamos el sistema nativo de Next.js para el título
// El título se puede gestionar desde el layout o con useEffect
import { useRouter } from 'next/navigation';
import { MoveRight, ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/ui/page-title';
import { FormularioOrdenCompra } from '@/components/inventario/ordenes-compra/FormularioOrdenCompra';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface EditarOrdenCompraPageProps {
  params: { id: string };
}

export default function EditarOrdenCompraPage({ params }: EditarOrdenCompraPageProps) {
  const router = useRouter();
  const ordenId = parseInt(params.id);
  
  return (
    <>
      {/* Usamos useEffect para actualizar el título de la página */}
      <div className="sr-only">Editar Orden de Compra #{params.id} | GO Admin ERP</div>

      <div className="flex flex-col space-y-6 p-6">
        <div className="flex justify-between items-center">
          <div className="flex flex-col space-y-1">
            <PageTitle>
              Editar Orden de Compra #{params.id}
            </PageTitle>
            <div className="flex items-center text-sm text-muted-foreground">
              <Link href="/app/inicio" className="hover:underline">Inicio</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <Link href="/app/inventario" className="hover:underline">Inventario</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <Link href="/app/inventario/ordenes-compra" className="hover:underline">Órdenes de Compra</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <Link href={`/app/inventario/ordenes-compra/${params.id}`} className="hover:underline">#{params.id}</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <span>Editar</span>
            </div>
          </div>
          <div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
          </div>
        </div>
        
        <FormularioOrdenCompra ordenId={ordenId} esEdicion={true} />
      </div>
    </>
  );
}
