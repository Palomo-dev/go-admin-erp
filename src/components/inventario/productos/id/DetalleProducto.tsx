'use client';

import { useState, lazy, Suspense } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { 
  PencilIcon, 
  Copy, 
  Power, 
  Trash2,
  AlertTriangle, 
  ArrowLeft,
  PackagePlus,
  ArrowLeftRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';

import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';

// Importaciones de componentes locales
import ProductoHeader from './ProductoHeader';
import DetallesTab from './tabs/DetallesTab';
import VariantesTab from './tabs/VariantesTab';
import StockTab from './tabs/StockTab';
import ImagenesTab from './tabs/ImagenesTab';
import PreciosTab from './tabs/PreciosTab';
import EtiquetasTab from './tabs/EtiquetasTab';
import NotasTab from './tabs/NotasTab';
import AuditoriaTab from './tabs/AuditoriaTab';

// Importaciones de componentes UI
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';

interface DetalleProductoProps {
  producto: any;
}

/**
 * Componente principal de la vista de detalle de producto
 * Contiene todas las secciones y pestañas para gestionar información de producto
 */
const DetalleProducto: React.FC<DetalleProductoProps> = ({ producto }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { organization, isLoading: loadingOrg } = useOrganization();
  const [activeTab, setActiveTab] = useState<string>('detalles');
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>(producto.status || 'active');

  // Funciones para manejar acciones principales
  const handleEditProduct = () => {
    // Usar UUID si está disponible
    const productUuid = producto.uuid || producto.id;
    router.push(`/app/inventario/productos/${productUuid}/editar`);
  };

  const handleDuplicateProduct = () => {
    // Usar UUID si está disponible
    const productUuid = producto.uuid || producto.id;
    router.push(`/app/inventario/productos/${productUuid}/duplicar`);
  };

  // Navegar a ajuste de inventario con producto preseleccionado
  const handleAjustarStock = () => {
    router.push(`/app/inventario/ajustes/nuevo?producto_id=${producto.id}`);
  };

  // Navegar a transferencia con producto preseleccionado
  const handleTransferir = () => {
    router.push(`/app/inventario/transferencias/nuevo?producto_id=${producto.id}`);
  };

  const handleChangeStatus = async (newStatus: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', producto.id)
        .eq('organization_id', organization?.id);

      if (error) throw error;
      
      setStatus(newStatus);
      
      toast({
        title: "Estado actualizado",
        description: `El producto ahora está ${newStatus === 'active' ? 'activo' : 'inactivo'}`,
      });
      
    } catch (error) {
      console.error('Error al cambiar estado del producto:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el estado. Intente de nuevo más tarde.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ 
          status: 'deleted',
          updated_at: new Date().toISOString()
        })
        .eq('id', producto.id)
        .eq('organization_id', organization?.id);

      if (error) throw error;
      
      toast({
        title: "Producto eliminado",
        description: "El producto ha sido marcado como eliminado",
      });
      
      // Redirigir al catálogo
      router.push('/app/inventario/productos');
      
    } catch (error) {
      console.error('Error al eliminar producto:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el producto. Intente de nuevo más tarde.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex flex-col gap-6 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
      {/* Navegación de regreso */}
      <div className="flex">
        <Button
          variant="ghost"
          size="sm"
          className={`flex items-center gap-1 ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
          onClick={() => router.push('/app/inventario/productos')}
        >
          <ArrowLeft className="h-4 w-4" /> Volver al catálogo
        </Button>
      </div>

      {/* Encabezado del producto */}
      <ProductoHeader producto={producto} />
      
      {/* Acciones principales */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleEditProduct}>
          <PencilIcon className="h-4 w-4 mr-2" /> Editar
        </Button>
        
        <Button variant="outline" onClick={handleDuplicateProduct} disabled={loading}>
          <Copy className="h-4 w-4 mr-2" /> Duplicar
        </Button>

        {/* Acciones rápidas de inventario */}
        <Button 
          variant="outline"
          onClick={handleAjustarStock}
          disabled={loading}
          className="border-green-500 text-green-600 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-950"
        >
          <PackagePlus className="h-4 w-4 mr-2" /> Ajustar Stock
        </Button>
        
        <Button 
          variant="outline"
          onClick={handleTransferir}
          disabled={loading}
          className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-950"
        >
          <ArrowLeftRight className="h-4 w-4 mr-2" /> Transferir
        </Button>
        
        <Button 
          variant="outline"
          onClick={() => handleChangeStatus(status === 'active' ? 'inactive' : 'active')}
          disabled={loading || status === 'deleted'}
        >
          <Power className="h-4 w-4 mr-2" />
          {status === 'active' ? 'Desactivar' : 'Activar'}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="destructive" 
              disabled={loading || status === 'deleted'}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Eliminar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className={theme === 'dark' ? 'bg-gray-900 border-gray-800 text-gray-100' : 'bg-white'}>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                Esta acción marcará el producto como eliminado y dejará de aparecer en los listados regulares.
              </AlertDialogDescription>
              <div className="mt-4 flex items-center p-3 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5 mr-2" />
                <span>Esta acción no borra el producto de la base de datos.</span>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : ''}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteProduct}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      
      {/* Pestañas de contenido */}
      <main className="flex-1 p-6 overflow-auto">
        {/* Pestañas de producto */}
        <div className="mt-6">
          <Tabs defaultValue="detalles" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full md:w-auto grid-cols-3 md:grid-cols-8">
              <TabsTrigger value="detalles">Detalles</TabsTrigger>
              <TabsTrigger value="variantes">Variantes</TabsTrigger>
              <TabsTrigger value="stock">Stock</TabsTrigger>
              <TabsTrigger value="imagenes">Imágenes</TabsTrigger>
              <TabsTrigger value="precios">Precios</TabsTrigger>
              <TabsTrigger value="etiquetas">Etiquetas</TabsTrigger>
              <TabsTrigger value="notas">Notas</TabsTrigger>
              <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
            </TabsList>
            
            {/* Contenido de pestañas con Suspense para manejar la carga dinámica */}
            <TabsContent value="detalles">
              <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-64 rounded-md"></div>}>
                <DetallesTab producto={producto} />
              </Suspense>
            </TabsContent>
            <TabsContent value="variantes">
              <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-64 rounded-md"></div>}>
                <VariantesTab producto={producto} />
              </Suspense>
            </TabsContent>
            <TabsContent value="stock">
              <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-64 rounded-md"></div>}>
                <StockTab producto={producto} />
              </Suspense>
            </TabsContent>
            <TabsContent value="imagenes">
              <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-64 rounded-md"></div>}>
                <ImagenesTab producto={producto} />
              </Suspense>
            </TabsContent>
            <TabsContent value="precios">
              <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-64 rounded-md"></div>}>
                <PreciosTab producto={producto} />
              </Suspense>
            </TabsContent>
            <TabsContent value="etiquetas">
              <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-64 rounded-md"></div>}>
                <EtiquetasTab producto={producto} />
              </Suspense>
            </TabsContent>
            <TabsContent value="notas">
              <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-64 rounded-md"></div>}>
                <NotasTab producto={producto} />
              </Suspense>
            </TabsContent>
            <TabsContent value="auditoria">
              <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-800 h-64 rounded-md"></div>}>
                <AuditoriaTab producto={producto} />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default DetalleProducto;
