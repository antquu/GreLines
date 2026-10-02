const OPTED_OUT_KEY = 'greLines_optedOutPopups';

export function getOptedOutIds(): Set<string> {
  try {
    const raw = localStorage.getItem(OPTED_OUT_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function clearOptedOutPopups(): number {
  const count = getOptedOutIds().size;
  try {
    localStorage.removeItem(OPTED_OUT_KEY);
  } catch {
  }
  return count;
}

export function markOptedOut(id: string) {
  const optedOut = getOptedOutIds();
  optedOut.add(id);
  try {
    localStorage.setItem(OPTED_OUT_KEY, JSON.stringify(Array.from(optedOut)));
  } catch {
  }
}
