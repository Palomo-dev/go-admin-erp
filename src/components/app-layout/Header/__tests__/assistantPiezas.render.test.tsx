/**
 * @jest-environment jsdom
 *
 * GO Asistente — render de las piezas clave del panel (Figma «GO Asistente —
 * escritorio (propuesta)», `667:34452`) con el proveedor real de next-intl.
 * Sin jest-dom: se comprueban atributos y textos con la API de Testing Library.
 */
import { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import ActionConfirmationForm from '../ActionConfirmationForm';
import QuestionCard from '../assistant/QuestionCard';
import AssistantNotice from '../assistant/AssistantNotice';
import BulkPreviewTable from '../assistant/BulkPreviewTable';
import PanelHeader from '../assistant/PanelHeader';
import Composer from '../assistant/Composer';
import WelcomeView from '../assistant/WelcomeView';
import type { PendingAction } from '@/lib/ai/assistant/clientTypes';

jest.mock('react-virtuoso', () => ({
  // jsdom no mide: se pintan todas las filas para poder leerlas.
  Virtuoso: ({ data, itemContent }: { data: unknown[]; itemContent: (i: number, d: unknown) => React.ReactNode }) => (
    <div>{data.map((d, i) => <div key={i}>{itemContent(i, d)}</div>)}</div>
  ),
}));

const enMinutos = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
const UUID = '3f2b8c1e-0a4d-4e7b-9c21-5d6e7f8a9b0c';

function propuesta(extra: Partial<PendingAction> = {}): PendingAction {
  return {
    id: 'a1',
    type: 'create_customer',
    title: 'Crear cliente',
    description: 'Voy a crear este cliente en tu organización.',
    risk: 'medium',
    fields: [],
    expiresAt: enMinutos(30),
    preview: {
      summary: 'Voy a crear este cliente en tu organización. Revisa los datos.',
      lines: [{ label: 'Nombre', value: 'Laura Méndez' }, { label: 'Tipo', value: 'Persona natural' }],
      warnings: [],
      reversible: true,
    },
    ...extra,
  };
}

function manejadores() {
  return { onConfirm: jest.fn(), onCorrect: jest.fn(), onReject: jest.fn(), onOpenForm: jest.fn(), onUndo: jest.fn() };
}

describe('Tarjeta de confirmación', () => {
  test('pendiente: «Por confirmar», dice que confirmar no gasta créditos y confirma con un clic', () => {
    const h = manejadores();
    renderConIdioma(<ActionConfirmationForm action={propuesta()} {...h} />);
    const tarjeta = screen.getByRole('region', { name: /Confirmar acción: Crear cliente/ });
    expect(within(tarjeta).getByText('Por confirmar')).toBeTruthy();
    expect(tarjeta.textContent).toContain('Confirmar no gasta créditos');
    expect(tarjeta.textContent).not.toContain('crédito ·');
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar$/ }));
    expect(h.onConfirm).toHaveBeenCalledTimes(1);
  });

  test('teclado con el foco en la tarjeta: Ctrl+Enter confirma y Esc rechaza', () => {
    const h = manejadores();
    renderConIdioma(<ActionConfirmationForm action={propuesta()} {...h} />);
    const tarjeta = screen.getByRole('region', { name: /Confirmar acción/ });
    fireEvent.keyDown(tarjeta, { key: 'Enter', ctrlKey: true });
    expect(h.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(tarjeta, { key: 'Escape' });
    expect(h.onReject).toHaveBeenCalledTimes(1);
  });

  test('riesgo alto: el resumen se repite y solo el segundo «Sí, confirmar» ejecuta (§6.2)', () => {
    const h = manejadores();
    renderConIdioma(<ActionConfirmationForm action={propuesta({ risk: 'high', type: 'create_stock_adjustment', title: 'Ajustar inventario' })} {...h} />);
    expect(screen.getByText('Esta acción tiene impacto contable.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar$/ }));
    expect(h.onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/^Vas a:/)).toBeTruthy();
    // Esc vuelve al resumen en vez de rechazar.
    fireEvent.keyDown(screen.getByRole('region', { name: /Confirmar acción/ }), { key: 'Escape' });
    expect(h.onReject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sí, confirmar/ }));
    expect(h.onConfirm).toHaveBeenCalledTimes(1);
  });

  test('caducada: no se puede confirmar y ofrece pedir un resumen nuevo', () => {
    const h = manejadores();
    renderConIdioma(<ActionConfirmationForm action={propuesta({ expiresAt: enMinutos(-1) })} {...h} />);
    expect(screen.queryByRole('button', { name: /^Confirmar$/ })).toBeNull();
    expect(screen.getByText('Caducó')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Pedir un resumen nuevo/ }));
    expect(h.onReject).toHaveBeenCalledTimes(1);
    expect(h.onConfirm).not.toHaveBeenCalled();
  });

  test('completada: «Ver cliente» a su ficha y «Deshacer» con los minutos que quedan', () => {
    const h = manejadores();
    renderConIdioma(
      <ActionConfirmationForm
        action={propuesta()}
        {...h}
        outcome={{ ok: true, message: 'Cliente "Laura Méndez" creado.', entity: { type: 'customer', id: UUID }, undoAvailable: true, undoUntil: enMinutos(12) }}
      />
    );
    expect(screen.getByText('Hecha')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ver cliente/ }).getAttribute('href')).toBe(`/app/clientes/${UUID}`);
    fireEvent.click(screen.getByRole('button', { name: /Deshacer · 12 min/ }));
    expect(h.onUndo).toHaveBeenCalledTimes(1);
  });

  test('deshecha: sin «Ver» ni «Deshacer»; error: «Corregir y reintentar»', () => {
    const h = manejadores();
    const { unmount } = renderConIdioma(
      <ActionConfirmationForm action={propuesta()} {...h} outcome={{ ok: true, undone: true, message: 'Deshecho.', entity: { type: 'customer', id: UUID } }} />
    );
    expect(screen.getByText('Deshecha')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: /Deshacer/ })).toBeNull();
    unmount();
    renderConIdioma(<ActionConfirmationForm action={propuesta()} {...h} outcome={{ ok: false, message: 'Falló.' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Corregir y reintentar/ }));
    expect(h.onCorrect).toHaveBeenCalledTimes(1);
  });
});

