import axios from 'axios';


const STORAGE_KEY = 'greLines_simulateOffline';

let simulated = readStored();

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function isSimulatedOffline(): boolean {
  return simulated;
}

export function setSimulatedOffline(value: boolean): void {
  if (simulated === value) return;
  simulated = value;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, 'true');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
  window.dispatchEvent(new Event(value ? 'offline' : 'online'));
}

let installed = false;

export function installNetworkSimulation(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (!simulated) return nativeFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method === 'GET' && typeof caches !== 'undefined') {
      try {
        const cached = await caches.match(input instanceof URL ? input.href : input, { ignoreVary: true });
        if (cached) return cached;
      } catch {
      }
    }
    throw new TypeError('Failed to fetch (connexion coupée)');
  };

  axios.interceptors.request.use(config => {
    if (simulated) return Promise.reject(new axios.AxiosError('Network Error', 'ERR_NETWORK', config));
    return config;
  });
}
