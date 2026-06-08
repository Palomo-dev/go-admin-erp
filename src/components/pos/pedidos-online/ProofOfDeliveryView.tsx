'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  User,
  Calendar,
  MapPin,
  Star,
  FileText,
  Image as ImageIcon,
  Download,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  deliveryIntegrationService,
  type ProofOfDelivery,
} from '@/lib/services/deliveryIntegrationService';

interface ProofOfDeliveryViewProps {
  shipmentId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: 'card' | 'dialog';
}

export function ProofOfDeliveryView({
  shipmentId,
  open,
  onOpenChange,
  variant = 'card',
}: ProofOfDeliveryViewProps) {
  const [proof, setProof] = useState<ProofOfDelivery | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (variant === 'dialog' && !open) return;
    loadProof();
  }, [shipmentId, open, variant]);

  const loadProof = async () => {
    setLoading(true);
    try {
      const data = await deliveryIntegrationService.getProofOfDelivery(shipmentId);
      setProof(data);
    } catch (error) {
      console.error('Error loading proof of delivery:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground dark:text-gray-400" />
        </div>
      );
    }

    if (!proof) {
      return (
        <div className="text-center py-8">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground dark:text-gray-400 mb-3" />
          <p className="text-sm text-muted-foreground dark:text-gray-300">
            No hay prueba de entrega registrada
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Estado de entrega */}
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />
          <span className="font-medium text-green-700 dark:text-green-400">
            Entrega Confirmada
          </span>
          <Badge variant="outline" className="ml-auto dark:text-gray-100 dark:border-gray-600">
            Completa
          </Badge>
        </div>

        <Separator />

        {/* Información del receptor */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
            <span className="text-muted-foreground dark:text-gray-400">Recibido por:</span>
            <span className="font-medium dark:text-gray-100">{proof.recipient_name}</span>
          </div>

          {proof.recipient_doc_number && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
              <span className="text-muted-foreground dark:text-gray-400">Documento:</span>
              <span className="font-medium dark:text-gray-100">
                {proof.recipient_doc_type && `${proof.recipient_doc_type}: `}
                {proof.recipient_doc_number}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
            <span className="text-muted-foreground dark:text-gray-400">Fecha:</span>
            <span className="dark:text-gray-100">{formatDateTime(proof.delivered_at)}</span>
          </div>

          {(proof.latitude && proof.longitude) && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground dark:text-gray-400" />
              <span className="text-muted-foreground dark:text-gray-400">Ubicación:</span>
              <a
                href={`https://maps.google.com/?q=${proof.latitude},${proof.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                Ver en mapa
                <ExternalLink className="h-3 w-3 dark:text-gray-300" />
              </a>
            </div>
          )}
        </div>

        {/* Calificación */}
        {proof.customer_rating && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2 dark:text-gray-100">
                <Star className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />
                Calificación del cliente
              </p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-5 w-5 ${
                      star <= proof.customer_rating!
                        ? 'text-yellow-500 fill-yellow-500 dark:text-yellow-400'
                        : 'text-gray-300 dark:text-gray-600'
                    }`}
                  />
                ))}
                <span className="ml-2 text-sm text-muted-foreground dark:text-gray-400">
                  ({proof.customer_rating}/5)
                </span>
              </div>
            </div>
          </>
        )}

        {/* Comentarios */}
        {proof.customer_feedback && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium dark:text-gray-100">Comentarios del cliente</p>
              <p className="text-sm text-muted-foreground dark:text-gray-400 bg-muted p-3 rounded-lg">
                "{proof.customer_feedback}"
              </p>
            </div>
          </>
        )}

        {/* Notas del conductor */}
        {proof.notes && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium dark:text-gray-100">Notas del conductor</p>
              <p className="text-sm text-muted-foreground dark:text-gray-400 bg-muted p-3 rounded-lg">
                {proof.notes}
              </p>
            </div>
          </>
        )}

        {/* Firma */}
        {proof.signature_url && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2 dark:text-gray-100">
                <FileText className="h-4 w-4 dark:text-gray-300" />
                Firma del receptor
              </p>
              <div className="border dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800">
                <img
                  src={proof.signature_url}
                  alt="Firma del receptor"
                  className="max-h-24 mx-auto"
                />
              </div>
              <Button variant="outline" size="sm" className="w-full dark:border-gray-600" asChild>
                <a href={proof.signature_url} download target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2 dark:text-gray-300" />
                  Descargar firma
                </a>
              </Button>
            </div>
          </>
        )}

        {/* Fotos */}
        {proof.photo_urls && proof.photo_urls.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2 dark:text-gray-100">
                <ImageIcon className="h-4 w-4 dark:text-gray-300" />
                Fotos de entrega ({proof.photo_urls.length})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {proof.photo_urls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border dark:border-gray-700 rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
                  >
                    <img
                      src={url}
                      alt={`Foto de entrega ${index + 1}`}
                      className="w-full h-24 object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  if (variant === 'dialog') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-gray-100">
              <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />
              Prueba de Entrega
            </DialogTitle>
          </DialogHeader>
          {renderContent()}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 dark:text-gray-100">
          <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />
          Prueba de Entrega
        </CardTitle>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
}
