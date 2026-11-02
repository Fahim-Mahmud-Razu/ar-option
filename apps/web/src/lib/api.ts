import { readStored, writeStored } from './storage';

const TOKEN_KEY = 'ar_option_token';
export const SESSION_EXPIRED_EVENT = 'ar-option:session-expired';

export const getToken = (): string | null => readStored(TOKEN_KEY);
export const setToken = (token: string | null): void => writeStored(TOKEN_KEY, token);

/**
 * fetch with the login token attached. A 401 on a signed-in session tells the app
 * to ask for the password again without unmounting the screen, so no work is lost.
 */
export const apiFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && token) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return res;
};
