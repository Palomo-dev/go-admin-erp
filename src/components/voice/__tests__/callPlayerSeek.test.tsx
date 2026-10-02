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
