import { currentLanguage } from '../utils/language.js';

/**
 * The categories a book can be listed under, in groups.
 *
 * One list for the whole site: the listing form, the filter panel and the
 * homepage menu all read it. Each category is a single subject, so choosing
 * one narrows the catalogue meaningfully, and the groups keep a long list easy
 * to scan. A book can be in several.
 *
 * The server matches categories case-insensitively and does not hold a list
 * of its own, so one can be added here without touching the API.
 */
export interface CategoryGroup {
  name: string;
  emoji: string;
  items: readonly string[];
}

export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  {
    name: 'Academic',
    emoji: '🎓',
    items: [
      'Textbooks',
      'School (Class 1–10)',
      'SSC',
      'HSC',
      'Admission Test',
      'BCS & Job Exams',
      'Engineering',
      'Medical',
      'Nursing',
      'Law',
      'Programming',
      'Computer Science',
      'Mathematics',
      'Physics',
      'Chemistry',
      'Biology',
      'Accounting',
      'Economics',
      'Business Studies',
      'English Language',
      'IELTS',
      'Dictionaries',
      'Reference',
    ],
  },
  {
    name: 'Fiction',
    emoji: '📖',
    items: [
      'Novels',
      'Bangla Literature',
      'World Literature',
      'Short Stories',
      'Poetry',
      'Drama',
      'Classics',
      'Mystery',
      'Thriller',
      'Detective',
      'Science Fiction',
      'Fantasy',
      'Horror',
      'Romance',
      'Historical Fiction',
      'Adventure',
      'Humour',
      'Translated',
    ],
  },
  {
    name: 'Non-fiction',
    emoji: '🧠',
    items: [
      'History',
      'Liberation War',
      'Politics',
      'Current Affairs',
      'Biography',
      'Memoir',
      'Philosophy',
      'Psychology',
      'Self-Help',
      'Productivity',
      'Career',
      'Finance',
      'Investing',
      'Entrepreneurship',
      'Marketing',
      'Popular Science',
      'Religion',
      'Islamic',
      'Spirituality',
      'Travel',
      'Essays',
      'Journalism',
      'Nature',
      'Environment',
    ],
  },
  {
    name: 'Kids & teens',
    emoji: '🧸',
    items: ["Children's", 'Picture Books', 'Rhymes', 'Early Learning', 'Teen', 'Young Adult', 'Comics', 'Graphic Novels', 'Manga'],
  },
  {
    name: 'Lifestyle & hobbies',
    emoji: '🎨',
    items: [
      'Health',
      'Fitness',
      'Nutrition',
      'Cooking',
      'Parenting',
      'Relationships',
      'Art',
      'Design',
      'Photography',
      'Music',
      'Film',
      'Sports',
      'Gardening',
      'Agriculture',
      'Crafts',
      'Fashion',
      'Magazines',
    ],
  },
  { name: 'Other', emoji: '📦', items: ['Others'] },
];

/** Every category, in the order the groups list them. */
export const CATEGORIES: readonly string[] = CATEGORY_GROUPS.flatMap((group) => group.items);

/** The group a category belongs to, for its emoji on a tile. */
export const groupOf = (category: string): CategoryGroup | undefined =>
  CATEGORY_GROUPS.find((group) => group.items.some((item) => item.toLowerCase() === category.toLowerCase()));

/** The address of a category in the catalogue. */
export const categoryLink = (category: string): string => `/filter?category=${encodeURIComponent(category)}`;

