'use client';

/**
 * GO Asistente — panel del header (Figma «GO Asistente — escritorio
 * (propuesta)», sección `667:34452`; componente `AsistentePanelEscritorio`
 * 665:399342).
 *
 * Columna a la derecha de todo el shell (también del header) que empuja el
 * contenido: 400 px acoplado y 720 px ampliado (desde 1280 px), recordado por
 * navegador. En móvil, hoja a pantalla completa. Se abre con el botón del
 * header, la pestaña lateral o Ctrl/⌘+J; Esc cierra (o detiene la respuesta).
 *
 * Lo que NO cambia con el rediseño (y vigilan las pruebas):
 * - La organización sale de la sesión: aquí no viaja ni organización ni rol.
 * - La propuesta vive en el servidor; al confirmar solo se manda su `actionId`.
 * - El saldo se comprueba antes y se cobra después, en el servidor. El panel
 *   solo lo enseña y refresca al terminar un turno que llegó a consumir.
 * - Un stream cortado nunca se reintenta solo: pudo cobrar o dejar propuesta.
 *
 * El estado vive aquí; las piezas visuales están en `./assistant/*` y la
 * lógica pura en `@/lib/ai/assistant/panelUi`.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { MapPin } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { AssistantContext } from '@/lib/services/aiAssistantService';
import type { ActionOutcome, AssistantCreditsState, PendingAction, PendingQuestion } from '@/lib/ai/assistant/clientTypes';
import { uploadAssistantAttachments } from '@/lib/ai/assistant/attachments';
import { streamAssistant, type ToolStep } from '@/lib/ai/assistant/streamClient';
import {
  accionAtajo,
  avisoPorCodigo,
  contextoDesdeEvento,
  contextoParaServidor,
  contextoTrasEvento,
  contextoVigente,
  esAtajoAsistente,
  esSoloActualizacion,
  EVENTO_ABRIR_ASISTENTE,
  EVENTO_ESTADO_ASISTENTE,
  faseDelTurno,
  guardarModo,
  leerModo,
  respuestasEstimadas,
  sugerenciasReporte,
  type ContextoAsistente,
  type ModoPanel,
  type TipoAviso,
} from '@/lib/ai/assistant/panelUi';
import type { TarjetaReporte } from '@/lib/ai/assistant/tarjetaReporte';
import { useBranch } from '@/lib/context/BranchContext';
import Composer, { type ComposerAttachment } from './assistant/Composer';
import ConversationHistory from './assistant/ConversationHistory';
import CustomerFormDialog from './assistant/CustomerFormDialog';
import QuestionCard from './assistant/QuestionCard';
import PanelHeader from './assistant/PanelHeader';
import AssistantNotice from './assistant/AssistantNotice';
import WelcomeView from './assistant/WelcomeView';
import TurnInProgress from './assistant/TurnInProgress';
import MessageBubble, { type MensajeHilo } from './assistant/MessageBubble';
import EdgeTab from './assistant/EdgeTab';
import { usePaginaActual } from './assistant/usePaginaActual';
import ActionConfirmationForm from './ActionConfirmationForm';

interface AIAssistantPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  context: AssistantContext;
}

/** Aviso del turno (el de créditos se deriva del saldo, no se guarda aquí). */
interface AvisoTurno {
  tipo: TipoAviso;
  mensaje?: string;
}

export default function AIAssistantPanel(props: AIAssistantPanelProps) {
  // La sucursal activa no llegaba en el `context` del shell y el formulario de
  // clientes recibía `branchId = null` (hallazgo 12 del diseño). Se lee aquí,
  // del mismo `BranchProvider` que usa el selector del header.
  const { branches, selectedBranchId } = useBranch();
  const branchId = props.context.branchId ?? selectedBranchId ?? null;
  const branchName = props.context.branchName ?? branches.find((b) => b.id === branchId)?.name;
  const context = { ...props.context, branchId, branchName };
  // Un cambio de organización nunca reutiliza mensajes, adjuntos ni propuestas.
  return <AssistantSession key={props.context.organizationId} {...props} context={context} />;
}

