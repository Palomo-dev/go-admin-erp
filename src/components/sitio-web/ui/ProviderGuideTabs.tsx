'use client';

import { useId, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion } from '@/components/kit';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from './iconosSitio';
import { useListaComun, useTextosComun } from './textos';

/**
 * Guía por proveedor para crear los registros DNS (Figma B/02; Conectar
 * dominio B/07-07): GoDaddy, Hostinger, Cloudflare, Namecheap y «Otro
 * proveedor», cuatro pasos numerados y «Ver guía con capturas en …».
 *
 * Los nombres de proveedor son marcas de terceros que la persona busca tal
 * cual; los pasos salen de `sitioWeb.comun.guia.pasos.<proveedor>`.
 */
export type ProveedorDns = 'godaddy' | 'hostinger' | 'cloudflare' | 'namecheap' | 'otro';

export const PROVEEDORES_DNS: readonly ProveedorDns[] = ['godaddy', 'hostinger', 'cloudflare', 'namecheap', 'otro'];

const NOMBRE_PROVEEDOR: Record<Exclude<ProveedorDns, 'otro'>, string> = {
  godaddy: 'GoDaddy',
  hostinger: 'Hostinger',
  cloudflare: 'Cloudflare',
  namecheap: 'Namecheap',
};

export interface ProviderGuideTabsProps {
  /** Proveedor inicial (si se detectó por los nameservers). */
  proveedorInicial?: ProveedorDns;
  /** Enlaces a las guías con capturas, por proveedor (docs de ayuda). Sin enlace no se pinta la línea. */
  enlacesGuia?: Partial<Record<ProveedorDns, string>>;
  className?: string;
}

export function ProviderGuideTabs({ proveedorInicial = 'godaddy', enlacesGuia, className }: ProviderGuideTabsProps) {
  const tx = useTextosComun();
  const lista = useListaComun();
  const id = useId();
  const [proveedor, setProveedor] = useState<ProveedorDns>(proveedorInicial);
  const nombre = (p: ProveedorDns) => (p === 'otro' ? tx('guia.otro') : NOMBRE_PROVEEDOR[p]);
  const pasos = lista(`guia.pasos.${proveedor}`);
  const enlace = enlacesGuia?.[proveedor];

  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)}>
      <ChipsOpcion
        etiqueta={tx('guia.proveedores')}
        opciones={PROVEEDORES_DNS.map((p) => ({ valor: p, etiqueta: nombre(p) }))}
        valor={proveedor}
        onValorChange={setProveedor}
      />
      <ol id={`${id}-pasos`} aria-live="polite" className="flex flex-col gap-2">
        {pasos.map((paso, i) => (
          <li key={`${proveedor}-${i}`} className="flex items-start gap-2 text-[13px] leading-[18px] text-fg">
            <span
              aria-hidden="true"
              className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-tint text-[11px] font-semibold tabular-nums text-brand-deep"
            >
              {i + 1}
            </span>
            <span className="min-w-0">{paso}</span>
          </li>
        ))}
      </ol>
      {enlace && (
        <a
          href={enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start rounded-md text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {tx('guia.verGuia', { proveedor: nombre(proveedor) })}
        </a>
      )}
    </div>
  );
}
