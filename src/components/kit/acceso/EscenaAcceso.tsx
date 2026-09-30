'use client';

/**
 * Escena de todas las pantallas de acceso (Figma `EscenaAcceso` 1129:36409,
 * docs/design/AUTH-ACCESO-V2.md §11): el cielo del viajero a pantalla completa,
 * la firma arriba a la izquierda, idioma y tema arriba a la derecha, la marca
 * con lema y viñetas (escritorio), el viajero abajo a la izquierda y el pie con
 * Términos, Privacidad y Ayuda. La tarjeta (`TarjetaAcceso`) va como hijo,
 * centrada.
 *
 * Día y noche siguen al TEMA (decisión v2-2): claro = cielo Azul GO con nubes,
 * planeta y cohete y el viajero de pie; oscuro = cielo tinta con luna y
 * estrellas y el viajero sentado. Los colores salen de las variables `auth/*`
 * (tokens.css); lo único que depende de la clase `dark` es QUÉ piezas se pintan
 * (`dark:hidden` / `hidden dark:block`), no su color.
 *
 * Reemplaza a `AuthSceneBackground` (decisión v2-3). Quieta en móvil y con
 * `prefers-reduced-motion`.
 *
 * Dispositivos (los mismos cortes que el Figma):
 *  - escritorio ≥ 1280: marca con lema y viñetas + viajero de 280;
 *  - tableta 768-1279: sin lema (decisión §11.5-3), viajero de 180;
 *  - móvil < 768: firma y píldora arriba, viajero pequeño abajo al centro.
 */
import * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Firma } from '@/components/shell/marca/Firma';
import { cn } from '@/utils/Utils';
import { PreferenciasAcceso } from './PreferenciasAcceso';
import { Enlace } from './piezas';
import { Cohete, EstrellaTrazo, Luna, Nube, Planeta, ViajeroDePie, ViajeroSentado } from './ilustraciones';
import { ESTRELLAS_DIA, ESTRELLAS_NOCHE, ESTRELLAS_TRAZO, NUBES, enPorcentaje } from './cieloDatos';

/** Movimiento de la escena. Inline para no depender de CSS global ni de módulos (los tests renderizan sin bundler). */
const ESTILOS = `
@keyframes ga-escena-deriva { 0%,100% { transform: translateX(0); } 50% { transform: translateX(18px); } }
@keyframes ga-escena-flota { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
@keyframes ga-escena-titila { 0%,100% { opacity: .72; } 50% { opacity: .25; } }
@keyframes ga-escena-ondea { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-1.5deg); } }
.ga-escena-nube { animation: ga-escena-deriva 26s ease-in-out infinite; }
.ga-escena-flota { animation: ga-escena-flota 8s ease-in-out infinite; }
.ga-escena-titila { animation: ga-escena-titila 3.6s ease-in-out infinite; }
.ga-escena-ondea { animation: ga-escena-ondea 4s ease-in-out infinite; transform-origin: 50% 90%; }
@media (max-width: 767px), (prefers-reduced-motion: reduce) {
  .ga-escena-nube, .ga-escena-flota, .ga-escena-titila, .ga-escena-ondea { animation: none; }
}
`;

function Cielo() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Día */}
      <div className="absolute inset-0 dark:hidden">
        {ESTRELLAS_DIA.map((p, i) => (
          <span key={i} className="absolute rounded-full bg-auth-estrella/40" style={{ ...enPorcentaje(p), width: p[2], height: p[2] }} />
        ))}
        {NUBES.map((p, i) => (
          <span
            key={i}
            className={cn('ga-escena-nube absolute opacity-35', i > 3 && 'hidden md:block')}
            style={{ ...enPorcentaje(p), width: p[2], animationDelay: `${i * -4}s` }}
          >
            <Nube className="w-full" />
          </span>
        ))}
        <span className="ga-escena-flota absolute right-[4%] top-[150px] hidden w-[150px] md:block">
          <Planeta className="w-full" />
        </span>
        <span className="absolute bottom-[110px] right-[4%] hidden w-[54px] md:block">
          <Cohete className="w-full" />
        </span>
      </div>
      {/* Noche */}
      <div className="absolute inset-0 hidden dark:block">
        {ESTRELLAS_NOCHE.map((p, i) => (
          <span
            key={i}
            className={cn('absolute rounded-full bg-auth-estrella/70', i % 5 === 0 && 'ga-escena-titila')}
            style={{ ...enPorcentaje(p), width: Math.max(p[2], 1.5), height: Math.max(p[2], 1.5), animationDelay: `${(i % 7) * -0.5}s` }}
          />
        ))}
        {ESTRELLAS_TRAZO.map((p, i) => (
          <span key={i} className="absolute hidden md:block" style={{ ...enPorcentaje(p), width: p[2] }}>
            <EstrellaTrazo className="w-full" />
          </span>
        ))}
        <span className="absolute right-[4.5%] top-[188px] hidden w-[96px] md:block">
          <Luna className="w-full" />
        </span>
      </div>
    </div>
  );
}

