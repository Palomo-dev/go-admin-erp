'use client';

import { Button } from '@/components/ui/button';
import { 
  BellIcon, 
  ShoppingCartIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import type { ProductoBajoUmbral } from './StockMinimoReporte';

interface StockMinimoHeaderProps {
  readonly onConfigClick: () => void;
  readonly onGenerarOCClick: () => void;
  readonly onNotificacionesClick: () => void;
  readonly selectedProducts: ProductoBajoUmbral[];
}

/**
 * Encabezado para la página de Stock Mínimo
 * Contiene título y acciones principales
 */
export default function StockMinimoHeader({
  onConfigClick,
  onGenerarOCClick,
  onNotificacionesClick,
  selectedProducts
}: StockMinimoHeaderProps) {
  const hasSelectedProducts = selectedProducts.length > 0;
  
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reabastecimiento & Alertas</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona productos por debajo del umbral de stock mínimo
        </p>
      </div>
      
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onConfigClick}
          className="flex items-center"
        >
          <Cog6ToothIcon className="h-4 w-4 mr-1" />
          Configurar umbrales
        </Button>
        
        <Button
          variant="default"
          size="sm"
          onClick={onGenerarOCClick}
          disabled={!hasSelectedProducts}
          className="flex items-center bg-blue-600 hover:bg-blue-700 text-white"
        >
          <ShoppingCartIcon className="h-4 w-4 mr-1" />
          Generar OC
          {hasSelectedProducts && (
            <span className="ml-1 bg-blue-800 text-white text-xs rounded-full px-2 py-0.5">
              {selectedProducts.length}
            </span>
          )}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={onNotificacionesClick}
          disabled={!hasSelectedProducts}
          className="flex items-center"
        >
          <BellIcon className="h-4 w-4 mr-1" />
          Enviar notificaciones
        </Button>
      </div>
    </div>
  );
}
