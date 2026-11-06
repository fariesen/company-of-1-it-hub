import { useCallback, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'it-hub.theme';

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function applyStoredTheme() {
  apply(read());
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(read);
  const set = useCallback((t: ThemeChoice) => {
    try {
      if (t === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* storage unavailable - theme still applies for this session */
    }
    apply(t);
    setTheme(t);
  }, []);
  return [theme, set];
}
