import allNetworks from './gtfsNetworks.json';
import { SITE_NETWORK } from '../site';

// hidden networks only exist on their own city site
const siteNetworks = SITE_NETWORK
  ? allNetworks.filter(network => network.code === SITE_NETWORK)
  : allNetworks.filter(network => !('hidden' in network && network.hidden));

export default siteNetworks;
