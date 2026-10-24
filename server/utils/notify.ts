import type { NotificationItem, NotificationType } from '@shared/api.js';

import Notification from '../models/Notification.model.js';
import User from '../models/user.model.js';
import { createLogger } from '../config/logger.js';
import { deliverToUser } from '../sockets/chatSocket.js';
import { push } from './push.js';
import { categoryOf, recipientsWanting } from './notificationPrefs.js';
import { asLanguage, type Bilingual, type Language } from './language.js';

const log = createLogger('notify');

export interface NotificationInput {
  type: NotificationType;
  /** In both languages, so each person reads it in their own; plain text as written. */
  title: string | Bilingual;
  body?: string | Bilingual;
  link?: string;
}

const english = (text: string | Bilingual | undefined): string => (typeof text === 'string' ? text : (text?.en ?? ''));
const bangla = (text: string | Bilingual | undefined): string => (typeof text === 'string' ? '' : (text?.bn ?? ''));

/**
 * Tells these people about something: stored for the bell, pushed live to any
 * page they have open, and to the phones they are signed in on (as an id only;
 * see utils/push.ts).
 *
 * Never throws. A notification is a courtesy on top of something that has
 * already happened - an order placed, a status changed - and failing to send
 * one must not turn that into an error for the person who did it. The actor is
 * left out: nobody needs telling what they just did themselves.
 */
export const notify = async (
  recipients: readonly (string | null | undefined)[],
  input: NotificationInput,
  { except }: { except?: string | null } = {}
): Promise<void> => {
  const named = [...new Set(recipients.filter((email): email is string => Boolean(email)))].filter(
    (email) => email !== except
  );
  if (!named.length) return;

  try {
    // Less whoever has turned this kind of notification off.
    const people = await recipientsWanting(named, categoryOf(input.type), 'inApp');
    if (!people.length) return;
    const saved = await Notification.insertMany(
      people.map((recipient) => ({
        recipient,
        type: input.type,
        title: english(input.title),
        body: english(input.body),
        titleBn: bangla(input.title),
        bodyBn: bangla(input.body),
        link: input.link ?? '',
      }))
    );
    // Live, to an open page: in the language the account last used.
    const languages = new Map(
      (await User.find({ email: { $in: people } }, { email: 1, language: 1 }).lean()).map((user) => [
        user.email,
        asLanguage(user.language),
      ])
    );
    for (const doc of saved) {
      deliverToUser(doc.recipient, 'notification', toWire(doc, languages.get(doc.recipient)));
    }
    push(saved.map((doc) => ({ email: doc.recipient, data: { kind: 'notification', id: String(doc._id) } })));
  } catch (error) {
    log.warn({ err: error, type: input.type }, 'Could not send a notification');
  }
};

/** Every administrator's address, for what needs one of them to act. */
export const adminEmails = async (): Promise<string[]> =>
  (await User.find({ role: 'admin' }, { email: 1 }).lean()).map((user) => user.email);

/**
 * A stored notification as the API sends it, in the language asked for when
 * it was written in both.
 */
export const toWire = (
  doc: {
    _id: unknown;
    type: string;
    title: string;
    body?: string | null;
    titleBn?: string | null;
    bodyBn?: string | null;
    link?: string | null;
    read?: boolean | null;
    createdAt?: Date | null;
  },
  language: Language = 'en'
): NotificationItem => ({
  _id: String(doc._id),
  type: doc.type as NotificationType,
  title: (language === 'bn' && doc.titleBn) || doc.title,
  body: (language === 'bn' && doc.titleBn ? doc.bodyBn : doc.body) ?? '',
  link: doc.link ?? '',
  read: Boolean(doc.read),
  createdAt: (doc.createdAt ?? new Date()).toISOString(),
});
