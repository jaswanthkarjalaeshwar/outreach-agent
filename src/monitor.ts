import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import type { DetectedApplication } from './types';

const client = new Anthropic();

function getToken() {
  const credsPath = path.join(process.env.USERPROFILE || '', '.gmail-mcp', 'credentials.json');
  return JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
}

function getOAuthKeys() {
  const keysPath = path.join(process.env.USERPROFILE || '', '.gmail-mcp', 'gcp-oauth.keys.json');
  return JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
}

export async function checkInboxForApplications(daysBack: number = 60): Promise<DetectedApplication[]> {
  console.log(`📬 Checking Gmail (last ${daysBack} days)...`);

  const token = getToken();
  const keys = getOAuthKeys();
  const { client_id, client_secret, redirect_uris } = keys.installed || keys.web;

  const { google } = require('googleapis');
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  auth.setCredentials(token);
  const gmail = google.gmail({ version: 'v1', auth });

  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - daysBack);
  const after = Math.floor(afterDate.getTime() / 1000);

  const query = `after:${after} (subject:"application received" OR subject:"thanks for applying" OR subject:"thank you for applying" OR subject:"application confirmation" OR subject:"successfully applied" OR subject:"application submitted" OR subject:"your application" OR subject:"thank you for applying to")`;

  let allMessages: any[] = [];
  let pageToken: string | undefined;

  do {
    const res: any = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 50, pageToken });
    allMessages = allMessages.concat(res.data.messages || []);
    pageToken = res.data.nextPageToken;
    if (pageToken) console.log(`  📄 Loaded ${allMessages.length} so far...`);
  } while (pageToken);

  console.log(`  ✅ Found ${allMessages.length} matching emails`);
  if (allMessages.length === 0) return [];

  const details: any[] = [];
  for (let i = 0; i < Math.min(allMessages.length, 5 ); i++) {
    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id: allMessages[i].id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] });
      details.push(msg.data);
    } catch (e) {}
  }

  const summaries = details.map(msg => {
    const h = msg.payload?.headers || [];
    const get = (n: string) => h.find((x: any) => x.name === n)?.value || '';
    return `Subject: ${get('Subject')}\nFrom: ${get('From')}\nDate: ${get('Date')}`;
  }).join('\n---\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4000,
    system: `Extract job application confirmations. Return ONLY valid JSON, no markdown.
Format: { "applications": [{ "company": "", "role": "", "emailSubject": "", "emailFrom": "", "appliedAt": "" }] }
Rules: skip duplicates (keep newest per company), skip LinkedIn alerts and newsletters, only direct confirmations.
If none: { "applications": [] }`,
    messages: [{ role: 'user', content: `Extract applications from:\n\n${summaries}` }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  const apps = parsed.applications.map((a: any, i: number) => ({ id: `app_${Date.now()}_${i}`, ...a }));
  console.log(`  📋 Detected ${apps.length} applications`);
  return apps;
}

export function deduplicateApplications(applications: DetectedApplication[], logPath: string): DetectedApplication[] {
  if (!fs.existsSync(logPath)) return applications;
  const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  const recent = new Set(log.batches.filter((b: any) => Date.now() - new Date(b.createdAt).getTime() < 30*24*60*60*1000).map((b: any) => b.application.company.toLowerCase()));
  return applications.filter(a => !recent.has(a.company.toLowerCase()));
}