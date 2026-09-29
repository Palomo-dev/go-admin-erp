'use client';

/**
 * Renovar membresía (Figma C5 985:617646). Renovar es vender otra vez el mismo producto: aquí no
 * se cobra nada, solo se elige por dónde (POS o factura de venta) y se muestra la vigencia nueva
 * con `previsualizarRenovacion` (P3: suma desde el vencimiento; si ya venció, desde hoy). La
 * membresía se extiende dentro de la transacción de la venta (`fn_membresias_activar_venta`).
 * «Enviar enlace de pago» pregunta al servidor (`/enlace-pago`) y se muestra deshabilitada con su
 * motivo: sin pasarela, o con pasarela cuyo cobro aún no activa la membresía (§12.2).
 */
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, Globe, Info, RefreshCw, ShoppingCart, type LucideIcon } from 'lucide-react';
import { Dialogo, FilaDato, ListaDatos } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { DetalleMembresia, EstadoEnlacePago } from '@/lib/services/membresias/tipos';
import { previsualizarRenovacion } from '@/lib/services/membresias/vigencia';
import { cn } from '@/utils/Utils';
import { useFormatoMembresias } from '../comun/useFormatoMembresias';
import { rutaCobrarEnPos, rutaNuevaFactura } from '../logica';

export interface DialogoRenovarProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  detalle: DetalleMembresia;
}

type Via = 'pos' | 'factura' | 'enlace';

export function DialogoRenovar({ abierto, onAbiertoChange, detalle }: DialogoRenovarProps) {
  const t = useTranslations('membresias.renovar');
  const router = useRouter();
  const nombreGrupo = useId();
  const { membresia: m, zona, precioRenovacion } = detalle;
  const f = useFormatoMembresias(zona);
  const [via, setVia] = useState<Via>('pos');
  const [enlace, setEnlace] = useState<EstadoEnlacePago | 'cargando' | 'error'>('cargando');

  useEffect(() => {
    if (abierto) setVia('pos');
  }, [abierto]);

  // C5: el servidor dice si la organización tiene pasarela y si su cobro activaría la membresía.
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setEnlace('cargando');
    apiMembresias
      .enlacePago(m.id)
      .then((e) => vivo && setEnlace(e))
      .catch(() => vivo && setEnlace('error'));
    return () => {
      vivo = false;
    };
  }, [abierto, m.id]);

  const enlaceDisponible = typeof enlace === 'object' && enlace.disponible;
  const motivoEnlace =
    enlace === 'cargando'
      ? t('enlace.comprobando')
      : enlace === 'error'
        ? t('enlace.motivos.error')
        : enlace.motivo
          ? t(`enlace.motivos.${enlace.motivo}`, { pasarelas: enlace.pasarelas.map((p) => t(`enlace.pasarelas.${p}`)).join(', ') })
          : t('opciones.enlace.descripcion');
  const insigniaEnlace =
    typeof enlace === 'object' && enlace.motivo ? t(`enlace.insignias.${enlace.motivo}`) : enlace === 'cargando' ? t('enlace.insignias.comprobando') : null;

  const productId = m.plan.productId;
  const clienteId = m.cliente.id || null;
  const nueva = previsualizarRenovacion(new Date(m.hasta), new Date(), m.reglas.durationUnit, m.reglas.durationValue, 1, zona);
  const vencido = new Date(m.hasta).getTime() < Date.now();

  const bloqueo = !productId ? t('bloqueo.sinProducto') : !clienteId ? t('bloqueo.sinCliente') : undefined;

  const ir = () => {
    // «Enlace» no tiene creación todavía (§12.2): aunque el servidor la ofreciera, no se navega.
    if (bloqueo || via === 'enlace') return;
    onAbiertoChange(false);
    router.push(via === 'factura' ? rutaNuevaFactura(clienteId) : rutaCobrarEnPos(clienteId, productId));
  };

  const opciones: Array<{ valor: Via; icono: LucideIcon; titulo: string; descripcion: string; deshabilitada?: boolean }> = [
    {
      valor: 'pos',
      icono: ShoppingCart,
      titulo: t('opciones.pos.titulo'),
      descripcion: t('opciones.pos.descripcion', { cliente: m.cliente.nombre, plan: m.plan.nombre }),
    },
    {
      valor: 'factura',
      icono: FileText,
      titulo: t('opciones.factura.titulo'),
      descripcion: t('opciones.factura.descripcion'),
    },
    {
      valor: 'enlace',
      icono: Globe,
      titulo: t('opciones.enlace.titulo'),
      descripcion: motivoEnlace,
      // Hoy el servidor nunca la ofrece: no hay riel cuyo cobro active la membresía (§12.2).
      deshabilitada: !enlaceDisponible,
    },
  ];

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { codigo: m.codigo ?? `#${m.id}` })}
      descripcion={t('descripcion')}
      icono={RefreshCw}
      ancho={520}
      primario={{
        etiqueta: via === 'factura' ? t('irAFactura') : t('irAlPos'),
        onClick: ir,
        deshabilitada: !!bloqueo,
        motivo: bloqueo,
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t('comoCobrar')}</legend>
        {opciones.map((o) => {
          const elegida = via === o.valor;
          const Icono = o.icono;
          return (
            <label
              key={o.valor}
              className={cn(
                'flex cursor-pointer flex-col gap-2 rounded-xl border p-3 focus-within:ring-2 focus-within:ring-brand',
                elegida ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                o.deshabilitada && 'cursor-not-allowed opacity-60 hover:bg-surface',
              )}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name={nombreGrupo}
                  value={o.valor}
                  checked={elegida}
                  disabled={o.deshabilitada}
                  onChange={() => setVia(o.valor)}
                  className="sr-only"
                />
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-fg-secondary">
                  <Icono className="size-4" strokeWidth={1.5} />
                </span>
                <span className="flex-1 text-sm font-medium text-fg">{o.titulo}</span>
                {o.deshabilitada && o.valor === 'enlace' && insigniaEnlace && (
                  <Badge tono="neutro" apariencia="contorno" tamano="sm">
                    {insigniaEnlace}
                  </Badge>
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                    elegida ? 'border-brand-action' : 'border-line-strong',
                  )}
                >
                  {elegida && <span className="size-2 rounded-full bg-brand-action" />}
                </span>
              </span>
              <span className="text-sm text-fg-secondary">{o.descripcion}</span>
            </label>
          );
        })}
      </fieldset>

      <ListaDatos etiqueta={t('resumen')}>
        <FilaDato
          etiqueta={t('producto')}
          valor={precioRenovacion !== null ? `${m.plan.nombre} · ${f.moneda(precioRenovacion)}` : m.plan.nombre}
        />
        <FilaDato etiqueta={vencido ? t('vencio') : t('vence')} valor={f.fecha(m.hasta)} />
        <FilaDato
          etiqueta={t('nuevaVigencia')}
          tono="fuerte"
          tamano="lg"
          valor={`${f.fechaCorta(nueva.desde)} – ${f.fecha(nueva.hasta)}`}
        />
      </ListaDatos>

      <p className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-sm text-info-text">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {t('avisoCambioPlan')}
      </p>
      {bloqueo && (
        <p role="alert" className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">
          {bloqueo}
        </p>
      )}
    </Dialogo>
  );
}
