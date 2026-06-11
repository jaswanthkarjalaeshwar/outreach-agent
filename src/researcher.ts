import Anthropic from '@anthropic-ai/sdk';
import type { DetectedApplication, Contact, ContactArchetype } from './types';

const client = new Anthropic();

const SCORING_PROMPT = `You are a job search research assistant. Given a company name and role, find 5 real people to cold email for a job application.

CONTACT ARCHETYPES TO TARGET (in priority order):
1. recruiter / talent acquisition — most likely to act on this
2. hiring_manager — direct manager for the role
3. peer_pm — PM at the same level as the applied role
4. engineering_manager — cross-functional partner
5. executive — VP or above (short email, low expectations)

SCORING (0-100 total):
- Role relevance to the applied position: 40pts
- Seniority match (not too senior, not too junior): 20pts
- Recent activity signal (LinkedIn post, article, etc.): 20pts
- Connection distance estimate: 20pts

EMAIL PATTERN RULES:
- Use company domain email patterns (firstname@company.com, f.lastname@company.com, etc.)
- Search for the pattern from any public source
- If unverifiable, set emailVerified: false
- NEVER use personal email domains (gmail, yahoo, etc.)

Return ONLY valid JSON. No markdown, no explanation.
Format:
{
  "contacts": [
    {
      "name": "Full Name",
      "title": "Exact Title",
      "company": "Company Name",
      "archetype": "recruiter|hiring_manager|peer_pm|engineering_manager|executive",
      "email": "email@company.com",
      "emailVerified": false,
      "linkedinUrl": "https://linkedin.com/in/...",
      "recentActivity": "Brief note on recent post or activity if found",
      "score": 85,
      "scoreBreakdown": {
        "roleRelevance": 35,
        "seniorityMatch": 18,
        "activitySignal": 15,
        "connectionDistance": 17
      }
    }
  ]
}`;

export async function findContacts(
  application: DetectedApplication
): Promise<Contact[]> {
  console.log(`\n🔍 Researching contacts at ${application.company} for "${application.role}"...`);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 3000,
    system: SCORING_PROMPT,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search'
      }
    ],
    messages: [
      {
        role: 'user',
        content: `Find 5 people to cold email at ${application.company} for a "${application.role}" application.
        
Search for:
1. "${application.company} recruiter talent acquisition LinkedIn"
2. "${application.company} product manager ${application.role} LinkedIn"
3. "${application.company} hiring manager product LinkedIn"
4. "${application.company} email format site:hunter.io OR site:rocketreach.co"

Shortlist and score 5 people. Return JSON only.`
      }
    ]
  });

  // Extract final text response (after tool use)
  const finalText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.type === 'text' ? block.text : '')
    .join('');

  try {
    const clean = finalText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    
    // Sort by score descending, take top 5
    return parsed.contacts
      .sort((a: Contact, b: Contact) => b.score - a.score)
      .slice(0, 5);
  } catch (e) {
    console.error('Failed to parse contacts:', e);
    console.error('Raw response:', finalText.slice(0, 500));
    return [];
  }
}

export function archetypeLabel(archetype: ContactArchetype): string {
  const labels: Record<ContactArchetype, string> = {
    recruiter: '🎯 Recruiter',
    hiring_manager: '👔 Hiring Manager',
    peer_pm: '🤝 Peer PM',
    engineering_manager: '⚙️ Eng Manager',
    executive: '🏢 Executive',
    generic: '📧 Contact'
  };
  return labels[archetype];
}
