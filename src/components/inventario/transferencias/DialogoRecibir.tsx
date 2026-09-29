'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, PackageCheck } from 'lucide-react';
import { CampoNumero, EmptyState, PanelAdaptable } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { clienteTraslados } from '@/lib/inventario/transferencias/cliente';
import { DECISIONES_DIFERENCIA, type DecisionDiferencia, type DetalleTraslado, type RenglonTraslado } from '@/lib/inventario/transferencias/contrato';
import {
  lineasIniciales,
  lineasParaEnviar,
  nuevaClave,
  redondear,
  resumirRecepcion,
  type LineaRecepcionUI,
} from '@/lib/inventario/transferencias/logica';
import { cn } from '@/utils/Utils';
import { useCantidad, useMensajeErrorTraslado } from './piezas';

export interface DialogoRecibirProps {
  trasladoId: number | null;
  onAbiertoChange: (abierto: boolean) => void;
  /** Después de registrar la recepción (para recargar). */
  onRecibido: () => void;
  /** Si ya se tiene el detalle (pantalla de detalle), se evita otra lectura. */
  detalle?: DetalleTraslado | null;
}

/**
 * «Recibir traslado» (Figma 589:320397; en Distribución 607:164032). P7: quien
 * recibe cuenta lo que llegó; lo recibido entra al destino con su costo y la
 * diferencia de cada renglón se decide: «Faltante en el transporte» (con
 * motivo: merma en el destino) o «Siguen en camino» (queda en tránsito). Los
 * renglones con seriales piden marcar cuáles llegaron si no llegó todo.
 * Escritorio: diálogo; móvil: hoja con una tarjeta por renglón.
 */
