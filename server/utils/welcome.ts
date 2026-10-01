import { notify } from './notify.js';
import { dispatchShopMail, welcomeEmail } from './shopMail.js';

/**
 * A new member's welcome: an e-mail, and two notifications - a tour of the
 * shop, and their profile set-up. The tour is sent last so it sits on top.
 */
export const welcomeNewMember = async (user: { email: string; username: string }): Promise<void> => {
  dispatchShopMail(user.email, welcomeEmail(user.username));
  await notify([user.email], {
    type: 'welcome',
    title: 'Finish setting up your profile',
    body: 'Add your phone and address so orders reach you - it takes a minute.',
    link: '/profile#setup',
  });
  await notify([user.email], {
    type: 'welcome',
    title: `Welcome to BookStoreBD, ${user.username}!`,
    body: 'See how buying and selling work, in a few taps.',
    link: '/how-it-works',
  });
};
