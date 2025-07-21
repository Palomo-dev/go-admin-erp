"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Inicializar la cámara
    const initCamera = async () => {
      try {
        // Solicitar acceso a la cámara
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false
        });
        
        streamRef.current = stream;
        
        // Mostrar el video en vivo
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error al acceder a la cámara:", err);
        setError("No se pudo acceder a la cámara. Verifica los permisos e intenta de nuevo.");
      }
    };

    initCamera();

    // Limpiar al desmontar
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // En un caso real, aquí integrarías una biblioteca como quagga.js o zxing
  // para escanear y procesar el código de barras desde el video
  // Por simplicidad, simulamos un escaneo después de un tiempo
  useEffect(() => {
    // Simulación de escaneo exitoso después de 3 segundos
    const timer = setTimeout(() => {
      const mockBarcode = "7501234567890"; // Código de barras de ejemplo
      onScan(mockBarcode);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="relative bg-white dark:bg-gray-900 max-w-md w-full rounded-lg overflow-hidden">
        <Button
          variant="ghost"
          className="absolute top-2 right-2 text-gray-500 dark:text-gray-400 z-10"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </Button>
        
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Escáner de código de barras
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Apunta la cámara al código de barras del producto
          </p>
        </div>
        
        {error ? (
          <div className="p-6 flex flex-col items-center justify-center">
            <AlertCircle className="h-12 w-12 text-red-500 mb-2" />
            <p className="text-center text-gray-600 dark:text-gray-300">{error}</p>
            <Button
              className="mt-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
              onClick={onClose}
            >
              Cerrar
            </Button>
          </div>
        ) : (
          <>
            <div className="aspect-video w-full bg-black relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 pointer-events-none">
                <div className="w-11/12 h-1 bg-red-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                <div className="h-11/12 w-1 bg-red-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              </div>
            </div>
            
            <div className="p-4 bg-white dark:bg-gray-900">
              <div className="flex justify-center items-center py-2">
                <div className="relative w-6 h-6">
                  <div className="absolute inset-0 border-4 border-blue-500 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                  Escaneando...
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
