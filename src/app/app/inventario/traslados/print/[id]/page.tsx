'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, ArrowLeft, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PageProps {
  params: {
    id: string
  }
}

export default function PrintPickingListPage({ params }: PageProps) {
  // En lugar de acceder directamente a params.id, extraemos el ID de la URL
  const [transferId, setTransferId] = useState<string>("");
  const router = useRouter();
  const { organization } = useOrganization();
  const [transfer, setTransfer] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Extraemos el ID del traslado de la URL actual
    const pathParts = window.location.pathname.split('/');
    const id = pathParts[pathParts.length - 1];
    setTransferId(id);
  }, []);
  
  useEffect(() => {
    // Solo procedemos si tenemos tanto el ID del traslado como el ID de la organización
    if (!transferId || !organization?.id) return;
      
    const fetchTransfer = async () => {
      if (!organization?.id) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Obtener los detalles del traslado
        const { data: transferData, error: transferError } = await supabase
          .from('inventory_transfers')
          .select(`
            *,
            origin_branch:origin_branch_id(id, name, address),
            dest_branch:dest_branch_id(id, name, address)
          `)
          .eq('id', transferId)
          .eq('organization_id', organization.id)
          .single();
          
        if (transferError) throw transferError;
        
        setTransfer(transferData);
        
        // Obtener los items del traslado
        const { data: itemsData, error: itemsError } = await supabase
          .from('transfer_items')
          .select(`
            *,
            product:product_id(id, name, sku, barcode)
          `)
          .eq('inventory_transfer_id', transferId)
          .order('id');
          
        if (itemsError) throw itemsError;
        
        setItems(itemsData || []);
      } catch (err: any) {
        console.error('Error al cargar traslado:', err);
        setError(err.message || 'Error al cargar los detalles del traslado');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTransfer();
  }, [transferId, organization?.id]);
  
  const handlePrint = () => {
    if (printRef.current) {
      const printContents = printRef.current.innerHTML;
      const originalContents = document.body.innerHTML;
      
      // Crear una hoja de estilos para la impresión
      const printStyles = `
        <style>
          @media print {
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .print-header { margin-bottom: 20px; }
            .print-footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 10px; }
            .company-name { font-size: 22px; font-weight: bold; }
            .title { font-size: 18px; font-weight: bold; margin: 10px 0; }
            .details { margin-bottom: 15px; }
            .detail-row { display: flex; margin-bottom: 5px; }
            .detail-label { font-weight: bold; width: 120px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
            .signature-box { width: 45%; }
            .signature-line { border-top: 1px solid #333; margin-top: 50px; }
          }
        </style>
      `;
      
      document.body.innerHTML = printStyles + printContents;
      window.print();
      document.body.innerHTML = originalContents;
      window.location.reload(); // Recargar la página para restaurar funcionalidad
    }
  };
  
  const handleBack = () => {
    router.push('/app/inventario/traslados');
  };
  
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd MMMM yyyy, HH:mm", { locale: es });
    } catch (e) {
      return dateStr;
    }
  };
  
  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'in_transit': return 'En tránsito';
      case 'received': return 'Recibido';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Cargando información del traslado...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Button onClick={handleBack} variant="outline" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (!transfer) {
    return (
      <div className="container mx-auto py-6">
        <Button onClick={handleBack} variant="outline" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Traslado no encontrado</AlertTitle>
          <AlertDescription>El traslado solicitado no existe o no tienes permiso para verlo.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Button onClick={handleBack} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        
        <Button onClick={handlePrint} className="flex items-center gap-2">
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>
      
      <div ref={printRef} className="bg-white p-6 border rounded-md shadow-sm dark:bg-gray-950">
        <div className="print-header">
          <p className="company-name">{organization?.name}</p>
          <p className="title">LISTA DE PICKING - TRASLADO #{transfer.id}</p>
          
          <div className="details">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p><strong>Origen:</strong> {transfer.origin_branch?.name}</p>
                {transfer.origin_branch?.address && <p><strong>Dirección:</strong> {transfer.origin_branch.address}</p>}
              </div>
              
              <div>
                <p><strong>Destino:</strong> {transfer.dest_branch?.name}</p>
                {transfer.dest_branch?.address && <p><strong>Dirección:</strong> {transfer.dest_branch.address}</p>}
              </div>
            </div>
            
            <div className="mt-4">
              <p><strong>Fecha de creación:</strong> {formatDate(transfer.created_at)}</p>
              <p><strong>Estado:</strong> {getStatusText(transfer.status)}</p>
              {transfer.notes && (
                <div className="mt-2">
                  <p><strong>Notas:</strong></p>
                  <p className="whitespace-pre-wrap">{transfer.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border p-2 text-left">#</th>
              <th className="border p-2 text-left">Producto</th>
              <th className="border p-2 text-left">SKU</th>
              <th className="border p-2 text-left">Código</th>
              <th className="border p-2 text-right">Cantidad</th>
              <th className="border p-2 text-center">Verificado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="border p-2">{index + 1}</td>
                <td className="border p-2">{item.product?.name || 'Producto desconocido'}</td>
                <td className="border p-2">{item.product?.sku || 'N/A'}</td>
                <td className="border p-2">{item.product?.barcode || 'N/A'}</td>
                <td className="border p-2 text-right">{item.quantity}</td>
                <td className="border p-2 text-center">□</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div className="print-footer">
          <div className="signatures">
            <div className="signature-box">
              <div className="signature-line"></div>
              <p className="text-center mt-2">Firma Emisor</p>
              <p className="text-center text-sm">Responsable sucursal origen</p>
            </div>
            
            <div className="signature-box">
              <div className="signature-line"></div>
              <p className="text-center mt-2">Firma Receptor</p>
              <p className="text-center text-sm">Responsable sucursal destino</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
