'use client';

/**
 * «Probar las reglas con un pedido» (Figma 2795:2020). No crea el envío: pregunta a la cotización
 * del servidor qué regla decide (`regla_id`) y muestra el recorrido en el orden de la base.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Minus, Pause, XCircle } from 'lucide-react';
import { CampoNumero, Dialogo, FormField, SegmentedControl, StatusBadge } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { pedirCotizacion, type RespuestaCotizar } from '@/components/logistica/cotizar/useCotizacionDomicilio';
import type { CanalCotizacion } from '@/lib/logistica/cotizacion';
import type { ReglaDespacho } from '@/lib/logistica/zonas';
import { nombreZona, textoTiempoCotizacion } from '@/lib/logistica/presentacionEnvio';
import { cn } from '@/utils/Utils';
import { recorridoReglas, type PasoRecorrido } from './reglasPresentacion';
import type { MetodoPagoOpcion } from './ReglasDespacho';

interface Props {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  reglas: readonly ReglaDespacho[];
  metodos: readonly MetodoPagoOpcion[];
}

const CANALES: readonly CanalCotizacion[] = ['web', 'pos', 'manual'];

const ICONO_PASO: Record<PasoRecorrido, typeof CheckCircle2> = {
  decide: CheckCircle2,
  no_aplica: XCircle,
  sin_evaluar: Minus,
  en_pausa: Pause,
  otra_sede: Minus,
};

export function PruebaReglas({ abierto, onAbiertoChange, reglas, metodos }: Props) {
  const t = useTranslations('logistica.reglas.prueba');
  const tr = useTranslations('logistica.reglas');
  const tc = useTranslations('logistica.cotizar');
  const { formatear } = useMonedaOrganizacion();
  const { branches, branchFilter } = useBranch();
  const [sede, setSede] = useState('');
  const [canal, setCanal] = useState<CanalCotizacion>('web');
  const [metodo, setMetodo] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [barrio, setBarrio] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [peso, setPeso] = useState<number | null>(null);
  const [resultado, setResultado] = useState<RespuestaCotizar | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setSede(branchFilter != null ? String(branchFilter) : branches[0] ? String(branches[0].id) : '');
    setResultado(null);
    setError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const probar = async () => {
    setCargando(true);
    setError(false);
    try {
      setResultado(
        await pedirCotizacion({
          branchId: sede ? Number(sede) : null,
          canal,
          subtotal: valor ?? 0,
          direccion: { ciudad, barrio },
          metodoPago: metodo || null,
          pesoKg: peso,
        }),
      );
    } catch {
      setResultado(null);
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  const c = resultado?.cotizacion ?? null;
  const recorrido = c ? recorridoReglas(reglas, c.regla_id, sede ? Number(sede) : null) : [];
  const decidio = recorrido.find((p) => p.paso === 'decide')?.regla ?? null;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={672}
      textoCancelar={t('cerrar')}
      primario={{ etiqueta: c ? t('otro') : t('probar'), onClick: () => void probar(), cargando }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('sede')}>
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
          <FormField etiqueta={t('metodo')}>
            {(f) => (
              <Select value={metodo || 'ninguno'} onValueChange={(v) => setMetodo(v === 'ninguno' ? '' : v)}>
                <SelectTrigger id={f.id} aria-labelledby={f.idEtiqueta} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">{t('sinMetodo')}</SelectItem>
                  {metodos.map((m) => (
                    <SelectItem key={m.codigo} value={m.codigo}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('ciudad')}>
            <Input value={ciudad} maxLength={80} onChange={(e) => setCiudad(e.target.value)} />
          </FormField>
          <FormField etiqueta={tc('pos.barrio')}>
            <Input value={barrio} maxLength={80} onChange={(e) => setBarrio(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('valor')}>
            <CampoNumero valor={valor} onValorChange={setValor} minimo={0} decimales={0} />
          </FormField>
          <FormField etiqueta={t('peso')}>
            <CampoNumero valor={peso} onValorChange={setPeso} minimo={0} decimales={2} sufijo="kg" />
          </FormField>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium text-fg">{t('canal')}</span>
            <SegmentedControl opciones={CANALES.map((v) => ({ valor: v, etiqueta: tr(`canales.${v}`) }))} valor={canal} onValorChange={setCanal} etiqueta={t('canal')} />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-danger-text">{tc('error.descripcion')}</p>}

        {c && (
          <>
            <section aria-labelledby="prueba-recorrido" className="flex flex-col gap-2">
              <h3 id="prueba-recorrido" className="text-base font-semibold text-fg">
                {t('recorrido')}
              </h3>
              <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {recorrido.map(({ regla, paso }) => {
                  const Icono = ICONO_PASO[paso];
                  return (
                    <li key={regla.id} className={cn('flex items-start gap-3 px-4 py-3', paso === 'decide' && 'bg-success-subtle')}>
                      <Icono aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', paso === 'decide' ? 'text-success-text' : paso === 'no_aplica' ? 'text-danger-text' : 'text-fg-muted')} strokeWidth={1.5} />
                      <div>
                        <p className="text-sm font-medium text-fg">
                          {regla.priority} · {regla.name}
                        </p>
                        <p className="text-xs text-fg-secondary">{t(`pasos.${paso}`)}</p>
                      </div>
                    </li>
                  );
                })}
                <li className={cn('flex items-start gap-3 px-4 py-3', !decidio && 'bg-success-subtle')}>
                  {decidio ? <Minus aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-muted" strokeWidth={1.5} /> : <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-text" strokeWidth={1.5} />}
                  <div>
                    <p className="text-sm font-medium text-fg">{tr('final.titulo')}</p>
                    <p className="text-xs text-fg-secondary">{decidio ? t('finalNoUsado') : t('finalUsado')}</p>
                  </div>
                </li>
              </ol>
            </section>

            <div className="flex flex-col gap-3 rounded-lg border border-line-brand bg-brand-tint p-4" role="status">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-fg">{t('loEntrega')}</p>
                {decidio && <StatusBadge estado="regla" etiqueta={t('regla', { orden: decidio.priority })} tono="marca" tamano="sm" />}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-fg-secondary">{t('zona')}</p>
                  <p className="text-sm font-semibold text-fg">{nombreZona(c) ?? t('fueraDeZona')}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-secondary">{t('cobra')}</p>
                  <p className="text-sm font-semibold tabular-nums text-fg">{c.precio === null ? '—' : c.envio_gratis ? tc('gratis') : formatear(c.precio)}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-secondary">{t('tiempo')}</p>
                  <p className="text-sm font-semibold text-fg">{textoTiempoCotizacion(c) ?? '—'}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialogo>
  );
}
