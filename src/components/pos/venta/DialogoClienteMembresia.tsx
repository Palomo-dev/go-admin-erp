'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, UserCheck } from 'lucide-react';
import { Dialogo } from '@/components/kit';
import { CustomerSelector } from '@/components/pos/CustomerSelector';
import type { Customer } from '@/components/pos/types';

/**
 * Frame D1 (`986:616652`, docs/design/MEMBRESIAS-FASE-1-2.md §4 «Cliente
 * obligatorio»): se agregó una membresía a un carrito sin cliente. El producto
 * YA está en el carrito; aquí se elige el titular con el selector de clientes
 * del POS (el mismo `CustomerPicker` del F2, que permite crear el cliente).
 *
 * - «Asignar y agregar»: asigna el cliente elegido al carrito.
 * - «Quitar la membresía»: saca del carrito la línea recién agregada.
 * - «Después» / Esc / ×: la membresía queda en el carrito y «Cobrar» queda
 *   bloqueado con el motivo (`sin-cliente`) hasta que haya cliente.
 *
 * Solo dibuja: asignar y quitar los hace la página con `POSService`.
 */
export interface DialogoClienteMembresiaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Nombre del producto membresía recién agregado. */
  producto: string;
  onAsignar: (cliente: Customer) => Promise<void>;
  onQuitar: () => Promise<void>;
}

export function DialogoClienteMembresia({ abierto, onAbiertoChange, producto, onAsignar, onQuitar }: DialogoClienteMembresiaProps) {
  const t = useTranslations('membresias.pos.dialogo');
  const [elegido, setElegido] = useState<Customer | undefined>();
  const [listaAbierta, setListaAbierta] = useState(false);
  const [ocupado, setOcupado] = useState<'asignar' | 'quitar' | null>(null);

  // Cada apertura empieza sin cliente elegido.
  useEffect(() => {
    if (!abierto) {
      setElegido(undefined);
      setListaAbierta(false);
      setOcupado(null);
    }
  }, [abierto]);

  const ejecutar = async (accion: 'asignar' | 'quitar', fn: () => Promise<void>) => {
    setOcupado(accion);
    try {
      await fn();
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => {
        if (!ocupado) onAbiertoChange(v);
      }}
      icono={UserCheck}
      titulo={t('titulo')}
      descripcion={t('descripcion', { producto })}
      ancho={560}
      textoCancelar={t('despues')}
      pie={t('pie')}
      secundarios={[
        {
          etiqueta: t('quitar'),
          onClick: () => void ejecutar('quitar', onQuitar),
          cargando: ocupado === 'quitar',
          deshabilitada: ocupado === 'asignar',
        },
      ]}
      primario={{
        etiqueta: t('asignar'),
        onClick: () => {
          if (elegido) void ejecutar('asignar', () => onAsignar(elegido));
        },
        cargando: ocupado === 'asignar',
        deshabilitada: !elegido || ocupado === 'quitar',
        motivo: !elegido ? t('motivoAsignar') : undefined,
      }}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-fg">{t('etiquetaCliente')}</p>
        <CustomerSelector
          selectedCustomer={elegido}
          onCustomerSelect={(cliente) => setElegido(cliente)}
          open={listaAbierta}
          onOpenChange={setListaAbierta}
        />
      </div>
      <p
        className="flex items-start gap-2 rounded-lg border border-line-brand bg-brand-tint px-3 py-2.5 text-[13px] leading-5 text-brand-deep"
      >
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        <span>{t('avisoRenovacion')}</span>
      </p>
    </Dialogo>
  );
}
