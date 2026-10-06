'use client';

/**
 * Diálogo «Nueva página» (Figma A/04b): grilla de plantillas de página del giro (TemplateCard
 * con miniatura de sección; «En blanco» siempre al final), nombre y dirección con la pista
 * `<host>/<dirección>`, y «Mostrar en el menú del encabezado». Crea la página en el BORRADOR.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialogo, FormField, SettingRow } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SectionThumbnail } from '@/components/sitio-web/ui/SectionThumbnail';
import { TemplateCard } from '@/components/sitio-web/ui/TemplateCard';
import { plantillasParaGiro, slugDesdeTexto, slugLibre, type Giro, type IdPlantillaPagina } from './plantillasPagina';
import { useTextosPaginas } from './textos';
import type { CodigoErrorPagina } from './tiposPaginas';

export interface DatosNuevaPagina {
  plantilla: IdPlantillaPagina;
  titulo: string;
  slug: string;
  enMenu: boolean;
}

export interface NuevaPaginaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  giro: Giro;
  /** Direcciones ya usadas en el documento (para sugerir una libre y avisar antes de enviar). */
  slugsUsados: readonly string[];
  host: string | null;
  /** Crea la página; devuelve el código de error de la operación o `null` si salió bien. */
  onCrear: (datos: DatosNuevaPagina) => Promise<CodigoErrorPagina | 'otro' | null>;
}

export function NuevaPaginaDialog({ abierto, onAbiertoChange, giro, slugsUsados, host, onCrear }: NuevaPaginaDialogProps) {
  const t = useTextosPaginas();
  const plantillas = useMemo(() => plantillasParaGiro(giro), [giro]);
  const usados = useMemo(() => new Set(slugsUsados), [slugsUsados]);
  const [plantilla, setPlantilla] = useState<IdPlantillaPagina>(plantillas[0].id);
  const [titulo, setTitulo] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEditado, setSlugEditado] = useState(false);
  const [enMenu, setEnMenu] = useState(true);
  const [creando, setCreando] = useState(false);
  const [intento, setIntento] = useState(false);
  const [errorServidor, setErrorServidor] = useState<CodigoErrorPagina | 'otro' | null>(null);

  const elegir = (id: IdPlantillaPagina) => {
    setPlantilla(id);
    const nombre = t(`nueva.nombreSugerido.${id}`);
    setTitulo(nombre);
    setSlug(slugLibre(slugDesdeTexto(nombre), usados));
    setSlugEditado(false);
    setEnMenu(id !== 'legal');
    setErrorServidor(null);
  };

  useEffect(() => {
    if (!abierto) return;
    setIntento(false);
    setCreando(false);
    setErrorServidor(null);
    const inicial = plantillas[0].id;
    setPlantilla(inicial);
    const nombre = t(`nueva.nombreSugerido.${inicial}`);
    setTitulo(nombre);
    setSlug(slugLibre(slugDesdeTexto(nombre), usados));
    setSlugEditado(false);
    setEnMenu(true);
    // Solo al abrir: no se reinicia mientras la persona escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const slugLimpio = slugDesdeTexto(slug.replace(/^\/+/, ''));
  const errorTitulo = intento && !titulo.trim() ? t('nueva.nombreObligatorio') : errorServidor === 'titulo_vacio' ? t('nueva.nombreObligatorio') : null;
  const errorSlug =
    intento && !slugLimpio
      ? t('nueva.direccionObligatoria')
      : slugLimpio && usados.has(slugLimpio)
        ? t('nueva.direccionRepetida')
        : errorServidor === 'slug_repetido'
          ? t('nueva.direccionRepetida')
          : errorServidor === 'slug_de_sede'
            ? t('nueva.direccionDeSede')
          : errorServidor === 'slug_invalido'
            ? t('nueva.direccionInvalida')
            : null;

  const crear = async () => {
    setIntento(true);
    if (!titulo.trim() || !slugLimpio || usados.has(slugLimpio)) return;
    setCreando(true);
    setErrorServidor(null);
    try {
      const error = await onCrear({ plantilla, titulo: titulo.trim(), slug: slugLimpio, enMenu });
      if (error) setErrorServidor(error);
    } finally {
      setCreando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('nueva.titulo')}
      descripcion={t('nueva.descripcion')}
      ancho={880}
      textoCancelar={t('nueva.cancelar')}
      primario={{ etiqueta: t('nueva.crear'), onClick: () => void crear(), cargando: creando }}
    >
      <div role="radiogroup" aria-label={t('nueva.plantillas')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {plantillas.map((p) => (
          <TemplateCard
            key={p.id}
            rol="radio"
            nombre={t(`nueva.plantilla.${p.id}`)}
            seleccionada={plantilla === p.id}
            onSeleccionar={() => elegir(p.id)}
            miniatura={
              <SectionThumbnail
                tipo={p.miniatura === 'en_blanco' ? 'llamado_accion' : p.miniatura}
                soloDibujo
                className="size-full border-0"
              />
            }
            className="gap-2 p-2"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
        <FormField etiqueta={t('nueva.nombre')} obligatorio error={errorTitulo}>
          <Input
            value={titulo}
            maxLength={200}
            onChange={(e) => {
              setTitulo(e.target.value);
              setErrorServidor(null);
              if (!slugEditado) setSlug(slugLibre(slugDesdeTexto(e.target.value), usados));
            }}
          />
        </FormField>
        <FormField
          etiqueta={t('nueva.direccion')}
          obligatorio
          error={errorSlug}
          ayuda={host ? `${host}/${slugLimpio}` : undefined}
        >
          <Input
            value={`/${slug.replace(/^\/+/, '')}`}
            maxLength={121}
            onChange={(e) => {
              setSlug(e.target.value.replace(/^\/+/, ''));
              setSlugEditado(true);
              setErrorServidor(null);
            }}
            onBlur={() => setSlug(slugLimpio)}
          />
        </FormField>
      </div>

      <SettingRow titulo={t('nueva.mostrarEnMenu')} descripcion={t('nueva.mostrarEnMenuAyuda')} htmlFor="nueva-pagina-en-menu">
        <Switch id="nueva-pagina-en-menu" checked={enMenu} onCheckedChange={setEnMenu} />
      </SettingRow>
      {errorServidor === 'otro' && (
        <p role="alert" className="text-sm text-danger-text">
          {t('lista.noSePudo')}
        </p>
      )}
    </Dialogo>
  );
}
