export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(query: string, limit = 5): Promise<SearchResult[]> {
  try {
    const encoded = encodeURIComponent(query);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!resp.ok) {
      throw new Error(`Search request failed with status ${resp.status}`);
    }

    const html = await resp.text();
    const results: SearchResult[] = [];

    // Match each result block using title and snippet tags
    const resultRegex =
      /<h2 class="result__title">[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
      let rawUrl = match[1]!;
      let title = match[2]!.replace(/<[^>]+>/g, '').trim();
      let snippet = match[3]!.replace(/<[^>]+>/g, '').trim();

      // Decode DuckDuckGo redirect URL
      const uddgMatch = /uddg=([^&]+)/.exec(rawUrl);
      if (uddgMatch && uddgMatch[1]) {
        try {
          rawUrl = decodeURIComponent(uddgMatch[1]);
        } catch {
          // Keep rawUrl
        }
      }

      // Unescape HTML entities
      title = unescapeHtml(title);
      snippet = unescapeHtml(snippet);

      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        results.push({
          title,
          url: rawUrl,
          snippet,
        });
      }
    }

    return results;
  } catch (err) {
    return [
      {
        title: `Search error for "${query}"`,
        url: 'https://duckduckgo.com',
        snippet: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}

function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
