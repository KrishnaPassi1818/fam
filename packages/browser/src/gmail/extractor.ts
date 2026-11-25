import type { BrowserController } from '../controller.js';
import type { InteractiveElement } from '../types.js';
import type { EmailHeader, EmailDetail } from './types.js';

export function wrapUntrusted(content: string): string {
  // Sanitize nested closing tags to prevent delimiter escape
  const safe = content.replace(/<\/untrusted_email_content>/gi, '[escaped-tag]');
  return `<untrusted_email_content>\n${safe}\n</untrusted_email_content>`;
}

export function detectAuthState(
  url = '',
  title = '',
  elements: InteractiveElement[] = [],
): 'authenticated' | 'login_required' | 'loading' {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();

  if (lowerUrl.includes('accounts.google.com') || lowerTitle.includes('sign in') || lowerTitle.includes('log in')) {
    return 'login_required';
  }

  const hasCompose = elements.some(
    (e) => e.name.toLowerCase().includes('compose') || e.ref.startsWith('b') && e.name.toLowerCase().includes('compose'),
  );
  const hasInbox = elements.some(
    (e) => e.name.toLowerCase().includes('inbox'),
  );

  if (hasCompose || hasInbox || lowerTitle.includes('inbox') || lowerUrl.includes('mail.google.com')) {
    return 'authenticated';
  }

  if (elements.length === 0 && (lowerUrl.includes('google.com') || lowerUrl.includes('webmail'))) {
    return 'loading';
  }

  return 'authenticated';
}

export class GmailExtractor {
  private readonly controller: BrowserController;

  constructor(controller: BrowserController) {
    this.controller = controller;
  }

  public async getAuthState(tabId?: string): Promise<'authenticated' | 'login_required' | 'loading'> {
    const snap = await this.controller.getInteractiveElements('view', tabId);
    return detectAuthState(snap.url, snap.title, snap.elements);
  }

  public async extractLatestEmails(limit = 5, tabId?: string): Promise<EmailHeader[]> {
    const snap = await this.controller.getInteractiveElements('view', tabId);
    const pageText = await this.controller.getPageText(undefined, tabId);

    const emails: EmailHeader[] = [];

    // Strategy 1: Parse structured email rows from page text (Gmail table / webmail list)
    if (pageText) {
      const textEmails = this.parseEmailsFromText(pageText, limit);
      if (textEmails.length >= limit) {
        return textEmails.slice(0, limit);
      }
      if (textEmails.length > 0) {
        emails.push(...textEmails);
      }
    }

    // Strategy 2: Check x-refs (e.g. x1 "Google Cloud Billing Your monthly invoice...") in ANARC indexer output
    if (emails.length < limit && snap.rawText) {
      const xEmails = this.parseEmailsFromRawIndexer(snap.rawText, limit - emails.length);
      if (xEmails.length > 0) {
        emails.push(...xEmails);
      }
    }

    // Strategy 3: Check interactive elements for email rows / links
    if (emails.length < limit) {
      const emailLinks = snap.elements.filter(
        (e) =>
          (e.role === 'link' || e.ref.startsWith('l')) &&
          !e.name.toLowerCase().includes('inbox') &&
          !e.name.toLowerCase().includes('starred') &&
          !e.name.toLowerCase().includes('sent') &&
          !e.name.toLowerCase().includes('drafts') &&
          !e.name.toLowerCase().includes('trash') &&
          !e.name.toLowerCase().includes('skip to') &&
          !e.name.toLowerCase().includes('screen reader') &&
          !e.name.toLowerCase().includes('google apps') &&
          !e.name.toLowerCase().includes('no thanks') &&
          !e.name.toLowerCase().includes('snoozed') &&
          e.name.length > 10,
      );

      for (let i = 0; i < Math.min(emailLinks.length, limit - emails.length); i++) {
        const link = emailLinks[i]!;
        emails.push({
          id: `email-${emails.length + 1}`,
          sender: 'Recent Sender',
          subject: link.name,
          snippet: link.name,
          date: 'Recent',
          unread: true,
          refId: link.ref,
        });
      }
    }

    return emails.slice(0, limit);
  }

