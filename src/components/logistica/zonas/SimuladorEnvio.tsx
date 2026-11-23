'use client';

/**
 * «¿Cuánto cuesta enviar a…?» (Figma 2793:1477). Mismo cálculo que hace el servidor en el
 * checkout, el POS y el pedido manual: `POST /api/logistica/cotizar` → `logistica_cotizar_envio`.
 * No crea nada.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calculator } from 'lucide-react';
import { AvisoTonal, CampoNumero, Dialogo, FilaDato, FormField, SegmentedControl, StatusBadge } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { pedirCotizacion, type RespuestaCotizar } from '@/components/logistica/cotizar/useCotizacionDomicilio';
import type { CanalCotizacion } from '@/lib/logistica/cotizacion';
import { estadoCotizacion, nombreZona, textoTiempoCotizacion } from '@/lib/logistica/presentacionEnvio';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import type { ZonaConUbicaciones } from '@/lib/services/logistica/zonasEnvioService';

interface Props {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  zonaInicial: ZonaConUbicaciones | null;
  sedeInicial: number | null;
  /** «Ver regla de despacho»: lleva a la pestaña de reglas. */
  onVerRegla?: (reglaId: string) => void;
}

const CANALES: readonly CanalCotizacion[] = ['web', 'pos', 'manual'];

export function SimuladorEnvio({ abierto, onAbiertoChange, zonaInicial, sedeInicial, onVerRegla }: Props) {
  const t = useTranslations('logistica.cotizar.simulador');
  const tc = useTranslations('logistica.cotizar');
  const { formatear } = useMonedaOrganizacion();
  const { branches } = useBranch();
  const [sede, setSede] = useState<string>('');
  const [canal, setCanal] = useState<CanalCotizacion>('web');
  const [metodo, setMetodo] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [barrio, setBarrio] = useState('');
  const [cp, setCp] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [peso, setPeso] = useState<number | null>(null);
  const [resultado, setResultado] = useState<RespuestaCotizar | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const sedeZona = zonaInicial?.branch_id ?? sedeInicial;
    setSede(sedeZona != null ? String(sedeZona) : branches[0] ? String(branches[0].id) : '');
    // Desde una zona: su primer barrio o municipio para probarla de una vez.
    const primera = zonaInicial?.ubicaciones?.[0];
    setBarrio(primera?.location_type === 'neighborhood' ? primera.neighborhood ?? '' : '');
    setCp(primera?.location_type === 'postal_code' ? primera.postal_code ?? '' : '');
    setCiudad(primera?.location_type === 'municipality' ? primera.municipality_code ?? '' : '');
    setResultado(null);
    setError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const calcular = async () => {
    setCargando(true);
    setError(false);
    try {
      const esDane = /^\d{4,5}$/.test(ciudad.trim());
      const r = await pedirCotizacion({
        branchId: sede ? Number(sede) : null,
        canal,
        subtotal: valor ?? 0,
        direccion: { ciudad: esDane ? null : ciudad, municipioDane: esDane ? ciudad.trim() : null, barrio, codigoPostal: cp },
        metodoPago: metodo || null,
        pesoKg: peso,
      });
      setResultado(r);
    } catch {
      setResultado(null);
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  const c = resultado?.cotizacion ?? null;
  const estado = estadoCotizacion(c);
  const llega = c ? [c.despacho ? (c.despacho.hoy ? t('hoy') : formatPlainDate(c.despacho.fecha, { weekday: 'short', day: 'numeric', month: 'short' })) : null, textoTiempoCotizacion(c)].filter(Boolean).join(', ') : '';

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Calculator}
      ancho={672}
      textoCancelar={t('cerrar')}
      primario={{ etiqueta: t('calcular'), onClick: () => void calcular(), cargando }}
      secundarios={c?.regla_id && onVerRegla ? [{ etiqueta: t('verRegla'), onClick: () => onVerRegla(c.regla_id as string) }] : undefined}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('saleDe')}>
            {(f) => (
              <Select value={sede} onValueChange={setSede}>
                <SelectTrigger id={f.id} aria-labelledby={f.idEtiqueta} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('metodoPago')} ayuda={t('metodoPagoAyuda')}>
            <Input value={metodo} maxLength={40} placeholder={t('metodoPagoPlaceholder')} onChange={(e) => setMetodo(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('ciudad')} ayuda={t('ciudadAyuda')}>
            <Input value={ciudad} maxLength={80} onChange={(e) => setCiudad(e.target.value)} />
          </FormField>
          <FormField etiqueta={tc('pos.barrio')}>
            <Input value={barrio} maxLength={80} onChange={(e) => setBarrio(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('codigoPostal')}>
            <Input value={cp} maxLength={12} inputMode="numeric" onChange={(e) => setCp(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('valor')}>
            <CampoNumero valor={valor} onValorChange={setValor} minimo={0} decimales={0} />
          </FormField>
          <FormField etiqueta={t('peso')}>
            <CampoNumero valor={peso} onValorChange={setPeso} minimo={0} decimales={2} sufijo="kg" />
          </FormField>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-fg">{t('canal')}</span>
            <SegmentedControl
              opciones={CANALES.map((v) => ({ valor: v, etiqueta: t(`canales.${v}`) }))}
              valor={canal}
              onValorChange={setCanal}
              etiqueta={t('canal')}
              anchoCompleto
            />
          </div>
        </div>

        {error && <AvisoTonal tono="peligro" titulo={tc('error.titulo')} descripcion={tc('error.descripcion')} compacto />}

        {c && estado === 'sin_zonas' && <AvisoTonal tono="informacion" titulo={t('sinZonas.titulo')} descripcion={t('sinZonas.descripcion')} compacto />}

        {c && estado !== null && estado !== 'sin_zonas' && (
          <div className="flex flex-col gap-3 rounded-lg border border-line-brand bg-brand-tint p-4" role="status">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-fg">{nombreZona(c) ?? t('fueraDeZona')}</p>
              <StatusBadge
                estado={estado}
                etiqueta={estado === 'en_zona' ? t('ganaZona') : t(`estados.${estado}`)}
                tono={estado === 'en_zona' ? 'marca' : 'advertencia'}
                tamano="sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-fg-secondary">{t('envio')}</p>
                <p className="text-lg font-semibold tabular-nums text-fg">{c.precio === null ? '—' : c.envio_gratis ? tc('gratis') : formatear(c.precio)}</p>
              </div>
              <div>
                <p className="text-xs text-fg-secondary">{t('llega')}</p>
                <p className="text-lg font-semibold text-fg">{llega || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-fg-secondary">{t('corte')}</p>
                <p className="text-lg font-semibold text-fg">{c.despacho?.corte ? c.despacho.corte.slice(0, 5) : '—'}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {c.falta_para_envio_gratis != null && c.falta_para_envio_gratis > 0 && (
                <FilaDato etiqueta={t('faltaGratis')} valor={formatear(c.falta_para_envio_gratis)} />
              )}
              {!c.cumple_minimo && <FilaDato etiqueta={t('faltaMinimo')} valor={formatear(c.falta_para_minimo)} tono="advertencia" />}
              <FilaDato etiqueta={t('regla')} valor={c.regla_id ? t('reglaAplica') : t('reglaNinguna')} />
              {resultado?.municipioDane && <FilaDato etiqueta={t('dane')} valor={resultado.municipioDane} />}
            </div>
          </div>
        )}
      </div>
    </Dialogo>
  );
}
