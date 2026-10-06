'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Eye, Loader2, Save, Settings } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal, EmptyState, FormField, PageHeader } from '@/components/kit';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { clasesBoton } from '@/components/kit/botonClases';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { AJUSTES_POR_DEFECTO, MOMENTOS_AVISO, type AjustesAvisos, type CanalAviso, type MomentoAviso } from '@/lib/pos/pedidosWeb/avisosCliente';
import { AvisosError, guardarAjustes, leerAjustes } from './avisosClienteApi';
import { VistaPreviaAvisoDialog } from './VistaPreviaAvisoDialog';

/**
 * Configuración › POS › Avisos al cliente (Figma 464:241318): seis momentos
 * del pedido online con interruptor por canal, la plantilla y su vista previa,
 * y los datos del remitente. Guardar exige administración (en el servidor).
 */
export function AvisosClientePage({ inicial }: { inicial?: { ajustes: AjustesAvisos; puedeEditar: boolean; disponible: boolean } } = {}) {
  const t = useTranslations('posAvisosCliente');
  const { toast } = useToast();
  const [ajustes, setAjustes] = React.useState<AjustesAvisos | null>(inicial?.ajustes ?? null);
  const [puedeEditar, setPuedeEditar] = React.useState(inicial?.puedeEditar ?? false);
  const [disponible, setDisponible] = React.useState(inicial?.disponible ?? true);
  const [error, setError] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [vista, setVista] = React.useState<MomentoAviso | null>(null);

  const cargar = React.useCallback(() => {
    setError(false);
    leerAjustes()
      .then((r) => {
        setAjustes(r.ajustes);
        setPuedeEditar(r.puedeEditar);
        setDisponible(r.disponible);
      })
      .catch(() => setError(true));
  }, []);
  React.useEffect(() => {
    if (!inicial) cargar();
  }, [cargar, inicial]);

    const alternar = (m: MomentoAviso, c: CanalAviso, v: boolean) =>
    setAjustes((a) => (a ? { ...a, momentos: { ...a.momentos, [m]: { ...a.momentos[m], [c]: v } } } : a));

  const guardar = async () => {
    if (!ajustes) return;
    setGuardando(true);
    try {
      await guardarAjustes(ajustes);
      toast({ title: t('guardado') });
    } catch (err) {
      const codigo = err instanceof AvisosError ? err.codigo : 'error';
      toast({
        title: t('errorGuardar'),
        description: codigo === 'no_disponible' ? t('pendienteMigracion') : codigo === 'sin_permiso' ? t('sinPermiso') : codigo === 'datos_invalidos' ? t('datosInvalidos') : undefined,
        variant: 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  };

  const a = ajustes ?? AJUSTES_POR_DEFECTO;
  const bloqueado = !puedeEditar || !disponible;

  return (
    <div className="flex flex-col gap-4 bg-canvas px-4 pb-6 pt-4 sm:px-6 lg:pt-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Settings}
        cargando={!ajustes && !error}
        migas={[{ etiqueta: t('migaConfiguracion'), href: '/app/configuracion' }, { etiqueta: 'POS', href: '/app/configuracion?modulo=pos' }]}
        acciones={
          <button type="button" disabled={guardando || bloqueado} onClick={() => void guardar()} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {t('guardar')}
          </button>
        }
      />

      {error ? (
        <EmptyState variante="error" titulo={t('errorCargar')} onReintentar={cargar} />
      ) : (
        <>
          <AvisoTonal
            tono="informacion"
            titulo={!disponible ? t('pendienteMigracion') : !puedeEditar ? t('soloLectura') : t('comoSalen')}
            compacto
          />

          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
                <tr>
                  <th className="px-3 py-3.5 font-medium">{t('col.momento')}</th>
                  <th className="px-3 py-3.5 font-medium">{t('col.cuando')}</th>
                  <th className="w-24 px-3 py-3.5 font-medium">{t('col.correo')}</th>
                  <th className="w-28 px-3 py-3.5 font-medium">{t('col.whatsapp')}</th>
                  <th className="px-3 py-3.5 font-medium">{t('col.plantilla')}</th>
                  <th className="w-36 px-3 py-3.5"><span className="sr-only">{t('vistaPrevia')}</span></th>
                </tr>
              </thead>
              <tbody>
                {MOMENTOS_AVISO.map((m) => (
                  <tr key={m} className="border-t border-line">
                    <td className="px-3 py-3 font-semibold text-fg">{t(`momentos.${m}.nombre`)}</td>
                    <td className="px-3 py-3 text-xs text-fg-secondary">{t(`momentos.${m}.cuando`)}</td>
                    {(['email', 'whatsapp'] as const).map((c) => (
                      <td key={c} className="px-3 py-3">
                        <Checkbox
                          checked={a.momentos[m][c]}
                          disabled={bloqueado}
                          onCheckedChange={(v) => alternar(m, c, v === true)}
                          aria-label={t('alternar', { canal: t(`col.${c === 'email' ? 'correo' : 'whatsapp'}`), momento: t(`momentos.${m}.nombre`) })}
                        />
                      </td>
                    ))}
                    <td className="max-w-[200px] px-3 py-3 text-[11px] text-fg-muted">{t(`momentos.${m}.plantilla`)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setVista(m)}
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        {t('vistaPrevia')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <FormField etiqueta={t('responderA')} ayuda={t('responderAAyuda')}>
              <input
                type="email"
                value={a.responderA ?? ''}
                disabled={bloqueado}
                onChange={(e) => setAjustes((x) => (x ? { ...x, responderA: e.target.value.trim() || null } : x))}
                placeholder="pedidos@mi-dominio.co"
                className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 disabled:opacity-60"
              />
            </FormField>
            <FormField etiqueta={t('nombreVisible')} ayuda={t('nombreVisibleAyuda')}>
              <input
                value={a.nombreVisible ?? ''}
                maxLength={80}
                disabled={bloqueado}
                onChange={(e) => setAjustes((x) => (x ? { ...x, nombreVisible: e.target.value || null } : x))}
                className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 disabled:opacity-60"
              />
            </FormField>
            <FormField etiqueta={t('numeroWhatsapp')} ayuda={t('numeroWhatsappAyuda')}>
              <PhoneInput
                value={a.whatsapp ?? ''}
                disabled={bloqueado}
                onChange={(v) => setAjustes((x) => (x ? { ...x, whatsapp: v || null } : x))}
              />
            </FormField>
          </div>

          <div className={cn('rounded-lg border border-line-warning bg-warning-subtle px-3 py-2.5 text-[13px] text-warning-text')}>
            {t('sinDatos')}
          </div>
        </>
      )}

      <VistaPreviaAvisoDialog momento={vista} onCerrar={() => setVista(null)} />
    </div>
  );
}