export interface EscenaAccesoProps {
  children: React.ReactNode;
  /** Marca con lema y viñetas (solo escritorio). `false` en el paso de planes. */
  mostrarMarca?: boolean;
  /** Viajero. `false` en el paso de planes (la tarjeta de 1000 ocupa el ancho). */
  mostrarViajero?: boolean;
  /** Cambia el lema (p. ej. en el registro). */
  lema?: string;
  descripcion?: string;
}

export function EscenaAcceso({ children, mostrarMarca = true, mostrarViajero = true, lema, descripcion }: EscenaAccesoProps) {
  const t = useTranslations('acceso.escena');
  const anio = new Date().getFullYear();
  return (
    // Scroll propio: `html` y `body` tienen `overflow: hidden` (globals.css), así
    // que sin este contenedor la escena no bajaba en móvil (registro, términos…).
    <div className="h-dvh overflow-y-auto overscroll-contain">
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-hidden bg-gradient-to-b from-auth-cielo-alto via-auth-cielo-medio via-55% to-auth-cielo-bajo text-fg">
      <style>{ESTILOS}</style>
      <Cielo />

      {/* Firma y preferencias */}
      <div className="flex items-center justify-between px-4 pt-4 md:px-10 md:pt-8 xl:px-14">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={t('inicio')}>
          <Firma invertido tamano={32} className="hidden md:inline-flex" />
          <Firma invertido className="md:hidden" />
        </Link>
        <PreferenciasAcceso />
      </div>

      {/* Marca (escritorio) */}
      {mostrarMarca && (
        <aside className="pointer-events-none absolute left-14 top-[150px] hidden w-[360px] text-white xl:block" aria-label={t('marcaEtiqueta')}>
          <p className="text-[28px] font-semibold leading-9 tracking-[-0.01em]">{lema ?? t('lema')}</p>
          <p className="mt-4 text-sm leading-5 text-white/85">{descripcion ?? t('descripcion')}</p>
          <ul className="mt-5 space-y-3 text-[13px] leading-5 text-white/90">
            {(['vinetaModulos', 'vinetaSucursales', 'vinetaReportes'] as const).map((clave) => (
              <li key={clave} className="flex items-start gap-3">
                <span className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
                <span>{t(clave)}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* Viajero */}
      {mostrarViajero && (
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[72px] left-6 hidden w-[180px] md:block xl:bottom-[72px] xl:left-24 xl:w-[280px]">
          <ViajeroDePie className="ga-escena-ondea w-full dark:hidden" />
          <ViajeroSentado className="hidden w-full dark:block" />
        </div>
      )}

      {/* Tarjeta */}
      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-8 pt-8 md:items-center md:px-6 md:pb-16 md:pt-10">
        {children}
      </main>

      {/* Viajero en móvil: pequeño, al centro, sobre el pie */}
      {mostrarViajero && (
        <div aria-hidden="true" className="pointer-events-none mx-auto w-[89px] md:hidden">
          <ViajeroDePie className="w-full dark:hidden" />
          <ViajeroSentado className="hidden w-full dark:block" />
        </div>
      )}

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pb-5 pt-2 text-[13px] text-white/85">
        <span>{t('derechos', { anio })}</span>
        <Enlace href="/terminos" tono="sobre-color">{t('terminos')}</Enlace>
        <Enlace href="/privacy" tono="sobre-color">{t('privacidad')}</Enlace>
        <Enlace href="mailto:soporte@goadmin.io" tono="sobre-color">{t('ayuda')}</Enlace>
      </footer>
    </div>
    </div>
  );
}
