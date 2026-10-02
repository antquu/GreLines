import allNetworks from './gtfsNetworks.json';
import { IS_NANCY } from '../site';

const siteNetworks = IS_NANCY ? allNetworks.filter(network => network.code === 'STAN') : allNetworks;

export default siteNetworks;
