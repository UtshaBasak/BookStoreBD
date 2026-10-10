/**
 * The shop's fixed lists, for clients that do not carry them in their own code:
 * the Android app reads them from GET /api/v1/app/config, so a new category or
 * district reaches it without a new release.
 *
 * The website keeps its own copies (client/src/config/categories.ts and
 * locations.ts), for a page that renders without waiting for the API.
 * tests/referenceData.test.ts fails if the two ever differ.
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

/** Where the shop delivers: each division and its districts, in checkout's order. */
export const DELIVERY_DIVISIONS: Readonly<Record<string, readonly string[]>> = {
  Dhaka: ['Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj', 'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail'],
  Chattogram: ['Chattogram', "Cox's Bazar", 'Cumilla', 'Brahmanbaria', 'Chandpur', 'Feni', 'Lakshmipur', 'Noakhali', 'Khagrachari', 'Rangamati', 'Bandarban'],
  Khulna: ['Khulna', 'Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira'],
  Rajshahi: ['Rajshahi', 'Bogra', 'Joypurhat', 'Naogaon', 'Natore', 'Chapai Nawabganj', 'Pabna', 'Sirajganj'],
  Barisal: ['Barisal', 'Barguna', 'Bhola', 'Jhalokathi', 'Patuakhali', 'Pirojpur'],
  Sylhet: ['Sylhet', 'Habiganj', 'Moulvibazar', 'Sunamganj'],
  Rangpur: ['Rangpur', 'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Thakurgaon'],
  Mymensingh: ['Mymensingh', 'Jamalpur', 'Netrokona', 'Sherpur'],
};

/** Working days from order to door, as the checkout page quotes them. */
export const DELIVERY_DAYS = { insideDhaka: 3, outsideDhaka: 5 } as const;
