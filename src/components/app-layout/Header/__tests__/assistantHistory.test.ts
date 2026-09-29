/* eslint-disable @typescript-eslint/no-explicit-any -- Intérprete aislado de hooks/JSX, sin DOM ni dependencias nuevas. */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import * as panelUi from '@/lib/ai/assistant/panelUi';

/** Textos reales del namespace `asistente` en español, con `{variable}` sustituida. */
const ES = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages/es.json'), 'utf8')).asistente;
function traducir(namespace: string) {
  const base = namespace.split('.').slice(1).reduce((nodo: any, clave) => nodo?.[clave], ES);
  return (clave: string, valores: Record<string, unknown> = {}) => {
    const texto = clave.split('.').reduce((nodo: any, parte) => nodo?.[parte], base);
    return typeof texto === 'string' ? texto.replace(/\{(\w+)\}/g, (_, v) => String(valores[v] ?? '')) : clave;
  };
}

// Ejecuta los handlers reales del panel y vuelve a renderizar con su estado.
// No sustituye una prueba de navegador, pero detecta mezcla de hilos y tarjetas perdidas.
function panel() {
  const slots: any[] = []; let cursor = 0;
  const react: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback: (fn: any) => fn, useEffect: () => undefined, useMemo: (fn: any) => fn(),
    Fragment: 'Fragment',
  };
  const fetcher = jest.fn();
  const stream = jest.fn<Promise<any>, any[]>(() => new Promise(() => undefined));
  const modules: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    'next-intl': { useTranslations: traducir },
    '@/utils/Utils': { cn: (...values: unknown[]) => values.filter(Boolean).join(' ') },
    '@/lib/ai/assistant/attachments': { uploadAssistantAttachments: async (items: any[]) => ({ items, ids: items.map(item => item.id), errors: [] }) },
    '@/lib/ai/assistant/streamClient': { streamAssistant: stream },
    '@/lib/ai/assistant/panelUi': panelUi,
    '@/lib/context/BranchContext': { useBranch: () => ({ branches: [{ id: 7, name: 'Sucursal de prueba' }], selectedBranchId: 7 }) },
    './assistant/usePaginaActual': { usePaginaActual: () => ({ ruta: '/app/inicio', nombre: 'Inicio' }) },
    './assistant/Composer': { __esModule: true, default: 'Composer' },
    './assistant/ConversationHistory': { __esModule: true, default: 'History' },
    './assistant/PanelHeader': { __esModule: true, default: 'Header' },
    './assistant/AssistantNotice': { __esModule: true, default: 'Notice' },
    './assistant/MessageBubble': { __esModule: true, default: 'Bubble' },
    './assistant/CustomerFormDialog': { __esModule: true, default: 'CustomerForm' },
    './ActionConfirmationForm': { __esModule: true, default: 'Action' },
  };
  const exports: any = {};
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/app-layout/Header/AIAssistantPanel.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, {
    exports, require: (name: string) => modules[name] ?? new Proxy({ __esModule: true, default: 'Stub' }, { get: (obj: any, key) => obj[key] ?? 'Stub' }),
    fetch: fetcher, console, Date, Intl, AbortController, URL,
  });
  const props = { isOpen: true, onToggle: jest.fn(), context: { organizationId: 120, userName: 'Persona', organizationName: 'Org de prueba', userRole: 'Empleado' } };
  const render = () => { cursor = 0; const root = exports.default(props); return root.type(root.props); };
  const find = (node: any, predicate: (n: any) => boolean): any => {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of (Array.isArray(node) ? node : node.props?.children ?? [])) { const found = find(child, predicate); if (found) return found; }
  };
  const header = () => find(render(), (n) => n.type === 'Header');
  return { render, find, fetcher, stream, header, props };
}

