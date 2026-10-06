'use client';

/**
 * Paso 5 «Dominio» (Figma A/03e): empezar gratis con el subdominio (listo de
 * inmediato y con HTTPS), o ir a Dominios para conectar o comprar uno y volver
 * al asistente (`?accion=conectar|comprar&volver=…`). Conectar o comprar no se
 * repiten aquí: viven en Sitio web › Dominios (un solo flujo para el asistente,
 * Sedes y las alertas del Resumen).
 */
import Link from 'next/link';
import { CircleCheck, ShoppingCart, type LucideIcon } from 'lucide-react';
import { AvisoTonal, FormField, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/Utils';
import { RUTA_DOMINIOS_SITIO_WEB } from '../../rutasSitioWeb';
import { RUTA_ASISTENTE } from '@/lib/website/resumenSitio';
import type { DireccionSitio } from '@/lib/website/resumenSitio';
import { CajaIcono } from '../../ui/CajaIcono';
import { ICONO_TAREA_SITIO } from '../../ui/iconosSitio';
import { EncabezadoPaso } from './EncabezadoPaso';
import { useTextosResumen } from '../textos';

export function rutaDominios(accion: 'conectar' | 'comprar'): string {
  const volver = `${RUTA_ASISTENTE}?paso=5`;
  return `${RUTA_DOMINIOS_SITIO_WEB}?accion=${accion}&volver=${encodeURIComponent(volver)}`;
}

export interface PasoDominioProps {
  subdominio: string | null;
  direccion: DireccionSitio;
}

export function PasoDominio({ subdominio, direccion }: PasoDominioProps) {
  const t = useTextosResumen();
  const hostGratis = direccion.hostEsPropio ? direccion.subdominioHost : direccion.host;

  const opcion = (icono: LucideIcon, titulo: string, descripcion: string, accion: 'conectar' | 'comprar', boton: string) => (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
      <CajaIcono icono={icono} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium leading-5 text-fg">{titulo}</p>
        <p className="text-[13px] leading-[18px] text-fg-secondary">{descripcion}</p>
      </div>
      <Link href={rutaDominios(accion)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
        {boton}
      </Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPaso paso="dominio" titulo={t('asistente.dominio.titulo')} descripcion={t('asistente.dominio.descripcion')} />

      {direccion.hostEsPropio && direccion.host && (
        <AvisoTonal
          tono="exito"
          icono={CircleCheck}
          titulo={t('asistente.dominio.propioTitulo', { host: direccion.host })}
          descripcion={t('asistente.dominio.propioDescripcion')}
        />
      )}

      <div role="group" aria-label={t('asistente.dominio.opciones')} className="flex flex-col gap-3">
        <div className={cn('flex flex-col gap-4 rounded-xl border p-4', direccion.hostEsPropio ? 'border-line bg-surface' : 'border-line-brand bg-brand-tint')}>
          <div className="flex items-start gap-3">
            <CajaIcono icono={ICONO_TAREA_SITIO.sitio} className={direccion.hostEsPropio ? undefined : 'bg-surface'} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm font-medium leading-5 text-brand-deep">{t('asistente.dominio.gratisTitulo')}</p>
              <p className="text-[13px] leading-[18px] text-fg-secondary">{t('asistente.dominio.gratisDescripcion', { host: hostGratis ?? '—' })}</p>
            </div>
            <Badge tono="exito" apariencia="suave" tamano="sm">
              {t('asistente.dominio.gratis')}
            </Badge>
          </div>
          <FormField etiqueta={t('asistente.dominio.subdominio')} ayuda={t('asistente.dominio.subdominioAyuda')}>
            {(campo) => (
              <div className="flex h-10 items-center overflow-hidden rounded-lg border border-line-strong bg-surface">
                <Input
                  id={campo.id}
                  aria-describedby={campo['aria-describedby']}
                  value={subdominio ?? ''}
                  readOnly
                  className="h-full flex-1 rounded-none border-0 bg-transparent focus-visible:ring-0"
                />
                <span className="border-l border-line px-3 text-sm text-fg-secondary">.goadmin.io</span>
              </div>
            )}
          </FormField>
        </div>
        {opcion(ICONO_TAREA_SITIO.dominio, t('asistente.dominio.conectarTitulo'), t('asistente.dominio.conectarDescripcion'), 'conectar', t('asistente.dominio.conectarBoton'))}
        {opcion(ShoppingCart, t('asistente.dominio.comprarTitulo'), t('asistente.dominio.comprarDescripcion'), 'comprar', t('asistente.dominio.comprarBoton'))}
      </div>

      <AvisoTonal tono="informacion" titulo={t('asistente.dominio.avisoTitulo')} descripcion={t('asistente.dominio.avisoDescripcion')} />
    </div>
  );
}
