/**
 * Une secousse brève, sur les deux plateformes.
 *
 * Android répond à `navigator.vibrate`. iOS, non : WebKit n'a jamais implémenté
 * l'API de vibration, ni dans Safari ni dans une application posée sur l'écran
 * d'accueil. Un appel y retourne `undefined` sans rien dire, et l'on croit que
 * le code est en cause alors que la plateforme n'écoute pas.
 *
 * Il reste un détour, découvert avec iOS 17.4 : l'interrupteur natif
 * (`<input type="checkbox" switch>`) déclenche le retour haptique du système
 * quand on le bascule. On en garde donc un, caché, qu'on bascule par le code
 * quand on veut une secousse.
 *
 * C'est un effet de bord, pas une API : Apple ne l'a pas documenté comme tel et
 * peut le retirer. D'où la prudence — si rien ne se produit, il ne se produit
 * rien, et aucune fonctionnalité n'en dépend. Deux conditions échappent aussi à
 * l'application : iOS 17.4 au minimum, et « Retour haptique du système » activé
 * dans les réglages Sons et vibrations du téléphone.
 */

/** L'interrupteur caché, créé à la première secousse et gardé ensuite. */
let iosSwitch: HTMLLabelElement | null = null;

function getIosSwitch(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null;
  if (iosSwitch) return iosSwitch;

  const label = document.createElement('label');
  label.ariaHidden = 'true';
  /*
   * Invisible, mais rendu.
   *
   * `display: none` retire l'élément de la mise en page : il n'a plus de boîte,
   * rien ne s'y anime, et WebKit n'a alors aucune bascule à accompagner d'un
   * retour haptique. On le sort donc de l'écran plutôt que de le supprimer —
   * il existe, il occupe une place, simplement pas une qu'on regarde.
   */
  label.style.cssText =
    'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none';

  const input = document.createElement('input');
  input.type = 'checkbox';
  // L'attribut est ignoré partout ailleurs : sur les autres navigateurs, la
  // case reste une case, et la basculer ne fait rien de visible.
  input.setAttribute('switch', '');
  label.appendChild(input);

  // Dans le corps du document, pas dans l'en-tête : un contrôle interactif n'a
  // rien à faire dans `<head>`, et un navigateur est libre de ne pas l'y rendre.
  document.body.appendChild(label);
  iosSwitch = label;
  return label;
}

/**
 * Un petit coup sec — celui d'un cran franchi, d'un seuil atteint.
 *
 * `durationMs` ne vaut que pour Android : iOS choisit lui-même l'intensité de
 * son retour, on ne fait que le demander.
 */
export function hapticTap(durationMs = 12): void {
  if (typeof navigator === 'undefined') return;

  try {
    if (typeof navigator.vibrate === 'function' && navigator.vibrate(durationMs)) {
      return;
    }
  } catch {
    // Certains navigateurs déclarent l'API et refusent l'appel hors geste
    // utilisateur : on passe simplement à la suite.
  }

  try {
    getIosSwitch()?.click();
  } catch {
    // Pas de secousse. Ce n'est pas grave : elle accompagne, elle n'informe pas.
  }
}