function AssistantSession({
  isOpen,
  onToggle,
  context
}: AIAssistantPanelProps) {
  const t = useTranslations('asistente');
  const pagina = usePaginaActual();
  const [messages, setMessages] = useState<MensajeHilo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [correctionActionId, setCorrectionActionId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  /** Saldo de créditos de IA y estado del panel, visible al pie del composer. */
  const [credits, setCredits] = useState<AssistantCreditsState | null>(null);
  /** El aviso de créditos bajos se puede descartar; no insiste en cada turno. */
  const [lowCreditsDismissed, setLowCreditsDismissed] = useState(false);
  /** Aviso del último turno o de la última confirmación (error, sin permiso…). */
  const [aviso, setAviso] = useState<AvisoTurno | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  /** Pregunta con opciones esperando respuesta (se responde como mensaje). */
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [restoredActions, setRestoredActions] = useState<PendingAction[]>([]);
  /** Desenlace de la propuesta que se acaba de confirmar (la tarjeta lo muestra). */
  const [actionOutcome, setActionOutcome] = useState<ActionOutcome | null>(null);
  /** Texto que se va escribiendo mientras el modelo responde. */
  const [streamingText, setStreamingText] = useState('');
  /** Pasos de herramienta del turno en curso: "Buscando en el catálogo… → 6". */
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([]);
  /** Hilo persistido: sobrevive a cerrar el panel y a recargar la página. */
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  /**
   * Última acción ejecutada que todavía se puede deshacer. Se limpia al enviar
   * otro mensaje: ofrecer "deshacer" tres turnos después confunde sobre QUÉ se
   * va a deshacer.
   */
  const [undoable, setUndoable] = useState<{ actionId: string; label: string } | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  /** Formulario del módulo de clientes, abierto desde la tarjeta. */
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  /** Cambiar este número hace que el historial se recargue. */
  const [historyToken, setHistoryToken] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  /** Acoplado (400) o ampliado (720), recordado por navegador. */
  const [modo, setModoState] = useState<ModoPanel>('acoplado');
  /** Mandar la página actual como contexto (chip del composer). */
  const [usarContexto, setUsarContexto] = useState(true);
  /**
   * Contexto que una pantalla entregó al abrir el asistente (hoy, un reporte
   * con su periodo, sucursal y vista; Figma Reportes §22). Es dato de la
   * página, no permiso: el servidor revalida todo. Caduca al salir de la ruta.
   */
  const [contextoPagina, setContextoPagina] = useState<ContextoAsistente | null>(null);
  /** Texto del atajo según el sistema: «Ctrl+J» o «⌘J». */
  const [atajo, setAtajo] = useState('Ctrl+J');
  /** Anuncio para lectores de pantalla: la fase, no cada token. */
  const [anuncio, setAnuncio] = useState('');
  /** Texto del último turno que falló: «Reintentar» lo repite sin duplicar su burbuja. */
  const [turnoFallido, setTurnoFallido] = useState<string | null>(null);
  /** Permite cortar la respuesta en curso desde el boton de detener. */
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(() => () => {
    abortRef.current?.abort();
    for (const item of attachmentsRef.current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }, []);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // ── Respuesta en audio (F5, R2) ──────────────────────────────────────────
  // Preferencia del usuario (localStorage) × disponibilidad de la organización
  // (`ai_assistant_settings.tts_enabled`, que ahora llega al abrir el panel).
  const [speakReplies, setSpeakReplies] = useState(false);
  const [ttsUnavailable, setTtsUnavailable] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  /** Último mensaje copiado, para el "Copiado" efímero. */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const ocupado = isLoading || isExecutingAction || isUndoing;

  useEffect(() => {
    try {
      setSpeakReplies(window.localStorage.getItem('go-assistant:tts') === '1');
    } catch {
      /* sin localStorage, sin preferencia */
    }
    try {
      setModoState(leerModo(window.localStorage));
    } catch {
      /* acoplado */
    }
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setAtajo('⌘J');
  }, []);

  const setModo = useCallback((nuevo: ModoPanel) => {
    setModoState(nuevo);
    try {
      guardarModo(window.localStorage, nuevo);
    } catch {
      /* sin preferencia */
    }
  }, []);

  // El shell puede escucharlo para pasar el sidebar a rail en el ampliado.
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent(EVENTO_ESTADO_ASISTENTE, { detail: { abierto: isOpen, modo } }));
    } catch {
      /* sin CustomEvent: nada que avisar */
    }
  }, [isOpen, modo]);

  // Una pantalla abre el asistente con su contexto (`abrirAsistente`). El shell
  // abre el panel con el mismo evento; aquí solo se guarda el contexto.
  useEffect(() => {
    const alAbrir = (e: Event) => {
      const detalle = (e as CustomEvent).detail;
      if (!contextoDesdeEvento(detalle)) return;
      setContextoPagina((actual) => contextoTrasEvento(actual, detalle));
      if (!esSoloActualizacion(detalle)) setUsarContexto(true);
    };
    window.addEventListener(EVENTO_ABRIR_ASISTENTE, alAbrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ASISTENTE, alAbrir);
  }, []);

  // Al salir de la pantalla desde la que se abrió, el contexto deja de valer.
  useEffect(() => {
    setContextoPagina((actual) => (actual && !contextoVigente(actual, pagina.ruta) ? null : actual));
  }, [pagina.ruta]);
  const contextoReporte = contextoVigente(contextoPagina, pagina.ruta) ? contextoPagina : null;
  const sugerenciasContexto = useMemo(
    () => (usarContexto ? sugerenciasReporte(contextoReporte).map((s) => ({ texto: t(`reporte.sugerencias.${s.clave}`), icono: s.icono })) : []),
    [usarContexto, contextoReporte, t]
  );

  // La organización no activó la voz: «Escuchar» no se ofrece (antes se
  // descubría al primer clic fallido).
  useEffect(() => {
    if (credits?.ttsEnabled === false) {
      setTtsUnavailable(t('mensaje.vozNoActiva'));
      setSpeakReplies(false);
    }
  }, [credits?.ttsEnabled, t]);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    setSpeakingId(null);
  }, []);

  /** Lee un mensaje en voz alta. Se cobra en el servidor, solo si la org lo activó. */
  const speak = useCallback(
    async (messageId: string, text: string) => {
      stopSpeaking();
      if (!text.trim()) return;
      setSpeakingId(messageId);
      try {
        const res = await fetch('/api/ai-assistant/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (err.code === 'TTS_DISABLED' || err.code === 'TTS_NOT_CONFIGURED') {
            setTtsUnavailable(err.error || t('mensaje.vozNoActiva'));
            setSpeakReplies(false);
            try {
              window.localStorage.setItem('go-assistant:tts', '0');
            } catch {
              /* nada */
            }
          }
          setSpeakingId(null);
          return;
        }
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        audio.onended = () => stopSpeaking();
        audio.onerror = () => stopSpeaking();
        await audio.play();
      } catch (error) {
        console.error('[GO Assistant] No se pudo reproducir la respuesta:', error);
        setSpeakingId(null);
      }
    },
    [stopSpeaking, t]
  );

  /** Copiar una respuesta. `navigator.clipboard` no existe fuera de HTTPS. */
  const copyMessage = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((actual) => (actual === id ? null : actual)), 1500);
    } catch {
      /* sin portapapeles disponible: el usuario puede seleccionar el texto */
    }
  }, []);

  const toggleSpeakReplies = () => {
    const next = !speakReplies;
    setSpeakReplies(next);
    if (!next) stopSpeaking();
    try {
      window.localStorage.setItem('go-assistant:tts', next ? '1' : '0');
    } catch {
      /* nada */
    }
  };

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  /** Baja al final solo si la persona ya estaba abajo: no le roba la lectura. */
  const scrollToBottom = useCallback((suave = true) => {
    const caja = scrollRef.current;
    if (caja && caja.scrollHeight - caja.scrollTop - caja.clientHeight > 160) return;
    messagesEndRef.current?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'end' });
  }, []);

  /** El saldo se lee al abrir y se refresca al terminar cada turno. */
  const loadCredits = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-assistant/credits');
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.credits === 'number') {
        setCredits({
          credits: data.credits,
          level: data.level === 'empty' || data.level === 'low' ? data.level : 'ok',
          avgPerReply: typeof data.avgPerReply === 'number' ? data.avgPerReply : null,
          ttsEnabled: typeof data.ttsEnabled === 'boolean' ? data.ttsEnabled : null,
        });
      }
    } catch {
      /* sin saldo visible; el turno igual avisa si falta */
    }
  }, []);

  /** La ruta que se manda como contexto; `undefined` si la persona quitó el chip. */
  const rutaContexto = useCallback(
    () => (usarContexto && typeof window !== 'undefined' ? window.location.pathname : undefined),
    [usarContexto]
  );

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const response = await fetch('/api/ai-assistant/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Las sugerencias dependen de la pantalla: en Facturas de venta,
        // "crea una factura"; en Inventario, "sube este listado".
        body: JSON.stringify({ currentPath: rutaContexto() }),
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
      setSuggestions([t('bienvenida.respaldo1'), t('bienvenida.respaldo2'), t('bienvenida.respaldo3')]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [rutaContexto, t]);

  useEffect(() => {
    if (isOpen) void loadCredits();
  }, [isOpen, loadCredits]);

  // Las sugerencias dependen de la página: se piden al abrir y al cambiar de
  // pantalla, pero solo mientras se ve la bienvenida (con un hilo abierto no
  // se muestran y pedirlas sería una consulta por navegación para nada).
  const enBienvenida = messages.length === 0 && !pendingAction;
  // Con un reporte abierto, las sugerencias salen del propio reporte
  // (`sugerenciasReporte`): sin petición ni créditos.
  const conSugerenciasPropias = sugerenciasContexto.length > 0;
  useEffect(() => {
    if (isOpen && enBienvenida && !conSugerenciasPropias) void loadSuggestions();
  }, [isOpen, enBienvenida, conSugerenciasPropias, loadSuggestions, pagina.ruta]);

  // Sin créditos, al volver a la pestaña (quizá los compró en otra) se relee.
  useEffect(() => {
    if (!isOpen || credits?.level !== 'empty') return;
    const alVolver = () => void loadCredits();
    window.addEventListener('focus', alVolver);
    return () => window.removeEventListener('focus', alVolver);
  }, [isOpen, credits?.level, loadCredits]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingAction, pendingQuestion, aviso, scrollToBottom]);

  useEffect(() => {
    if (isLoading) scrollToBottom(false);
  }, [isLoading, streamingText, toolSteps, scrollToBottom]);

  // Al abrir, el foco va al composer (Figma: «Ctrl+J abre y enfoca aquí»).
  // En móvil no: enfocar abre el teclado y tapa media hoja sin que se haya pedido.
  useEffect(() => {
    if (isOpen && !isMobile) setFocusRequest((n) => n + 1);
  }, [isOpen, isMobile]);

  // Ctrl/⌘+J: abre y enfoca; con el panel abierto y el foco fuera, enfoca;
  // con el foco dentro, cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!esAtajoAsistente(e)) return;
      e.preventDefault();
      const focoDentro = Boolean(panelRef.current?.contains(document.activeElement));
      const accion = accionAtajo({ abierto: isOpen, focoDentro });
      if (accion === 'enfocar') setFocusRequest((n) => n + 1);
      else onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onToggle]);

  // Fase para lectores de pantalla: se anuncia el cambio, no cada token.
  const fase = isLoading ? faseDelTurno(toolSteps, streamingText) : null;
  useEffect(() => {
    if (fase) setAnuncio(t(`pasos.anuncio.${fase}`));
  }, [fase, t]);

  const clientContext = useCallback(
    () => ({
      userName: context.userName,
      branchName: context.branchName,
      currentPath: rutaContexto(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      // Reporte, periodo, sucursal y vista de la página: el servidor los valida.
      reporte: usarContexto && contextoReporte ? contextoParaServidor(contextoReporte) : undefined,
    }),
    [context.userName, context.branchName, rutaContexto, usarContexto, contextoReporte]
  );

  /**
   * Camino de respaldo (§3.1): si el stream no funciona —proxy que bufferiza,
   * navegador sin soporte, error del motor nuevo—, se responde por el endpoint
   * de siempre antes que devolver un error. El asistente nunca deja de
   * responder.
   */
  const sendViaFallback = useCallback(
    async (content: string) => {
      const response = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversationId,
          conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })),
          context: clientContext(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('aviso.errorTexto'));
      }

      const data = await response.json();
      if (typeof data.conversationId === 'string') setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', content: data.content }]);

      if (data.action) {
        setPendingAction(data.action as PendingAction);
      }
    },
    [messages, clientContext, conversationId, t]
  );

  const sendMessage = async (content: string) => {
    // Una tarjeta ya resuelta no se queda estorbando el turno siguiente.
    if (actionOutcome) {
      setActionOutcome(null);
      setPendingAction(restoredActions[0] ?? null);
      setRestoredActions((previous) => previous.slice(1));
    }
    // Con adjunto y sin texto se manda igual: "aquí tienes la factura" está
    // implícito. El modelo recibe los ids y sabe qué hacer.
    const texto = content.trim() || (attachments.length > 0 ? t('mensaje.leeDocumento') : '');
    if (!texto || isLoading || isExecutingAction || isUndoing) return;
    content = texto;

    const adjuntos = attachments.map((a) => ({ nombre: a.file.name, bytes: a.file.size, tipo: a.file.type }));
    const userMessage: MensajeHilo = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      adjuntos: adjuntos.length ? adjuntos : undefined,
    };

    // «Reintentar» tras un fallo no duplica la burbuja que ya está en el hilo.
    if (turnoFallido !== content) setMessages((prev) => [...prev, userMessage]);
    setTurnoFallido(null);
    setInputValue('');
    setAviso(null);
    setIsLoading(true);
    setStreamingText('');
    setToolSteps([]);
    setUndoable(null);

    // Contenedor en vez de dos `let`: TypeScript no ve que los callbacks del
    // stream se ejecuten, asi que estrecha las variables sueltas a `never` y
    // luego se queja al leerlas. El acceso por propiedad no sufre eso.
    const captured: {
      action: PendingAction | null;
      question: PendingQuestion | null;
      error: { message: string; code?: string } | null;
      forbidden: boolean;
      tarjetas: TarjetaReporte[];
    } = {
      action: null,
      question: null,
      error: null,
      forbidden: false,
      tarjetas: [],
    };

    try {
      const uploaded = await uploadAssistantAttachments(attachments, conversationId);
      setAttachments(uploaded.items);
      if (uploaded.errors.length) {
        setAviso({ tipo: 'error', mensaje: uploaded.errors.join(' ') });
        setInputValue(content);
        setTurnoFallido(content);
        return;
      }
      const attachmentIds = uploaded.ids;

      const controller = new AbortController();
      abortRef.current = controller;

      const result = await streamAssistant(
        { message: content, conversationId, context: clientContext(), attachmentIds, correctionActionId: correctionActionId ?? undefined },
        {
          onToken: (delta) => setStreamingText((prev) => prev + delta),
          // Los pasos de herramienta no son adorno: convierten la espera en
          // trabajo visible, que es lo que sostiene la confianza cuando la IA
          // va a tocar el catálogo.
          onToolStart: (step) => setToolSteps((prev) => [...prev, step]),
          onToolEnd: (step) =>
            setToolSteps((prev) =>
              prev.map((s) => (s.name === step.name && !s.summary ? { ...s, ...step, label: s.label } : s))
            ),
          onAction: (action) => {
            captured.action = action;
          },
          onQuestion: (question) => {
            captured.question = question;
          },
          // El nombre del modelo ya no se enseña al cliente (propuesta de escritorio §13).
          onUsage: () => undefined,
          onMeta: (meta) => setConversationId(meta.conversationId),
          onError: (err) => {
            captured.error = err;
          },
          onNotice: (notice) => {
            if (notice.code === 'FORBIDDEN_TOOL') captured.forbidden = true;
          },
          onReporte: (tarjeta) => {
            captured.tarjetas.push(tarjeta);
          },
        },
        controller.signal
      );

      if (!result.ok) {
        // Solo el transporte puede autorizar un reintento automático. Un corte
        // parcial/abortado puede haber consumido créditos o creado una propuesta.
        if (result.canFallback && !attachmentIds.length && !correctionActionId && !controller.signal.aborted) {
          await sendViaFallback(content);
          return;
        }
        // El mensaje vuelve al composer y el aviso va APARTE de la burbuja
        // (Figma pantalla 13): lo que sí llegó se conserva como respuesta.
        setInputValue(content);
        setTurnoFallido(content);
        if (captured.action) setPendingAction(captured.action);
        if (result.content) {
          const tarjetas = captured.tarjetas.length ? captured.tarjetas : undefined;
          setMessages((previous) => [...previous, { id: `partial-${Date.now()}`, role: 'assistant', content: result.content, tarjetas }]);
        }
        const cancelada = captured.error?.code === 'STREAM_ABORTED';
        if (!cancelada) {
          const tipo = avisoPorCodigo(captured.error?.code);
          setAviso({ tipo, mensaje: captured.error?.message });
          if (tipo === 'sin_creditos') {
            setCredits((previo) => (previo ? { ...previo, credits: 0, level: 'empty' } : previo));
          }
        }
        return;
      }

      // El saldo se refresca solo si el turno llegó a consumir créditos. Tras un
      // stream abortado o fallido no se hace NINGUNA llamada: ese es el
      // invariante que protege `assistantHistory.test.ts`.
      if (!captured.error && !controller.signal.aborted) void loadCredits();

      if (!captured.error && !controller.signal.aborted) {
        for (const item of uploaded.items) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        setAttachments((current) => current.filter((item) => !uploaded.items.some((sent) => sent.id === item.id)));
        setCorrectionActionId(null);
      } else {
        setInputValue(content);
      }
      const finalText = result.content || captured.error?.message || '';
      if (finalText) {
        const assistantId = `assistant-${Date.now()}`;
        const tarjetas = captured.tarjetas.length && !captured.error ? captured.tarjetas : undefined;
        setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: finalText, tarjetas }]);
        // R2: la respuesta también en audio, si el usuario lo pidió. No se
        // lee un error del sistema en voz alta.
        if (speakReplies && result.content && !captured.error) void speak(assistantId, result.content);
      }
      if (captured.forbidden) setAviso({ tipo: 'sin_permiso' });
      if (captured.question && !captured.error) setPendingQuestion(captured.question);

      if (captured.action) {
        setPendingAction(captured.action);
      }
      setAnuncio(t('pasos.anuncio.lista'));
    } catch (error) {
      console.error('Error sending message:', error);
      setInputValue(content);
      setTurnoFallido(content);
      setAviso({ tipo: 'error', mensaje: error instanceof Error ? error.message : undefined });
    } finally {
      abortRef.current = null;
      setStreamingText('');
      setToolSteps([]);
      setIsLoading(false);
      // El hilo acaba de cambiar de título o de contador: que el historial lo
      // refleje sin que el usuario tenga que reabrirlo.
      setHistoryToken((n) => n + 1);
    }
  };

  // Confirmar: se manda el id de la propuesta y las correcciones del usuario.
  // Nunca la organización, el rol ni el estado "confirmed" (C1).
  const handleConfirmAction = async (external?: { entityType: 'customer'; entityId: string }) => {
    if (!pendingAction || isLoading || isExecutingAction || isUndoing) return;
    setIsExecutingAction(true);
    setAviso(null);

    try {
      const response = await fetch('/api/ai-assistant/execute-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `external`: el usuario guardó en el formulario del módulo; la
        // propuesta se cierra con esa entidad, no se vuelve a escribir.
        body: JSON.stringify(external ? { actionId: pendingAction.id, external } : { actionId: pendingAction.id }),
      });

      const result = await response.json();

      // Los caminos de 401/403 (sesión caducada, sin permiso) responden
      // `{ error, code }`, no `{ message }`: leer solo `message` pintaba
      // "Error: undefined" justo cuando el usuario más necesita entender qué
      // pasó. Lo señaló el tester de F0 (fallo 10).
      const detalle = result.message || result.error || t('tarjeta.errorGenerico');

      // El desenlace se queda EN la tarjeta, no como un mensaje suelto con
      // ✅/❌ tres burbujas más abajo, desligado de lo que se confirmó.
      setActionOutcome({
        ok: Boolean(result.success),
        message: detalle,
        entity: result.entity ?? null,
        undoAvailable: Boolean(result.undoAvailable),
        undoUntil: typeof result.undoUntil === 'string' ? result.undoUntil : null,
      });

      if (!result.success) {
        const tipo = avisoPorCodigo(result.code);
        if (tipo === 'sin_permiso' || tipo === 'sesion') setAviso({ tipo, mensaje: detalle });
      }

      // El servidor decide si algo es reversible (guardó o no `undo_payload`).
      // El cliente solo pregunta; si no lo es, el endpoint responde que no y el
      // botón no se ofrece.
      if (result.success && result.undoAvailable) {
        setUndoable({ actionId: pendingAction.id, label: pendingAction.title });
      }
    } catch (error) {
      console.error('Error ejecutando acción:', error);
      setActionOutcome({ ok: false, message: t('tarjeta.errorRed') });
    } finally {
      setIsExecutingAction(false);
    }
  };

  // Rechazar: hay que decírselo al SERVIDOR. Cerrar la tarjeta en el navegador
  // dejaba la propuesta viva y ejecutable 30 minutos con solo reenviar su id, y
  // la auditoría nunca registraba que el usuario había dicho que no.
  const handleRejectAction = async (correct = false, caducada = false) => {
    if (!pendingAction || isExecutingAction || isLoading || isUndoing) return;
    setIsExecutingAction(true);
    try {
      const response = await fetch('/api/ai-assistant/reject-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: pendingAction.id }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || (correct && !result.rejected)) {
        throw new Error(t('tarjeta.errorCancelar'));
      }
      if (correct || caducada) {
        if (correct) setCorrectionActionId(pendingAction.id);
        setFocusRequest((value) => value + 1);
      }
      setMessages((prev) => [...prev, {
        id: 'reject-' + Date.now(), role: 'assistant',
        content: caducada ? t('tarjeta.caducadaMensaje') : correct ? t('tarjeta.corregirMensaje') : t('tarjeta.canceladaMensaje'),
      }]);
      setPendingAction(restoredActions[0] ?? null);
      setRestoredActions(previous => previous.slice(1));
    } catch (error) {
      setAviso({ tipo: 'error', mensaje: error instanceof Error ? error.message : t('tarjeta.errorCancelar') });
    } finally { setIsExecutingAction(false); }
  };

  /**
   * Retomar un hilo guardado. Cierra la deuda que quedó de F1: la conversación
   * SÍ se persistía, pero el panel arrancaba siempre en blanco, así que para el
   * usuario seguía perdiéndose al cerrar.
   */
  const handleSelectConversation = useCallback(async (id: string) => {
    if (isLoading || isExecutingAction || isUndoing) return;
    setShowHistory(false);
    setIsLoading(true);
    try {
      const response = await fetch(`/api/ai-assistant/conversations/${id}`);
      if (!response.ok) throw new Error('No se pudo abrir la conversación');
      const data = await response.json();
      setCorrectionActionId(null);
      const mensajes = Array.isArray(data.messages) ? data.messages : [];
      const pending = Array.isArray(data.pendingActions) ? data.pendingActions as PendingAction[] : [];
      setPendingAction(pending[0] ?? null);
      setRestoredActions(pending.slice(1));
      setActionOutcome(null);
      setPendingQuestion(null);
      setAviso(null);
      setTurnoFallido(null);
      setUndoable(null);
      setInputValue('');
      setAttachments(items => {
        for (const item of items) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        return [];
      });
      setMessages(
        mensajes.map((m: { id: string; role: string; content: string }) => ({
          id: m.id,
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content ?? '',
        }))
      );
      setConversationId(id);
    } catch (error) {
      console.error('Error abriendo la conversación:', error);
      setAviso({ tipo: 'error', mensaje: t('historial.errorAbrir') });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isExecutingAction, isUndoing, t]);

  /** Deshacer la última acción, dentro de su ventana de tiempo. */
  const handleUndo = useCallback(async () => {
    if (!undoable || isUndoing || isLoading || isExecutingAction) return;
    setIsUndoing(true);
    try {
      const response = await fetch('/api/ai-assistant/undo-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: undoable.actionId }),
      });
      const result = await response.json();
      const detalle = result.message || result.error || t('tarjeta.errorDeshacer');

      // El botón desaparece pase lo que pase: si se deshizo, ya no hay nada que
      // deshacer; si no se pudo, insistir no va a cambiar el resultado y el
      // mensaje ya explica por qué. La tarjeta refleja lo ocurrido en su sitio.
      setUndoable(null);
      setActionOutcome((previo) =>
        previo
          ? { ...previo, ok: previo.ok, undone: Boolean(result.success), message: detalle, undoAvailable: false }
          : previo
      );
    } catch (error) {
      console.error('Error deshaciendo:', error);
      setUndoable(null);
      setActionOutcome((previo) => (previo ? { ...previo, undoAvailable: false, message: t('tarjeta.errorDeshacer') } : previo));
    } finally {
      setIsUndoing(false);
    }
  }, [undoable, isUndoing, isLoading, isExecutingAction, t]);

  /** Adjuntar: por boton, por arrastrar y soltar, o pegando una captura. */
  const handleAttach = useCallback((files: File[]) => {
    const MAX_BYTES = 20 * 1024 * 1024;
    const nuevos = files
      .filter((f) => f.size <= MAX_BYTES)
      .map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }));
    if (nuevos.length < files.length) {
      setAviso({ tipo: 'error', mensaje: t('composer.limiteArchivo') });
    }
    setAttachments((prev) => [...prev, ...nuevos].slice(0, 10));
  }, [t]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      // Los `blob:` de la vista previa hay que liberarlos a mano o quedan
      // retenidos mientras viva la pestana.
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  /** Cortar la respuesta en curso. Lo que ya llego se conserva. */
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleAttach(files);
    },
    [handleAttach]
  );

  const clearConversation = () => {
    if (isLoading || isExecutingAction || isUndoing) return;
    setShowHistory(false);
    setCorrectionActionId(null);
    setUndoable(null);
    setAttachments((items) => {
      for (const item of items) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
    setMessages([]);
    setTurnoFallido(null);
    setPendingAction(null);
    setPendingQuestion(null);
    setActionOutcome(null);
    setRestoredActions([]);
    setAviso(null);
    // Se abre un hilo NUEVO en vez de seguir escribiendo en el anterior: el
    // historial queda intacto y recuperable desde la base.
    setConversationId(null);
    setStreamingText('');
    setToolSteps([]);
    setFocusRequest((n) => n + 1);
  };

  /** Esc: detiene la respuesta; si no hay, vuelve del historial; si no, cierra. */
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    if (isLoading) stopStreaming();
    else if (showHistory) setShowHistory(false);
    else onToggle();
  };

  const sinCreditos = credits?.level === 'empty';
  /** Chip del composer: el reporte (o el centro de reportes) en vez del nombre de la página. */
  const nombreContexto = contextoReporte ? (contextoReporte.reporte?.titulo ?? pagina.nombre ?? t('reporte.centro')) : pagina.nombre;
  /** Chip superior (Figma 22-02): «Reporte: Ventas por día · 1–30 sep · Sucursal Principal». */
  const chipReporte = contextoReporte
    ? (() => {
        const sucursal = contextoReporte.sucursal.nombre ?? (contextoReporte.sucursal.id === null ? t('reporte.todasSucursales') : null);
        const partes = [contextoReporte.periodo.etiqueta, sucursal].filter(Boolean).join(' · ');
        return contextoReporte.reporte
          ? t('reporte.chip', { reporte: contextoReporte.reporte.titulo, detalle: partes })
          : t('reporte.chipCentro', { detalle: partes });
      })()
    : null;
  const hayHilo = messages.length > 0 || Boolean(pendingAction);
  const ampliado = modo === 'ampliado';

  // Contenido compartido del asistente (cabecera + hilo + composer + pie)
  const renderAssistantContent = () => (
    <div
      ref={panelRef}
      className="relative flex h-full min-h-0 flex-col bg-surface"
      onKeyDown={onPanelKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        // Solo cuando el puntero sale del panel entero, no al pasar por encima
        // de un hijo: si no, la superposicion parpadea.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-brand-tint/95">
          <p className="text-sm font-medium text-brand-deep">{t('composer.soltar')}</p>
        </div>
      )}

      <PanelHeader
        vista={showHistory ? 'historial' : 'chat'}
        modo={modo}
        esMovil={isMobile}
        ocupado={ocupado}
        hayConversacion={hayHilo}
        vozActiva={speakReplies}
        vozNoDisponible={ttsUnavailable}
        onNueva={clearConversation}
        onHistorial={() => { if (!ocupado) setShowHistory((v) => !v); }}
        onVolver={() => setShowHistory(false)}
        onVoz={toggleSpeakReplies}
        onModo={setModo}
        onCerrar={onToggle}
      />

      <p className="sr-only" role="status" aria-live="polite">{anuncio}</p>

      {showHistory ? (
        <ConversationHistory
          activeId={conversationId}
          onSelect={handleSelectConversation}
          refreshToken={historyToken}
          className="min-h-0 flex-1"
        />
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className={cn('flex flex-col gap-4', ampliado && 'mx-auto max-w-[680px]')}>
            {chipReporte && usarContexto && (
              <p className="flex max-w-full items-center gap-1.5 self-start rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-fg-secondary">
                <MapPin aria-hidden className="size-3 shrink-0" strokeWidth={1.5} />
                <span className="min-w-0 truncate" title={chipReporte}>{chipReporte}</span>
              </p>
            )}
            {!hayHilo ? (
              <WelcomeView
                nombre={context.userName}
                pagina={usarContexto ? nombreContexto : null}
                sugerencias={conSugerenciasPropias ? sugerenciasContexto : suggestions}
                cargando={!conSugerenciasPropias && loadingSuggestions}
                texto={usarContexto && contextoReporte ? t('reporte.bienvenida', { reporte: nombreContexto ?? '' }) : undefined}
                tituloSugerencias={conSugerenciasPropias ? t('reporte.preguntas') : undefined}
                deshabilitado={ocupado || sinCreditos}
                onSugerencia={(s) => void sendMessage(s)}
              />
            ) : (
              <>
                {/*
                  Sin avatares y sin el degradado morado: el turno se distingue
                  por la forma (el usuario en una burbuja azul a la derecha, el
                  asistente a todo el ancho), que es como se lee un chat de
                  verdad y deja sitio para tablas y tarjetas.
                */}
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    mensaje={message}
                    ampliado={ampliado}
                    puedeEscuchar={!ttsUnavailable}
                    leyendo={speakingId === message.id}
                    copiado={copiedId === message.id}
                    onCopiar={copyMessage}
                    onEscuchar={speak}
                    onDetenerLectura={stopSpeaking}
                  />
                ))}
              </>
            )}

            {/*
              Turno en curso: pasos reales mientras consulta, y en cuanto llega
              el primer token los pasos se pliegan (<details>) y el texto se
              escribe con cursor.
            */}
            {isLoading && <TurnInProgress pasos={toolSteps} texto={streamingText} />}

            {pendingQuestion && !pendingAction && !isLoading && (
              <QuestionCard
                question={pendingQuestion}
                enfocar={!isMobile}
                onAnswer={(texto) => {
                  setPendingQuestion(null);
                  void sendMessage(texto);
                }}
                onOther={() => {
                  setPendingQuestion(null);
                  setFocusRequest((n) => n + 1);
                }}
              />
            )}

            {pendingAction && (
              <div>
                <ActionConfirmationForm
                  action={pendingAction}
                  outcome={actionOutcome}
                  onUndo={() => void handleUndo()}
                  isUndoing={isUndoing}
                  onConfirm={() => void handleConfirmAction()}
                  onReject={() => void handleRejectAction()}
                  onCorrect={() => void handleRejectAction(true)}
                  onExpiredDismiss={() => void handleRejectAction(false, true)}
                  onOpenForm={() => setShowCustomerForm(true)}
                  isExecuting={isExecutingAction || isLoading || isUndoing}
                  modo={isMobile ? 'acoplado' : modo}
                  onVerEnGrande={isMobile ? undefined : () => setModo('ampliado')}
                  enfocar={!isMobile}
                />
                {showCustomerForm && (
                  <CustomerFormDialog
                    action={pendingAction}
                    organizationId={context.organizationId}
                    branchId={context.branchId ?? null}
                    open={showCustomerForm}
                    onOpenChange={setShowCustomerForm}
                    onCreated={(customerId) => void handleConfirmAction({ entityType: 'customer', entityId: customerId })}
                  />
                )}
              </div>
            )}

            {aviso && !isLoading && (
              <AssistantNotice
                tipo={aviso.tipo}
                mensaje={aviso.mensaje}
                saldo={credits?.credits ?? null}
                onReintentar={inputValue.trim() ? () => void sendMessage(inputValue) : undefined}
                onDescartar={() => setAviso(null)}
              />
            )}

            {/* Sin créditos: se avisa al abrir, no después de escribir (Figma 12). */}
            {sinCreditos && aviso?.tipo !== 'sin_creditos' && <AssistantNotice tipo="sin_creditos" saldo={0} />}

            {credits?.level === 'low' && !lowCreditsDismissed && hayHilo && !isLoading && (
              <AssistantNotice
                tipo="creditos_bajos"
                saldo={credits.credits}
                respuestas={respuestasEstimadas(credits.credits, credits.avgPerReply)}
                onDescartar={() => setLowCreditsDismissed(true)}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      <Composer
        focusRequest={focusRequest}
        disabled={isExecutingAction || isUndoing}
        value={inputValue}
        onChange={setInputValue}
        onSubmit={() => sendMessage(inputValue)}
        onStop={stopStreaming}
        isLoading={isLoading}
        attachments={attachments}
        onAttach={handleAttach}
        onRemoveAttachment={handleRemoveAttachment}
        attachmentsEnabled={true}
        credits={credits}
        contexto={{ pagina: nombreContexto, activo: usarContexto, onAlternar: () => setUsarContexto((v) => !v) }}
      />

      {/* Sin el nombre del modelo: es un dato del proveedor, no del cliente. */}
      <p className="flex shrink-0 flex-wrap items-center justify-center gap-x-1 bg-surface px-4 pb-2.5 text-center text-xs font-medium text-fg-muted">
        <span>{t('pie.aviso')}</span>
        <span aria-hidden="true">·</span>
        <a href="/app/configuracion/asistente" className="rounded py-1 text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand">
          {t('pie.permisos')}
        </a>
      </p>
    </div>
  );

  return (
    <>
      {/* Escritorio: columna que empuja el contenido (400 px, o 720 px ampliado desde 1280 px). */}
      {!isMobile && (
        <aside
          aria-label={t('cabecera.titulo')}
          className={cn(
            'hidden h-full flex-shrink-0 flex-col overflow-hidden border-line bg-surface transition-[width] duration-300 ease-in-out motion-reduce:transition-none lg:flex',
            isOpen ? cn('border-l', ampliado ? 'w-[400px] xl:w-[720px]' : 'w-[400px]') : 'w-0'
          )}
          // Cerrado no debe quedar en el orden de tabulación ni para el lector.
          inert={!isOpen || undefined}
        >
          {renderAssistantContent()}
        </aside>
      )}

      {/* Pestaña lateral para abrirlo (solo escritorio y con el panel cerrado). */}
      {!isOpen && !isMobile && <EdgeTab onAbrir={onToggle} atajo={atajo} />}

      {/* Móvil: hoja a pantalla completa desde la derecha. */}
      {isMobile && (
        <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onToggle(); }}>
          <SheetContent
            side="right"
            className="w-full sm:w-full sm:max-w-full p-0 border-0 [&>button:last-child]:hidden"
          >
            <VisuallyHidden.Root>
              <SheetTitle>{t('cabecera.titulo')}</SheetTitle>
            </VisuallyHidden.Root>
            {renderAssistantContent()}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
