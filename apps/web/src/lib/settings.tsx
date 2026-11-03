import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AppSettings } from '@ar-option/shared-types';
import { apiFetch } from './api';

const DEFAULT_SETTINGS: AppSettings = { use_sizes: false, manual_return_approval_limit: 0 };

interface SettingsContextValue {
  settings: AppSettings;
  loaded: boolean;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  refresh: async () => {},
});

/** Loads the company-wide settings once per session. Screens read them with useAppSettings. */
export const SettingsProvider: React.FC<{ apiUrl: string; children: React.ReactNode }> = ({ apiUrl, children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiUrl}/settings`);
      if (res.ok) setSettings(await res.json());
    } catch {
      // Keep the last known settings when offline.
    } finally {
      setLoaded(true);
    }
  }, [apiUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <SettingsContext.Provider value={{ settings, loaded, refresh }}>{children}</SettingsContext.Provider>;
};

export const useAppSettings = (): SettingsContextValue => useContext(SettingsContext);

export const useSizes = (): boolean => useContext(SettingsContext).settings.use_sizes;

/**
 * The only way a screen shows a size. Empty when sizes are off or the size is the hidden
 * Standard variation, so "Standard" never reaches the screen.
 */
export const sizeLabel = (size: string | null | undefined, useSizes: boolean): string => {
  const s = (size || '').trim();
  if (!useSizes || !s || s.toLowerCase() === 'standard' || s.toUpperCase() === 'N/A') return '';
  return s;
};