export function DialogoRecibir({ trasladoId, onAbiertoChange, onRecibido, detalle: detalleDado }: DialogoRecibirProps) {
  const t = useTranslations('inventarioTraslados.recibir');
  const { toast } = useToast();
  const cantidad = useCantidad();
  const mensajeError = useMensajeErrorTraslado();
  const { formatear: dinero } = useMonedaOrganizacion();

  const [detalle, setDetalle] = useState<DetalleTraslado | null>(detalleDado ?? null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>(detalleDado ? 'listo' : 'cargando');
  const [lineas, setLineas] = useState<LineaRecepcionUI[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(false);
  const [clave, setClave] = useState(() => nuevaClave('recibir'));
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const abierto = trasladoId !== null;

  useEffect(() => {
    if (!abierto) return;
    setIntento(false);
    setErrorServidor(null);
    setClave(nuevaClave('recibir'));
    if (detalleDado && detalleDado.traslado.id === trasladoId) {
      setDetalle(detalleDado);
      setLineas(lineasIniciales(detalleDado.items));
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
        setLineas(lineasIniciales(d.items));
        setEstado('listo');
      })
      .catch(() => vigente && setEstado('error'));
    return () => {
      vigente = false;
    };
  }, [abierto, trasladoId, detalleDado]);

  const items = useMemo(() => (detalle?.items ?? []).filter((i) => i.pendiente > 0), [detalle]);
  const resumen = useMemo(() => resumirRecepcion(items, lineas), [items, lineas]);
  const destino = detalle?.traslado.destino.nombre ?? '';
  const codigo = detalle?.traslado.code ?? '';

  const cambiar = (itemId: number, cambio: Partial<LineaRecepcionUI>) =>
    setLineas((prev) => prev.map((l) => (l.item_id === itemId ? { ...l, ...cambio } : l)));

  const confirmar = async () => {
    setIntento(true);
    if (!detalle || !resumen.valida) return;
    setEnviando(true);
    setErrorServidor(null);
    try {
      const r = await clienteTraslados.recibir(detalle.traslado.id, lineasParaEnviar(items, lineas), clave);
      toast({
        title: r.repetido
          ? t('repetido')
          : r.status === 'received'
            ? t('listo', { codigo, n: cantidad(r.unidades ?? resumen.unidades), destino })
            : t('listoParcial', { codigo, n: cantidad(r.unidades ?? resumen.unidades), destino, pendiente: cantidad(r.en_camino ?? resumen.enCamino) }),
      });
      onAbiertoChange(false);
      onRecibido();
    } catch (e) {
      setErrorServidor(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  };

  const errorDe = (item: RenglonTraslado): string | null => {
    const e = resumen.errores[item.id];
    if (!e || !intento) return null;
    if (e === 'recibido_de_mas') return t('errores.recibido_de_mas', { n: cantidad(item.pendiente) });
    if (e === 'seriales_no_cuadran') return t('errores.seriales_no_cuadran', { n: cantidad(lineas.find((l) => l.item_id === item.id)?.recibido ?? 0) });
    return t(`errores.${e}`);
  };

  const cuerpo = (() => {
    if (estado === 'cargando') {
      return (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label={t('cargando')}>
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      );
    }
    if (estado === 'error' || !detalle) return <EmptyState variante="error" compacto titulo={t('error')} />;
    if (items.length === 0) return <EmptyState compacto icono={CheckCircle2} titulo={t('nadaPendiente')} />;

    return (
      <div className="flex flex-col gap-4">
        {/* Escritorio: tabla */}
        <div className="hidden overflow-hidden rounded-xl border border-line md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('titulo', { codigo, destino })}</caption>
            <thead className="bg-subtle text-left text-[13px] font-medium text-fg-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t('columnas.producto')}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t('columnas.lote')}</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">{t('columnas.enviado')}</th>
                <th scope="col" className="w-36 px-3 py-3 font-medium">{t('columnas.recibido')}</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">{t('columnas.diferencia')}</th>
                <th scope="col" className="w-64 px-3 py-3 font-medium">{t('columnas.decision')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const l = lineas.find((x) => x.item_id === item.id);
                if (!l) return null;
                const dif = redondear(item.pendiente - (l.recibido ?? 0));
                const error = errorDe(item);
                return (
                  <tr key={item.id} className={cn('border-t border-line align-top', dif > 0 && 'bg-warning-subtle/40')}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-fg">{item.nombre}</p>
                      <p className="text-xs text-fg-secondary">{subtituloRenglon(item)}</p>
                      {item.seriales.length > 0 && dif > 0 && (l.recibido ?? 0) > 0 && (
                        selectorSeriales(item, l)
                      )}
                    </td>
                    <td className="px-3 py-3 text-fg-secondary">{item.lote?.codigo ?? '—'}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-fg">{cantidad(item.pendiente)}</td>
                    <td className="px-3 py-3">
                      <CampoNumero
                        valor={l.recibido}
                        onValorChange={(v) => cambiar(item.id, { recibido: v })}
                        decimales={item.seriales.length > 0 ? 0 : 3}
                        minimo={0}
                        maximo={item.pendiente}
                        alinear="derecha"
                        aria-label={t('recibidoDe', { producto: item.nombre })}
                        aria-invalid={!!error}
                      />
                      {error && <p className="mt-1 text-xs text-danger-text" role="alert">{error}</p>}
                    </td>
                    <td className={cn('px-3 py-3 text-right tabular-nums', dif > 0 ? 'font-medium text-danger-text' : 'text-fg')}>
                      {dif > 0 ? `−${cantidad(dif)}` : '0'}
                    </td>
                    <td className="px-3 py-3">
                      {dif > 0 ? decision(item, l) : <span className="text-fg-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Móvil: tarjetas */}
        <ul className="flex flex-col gap-3 md:hidden">
          {items.map((item) => {
            const l = lineas.find((x) => x.item_id === item.id);
            if (!l) return null;
            const dif = redondear(item.pendiente - (l.recibido ?? 0));
            const error = errorDe(item);
            return (
              <li key={item.id} className={cn('rounded-xl border border-line bg-surface p-4', dif > 0 && 'border-line-warning bg-warning-subtle/40')}>
                <p className="font-medium text-fg">{item.nombre}</p>
                <p className="text-xs text-fg-secondary">
                  {[subtituloRenglon(item), item.lote?.codigo].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-3 flex items-end gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-fg-secondary">{t('enviadoN', { n: cantidad(item.pendiente) })}</p>
                    <CampoNumero
                      valor={l.recibido}
                      onValorChange={(v) => cambiar(item.id, { recibido: v })}
                      decimales={item.seriales.length > 0 ? 0 : 3}
                      minimo={0}
                      maximo={item.pendiente}
                      alinear="derecha"
                      aria-label={t('recibidoDe', { producto: item.nombre })}
                      aria-invalid={!!error}
                    />
                  </div>
                  <p className={cn('pb-2 text-sm tabular-nums', dif > 0 ? 'font-medium text-danger-text' : 'text-fg-secondary')}>
                    {dif > 0 ? `−${cantidad(dif)}` : t('completo')}
                  </p>
                </div>
                {error && <p className="mt-1 text-xs text-danger-text" role="alert">{error}</p>}
                {dif > 0 && (
                  <div className="mt-3">
                    {decision(item, l)}
                  </div>
                )}
                {item.seriales.length > 0 && dif > 0 && (l.recibido ?? 0) > 0 && (
                  selectorSeriales(item, l)
                )}
              </li>
            );
          })}
        </ul>

        {aviso()}
        {errorServidor && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
            {errorServidor}
          </p>
        )}
      </div>
    );
  })();

  function aviso() {
    if (resumen.conDiferencia.length === 0) {
      return (
        <p className="flex items-start gap-2 rounded-lg bg-success-subtle px-4 py-3 text-[13px] text-success-text">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          {t('resumen.completo')}
        </p>
      );
    }
    const partes: string[] = resumen.conDiferencia.map((d) =>
      t('resumen.diferencia', { n: cantidad(d.diferencia), producto: d.lote ? `${d.nombre} (${d.lote})` : d.nombre }),
    );
    if (resumen.faltantes > 0) {
      partes.push(
        resumen.valorFaltante !== null
          ? t('resumen.faltante', { destino, valor: dinero(resumen.valorFaltante) })
          : t('resumen.faltanteSinValor', { destino }),
      );
    }
    if (resumen.enCamino > 0) partes.push(t('resumen.enCamino', { n: cantidad(resumen.enCamino) }));
    if (resumen.conDiferencia.some((d) => !d.decision)) partes.push(t('resumen.elegir'));
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-4 py-3 text-[13px] text-warning-text">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <span>{partes.join(' ')}</span>
      </p>
    );
  }

  function decision(item: RenglonTraslado, linea: LineaRecepcionUI) {
    const onCambio = (c: Partial<LineaRecepcionUI>) => cambiar(item.id, c);
    return (
      <div className="flex flex-col gap-2">
        <Select value={linea.decision ?? ''} onValueChange={(v) => onCambio({ decision: v as DecisionDiferencia })}>
          <SelectTrigger className="h-10 border-line-strong bg-surface" aria-label={t('decisionDe', { producto: item.nombre })}>
            <SelectValue placeholder={t('elegirDecision')} />
          </SelectTrigger>
          <SelectContent>
            {DECISIONES_DIFERENCIA.map((d) => (
              <SelectItem key={d} value={d}>
                {t(`decisiones.${d}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {linea.decision === 'faltante' && (
          <Input
            value={linea.motivo}
            onChange={(e) => onCambio({ motivo: e.target.value })}
            maxLength={300}
            placeholder={t('motivoPlaceholder')}
            aria-label={t('motivoDe', { producto: item.nombre })}
            className="h-10 border-line-strong bg-surface"
          />
        )}
      </div>
    );
  }

  function selectorSeriales(item: RenglonTraslado, linea: LineaRecepcionUI) {
    const onCambio = (seriales: number[]) => cambiar(item.id, { seriales });
    const enTransito = item.seriales.filter((s) => s.estado === 'in_transit');
    return (
      <fieldset className="mt-2 flex flex-col gap-1">
        <legend className="text-xs font-medium text-fg-secondary">
          {t('serialesLlegaron', { n: cantidad(linea.seriales.length), total: cantidad(linea.recibido ?? 0) })}
        </legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {enTransito.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-xs text-fg">
              <Checkbox
                className="size-4 rounded"
                checked={linea.seriales.includes(s.id)}
                onCheckedChange={(v) => onCambio(v === true ? [...linea.seriales, s.id] : linea.seriales.filter((x) => x !== s.id))}
              />
              <span className="tabular-nums">{s.serial}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  function subtituloRenglon(item: RenglonTraslado): string {
    if (item.seriales.length > 0) return t('seriales', { count: item.seriales.length, n: cantidad(item.seriales.length) });
    return [item.sku ? t('sku', { sku: item.sku }) : null, item.variante].filter(Boolean).join(' · ');
  }

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={detalle ? t('titulo', { codigo, destino }) : t('tituloCorto')}
      descripcion={detalle ? t('descripcion', { destino }) : undefined}
      icono={PackageCheck}
      ancho={1120}
      ocupado={enviando}
      bloquearClicFuera
      pie={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-10" onClick={() => onAbiertoChange(false)} disabled={enviando}>
            {t('cancelar')}
          </Button>
          <Button
            className="h-10 gap-2"
            onClick={confirmar}
            disabled={enviando || estado !== 'listo' || items.length === 0}
            aria-disabled={intento && !resumen.valida}
          >
            <PackageCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {enviando ? t('confirmando') : t('confirmar')}
          </Button>
        </div>
      }
    >
      {cuerpo}
    </PanelAdaptable>
  );
}
