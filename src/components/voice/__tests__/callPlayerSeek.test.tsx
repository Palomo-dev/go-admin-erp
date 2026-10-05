/** @jest-environment jsdom */
/// <reference types="jest" />
import {act,waitFor} from '@testing-library/react';
import {renderConIdioma} from '@/test-utils/renderConIdioma';
import {CallPlayer} from '../CallPlayer';
jest.mock('@/components/ui/use-toast',()=>({useToast:()=>({toast:jest.fn()})}));
class FakeAudio{static instances:FakeAudio[]=[];duration=NaN;currentTime=0;preload='';onloadedmetadata:(()=>void)|null=null;onplay:(()=>void)|null=null;onpause:(()=>void)|null=null;onended:(()=>void)|null=null;ontimeupdate:(()=>void)|null=null;onerror:(()=>void)|null=null;play=jest.fn(async()=>{});pause=jest.fn();constructor(readonly src:string){FakeAudio.instances.push(this);}}
let originalAudio:typeof Audio,originalFetch:typeof fetch;
beforeEach(()=>{originalAudio=global.Audio;originalFetch=global.fetch;FakeAudio.instances=[];global.Audio=FakeAudio as unknown as typeof Audio;global.fetch=jest.fn(async()=>({ok:true,json:async()=>({data:{recordings:[{id:'recording',status:'ready'}],consents:[]}})})) as unknown as typeof fetch;});
afterEach(()=>{global.Audio=originalAudio;global.fetch=originalFetch;});
test('initial deep-link seek waits for metadata and clamps to duration using one audio engine',async()=>{
 const update=jest.fn();const view=renderConIdioma(<CallPlayer callId="call" recordingEnabled seekToMs={15000} onTimeUpdate={update}/>);
 await waitFor(()=>expect(FakeAudio.instances).toHaveLength(1));const audio=FakeAudio.instances[0];expect(audio.currentTime).toBe(0);expect(audio.play).not.toHaveBeenCalled();
 await act(async()=>{audio.duration=10;audio.onloadedmetadata?.();});expect(audio.currentTime).toBe(10);expect(update).toHaveBeenCalledWith(10000);expect(audio.play).toHaveBeenCalledTimes(1);
 view.rerender(<CallPlayer callId="call" recordingEnabled seekToMs={3000} onTimeUpdate={update}/>);await waitFor(()=>expect(audio.currentTime).toBe(3));expect(FakeAudio.instances).toHaveLength(1);view.unmount();expect(audio.pause).toHaveBeenCalled();
});
test('disabled recording never fetches audio even with a valid zero seek',async()=>{renderConIdioma(<CallPlayer callId="call" recordingEnabled={false} seekToMs={0}/>);await act(async()=>{});expect(global.fetch).not.toHaveBeenCalled();expect(FakeAudio.instances).toHaveLength(0);});

test('closing a historical call while recordings load cannot create or play a detached audio engine',async()=>{
 let resolve!:(value:unknown)=>void;global.fetch=jest.fn(()=>new Promise(yes=>resolve=yes)) as unknown as typeof fetch;
 const view=renderConIdioma(<CallPlayer callId="call" recordingEnabled seekToMs={1000}/>);view.unmount();
 await act(async()=>resolve({ok:true,json:async()=>({data:{recordings:[{id:'recording',status:'ready'}]}})}));expect(FakeAudio.instances).toHaveLength(0);
});

test('processing recording polls at five seconds without creating audio and accepts only this call', async () => {
 jest.useFakeTimers();
 try {
  const aborts: AbortSignal[] = [];
  global.fetch = jest.fn(async (_url, init) => { aborts.push(init?.signal as AbortSignal); return { ok: true, json: async () => ({ data: { id: 'call', recordings: [{ id: 'recording', status: 'ready', duration_seconds: 10 }] } }) }; }) as unknown as typeof fetch;
  const view = renderConIdioma(<CallPlayer callId="call" recordingEnabled processing initialRecordings={[]} variant="full" />);
  expect(global.fetch).not.toHaveBeenCalled(); expect(FakeAudio.instances).toHaveLength(0);
  await act(async () => { jest.advanceTimersByTime(4999); }); expect(global.fetch).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); }); expect(global.fetch).toHaveBeenCalledTimes(1); expect(FakeAudio.instances).toHaveLength(0);
  view.unmount(); expect(aborts[0].aborted).toBe(true);
 } finally { jest.useRealTimers(); }
});

