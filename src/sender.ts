import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import type { DraftedEmail, OutreachBatch, SentEmail } from './types';

const client = new Anthropic();
const LOG_PATH = path.join(__dirname, '../data/outreach-log.json');

function loadLog() {
  if (!fs.existsSync(LOG_PATH)) {
    return { batches: [], sentEmails: [], replyTracking: [] };
  }
  return JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
}

function saveLog(log: any) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

export async function sendApprovedEmails(
  batch: OutreachBatch,
  drafts: DraftedEmail[]
): Promise<number> {
  const approved = drafts.filter(d => d.approved);
  
  if (approved.length === 0) {
    console.log('No emails approved for sending.');
    return 0;
  }

  console.log(`\n📤 Sending ${approved.length} emails via Gmail...`);
  
  let sent = 0;
  const sentEmails: SentEmail[] = [];

  for (const draft of approved) {
    try {
      // In Claude Code, Gmail MCP is available as a tool
      // This calls the send_email tool via the Gmail MCP server
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        system: `You are a Gmail automation assistant. Send the email using the Gmail MCP tool.
After sending, return the message ID in JSON format: { "messageId": "...", "success": true }
If sending fails, return: { "success": false, "error": "..." }`,
        messages: [
          {
            role: 'user',
            content: `Send this email via Gmail:

TO: ${draft.contact.email}
SUBJECT: ${draft.subject}
BODY:
${draft.edited || draft.body}

Then apply a label "OutreachSent" to track it.
Return the message ID as JSON.`
          }
        ],
        // Gmail MCP tools available when running in Claude Code
        // claude mcp add gmail -- npx @gongrzhe/server-gmail-autoauth-mcp
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      
      try {
        const result = JSON.parse(text.replace(/```json|```/g, '').trim());
        if (result.success) {
          sent++;
          sentEmails.push({
            batchId: batch.id,
            company: draft.contact.company,
            contactEmail: draft.contact.email,
            contactName: draft.contact.name,
            sentAt: new Date().toISOString(),
            gmailMessageId: result.messageId || 'unknown',
            gmailLabelId: 'OutreachSent'
          });
          console.log(`  ✅ Sent to ${draft.contact.name} (${draft.contact.email})`);
        } else {
          console.error(`  ❌ Failed to send to ${draft.contact.name}: ${result.error}`);
        }
      } catch {
        console.error(`  ❌ Could not parse send result for ${draft.contact.name}`);
      }

      // Rate limit: wait 2s between sends to avoid spam triggers
      await new Promise(r => setTimeout(r, 2000));

    } catch (error) {
      console.error(`  ❌ Error sending to ${draft.contact.name}:`, error);
    }
  }

  // Log everything
  const log = loadLog();
  log.batches.push({
    ...batch,
    status: sent === approved.length ? 'sent' : 'partial_sent',
    sentAt: new Date().toISOString()
  });
  log.sentEmails.push(...sentEmails);
  saveLog(log);

  console.log(`\n📊 Sent ${sent}/${approved.length} emails successfully`);
  console.log(`📁 Logged to ${LOG_PATH}`);
  
  return sent;
}
