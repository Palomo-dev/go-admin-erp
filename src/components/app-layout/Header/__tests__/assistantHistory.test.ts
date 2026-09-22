/* eslint-disable @typescript-eslint/no-explicit-any -- Intérprete aislado de hooks/JSX, sin DOM ni dependencias nuevas. */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

// Ejecuta los handlers reales del panel y vuelve a renderizar con su estado.
// No sustituye una prueba de navegador, pero detecta mezcla de hilos y tarjetas perdidas.
function panel() {
  const slots: any[] = []; let cursor = 0;
  const react: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback: (fn: any) => fn, useEffect: () => undefined,
  };
  const fetcher = jest.fn();
  const stream = jest.fn((): Promise<any> => new Promise(() => undefined));
  const modules: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    '@/utils/Utils': { cn: (...values: unknown[]) => values.filter(Boolean).join(' ') },
    '@/lib/ai/assistant/attachments': { uploadAssistantAttachments: async (items: any[]) => ({ items, ids: items.map(item => item.id), errors: [] }) },
    '@/lib/ai/assistant/streamClient': { streamAssistant: stream },
    './assistant/Composer': { __esModule: true, default: 'Composer' },
    './assistant/ConversationHistory': { __esModule: true, default: 'History' },
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
  return { render, find, fetcher, stream };
}

const action = { id: 'accion', title: 'Crear cliente', description: 'Resumen', fields: [], risk: 'medium' };
test('retomar restaura la tarjeta y los resultados del servidor', async () => {
  const p = panel();
  p.fetcher.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'resultado', role: 'assistant', content: 'Cliente creado', created_at: new Date().toISOString() }], pendingActions: [action] }) });
  p.find(p.render(), n => n.props?.['aria-label'] === 'Conversaciones anteriores').props.onClick();
  await p.find(p.render(), n => n.type === 'History').props.onSelect('hilo');
  expect(p.find(p.render(), n => n.type === 'Action').props.action).toEqual(action);
});

test('historial se bloquea mientras se genera una respuesta', async () => {
  const p = panel();
  p.find(p.render(), n => n.type === 'Composer').props.onChange('hola');
  p.find(p.render(), n => n.type === 'Composer').props.onSubmit();
  await Promise.resolve();
  expect(p.find(p.render(), n => n.props?.['aria-label'] === 'Conversaciones anteriores').props.disabled).toBe(true);
});

test('historial se bloquea mientras se confirma y no cambia de hilo', async () => {
  const p = panel();
  p.fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [], pendingActions: [action] }) });
  p.find(p.render(), n => n.props?.['aria-label'] === 'Conversaciones anteriores').props.onClick();
  await p.find(p.render(), n => n.type === 'History').props.onSelect('hilo');
  p.fetcher.mockImplementation(() => new Promise(() => undefined));
  p.find(p.render(), n => n.type === 'Action').props.onConfirm();
  const button = p.find(p.render(), n => n.props?.['aria-label'] === 'Conversaciones anteriores');
  expect(button.props.disabled).toBe(true);
  button.props.onClick();
  expect(p.find(p.render(), n => n.type === 'History')).toBeUndefined();
});

test('retomar varias propuestas permite rechazarlas en orden sin perder la siguiente', async () => {
  const p = panel();
  const next = { ...action, id: 'segunda', title: 'Segunda propuesta' };
  p.fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [], pendingActions: [action, next] }) });
  p.find(p.render(), n => n.props?.['aria-label'] === 'Conversaciones anteriores').props.onClick();
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
