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

    // Match each result block
    const blockRegex = /<div class="[^"]*result__body[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = blockRegex.exec(html)) !== null && results.length < limit) {
      const block = blockMatch[1]!;

      // Extract title and URL
      const titleMatch = /<h2 class="result__title">\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(
        block,
      );
      if (!titleMatch) continue;

      let rawUrl = titleMatch[1]!;
      let title = titleMatch[2]!.replace(/<[^>]+>/g, '').trim();

      // Decode DuckDuckGo redirect URL
      const uddgMatch = /uddg=([^&]+)/.exec(rawUrl);
      if (uddgMatch && uddgMatch[1]) {
        try {
          rawUrl = decodeURIComponent(uddgMatch[1]);
        } catch {
          // Keep rawUrl
        }
      }

      // Extract snippet
      const snippetMatch = /<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(
        block,
      );
      let snippet = snippetMatch
        ? snippetMatch[1]!.replace(/<[^>]+>/g, '').trim()
        : '';

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
