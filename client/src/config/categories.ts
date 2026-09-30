/**
 * The categories a book can be listed under, in groups.
 *
 * One list for the whole site: the listing form, the filter panel and the
 * homepage menu all read it. They were three copies of fourteen broad
 * buckets - "Science & Technology", "History & Politics" - each of which held
 * several different kinds of book, so choosing one narrowed very little. These
 * are single subjects, grouped so that a long list stays easy to scan. A book
 * can be in several.
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
