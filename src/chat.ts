import 'dotenv/config';
import * as readline from 'readline';
import Anthropic from '@anthropic-ai/sdk';
import { checkInboxForApplications, deduplicateApplications } from './monitor';
import { findContacts } from './researcher';
import { draftAllEmails } from './drafter';
import { runApprovalFlow } from './approver';
import { sendApprovedEmails } from './sender';
import { checkForReplies } from './tracker';
import type { DetectedApplication, OutreachBatch } from './types';
import * as path from 'path';
import * as fs from 'fs';

const client = new Anthropic();
const LOG_PATH = path.join(__dirname, '../data/outreach-log.json');

let detectedApps: DetectedApplication[] = [];
let conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>(r => rl.question(q, r));

function printBanner() {
  console.log('\n' + '═'.repeat(55));
  console.log('  🚀  JOB APPLICATION OUTREACH AGENT');
  console.log('  Chat with the agent to control everything');
  console.log('═'.repeat(55));
  console.log('  Commands you can say naturally:');
  console.log('  • "scan my emails"');
  console.log('  • "show me what you found"');
  console.log('  • "run outreach for Likewize"');
  console.log('  • "skip HartleyCo"');
  console.log('  • "check for replies"');
  console.log('  • "quit"');
  console.log('═'.repeat(55) + '\n');
}

function getSystemPrompt(): string {
  const appsContext = detectedApps.length > 0
    ? `\n\nDETECTED APPLICATIONS (${detectedApps.length} total):\n` +
      detectedApps.map((a, i) => `${i + 1}. ${a.company} — ${a.role} (${new Date(a.appliedAt).toLocaleDateString()})`).join('\n')
    : '\n\nNo applications scanned yet.';

  const logContext = fs.existsSync(LOG_PATH)
    ? (() => {
        const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
        const sent = log.sentEmails?.length || 0;
        const replies = log.replyTracking?.length || 0;
        return `\n\nOUTREACH LOG: ${sent} emails sent, ${replies} replies received.`;
      })()
    : '';

  return `You are an outreach agent assistant for Jay, a PM job seeker. You help him run targeted outreach after job applications.

Jay's background: PM with 3+ years experience, built TalentLens (multi-agent AI on Claude API), drove 18% pipeline improvement at Pipeline Velocity, co-founder of Amigo (15k users). Graduating NC State MEM May 2026.

YOUR CAPABILITIES:
- scan_emails: scan Gmail for application confirmations
- show_apps: show detected applications list
- run_outreach(company): run full outreach pipeline for a specific company
- run_all: run outreach for all detected apps
- check_replies: check for replies on sent outreach
- show_stats: show outreach stats

BEHAVIOR:
- Be conversational and brief
- When Jay names a company, confirm you understood and act on it
- If multiple companies match a partial name, list them and ask which one
- Never run outreach without Jay explicitly saying yes to a specific company
- Keep responses under 3 sentences unless showing a list
- Use ACTION: tags to signal what to execute, e.g. ACTION:scan_emails or ACTION:run_outreach:Likewize
${appsContext}${logContext}`;
}

async function handleAction(action: string): Promise<string> {
  const [cmd, ...args] = action.split(':');

  if (cmd === 'scan_emails') {
    console.log('\n');
    const apps = await checkInboxForApplications(60);
    detectedApps = deduplicateApplications(apps, LOG_PATH);
    return `Found ${detectedApps.length} applications. Here they are:\n` +
      detectedApps.map((a, i) => `${i + 1}. **${a.company}** — ${a.role}`).join('\n');
  }

  if (cmd === 'show_apps') {
    if (detectedApps.length === 0) return 'No apps scanned yet. Say "scan my emails" first.';
    return 'Here are your detected applications:\n' +
      detectedApps.map((a, i) => `${i + 1}. **${a.company}** — ${a.role} (${new Date(a.appliedAt).toLocaleDateString()})`).join('\n');
  }

  if (cmd === 'run_outreach') {
    const companyName = args.join(':').trim();
    const app = detectedApps.find(a =>
      a.company.toLowerCase().includes(companyName.toLowerCase())
    );

    if (!app) {
      return `Couldn't find "${companyName}" in your detected applications. Try "show me what you found" to see the list.`;
    }

    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  Running outreach for ${app.company}`);
    console.log('═'.repeat(55) + '\n');

    try {
      const contacts = await findContacts(app);
      if (contacts.length === 0) return `Couldn't find contacts at ${app.company}. Try a different company.`;

      const drafts = await draftAllEmails(contacts, app);
      const reviewed = await runApprovalFlow(drafts);

      const batch: OutreachBatch = {
        id: app.id,
        application: app,
        contacts,
        drafts: reviewed,
        status: 'pending_approval',
        createdAt: new Date().toISOString()
      };

      const sent = await sendApprovedEmails(batch, reviewed);
      return `Done! Sent ${sent} emails for ${app.company}. Run "check replies" in a few days.`;
    } catch (e: any) {
      return `Something went wrong: ${e.message}`;
    }
  }

  if (cmd === 'check_replies') {
    console.log('\n');
    await checkForReplies();
    return 'Reply check complete. See above for results.';
  }

  if (cmd === 'show_stats') {
    if (!fs.existsSync(LOG_PATH)) return 'No outreach sent yet.';
    const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
    const sent = log.sentEmails?.length || 0;
    const replies = log.replyTracking?.length || 0;
    const rate = sent > 0 ? Math.round(replies / sent * 100) : 0;
    return `📊 Stats: ${sent} emails sent, ${replies} replies (${rate}% reply rate).`;
  }

  return '';
}

async function chat(userMessage: string): Promise<void> {
  conversationHistory.push({ role: 'user', content: userMessage });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    system: getSystemPrompt(),
    messages: conversationHistory
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Check for ACTION tags and execute them
  const actionMatch = text.match(/ACTION:([^\s\n]+)/);
  let displayText = text.replace(/ACTION:[^\s\n]+/g, '').trim();

  if (actionMatch) {
    const actionResult = await handleAction(actionMatch[1]);
    if (actionResult) {
      displayText = displayText
        ? displayText + '\n\n' + actionResult
        : actionResult;
    }
  }

  console.log(`\n🤖  ${displayText}\n`);
  conversationHistory.push({ role: 'assistant', content: text });
}

async function main() {
  printBanner();
  console.log('🤖  Hey Jay! Ready to run outreach. Say "scan my emails" to get started, or ask me anything.\n');

  while (true) {
    const input = await ask('You: ');
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (['quit', 'exit', 'bye'].includes(trimmed.toLowerCase())) {
      console.log('\n🤖  Later! Good luck with the search.\n');
      rl.close();
      break;
    }

    try {
      await chat(trimmed);
    } catch (e: any) {
      console.error(`\n❌  Error: ${e.message}\n`);
    }
  }
}

main();