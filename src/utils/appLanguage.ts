export function appLanguage(): 'fr' | 'en' {
  try {
    return localStorage.getItem('greLines_language') === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}
