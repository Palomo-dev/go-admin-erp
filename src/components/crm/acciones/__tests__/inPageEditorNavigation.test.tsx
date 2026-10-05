/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { editorTarget, useInPageEditorNavigation } from '../useInPageEditorNavigation';
const path = '/app/crm/secuencias';
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => window.history.replaceState({}, '', `${path}?estado=activa`));
test('la URL restaura sólo un target válido y conserva filtros ajenos', () => {
  expect(editorTarget(new URL(`https://example.invalid${path}?editor=malformado`))).toBeNull();
  const onTarget = jest.fn(); const { result, unmount } = renderHook(() => useInPageEditorNavigation({ pathname: path, ready: true, canManage: true, scope: 1, onTarget, blocked: () => false }));
  act(() => result.current.open(id));
  expect(window.location.search).toContain(`editor=${id}`); expect(window.location.search).toContain('estado=activa'); expect(onTarget).toHaveBeenLastCalledWith(id);
  unmount(); const restored = jest.fn();
  renderHook(() => useInPageEditorNavigation({ pathname: path, ready: true, canManage: true, scope: 1, onTarget: restored, blocked: () => false }));
  expect(restored).toHaveBeenCalledWith(id);
});
test('Atrás cierra en reposo, pero un guardado pendiente mantiene URL y formulario', () => {
  let pending = false; const onTarget = jest.fn();
  const { result } = renderHook(() => useInPageEditorNavigation({ pathname: path, ready: true, canManage: true, scope: 1, onTarget, blocked: () => pending }));
  act(() => result.current.open('new')); pending = true;
  act(() => { window.history.replaceState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(new URL(window.location.href).searchParams.get('editor')).toBe('new'); expect(new URL(window.location.href).searchParams.get('estado')).toBe('activa'); expect(onTarget).toHaveBeenLastCalledWith('new');
  pending = false;
  act(() => { window.history.replaceState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(onTarget).toHaveBeenLastCalledWith(null);
});
test('un lector no abre y cambiar de organización retira el target anterior', () => {
  const onTarget = jest.fn();
  const { result, rerender } = renderHook(({ scope, canManage }) => useInPageEditorNavigation({ pathname: path, ready: true, canManage, scope, onTarget, blocked: () => false }), { initialProps: { scope: 1, canManage: false } });
  act(() => result.current.open(id)); expect(window.location.search).not.toContain('editor=');
  rerender({ scope: 1, canManage: true }); act(() => result.current.open(id));
  rerender({ scope: 2, canManage: true }); expect(window.location.search).not.toContain('editor='); expect(onTarget).toHaveBeenLastCalledWith(null);
});
test('la primera resolución de sesión conserva un enlace profundo válido', () => {
  window.history.replaceState({}, '', `${path}?editor=${id}`);
  const onTarget=jest.fn();
  const initialProps:{scope:number|null;ready:boolean}={scope:null,ready:false};
  const {rerender}=renderHook(({scope,ready}:{scope:number|null;ready:boolean})=>useInPageEditorNavigation({pathname:path,ready,canManage:true,scope,onTarget,blocked:()=>false}),{initialProps});
  expect(onTarget).not.toHaveBeenCalled();rerender({scope:1,ready:true});
  expect(onTarget).toHaveBeenCalledWith(id);expect(window.location.search).toContain(`editor=${id}`);
});
