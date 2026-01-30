'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Package, Truck, MapPin, Barcode, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { LabelWithDetails } from '@/lib/services/labelsService';

interface LabelPreviewProps {
  label: LabelWithDetails;
  className?: string;
}

export function LabelPreview({ label, className = '' }: LabelPreviewProps) {
  return (
    <Card className={`p-6 max-w-md mx-auto ${className}`}>
      {/* Header con código de barras simulado */}
      <div className="text-center mb-4">
        <div className="inline-flex flex-col items-center gap-2">
          <div className="flex items-center gap-1">
            {/* Simulación de código de barras */}
            {[...Array(30)].map((_, i) => (
              <div
                key={i}
                className="bg-black dark:bg-white"
                style={{
                  width: Math.random() > 0.5 ? '2px' : '1px',
                  height: '40px',
                }}
              />
            ))}
          </div>
          <p className="font-mono text-lg font-bold tracking-wider">
            {label.barcode_value || label.label_number}
          </p>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Número de etiqueta */}
      <div className="text-center mb-4">
        <Badge className="text-lg px-4 py-1 bg-black text-white dark:bg-white dark:text-black">
          {label.label_number}
        </Badge>
      </div>

      {/* Información del envío */}
      {label.shipments && (
        <>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* Remitente (origen) */}
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1 flex items-center gap-1">
                <Package className="h-3 w-3" />
                Envío
              </p>
              <p className="font-bold">{label.shipments.shipment_number}</p>
              {label.shipments.tracking_number && (
                <p className="text-gray-600 dark:text-gray-400">
                  {label.shipments.tracking_number}
                </p>
              )}
            </div>

            {/* Destinatario */}
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Destino
              </p>
              <p className="font-bold">{label.shipments.delivery_contact_name || 'N/A'}</p>
              <p className="text-gray-600 dark:text-gray-400">
                {label.shipments.delivery_city || 'Ciudad no especificada'}
              </p>
            </div>
          </div>

          {/* Dirección completa */}
          {label.shipments.delivery_address && (
            <div className="mt-4 p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
                Dirección de Entrega
              </p>
              <p>{label.shipments.delivery_address}</p>
              {label.shipments.delivery_contact_phone && (
                <p className="text-gray-600 dark:text-gray-400">
                  Tel: {label.shipments.delivery_contact_phone}
                </p>
              )}
            </div>
          )}
        </>
      )}

      <Separator className="my-4" />

      {/* Carrier y peso */}
      <div className="flex justify-between items-center text-sm">
        {label.transport_carriers && (
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-gray-400" />
            <span className="font-medium">{label.transport_carriers.name}</span>
          </div>
        )}
        {label.shipments?.weight_kg && (
          <Badge variant="outline">
            {label.shipments.weight_kg} kg
          </Badge>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t flex justify-between items-center text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {format(new Date(label.created_at), "dd/MM/yyyy", { locale: es })}
        </div>
        <div className="flex items-center gap-1">
          <Barcode className="h-3 w-3" />
          {label.format?.toUpperCase()} • {label.width_mm}x{label.height_mm}mm
        </div>
      </div>

      {/* Indicadores especiales */}
      {label.shipments && (
        <div className="mt-3 flex gap-2 justify-center flex-wrap">
          {label.label_type === 'return' && (
            <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
              ↩️ DEVOLUCIÓN
            </Badge>
          )}
          {label.label_type === 'customs' && (
            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
              🛃 ADUANAS
            </Badge>
          )}
          {label.carrier_tracking && (
            <Badge variant="outline">
              Tracking: {label.carrier_tracking}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}

export default LabelPreview;
