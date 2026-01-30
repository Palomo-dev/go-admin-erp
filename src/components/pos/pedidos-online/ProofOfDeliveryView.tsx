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
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!proof) {
      return (
        <div className="text-center py-8">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No hay prueba de entrega registrada
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Estado de entrega */}
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <span className="font-medium text-green-700 dark:text-green-400">
            Entrega Confirmada
          </span>
          <Badge variant="outline" className="ml-auto">
            Completa
          </Badge>
        </div>

        <Separator />

        {/* Información del receptor */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Recibido por:</span>
            <span className="font-medium">{proof.recipient_name}</span>
          </div>

          {proof.recipient_doc_number && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Documento:</span>
              <span className="font-medium">
                {proof.recipient_doc_type && `${proof.recipient_doc_type}: `}
                {proof.recipient_doc_number}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Fecha:</span>
            <span>{formatDateTime(proof.delivered_at)}</span>
          </div>

          {(proof.latitude && proof.longitude) && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Ubicación:</span>
              <a
                href={`https://maps.google.com/?q=${proof.latitude},${proof.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                Ver en mapa
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {/* Calificación */}
        {proof.customer_rating && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                Calificación del cliente
              </p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-5 w-5 ${
                      star <= proof.customer_rating!
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
                <span className="ml-2 text-sm text-muted-foreground">
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
              <p className="text-sm font-medium">Comentarios del cliente</p>
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
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
              <p className="text-sm font-medium">Notas del conductor</p>
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
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
              <p className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Firma del receptor
              </p>
              <div className="border rounded-lg p-2 bg-white">
                <img
                  src={proof.signature_url}
                  alt="Firma del receptor"
                  className="max-h-24 mx-auto"
                />
              </div>
              <Button variant="outline" size="sm" className="w-full" asChild>
                <a href={proof.signature_url} download target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2" />
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
              <p className="text-sm font-medium flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Fotos de entrega ({proof.photo_urls.length})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {proof.photo_urls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
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
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
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
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          Prueba de Entrega
        </CardTitle>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
}
