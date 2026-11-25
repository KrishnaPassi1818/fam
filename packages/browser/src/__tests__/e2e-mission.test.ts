import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GmailExtractor,
  generateExecutiveSummary,
  prepareSummaryDraft,
  GmailComposer,
} from '../gmail/index.js';
import type { BrowserController } from '../controller.js';
import { BrowserSessionManager } from '../session.js';

describe('Autonomous End-to-End Target Task Mission (Milestones P9 & P10)', () => {
  let mockController: BrowserController;
  let sessionManager: BrowserSessionManager;

  const mockFixtureInbox = `Inbox (5 unread)

1. Google Cloud Billing — Your monthly invoice for November is ready ($34.12, automatic payment scheduled)
2. GitHub Security — [Security Notice] New personal access token created (token 'agent-token' generated, revoke immediately if unverified)
3. Stripe Notifications — Payout of $4,250.00 is on the way (bank account ending in 4102, arrive in 1-2 business days)
4. Linear Team — Rover assigned you to issue ENG-412: In-process DevTools (due by end of sprint)
5. Anthropic Updates — Claude 3.7 Sonnet hybrid reasoning availability (provisioned for workspace)
`;

  beforeEach(() => {
    mockController = {
      health: vi.fn().mockResolvedValue({
        connected: true,
        version: '0.1.0',
        windowPainted: true,
        cefInitialized: true,
        activeSpace: 'Personal',
        activeTab: 'personal-tab-2',
        tabsCount: 2,
      }),
      listTabs: vi.fn().mockResolvedValue([
        {
          id: 'personal-tab-2',
          title: 'Inbox (5 unread) - Webmail',
          url: 'https://mail.google.com/mail/u/0/#inbox',
          active: true,
        },
      ]),
      newTab: vi.fn().mockResolvedValue({ id: 't2', title: '', url: '', active: true }),
      switchTab: vi.fn().mockResolvedValue(undefined),
      closeTab: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue({
        status: 'ok',
        url: 'https://mail.google.com/mail/u/0/#inbox',
        title: 'Inbox (5 unread) - Webmail',
      }),
      getInteractiveElements: vi.fn().mockResolvedValue({
        url: 'https://mail.google.com/mail/u/0/#inbox',
        title: 'Inbox (5 unread) - Webmail',
        elements: [
          { ref: 'b1', kind: 'b', name: '+ Compose', selector: '#compose-btn' },
          { ref: 'l1', kind: 'l', name: 'Inbox 5', selector: '#inbox-link' },
          { ref: 'x1', kind: 'x', name: 'Google Cloud Billing Your monthly invoice for November is ready' },
          { ref: 'x2', kind: 'x', name: 'GitHub Security [Security Notice] New personal access token created' },
          { ref: 'x3', kind: 'x', name: 'Stripe Notifications Payout of $4,250.00 is on the way' },
          { ref: 'x4', kind: 'x', name: 'Linear Team Rover assigned you to issue ENG-412' },
          { ref: 'x5', kind: 'x', name: 'Anthropic Updates Claude 3.7 Sonnet hybrid reasoning availability' },
        ],
        rawText: `[Personal] personal-tab-2
b1 "+ Compose"
l1 "Inbox 5"
x1 "Google Cloud Billing Your monthly invoice for November is ready"
x2 "GitHub Security [Security Notice] New personal access token created"
x3 "Stripe Notifications Payout of $4,250.00 is on the way"
x4 "Linear Team Rover assigned you to issue ENG-412"
x5 "Anthropic Updates Claude 3.7 Sonnet hybrid reasoning availability"
`,
      }),
      getPageText: vi.fn().mockResolvedValue(mockFixtureInbox),
      getLinks: vi.fn().mockResolvedValue([]),
      click: vi.fn().mockResolvedValue({ status: 'ok', ops: 'b1' }),
      clickCoordinates: vi.fn().mockResolvedValue({ status: 'ok', ops: 'xy 100 200' }),
      fill: vi.fn().mockResolvedValue({ status: 'ok', ops: 'fill' }),
      type: vi.fn().mockResolvedValue({ status: 'ok', ops: 'type' }),
      pressKey: vi.fn().mockResolvedValue({ status: 'ok', ops: 'key Enter' }),
      scroll: vi.fn().mockResolvedValue({ status: 'ok', ops: 'scroll' }),
      screenshot: vi.fn().mockResolvedValue({ dataBase64: 'fake-png', mimeType: 'image/png' }),
      executeScript: vi.fn().mockResolvedValue({ status: 'ok', value: null }),
      waitForNavigation: vi.fn().mockResolvedValue({ status: 'ok', url: 'https://mail.google.com' }),
    } as unknown as BrowserController;

    sessionManager = new BrowserSessionManager(mockController);
  });

  it('executes full autonomous mission flow with verified Tier 2 approval gate', async () => {
    // Step 1: Health & connection check
    const health = await mockController.health();
    expect(health.connected).toBe(true);
    await sessionManager.sync();

    // Step 2: Session establishment and navigation
    const nav = await sessionManager.navigate('https://mail.google.com/mail/u/0/#inbox');
    expect(nav.status).toBe('ok');
    expect(nav.url).toContain('mail.google.com');

    // Step 3: Auth state verification
    const extractor = new GmailExtractor(mockController);
    const authState = await extractor.getAuthState();
    expect(authState).toBe('authenticated');

    // Step 4: Extract 5 latest emails
    const emails = await extractor.extractLatestEmails(5);
    expect(emails.length).toBe(5);

    // Step 5: Generate structured executive intelligence summary
    const summary = generateExecutiveSummary(emails);
    expect(summary.totalEmails).toBe(5);
    expect(summary.urgentCount).toBeGreaterThanOrEqual(1);
    expect(summary.pendingDeadlines.length).toBeGreaterThanOrEqual(2);

    // Step 6: Prepare draft targeting example@gmail.com
    const draft = prepareSummaryDraft(summary, 'example@gmail.com');
    expect(draft.to).toBe('example@gmail.com');
    expect(draft.subject).toContain('Executive Summary');
    expect(draft.body).toContain('# Executive Email Intelligence Summary');

    // Step 7 & 8: Tier 2 Interactive User Approval Gate
    const composer = new GmailComposer(mockController);
    let presentedDraft: typeof draft | null = null;
    const approvalHandler = vi.fn().mockImplementation(async (d) => {
      presentedDraft = d;
      return true; // User approves
    });

    const sendRes = await composer.sendWithApproval(draft, approvalHandler);

    expect(approvalHandler).toHaveBeenCalledTimes(1);
    expect(presentedDraft).toEqual(draft);
    expect(sendRes.sent).toBe(true);
    expect(sendRes.approved).toBe(true);
    expect(sendRes.verified).toBe(true);
    expect(sendRes.recipient).toBe('example@gmail.com');

    // Step 9: Verify telemetry and prompt context stability
    const finalContext = sessionManager.formatPromptContext();
    expect(finalContext).toContain('personal-tab-2');
    expect(finalContext).toContain('mail.google.com');
  });

  it('guarantees that Tier 2 approval blocks email dispatch when rejected', async () => {
    const extractor = new GmailExtractor(mockController);
    const emails = await extractor.extractLatestEmails(5);
    const summary = generateExecutiveSummary(emails);
    const draft = prepareSummaryDraft(summary, 'example@gmail.com');

    const composer = new GmailComposer(mockController);
    const rejectApprovalHandler = vi.fn().mockResolvedValue(false);

    const sendRes = await composer.sendWithApproval(draft, rejectApprovalHandler);

    expect(rejectApprovalHandler).toHaveBeenCalledWith(draft);
    expect(sendRes.sent).toBe(false);
    expect(sendRes.approved).toBe(false);
    expect(sendRes.error).toContain('User explicitly declined');
    expect(mockController.pressKey).not.toHaveBeenCalled();
  });
});
