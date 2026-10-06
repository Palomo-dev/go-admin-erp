'use client';

import { ChevronDown, Globe, Mail, Menu, Phone, Search, ShoppingBag, User } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { DisposicionEncabezado } from './HeaderLayoutThumb';
import { estilosTema, TEMA_VISTA_RESPALDO, type TemaVistaSitio } from './temaVistaSitio';
import { useTextosComun } from './textos';

/**
 * Vista del encabezado del sitio con sus datos reales (Figma D/02
 * SiteHeaderPreview; Diseño › Encabezado y pie D/06, editor D/05-14/21): barra
 * superior (teléfono, mensaje, correo), logo y nombre, enlaces del menú
 * «Encabezado», iconos (buscar, carrito, cuenta, idioma) y el botón principal,
 * en las cinco disposiciones y en celular. Pinta con el tema del sitio (dato),
 * nunca con el del ERP. Es decorativa para el lector de pantalla: lleva un
 * resumen en `aria-label`.
 */
export interface EnlaceVista {
  etiqueta: string;
  tieneSubmenu?: boolean;
  activo?: boolean;
}

export interface SiteHeaderPreviewProps {
  disposicion: DisposicionEncabezado;
  marca: { nombre: string; logoUrl?: string | null };
  enlaces: readonly EnlaceVista[];
  /** Barra superior; sin ella no se pinta. */
  barraSuperior?: { telefono?: string | null; mensaje?: string | null; correo?: string | null } | null;
  iconos?: { buscar?: boolean; carrito?: boolean; cuenta?: boolean; idioma?: boolean };
  /** Texto del botón principal; `null` lo oculta. Por defecto «Reservar». */
  textoBoton?: string | null;
  tema?: TemaVistaSitio;
  celular?: boolean;
  className?: string;
}

