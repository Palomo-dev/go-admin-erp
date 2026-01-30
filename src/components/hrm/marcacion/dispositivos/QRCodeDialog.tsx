'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Download, Clock, AlertTriangle, QrCode } from 'lucide-react';
import type { TimeClock } from '@/lib/services/timeClocksService';

interface QRCodeDialogProps {
  device: TimeClock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegenerate: (id: string) => Promise<TimeClock>;
}

export function QRCodeDialog({
  device,
  open,
  onOpenChange,
  onRegenerate,
}: QRCodeDialogProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<TimeClock | null>(device);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    setCurrentDevice(device);
  }, [device]);

  const calculateTimeLeft = useCallback(() => {
    if (!currentDevice?.qr_token_expires_at) return 0;
    const expiresAt = new Date(currentDevice.qr_token_expires_at);
    const now = new Date();
    const diff = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    return diff;
  }, [currentDevice?.qr_token_expires_at]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    setTimeLeft(calculateTimeLeft());

    return () => clearInterval(interval);
  }, [calculateTimeLeft]);

  const handleRegenerate = async () => {
    if (!currentDevice) return;
    setIsRegenerating(true);
    try {
      const updated = await onRegenerate(currentDevice.id);
      setCurrentDevice(updated);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDownload = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');

      const downloadLink = document.createElement('a');
      downloadLink.download = `QR-${currentDevice?.code || currentDevice?.name}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const isExpired = timeLeft <= 0;
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const qrValue = currentDevice?.current_qr_token
    ? JSON.stringify({
        type: 'attendance',
        device_id: currentDevice.id,
        token: currentDevice.current_qr_token,
        org: currentDevice.organization_id,
      })
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-blue-600" />
            Código QR - {currentDevice?.name}
          </DialogTitle>
          <DialogDescription>
            Los empleados escanean este código para registrar su marcación
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-4 py-4">
          {currentDevice?.current_qr_token && !isExpired ? (
            <>
              <div className="p-4 bg-white rounded-lg shadow-sm border">
                <QRCodeSVG
                  id="qr-code-svg"
                  value={qrValue}
                  size={200}
                  level="H"
                  includeMargin
                />
              </div>

              <Badge
                variant="outline"
                className={`gap-1 ${
                  timeLeft > 60
                    ? 'border-green-200 text-green-700 bg-green-50'
                    : timeLeft > 30
                    ? 'border-yellow-200 text-yellow-700 bg-yellow-50'
                    : 'border-red-200 text-red-700 bg-red-50'
                }`}
              >
                <Clock className="h-3 w-3" />
                Expira en {formatTime(timeLeft)}
              </Badge>

              <p className="text-xs text-gray-500 text-center max-w-xs">
                El código se regenera automáticamente cada 5 minutos por seguridad
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <AlertTriangle className="h-16 w-16 text-yellow-500" />
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-900 dark:text-white">
                  {isExpired ? 'Código QR Expirado' : 'Sin código QR'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Genera un nuevo código para permitir marcaciones
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 w-full">
            <Button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex-1"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
              {isRegenerating ? 'Generando...' : 'Generar Nuevo QR'}
            </Button>

            {currentDevice?.current_qr_token && !isExpired && (
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
