'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ScanBarcode, Send } from 'lucide-react';
import { Dialogo, EmptyState, PanelAdaptable } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { clienteTraslados } from '@/lib/inventario/transferencias/cliente';
import type { DetalleTraslado } from '@/lib/inventario/transferencias/contrato';
import { nuevaClave } from '@/lib/inventario/transferencias/logica';
import { cn } from '@/utils/Utils';
import { useCantidad, useMensajeErrorTraslado } from './piezas';

export interface DialogoDespacharProps {
  trasladoId: number | null;
  onAbiertoChange: (abierto: boolean) => void;
  onDespachado: () => void;
  detalle?: DetalleTraslado | null;
}

/**
 * «¿Despachar el traslado …?» (Figma ConfirmDialog 589:320633). P7: sale del
 * origen ahora (kardex «Traslado salida») y queda en tránsito. Si algún
 * renglón lleva seriales, primero se escanea o marca cada serial que sale
 * (Figma: «Los productos con seriales piden escanear cada serial al
 * despachar»). P5: si el origen no alcanza, el servidor responde con lo
 * disponible y no mueve nada.
 */
export function DialogoDespachar({ trasladoId, onAbiertoChange, onDespachado, detalle: detalleDado }: DialogoDespacharProps) {
  const t = useTranslations('inventarioTraslados.despachar');
  const { toast } = useToast();
  const cantidad = useCantidad();
  const mensajeError = useMensajeErrorTraslado();

  const [detalle, setDetalle] = useState<DetalleTraslado | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [seriales, setSeriales] = useState<Record<number, number[]>>({});
  const [escaneo, setEscaneo] = useState('');
  const [avisoEscaneo, setAvisoEscaneo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const clave = useRef(nuevaClave('despachar'));
  const abierto = trasladoId !== null;

  useEffect(() => {
    if (!abierto) return;
    clave.current = nuevaClave('despachar');
    setSeriales({});
    setError(null);
    setIntento(false);
    setEscaneo('');
    setAvisoEscaneo(null);
    if (detalleDado && detalleDado.traslado.id === trasladoId) {
      setDetalle(detalleDado);
      setEstado('listo');
      return;
    }
    let vigente = true;
    setEstado('cargando');
    clienteTraslados
      .detalle(trasladoId!)
      .then((d) => {
        if (!vigente) return;
        setDetalle(d);
        setEstado('listo');
      })
      .catch(() => vigente && setEstado('error'));
    return () => {
      vigente = false;
    };
  }, [abierto, trasladoId, detalleDado]);

  const conSeriales = useMemo(() => (detalle?.items ?? []).filter((i) => i.track_serial), [detalle]);
  const unidades = useMemo(() => (detalle?.items ?? []).reduce((s, i) => s + i.cantidad, 0), [detalle]);
  const faltantes = conSeriales.filter((i) => (seriales[i.id]?.length ?? 0) !== i.cantidad);
  const codigo = detalle?.traslado.code ?? '';
  const origen = detalle?.traslado.origen.nombre ?? '';
  const destino = detalle?.traslado.destino.nombre ?? '';

  const alternar = (itemId: number, serialId: number, marcado: boolean) =>
    setSeriales((prev) => {
      const actuales = prev[itemId] ?? [];
      return { ...prev, [itemId]: marcado ? [...new Set([...actuales, serialId])] : actuales.filter((x) => x !== serialId) };
    });

  /** Lector de código de barras o teclado: Enter marca el serial en su renglón. */
  const alEscanear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const texto = escaneo.trim();
    if (!texto) return;
    for (const item of conSeriales) {
      const s = item.seriales_disponibles?.find((x) => x.serial.toLowerCase() === texto.toLowerCase());
      if (s) {
        const actuales = seriales[item.id] ?? [];
        if (!actuales.includes(s.id) && actuales.length < item.cantidad) alternar(item.id, s.id, true);
        setAvisoEscaneo(t('seriales.marcado', { serial: s.serial, producto: item.nombre }));
        setEscaneo('');
        return;
      }
    }
    setAvisoEscaneo(t('seriales.noEncontrado', { serial: texto, origen }));
  };

  const confirmar = async () => {
    setIntento(true);
    if (!detalle || faltantes.length > 0) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await clienteTraslados.despachar(detalle.traslado.id, {
        seriales: conSeriales.length > 0 ? Object.fromEntries(conSeriales.map((i) => [String(i.id), seriales[i.id] ?? []])) : undefined,
        clave: clave.current,
      });
      toast({
        title: r.ya_despachado ? t('yaDespachado', { codigo }) : t('listo', { codigo, n: cantidad(r.unidades ?? unidades), origen }),
      });
      onAbiertoChange(false);
      onDespachado();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  };

  // Sin seriales: el ConfirmDialog de Figma.
  if (estado !== 'listo' || conSeriales.length === 0) {
    return (
      <Dialogo
        abierto={abierto}
        onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
        titulo={t('titulo', { codigo })}
        descripcion={estado === 'listo' ? t('descripcion', { n: cantidad(unidades), origen, destino }) : undefined}
        icono={Send}
        ancho={440}
        primario={{
          etiqueta: t('confirmar'),
          onClick: confirmar,
          cargando: enviando,
          deshabilitada: estado !== 'listo',
        }}
        textoCancelar={t('cancelar')}
      >
        {estado === 'cargando' && <Skeleton className="h-5 w-3/4 rounded" aria-label={t('cargando')} />}
        {estado === 'error' && <EmptyState variante="error" compacto titulo={t('error')} />}
        {error && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
      </Dialogo>
    );
  }

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('seriales.titulo', { codigo })}
      descripcion={t('seriales.descripcion')}
      icono={ScanBarcode}
      ancho={672}
      ocupado={enviando}
      pie={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-fg-secondary">{t('descripcion', { n: cantidad(unidades), origen, destino })}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" className="h-10" onClick={() => onAbiertoChange(false)} disabled={enviando}>
              {t('cancelar')}
            </Button>
            <Button className="h-10 gap-2" onClick={confirmar} disabled={enviando}>
              <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {enviando ? t('despachando') : t('confirmar')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="traslado-escaneo" className="mb-1 block text-sm font-medium text-fg">
            {t('seriales.escanear')}
          </label>
          <div className="relative">
            <ScanBarcode aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" strokeWidth={1.5} />
            <Input
              id="traslado-escaneo"
              value={escaneo}
              onChange={(e) => setEscaneo(e.target.value)}
              onKeyDown={alEscanear}
              autoComplete="off"
              className="h-10 border-line-strong bg-surface pl-9"
              aria-describedby="traslado-escaneo-aviso"
            />
          </div>
          <p id="traslado-escaneo-aviso" role="status" className="mt-1 min-h-4 text-xs text-fg-secondary">
            {avisoEscaneo}
          </p>
        </div>

        {conSeriales.map((item) => {
          const marcados = seriales[item.id] ?? [];
          const disponibles = item.seriales_disponibles ?? [];
          const incompleto = intento && marcados.length !== item.cantidad;
          return (
            <fieldset key={item.id} className={cn('rounded-xl border border-line p-4', incompleto && 'border-line-danger')}>
              <legend className="px-1 text-sm font-medium text-fg">{item.nombre}</legend>
              <p className={cn('mb-2 text-xs', incompleto ? 'text-danger-text' : 'text-fg-secondary')}>
                {t('seriales.marcados', { n: cantidad(marcados.length), total: cantidad(item.cantidad) })}
              </p>
              {disponibles.length === 0 ? (
                <p className="text-sm text-danger-text">{t('seriales.sinDisponibles', { producto: item.nombre, origen })}</p>
              ) : (
                <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {disponibles.map((s) => {
                    const marcado = marcados.includes(s.id);
                    return (
                      <label key={s.id} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-fg hover:bg-subtle">
                        <Checkbox
                          className="size-[18px] rounded"
                          checked={marcado}
                          disabled={!marcado && marcados.length >= item.cantidad}
                          onCheckedChange={(v) => alternar(item.id, s.id, v === true)}
                        />
                        <span className="tabular-nums">{s.serial}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          );
        })}

        {intento && faltantes.length > 0 && (
          <p role="alert" className="text-sm text-danger-text">
            {t('seriales.faltan', { producto: faltantes.map((i) => i.nombre).join(', ') })}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </PanelAdaptable>
  );
}