const action = { id: 'accion', title: 'Crear cliente', description: 'Resumen', fields: [], risk: 'medium' };
test('retomar restaura la tarjeta y los resultados del servidor', async () => {
  const p = panel();
  p.fetcher.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'resultado', role: 'assistant', content: 'Cliente creado', created_at: new Date().toISOString() }], pendingActions: [action] }) });
  p.header().props.onHistorial();
  await p.find(p.render(), n => n.type === 'History').props.onSelect('hilo');
  expect(p.find(p.render(), n => n.type === 'Action').props.action).toEqual(action);
});

test('historial se bloquea mientras se genera una respuesta', async () => {
  const p = panel();
  p.find(p.render(), n => n.type === 'Composer').props.onChange('hola');
  p.find(p.render(), n => n.type === 'Composer').props.onSubmit();
  await Promise.resolve();
  expect(p.header().props.ocupado).toBe(true);
});

test('historial se bloquea mientras se confirma y no cambia de hilo', async () => {
  const p = panel();
  p.fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [], pendingActions: [action] }) });
  p.header().props.onHistorial();
  await p.find(p.render(), n => n.type === 'History').props.onSelect('hilo');
  p.fetcher.mockImplementation(() => new Promise(() => undefined));
  p.find(p.render(), n => n.type === 'Action').props.onConfirm();
  const header = p.header();
  expect(header.props.ocupado).toBe(true);
  header.props.onHistorial();
  expect(p.find(p.render(), n => n.type === 'History')).toBeUndefined();
});

test('retomar varias propuestas permite rechazarlas en orden sin perder la siguiente', async () => {
  const p = panel();
  const next = { ...action, id: 'segunda', title: 'Segunda propuesta' };
  p.fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [], pendingActions: [action, next] }) });
  p.header().props.onHistorial();
  await p.find(p.render(), n => n.type === 'History').props.onSelect('hilo');
  p.fetcher.mockResolvedValue({ ok: true, json: async () => ({ success: true, rejected: true }) });
  p.find(p.render(), n => n.type === 'Action').props.onReject();
  await new Promise(setImmediate);
  expect(p.find(p.render(), n => n.type === 'Action').props.action.id).toBe('segunda');
});

test.each([false, true])('stream parcial/abortado canFallback=false no reintenta HTTP (adjunto=%s)', async (attach) => {
  const p = panel();
  p.stream.mockResolvedValue({ content: 'Texto parcial', ok: false, canFallback: false });
  const composer = p.find(p.render(), n => n.type === 'Composer');
  if (attach) composer.props.onAttach([{ name: 'listado.csv', size: 1, type: 'text/csv' }]);
  composer.props.onChange('Lee esto');
  p.find(p.render(), n => n.type === 'Composer').props.onSubmit();
  await new Promise(setImmediate);
  expect(p.fetcher).not.toHaveBeenCalled();
  expect(p.find(p.render(), n => n.type === 'Composer').props.value).toBe('Lee esto');
  expect(p.find(p.render(), n => n.type === 'Composer').props.attachments).toHaveLength(attach ? 1 : 0);
});

// ── Rediseño del Figma (667:34452): avisos aparte de la burbuja ──────────────

const enviar = async (p: ReturnType<typeof panel>, texto: string) => {
  p.find(p.render(), n => n.type === 'Composer').props.onChange(texto);
  p.find(p.render(), n => n.type === 'Composer').props.onSubmit();
  await new Promise(setImmediate);
};
const avisos = (p: ReturnType<typeof panel>) => {
  const salida: any[] = [];
  const recorrer = (nodo: any) => {
    if (!nodo || typeof nodo !== 'object') return;
    if (nodo.type === 'Notice') salida.push(nodo.props);
    for (const hijo of Array.isArray(nodo) ? nodo : nodo.props?.children ?? []) recorrer(hijo);
  };
  recorrer(p.render());
  return salida;
};
const burbujas = (p: ReturnType<typeof panel>) => {
  const salida: any[] = [];
  const recorrer = (nodo: any) => {
    if (!nodo || typeof nodo !== 'object') return;
    if (nodo.type === 'Bubble') salida.push(nodo.props.mensaje);
    for (const hijo of Array.isArray(nodo) ? nodo : nodo.props?.children ?? []) recorrer(hijo);
  };
  recorrer(p.render());
  return salida;
};

