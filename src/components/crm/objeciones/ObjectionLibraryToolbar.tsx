'use client';
import {useTranslations} from 'next-intl';
import {SearchInput} from '@/components/kit';
import {SelectCrm} from '../kit/SelectCrm';
import {OBJECTION_CATEGORIES,type ObjectionFilters} from '@/lib/services/crm/objectionModel';
import {ExportObjections} from './ExportObjections';
import type {LibraryRow,ObjectionOrder} from './objectionLibraryModel';

export function ObjectionLibraryToolbar({filters,onFiltersChange,order,onOrderChange,rows,exportDisabled}:{
 filters:ObjectionFilters;onFiltersChange:(filters:ObjectionFilters)=>void;
 order:ObjectionOrder;onOrderChange:(order:ObjectionOrder)=>void;rows:LibraryRow[];exportDisabled:boolean;
}){
 const t=useTranslations('crm.objecionesNuevo');
 const category=(value:string)=>t.has(`categories.${value}`)?t(`categories.${value}`):value;
 const query=(value:string)=>onFiltersChange({...filters,query:value});
 return <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_320px_320px]">
  <div className="lg:hidden"><ExportObjections rows={rows} disabled={exportDisabled}/></div>
  <SearchInput value={filters.query} onChange={query} onValueChange={query} etiqueta={t('search')} placeholder={t('searchHint')} className="min-w-0"/>
  <SelectCrm aria-label={t('category')} valor={filters.category} onValorChange={value=>onFiltersChange({...filters,category:value})}
   opciones={[{valor:'all',etiqueta:t('allCategories')},...OBJECTION_CATEGORIES.map(row=>({valor:row.value,etiqueta:category(row.value)}))]}/>
  <SelectCrm aria-label={t('visual.order')} valor={order} onValorChange={value=>onOrderChange(value as ObjectionOrder)}
   opciones={[{valor:'frequency',etiqueta:t('visual.mostFrequentOrder')},{valor:'advanced',etiqueta:t('visual.advancedOrder')},{valor:'alphabetical',etiqueta:t('visual.alphabeticalOrder')}]}/>
 </div>;
}
