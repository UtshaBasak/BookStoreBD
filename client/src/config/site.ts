/**
 * The business details that appear in the footer, the policy pages and the
 * contact page.
 *
 * One place on purpose: these used to be typed out in the homepage footer and
 * nowhere else, which is how they drifted into being placeholders nobody
 * noticed. Change them here and every page follows.
 *
 * TODO(owner): confirm these before launch. The address, phone number and
 * e-mail were carried over from the original footer and have not been
 * verified, and the policy pages need a real legal entity name.
 */
export const site = {
  name: 'BookStoreBD',
  tagline: 'New and second-hand books, bought and sold across Bangladesh.',

  /**
   * The tagline as a search result shows it. Google truncates a title at about
   * 60 characters, and the full one with the shop's name in front is longer.
   */
  seoTagline: 'New and second-hand books across Bangladesh',

  /** Shown on the contact page and in the policies as the way to reach a human. */
  email: 'bookstore@gmail.com',
  phone: '+880 1711 112333',
  address: {
    line1: 'Kha 224 Pragati Sarani, Merul Badda',
    city: 'Dhaka 1212',
    country: 'Bangladesh',
  },

  /** How long a reply should take, quoted on the contact page. */
  responseTime: 'two working days',

  /** The date the policy pages were last reviewed. */
  policiesUpdated: '21 September 2026',
} as const;

export default site;
