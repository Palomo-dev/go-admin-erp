'use client';

/**
 * Editor de código a medida. CodeMirror 6 con HTML y, dentro, JavaScript en
 * `<script>` y CSS en `<style>`. Lo carga `EditorCodigoDiferido` (sin SSR).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type Extension, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { forceLinting, linter } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { useTheme } from 'next-themes';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { PosicionCodigo } from '@/lib/website/configuracionSitio';
import { diagnosticarCodigo, PLACEHOLDER_CODIGO, textoMarcaCodigo } from '@/lib/website/validacionCodigo';
import { useTextosConfiguracion } from './textos';
import { accionEscapeEditor } from './escapeEditorCodigo';

/** Nombre accesible del campo, el mismo de la etiqueta «Código». */
export const ETIQUETA_EDITOR_CODIGO = 'Código';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const TEMA_MONO = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px' },
  '.cm-scroller, .cm-content, .cm-gutters': { fontFamily: MONO },
});

const AJUSTE_EDITOR = {
  lineNumbers: true,
  foldGutter: true,
  searchKeymap: true,
  closeBrackets: true,
  closeBracketsKeymap: true,
  indentOnInput: true,
  tabSize: 2,
  autocompletion: true,
  bracketMatching: true,
  foldKeymap: true,
  lintKeymap: true,
  highlightActiveLine: true,
} as const;

const AJUSTE_PREVIA = {
  lineNumbers: true,
  foldGutter: false,
  searchKeymap: false,
  closeBrackets: false,
  indentOnInput: false,
  tabSize: 2,
  autocompletion: false,
  highlightActiveLine: false,
} as const;

export interface EditorCodigoProps {
  valor: string;
  onChange?: (valor: string) => void;
  posicion: PosicionCodigo;
  soloLectura?: boolean;
  /** Vista previa: tres líneas, sin lint ni pantalla completa. */
  compacto?: boolean;
  id?: string;
  descritoPor?: string;
  invalido?: boolean;
}

