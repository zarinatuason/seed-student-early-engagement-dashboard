import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import { getGetSessionQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function usePageMeta(title: string, description: string, scrollTop = true) {
  useEffect(() => {
    const full = `${title} · SEED Student Advisor`;
    document.title = full;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', description);
    setMeta('name', 'twitter:title', full);
    setMeta('name', 'twitter:description', description);
    if (scrollTop) window.scrollTo(0, 0);
  }, [title, description, scrollTop]);
}

export function useUrlParams(basePath: string) {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const set = useCallback(
    (patch: Record<string, string | undefined>) => {
      const p = new URLSearchParams(search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') p.delete(k);
        else p.set(k, v);
      }
      const s = p.toString();
      navigate(`${basePath}${s ? `?${s}` : ''}`);
    },
    [search, navigate, basePath],
  );
  return { params, set, search };
}

export const currentUrl = (pathname: string, search: string) => `${pathname}${search ? `?${search}` : ''}`;

const scrollKey = (url: string) => `seed-scroll:${url}`;
export const saveScroll = (url: string) => {
  try {
    sessionStorage.setItem(scrollKey(url), String(window.scrollY));
  } catch {
    /* storage unavailable */
  }
};
export function useRestoreScroll(url: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let y = 0;
    try {
      y = Number(sessionStorage.getItem(scrollKey(url)) || 0);
    } catch {
      y = 0;
    }
    requestAnimationFrame(() => window.scrollTo(0, y));
    // only when data first becomes ready for this URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, url]);
}

export function useRefreshWorkspace() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ predicate: q => q.queryKey[0] !== getGetSessionQueryKey()[0] }),
    [qc],
  );
}
