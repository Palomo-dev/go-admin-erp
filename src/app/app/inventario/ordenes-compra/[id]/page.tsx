'use client';

// En Next.js App Router, usamos estos imports para acceder a las APIs de Next.js
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { OrdenCompra, ItemOrdenCompra } from '@/components/inventario/ordenes-compra/types';
import { DetalleOrdenCompra } from '@/components/inventario/ordenes-compra/DetalleOrdenCompra';
import { Button } from '@/components/ui/button';
import { MoveRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// Componente temporal de Spinner hasta que esté disponible en la UI
const Spinner = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }[size];
  
  return (
    <div className={`animate-spin rounded-full border-2 border-t-transparent ${sizeClass}`} />
  );
};

interface OrdenCompraDetallePageProps {
  params: { id: string };
}

export default function OrdenCompraDetallePage({ params }: OrdenCompraDetallePageProps) {
  // Usamos useParams() para acceder a los parámetros de forma segura
  // Esto evita las advertencias de acceso directo a params.id
  const searchParams = useParams();
  const ordenId = searchParams?.id as string;

  const [orden, setOrden] = useState<OrdenCompra | null>(null);
  const [items, setItems] = useState<ItemOrdenCompra[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const { organization } = useOrganization();
  
  useEffect(() => {
    if (organization?.id && ordenId) {
      cargarDatosOrden(parseInt(ordenId));
    }
  }, [organization?.id, ordenId]);
  
  const cargarDatosOrden = async (id: number) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Cargar datos de la orden
      // Eliminamos campos email, nit, phone de suppliers ya que pueden no existir en la tabla
      const { data: ordenData, error: ordenError } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          branch_id,
          supplier_id,
          status,
          expected_date,
          total,
          created_at,
          updated_at,
          created_by,
          organization_id,
          notes,
          suppliers(id, name),
          branches(id, name)
        `)
        .eq('id', id)
        .eq('organization_id', organization?.id)
        .single();
        
      if (ordenError) {
        throw ordenError;
      }
      
      if (!ordenData) {
        throw new Error('Orden de compra no encontrada');
      }
      
      setOrden(ordenData as unknown as OrdenCompra);
      
      // Cargar items de la orden
      // Eliminamos received_quantity y expiry_date ya que no existen en la tabla po_items
      const { data: itemsData, error: itemsError } = await supabase
        .from('po_items')
        .select(`
          id,
          purchase_order_id,
          product_id,
          quantity,
          unit_cost,
          status,
          lot_code,
          products(id, name, sku)
        `)
        .eq('purchase_order_id', id);
        
      if (itemsError) {
        throw itemsError;
      }
      
      setItems(itemsData as unknown as ItemOrdenCompra[]);
    } catch (err: any) {
      console.error('Error al cargar datos de la orden:', err);
      setError(err.message || 'Error al cargar datos de la orden');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <>
      {/* No necesitamos usar Helmet en Next.js App Router */}

      <div className="flex flex-col space-y-6 p-6">
        <div className="flex justify-between items-center">
          <div className="flex flex-col space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {orden ? `Orden de Compra #${orden.id}` : 'Detalle Orden de Compra'}
            </h1>
            <div className="flex items-center text-sm text-muted-foreground">
              <Link href="/app/inicio" className="hover:underline">Inicio</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <Link href="/app/inventario" className="hover:underline">Inventario</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <Link href="/app/inventario/ordenes-compra" className="hover:underline">Órdenes de Compra</Link>
              <MoveRight className="h-3 w-3 mx-1" />
              <span>Detalle</span>
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

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Spinner size="lg" />
          </div>
        ) : (
          <DetalleOrdenCompra 
            orden={orden} 
            items={items} 
            onRefresh={() => ordenId && cargarDatosOrden(parseInt(ordenId))}
            error={error}
          />
        )}
      </div>
    </>
  );
}
