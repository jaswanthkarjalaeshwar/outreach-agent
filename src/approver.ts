import * as readline from 'readline';
import type { DraftedEmail } from './types';
import { archetypeLabel } from './researcher';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

function printDivider() {
  console.log('\n' + '─'.repeat(60));
}

function printEmail(draft: DraftedEmail, index: number, total: number) {
  printDivider();
  console.log(`\n📧 EMAIL ${index + 1} of ${total}`);
  console.log(`${archetypeLabel(draft.contact.archetype)} — Score: ${draft.contact.score}/100`);
  console.log(`\nTO:      ${draft.contact.name}`);
  console.log(`TITLE:   ${draft.contact.title}`);
  console.log(`EMAIL:   ${draft.contact.email}${draft.contact.emailVerified ? ' ✓' : ' ⚠️  unverified'}`);
  if (draft.contact.recentActivity) {
    console.log(`CONTEXT: ${draft.contact.recentActivity}`);
  }
  console.log(`\nSUBJECT: ${draft.subject}`);
  console.log(`\n${draft.body}`);
}

export async function runApprovalFlow(drafts: DraftedEmail[]): Promise<DraftedEmail[]> {
  console.log('\n\n🔍 REVIEW YOUR OUTREACH EMAILS');
  console.log('For each email: [a]pprove, [s]kip, [e]dit, [q]uit\n');

  const reviewed: DraftedEmail[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const draft = { ...drafts[i] };
    printEmail(draft, i, drafts.length);

    let done = false;
    while (!done) {
      const answer = await prompt('\n[a]pprove / [s]kip / [e]dit body / [r]ewrite subject / [q]uit: ');
      
      switch (answer.trim().toLowerCase()) {
        case 'a':
        case 'approve':
          draft.approved = true;
          reviewed.push(draft);
          console.log('✅ Approved');
          done = true;
          break;

        case 's':
        case 'skip':
          draft.approved = false;
          reviewed.push(draft);
          console.log('⏭️  Skipped');
          done = true;
          break;

        case 'e':
        case 'edit':
          console.log('\nPaste your edited email body (press Enter twice when done):');
          let editedBody = '';
          let lastLine = '';
          while (true) {
            const line = await prompt('');
            if (line === '' && lastLine === '') break;
            editedBody += (editedBody ? '\n' : '') + line;
            lastLine = line;
          }
          if (editedBody.trim()) {
            draft.edited = editedBody.trim();
            console.log('\nUpdated body:');
            console.log(draft.edited);
          }
          break;

        case 'r':
        case 'rewrite subject':
          const newSubject = await prompt('New subject line: ');
          if (newSubject.trim()) {
            draft.subject = newSubject.trim();
            console.log(`Subject updated: ${draft.subject}`);
          }
          break;

        case 'q':
        case 'quit':
          console.log('\n⚠️  Exiting approval flow. Remaining emails not reviewed.');
          rl.close();
          return reviewed;

        default:
          console.log('Please enter a, s, e, r, or q');
      }
    }
  }

  printDivider();
  const approvedCount = reviewed.filter(d => d.approved).length;
  console.log(`\n📊 Review complete: ${approvedCount}/${drafts.length} emails approved`);
  
  if (approvedCount > 0) {
    const confirm = await prompt(`\nSend ${approvedCount} email(s) now? [y/n]: `);
    if (confirm.trim().toLowerCase() !== 'y') {
      console.log('Send cancelled. Drafts saved for later.');
      reviewed.forEach(d => { if (d.approved) d.approved = false; });
    }
  }

  rl.close();
  return reviewed;
}
