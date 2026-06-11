export type ContactArchetype = 
  | 'recruiter'
  | 'hiring_manager'
  | 'peer_pm'
  | 'engineering_manager'
  | 'executive'
  | 'generic';

export interface DetectedApplication {
  id: string;
  company: string;
  role: string;
  jobUrl?: string;
  appliedAt: string;
  emailSubject: string;
  emailFrom: string;
}

export interface Contact {
  name: string;
  title: string;
  company: string;
  archetype: ContactArchetype;
  email: string;
  emailVerified: boolean;
  linkedinUrl?: string;
  recentActivity?: string;
  score: number;
  scoreBreakdown: {
    roleRelevance: number;
    seniorityMatch: number;
    activitySignal: number;
    connectionDistance: number;
  };
}

export interface DraftedEmail {
  contact: Contact;
  subject: string;
  body: string;
  approved: boolean;
  edited?: string;
}

export interface OutreachBatch {
  id: string;
  application: DetectedApplication;
  contacts: Contact[];
  drafts: DraftedEmail[];
  status: 'pending_approval' | 'approved' | 'sent' | 'partial_sent';
  createdAt: string;
  sentAt?: string;
}

export interface OutreachLog {
  batches: OutreachBatch[];
  sentEmails: SentEmail[];
  replyTracking: ReplyRecord[];
}

export interface SentEmail {
  batchId: string;
  company: string;
  contactEmail: string;
  contactName: string;
  sentAt: string;
  gmailMessageId: string;
  gmailLabelId: string;
}

export interface ReplyRecord {
  sentEmailId: string;
  repliedAt: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'no_reply';
  archetype: ContactArchetype;
  emailWordCount: number;
}
