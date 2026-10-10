import allNetworks from './gtfsNetworks.json';
import { SITE_NETWORK } from '../site';

const siteNetworks = SITE_NETWORK ? allNetworks.filter(network => network.code === SITE_NETWORK) : allNetworks;

export default siteNetworks;
