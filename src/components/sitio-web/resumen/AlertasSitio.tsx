'use client';

/**
 * «Alertas» del Resumen (Figma A/02a; móvil A/02f solo la primera): dominio mal
 * configurado (peligro), dominio por vencer (advertencia) y sin pasarela
 * (información), ya ordenadas por el servidor. Cada una con icono, título del
 * color del tono, texto y un botón con verbo concreto. `AvisoTonal` del kit.
 */
import { AvisoTonal } from '@/components/kit';
import type { AlertaSitio } from '@/lib/website/resumenSitio';
import { useTextosResumen } from './textos';

export function AlertaDelSitio({ alerta }: { alerta: AlertaSitio }) {
  const t = useTextosResumen();
  const texto = (c: { clave: string; valores?: Record<string, string | number> }) => t(`resumen.${c.clave}`, c.valores);
  return (
    <AvisoTonal
      tono={alerta.tono}
      rol={alerta.tono === 'peligro' ? 'alert' : 'note'}
      titulo={texto(alerta.titulo)}
      descripcion={texto(alerta.descripcion)}
      accion={{ etiqueta: texto(alerta.accion.etiqueta), href: alerta.accion.href }}
    />
  );
}

export function AlertasSitio({ alertas }: { alertas: readonly AlertaSitio[] }) {
  const t = useTextosResumen();
  if (alertas.length === 0) return null;
  return (
    <section aria-labelledby="alertas-sitio-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 lg:p-5">
      <h2 id="alertas-sitio-titulo" className="text-base font-semibold leading-6 text-fg">
        {t('resumen.alertas.titulo')}
      </h2>
      <div className="flex flex-col gap-2">
        {alertas.map((a) => (
          <AlertaDelSitio key={a.id} alerta={a} />
        ))}
      </div>
    </section>
  );
}
