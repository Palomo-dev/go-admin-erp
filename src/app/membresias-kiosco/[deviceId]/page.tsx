'use client';

/**
 * Kiosco de entrada de un dispositivo (antes /gym-display/[deviceId], que
 * redirige aquí). Pantalla completa fuera del shell, con la sesión de quien
 * lo abrió (necesita memberships.checkin).
 *
 * La búsqueda y el registro son los de la pantalla Check-in
 * (`apiMembresias.buscarEntrada` / `registrarEntrada`): la base valida
 * vigencia, gracia, sede (la del dispositivo), horario y tope diario. El
 * método es `qr` solo si un lector leyó exactamente el código de acceso de la
 * membresía; lo tecleado es `manual` (antes todo se registraba como `qr`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, CheckCircle2, Fingerprint, Loader2, LogIn, RefreshCw, UserCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHardwareBarcodeScanner } from '@/hooks/useHardwareBarcodeScanner';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { GymDevicesService, type GymAccessDevice } from '@/lib/services/gymDevicesService';
import { apiMembresias, usePermisosMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { ResultadoCheckin } from '@/lib/services/membresias/tipos';
import {
  contenidoQrDispositivo,
  esAvisoConocido,
  esMotivoConocido,
  metodoDeEntrada,
  tonoResultadoEntrada,
} from '@/components/membresias/operacion/logica';
import { useFechasOrg } from '@/components/membresias/operacion/useFechasOrg';
import { cn } from '@/utils/Utils';

type Pantalla =
  | { modo: 'espera' }
  | { modo: 'verificando' }
  | { modo: 'resultado'; nombre: string; r: ResultadoCheckin }
  | { modo: 'aviso'; mensaje: string };

const SEGUNDOS_RESULTADO = 5;

export default function KioscoMembresiasPage() {
  const t = useTranslations('membresias.kiosco');
  const tk = useTranslations('membresias.checkin');
  const params = useParams();
  const deviceId = String((params as Record<string, string | string[]> | null)?.deviceId ?? '');
  const permisos = usePermisosMembresias();

  const [dispositivo, setDispositivo] = useState<GymAccessDevice | null>(null);
  const [zona, setZona] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const [texto, setTexto] = useState('');
  const [pantalla, setPantalla] = useState<Pantalla>({ modo: 'espera' });
  const [token, setToken] = useState<{ valor: string; vence: string } | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const fechas = useFechasOrg(zona);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const servicio = new GymDevicesService();
        const d = await servicio.getDeviceById(deviceId);
        if (!vivo) return;
        if (!d) return setError(t('errores.noEncontrado'));
        if (!d.is_active) return setError(t('errores.inactivo'));
        const org = d.branches?.organization_id ?? 0;
        if (org && org !== getOrganizationId()) return setError(t('errores.otraOrganizacion'));
        setDispositivo(d);
        setZona(await resolveTimezone(org, d.branch_id));
        if (d.current_qr_token && d.qr_token_expires_at) setToken({ valor: d.current_qr_token, vence: d.qr_token_expires_at });
      } catch {
        if (vivo) setError(t('errores.cargar'));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [deviceId, t]);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // El QR del dispositivo se renueva al vencer (dura 5 minutos).
  useEffect(() => {
    if (!dispositivo?.configuration?.qr_enabled) return;
    const renovar = async () => {
      if (token && new Date(token.vence).getTime() > Date.now() + 15_000) return;
      const nuevo = await new GymDevicesService().generateQRToken(dispositivo.id);
      if (nuevo) setToken({ valor: nuevo.token, vence: nuevo.expires_at });
    };
    void renovar();
    const id = setInterval(() => void renovar(), 30_000);
    return () => clearInterval(id);
  }, [dispositivo, token]);

  // El resultado se ve unos segundos y vuelve a la espera.
  useEffect(() => {
    if (pantalla.modo !== 'resultado' && pantalla.modo !== 'aviso') return;
    const id = setTimeout(() => {
      setPantalla({ modo: 'espera' });
      setTexto('');
      campoRef.current?.focus();
    }, SEGUNDOS_RESULTADO * 1000);
    return () => clearTimeout(id);
  }, [pantalla]);

  const entrar = useCallback(
    async (q: string, origen: 'lector' | 'teclado') => {
      const limpio = q.trim();
      if (!dispositivo || limpio.length < 2 || pantalla.modo === 'verificando') return;
      setPantalla({ modo: 'verificando' });
      try {
        const lista = await apiMembresias.buscarEntrada(limpio);
        const exacto = lista.find((e) => e.vigente?.codigo && e.vigente.codigo.toUpperCase() === limpio.toUpperCase());
        const elegido = exacto ?? (lista.length === 1 ? lista[0] : null);
        if (!elegido) {
          setPantalla({ modo: 'aviso', mensaje: lista.length === 0 ? t('noEncontrado') : t('variasCoincidencias') });
          return;
        }
        const r = await apiMembresias.registrarEntrada({
          clienteId: elegido.cliente.id,
          sucursalId: dispositivo.branch_id,
          metodo: metodoDeEntrada(origen, limpio, elegido.vigente?.codigo),
          membresiaId: elegido.vigente?.id ?? null,
        });
        setPantalla({ modo: 'resultado', nombre: elegido.cliente.nombre, r });
      } catch {
        setPantalla({ modo: 'aviso', mensaje: t('errores.procesar') });
      }
    },
    [dispositivo, pantalla.modo, t],
  );

  useHardwareBarcodeScanner({
    enabled: !!dispositivo && permisos.checkin,
    onScan: (codigo) => void entrar(codigo, 'lector'),
  });

  if (cargando || permisos.cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas text-fg" aria-busy="true">
        <p className="flex items-center gap-3 text-2xl">
          <Loader2 aria-hidden="true" className="size-10 animate-spin text-brand" />
          {t('cargando')}
        </p>
      </main>
    );
  }

  if (error || !dispositivo || !permisos.checkin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-6 text-fg">
        <div role="alert" className="flex max-w-md flex-col items-center gap-4 text-center">
          <AlertTriangle aria-hidden="true" className="size-16 text-warning" />
          <h1 className="text-2xl font-semibold">{t('errores.titulo')}</h1>
          <p className="text-lg text-fg-secondary">{error ?? t('errores.sinPermiso')}</p>
          <Button asChild variant="outline" size="lg">
            <Link href="/app/membresias/control-de-acceso">{t('volver')}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const qrActivo = !!dispositivo.configuration?.qr_enabled;

  return (
    <main className="flex min-h-screen flex-col bg-canvas text-fg">
      <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-brand-tint text-brand" aria-hidden="true">
            <UserCheck className="size-7" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{dispositivo.device_name}</h1>
            <p className="text-sm text-fg-secondary">{dispositivo.location_description || dispositivo.branches?.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-semibold tabular-nums">{fechas.hora(ahora)}</p>
          <p className="text-sm capitalize text-fg-secondary">{fechas.diaPlano(fechas.dia(ahora), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center p-6" aria-live="assertive">
        {pantalla.modo === 'espera' && (
          <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
            {qrActivo && token && (
              <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <QRCodeSVG value={contenidoQrDispositivo(dispositivo.id, token.valor)} size={260} level="H" includeMargin role="img" aria-label={t('qrAlt')} />
              </div>
            )}
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-semibold">{qrActivo ? t('instruccionQr') : t('instruccion')}</h2>
              {dispositivo.configuration?.fingerprint_enabled && (
                <p className="flex items-center justify-center gap-2 text-lg text-fg-secondary">
                  <Fingerprint aria-hidden="true" className="size-6" />
                  {t('huella')}
                </p>
              )}
            </div>
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void entrar(texto, 'teclado');
              }}
            >
              <label htmlFor="kiosco-codigo" className="sr-only">
                {t('campo')}
              </label>
              <Input
                id="kiosco-codigo"
                ref={campoRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={t('campo')}
                autoFocus
                autoComplete="off"
                className="h-14 flex-1 text-lg"
              />
              <Button type="submit" size="lg" className="h-14 px-6 text-lg">
                <LogIn aria-hidden="true" className="mr-2 size-5" />
                {t('entrar')}
              </Button>
            </form>
          </div>
        )}

        {pantalla.modo === 'verificando' && (
          <p className="flex flex-col items-center gap-4 text-3xl font-semibold">
            <Loader2 aria-hidden="true" className="size-20 animate-spin text-brand" />
            {t('verificando')}
          </p>
        )}

        {pantalla.modo === 'resultado' &&
          (() => {
            const { r, nombre } = pantalla;
            const tono = tonoResultadoEntrada(r);
            const Icono = tono === 'exito' ? CheckCircle2 : tono === 'advertencia' ? AlertTriangle : XCircle;
            return (
              <div
                role="status"
                className={cn(
                  'flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl border-4 p-10 text-center',
                  tono === 'exito' && 'border-line-success bg-success-subtle text-success-text',
                  tono === 'advertencia' && 'border-line-warning bg-warning-subtle text-warning-text',
                  tono === 'peligro' && 'border-line-danger bg-danger-subtle text-danger-text',
                )}
              >
                <Icono aria-hidden="true" className="size-24" />
                <h2 className="text-4xl font-bold">{r.permitido ? t('bienvenido') : t('denegado')}</h2>
                <p className="text-3xl font-medium text-fg">{nombre}</p>
                {r.membresia?.plan && <p className="text-xl text-fg-secondary">{r.membresia.plan}</p>}
                <p className="text-xl">
                  {r.permitido
                    ? esAvisoConocido(r.aviso)
                      ? tk(`avisos.${r.aviso}`, { dias: r.diasGracia ?? 0 })
                      : r.membresia
                        ? t('vence', { fecha: fechas.fecha(r.membresia.hasta) })
                        : ''
                    : esMotivoConocido(r.motivo)
                      ? tk(`motivos.${r.motivo}`)
                      : r.motivo}
                </p>
                {!r.permitido && <p className="text-lg text-fg-secondary">{t('recepcion')}</p>}
              </div>
            );
          })()}

        {pantalla.modo === 'aviso' && (
          <div role="alert" className="flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl border-4 border-line-warning bg-warning-subtle p-10 text-center text-warning-text">
            <AlertTriangle aria-hidden="true" className="size-20" />
            <p className="text-3xl font-semibold">{pantalla.mensaje}</p>
            <p className="text-lg text-fg-secondary">{t('recepcion')}</p>
          </div>
        )}
      </div>

      {qrActivo && (
        <footer className="flex items-center justify-center gap-2 p-4 text-sm text-fg-secondary">
          <RefreshCw aria-hidden="true" className="size-4" />
          {t('qrSeRenueva')}
        </footer>
      )}
    </main>
  );
}
