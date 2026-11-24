'use client';

/**
 * Tarjeta «Lista de precios» de la ficha del cliente (Figma «05 POS y ventas» 06, 3021:200106).
 *
 * Muestra la lista que tiene (uno a uno, por un grupo del CRM o «sin lista»), qué hace, el ahorro
 * del mes contra el precio normal y «Cambiar lista». Elegir otra la asigna uno a uno (gana sobre
 * el grupo) y aplica desde la próxima venta. Cambiar exige pos.listas_precios.gestionar, resuelto
 * en el servidor.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Tags, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AvisoTonal } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ListasPreciosService, ErrorPeticionLista, tienePermisoLista } from '@/lib/services/listasPreciosService';
import type { InfoListaCliente } from '@/lib/listasPrecios/tipos';
import { TONO_ESTADO_LISTA, ajustePorcentaje, rutaLista } from './vistaListas';

const SIN_LISTA = '__sin_lista__';

export function ListaPreciosClienteCard({ customerId }: { customerId: string }) {
  const t = useTranslations('listasPrecios.ficha');
  const tl = useTranslations('listasPrecios');
  const te = useTranslations('listasPrecios.errores');
  const { formatear } = useMonedaOrganizacion();
  const [info, setInfo] = useState<InfoListaCliente | null>(null);
  const [puedeCambiar, setPuedeCambiar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    ListasPreciosService.infoCliente(customerId).then(setInfo).catch(() => setInfo(null));
  }, [customerId]);

  useEffect(() => {
    cargar();
    tienePermisoLista('pos.listas_precios.gestionar').then(setPuedeCambiar).catch(() => setPuedeCambiar(false));
  }, [cargar]);

  if (!info) return null;
  // Sin listas creadas en la organización, la tarjeta no ocupa lugar.
  if (!info.lista && info.opciones.length === 0) return null;

  const cambiar = async (valor: string) => {
    setGuardando(true);
    try {
      await ListasPreciosService.cambiarListaCliente(customerId, valor === SIN_LISTA ? null : valor);
      toast.success(t('cambiada'));
      cargar();
    } catch (e) {
      toast.error(te(e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const l = info.lista;
  const resumen = l
    ? [
        l.base_mode === 'percent' ? ajustePorcentaje(tl, l.base_percent) : null,
        ...(l.reglas ?? []).slice(0, 2).map((r) => (r.no_discount ? t('sinDescuentoEn', { quien: r.name ?? '' }) : t('reglaEn', { ajuste: ajustePorcentaje(tl, r.adjust_percent) ?? '0 %', quien: r.name ?? '' }))),
        l.productos_fijos > 0 ? t('fijosEn', { n: l.productos_fijos }) : null,
      ]
        .filter(Boolean)
        .join(', ')
    : null;
  const canales = l
    ? [l.applies_to_pos ? tl('canales.posLargo') : null, l.applies_to_web ? tl('canales.webLargo') : null, l.applies_to_documents ? tl('canales.documentosLargo') : null]
        .filter(Boolean)
        .join(', ')
    : '';
  const valor = info.via === 'sin_lista' || info.via === 'ninguna' ? SIN_LISTA : l?.id ?? SIN_LISTA;

  return (
    <section aria-labelledby="ficha-lista-precios" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 id="ficha-lista-precios" className="flex items-center gap-2 text-base font-semibold text-fg">
          <Tags aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('titulo')}
        </h2>
        {l && (
          <Link href={rutaLista(l.id)} className="text-sm text-brand">
            {t('verLista')}
          </Link>
        )}
      </header>
      {l ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge tono="marca" apariencia="suave" tamano="sm">{l.name}</Badge>
            <Badge tono={TONO_ESTADO_LISTA[l.estado]} apariencia="contorno" tamano="sm">{tl(`estado.${l.estado}`)}</Badge>
          </div>
          {resumen && <p className="text-sm text-fg-secondary">{t('resumen', { resumen, canales })}</p>}
          <p className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Users aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            {info.via === 'grupo' ? t('porGrupo', { grupo: info.grupo?.name ?? '' }) : t('unoAUno')}
          </p>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2">
            <span>
              <span className="block text-xs text-fg-secondary">{t('ahorroMes')}</span>
              <span className="block text-lg font-semibold text-fg">{formatear(info.ahorro_mes)}</span>
            </span>
            <span className="text-right text-xs text-fg-muted">{t('ahorroDetalle', { n: info.compras_mes })}</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-fg-secondary">{info.via === 'sin_lista' ? t('sinListaExplicita') : t('sinLista')}</p>
      )}
      {puedeCambiar && (
        <>
          <Select value={valor} onValueChange={(v) => void cambiar(v)} disabled={guardando}>
            <SelectTrigger className="h-10" aria-label={t('cambiar')}>
              <SelectValue placeholder={t('cambiar')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_LISTA}>{t('opcionSinLista')}</SelectItem>
              {info.opciones.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                  {o.base_mode === 'percent' && ajustePorcentaje(tl, o.base_percent) ? ` · ${ajustePorcentaje(tl, o.base_percent)}` : ''}
                  {info.lista_del_grupo_id === o.id && info.grupo ? ` · ${t('porGrupo', { grupo: info.grupo.name })}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AvisoTonal tono="informacion" compacto titulo={t('avisoCambio')} />
        </>
      )}
    </section>
  );
}
