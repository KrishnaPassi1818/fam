export async function fetchMarkdown(url: string, maxChars = 10000): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
        Accept: 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!resp.ok) {
      return `Failed to fetch URL ${url}: HTTP ${resp.status} ${resp.statusText}`;
    }

    const contentType = resp.headers.get('content-type') || '';
    const raw = await resp.text();

    if (contentType.includes('text/plain') || contentType.includes('markdown')) {
      return raw.slice(0, maxChars);
    }

    // Convert HTML to simple markdown / readable text
    let clean = raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n* $1')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();

    if (clean.length > maxChars) {
      clean = clean.slice(0, maxChars) + '\n\n[Content truncated...]';
    }

    return clean;
  } catch (err) {
    return `Error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
