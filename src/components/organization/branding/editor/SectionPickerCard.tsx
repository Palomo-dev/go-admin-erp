'use client';

import { cn } from '@/utils/Utils';

/**
 * Tarjeta del diálogo «Añadir sección» (Figma «SectionPickerCard» 1886:919238):
 * miniatura esquemática + nombre, y debajo los chips «Faltan datos»
 * (advertencia: la sección NO se bloquea) y «Recomendada».
 */

type Forma = 'portada' | 'lista' | 'carta' | 'tarjetas' | 'tarjetas3' | 'grilla' | 'formulario' | 'texto' | 'filas';

const FORMA_DE_TIPO: Record<string, Forma> = {
  hero: 'portada', cta: 'portada', countdown: 'portada', newsletter: 'portada', delivery_cta: 'portada',
  booking_cta: 'portada', demo_cta: 'portada', why_choose_us: 'portada', promo_banners: 'portada', booking_transport: 'portada',
  menu_full: 'carta', menu_preview: 'carta', services_list: 'carta',
  specialties: 'tarjetas', products_grid: 'tarjetas', featured_products: 'tarjetas', offers: 'tarjetas',
  membership_plans: 'tarjetas', pricing_table: 'tarjetas', parking_pricing: 'tarjetas', parking_pass_plans: 'tarjetas',
  related_products: 'tarjetas', category_products: 'tarjetas',
  chef_section: 'tarjetas3', team: 'tarjetas3', trainers: 'tarjetas3', testimonials: 'tarjetas3', partners: 'tarjetas3',
  brands: 'tarjetas3', integrations: 'tarjetas3', stats: 'tarjetas3',
  room_types: 'grilla', gallery: 'grilla', categories_grid: 'grilla', transformation: 'grilla', fleet_showcase: 'grilla',
  parking_zones: 'grilla', product_gallery: 'grilla', category_subcategories: 'grilla', features_grid: 'grilla',
  reservation_cta: 'formulario', contact_form: 'formulario', trip_search: 'formulario', product_actions: 'formulario',
  restaurant_hero: 'portada', marquee: 'texto', signature_dishes: 'tarjetas', chef_team: 'tarjetas3',
  gallery_bento: 'grilla', reservation: 'formulario', private_events: 'formulario', events: 'filas', hours_location: 'filas',
  class_schedule: 'filas', routes: 'filas', faq: 'filas', product_faq: 'filas', how_it_works: 'filas', parking_availability: 'filas',
};

function Bloque({ className }: { className: string }) {
  return <span aria-hidden className={cn('absolute block', className)} />;
}

