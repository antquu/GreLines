let iosSwitch: HTMLLabelElement | null = null;

function getIosSwitch(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null;
  if (iosSwitch) return iosSwitch;

  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.cssText =
    'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);

  document.body.appendChild(label);
  iosSwitch = label;
  return label;
}

export function hapticTap(durationMs = 12): void {
  if (typeof navigator === 'undefined') return;

  try {
    if (typeof navigator.vibrate === 'function' && navigator.vibrate(durationMs)) {
      return;
    }
  } catch {
  }

  try {
    getIosSwitch()?.click();
  } catch {
  }
}