  public parseEmailsFromText(pageText: string, limit = 5): EmailHeader[] {
    const results: EmailHeader[] = [];

    // Pattern A: Live Gmail text format: "unread, <Sender>, <Subject>, <Time>, <Snippet>"
    const liveGmailMatches = pageText.matchAll(
      /(?:unread,\s*)?([^,\n]+),\s*([^,\n]+),\s*(\d{1,2}:\d{2}\s*(?:AM|PM)|Yesterday|[A-Za-z]{3}\s+\d{1,2}),\s*([^,\n]+)/g,
    );

    for (const match of liveGmailMatches) {
      if (results.length >= limit) break;
      const sender = match[1]?.trim() || 'Unknown';
      const subject = match[2]?.trim() || 'No Subject';
      const date = match[3]?.trim() || '';
      const snippet = match[4]?.trim() || '';

      if (
        sender.toLowerCase().includes('search') ||
        sender.toLowerCase().includes('primary') ||
        sender.toLowerCase().includes('promotions') ||
        sender.toLowerCase().includes('social')
      ) {
        continue;
      }

      results.push({
        id: `email-${results.length + 1}`,
        sender,
        subject,
        snippet,
        date,
        unread: match[0].includes('unread'),
      });
    }

    if (results.length >= limit) {
      return results;
    }

    // Pattern B: Numbered list format (e.g. "1. Google Cloud Billing — Your monthly invoice...")
    const numberedMatches = pageText.matchAll(
      /(?:^|\n)\s*(\d+)\.\s+([^\n—–-]+)\s*[—–-]\s*([^\n(]+)(?:\(([^)]+)\))?/g,
    );

    for (const match of numberedMatches) {
      if (results.length >= limit) break;
      results.push({
        id: `email-${results.length + 1}`,
        sender: match[2]?.trim() || 'Unknown',
        subject: match[3]?.trim() || 'No Subject',
        snippet: match[4]?.trim() || '',
        date: 'Recent',
        unread: true,
      });
    }

    return results;
  }

  public parseEmailsFromRawIndexer(rawText: string, limit = 5): EmailHeader[] {
    const results: EmailHeader[] = [];
    const lines = rawText.split('\n');

    for (const line of lines) {
      if (results.length >= limit) break;
      const match = line.match(/^(?:x\d+|[a-z]\d+)\s+"([^"]+)"/);
      if (match) {
        const text = match[1]!;
        if (
          text.includes('Compose') ||
          text.includes('Inbox') ||
          text.includes('Starred') ||
          text.includes('Sent') ||
          text.includes('Drafts') ||
          text.includes('Trash') ||
          text.length < 15
        ) {
          continue;
        }

        // Try split sender and subject if present
        const parts = text.split(/\s{2,}|\s*[-–—]\s*/);
        const sender = parts.length > 1 ? parts[0]!.trim() : text.slice(0, 25).trim();
        const subject = parts.length > 1 ? parts.slice(1).join(' ').trim() : text;

        const refMatch = line.match(/^([a-z]\d+)/);
        results.push({
          id: `email-${results.length + 1}`,
          sender,
          subject,
          snippet: text,
          date: 'Recent',
          unread: true,
          refId: refMatch ? refMatch[1] : undefined,
        });
      }
    }

    return results;
  }

  public async extractEmailDetail(header: EmailHeader, tabId?: string): Promise<EmailDetail> {
    // If refId exists, click it to open detail view
    if (header.refId) {
      await this.controller.click(header.refId, tabId);
    }

    const pageText = await this.controller.getPageText(undefined, tabId);

    // Extract body text safely
    let cleanBody = pageText;
    if (pageText.includes('From:') || pageText.includes('Subject:')) {
      const parts = pageText.split(/(?:Subject:[^\n]+\n\n|Back to Inbox\n\n?)/);
      if (parts.length > 1) {
        cleanBody = parts[parts.length - 1]!.trim();
      }
    }

    return {
      ...header,
      body: wrapUntrusted(cleanBody),
    };
  }
}
