'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { QRDisplayScreen } from '@/components/app/hrm/marcacion/pantalla';
import { QRAttendanceService } from '@/lib/services/qrAttendanceService';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface DeviceData {
  id: string;
  name: string;
  organization_id: number;
  branch_name: string | null;
  current_qr_token: string | null;
  qr_token_expires_at: string | null;
  is_active: boolean;
}

export default function QRDisplayPage() {
  const params = useParams();
  const deviceId = params.deviceId as string;

  const [device, setDevice] = useState<DeviceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDevice = async () => {
      try {
        const data = await QRAttendanceService.getDeviceById(deviceId);
        if (!data) {
          setError('Dispositivo no encontrado');
        } else if (!data.is_active) {
          setError('Este dispositivo está inactivo');
        } else {
          setDevice(data);
          // Si no tiene token, generar uno nuevo
          if (!data.current_qr_token) {
            const result = await QRAttendanceService.regenerateToken(deviceId);
            if (result) {
              setDevice({
                ...data,
                current_qr_token: result.token,
                qr_token_expires_at: result.expires_at,
              });
            }
          }
        }
      } catch (err) {
        console.error('Error cargando dispositivo:', err);
        setError('Error al cargar el dispositivo');
      } finally {
        setIsLoading(false);
      }
    };

    loadDevice();
  }, [deviceId]);

  const handleRegenerateToken = useCallback(async () => {
    return QRAttendanceService.regenerateToken(deviceId);
  }, [deviceId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <p className="text-xl">Cargando dispositivo...</p>
        </div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center text-white max-w-md">
          <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Error</h1>
          <p className="text-gray-300 mb-6">{error || 'Dispositivo no encontrado'}</p>
          <Link href="/app/hrm/marcacion/dispositivos">
            <Button variant="outline" className="text-white border-white hover:bg-white/10">
              Volver a dispositivos
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <QRDisplayScreen
      deviceId={device.id}
      deviceName={device.name}
      branchName={device.branch_name}
      organizationId={device.organization_id}
      initialToken={device.current_qr_token}
      initialExpiresAt={device.qr_token_expires_at}
      onRegenerateToken={handleRegenerateToken}
    />
  );
}
