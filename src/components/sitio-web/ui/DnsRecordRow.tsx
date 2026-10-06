'use client';

import { useState } from 'react';
import { cn } from '@/utils/Utils';
import { clasesBoton } from '@/components/kit';
import { CLASE_TAMANO_ICONO, ICONO_ACCION_SITIO, ICONO_ESTADO_DNS, TRAZO_ICONO } from './iconosSitio';
import { useTextosComun } from './textos';

/**
 * Registro DNS que la persona debe crear en su proveedor (Figma B/02; Conectar
 * dominio B/07-07 y detalle B/07-21). Tipo (A, CNAME, TXT), nombre y valor con
 * «Copiar», y el estado de la verificación: Pendiente · Correcto · «Encontramos
 * <valor>» · Aún no aparece · Solo si lo pide.
 *
 * - `fila`: escritorio, todo en una línea.
 * - `tarjeta`: móvil, apilado, con «Copiar valor» a lo ancho.
 */
export type EstadoRegistroDns = 'pendiente' | 'correcto' | 'otro_valor' | 'no_aparece' | 'opcional';

export interface DnsRecordRowProps {
  tipo: string;
  nombre: string;
  valor: string;
  estado?: EstadoRegistroDns;
  /** Valor encontrado cuando `estado='otro_valor'`. */
  valorEncontrado?: string | null;
  variante?: 'fila' | 'tarjeta';
  className?: string;
}

const CLASE_ESTADO: Record<EstadoRegistroDns, string> = {
  pendiente: 'text-fg-secondary',
  correcto: 'text-success-text',
  otro_valor: 'text-danger-text',
  no_aparece: 'text-warning-text',
  opcional: 'text-fg-secondary',
};

function textoEstado(estado: EstadoRegistroDns, valorEncontrado: string | null | undefined, tx: ReturnType<typeof useTextosComun>): string {
  switch (estado) {
    case 'correcto':
      return tx('dns.correcto');
    case 'otro_valor':
      return valorEncontrado ? tx('dns.otroValor', { valor: valorEncontrado }) : tx('dns.otroValorSinDato');
    case 'no_aparece':
      return tx('dns.aunNoAparece');
    case 'opcional':
      return tx('dns.soloSiLoPide');
    default:
      return tx('dns.pendiente');
  }
}

export function DnsRecordRow({ tipo, nombre, valor, estado = 'pendiente', valorEncontrado, variante = 'fila', className }: DnsRecordRowProps) {
  const tx = useTextosComun();
  const [copiado, setCopiado] = useState<'ok' | 'error' | null>(null);
  const IconoEstado = ICONO_ESTADO_DNS[estado];
  const IconoCopiar = copiado === 'ok' ? ICONO_ACCION_SITIO.copiado : ICONO_ACCION_SITIO.copiar;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado('ok');
    } catch {
      setCopiado('error');
    }
    setTimeout(() => setCopiado(null), 2000);
  };

  const botonCopiar = (
    <button
      type="button"
      onClick={() => void copiar()}
      aria-label={`${variante === 'tarjeta' ? tx('dns.copiarValor') : tx('dns.copiar')} ${valor}`}
      className={clasesBoton({ variante: 'secundario', tamano: 'sm', anchoCompleto: variante === 'tarjeta' })}
    >
      <IconoCopiar aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
      {copiado === 'ok' ? tx('dns.copiado') : copiado === 'error' ? tx('dns.noSePudoCopiar') : variante === 'tarjeta' ? tx('dns.copiarValor') : tx('dns.copiar')}
    </button>
  );

  const etiquetaEstado = (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium', CLASE_ESTADO[estado])}>
      <IconoEstado aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0')} strokeWidth={TRAZO_ICONO} />
      {textoEstado(estado, valorEncontrado, tx)}
    </span>
  );

  const chipTipo = (
    <span className="inline-flex h-6 min-w-8 items-center justify-center rounded-md bg-subtle px-1.5 font-mono text-xs font-semibold text-fg">
      {tipo}
    </span>
  );

  if (variante === 'tarjeta') {
    return (
      <div className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)}>
        <div className="flex items-center justify-between gap-2">
          {chipTipo}
          {etiquetaEstado}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-fg-secondary">{tx('dns.nombre')}</dt>
          <dd className="break-all font-mono text-fg">{nombre}</dd>
          <dt className="text-fg-secondary">{tx('dns.valor')}</dt>
          <dd className="break-all font-mono text-fg">{valor}</dd>
        </dl>
        {botonCopiar}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0', className)}>
      <span className="w-12 shrink-0" aria-label={`${tx('dns.tipo')} ${tipo}`}>
        {chipTipo}
      </span>
      <div className="flex w-28 shrink-0 flex-col">
        <span className="text-xs text-fg-muted">{tx('dns.nombre')}</span>
        <span className="truncate font-mono text-sm text-fg">{nombre}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-fg-muted">{tx('dns.valor')}</span>
        <span className="truncate font-mono text-sm text-fg" title={valor}>
          {valor}
        </span>
      </div>
      {botonCopiar}
      <span className="w-48 shrink-0">{etiquetaEstado}</span>
    </div>
  );
}
