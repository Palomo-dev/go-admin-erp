import {readRedPages} from '../readRedPages';
import {describeReward} from '@/lib/services/crm/referralReward';
import {formatMoney} from '@/lib/services/crm/partnerModel';

beforeEach(() => {global.fetch = jest.fn();});
test('lee 505 filas antes de entregar la lista completa, sin límite de la primera página', async () => {
  const rows = Array.from({length:505}, (_,i) => ({id:i}));
  (fetch as jest.Mock).mockImplementation(async (url:string) => {
    const offset = Number(new URL(url,'https://example.test').searchParams.get('offset'));
    return {ok:true,json:async () => ({data:rows.slice(offset,offset+200),count:505,can_register:true})};
  });
  const result = await readRedPages('/api/crm/referrals');
  expect(result.data).toEqual(rows); expect(result.body.can_register).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(3);
});
test.each([{data:[],count:null},{data:[],count:6},{data:null,count:0}])('rechaza páginas incompletas o conteos ausentes sin inventar cero: %j', async body => {
  (fetch as jest.Mock).mockResolvedValue({ok:true,json:async () => body});
  await expect(readRedPages('/api/crm/referrals')).rejects.toThrow();
});
test('un error en página posterior impide exportar una lista truncada', async () => {
  (fetch as jest.Mock).mockResolvedValueOnce({ok:true,json:async () => ({data:Array(200).fill({id:1}),count:201})}).mockResolvedValueOnce({ok:false,json:async () => ({error:'Lectura denegada'})});
  await expect(readRedPages('/api/crm/referrals')).rejects.toThrow('Lectura denegada');
});
test('formatea importes en el idioma elegido sin cambiar moneda ni usar símbolo inventado', () => {
  expect(formatMoney(1250.25,'USD','en')).toBe(new Intl.NumberFormat('en',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(1250.25));
  const translate = (s:string,v?:Record<string,string|number>) => s === 'Descuento' ? 'Discount' : s === 'Ambos' ? 'Both' : s.includes('{type}') ? `${v?.type}${v?.amount} for ${v?.recipient}` : s;
  expect(describeReward({reward_type:'discount',reward_amount:15,reward_to:'both'},'COP',{locale:'en',translate})?.summary).toBe('Discount 15 % for both');
});
