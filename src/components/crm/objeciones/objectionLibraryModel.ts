import type {Objection} from '@/lib/services/crm/objectionService';
import type {ObjectionInsights} from '@/lib/services/crm/objectionInsightsService';
export type ObjectionOrder='frequency'|'advanced'|'alphabetical';
export interface LibraryRow {objection:Objection;calls:number|null;share:number|null;advancedRate:number|null}
export function libraryRows(objections:Objection[],insights:ObjectionInsights|null):LibraryRow[]{
 const frequencies=new Map(insights?.frequencies.map(row=>[row.objection_id,row]));
 const total=insights?objections.reduce((sum,row)=>sum+(frequencies.get(row.id)?.call_count??0),0):null;
 return objections.map(objection=>{const frequency=frequencies.get(objection.id),calls=insights?(frequency?.call_count??0):null;
  return{objection,calls,share:total&&calls!==null?calls/total:null,advancedRate:calls&&frequency?frequency.advanced_count/calls:null};
 });
}
export function orderLibraryRows(rows:LibraryRow[],order:ObjectionOrder,locale:string):LibraryRow[]{
 const collator=new Intl.Collator(locale,{sensitivity:'base'});
 return [...rows].sort((a,b)=>((order==='frequency'?(b.calls??-1)-(a.calls??-1):order==='advanced'?(b.advancedRate??-1)-(a.advancedRate??-1):0)||collator.compare(a.objection.title,b.objection.title)));
}
export function librarySummary(rows:LibraryRow[],insights:ObjectionInsights|null){
 const callCount=insights?rows.reduce((sum,row)=>sum+(row.calls??0),0):null;
 const ids=new Set(rows.map(row=>row.objection.id));
 const advanced=insights?.frequencies.filter(row=>ids.has(row.objection_id)).reduce((sum,row)=>sum+row.advanced_count,0)??null;
 const categories=new Map<string|null,number>();
 for(const row of rows)if(row.calls!==null)categories.set(row.objection.category,(categories.get(row.objection.category)??0)+row.calls);
 const frequent=[...categories].filter(([,calls])=>calls>0).reduce<{category:string|null;calls:number;share:number|null}|null>((top,[category,calls])=>!top||calls>top.calls?{category,calls,share:callCount?calls/callCount:null}:top,null);
 return{count:rows.length,categories:new Set(rows.map(row=>row.objection.category)).size,callCount,advancedRate:callCount&&advanced!==null?advanced/callCount:null,frequent};
}
