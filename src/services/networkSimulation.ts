import axios from 'axios';

/**
 * La coupure de réseau simulée, pour le mode développeur.
 *
 * Tester le hors ligne en coupant le Wi-Fi du téléphone, c'est aussi couper le
 * serveur de développement et les outils qui regardent la page. L'interrupteur
 * fait croire à l'application qu'elle n'a plus de réseau : toute requête
 * qu'elle lance échoue, comme dans un tunnel, et `navigator.onLine` est
 * contredit partout où l'application le consulte.
 *
 * Rien ne s'affiche de plus : c'est le comportement de l'application qu'on
 * veut voir, pas un avertissement de l'outil.
 *
 * Seules les requêtes de la page sont coupées. La carte charge ses tuiles
 * depuis ses propres fils d'exécution : elles restent servies, par le cache ou
 * par le réseau.
 */

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
    /* Stockage refusé : la coupure vaut pour la session seulement. */
  }
  /* Les mêmes évènements que le navigateur : ce qui écoute la connexion
     n'a pas à savoir que la coupure est fausse. */
  window.dispatchEvent(new Event(value ? 'offline' : 'online'));
}

let installed = false;

/** Branche la coupure sur `fetch` et sur axios. À appeler une fois, au démarrage. */
export function installNetworkSimulation(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  /*
   * Coupé, on répond comme le ferait le service worker sans réseau : avec la
   * copie gardée s'il en a une, par un échec sinon. Refuser tout net cassait
   * la carte, dont le style et les tuiles sont justement gardés pour ça.
   */
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (!simulated) return nativeFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method === 'GET' && typeof caches !== 'undefined') {
      try {
        const cached = await caches.match(input instanceof URL ? input.href : input, { ignoreVary: true });
        if (cached) return cached;
      } catch {
        /* Cache illisible : on échoue comme sans copie. */
      }
    }
    throw new TypeError('Failed to fetch (connexion coupée)');
  };

  axios.interceptors.request.use(config => {
    if (simulated) return Promise.reject(new axios.AxiosError('Network Error', 'ERR_NETWORK', config));
    return config;
  });
}