/** Each category and group name in Bangla. The English is what is stored and sent. */
const BANGLA: Readonly<Record<string, string>> = {
  academic: 'একাডেমিক',
  textbooks: 'পাঠ্যবই',
  'school (class 1–10)': 'স্কুল (১ম–১০ম শ্রেণি)',
  ssc: 'এসএসসি',
  hsc: 'এইচএসসি',
  'admission test': 'ভর্তি পরীক্ষা',
  'bcs & job exams': 'বিসিএস ও চাকরির পরীক্ষা',
  engineering: 'প্রকৌশল',
  medical: 'মেডিকেল',
  nursing: 'নার্সিং',
  law: 'আইন',
  programming: 'প্রোগ্রামিং',
  'computer science': 'কম্পিউটার বিজ্ঞান',
  mathematics: 'গণিত',
  physics: 'পদার্থবিজ্ঞান',
  chemistry: 'রসায়ন',
  biology: 'জীববিজ্ঞান',
  accounting: 'হিসাববিজ্ঞান',
  economics: 'অর্থনীতি',
  'business studies': 'ব্যবসায় শিক্ষা',
  'english language': 'ইংরেজি ভাষা',
  ielts: 'আইইএলটিএস',
  dictionaries: 'অভিধান',
  reference: 'রেফারেন্স',
  fiction: 'কথাসাহিত্য',
  novels: 'উপন্যাস',
  'bangla literature': 'বাংলা সাহিত্য',
  'world literature': 'বিশ্বসাহিত্য',
  'short stories': 'ছোটগল্প',
  poetry: 'কবিতা',
  drama: 'নাটক',
  classics: 'ক্লাসিক',
  mystery: 'রহস্য',
  thriller: 'থ্রিলার',
  detective: 'গোয়েন্দা',
  'science fiction': 'বিজ্ঞান কল্পকাহিনি',
  fantasy: 'ফ্যান্টাসি',
  horror: 'ভৌতিক',
  romance: 'রোমান্টিক',
  'historical fiction': 'ঐতিহাসিক উপন্যাস',
  adventure: 'অ্যাডভেঞ্চার',
  humour: 'রম্য',
  translated: 'অনুবাদ',
  'non-fiction': 'নন-ফিকশন',
  history: 'ইতিহাস',
  'liberation war': 'মুক্তিযুদ্ধ',
  politics: 'রাজনীতি',
  'current affairs': 'সাম্প্রতিক বিষয়',
  biography: 'জীবনী',
  memoir: 'স্মৃতিকথা',
  philosophy: 'দর্শন',
  psychology: 'মনোবিজ্ঞান',
  'self-help': 'আত্মোন্নয়ন',
  productivity: 'প্রোডাক্টিভিটি',
  career: 'ক্যারিয়ার',
  finance: 'অর্থব্যবস্থাপনা',
  investing: 'বিনিয়োগ',
  entrepreneurship: 'উদ্যোক্তা',
  marketing: 'মার্কেটিং',
  'popular science': 'জনপ্রিয় বিজ্ঞান',
  religion: 'ধর্ম',
  islamic: 'ইসলামি',
  spirituality: 'আধ্যাত্মিকতা',
  travel: 'ভ্রমণ',
  essays: 'প্রবন্ধ',
  journalism: 'সাংবাদিকতা',
  nature: 'প্রকৃতি',
  environment: 'পরিবেশ',
  'kids & teens': 'শিশু ও কিশোর',
  "children's": 'শিশুতোষ',
  'picture books': 'ছবির বই',
  rhymes: 'ছড়া',
  'early learning': 'প্রাক-প্রাথমিক',
  teen: 'কিশোর',
  'young adult': 'তরুণদের জন্য',
  comics: 'কমিকস',
  'graphic novels': 'গ্রাফিক নভেল',
  manga: 'মাঙ্গা',
  'lifestyle & hobbies': 'জীবনধারা ও শখ',
  health: 'স্বাস্থ্য',
  fitness: 'ফিটনেস',
  nutrition: 'পুষ্টি',
  cooking: 'রান্না',
  parenting: 'সন্তান লালনপালন',
  relationships: 'সম্পর্ক',
  art: 'শিল্পকলা',
  design: 'ডিজাইন',
  photography: 'ফটোগ্রাফি',
  music: 'সংগীত',
  film: 'চলচ্চিত্র',
  sports: 'খেলাধুলা',
  gardening: 'বাগান',
  agriculture: 'কৃষি',
  crafts: 'হস্তশিল্প',
  fashion: 'ফ্যাশন',
  magazines: 'ম্যাগাজিন',
  other: 'অন্যান্য',
  others: 'অন্যান্য',
};

/**
 * A category (or group) as it is shown: the Bangla name in Bangla, the value
 * itself in English. One the list does not know, such as an older listing's,
 * is shown as it was saved.
 */
export const categoryLabel = (category: string): string =>
  currentLanguage() === 'bn' ? BANGLA[category.trim().toLowerCase()] ?? category : category;
