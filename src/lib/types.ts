export type Folder = 'inbox' | 'archive' | 'quarantine';

export interface Mailbox {
  id: string;
  address: string;
  name: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface MessageSummary {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  received_at: string;
  read_at: string | null;
  folder: Folder;
  attachment_count: number;
}

export interface Message extends MessageSummary {
  text_body: string;
  recipients: string[];
  message_id: string | null;
  spam_score: number | null;
  attachments: Attachment[];
}

export interface MessagePage {
  messages: MessageSummary[];
  next_cursor: string | null;
}

export interface InboxStats {
  inbox: number;
  unread: number;
  archive: number;
  quarantine: number;
}
