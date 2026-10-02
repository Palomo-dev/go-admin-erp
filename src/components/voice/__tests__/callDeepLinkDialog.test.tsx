/** @jest-environment jsdom */
/// <reference types="jest" />
import {waitFor,screen} from '@testing-library/react';
import {renderConIdioma} from '@/test-utils/renderConIdioma';
import {CallDeepLinkDialog} from '../CallDeepLinkDialog';
import {pedirCrm,ErrorApiCrm} from '@/components/crm/acciones/apiCrm';
const ID='10000000-0000-4000-8000-000000000001';
jest.mock('@/components/crm/acciones/apiCrm',()=>({...jest.requireActual('@/components/crm/acciones/apiCrm'),pedirCrm:jest.fn()}));
jest.mock('../CallRowDetail',()=>({CallRowDetail:({call,initialSeekMs}:{call:{id:string};initialSeekMs:number})=><div data-testid="historical-detail">{call.id}:{initialSeekMs}</div>}));
beforeEach(()=>jest.mocked(pedirCrm).mockReset());
test('historical call is loaded from canonical API even outside the current list and date filter',async()=>{jest.mocked(pedirCrm).mockResolvedValue({data:{id:ID,recordings:[]} as never,extra:{}});renderConIdioma(<CallDeepLinkDialog id={ID} startMs={4500} onClose={()=>{}}/>);expect((await screen.findByTestId('historical-detail')).textContent).toContain(`${ID}:4500`);expect(pedirCrm).toHaveBeenCalledWith(`/api/crm/calls/${ID}`,expect.objectContaining({signal:expect.any(AbortSignal)}));});
test('canonical 403 exposes forbidden state and never mounts the audio detail',async()=>{jest.mocked(pedirCrm).mockRejectedValue(new ErrorApiCrm(403,'sin_permiso','sin_permiso'));renderConIdioma(<CallDeepLinkDialog id={ID} startMs={0} onClose={()=>{}}/>);await waitFor(()=>expect(screen.getByRole('dialog').textContent).toContain('permiso'));expect(screen.queryByTestId('historical-detail')).toBeNull();});