describe('Pregunta A/B/C', () => {
  const pregunta = {
    question: '¿Laura Méndez es persona natural o empresa?',
    options: [{ key: 'A', label: 'Persona natural (cédula)' }, { key: 'B', label: 'Empresa (NIT)' }, { key: 'C', label: 'No sé, lo reviso después' }],
    allowOther: true,
  };

  test('la letra responde, «O» es Otro y el atajo se enseña', () => {
    const onAnswer = jest.fn();
    const onOther = jest.fn();
    renderConIdioma(<QuestionCard question={pregunta} onAnswer={onAnswer} onOther={onOther} />);
    const tarjeta = screen.getByRole('region', { name: 'Pregunta del asistente' });
    expect(tarjeta.textContent).toContain('Atajo: pulsa A, B o C');
    fireEvent.keyDown(tarjeta, { key: 'b' });
    expect(onAnswer).toHaveBeenCalledWith('Empresa (NIT)');
    fireEvent.keyDown(tarjeta, { key: 'c', ctrlKey: true });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(tarjeta, { key: 'o' });
    expect(onOther).toHaveBeenCalledTimes(1);
  });
});

describe('Avisos', () => {
  test('sin créditos: bloquea (alert), lleva a comprar y no ofrece reintentar', () => {
    renderConIdioma(<AssistantNotice tipo="sin_creditos" saldo={0} onReintentar={jest.fn()} />);
    const aviso = screen.getByRole('alert');
    expect(aviso.textContent).toContain('Sin créditos de IA');
    expect(within(aviso).getByRole('link', { name: 'Comprar créditos' }).getAttribute('href')).toBe('/app/plan');
    expect(within(aviso).queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  test('créditos bajos: el saldo y las respuestas que alcanzan según el promedio real', () => {
    renderConIdioma(<AssistantNotice tipo="creditos_bajos" saldo={18} respuestas={3} onDescartar={jest.fn()} />);
    const aviso = screen.getByRole('status');
    expect(aviso.textContent).toContain('Te quedan 18 créditos');
    expect(aviso.textContent).toContain('Alcanzan para unas 3 respuestas.');
    // No promete una fecha de renovación que la base no tiene.
    expect(aviso.textContent).not.toMatch(/renueva el/);
  });

  test('error: el mensaje vuelve al composer y «Reintentar» es manual', () => {
    const onReintentar = jest.fn();
    renderConIdioma(<AssistantNotice tipo="error" mensaje="La conexión se interrumpió." onReintentar={onReintentar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  test('sin permiso: lleva a los permisos del asistente', () => {
    renderConIdioma(<AssistantNotice tipo="sin_permiso" />);
    expect(screen.getByRole('link', { name: 'Ver mis permisos' }).getAttribute('href')).toBe('/app/configuracion/asistente');
  });

  test('en inglés, con el plural del idioma', () => {
    renderConIdioma(<AssistantNotice tipo="creditos_bajos" saldo={1} respuestas={0} />, { idioma: 'en' });
    expect(screen.getByRole('status').textContent).toContain('You have 1 credit left');
  });
});

describe('Carga masiva (acoplado)', () => {
  const bulk = {
    total: 5,
    nuevos: 3,
    duplicados: 1,
    conErrores: 1,
    rows: [
      { n: 1, estado: 'nuevo' as const, nombre: 'Camiseta básica M', sku: 'CAM-M', barcode: null, precio: 35000, costo: null, stock: 20, coincide: null, motivo: null },
      { n: 27, estado: 'existente' as const, nombre: 'Gorra negra', sku: 'GOR-NEG', barcode: null, precio: 28000, costo: null, stock: 15, coincide: 'sku' as const, motivo: null },
      { n: 14, estado: 'error' as const, nombre: 'Jean slim 30', sku: null, barcode: null, precio: null, costo: null, stock: 12, coincide: null, motivo: 'Sin precio' },
    ],
  };

  test('contadores, las filas con problemas primero y «Ver en grande» amplía el panel', () => {
    const onVerEnGrande = jest.fn();
    renderConIdioma(<BulkPreviewTable bulk={bulk} onVerEnGrande={onVerEnGrande} />);
    expect(screen.getByText('3 nuevos')).toBeTruthy();
    expect(screen.getByText('1 ya existe')).toBeTruthy();
    expect(screen.getByText('1 se omite')).toBeTruthy();
    const filas = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(filas[0]).toContain('#14');
    expect(filas[0]).toContain('Sin precio: se omite');
    expect(filas[1]).toContain('Coincide por SKU');
    fireEvent.click(screen.getByRole('button', { name: /Ver las 5 filas en grande/ }));
    expect(onVerEnGrande).toHaveBeenCalledTimes(1);
  });

  test('ampliado: tabla con SKU, precio y estado', () => {
    renderConIdioma(<BulkPreviewTable bulk={bulk} modo="ampliado" />);
    const tabla = screen.getByRole('table', { name: 'Filas de la carga' });
    expect(within(tabla).getAllByRole('row')).toHaveLength(4);
    expect(tabla.textContent).toContain('GOR-NEG');
    expect(tabla.textContent).toContain('Ya existe');
  });
});

describe('Cabecera', () => {
  const base = {
    modo: 'acoplado' as const, esMovil: false, ocupado: false, hayConversacion: true, vozActiva: false, vozNoDisponible: null,
    onNueva: jest.fn(), onHistorial: jest.fn(), onVolver: jest.fn(), onVoz: jest.fn(), onModo: jest.fn(), onCerrar: jest.fn(),
  };

  test('chat: «GO Asistente», historial bloqueado mientras responde y ampliar', () => {
    renderConIdioma(<PanelHeader {...base} vista="chat" ocupado />);
    expect(screen.getByRole('heading', { name: 'GO Asistente' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Conversaciones anteriores' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar' }));
    expect(base.onModo).toHaveBeenCalledWith('ampliado');
  });

  test('historial: «Conversaciones» con ← y sin voz', () => {
    renderConIdioma(<PanelHeader {...base} vista="historial" />);
    expect(screen.getByRole('heading', { name: 'Conversaciones' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la conversación' }));
    expect(base.onVolver).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Responder en audio' })).toBeNull();
  });

  test('la voz no activada en la organización se ve deshabilitada con el motivo', () => {
    renderConIdioma(<PanelHeader {...base} vista="chat" vozNoDisponible="Tu organización no tiene activada la respuesta en audio." />);
    expect((screen.getByRole('button', { name: /no tiene activada/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('deshabilitados conservan el círculo claro del Figma (no se apagan enteros)', () => {
    renderConIdioma(
      <PanelHeader {...base} vista="chat" hayConversacion={false} vozNoDisponible="Tu organización no tiene activada la respuesta en audio." />
    );
    const voz = screen.getByRole('button', { name: /no tiene activada/ }) as HTMLButtonElement;
    const nueva = screen.getByRole('button', { name: 'Nueva conversación' }) as HTMLButtonElement;
    for (const boton of [voz, nueva]) {
      expect(boton.disabled).toBe(true);
      expect(boton.className).toContain('bg-fg-on-brand/20');
      expect(boton.className).not.toContain('opacity-50');
      // Envoltorio para que el tooltip con el motivo salga aunque el botón no reciba el puntero.
      expect(boton.parentElement?.tagName).toBe('SPAN');
    }
    const historial = screen.getByRole('button', { name: 'Conversaciones anteriores' });
    expect(historial.className).toContain('bg-fg-on-brand/20');
  });
});

describe('Bienvenida', () => {
  test('sugerencias con el fondo tintado del Figma (lienzo), no blancas', () => {
    const onSugerencia = jest.fn();
    renderConIdioma(
      <WelcomeView nombre="Ana" pagina="Inicio" sugerencias={['¿Cómo van las ventas de hoy?']} cargando={false} onSugerencia={onSugerencia} />
    );
    const sugerencia = screen.getByRole('button', { name: '¿Cómo van las ventas de hoy?' });
    expect(sugerencia.className).toContain('bg-canvas');
    expect(sugerencia.className).toContain('rounded-xl');
    expect(sugerencia.className).not.toContain('bg-surface');
    fireEvent.click(sugerencia);
    expect(onSugerencia).toHaveBeenCalledWith('¿Cómo van las ventas de hoy?');
  });

  test('con un reporte abierto (Figma Reportes 22-02): texto y encabezado propios, sugerencias con su icono', () => {
    const onSugerencia = jest.fn();
    renderConIdioma(
      <WelcomeView
        nombre="Ana"
        pagina="Ventas del periodo"
        texto="Respondo sobre Ventas del periodo con los filtros que tienes aplicados."
        tituloSugerencias="Preguntas sobre este reporte"
        sugerencias={[{ texto: 'Compara este periodo con el anterior por sucursal', icono: 'sucursal' }, '¿Qué día vendimos más y por qué?']}
        cargando={false}
        onSugerencia={onSugerencia}
      />
    );
    expect(screen.getByText('Respondo sobre Ventas del periodo con los filtros que tienes aplicados.')).toBeTruthy();
    expect(screen.getByText('Preguntas sobre este reporte')).toBeTruthy();
    expect(screen.queryByText(/Sugerencias para/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Compara este periodo con el anterior por sucursal' }));
    expect(onSugerencia).toHaveBeenCalledWith('Compara este periodo con el anterior por sucursal');
  });
});

describe('Composer', () => {
  const base = {
    value: '', onChange: jest.fn(), onSubmit: jest.fn(), onStop: jest.fn(), isLoading: false,
    attachments: [], onAttach: jest.fn(), onRemoveAttachment: jest.fn(), attachmentsEnabled: true,
  };

  test('sin créditos: bloqueado, con el motivo y el saldo en rojo', () => {
    renderConIdioma(<Composer {...base} credits={{ credits: 0, level: 'empty', avgPerReply: null, ttsEnabled: false }} />);
    const caja = screen.getByRole('textbox', { name: 'Mensaje para GO Asistente' }) as HTMLTextAreaElement;
    expect(caja.disabled).toBe(true);
    expect(caja.placeholder).toBe('Sin créditos: el asistente está en pausa');
    expect(screen.getByText('Compra créditos para seguir')).toBeTruthy();
    expect(screen.getByText('0 créditos').className).toContain('text-danger-text');
  });

  test('chip de la página: se ve y se puede quitar', () => {
    const onAlternar = jest.fn();
    renderConIdioma(<Composer {...base} value="hola" contexto={{ pagina: 'Inicio', activo: true, onAlternar }} />);
    const chip = screen.getByRole('button', { name: 'Inicio' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(onAlternar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(base.onSubmit).toHaveBeenCalled();
  });

  describe('altura de la caja (una línea que crece al escribir)', () => {
    // jsdom no maqueta: se simula lo que mide Chromium. Con 0 px de ancho (el
    // panel se monta cerrado) el placeholder parte una letra por línea y
    // `scrollHeight` da 360; con ancho, una línea son 20 px.
    let ancho = 0;
    let alto = 360;
    let alCambiarTamano: (() => void) | null = null;
    const g = globalThis as unknown as { ResizeObserver: unknown };
    const original = g.ResizeObserver;
    const proto = HTMLTextAreaElement.prototype;
    beforeEach(() => {
      ancho = 0;
      alto = 360;
      alCambiarTamano = null;
      Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => ancho });
      Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => alto });
      g.ResizeObserver = class {
        constructor(cb: () => void) {
          alCambiarTamano = cb;
        }
        observe() {}
        disconnect() {}
      };
    });
    afterEach(() => {
      delete (proto as unknown as Record<string, unknown>).clientWidth;
      delete (proto as unknown as Record<string, unknown>).scrollHeight;
      g.ResizeObserver = original;
    });

    test('montado con el panel cerrado no se topa en 8 líneas, y al abrir mide una', () => {
      renderConIdioma(<Composer {...base} />);
      const caja = screen.getByRole('textbox', { name: 'Mensaje para GO Asistente' }) as HTMLTextAreaElement;
      // Antes: height = 164px (tope de 8 líneas) y así se quedaba al abrir.
      expect(caja.style.height).toBe('');
      ancho = 368;
      alto = 20;
      act(() => alCambiarTamano?.());
      expect(caja.style.height).toBe('20px');
    });

    test('crece con el texto hasta 8 líneas', () => {
      ancho = 368;
      alto = 60;
      const { rerender } = renderConIdioma(<Composer {...base} value={'a\nb\nc'} />);
      const caja = screen.getByRole('textbox', { name: 'Mensaje para GO Asistente' }) as HTMLTextAreaElement;
      expect(caja.style.height).toBe('60px');
      alto = 400;
      rerender(<Composer {...base} value={'muchas líneas'} />);
      expect(caja.style.height).toBe('164px');
    });
  });

  test('respondiendo: enviar se vuelve Detener y el pie dice que Esc detiene', () => {
    renderConIdioma(<Composer {...base} isLoading />);
    fireEvent.click(screen.getByRole('button', { name: 'Detener respuesta' }));
    expect(base.onStop).toHaveBeenCalled();
    expect(screen.getByText('Esc detiene la respuesta')).toBeTruthy();
  });
});