export function EditorCodigo({
  valor,
  onChange,
  posicion,
  soloLectura,
  compacto,
  id,
  descritoPor,
  invalido,
}: EditorCodigoProps) {
  const t = useTextosConfiguracion();
  const { resolvedTheme } = useTheme();
  const raizRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const posicionRef = useRef(posicion);
  const tRef = useRef(t);
  const [completa, setCompleta] = useState(false);
  const [ampliado, setAmpliado] = useState(false);
  posicionRef.current = posicion;
  tRef.current = t;

  const extensiones = useMemo(() => {
    const lista: Extension[] = [
      html({ autoCloseTags: !compacto }),
      TEMA_MONO,
      EditorView.contentAttributes.of({
        'aria-label': ETIQUETA_EDITOR_CODIGO,
        spellcheck: 'false',
      }),
    ];
    if (!compacto) {
      lista.push(
        linter(
          (view) => diagnosticos(view.state.doc.toString(), posicionRef.current, tRef.current, view.state.doc.length),
          { delay: 80 },
        ),
      );
    }
    return lista;
  }, [compacto]);

  useEffect(() => {
    const vista = editorRef.current?.view;
    if (vista && !compacto) forceLinting(vista);
  }, [posicion, compacto, valor]);

  useEffect(() => {
    const sincronizar = () => setCompleta(document.fullscreenElement === raizRef.current);
    document.addEventListener('fullscreenchange', sincronizar);
    return () => document.removeEventListener('fullscreenchange', sincronizar);
  }, []);

  useEffect(() => {
    if (compacto || soloLectura) return;
    const alTecla = (event: KeyboardEvent) => {
      const raiz = raizRef.current;
      const accion = accionEscapeEditor({
        tecla: event.key,
        activo: document.activeElement,
        raiz,
        panelAbierto: !!raiz?.querySelector('.cm-panel'),
      });
      if (accion === 'ignorar') return;
      event.preventDefault();
      if (accion === 'cerrar-panel') return;
      if (document.fullscreenElement === raiz) void document.exitFullscreen?.();
      setAmpliado(false);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      event.stopPropagation();
    };
    window.addEventListener('keydown', alTecla, true);
    return () => window.removeEventListener('keydown', alTecla, true);
  }, [compacto, soloLectura]);

  useEffect(() => {
    const contenido = editorRef.current?.view?.contentDOM;
    if (!contenido) return;
    contenido.setAttribute('aria-label', ETIQUETA_EDITOR_CODIGO);
    contenido.spellcheck = false;
    if (id) contenido.id = id;
    else contenido.removeAttribute('id');
    if (descritoPor) contenido.setAttribute('aria-describedby', descritoPor);
    else contenido.removeAttribute('aria-describedby');
    if (invalido) contenido.setAttribute('aria-invalid', 'true');
    else contenido.removeAttribute('aria-invalid');
  }, [id, descritoPor, invalido, valor, compacto]);

  const alternarPantalla = () => {
    const nodo = raizRef.current;
    if (!nodo) return;
    if (document.fullscreenElement === nodo) {
      void document.exitFullscreen();
      return;
    }
    if (ampliado) {
      setAmpliado(false);
      return;
    }
    const pedir = nodo.requestFullscreen?.bind(nodo);
    if (!pedir) {
      setAmpliado(true);
      return;
    }
    void pedir().catch(() => setAmpliado(true));
  };

  const enPantalla = completa || ampliado;
  const tema = resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <div
      ref={raizRef}
      data-editor-codigo=""
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface',
        compacto ? 'h-20' : ampliado ? 'h-[70vh] min-h-[19rem] resize-none' : 'h-80 min-h-[19rem] resize-y',
        '[&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:max-h-none [&:fullscreen]:resize-none [&:fullscreen]:rounded-none [&:fullscreen]:p-3',
      )}
    >
      {!compacto && (
        <div className="flex shrink-0 justify-end border-b border-line px-1 py-1">
          <button
            type="button"
            aria-label={enPantalla ? t('codigo.salirPantalla') : t('codigo.pantallaCompleta')}
            onClick={alternarPantalla}
            className="inline-flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {enPantalla ? (
              <Minimize2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            ) : (
              <Maximize2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <CodeMirror
          ref={editorRef}
          value={valor}
          height="100%"
          minHeight={compacto ? '4.5rem' : '15rem'}
          theme={tema}
          basicSetup={compacto ? AJUSTE_PREVIA : AJUSTE_EDITOR}
          indentWithTab={!compacto && !soloLectura}
          editable={!soloLectura}
          readOnly={!!soloLectura}
          placeholder={compacto ? undefined : PLACEHOLDER_CODIGO}
          extensions={extensiones}
          className="h-full text-xs"
          onCreateEditor={(view) => {
            view.contentDOM.setAttribute('aria-label', ETIQUETA_EDITOR_CODIGO);
            view.contentDOM.spellcheck = false;
          }}
          onChange={(siguiente) => {
            if (!soloLectura && siguiente !== valor) onChange?.(siguiente);
          }}
        />
      </div>
    </div>
  );
}

function diagnosticos(
  codigo: string,
  posicion: PosicionCodigo,
  t: ReturnType<typeof useTextosConfiguracion>,
  largo: number,
) {
  return diagnosticarCodigo(codigo, posicion).marcas.flatMap((marca) => {
    const desde = Math.max(0, Math.min(marca.desde, largo));
    let hasta = Math.max(desde, Math.min(marca.hasta, largo));
    if (hasta === desde) hasta = Math.min(largo, desde + 1);
    if (desde === hasta) return [];
    return [
      {
        from: desde,
        to: hasta,
        severity: marca.gravedad === 'error' ? ('error' as const) : ('warning' as const),
        message: textoMarcaCodigo(t, marca),
      },
    ];
  });
}