test('sin créditos a mitad de turno: aviso «sin créditos», el texto vuelve y no hay reintento', async () => {
  const p = panel();
  p.stream.mockImplementation(async (_body: any, handlers: any) => {
    handlers.onError({ message: 'Créditos de IA insuficientes.', code: 'NO_CREDITS' });
    return { content: '', ok: false, canFallback: false };
  });
  await enviar(p, '¿Cuánto vendimos ayer?');
  expect(avisos(p).map((a) => a.tipo)).toEqual(['sin_creditos']);
  expect(avisos(p)[0].onReintentar).toBeDefined();
  expect(p.find(p.render(), n => n.type === 'Composer').props.value).toBe('¿Cuánto vendimos ayer?');
  expect(p.fetcher).not.toHaveBeenCalled();
});

test('error del stream: el aviso va aparte, lo parcial queda como respuesta y «Reintentar» no duplica la burbuja', async () => {
  const p = panel();
  p.stream.mockImplementationOnce(async (_body: any, handlers: any) => {
    handlers.onError({ message: 'La conexión se interrumpió.', code: 'STREAM_INCOMPLETE' });
    return { content: 'Estos 4 productos', ok: false, canFallback: false };
  });
  await enviar(p, '¿Qué productos se están quedando sin stock?');
  expect(avisos(p)).toEqual([expect.objectContaining({ tipo: 'error', mensaje: 'La conexión se interrumpió.' })]);
  expect(burbujas(p).map((m) => m.role)).toEqual(['user', 'assistant']);
  // El texto del error no se mezcla con la respuesta (Figma pantalla 13).
  expect(burbujas(p)[1].content).toBe('Estos 4 productos');

  p.stream.mockImplementationOnce(() => new Promise(() => undefined));
  avisos(p)[0].onReintentar();
  await new Promise(setImmediate);
  expect(burbujas(p).filter((m) => m.role === 'user')).toHaveLength(1);
  expect(p.stream).toHaveBeenCalledTimes(2);
});

test('el modelo pidió una herramienta que no se le ofreció: aviso «sin permiso» tras la respuesta', async () => {
  const p = panel();
  p.fetcher.mockResolvedValue({ ok: false, json: async () => ({}) });
  p.stream.mockImplementation(async (_body: any, handlers: any) => {
    handlers.onNotice?.({ code: 'FORBIDDEN_TOOL', tool: 'registrar_factura_venta' });
    return { content: 'No puedo registrarla con tu cargo actual.', ok: true, canFallback: false };
  });
  await enviar(p, 'Registra una factura de venta');
  expect(avisos(p).map((a) => a.tipo)).toContain('sin_permiso');
});

test('confirmar con permisos retirados: la tarjeta queda en error y aparece «sin permiso»', async () => {
  const p = panel();
  p.fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [], pendingActions: [action] }) });
  p.header().props.onHistorial();
  await p.find(p.render(), n => n.type === 'History').props.onSelect('hilo');
  p.fetcher.mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, code: 'no_permission', message: 'Tu acceso actual no permite esta operación.' }) });
  p.find(p.render(), n => n.type === 'Action').props.onConfirm();
  await new Promise(setImmediate);
  expect(p.find(p.render(), n => n.type === 'Action').props.outcome).toEqual(expect.objectContaining({ ok: false }));
  expect(avisos(p).map((a) => a.tipo)).toContain('sin_permiso');
});

test('la sucursal activa llega al formulario de clientes (antes llegaba null)', async () => {
  const p = panel();
  p.fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [], pendingActions: [action] }) });
  p.header().props.onHistorial();
  await p.find(p.render(), n => n.type === 'History').props.onSelect('hilo');
  p.find(p.render(), n => n.type === 'Action').props.onOpenForm();
  expect(p.find(p.render(), n => n.type === 'CustomerForm').props.branchId).toBe(7);
});
