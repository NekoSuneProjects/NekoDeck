function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}
function parseRockstarStatsHtml(html) {
  const stats = [];
  const pairPatterns = [
    /<(?:div|span|td|dt)[^>]*class=["'][^"']*(?:stat(?:Name|Label|Title)|label)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|td|dt)>[\s\S]{0,350}?<(?:div|span|td|dd)[^>]*class=["'][^"']*(?:stat(?:Value)?|value)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|td|dd)>/gi,
    /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi
  ];
  for (const pattern of pairPatterns) {
    let match;
    while ((match = pattern.exec(html)) && stats.length < 120) {
      const label = stripHtml(match[1]), value = stripHtml(match[2]);
      if (label && value && label.length < 120 && value.length < 200) stats.push({ label, value });
    }
    if (stats.length) break;
  }
  const lines = stripHtml(html).split('\n').map(x => x.trim()).filter(x => x && x.length < 240).slice(0, 140);
  return { stats, lines };
}
module.exports = { stripHtml, parseRockstarStatsHtml };