test('organization change cancels pending recording polling and discards a late response', async () => {
 jest.useFakeTimers();
 try {
  let resolve!:(value:unknown)=>void;
  global.fetch = jest.fn(()=>new Promise(done=>{resolve=done;})) as unknown as typeof fetch;
  const view=renderConIdioma(<CallPlayer callId="call" recordingEnabled processing initialRecordings={[]} variant="full" seekToMs={1000}/>);
  await act(async()=>{jest.advanceTimersByTime(5000);});
  await act(async()=>{window.dispatchEvent(new Event('organization-changed'));resolve({ok:true,json:async()=>({data:{id:'call',recordings:[{id:'recording',status:'ready',duration_seconds:10}]}})});});
  await act(async()=>{jest.advanceTimersByTime(15000);});expect(global.fetch).toHaveBeenCalledTimes(1);expect(FakeAudio.instances).toHaveLength(0);view.unmount();
 } finally {jest.useRealTimers();}
});

test.each([401, 403, 404])('processing poll stops after HTTP %s without repeating reads', async status => {
 jest.useFakeTimers();
 try {
  global.fetch=jest.fn(async()=>({ok:false,status,json:async()=>({})})) as unknown as typeof fetch;
  const view=renderConIdioma(<CallPlayer callId="call" recordingEnabled processing initialRecordings={[]} variant="full"/>);
  await act(async()=>{jest.advanceTimersByTime(5000);});await act(async()=>{jest.advanceTimersByTime(20000);});
  expect(global.fetch).toHaveBeenCalledTimes(1);expect(FakeAudio.instances).toHaveLength(0);view.unmount();
 } finally {jest.useRealTimers();}
});

test('failed persisted recording stops automatic reads and offers a manual refresh', async () => {
 jest.useFakeTimers();
 try {
  global.fetch=jest.fn(async()=>({ok:true,status:200,json:async()=>({data:{id:'call',recordings:[{id:'recording',status:'failed'}]}})})) as unknown as typeof fetch;
  const view=renderConIdioma(<CallPlayer callId="call" recordingEnabled processing initialRecordings={[]} variant="full"/>);
  await act(async()=>{jest.advanceTimersByTime(5000);});await act(async()=>{jest.advanceTimersByTime(20000);});
  expect(global.fetch).toHaveBeenCalledTimes(1);expect(FakeAudio.instances).toHaveLength(0);view.unmount();
 } finally {jest.useRealTimers();}
});

test('five-minute deadline cancels a hanging recording read and ignores its eventual result', async () => {
 jest.useFakeTimers();
 try {
  let resolve!:(value:unknown)=>void;let signal:AbortSignal|undefined;
  global.fetch=jest.fn((_url,init)=>{signal=init?.signal as AbortSignal;return new Promise(done=>{resolve=done;});}) as unknown as typeof fetch;
  const view=renderConIdioma(<CallPlayer callId="call" recordingEnabled processing initialRecordings={[]} variant="full"/>);
  await act(async()=>{jest.advanceTimersByTime(5000);});await act(async()=>{jest.advanceTimersByTime(295000);});expect(signal?.aborted).toBe(true);
  await act(async()=>{resolve({ok:true,json:async()=>({data:{id:'call',recordings:[{id:'recording',status:'ready',duration_seconds:10}]}})});});
  expect(FakeAudio.instances).toHaveLength(0);expect(global.fetch).toHaveBeenCalledTimes(1);view.unmount();
 } finally {jest.useRealTimers();}
});
