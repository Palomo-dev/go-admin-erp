'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DollarSign } from 'lucide-react';
import { FormField } from '@/components/kit';
import { Dialogo } from '@/components/kit/Dialogo';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { productoService } from '@/lib/services/productoService';
import { calcularMargen, tonoMargen } from '../../logica/margen';
import { useProductoDetalle } from '../ContextoProducto';
import { CampoVigencia, errorVigencia, type ValorVigencia } from './CampoVigencia';

const SIN_PROVEEDOR = 'ninguno';

/**
 * «Actualizar costo» (Nuevo, H.1 de A.9): nuevo costo, proveedor opcional
 * (de los proveedores del producto) y vigencia. Guarda con
 * `fn_producto_fijar_costo` (misma regla de vigencias que el precio).
 */
export function DialogoCosto({
  abierto,
  onAbiertoChange,
  onGuardado,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('productoDetalle.precios.dialogoCosto');
  const tv = useTranslations('productoDetalle.precios.vigencia');
  const tm = useTranslations('productoDetalle.precios');
  const { producto, organizacionId, resumen, moneda, fechas, mensajeError } = useProductoDetalle();
  const { toast } = useToast();
  const hoy = fechas.getToday();
  const proveedores = (producto.product_suppliers ?? []).filter((p) => p.supplier);

  const [costo, setCosto] = useState<number | null>(null);
  const [proveedor, setProveedor] = useState<string>(SIN_PROVEEDOR);
  const [vigencia, setVigencia] = useState<ValorVigencia>({ modo: 'ahora', dia: '' });
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const preferidoId = producto.product_suppliers?.find((p) => p.is_preferred)?.supplier_id ?? null;
  useEffect(() => {
    if (!abierto) return;
    setCosto(resumen?.costo ?? null);
    setProveedor(preferidoId ? String(preferidoId) : SIN_PROVEEDOR);
    setVigencia({ modo: 'ahora', dia: '' });
    setIntentado(false);
    setErrorServidor(null);
  }, [abierto, resumen?.costo, preferidoId]);

  const errCosto = costo === null ? t('errorCostoRequerido') : costo < 0 ? t('errorCostoNegativo') : null;
  const codigoVigencia = errorVigencia(vigencia, hoy);
  const errVigencia = codigoVigencia ? tv(codigoVigencia) : null;
  const valido = !errCosto && !errVigencia;
  const margen = calcularMargen(resumen?.precio ?? null, costo);

  const guardar = async () => {
    setIntentado(true);
    if (!valido || costo === null) return;
    setGuardando(true);
    setErrorServidor(null);
    try {
      const desde = vigencia.modo === 'programar' ? fechas.toInstant(vigencia.dia) : null;
      const supplierId = proveedor === SIN_PROVEEDOR ? null : Number(proveedor);
      const cambio = await productoService.fijarCosto(organizacionId, producto.id, costo, desde, supplierId);
      toast(
        cambio
          ? {
              title: vigencia.modo === 'programar' ? t('toastProgramado') : t('toastActualizado'),
              description:
                vigencia.modo === 'programar'
                  ? t('toastProgramadoDetalle', { costo: moneda.formatear(costo), dia: fechas.formatPlain(vigencia.dia) })
                  : t('toastActualizadoDetalle', { costo: moneda.formatear(costo) }),
            }
          : { title: t('toastSinCambios'), description: t('toastSinCambiosDetalle') },
      );
      onAbiertoChange(false);
      onGuardado();
    } catch (e) {
      const mensaje = mensajeError(e);
      setErrorServidor(mensaje);
      toast({ variant: 'destructive', title: t('toastError'), description: mensaje });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={DollarSign}
      ancho={520}
      primario={{ etiqueta: guardando ? t('guardando') : t('guardar'), onClick: () => void guardar(), cargando: guardando }}
    >
      <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2.5 text-sm">
        <span className="text-fg-secondary">{t('costoActual')}</span>
        <span className="font-semibold tabular-nums text-fg">
          {resumen?.costo !== null && resumen?.costo !== undefined ? moneda.formatear(resumen.costo) : tm('sinCosto')}
        </span>
      </div>

      <FormField etiqueta={t('nuevoCosto')} obligatorio error={intentado ? errCosto : null}>
        <CampoNumero valor={costo} onValorChange={setCosto} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} autoFocus />
      </FormField>

      <FormField etiqueta={t('proveedor')} ayuda={proveedores.length === 0 ? t('proveedorVacio') : t('proveedorAyuda')}>
        {(campo) => (
          <Select value={proveedor} onValueChange={setProveedor} disabled={guardando || proveedores.length === 0}>
            <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_PROVEEDOR}>{t('sinProveedor')}</SelectItem>
              {proveedores.map((p) => (
                <SelectItem key={p.supplier_id} value={String(p.supplier_id)}>
                  {p.supplier?.name}
                  {p.is_preferred ? ` · ${t('preferido')}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <CampoVigencia valor={vigencia} onChange={setVigencia} hoy={hoy} error={intentado ? errVigencia : null} deshabilitado={guardando} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5 text-sm">
        <span className="text-fg-secondary">
          {resumen?.precio !== null && resumen?.precio !== undefined
            ? t('margenConPrecio', { precio: moneda.formatear(resumen.precio) })
            : t('margenSinPrecio')}
        </span>
        {margen !== null ? (
          <Badge tono={tonoMargen(margen)}>{tm('margen', { valor: margen })}</Badge>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </div>

      {errorServidor && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {errorServidor}
        </p>
      )}
    </Dialogo>
  );
}
