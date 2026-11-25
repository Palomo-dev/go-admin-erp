'use client';

/**
 * «¿El cliente no tiene el código?» (Figma «05 Cliente sin código»): tres salidas y ninguna para
 * saltarse el código. Decisión del dueño (2026-11-25): en contraentrega no hay excepción ni PIN
 * que lo omita; protege el dinero. Con 5 errores el código se bloquea y solo un administrador lo
 * reinicia desde el detalle del envío.
 */
import { useTranslations } from 'next-intl';
import { Lock, Mail, Phone, XCircle } from 'lucide-react';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { clasesBoton } from '@/components/kit';
import { MAX_INTENTOS_CODIGO } from '@/lib/logistica/contraentrega';
import { enlaceLlamar } from '@/lib/logistica/misEnvios';
import { cn } from '@/utils/Utils';

export interface HojaSinCodigoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  subtitulo: string;
  /** Teléfono de la sede del envío (si la sede no tiene, no hay botón «Llamar a la tienda»). */
  telefonoTienda: string | null;
  /** «No se pudo entregar»: abre la novedad (null si el estado no la admite). */
  onNovedad: (() => void) | null;
}

export function HojaSinCodigo({ abierto, onAbiertoChange, subtitulo, telefonoTienda, onNovedad }: HojaSinCodigoProps) {
  const t = useTranslations('logistica.misEnvios.sinCodigo');
  const llamar = enlaceLlamar(telefonoTienda);

  const opciones = [
    { clave: 'buscar', icono: Mail, tono: 'bg-brand-tint text-brand' },
    { clave: 'tienda', icono: Phone, tono: 'bg-warning-subtle text-warning-text' },
    { clave: 'novedad', icono: XCircle, tono: 'bg-danger-subtle text-danger-text' },
  ] as const;

  return (
    <HojaDetalle
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      subtitulo={subtitulo}
      pie={
        <div className="flex w-full flex-col gap-2">
          {llamar && (
            <a href={llamar} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
              <Phone aria-hidden="true" className="size-5" strokeWidth={1.5} />
              {t('llamarTienda')}
            </a>
          )}
          <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
            {t('seguir')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <ul className="flex flex-col gap-5">
          {opciones.map(({ clave, icono: Icono, tono }) => {
            const contenido = (
              <>
                <span aria-hidden="true" className={cn('flex size-12 shrink-0 items-center justify-center rounded-full', tono)}>
                  <Icono className="size-6" strokeWidth={1.5} />
                </span>
                <span className="flex min-w-0 flex-col gap-1 text-left">
                  <span className="text-[15px] font-medium text-fg">{t(`opciones.${clave}.titulo`)}</span>
                  <span className="text-sm text-fg-secondary">{t(`opciones.${clave}.descripcion`)}</span>
                </span>
              </>
            );
            return (
              <li key={clave}>
                {clave === 'novedad' && onNovedad ? (
                  <button
                    type="button"
                    onClick={onNovedad}
                    className="flex w-full items-start gap-4 rounded-xl hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {contenido}
                  </button>
                ) : (
                  <div className="flex items-start gap-4">{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>
        <div role="note" className="flex items-start gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 text-sm text-warning-text">
          <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
          <p>{t('candado', { max: MAX_INTENTOS_CODIGO })}</p>
        </div>
      </div>
    </HojaDetalle>
  );
}
