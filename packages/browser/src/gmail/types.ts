export interface EmailHeader {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  refId?: string;
}

export interface EmailDetail extends EmailHeader {
  body: string;
  recipients?: string[];
}

export interface EmailSummary {
  id: string;
  sender: string;
  subject: string;
  purpose: string;
  keyInfo: string;
  actionRequired: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  deadline?: string;
}

export interface ExecutiveSummary {
  totalEmails: number;
  urgentCount: number;
  pendingDeadlines: string[];
  recommendations: string[];
  emailSummaries: EmailSummary[];
  formattedReport: string;
}

export interface DraftEmail {
  to: string;
  subject: string;
  body: string;
}

export interface SendResult {
  sent: boolean;
  approved: boolean;
  verified: boolean;
  timestamp: number;
  recipient: string;
  subject: string;
  error?: string;
}
