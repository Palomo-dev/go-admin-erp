'use client';

/**
 * «Vista previa · Así lo ve tu cliente · en vivo» del formulario del checkout (Figma Parte F: F1–F3
 * columna derecha, F6 en el celular). Pinta el formulario de la TIENDA con lo que hay en el
 * diálogo, sin guardar: solo lo visible, en su orden, con «(opcional)» agregado solo, y con borde
 * punteado lo que cambió respecto a lo guardado (F2). En computador, correo y celular comparten
 * fila (como en la tienda); en el celular, una columna.
 *
 * Los textos de los campos son los de la tienda (en español, como los ve el cliente); los de la
 * vista previa (título, nota) son del ERP y se traducen.
 */
import { Monitor, Plus, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { SegmentedControl } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { defCampoFormulario, esFormularioRecomendado, type ClaveCampoFormulario } from '@/lib/website/formularioCheckout';
import { clavesCambiadas, etiquetaEnTienda, filasDeSeccion, textosDe, type FilaFormulario } from './formularioLogica';
import { useTextosFormulario } from './textosFormulario';

type Dispositivo = 'computador' | 'celular';

/** Textos de la tienda (los ve el cliente; el sitio está en español). */
const TIENDA = {
  titulo: 'Finalizar compra',
  contacto: 'Contacto',
  entrega: '¿Cómo lo recibes?',
  agregarIndicaciones: 'Agregar indicaciones para el repartidor (opcional)',
  ejemploCelular: '300 123 4567',
} as const;

function Campo({ fila, configurado, cambiado }: { fila: FilaFormulario; configurado: boolean; cambiado: boolean }) {
  const def = defCampoFormulario(fila.clave);
  const textos = textosDe(fila);
  const etiqueta = etiquetaEnTienda(fila, configurado);
  const marco = cambiado ? 'rounded-md outline-dashed outline-2 outline-offset-2 outline-brand-action' : '';
  if (fila.clave === 'factura') {
    return (
      <div className={cn('flex items-start gap-2', marco)} data-previa-campo={fila.clave}>
        <span aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 rounded-sm border border-gray-300 bg-white" />
        <span className="flex flex-col">
          <span className="text-[11px] leading-4 text-gray-900">{etiqueta}</span>
          {textos.ayuda ? <span className="text-[9px] leading-3 text-gray-500">{textos.ayuda}</span> : null}
        </span>
      </div>
    );
  }
  const ejemplo = textos.placeholder || (fila.clave === 'celular' ? TIENDA.ejemploCelular : '');
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', marco)} data-previa-campo={fila.clave}>
      <span className="text-[10px] font-medium leading-3 text-gray-700">{etiqueta}</span>
      <span className="flex h-7 items-center gap-1.5 truncate rounded-md border border-gray-300 bg-white px-2 text-[10px] text-gray-400">
        {fila.clave === 'celular' ? <span className="shrink-0 font-medium text-gray-700">+57</span> : null}
        <span className="truncate">{ejemplo}</span>
      </span>
      {textos.ayuda && def.clave !== 'ciudad' ? <span className="text-[9px] leading-3 text-gray-500">{textos.ayuda}</span> : null}
    </div>
  );
}

/** Junta correo y celular (contacto) y apto y barrio (entrega) en una fila de dos en computador. */
function filasPrevia(lista: FilaFormulario[], dispositivo: Dispositivo): FilaFormulario[][] {
  if (dispositivo === 'celular') return lista.map((f) => [f]);
  const pares: [ClaveCampoFormulario, ClaveCampoFormulario][] = [['email', 'celular'], ['complemento', 'barrio']];
  const filas: FilaFormulario[][] = [];
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i];
    const b = lista[i + 1];
    if (b && pares.some(([x, y]) => (a.clave === x && b.clave === y) || (a.clave === y && b.clave === x))) {
      filas.push([a, b]);
      i++;
    } else filas.push([a]);
  }
  return filas;
}

export function VistaPreviaFormulario({
  filas,
  filasGuardadas,
  dispositivoInicial = 'computador',
}: {
  filas: FilaFormulario[];
  filasGuardadas: FilaFormulario[];
  dispositivoInicial?: Dispositivo;
}) {
  const t = useTextosFormulario();
  const [dispositivo, setDispositivo] = useState<Dispositivo>(dispositivoInicial);
  const configurado = !esFormularioRecomendado(filas);
  const cambiados = new Set(clavesCambiadas(filasGuardadas, filas));
  const contacto = filasDeSeccion(filas, 'contacto').filter((f) => f.visible);
  const entrega = filasDeSeccion(filas, 'entrega').filter((f) => f.visible && f.clave !== 'notas');
  const notas = filas.find((f) => f.clave === 'notas');

  const bloque = (lista: FilaFormulario[]) =>
    filasPrevia(lista, dispositivo).map((fila) => (
      <div key={fila.map((f) => f.clave).join('-')} className={cn('grid gap-2', fila.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {fila.map((f) => (
          <Campo key={f.clave} fila={f} configurado={configurado} cambiado={cambiados.has(f.clave)} />
        ))}
      </div>
    ));

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface" data-vista-previa-formulario={dispositivo}>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{t('vistaPrevia.titulo')}</p>
          <p className="text-xs text-fg-secondary">{t('vistaPrevia.subtitulo')}</p>
        </div>
        <SegmentedControl
          etiqueta={t('vistaPrevia.dispositivo')}
          tamano="sm"
          tonoActivo="marca"
          opciones={[
            { valor: 'computador', etiqueta: t('vistaPrevia.computador'), icono: Monitor, soloIcono: true },
            { valor: 'celular', etiqueta: t('vistaPrevia.celular'), icono: Smartphone, soloIcono: true },
          ]}
          valor={dispositivo}
          onValorChange={setDispositivo}
        />
      </div>
      <div className="bg-[#F5F5F4] px-3 py-3">
        <div className={cn('mx-auto flex flex-col gap-2.5', dispositivo === 'celular' ? 'max-w-[260px]' : 'max-w-none')}>
          <p className="text-sm font-semibold text-gray-900">{TIENDA.titulo}</p>
          {contacto.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[11px] font-semibold text-gray-900">{TIENDA.contacto}</p>
              {bloque(contacto)}
            </div>
          )}
          {(entrega.length > 0 || notas?.visible) && (
            <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[11px] font-semibold text-gray-900">{TIENDA.entrega}</p>
              {bloque(entrega)}
              {notas?.visible ? (
                notas.obligatorio ? (
                  <Campo fila={notas} configurado={configurado} cambiado={cambiados.has('notas')} />
                ) : (
                  <span className={cn('flex items-center gap-1 text-[10px] font-medium text-[#C2410C]', cambiados.has('notas') && 'rounded-md outline-dashed outline-2 outline-offset-2 outline-brand-action')}>
                    <Plus aria-hidden="true" className="size-3" />
                    {/* La tienda pinta este botón con su texto de siempre (según el tipo de entrega). */}
                    {TIENDA.agregarIndicaciones}
                  </span>
                )
              ) : null}
            </div>
          )}
        </div>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-xs text-fg-secondary">{t('vistaPrevia.nota')}</p>
    </div>
  );
}
