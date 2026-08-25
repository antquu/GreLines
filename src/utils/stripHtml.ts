
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    
    .replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|tr|td|th)[^>]*>/gi, '\n')
    
    .replace(/<[^>]+>/g, '')
    
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}