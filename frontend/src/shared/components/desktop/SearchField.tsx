import { Search } from 'lucide-solid';
import type { JSX } from 'solid-js';

export function SearchField(props: JSX.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <label class="tt-desktop-search flex items-center gap-3 rounded-[1.4rem] px-4 py-3 text-slate-500 shadow-sm">
      <Search size={20} />
      <input {...props} class={`min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 ${props.class ?? ''}`.trim()} />
    </label>
  );
}
