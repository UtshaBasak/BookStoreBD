import Invite from '../models/Invite.model.js';
import { notify } from './notify.js';

/**
 * Someone who was invited has joined: each member who invited them hears
 * about it, once.
 */
export const creditInvites = async (user: { email: string; username: string }): Promise<void> => {
  const invites = await Invite.find({ inviteeEmail: user.email.toLowerCase(), joinedAt: null }, { inviterEmail: 1 }).lean();
  if (!invites.length) return;
  await Invite.updateMany({ _id: { $in: invites.map((invite) => invite._id) } }, { joinedAt: new Date() });
  await notify(
    invites.map((invite) => invite.inviterEmail),
    {
      type: 'invite-joined',
      title: { en: `${user.username} joined BookStoreBD`, bn: `${user.username} BookStoreBD-তে যোগ দিয়েছেন` },
      body: {
        en: 'Someone you invited has just made an account. Thank you for spreading the word!',
        bn: 'আপনার আমন্ত্রিত একজন এইমাত্র অ্যাকাউন্ট খুলেছেন। খবরটি ছড়িয়ে দেওয়ার জন্য ধন্যবাদ!',
      },
      link: '/profile#invite',
    }
  );
};
