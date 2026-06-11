import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import type { Contact, DraftedEmail, DetectedApplication } from './types';

const client = new Anthropic();

const profile = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/profile.json'), 'utf-8')
);

const ARCHETYPE_PROMPTS: Record<string, string> = {
  recruiter: `Write a cold outreach email to a RECRUITER at the target company. 
Hook: You just applied for the role and want to put a face behind the application.
Tone: Professional, direct, respectful of their time.
Structure: 1) mention you applied, 2) one specific credential, 3) soft ask to be considered / connect.
Max 80 words.`,

  hiring_manager: `Write a cold outreach email to the HIRING MANAGER for the role.
Hook: Lead with your most relevant work to their specific team's challenges.
Tone: Peer-to-peer, confident, specific.
Structure: 1) hook tied to their work/team, 2) relevant proof point from your experience, 3) specific ask.
Max 100 words.`,

  peer_pm: `Write a cold outreach email to a PEER PM (same level) at the company.
Hook: Connect on shared work — something you noticed about their product or role.
Tone: Casual, collegial, curious.
Structure: 1) specific observation about their work, 2) brief context on why you applied, 3) low-pressure ask to connect.
Max 90 words.`,

  engineering_manager: `Write a cold outreach email to an ENGINEERING MANAGER (cross-functional peer).
Hook: Lead with your ability to work with engineering and build technical products.
Tone: Technical but approachable, shows you understand the eng-PM dynamic.
Structure: 1) tech credibility hook, 2) applied role mention, 3) ask to connect.
Max 90 words.`,

  executive: `Write a cold outreach email to a SENIOR EXECUTIVE (VP or above).
Hook: One sharp line about why you care about the company's specific trajectory.
Tone: Extremely brief, confident, no fluff.
Structure: 1) sharp company-specific insight, 2) one proof point, 3) one-line ask.
Max 70 words. This person gets 50 cold emails a day — be the shortest one.`,

  generic: `Write a professional cold outreach email.
Tone: Warm, specific, brief.
Max 90 words.`
};

export async function draftEmail(
  contact: Contact,
  application: DetectedApplication
): Promise<DraftedEmail> {
  console.log(`  ✍️  Drafting email for ${contact.name} (${contact.archetype})...`);

  const archetypePrompt = ARCHETYPE_PROMPTS[contact.archetype] || ARCHETYPE_PROMPTS.generic;
  
  // Pick the most relevant moat point for this role
  const relevantMoat = profile.moat[0]; // TalentLens first for AI PM roles

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    system: `You are writing cold outreach emails on behalf of ${profile.preferred_name}, a PM.
    
RULES:
- No semicolons, no dashes
- Human and conversational, NOT AI-sounding
- Reference something specific about the contact's role or recent activity when available
- Do not use hollow phrases like "I hope this message finds you well"
- No bullet points in the email
- Sign off as "${profile.preferred_name}"
- Return ONLY the email body — no subject line, no meta commentary

${archetypePrompt}`,
    messages: [
      {
        role: 'user',
        content: `Write the email.

RECIPIENT:
Name: ${contact.name}
Title: ${contact.title}
Company: ${contact.company}
Recent Activity: ${contact.recentActivity || 'none found'}

APPLIED ROLE: ${application.role} at ${application.company}

SENDER BACKGROUND:
${profile.preferred_name}, ${profile.years_experience}+ years PM experience
Key proof point: ${relevantMoat.description}
One-liner hook: "${relevantMoat.hook}"

Write the email body now.`
      }
    ]
  });

  const body = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

  // Generate subject line separately
  const subjectRes = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    system: 'Generate a short email subject line. Return only the subject line, nothing else. No quotes. Max 8 words.',
    messages: [
      {
        role: 'user',
        content: `Subject line for a cold email from a PM named ${profile.preferred_name} to ${contact.name} (${contact.title}) at ${contact.company}, regarding a "${application.role}" application.`
      }
    ]
  });

  const subject = subjectRes.content[0].type === 'text' 
    ? subjectRes.content[0].text.trim() 
    : `${application.role} application at ${application.company}`;

  return {
    contact,
    subject,
    body,
    approved: false
  };
}

export async function draftAllEmails(
  contacts: Contact[],
  application: DetectedApplication
): Promise<DraftedEmail[]> {
  const drafts: DraftedEmail[] = [];
  
  for (const contact of contacts) {
    const draft = await draftEmail(contact, application);
    drafts.push(draft);
  }
  
  return drafts;
}