/** Miniatura esquemática (Figma «SectionThumbnail» 1711:869974). */
export function SectionThumbnail({ tipo }: { tipo: string }) {
  const forma = FORMA_DE_TIPO[tipo] ?? 'texto';
  return (
    <span aria-hidden className="relative block h-24 w-full overflow-hidden rounded-lg bg-subtle">
      {forma === 'portada' && (
        <>
          <Bloque className="inset-0 bg-brand-tint" />
          <Bloque className="left-1/2 top-[30px] h-2 w-20 -translate-x-1/2 bg-fg-muted" />
          <Bloque className="left-1/2 top-[44px] h-1 w-[60px] -translate-x-1/2 bg-line-strong" />
          <Bloque className="left-1/2 top-[58px] h-3.5 w-12 -translate-x-1/2 rounded-md bg-brand" />
        </>
      )}
      {forma === 'lista' || forma === 'texto' ? (
        <>
          <Bloque className="left-4 top-4 h-2 w-[75%] bg-fg-muted" />
          <Bloque className="left-4 top-8 h-1 w-[70%] bg-line-strong" />
          <Bloque className="left-4 top-[42px] h-1 w-[74%] bg-line-strong" />
          <Bloque className="left-4 top-[52px] h-1 w-[60%] bg-line-strong" />
          <Bloque className="left-4 top-[62px] h-1 w-[66%] bg-line-strong" />
        </>
      ) : null}
      {forma === 'carta' &&
        [10, 38, 66].map((top) => (
          <span key={top}>
            <span aria-hidden className="absolute left-2.5 block h-[5px] w-[62%] bg-fg-muted" style={{ top: top + 3 }} />
            <span aria-hidden className="absolute left-2.5 block h-1 w-[40%] bg-line-strong" style={{ top: top + 12 }} />
            <span aria-hidden className="absolute right-2.5 block h-5 w-5 bg-line" style={{ top }} />
          </span>
        ))}
      {forma === 'tarjetas' &&
        [0, 1, 2, 3].map((i) => (
          <span key={i} aria-hidden className="absolute top-3.5 block h-[62px] w-[20%] bg-surface" style={{ left: `${5 + i * 23.5}%` }}>
            <span className="absolute left-[7%] top-[3%] block h-[48%] w-[86%] bg-line" />
            <span className="absolute left-[7%] top-[61%] block h-1 w-[66%] bg-fg-muted" />
            <span className="absolute left-[7%] top-[74%] block h-1 w-[46%] bg-brand" />
          </span>
        ))}
      {forma === 'tarjetas3' &&
        [0, 1, 2].map((i) => (
          <span key={i} aria-hidden className="absolute top-4 block h-16 w-[26%] bg-surface" style={{ left: `${5 + i * 31.5}%` }}>
            <span className="absolute left-1/2 top-2 block h-3 w-3 -translate-x-1/2 bg-line-strong" />
            <span className="absolute left-[15%] top-7 block h-1 w-[70%] bg-fg-muted" />
            <span className="absolute left-[15%] top-9 block h-1 w-[55%] bg-line-strong" />
          </span>
        ))}
      {forma === 'grilla' &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            aria-hidden
            className="absolute block h-9 w-[26%] bg-line"
            style={{ left: `${5 + (i % 3) * 31.5}%`, top: i < 3 ? 8 : 50 }}
          />
        ))}
      {forma === 'formulario' && (
        <>
          <Bloque className="left-2.5 top-3 h-2 w-[40%] bg-fg-muted" />
          <Bloque className="left-2.5 top-7 h-1 w-[30%] bg-line-strong" />
          <Bloque className="right-2.5 top-3 h-3.5 w-[38%] bg-surface" />
          <Bloque className="right-2.5 top-[34px] h-3.5 w-[38%] bg-surface" />
          <Bloque className="right-2.5 top-[56px] h-3.5 w-[38%] bg-surface" />
          <Bloque className="right-2.5 top-[76px] h-3.5 w-[38%] rounded-md bg-brand" />
        </>
      )}
      {forma === 'filas' &&
        [10, 38, 66].map((top) => (
          <span key={top}>
            <span aria-hidden className="absolute left-2.5 block h-5 w-5 bg-surface" style={{ top }} />
            <span aria-hidden className="absolute left-[25%] block h-[5px] w-[52%] bg-fg-muted" style={{ top: top + 3 }} />
            <span aria-hidden className="absolute left-[25%] block h-1 w-[37%] bg-line-strong" style={{ top: top + 12 }} />
          </span>
        ))}
    </span>
  );
}

export interface SectionPickerCardProps {
  tipo: string;
  etiqueta: string;
  descripcion?: string;
  seleccionada: boolean;
  faltanDatos?: boolean;
  recomendada?: boolean;
  onSeleccionar: () => void;
  /** Doble clic o Enter sobre la tarjeta ya elegida: añade sin pasar por el pie. */
  onConfirmar?: () => void;
  className?: string;
}

export function SectionPickerCard({
  tipo,
  etiqueta,
  descripcion,
  seleccionada,
  faltanDatos,
  recomendada,
  onSeleccionar,
  onConfirmar,
  className,
}: SectionPickerCardProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <button
        type="button"
        aria-pressed={seleccionada}
        title={descripcion}
        onClick={onSeleccionar}
        onDoubleClick={() => onConfirmar?.()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && seleccionada && onConfirmar) {
            e.preventDefault();
            onConfirmar();
          }
        }}
        className={cn(
          'flex w-full flex-col gap-2 rounded-xl p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          seleccionada
            ? 'border-2 border-brand bg-brand-tint p-[7px]'
            : 'border border-line bg-surface hover:border-line-strong hover:bg-hover',
        )}
      >
        <SectionThumbnail tipo={tipo} />
        <span className={cn('block truncate text-[13px] leading-[18px]', seleccionada ? 'text-brand-deep' : 'text-fg')}>
          {etiqueta}
        </span>
      </button>
      <span className="flex min-h-[22px] flex-wrap gap-1">
        {faltanDatos ? (
          <span className="inline-flex items-center rounded-full border border-line-warning bg-warning-subtle px-1.5 py-0.5 text-xs font-semibold text-warning-text">
            Faltan datos
          </span>
        ) : null}
        {recomendada ? (
          <span className="inline-flex items-center rounded-full border border-line-brand bg-brand-tint px-1.5 py-0.5 text-xs font-semibold text-brand-deep">
            Recomendada
          </span>
        ) : null}
      </span>
    </div>
  );
}
