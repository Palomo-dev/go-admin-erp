'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { QRScanner, AttendanceResult, EmployeeHeader } from '@/components/marcar';
import { QRAttendanceService, type QRValidationResult, type EmployeeInfo } from '@/lib/services/qrAttendanceService';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn, Clock, QrCode, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function MarcarPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [isLoadingEmployee, setIsLoadingEmployee] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<QRValidationResult | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | undefined>();

  // Cargar información del empleado autenticado
  useEffect(() => {
    const loadEmployee = async () => {
      try {
        const info = await QRAttendanceService.getEmployeeInfo();
        setEmployee(info);
      } catch (error) {
        console.error('Error cargando empleado:', error);
      } finally {
        setIsLoadingEmployee(false);
      }
    };

    loadEmployee();
  }, []);

  // Actualizar reloj
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Obtener geolocalización si está disponible
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.log('Geolocalización no disponible:', error.message);
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const handleScan = useCallback(async (data: string) => {
    if (isProcessing) return;

    setIsProcessing(true);
    try {
      const validationResult = await QRAttendanceService.validateAndRecord(data, geoLocation);
      setResult(validationResult);
    } catch (error) {
      console.error('Error al procesar QR:', error);
      setResult({
        success: false,
        message: 'Error al procesar la marcación. Intenta de nuevo.',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [geoLocation, isProcessing]);

  const handleReset = () => {
    setResult(null);
  };

  // Estado de carga inicial
  if (isLoadingEmployee) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-600 dark:text-gray-300">Cargando información...</p>
        </div>
      </div>
    );
  }

  // No autenticado
  if (!employee) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
            <div className="w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900 mx-auto flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Autenticación requerida
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Debes iniciar sesión para marcar tu asistencia
            </p>
            <Link href="/auth/login">
              <Button className="w-full">
                <LogIn className="h-4 w-4 mr-2" />
                Iniciar sesión
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="h-6 w-6 text-blue-600" />
              <span className="font-semibold text-gray-900 dark:text-white">Marcación</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {format(currentTime, 'HH:mm')}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {format(currentTime, "EEEE d 'de' MMMM", { locale: es })}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Info del empleado */}
        <EmployeeHeader employee={employee} />

        {/* Scanner o Resultado */}
        {result ? (
          <AttendanceResult result={result} onReset={handleReset} />
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Escanea el código QR
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Apunta la cámara al código QR del dispositivo de marcación
              </p>
            </div>

            <QRScanner onScan={handleScan} isProcessing={isProcessing} />

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Sistema automático
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    El sistema detectará automáticamente si es entrada o salida según tu último registro del día.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-3">
        <div className="max-w-md mx-auto px-4 text-center text-xs text-gray-500 dark:text-gray-400">
          Sistema de marcación de asistencia
        </div>
      </footer>
    </div>
  );
}
