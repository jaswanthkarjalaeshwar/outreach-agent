import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import type { ReplyRecord } from './types';

const client = new Anthropic();
const LOG_PATH = path.join(__dirname, '../data/outreach-log.json');

export async function checkForReplies(): Promise<void> {
  const log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
  const untracked = log.sentEmails.filter((email: any) => {
    const alreadyTracked = log.replyTracking.some(
      (r: ReplyRecord) => r.sentEmailId === email.gmailMessageId
    );
    return !alreadyTracked;
  });

  if (untracked.length === 0) {
    console.log('No new replies to check.');
    return;
  }

  console.log(`\n📬 Checking ${untracked.length} sent emails for replies...`);

  // Use Gmail MCP via Claude Code to search for replies
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: `Check Gmail for replies to these outreach emails.
For each email, search for replies from the contact.
Return JSON: { "replies": [ { "messageId": "...", "replied": true/false, "sentiment": "positive|neutral|negative" } ] }`,
    messages: [
      {
        role: 'user',
        content: `Check for replies to these outreach emails:
${untracked.map((e: any) => `- From: ${e.contactEmail} | Sent: ${e.sentAt} | MessageID: ${e.gmailMessageId}`).join('\n')}

Search Gmail for replies to each. Return JSON only.`
      }
    ]
  });

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());
    
    const newRecords: ReplyRecord[] = result.replies
      .filter((r: any) => r.replied)
      .map((r: any) => {
        const original = untracked.find((e: any) => e.gmailMessageId === r.messageId);
        const batch = log.batches.find((b: any) => b.id === original?.batchId);
        const contact = batch?.contacts?.find((c: any) => c.email === original?.contactEmail);
        
        return {
          sentEmailId: r.messageId,
          repliedAt: new Date().toISOString(),
          sentiment: r.sentiment || 'neutral',
          archetype: contact?.archetype || 'generic',
          emailWordCount: 0
        };
      });

    if (newRecords.length > 0) {
      log.replyTracking.push(...newRecords);
      fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
      console.log(`\n🎉 ${newRecords.length} new replies detected!`);
      newRecords.forEach(r => console.log(`  ✅ Reply with ${r.sentiment} sentiment from ${r.archetype}`));
    } else {
      console.log('No new replies yet.');
    }

    // Print reply rate stats
    printReplyStats(log);

  } catch (e) {
    console.error('Failed to parse reply data:', e);
  }
}

function printReplyStats(log: any) {
  const total = log.sentEmails.length;
  const replied = log.replyTracking.filter((r: ReplyRecord) => r.sentiment !== 'no_reply').length;
  
  if (total === 0) return;
  
  console.log(`\n📊 REPLY STATS`);
  console.log(`Overall reply rate: ${replied}/${total} (${Math.round(replied/total*100)}%)`);
  
  // By archetype
  const archetypes = ['recruiter', 'hiring_manager', 'peer_pm', 'engineering_manager', 'executive'];
  archetypes.forEach(type => {
    const sent = log.sentEmails.filter((e: any) => {
      const batch = log.batches.find((b: any) => b.id === e.batchId);
      const contact = batch?.contacts?.find((c: any) => c.email === e.contactEmail);
      return contact?.archetype === type;
    }).length;
    
    if (sent > 0) {
      const replies = log.replyTracking.filter((r: ReplyRecord) => r.archetype === type).length;
      console.log(`  ${type}: ${replies}/${sent} replied`);
    }
  });
}
