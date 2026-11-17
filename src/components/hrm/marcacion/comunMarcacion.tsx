'use client';

/**
 * Piezas compartidas de la pestaña Marcación (Figma 20.26–20.28): icono y nombre
 * de cada método, icono de cada tipo de dispositivo y la insignia de verificación.
 * Los iconos salen de `ICONO_METODO` (CATALOGO-ICONOS.md, adenda 2026-11-16).
 */
import { useTranslations } from 'next-intl';
import {
  CircleHelp,
  Fingerprint,
  KeyRound,
  Laptop,
  LocateFixed,
  MonitorSmartphone,
  Nfc,
  PenLine,
  ScanFace,
  ScanQrCode,
  TabletSmartphone,
  type LucideIcon,
} from 'lucide-react';
import { ICONO_METODO } from '@/lib/hrm/marcacion/metodos';
import { InsigniaEstado } from '../asistencia/comunAsistencia';
import type { MetodoFila, TipoDispositivo, VerificacionFila } from './marcacionVista';

export const RUTA_MARCACION = '/app/hrm/marcacion';

const ICONOS: Record<string, LucideIcon> = {
  LocateFixed,
  ScanQrCode,
  Nfc,
  KeyRound,
  ScanFace,
  Fingerprint,
  Laptop,
  PenLine,
};

export function iconoMetodo(m: MetodoFila): LucideIcon {
  if (m === 'desconocido') return CircleHelp;
  return ICONOS[ICONO_METODO[m]] ?? CircleHelp;
}

export function iconoDispositivo(t: TipoDispositivo): LucideIcon {
  switch (t) {
    case 'pantalla_qr':
      return ScanQrCode;
    case 'etiqueta_nfc':
      return Nfc;
    case 'terminal_huella':
      return Fingerprint;
    case 'terminal_facial':
      return ScanFace;
    case 'kiosco':
      return TabletSmartphone;
    case 'lector_escritorio':
      return Nfc;
    default:
      return MonitorSmartphone;
  }
}

/** Icono y nombre del método, en línea («⌖ Celular con ubicación»). */
export function MetodoConIcono({ metodo, className }: { metodo: MetodoFila; className?: string }) {
  const t = useTranslations('hrmMarcacionRrhh.metodos');
  const Icono = iconoMetodo(metodo);
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className ?? ''}`}>
      <Icono className="size-4 shrink-0 text-fg-secondary" aria-hidden="true" />
      <span className="truncate">{t(metodo)}</span>
    </span>
  );
}

/** Insignia de «Verificación» («Dentro de la sede», «Rechazada: fuera de la sede»…). */
export function InsigniaVerificacion({ v, corta = false }: { v: VerificacionFila; corta?: boolean }) {
  const t = useTranslations('hrmMarcacionRrhh.verificacion');
  const texto =
    v.clave === 'rechazada'
      ? corta
        ? t('rechazadaCorta')
        : t(`rechazos.${v.motivo}`)
      : v.clave === 'tarde'
        ? t('tarde', { n: v.minutos })
        : t(v.clave);
  return <InsigniaEstado tono={v.tono}>{texto}</InsigniaEstado>;
}