export function SiteHeaderPreview({
  disposicion,
  marca,
  enlaces,
  barraSuperior,
  iconos = { buscar: true, carrito: true, cuenta: true },
  textoBoton,
  tema = TEMA_VISTA_RESPALDO,
  celular,
  className,
}: SiteHeaderPreviewProps) {
  const tx = useTextosComun();
  const e = estilosTema(tema);
  const boton = textoBoton === null ? null : textoBoton ?? tx('sitio.reservar');

  const Marca = (
    <span className="flex items-center gap-2">
      {marca.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo del cliente en una vista previa a escala
        <img src={marca.logoUrl} alt="" className="size-6 rounded object-contain" />
      ) : (
        <span className="flex size-6 items-center justify-center rounded text-[11px] font-semibold" style={e.logo}>
          {marca.nombre.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-semibold" style={e.titulo}>
        {marca.nombre}
      </span>
    </span>
  );
  const Enlaces = ({ lista = enlaces }: { lista?: readonly EnlaceVista[] }) => (
    <span className="flex items-center gap-4 text-xs">
      {lista.map((l) => (
        <span key={l.etiqueta} className="inline-flex items-center gap-0.5" style={l.activo ? undefined : e.suave}>
          {l.etiqueta}
          {l.tieneSubmenu && <ChevronDown className="size-3" strokeWidth={1.5} />}
        </span>
      ))}
    </span>
  );
  const Iconos = () => (
    <span className="flex items-center gap-3">
      {iconos.buscar && <Search className="size-4" strokeWidth={1.5} />}
      {iconos.idioma && <Globe className="size-4" strokeWidth={1.5} />}
      {iconos.carrito && <ShoppingBag className="size-4" strokeWidth={1.5} />}
      {iconos.cuenta && <User className="size-4" strokeWidth={1.5} />}
    </span>
  );
  const Boton = () =>
    boton ? (
      <span className="px-3 py-1.5 text-xs font-medium" style={e.boton}>
        {boton}
      </span>
    ) : null;

  const barra = barraSuperior && (barraSuperior.telefono || barraSuperior.mensaje || barraSuperior.correo) && (
    <div className={cn('flex items-center gap-4 px-5 py-1.5 text-[11px]', celular ? 'justify-center' : 'justify-between')} style={e.secundario}>
      {!celular && barraSuperior.telefono ? (
        <span className="inline-flex items-center gap-1.5" style={e.suave}>
          <Phone className="size-3" strokeWidth={1.5} />
          {barraSuperior.telefono}
        </span>
      ) : !celular ? (
        <span />
      ) : null}
      {barraSuperior.mensaje && <span className="font-medium">{barraSuperior.mensaje}</span>}
      {!celular && barraSuperior.correo ? (
        <span className="inline-flex items-center gap-1.5" style={e.suave}>
          <Mail className="size-3" strokeWidth={1.5} />
          {barraSuperior.correo}
        </span>
      ) : !celular ? (
        <span />
      ) : null}
    </div>
  );

  let cuerpo;
  if (celular) {
    cuerpo = (
      <div className="flex items-center justify-between px-4 py-3">
        <Menu className="size-4" strokeWidth={1.5} />
        {Marca}
        <span className="flex items-center gap-3">
          {iconos.buscar && <Search className="size-4" strokeWidth={1.5} />}
          {iconos.carrito && <ShoppingBag className="size-4" strokeWidth={1.5} />}
        </span>
      </div>
    );
  } else if (disposicion === 'logo_centrado') {
    cuerpo = (
      <>
        <div className="grid grid-cols-3 items-center px-5 py-3">
          <span>{iconos.buscar && <Search className="size-4" strokeWidth={1.5} />}</span>
          <span className="justify-self-center">{Marca}</span>
          <span className="flex items-center justify-self-end gap-3">
            {iconos.carrito && <ShoppingBag className="size-4" strokeWidth={1.5} />}
            {iconos.cuenta && <User className="size-4" strokeWidth={1.5} />}
            <Boton />
          </span>
        </div>
        <div className="flex justify-center border-t py-2" style={e.linea}>
          <Enlaces />
        </div>
      </>
    );
  } else if (disposicion === 'dividido') {
    const mitad = Math.ceil(enlaces.length / 2);
    cuerpo = (
      <div className="grid grid-cols-3 items-center px-5 py-3">
        <Enlaces lista={enlaces.slice(0, mitad)} />
        <span className="justify-self-center">{Marca}</span>
        <span className="flex items-center justify-self-end gap-3">
          <Enlaces lista={enlaces.slice(mitad)} />
          {iconos.buscar && <Search className="size-4" strokeWidth={1.5} />}
          {iconos.carrito && <ShoppingBag className="size-4" strokeWidth={1.5} />}
          <Boton />
        </span>
      </div>
    );
  } else if (disposicion === 'minimo') {
    cuerpo = (
      <div className="flex items-center justify-between px-5 py-3">
        {Marca}
        <span className="flex items-center gap-3">
          {iconos.buscar && <Search className="size-4" strokeWidth={1.5} />}
          {iconos.carrito && <ShoppingBag className="size-4" strokeWidth={1.5} />}
          <Boton />
          <Menu className="size-4" strokeWidth={1.5} />
        </span>
      </div>
    );
  } else if (disposicion === 'megamenu') {
    cuerpo = (
      <>
        <div className="flex items-center gap-4 px-5 py-3">
          {Marca}
          <Iconos />
          <Boton />
        </div>
        <div className="px-5 py-2" style={e.secundario}>
          <Enlaces />
        </div>
      </>
    );
  } else {
    cuerpo = (
      <div className="flex items-center justify-between px-5 py-3">
        {Marca}
        <Enlaces />
        <span className="flex items-center gap-3">
          <Iconos />
          <Boton />
        </span>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`${marca.nombre} · ${enlaces.map((l) => l.etiqueta).join(', ')}`}
      className={cn('w-full overflow-hidden rounded-lg border border-line', className)}
      style={e.base}
    >
      <div aria-hidden="true">
        {barra}
        {cuerpo}
      </div>
    </div>
  );
}
