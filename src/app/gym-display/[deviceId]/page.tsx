'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { GymDevicesService, GymAccessDevice } from '@/lib/services/gymDevicesService';
import { GymCheckinService, MemberWithMembership } from '@/lib/services/gymCheckinService';
import { supabase } from '@/lib/supabase/config';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Loader2, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Fingerprint,
  QrCode,
  Dumbbell,
  Clock,
  User,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type DisplayMode = 'idle' | 'searching' | 'success' | 'denied' | 'error';

interface CheckinResult {
  success: boolean;
  memberName: string;
  planName: string;
  message: string;
  expiresIn?: number;
}

export default function GymDisplayPage() {
  const params = useParams();
  const deviceId = params.deviceId as string;

  const [device, setDevice] = useState<GymAccessDevice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Display state
  const [displayMode, setDisplayMode] = useState<DisplayMode>('idle');
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // QR Token
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);

  // Services
  const checkinServiceRef = useRef<GymCheckinService | null>(null);

  // Cargar dispositivo
  useEffect(() => {
    const loadDevice = async () => {
      try {
        const service = new GymDevicesService();
        const data = await service.getDeviceById(deviceId);
        
        if (!data) {
          setError('Dispositivo no encontrado');
        } else if (!data.is_active) {
          setError('Este dispositivo está inactivo');
        } else {
          setDevice(data);
          setQrToken(data.current_qr_token || null);
          setQrExpiresAt(data.qr_token_expires_at || null);

          // Obtener organization_id del branch
          const { data: branch } = await supabase
            .from('branches')
            .select('organization_id')
            .eq('id', data.branch_id)
            .single();

          if (branch) {
            checkinServiceRef.current = new GymCheckinService(branch.organization_id, data.branch_id);
          }

          // Generar token si no tiene
          if (!data.current_qr_token) {
            const result = await service.generateQRToken(deviceId);
            if (result) {
              setQrToken(result.token);
              setQrExpiresAt(result.expires_at);
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

  // Actualizar reloj
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Regenerar QR token periódicamente
  useEffect(() => {
    if (!device?.configuration?.qr_enabled) return;

    const checkAndRegenerateToken = async () => {
      if (!qrExpiresAt || new Date(qrExpiresAt) < new Date()) {
        const service = new GymDevicesService();
        const result = await service.generateQRToken(deviceId);
        if (result) {
          setQrToken(result.token);
          setQrExpiresAt(result.expires_at);
        }
      }
    };

    const interval = setInterval(checkAndRegenerateToken, 30000); // Cada 30 segundos
    return () => clearInterval(interval);
  }, [deviceId, device?.configuration?.qr_enabled, qrExpiresAt]);

  // Resetear display después de mostrar resultado
  useEffect(() => {
    if (displayMode === 'success' || displayMode === 'denied') {
      const timeout = setTimeout(() => {
        setDisplayMode('idle');
        setCheckinResult(null);
        setSearchQuery('');
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [displayMode]);

  // Buscar y hacer check-in
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !checkinServiceRef.current) return;

    setDisplayMode('searching');
    
    try {
      const results = await checkinServiceRef.current.searchMember(searchQuery);
      
      if (results.length === 0) {
        setDisplayMode('error');
        setCheckinResult({
          success: false,
          memberName: '',
          planName: '',
          message: 'Miembro no encontrado',
        });
        return;
      }

      const member = results[0];
      
      if (!member.canAccess) {
        setDisplayMode('denied');
        setCheckinResult({
          success: false,
          memberName: `${member.customer.first_name} ${member.customer.last_name}`,
          planName: member.membership_plan?.name || 'Sin plan',
          message: member.accessReason || 'Acceso denegado',
        });
        
        // Registrar denegación
        await checkinServiceRef.current.registerDeniedAccess(
          member.membership.id, 
          member.accessReason || 'Acceso denegado'
        );
        return;
      }

      // Registrar check-in
      await checkinServiceRef.current.registerCheckin(member.membership.id, 'qr');
      
      setDisplayMode('success');
      setCheckinResult({
        success: true,
        memberName: `${member.customer.first_name} ${member.customer.last_name}`,
        planName: member.membership_plan?.name || 'Sin plan',
        message: '¡Bienvenido!',
        expiresIn: member.daysUntilExpiry,
      });

    } catch (error) {
      console.error('Error en check-in:', error);
      setDisplayMode('error');
      setCheckinResult({
        success: false,
        memberName: '',
        planName: '',
        message: 'Error al procesar',
      });
    }
  }, [searchQuery]);

  // Manejar entrada de teclado (para lectores de código)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }, [handleSearch]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="h-16 w-16 animate-spin mx-auto mb-4" />
          <p className="text-2xl">Cargando dispositivo...</p>
        </div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center text-white max-w-md">
          <AlertTriangle className="h-20 w-20 text-yellow-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-4">Error</h1>
          <p className="text-xl text-gray-300 mb-8">{error || 'Dispositivo no encontrado'}</p>
          <Link href="/app/gym/dispositivos">
            <Button variant="outline" size="lg" className="text-white border-white hover:bg-white/10">
              Volver a dispositivos
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex flex-col">
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-white/10 flex items-center justify-center">
            <Dumbbell className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{device.device_name}</h1>
            <p className="text-blue-200">{device.location_description || device.branches?.name}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold text-white font-mono">
            {format(currentTime, 'HH:mm:ss')}
          </div>
          <div className="text-blue-200">
            {format(currentTime, "EEEE, d 'de' MMMM", { locale: es })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        {displayMode === 'idle' && (
          <div className="text-center space-y-8">
            {/* QR Code */}
            {device.configuration?.qr_enabled && qrToken && (
              <div className="bg-white p-8 rounded-3xl shadow-2xl inline-block">
                <QRCodeSVG
                  value={`gym-checkin:${device.id}:${qrToken}`}
                  size={280}
                  level="H"
                  includeMargin
                />
              </div>
            )}

            {/* Instructions */}
            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-white">
                {device.configuration?.qr_enabled ? 'Escanea el código QR' : 'Ingresa tu código'}
              </h2>
              
              {device.configuration?.fingerprint_enabled && (
                <div className="flex items-center justify-center gap-3 text-blue-200 text-xl">
                  <Fingerprint className="h-8 w-8" />
                  <span>o coloca tu huella digital</span>
                </div>
              )}

              {/* Manual search input */}
              <div className="max-w-md mx-auto mt-8">
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Código de acceso, documento o teléfono..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-14 text-lg bg-white/10 border-white/20 text-white placeholder:text-white/50 pr-12"
                    autoFocus
                  />
                  <Button
                    onClick={handleSearch}
                    size="icon"
                    className="absolute right-2 top-2 h-10 w-10 bg-blue-500 hover:bg-blue-600"
                  >
                    <QrCode className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {displayMode === 'searching' && (
          <div className="text-center">
            <Loader2 className="h-24 w-24 animate-spin text-white mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-white">Verificando...</h2>
          </div>
        )}

        {displayMode === 'success' && checkinResult && (
          <div className="text-center animate-in zoom-in-50 duration-300">
            <div className="bg-green-500/20 p-12 rounded-3xl border-4 border-green-400">
              <CheckCircle2 className="h-32 w-32 text-green-400 mx-auto mb-6" />
              <h2 className="text-4xl font-bold text-white mb-2">
                {checkinResult.message}
              </h2>
              <p className="text-3xl text-green-300 mb-4">
                {checkinResult.memberName}
              </p>
              <p className="text-xl text-green-200">
                {checkinResult.planName}
              </p>
              {checkinResult.expiresIn !== undefined && checkinResult.expiresIn <= 7 && (
                <div className="mt-6 p-4 bg-yellow-500/20 rounded-xl border border-yellow-400">
                  <p className="text-yellow-300 text-lg">
                    ⚠️ Tu membresía vence en {checkinResult.expiresIn} días
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {(displayMode === 'denied' || displayMode === 'error') && checkinResult && (
          <div className="text-center animate-in zoom-in-50 duration-300">
            <div className="bg-red-500/20 p-12 rounded-3xl border-4 border-red-400">
              <XCircle className="h-32 w-32 text-red-400 mx-auto mb-6" />
              <h2 className="text-4xl font-bold text-white mb-2">
                Acceso Denegado
              </h2>
              {checkinResult.memberName && (
                <p className="text-2xl text-red-300 mb-4">
                  {checkinResult.memberName}
                </p>
              )}
              <p className="text-xl text-red-200">
                {checkinResult.message}
              </p>
              <p className="text-lg text-red-300 mt-6">
                Acércate a recepción para más información
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 text-center">
        <p className="text-blue-300 text-sm">
          {device.configuration?.qr_enabled && (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4" />
              El código QR se actualiza automáticamente
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
