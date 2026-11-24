import { AnarcBrowserAdapter } from '../packages/browser/src/anarc.js';
import { GmailExtractor } from '../packages/browser/src/gmail/extractor.js';
import { generateExecutiveSummary } from '../packages/browser/src/gmail/summarizer.js';
import { prepareSummaryDraft } from '../packages/browser/src/gmail/composer.js';

async function main() {
  console.log('Connecting to live ANARC browser via AnarcBrowserAdapter...');
  const adapter = new AnarcBrowserAdapter({
    socketPath: '/run/user/1000/anarc/ctl.sock',
  });

  const health = await adapter.health();
  console.log('ANARC Health:', JSON.stringify(health));

  if (!health.connected) {
    console.error('ANARC is not connected!');
    process.exit(1);
  }

  const tabs = await adapter.listTabs();
  console.log('Open tabs:', tabs.map((t) => `${t.id}: ${t.title} (${t.url})`));

  const gmailTab = tabs.find((t) => t.url?.includes('mail.google.com')) || tabs[0];
  if (!gmailTab) {
    console.error('No Gmail tab found!');
    process.exit(1);
  }

  console.log(`Using active tab: ${gmailTab.id} ("${gmailTab.title}")`);

  const extractor = new GmailExtractor(adapter);
  const authState = await extractor.getAuthState(gmailTab.id);
  console.log('Auth State:', authState);

  console.log('Extracting latest 5 emails from live Gmail...');
  const emails = await extractor.extractLatestEmails(5, gmailTab.id);
  console.log(`Extracted ${emails.length} emails:`);
  emails.forEach((e, i) => {
    console.log(`  [${i + 1}] ${e.sender} | ${e.subject} | ${e.date}`);
  });

  console.log('\nGenerating executive summary and report...');
  const summary = generateExecutiveSummary(emails);
  console.log('Executive Summary Metrics:');
  console.log(`- Total Emails: ${summary.totalEmails}`);
  console.log(`- Urgent Alerts: ${summary.urgentCount}`);
  console.log(`- Pending Deadlines: ${summary.pendingDeadlines.join(', ') || 'None'}`);

  console.log('\n--- Prepared Draft Email ---');
  const draft = prepareSummaryDraft(summary, 'example@gmail.com');
  console.log(`To: ${draft.to}`);
  console.log(`Subject: ${draft.subject}`);
  console.log(`Body Length: ${draft.body.length} characters`);
  console.log('\nPreview of Body:');
  console.log(draft.body.slice(0, 400) + '...\n');

  console.log('End-to-End Live Extraction & Summarization SUCCESS!');
  await adapter.close();
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
