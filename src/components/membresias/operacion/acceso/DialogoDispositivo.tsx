'use client';

/**
 * Alta y edición de un dispositivo de acceso. La sede se elige (antes se
 * tomaba la primera de la organización sin preguntar).
 */
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, PanelAdaptable } from '@/components/kit';
import type { CreateDeviceData, GymAccessDevice } from '@/lib/services/gymDevicesService';
import { TIPOS_DISPOSITIVO, type TipoDispositivo } from '../logica';

interface Props {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  dispositivo: GymAccessDevice | null;
  sucursales: ReadonlyArray<{ id: number; nombre: string }>;
  sucursalPorDefecto: number | null;
  onGuardar: (datos: CreateDeviceData) => Promise<void>;
}

export function DialogoDispositivo({ abierto, onAbiertoChange, dispositivo, sucursales, sucursalPorDefecto, onGuardar }: Props) {
  const t = useTranslations('membresias.acceso');
  const idQr = useId();
  const idHuella = useId();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoDispositivo>('tablet');
  const [sede, setSede] = useState('');
  const [serie, setSerie] = useState('');
  const [ip, setIp] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [qr, setQr] = useState(true);
  const [huella, setHuella] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setIntentado(false);
    setNombre(dispositivo?.device_name ?? '');
    setTipo(dispositivo?.device_type ?? 'tablet');
    setSede(dispositivo ? String(dispositivo.branch_id) : sucursalPorDefecto ? String(sucursalPorDefecto) : sucursales.length === 1 ? String(sucursales[0].id) : '');
    setSerie(dispositivo?.serial_number ?? '');
    setIp(dispositivo?.ip_address ?? '');
    setUbicacion(dispositivo?.location_description ?? '');
    setQr(dispositivo?.configuration?.qr_enabled ?? true);
    setHuella(dispositivo?.configuration?.fingerprint_enabled ?? false);
  }, [abierto, dispositivo, sucursalPorDefecto, sucursales]);

  const guardar = async () => {
    setIntentado(true);
    if (!nombre.trim() || !sede) return;
    setGuardando(true);
    try {
      await onGuardar({
        branch_id: Number(sede),
        device_name: nombre.trim(),
        device_type: tipo,
        serial_number: serie.trim() || undefined,
        ip_address: ip.trim() || undefined,
        location_description: ubicacion.trim() || undefined,
        configuration: { ...(dispositivo?.configuration ?? {}), qr_enabled: qr, fingerprint_enabled: huella },
      });
      onAbiertoChange(false);
    } catch {
      // La página muestra el error.
    } finally {
      setGuardando(false);
    }
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={dispositivo ? t('dialogo.tituloEditar') : t('dialogo.tituloNuevo')}
      descripcion={t('dialogo.descripcion')}
      icono={Cpu}
      ocupado={guardando}
      ancho={560}
      pie={
        <>
          <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
            {t('dialogo.cancelar')}
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? t('dialogo.guardando') : dispositivo ? t('dialogo.guardar') : t('dialogo.crear')}
          </Button>
        </>
      }
    >
      <FormField etiqueta={t('dialogo.nombre')} obligatorio error={intentado && !nombre.trim() ? t('dialogo.errores.nombre') : null}>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('dialogo.nombrePlaceholder')} maxLength={80} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField etiqueta={t('dialogo.tipo')}>
          {(campo) => (
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDispositivo)}>
              <SelectTrigger id={campo.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_DISPOSITIVO.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(`tipos.${x}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('dialogo.sede')} obligatorio error={intentado && !sede ? t('dialogo.errores.sede') : null}>
          {(campo) => (
            <Select value={sede} onValueChange={setSede}>
              <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']}>
                <SelectValue placeholder={t('dialogo.sedePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('dialogo.serie')}>
          <Input value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={80} />
        </FormField>
        <FormField etiqueta={t('dialogo.ip')}>
          <Input value={ip} onChange={(e) => setIp(e.target.value)} inputMode="decimal" maxLength={45} />
        </FormField>
      </div>
      <FormField etiqueta={t('dialogo.ubicacion')}>
        <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder={t('dialogo.ubicacionPlaceholder')} maxLength={120} />
      </FormField>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-medium text-fg">{t('dialogo.metodos')}</legend>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor={idQr} className="text-sm text-fg">
            {t('dialogo.qr')}
          </label>
          <Switch id={idQr} checked={qr} onCheckedChange={setQr} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor={idHuella} className="text-sm text-fg">
            {t('dialogo.huella')}
          </label>
          <Switch id={idHuella} checked={huella} onCheckedChange={setHuella} />
        </div>
      </fieldset>
    </PanelAdaptable>
  );
}
