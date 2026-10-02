function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  if (typeof document !== 'undefined') {
    const area = document.createElement('textarea');
    area.innerHTML = text;
    return area.value;
  }
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function stripHtml(html: string): string {
  if (!html) return '';
  if (!/[<&]/.test(html)) return html.trim();
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/?(p|br|div|ul|ol|h[1-6]|tr|table|section|article)[^>]*>/gi, '\n')
    .replace(/<\/?(td|th)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
