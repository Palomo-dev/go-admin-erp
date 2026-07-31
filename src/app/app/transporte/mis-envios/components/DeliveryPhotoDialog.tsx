'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Camera, Loader2, X, FileCheck, Image as ImageIcon, Upload, RefreshCw } from 'lucide-react';

type CaptureMode = 'upload' | 'camera';

interface DeliveryPhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    recipientName: string;
    photoUrl: string;
    notes?: string;
  }) => Promise<void>;
  initialRecipientName?: string;
}

export function DeliveryPhotoDialog({ open, onOpenChange, onSubmit, initialRecipientName }: DeliveryPhotoDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('upload');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    stopCamera();
  };

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraReady(false);
  }, [cameraStream]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setIsCameraReady(true);
        };
      }
    } catch (err: any) {
      setCameraError(err?.message || 'No se pudo acceder a la cámara');
    }
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current || !isCameraReady) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      stopCamera();
    }, 'image/jpeg', 0.85);
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      setCaptureMode('upload');
      setCameraError(null);
    }
  }, [open, stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (open && initialRecipientName) {
      setRecipientName(initialRecipientName);
    }
  }, [open, initialRecipientName]);

  const handleSubmit = async () => {
    if (!recipientName || !photoFile) return;

    setIsSubmitting(true);
    try {
      const fileName = `pod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const filePath = `deliveries/${fileName}`;

      const { supabase } = await import('@/lib/supabase/config');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('shipment-pod')
        .upload(filePath, photoFile, {
          contentType: photoFile.type || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('shipment-pod')
        .getPublicUrl(filePath);

      const photoUrl = urlData.publicUrl;

      await onSubmit({
        recipientName,
        photoUrl,
        notes: notes || undefined,
      });

      onOpenChange(false);
      setRecipientName('');
      setNotes('');
      handleRemovePhoto();
    } catch (error) {
      console.error('Error submitting delivery:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-green-600 dark:text-green-300" />
            Confirmar Entrega
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 sm:space-y-4">
          <div className="space-y-2">
            <Label>Nombre de quien recibe *</Label>
            <Input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Nombre completo"
            />
          </div>

          <div className="space-y-2">
            <Label>Foto de la entrega *</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="hidden"
            />
            <canvas ref={canvasRef} className="hidden" />

            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Preview de entrega"
                  className="w-full h-48 object-cover rounded-lg border"
                />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="absolute bottom-2 left-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="bg-black/60 text-white rounded-lg px-3 py-1.5 text-xs flex items-center gap-1 hover:bg-black/80"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Cambiar foto
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Toggle entre subir y cámara */}
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setCaptureMode('upload'); stopCamera(); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      captureMode === 'upload'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Upload className="h-4 w-4" />
                    Subir archivo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCaptureMode('camera'); startCamera(); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      captureMode === 'camera'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Camera className="h-4 w-4" />
                    Tomar foto
                  </button>
                </div>

                {/* Modo subir archivo */}
                {captureMode === 'upload' && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 transition-colors dark:hover:border-blue-400 dark:hover:text-blue-400"
                  >
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-sm font-medium">Seleccionar imagen</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">Click para elegir un archivo</span>
                  </button>
                )}

                {/* Modo cámara */}
                {captureMode === 'camera' && (
                  <div className="space-y-2">
                    {cameraError ? (
                      <div className="w-full h-40 border-2 border-red-300 dark:border-red-800 rounded-lg flex flex-col items-center justify-center gap-2 text-red-500 p-4 text-center dark:text-red-400">
                        <Camera className="h-8 w-8" />
                        <span className="text-sm font-medium">Error: {cameraError}</span>
                        <Button size="sm" variant="outline" onClick={startCamera} className="mt-1">
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Reintentar
                        </Button>
                      </div>
                    ) : (
                      <div className="relative">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-40 object-cover rounded-lg border bg-black"
                        />
                        {!isCameraReady && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                            <Loader2 className="h-6 w-6 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                    )}
                    {!cameraError && (
                      <Button
                        type="button"
                        onClick={capturePhoto}
                        disabled={!isCameraReady}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Capturar foto
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales de la entrega..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !recipientName || !photoFile}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck className="h-4 w-4 mr-2" />}
            Confirmar Entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
