import {sortPartnerDirectory} from '../partnerDirectorySort';
import type {PartnerView} from '@/lib/services/crm/partnerService';
const partner=(n:number)=>({id:String(n),name:'Partner '+n,deals_count:n,revenue:{total:n,sinTasa:[],parcial:false,moneda:'COP',convertidos:0,originales:0}} as unknown as PartnerView);
it('ordena todo el ámbito antes de tomar la primera página, incluyendo el mayor de 205 registros',()=>{
 const rows=Array.from({length:205},(_,i)=>partner(i));
 const sorted=sortPartnerDirectory(rows,{campo:'revenue',direccion:'desc'},'es-CO');
 expect(sorted.slice(0,25)[0].id).toBe('204');expect(rows[0].id).toBe('0');
});
it.each(['asc','desc'] as const)('un revenue sin conversión queda al final en %s',direccion=>{
 const unknown={...partner(999),revenue:null};
 const sorted=sortPartnerDirectory([unknown,partner(2),partner(1)],{campo:'revenue',direccion},'es-CO');
 expect(sorted.at(-1)?.id).toBe('999');
});
