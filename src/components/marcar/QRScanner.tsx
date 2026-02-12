'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, SwitchCamera, Loader2 } from 'lucide-react';
import jsQR from 'jsqr';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QRScannerProps {
  onScan: (data: string) => void;
  isProcessing?: boolean;
}

export function QRScanner({ onScan, isProcessing }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      stopCamera();

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setHasPermission(true);
        setIsScanning(true);
      }
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      setHasPermission(false);
      if (err.name === 'NotAllowedError') {
        setError('Permiso de cámara denegado. Habilita el acceso a la cámara en la configuración de tu navegador.');
      } else if (err.name === 'NotFoundError') {
        setError('No se encontró ninguna cámara en este dispositivo.');
      } else {
        setError('Error al acceder a la cámara. Intenta de nuevo.');
      }
    }
  }, [facingMode, stopCamera]);

  const scanQRCode = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Usar BarcodeDetector API si está disponible
    if ('BarcodeDetector' in window) {
      try {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code'],
        });
        const barcodes = await barcodeDetector.detect(imageData);
        if (barcodes.length > 0) {
          onScan(barcodes[0].rawValue);
          return;
        }
      } catch (err) {
        // BarcodeDetector falló, continuar con fallback
      }
    }

    // Fallback: usar jsQR para navegadores sin BarcodeDetector (iOS Safari)
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (code && code.data) {
        onScan(code.data);
        return;
      }
    } catch (err) {
      // jsQR falló silenciosamente
    }
  }, [onScan, isProcessing]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (isScanning && !isProcessing) {
      scanIntervalRef.current = setInterval(scanQRCode, 250);
    }
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [isScanning, scanQRCode, isProcessing]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  useEffect(() => {
    if (hasPermission) {
      startCamera();
    }
  }, [facingMode, hasPermission, startCamera]);

  if (hasPermission === false) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-100 dark:bg-gray-800 rounded-xl min-h-[300px]">
        <CameraOff className="h-16 w-16 text-gray-400 mb-4" />
        <p className="text-gray-600 dark:text-gray-300 mb-4">{error}</p>
        <Button onClick={startCamera} variant="outline">
          <Camera className="h-4 w-4 mr-2" />
          Intentar de nuevo
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Overlay con guía de escaneo */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              'w-64 h-64 border-2 rounded-lg transition-colors duration-300',
              isProcessing
                ? 'border-green-500 bg-green-500/10'
                : 'border-white/50'
            )}
          >
            {/* Esquinas decorativas */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
          </div>
        </div>

        {/* Indicador de procesamiento */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center text-white">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-2" />
              <p className="text-lg font-medium">Procesando...</p>
            </div>
          </div>
        )}

        {/* Loading inicial */}
        {hasPermission === null && (
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
            <div className="text-center text-white">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Iniciando cámara...</p>
            </div>
          </div>
        )}
      </div>

      {/* Botón para cambiar cámara */}
      <div className="absolute bottom-4 right-4">
        <Button
          size="icon"
          variant="secondary"
          className="rounded-full bg-white/20 backdrop-blur hover:bg-white/30"
          onClick={toggleCamera}
        >
          <SwitchCamera className="h-5 w-5 text-white" />
        </Button>
      </div>

      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
        Apunta la cámara al código QR
      </p>
    </div>
  );
}

export default QRScanner;
