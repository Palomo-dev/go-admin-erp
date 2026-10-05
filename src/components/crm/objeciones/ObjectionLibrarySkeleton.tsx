'use client';
import { Skeleton } from '@/components/ui/skeleton';
/** Visual placeholders follow the library frame; they do not define data columns. */
export function ObjectionLibrarySkeleton({label}:{label:string}){
 return <div role="status" aria-busy="true" aria-label={label} className="overflow-hidden rounded-xl border border-line bg-surface px-3 py-1">
  {Array.from({length:7},(_,i)=><div key={i} aria-hidden="true" className="flex h-12 items-center gap-4">
   <Skeleton className="size-[18px] shrink-0 rounded bg-pressed"/><Skeleton className="size-10 shrink-0 rounded-lg bg-pressed"/>
   <div className="grid min-w-0 flex-1 grid-cols-[.6fr_1.2fr_.9fr_.75fr_.75fr_.9fr_.5fr] items-center gap-4">
    {Array.from({length:7},(_,j)=><Skeleton key={j} className={j===5?'h-6 rounded-full bg-pressed':'h-3 rounded bg-pressed'}/>)}</div>
  </div>)}
 </div>;
}
