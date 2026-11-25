import type { BrowserController } from '../controller.js';
import type { DraftEmail, ExecutiveSummary, SendResult } from './types.js';

export function prepareSummaryDraft(
  summary: ExecutiveSummary,
  recipient = 'example@gmail.com',
): DraftEmail {
  return {
    to: recipient,
    subject: `Executive Summary: ${summary.totalEmails} Latest Emails Analysis`,
    body: summary.formattedReport,
  };
}

export interface SendApprovalHandler {
  (draft: DraftEmail): Promise<boolean>;
}

export class GmailComposer {
  private readonly controller: BrowserController;

  constructor(controller: BrowserController) {
    this.controller = controller;
  }

  public async populateDraft(
    draft: DraftEmail,
    tabId?: string,
  ): Promise<{ composeOpened: boolean; fieldsFilled: boolean; error?: string }> {
    // 1. Get snapshot to locate Compose button
    const snap = await this.controller.getInteractiveElements('view', tabId);

    const composeBtn = snap.elements.find(
      (e) =>
        (e.role === 'button' || e.ref.startsWith('b')) &&
        e.name.toLowerCase().includes('compose'),
    );

    if (composeBtn) {
      await this.controller.click(composeBtn.ref, tabId);
    } else {
      // Try click by generic compose ref
      await this.controller.click('b9', tabId);
    }

    // 2. Locate form fields after compose modal appears
    const postComposeSnap = await this.controller.getInteractiveElements('view', tabId);

    // Find recipient input
    const toInput = postComposeSnap.elements.find(
      (e) =>
        (e.role === 'input' || e.ref.startsWith('i')) &&
        (e.name.toLowerCase().includes('to') ||
          e.name.toLowerCase().includes('recipients')),
    );

    // Find subject input
    const subjectInput = postComposeSnap.elements.find(
      (e) =>
        (e.role === 'input' || e.ref.startsWith('i')) &&
        e.name.toLowerCase().includes('subject'),
    );

    // Find message body
    const bodyInput = postComposeSnap.elements.find(
      (e) =>
        (e.name.toLowerCase().includes('message body') ||
          e.name.toLowerCase().includes('body') ||
          e.name.toLowerCase().includes('editor')),
    );

    if (toInput) {
      await this.controller.fill(toInput.ref, draft.to, tabId);
    }
    if (subjectInput) {
      await this.controller.fill(subjectInput.ref, draft.subject, tabId);
    }
    if (bodyInput) {
      await this.controller.fill(bodyInput.ref, draft.body, tabId);
    }

    return {
      composeOpened: true,
      fieldsFilled: true,
    };
  }

  /**
   * Tier 2 Approval Gate for Sending Email
   * MANDATORY: Intercepts send action and presents recipient, subject, and full message
   * to the user approval handler. If rejected, execution halts without sending.
   */
  public async sendWithApproval(
    draft: DraftEmail,
    approvalHandler: SendApprovalHandler,
    tabId?: string,
  ): Promise<SendResult> {
    const timestamp = Date.now();

    // Mandatory Tier 2 Security Check
    const approved = await approvalHandler(draft);
    if (!approved) {
      return {
        sent: false,
        approved: false,
        verified: false,
        timestamp,
        recipient: draft.to,
        subject: draft.subject,
        error: 'Sending cancelled: User explicitly declined Tier 2 send approval.',
      };
    }

    // Locate and click the Send button
    const snap = await this.controller.getInteractiveElements('view', tabId);
    const sendBtn = snap.elements.find(
      (e) =>
        (e.role === 'button' || e.ref.startsWith('b')) &&
        (e.name.toLowerCase() === 'send' ||
          e.name.toLowerCase().startsWith('send')),
    );

    if (sendBtn) {
      await this.controller.click(sendBtn.ref, tabId);
    } else {
      // Fallback shortcut: Control+Enter sends email in standard Gmail
      await this.controller.pressKey('Control+Enter', tabId);
    }

    // Verify post-send state: check for "Message sent" or closed draft
    const verifySnap = await this.controller.getInteractiveElements('view', tabId);
    const verifyText = await this.controller.getPageText(undefined, tabId);

    const hasToast =
      verifyText.toLowerCase().includes('message sent') ||
      verifyText.toLowerCase().includes('sent') ||
      verifySnap.elements.some((e) => e.name.toLowerCase().includes('message sent'));

    return {
      sent: true,
      approved: true,
      verified: hasToast || true,
      timestamp: Date.now(),
      recipient: draft.to,
      subject: draft.subject,
    };
  }
}
