'use client';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getProjects } from '@/lib/api';

const STORAGE_KEY = 'vca:lastProjectId';

function readUrlProjectId(path: string): string | null {
  const m = path.match(/\/projects\/([^/]+)/);
  if (!m) return null;
  const id = m[1];
  if (['create', 'videos', 'frames', '__next', 'new'].includes(id)) return null;
  return id;
}

/** Single source of truth for "which project is the user working on right now".
 *  Priority: URL > localStorage. Validates against the live projects list so
 *  deleted/stale ids get cleared automatically. */
export function useSelectedProject() {
  const path = usePathname();
  const urlId = readUrlProjectId(path);

  const [storedId, setStoredId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setStoredId(localStorage.getItem(STORAGE_KEY));
  }, []);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    staleTime: 30_000,
  });

  const candidate = urlId || storedId;
  const project = (projects as any[]).find(p => p.id === candidate) || null;

  // Persist URL-derived id so it survives navigation to global pages
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (urlId && urlId !== storedId) {
      localStorage.setItem(STORAGE_KEY, urlId);
      setStoredId(urlId);
    }
  }, [urlId, storedId]);

  // If stored id no longer exists in the project list, clear it
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isLoading && storedId && !(projects as any[]).find(p => p.id === storedId)) {
      localStorage.removeItem(STORAGE_KEY);
      setStoredId(null);
    }
  }, [isLoading, projects, storedId]);

  const setSelected = (id: string | null) => {
    if (typeof window === 'undefined') return;
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
    setStoredId(id);
  };

  return {
    projectId: project?.id || null,
    project,
    projects: projects as any[],
    isLoading,
    setSelected,
  };
}
