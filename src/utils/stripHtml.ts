/**
 * Convert HTML-encoded traffic descriptions to clean plain text.
 * - Block tags (<p>, <br>, <div>, <li>) → newline
 * - All remaining tags stripped
 * - HTML entities decoded (&amp; → &, &lt; → <, &nbsp; → space, etc.)
 * - Consecutive blank lines collapsed to one
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    // Block-level tags → newline so text stays readable
    .replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|tr|td|th)[^>]*>/gi, '\n')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Collapse 3+ consecutive newlines to 2 max
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}