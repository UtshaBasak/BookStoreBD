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
    title: { en: 'Finish setting up your profile', bn: 'আপনার প্রোফাইল সাজানো শেষ করুন' },
    body: {
      en: 'Add your phone and address so orders reach you - it takes a minute.',
      bn: 'অর্ডার যেন আপনার কাছে পৌঁছায়, তাই ফোন নম্বর ও ঠিকানা দিন - এক মিনিটও লাগবে না।',
    },
    link: '/profile#setup',
  });
  await notify([user.email], {
    type: 'welcome',
    title: { en: `Welcome to BookStoreBD, ${user.username}!`, bn: `BookStoreBD-তে স্বাগতম, ${user.username}!` },
    body: { en: 'See how buying and selling work, in a few taps.', bn: 'কয়েকটি ট্যাপেই দেখে নিন কেনাবেচা কীভাবে হয়।' },
    link: '/how-it-works',
  });
};
