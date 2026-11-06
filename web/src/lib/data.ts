// Loading the site's data files (web/public/data/, made from results/ by src/showcase.py and src/quiz.py).
// Numbers on the site always come from these files, never typed into the code.
import { useEffect, useState } from "react";

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

// { data, error } for a JSON file; data is null while loading.
export function useJson<T>(url: string) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    let live = true;
    getJson<T>(url)
      .then((data) => live && setState({ data, error: null }))
      .catch((e: Error) => live && setState({ data: null, error: e.message }));
    return () => { live = false; };
  }, [url]);
  return state;
}

export const km2 = (v: number) => Math.round(v).toLocaleString("en-US");
export const pct = (v: number, digits = 1) => (v * 100).toFixed(digits);
