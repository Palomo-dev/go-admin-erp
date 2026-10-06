'use client';

/**
 * Héroe de «primera vez» del Resumen (Figma A/02b escritorio, A/02g móvil):
 * «Tu sitio está a 6 pasos de estar en línea», «Empezar configuración» (o
 * «Seguir donde ibas» si el asistente tiene avance guardado), «Ver plantillas»
 * y las plantillas recomendadas para el giro (tres en escritorio, una en móvil).
 * Elegir una lleva al asistente en el paso 2 con esa plantilla preseleccionada.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { TemplateCard } from '../ui/TemplateCard';
import { CajaIcono } from '../ui/CajaIcono';
import { CLASE_TAMANO_ICONO, ICONO_ESTADO_PUBLICACION, ICONO_TAREA_SITIO, TRAZO_ICONO } from '../ui/iconosSitio';
import { PASOS_ASISTENTE, type GiroSitio } from '@/lib/website/onboardingSitio';
import { iconoPasoAsistente } from './asistente/pasosConIcono';
import { RUTA_ASISTENTE } from '@/lib/website/resumenSitio';
import { RAIZ_SITIO_WEB } from '../rutasSitioWeb';
import { plantillasDelGiro } from './asistente/catalogoAsistente';
import { MiniaturaSitio } from './MiniaturaSitio';
import { useTextosResumen } from './textos';

export interface HeroPrimeraVezProps {
  giro: GiroSitio;
  /** Paso guardado del asistente (`onboarding.pasoActual`); `null` si no empezó. */
  pasoGuardado: number | null;
  puedeEditar: boolean;
}

export function rutaAsistente(paso?: number | null, plantilla?: string | null): string {
  const q = new URLSearchParams();
  if (paso && paso > 1) q.set('paso', String(paso));
  if (plantilla) q.set('plantilla', plantilla);
  const s = q.toString();
  return s ? `${RUTA_ASISTENTE}?${s}` : RUTA_ASISTENTE;
}

export function HeroPrimeraVez({ giro, pasoGuardado, puedeEditar }: HeroPrimeraVezProps) {
  const t = useTextosResumen();
  const router = useRouter();
  const recomendadas = plantillasDelGiro(giro).slice(0, 3);
  const seguir = !!pasoGuardado && pasoGuardado > 1;
  const textoPrimario = seguir ? t('resumen.primeraVez.seguir') : t('resumen.primeraVez.empezar');

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="hero-primera-vez"
        className="flex flex-col gap-6 rounded-xl border border-line-brand bg-brand-tint p-5 lg:flex-row lg:items-center lg:p-6"
      >
        <div className="flex flex-col gap-4 lg:w-[340px] lg:shrink-0">
          <CajaIcono icono={ICONO_TAREA_SITIO.sitio} className="bg-surface" />
          <h2 id="hero-primera-vez" className="text-2xl font-semibold leading-8 text-fg">
            {t('resumen.primeraVez.titulo')}
          </h2>
          <p className="hidden text-sm leading-5 text-fg-secondary lg:block">{t('resumen.primeraVez.descripcion')}</p>
          <p className="text-sm leading-5 text-fg-secondary lg:hidden">{t('resumen.primeraVez.descripcionMovil')}</p>
          {/* Los 6 pasos con su icono: «6 pasos» se ve antes de leerse. Un paso
              hecho cambia su icono por el check (no solo el color) y lo dice al
              lector de pantalla; el paso en curso lleva aria-current. */}
          <ol aria-label={t('asistente.etiquetaStepper')} className="flex flex-wrap gap-x-3 gap-y-1.5">
            {PASOS_ASISTENTE.map((p, i) => {
              const hecho = !!pasoGuardado && i + 1 < pasoGuardado;
              const enCurso = !!pasoGuardado && i + 1 === pasoGuardado;
              const Icono = hecho ? ICONO_ESTADO_PUBLICACION.publicado : iconoPasoAsistente(p);
              return (
                <li
                  key={p}
                  data-hecho={hecho || undefined}
                  aria-current={enCurso ? 'step' : undefined}
                  className={cn('inline-flex items-center gap-1 text-xs font-medium leading-4', hecho || enCurso ? 'text-fg' : 'text-fg-secondary')}
                >
                  <Icono
                    aria-hidden="true"
                    className={cn(CLASE_TAMANO_ICONO.meta, 'shrink-0', hecho && 'text-success-text', enCurso && 'text-brand-deep')}
                    strokeWidth={TRAZO_ICONO}
                  />
                  {t(`asistente.pasos.${p}`)}
                  {hecho && <span className="sr-only">{` (${t('resumen.primeraVez.pasoHecho')})`}</span>}
                </li>
              );
            })}
          </ol>
          {seguir && <p className="text-[13px] font-medium text-brand-deep">{t('resumen.primeraVez.seguirPaso', { n: pasoGuardado ?? 1 })}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            {puedeEditar && (
              <Link href={rutaAsistente(pasoGuardado)} className={cn(clasesBoton({ variante: 'primario', tamano: 'md' }), 'w-full sm:w-auto')}>
                {textoPrimario}
              </Link>
            )}
            <Link href={`${RAIZ_SITIO_WEB}/plantillas`} className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'hidden sm:inline-flex')}>
              {t('resumen.primeraVez.verPlantillas')}
            </Link>
          </div>
          <p className="hidden text-xs leading-4 text-fg-secondary lg:block">{t('resumen.primeraVez.pie')}</p>
          <p className="text-xs leading-4 text-fg-secondary lg:hidden">{t('resumen.primeraVez.pieMovil')}</p>
        </div>
        {recomendadas.length > 0 && (
          <div className="hidden min-w-0 flex-1 grid-cols-3 gap-3 lg:grid" aria-label={t('resumen.primeraVez.recomendadas')} role="group">
            {recomendadas.map((p) => (
              <TemplateCard
                key={p.id}
                nombre={p.nombre}
                descripcion={p.descripcion}
                giro={t(`asistente.giro.giros.${p.giro}`)}
                miniatura={<MiniaturaSitio tema={p.tema} />}
                onSeleccionar={puedeEditar ? () => router.push(rutaAsistente(2, p.id)) : undefined}
              />
            ))}
          </div>
        )}
      </section>
      {recomendadas[0] && (
        <div className="lg:hidden">
          <TemplateCard
            nombre={recomendadas[0].nombre}
            descripcion={recomendadas[0].descripcion}
            giro={t(`asistente.giro.giros.${recomendadas[0].giro}`)}
            miniatura={<MiniaturaSitio tema={recomendadas[0].tema} />}
            onSeleccionar={puedeEditar ? () => router.push(rutaAsistente(2, recomendadas[0].id)) : undefined}
          />
        </div>
      )}
    </div>
  );
}
