#!/usr/bin/env node
import { checkInboxForApplications, deduplicateApplications } from './monitor';
import { findContacts } from './researcher';
import { draftAllEmails } from './drafter';
import { runApprovalFlow } from './approver';
import { sendApprovedEmails } from './sender';
import { checkForReplies } from './tracker';
import type { OutreachBatch } from './types';
import * as path from 'path';

const LOG_PATH = path.join(__dirname, '../data/outreach-log.json');
const args = process.argv.slice(2);
const mode = args[0] || 'once';

async function runPipeline() {
  console.log('\n🚀 JOB APPLICATION OUTREACH AGENT');
  console.log('──────────────────────────────────\n');

  // Step 1: Detect applications
  const applications = await checkInboxForApplications();
  const newApplications = deduplicateApplications(applications, LOG_PATH);

  if (newApplications.length === 0) {
    console.log('✅ No new application confirmations found.');
    return;
  }

  console.log(`\n📋 Found ${newApplications.length} new application(s):`);
  newApplications.forEach(app => {
    console.log(`  → ${app.role} at ${app.company}`);
  });

  // Process each application
  for (const application of newApplications) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`PROCESSING: ${application.role} at ${application.company}`);
    console.log('='.repeat(50));

    // Step 2: Find contacts
    const contacts = await findContacts(application);
    
    if (contacts.length === 0) {
      console.log(`⚠️  Could not find contacts for ${application.company}. Skipping.`);
      continue;
    }

    console.log(`\n✅ Found ${contacts.length} contacts:`);
    contacts.forEach(c => {
      console.log(`  → ${c.name} (${c.title}) — Score: ${c.score}/100 ${c.emailVerified ? '✓' : '⚠️'}`);
    });

    // Step 3: Draft emails
    console.log('\n✍️  Drafting personalized emails...');
    const drafts = await draftAllEmails(contacts, application);

    // Step 4: Approval flow
    const reviewed = await runApprovalFlow(drafts);

    // Step 5: Send
    const batch: OutreachBatch = {
      id: application.id,
      application,
      contacts,
      drafts: reviewed,
      status: 'pending_approval',
      createdAt: new Date().toISOString()
    };

    const sentCount = await sendApprovedEmails(batch, reviewed);
    
    console.log(`\n✅ Done. Sent ${sentCount} emails for ${application.company}.`);
    console.log('Check back in 5-7 days — run: npm run track');
  }
}

async function watchMode() {
  const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
  console.log(`\n👀 WATCH MODE — polling every 2 minutes`);
  console.log('Press Ctrl+C to stop\n');
  
  const run = async () => {
    try {
      await runPipeline();
    } catch (e) {
      console.error('Pipeline error:', e);
    }
  };

  await run();
  setInterval(run, POLL_INTERVAL);
}

// Entrypoint
(async () => {
  try {
    if (mode === 'watch') {
      await watchMode();
    } else if (mode === 'track') {
      await checkForReplies();
    } else {
      await runPipeline();
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
