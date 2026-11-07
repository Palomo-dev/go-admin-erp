'use client';

/**
 * Paso 0 de «Nueva nota crédito / débito» desde el listado de notas
 * (docs/design/FINANZAS-DOCUMENTOS-V2.md §4.3, `SelectorDocumento`): buscar una
 * factura de venta EMITIDA en el servidor (`GET /api/facturas-venta`, la misma
 * RPC del listado de facturas) sobre `SelectorEntidad` del kit. Al continuar,
 * la pantalla abre el diálogo de siempre (`NotaCreditoVentaDialog` o
 * `NotaDebitoDialog`): no hay un segundo diálogo de nota.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileMinus, FilePlus, Receipt } from 'lucide-react';
import { Dialogo, SelectorEntidad, type OpcionEntidad } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { pedirListadoFacturas } from '@/lib/finanzas/ventas/clienteFacturas';
import { ordenFacturasRpc, type FilaFacturaListado } from '@/lib/finanzas/ventas/listadoFacturas';
import type { TipoNota } from '@/lib/finanzas/notas/contratoNotas';

const TAMANO = 10;

export interface ElegirFacturaNotaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  tipo: TipoNota;
  sucursal?: number | null;
  onElegida: (factura: { id: string; numero: string }) => void;
}

export function ElegirFacturaNotaDialog({ abierto, onAbiertoChange, tipo, sucursal, onElegida }: ElegirFacturaNotaDialogProps) {
  const t = useTranslations('finanzasDocumentosR3.notas');
  const { formatDate } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const [factura, setFactura] = useState<FilaFacturaListado | null>(null);

  useEffect(() => {
    if (abierto) setFactura(null);
  }, [abierto]);

  const buscar = useCallback(
    async (texto: string, _senal: AbortSignal, _filtros: readonly string[], desde: number) => {
      const q = new URLSearchParams();
      if (texto.trim()) q.set('q', texto.trim());
      q.set('estado_doc', 'emitida');
      if (sucursal) q.set('sucursal', String(sucursal));
      q.set('orden', ordenFacturasRpc('emision', 'desc'));
      q.set('pagina', String(Math.floor(desde / TAMANO) + 1));
      q.set('tamano', String(TAMANO));
      const r = await pedirListadoFacturas(q);
      return { items: r.filas, total: r.total };
    },
    [sucursal],
  );

  const aOpcion = (f: FilaFacturaListado): OpcionEntidad => {
    const fmt = crearFormateadorMoneda(moneda.paraDocumento(f.moneda));
    return {
      id: f.id,
      titulo: f.numero ?? t('listado.sinNumero'),
      subtitulo: [f.cliente ?? t('listado.sinCliente'), f.cliente_doc].filter(Boolean).join(' · '),
      meta: [t('nueva.meta', { fecha: formatDate(f.emision), total: fmt(f.total) }), t('nueva.saldo', { saldo: fmt(f.saldo) })].join(' · '),
    };
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={tipo === 'debito' ? t('nueva.tituloDebito') : t('nueva.tituloCredito')}
      descripcion={t('nueva.descripcion')}
      icono={tipo === 'debito' ? FilePlus : FileMinus}
      ancho={560}
      textoCancelar={t('nueva.cancelar')}
      primario={{
        etiqueta: t('nueva.continuar'),
        onClick: () => {
          if (!factura) return;
          onElegida({ id: factura.id, numero: factura.numero ?? t('listado.sinNumero') });
        },
        deshabilitada: !factura,
        motivo: t('nueva.elegirPrimero'),
      }}
    >
      <SelectorEntidad<FilaFacturaListado>
        valor={factura}
        aOpcion={aOpcion}
        buscar={buscar}
        onCambiar={setFactura}
        onQuitar={() => setFactura(null)}
        icono={Receipt}
        layout="campo"
        etiqueta={t('nueva.factura')}
        textos={{
          placeholder: t('nueva.buscarPlaceholder'),
          buscar: t('nueva.buscarPlaceholder'),
          titulo: t('nueva.titulo'),
          vacio: t('nueva.vacio'),
          sinResultados: t('nueva.sinResultados'),
          error: t('nueva.error'),
          cambiar: t('nueva.cambiar'),
          quitar: t('nueva.quitar'),
        }}
      />
    </Dialogo>
  );
}
