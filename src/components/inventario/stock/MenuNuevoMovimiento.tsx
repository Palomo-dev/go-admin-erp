'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, ClipboardCheck, PackageOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PermisosInventario } from '@/lib/inventario/nucleo/tipos';
import { rutaAjustePorConteo, rutaTransferencia } from '../productos/detalle/inventario/stock/logicaInventario';

/**
 * «Nuevo movimiento» (Figma 584:282222): entrada, salida, ajuste por conteo (B2),
 * traslado (B3) y recibir una orden de compra. Cada opción solo aparece con su
 * permiso; la RPC vuelve a exigirlo.
 */
export interface MenuNuevoMovimientoProps {
  permisos: PermisosInventario;
  sucursalId: number | null;
  onEntrada: () => void;
  onSalida: () => void;
  /** Botón de solo icono (cabecera móvil). */
  compacto?: boolean;
}

export function MenuNuevoMovimiento({ permisos, sucursalId, onEntrada, onSalida, compacto }: MenuNuevoMovimientoProps) {
  const t = useTranslations('inventarioStock.nuevoMovimiento');
  const hayAlgo = permisos.ajustar || permisos.trasladar || permisos.recibir;
  if (!hayAlgo) return null;

  const Opcion = ({ icono: Icono, titulo, detalle }: { icono: typeof Plus; titulo: string; detalle: string }) => (
    <span className="flex items-start gap-3">
      <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-fg">{titulo}</span>
        <span className="text-xs text-fg-secondary">{detalle}</span>
      </span>
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compacto ? (
          <Button variant="ghost" size="icon" className="size-10" aria-label={t('boton')}>
            <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </Button>
        ) : (
          <Button className="h-10 gap-2">
            <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
            {t('boton')}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {permisos.ajustar && (
          <>
            <DropdownMenuItem onSelect={onEntrada} className="py-2">
              <Opcion icono={ArrowDownCircle} titulo={t('entrada')} detalle={t('entradaDetalle')} />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSalida} className="py-2">
              <Opcion icono={ArrowUpCircle} titulo={t('salida')} detalle={t('salidaDetalle')} />
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="py-2">
              <Link href={rutaAjustePorConteo([], sucursalId)}>
                <Opcion icono={ClipboardCheck} titulo={t('conteo')} detalle={t('conteoDetalle')} />
              </Link>
            </DropdownMenuItem>
          </>
        )}
        {permisos.trasladar && (
          <DropdownMenuItem asChild className="py-2">
            <Link href={rutaTransferencia(null, sucursalId)}>
              <Opcion icono={ArrowLeftRight} titulo={t('traslado')} detalle={t('trasladoDetalle')} />
            </Link>
          </DropdownMenuItem>
        )}
        {permisos.recibir && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="py-2">
              <Link href="/app/inventario/ordenes-compra">
                <Opcion icono={PackageOpen} titulo={t('recibirOc')} detalle={t('recibirOcDetalle')} />
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
