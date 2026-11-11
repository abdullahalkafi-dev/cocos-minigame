/** Recursive merge: objects merge key by key, arrays and scalars are replaced by the override. */
export function deepMerge<T>(base: T, over: any): T {
  if (Array.isArray(base) || Array.isArray(over)) return (over !== undefined ? over : base) as T;
  if (base && typeof base === 'object' && over && typeof over === 'object') {
    const out: any = { ...base };
    for (const k of Object.keys(over)) out[k] = deepMerge((base as any)[k], over[k]);
    return out;
  }
  return (over !== undefined ? over : base) as T;
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
