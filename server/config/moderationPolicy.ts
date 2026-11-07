/**
 * Policy data for automatic moderation.
 *
 * The owner reviews and edits these lists. Nothing here removes anything:
 * a match only raises a flag, and an admin always decides.
 * Matching is whole-word or whole-phrase after normalising (lowercase,
 * Bangla digits to ASCII), so keep every entry lowercase.
 * The site is child-friendly, so the abusive list is deliberately broad,
 * but ordinary words and words common in book titles stay out of it.
 */

export type AbuseKind = 'profanity' | 'slur' | 'personal-attack' | 'threat' | 'sexual';

export interface AbusiveTerm {
  /** Lowercase. Bangla script, English, or Banglish (romanised Bangla). Matched as a whole word or phrase after normalising. */
  term: string;
  kind: AbuseKind;
  /** 'severe' flags on its own; 'mild' adds weight and only flags with other signals or repeats. */
  severity: 'mild' | 'severe';
  script: 'en' | 'bn' | 'banglish';
}

type Script = AbusiveTerm['script'];
type Severity = AbusiveTerm['severity'];

/** Expands a group of terms that share a kind, severity and script. */
const group = (
  script: Script,
  kind: AbuseKind,
  severity: Severity,
  terms: string[],
): AbusiveTerm[] => terms.map((term) => ({ term, kind, severity, script }));

export const ABUSIVE_TERMS: readonly AbusiveTerm[] = [
  // English profanity
  ...group('en', 'profanity', 'severe', [
    'fuck', 'fucking', 'fucker', 'motherfucker', 'fuck off', 'fuck you', 'shit', 'bullshit',
    'asshole', 'bastard', 'bitch', 'son of a bitch', 'dickhead', 'cunt', 'wanker', 'bollocks',
    'piss off', 'jackass', 'dumbass', 'shithead',
  ]),
  ...group('en', 'profanity', 'mild', ['damn', 'hell', 'bloody', 'crap', 'piss', 'suck', 'sucks', 'screw you']),

  // English personal attacks
  ...group('en', 'personal-attack', 'mild', [
    'idiot', 'stupid', 'stupid seller', 'moron', 'imbecile', 'dumb', 'fool', 'loser', 'scumbag',
    'trash', 'garbage seller', 'pathetic', 'useless', 'liar', 'cheat', 'cheater', 'fraud',
    'fraudster', 'scam', 'scammer', 'thief', 'crook', 'conman', 'swindler', 'shameless',
    'worthless', 'brainless', 'clown', 'creep', 'dirty seller',
  ]),

  // English threats
  ...group('en', 'threat', 'severe', [
    'will kill', 'i will kill you', 'kill you', 'i will find you', 'i will hurt you', 'you will die',
    'you are dead', 'will beat you', 'break your legs', 'burn your shop', 'shoot you', 'stab you',
    'i know where you live', 'will destroy you', 'acid attack',
  ]),

  // English sexual
  ...group('en', 'sexual', 'severe', [
    'porn', 'porno', 'pornography', 'blowjob', 'handjob', 'dick', 'cock', 'pussy', 'boobs', 'nudes', 'sex chat', 'sex video', 'horny', 'slut', 'whore', 'hooker',
    'prostitute', 'escort service', 'call girl', 'rape', 'rapist', 'masturbate',
  ]),

  // English slurs
  ...group('en', 'slur', 'severe', [
    'faggot', 'fag', 'dyke', 'tranny', 'retard', 'retarded', 'nigger', 'nigga', 'paki', 'coolie',
    'chink', 'kike', 'terrorist muslim', 'dirty hindu', 'dirty muslim', 'kafir', 'mlechha',
    'chamar', 'bhangi',
  ]),

  // Bangla script profanity
  ...group('bn', 'profanity', 'severe', [
    'চোদ', 'চুদি', 'চুদা', 'চুদির ভাই', 'চোদনা', 'চোদন', 'চোদা', 'মাদারচোদ', 'বাপচোদা', 'বোনচোদ',
    'খানকি', 'খানকির পোলা', 'খানকির ছেলে', 'মাগি', 'মাগী', 'বেশ্যা', 'বেশ্যার ছেলে', 'হারামি',
    'হারামজাদা', 'হারামজাদি', 'শুয়োরের বাচ্চা', 'শুয়োর', 'কুত্তার বাচ্চা', 'কুত্তা', 'কুকুরের বাচ্চা',
    'গাঁড়মারা', 'গান্ডু', 'গাণ্ডু', 'বাল', 'বালের', 'তোর মায়ের', 'মা চুদা', 'মাথা মোটা', 'পুটকি',
    'পোঁদ', 'ধোন', 'ধন চোষ', 'লেওড়া', 'লুতফর', 'হিজড়া',
  ]),

  // Bangla script personal attacks and insults
  ...group('bn', 'personal-attack', 'mild', [
    'বাটপার', 'চোর', 'ঠগ', 'প্রতারক', 'প্রতারণা', 'ধান্দাবাজ', 'জোচ্চোর', 'ফাঁদবাজ', 'মিথ্যুক',
    'বেয়াদব', 'বেহায়া', 'বোকাচোদা', 'গাধা', 'বলদ', 'হাঁদারাম', 'উল্লুক', 'ছাগল', 'পাগল ছাগল',
    'নির্বোধ', 'কুলাঙ্গার', 'অপদার্থ', 'বদমাশ', 'বদমাইশ', 'শয়তান', 'পাজি', 'ফালতু বিক্রেতা', 'ভণ্ড',
    'লুচ্চা', 'লম্পট', 'বেজন্মা', 'জারজ', 'নরকের কীট', 'ফেরেব্বাজ',
  ]),

  // Bangla script threats
  ...group('bn', 'threat', 'severe', [
    'মেরে ফেলব', 'মেরে ফেলবো', 'খুন করে ফেলব', 'খুন করব', 'কেটে ফেলব', 'জানে মেরে দেব', 'দেখে নেব',
    'দেখে নিব', 'তোকে শেষ করে দেব', 'বাড়ি চিনি', 'এসিড মারব', 'পুড়িয়ে দেব', 'হাত পা ভেঙে দেব',
    'জবাই করব', 'গুলি করব',
  ]),

  // Bangla script sexual
  ...group('bn', 'sexual', 'severe', [
    'পর্ন', 'পর্নো', 'পর্নোগ্রাফি', 'ন্যাংটা', 'উলঙ্গ', 'সেক্স ভিডিও', 'সেক্স চ্যাট',
    'যৌনতা ভিডিও', 'ধর্ষণ', 'ধর্ষক', 'দেহব্যবসা', 'কলগার্ল', 'নষ্টা মেয়ে', 'চটি বই',
  ]),

  // Bangla script slurs
  ...group('bn', 'slur', 'severe', [
    'মালু', 'মালাউন', 'নেড়ে', 'নেড়ে মুসলমান', 'কাফের', 'জঙ্গি মুসলিম', 'শালা মালু', 'ম্লেচ্ছ',
    'ছোটলোক', 'নিচু জাত', 'চামার', 'ভাঙ্গি', 'পাহাড়ি বান্দর', 'চাকমা বান্দর', 'বিহারি ছাগল', 'হিজড়ার বাচ্চা',
    'মেয়েলি পুরুষ', 'সমকামী কুত্তা',
  ]),

  // Banglish profanity (several spellings each)
  ...group('banglish', 'profanity', 'severe', [
    'chuda', 'chudi', 'chudir bhai', 'chudirbhai', 'chudirvai', 'chodna', 'chodon', 'chod', 'chodis',
    'madarchod', 'madarchud', 'madarchoda', 'maderchod', 'bapchoda', 'bopchoda', 'bonchoda', 'bokachoda',
    'khanki', 'khankir pola', 'khankir chele', 'khankirpola', 'magi', 'maagi', 'magir pola', 'beshya',
    'harami', 'haramjada', 'haramzada', 'haramjadi', 'haramir bachcha', 'shuorer bachcha', 'suorer bacha',
    'shuor', 'kuttar bachcha', 'kuttar bacha', 'kutta', 'kuttar baccha', 'gandu', 'gaandu', 'gand marani',
    'ganmara', 'gar mara', 'bhoda', 'voda', 'putki', 'lawra',
    'lauda', 'loda', 'tor mayer', 'tor mar', 'tor baper', 'hijra', 'hijda',
  ]),

  // Banglish personal attacks
  ...group('banglish', 'personal-attack', 'mild', [
    'batpar', 'batpaar', 'bathpar', 'botpar', 'chor', 'chour', 'chur', 'thog', 'protarok', 'dhandabaz',
    'dhandaabaj', 'jocchor', 'jochchor', 'mithuk', 'mithyuk', 'beadob', 'beyadob', 'behaya', 'gadha',
    'boka', 'bokachoda seller', 'bolod', 'baldh', 'ullu', 'ulluk', 'nirbodh', 'kulangar',
    'bodmash', 'bodmaish', 'shoytan', 'shaitan', 'paji', 'faltu seller', 'bhondo', 'lucha', 'luccha',
    'lompot', 'bejonma', 'jarj', 'ferebbaz',
  ]),

  // Banglish threats
  ...group('banglish', 'threat', 'severe', [
    'mere felbo', 'mere phelbo', 'mere fela hobe', 'khun korbo', 'khun kore felbo', 'kete felbo',
    'jane mere debo', 'dekhe nebo', 'dekhe nibo', 'shesh kore debo', 'bari chini', 'acid marbo',
    'purie debo', 'hat pa vege debo', 'jobai korbo', 'guli korbo', 'tore dekhe nebo',
  ]),

  // Banglish sexual
  ...group('banglish', 'sexual', 'severe', [
    'porn video', 'sex video', 'sex chat', 'nongra', 'nyangta', 'ulongo', 'dhorshon', 'dhorshok',
    'deho bebsha', 'call girl', 'choti boi', 'nongra chobi', 'nude chobi',
  ]),

  // Banglish slurs
  ...group('banglish', 'slur', 'severe', [
    'malu', 'malaun', 'nere', 'nere musalman', 'kafer', 'mleccha', 'chhotolok', 'chotolok', 'nichu jat',
    'chamar', 'bhangi', 'pahari banor', 'chakma banor', 'bihari chagol', 'hijrar bachcha', 'meyeli purush',
    'somokami kutta',
  ]),
];

export interface BannedItemRule {
  id: string; // kebab-case
  label: { en: string; bn: string }; // shown to admins as the reason
  /** Lowercase phrases matched in a listing's title and description (whole word/phrase). English, Bangla and Banglish variants. */
  phrases: string[];
  /** 'severe' = almost certainly prohibited; 'review' = worth a look. */
  severity: 'severe' | 'review';
}

export const BANNED_ITEMS: readonly BannedItemRule[] = [
  {
    id: 'pirated-copies',
    label: { en: 'Pirated, photocopied or PDF copies', bn: 'পাইরেটেড, ফটোকপি বা পিডিএফ কপি' },
    phrases: [
      'photocopy', 'photocopied', 'photo copy', 'xerox copy', 'pirated', 'pirated copy',
      'nilkhet print', 'nilkhet copy', 'neelkhet print', 'scan copy', 'scanned copy', 'pdf copy', 'pdf book', 'soft copy', 'softcopy', 'e-book download link', 'ebook download link',
      'free pdf download', 'download link', 'duplicate print', 'fotocopy', 'fotokopi',
      'ফটোকপি', 'জেরক্স', 'জেরক্স কপি', 'পাইরেটেড', 'নীলক্ষেত প্রিন্ট', 'নীলক্ষেতের প্রিন্ট', 'স্ক্যান কপি',
      'পিডিএফ', 'পিডিএফ কপি', 'পিডিএফ ফাইল', 'সফট কপি', 'ডাউনলোড লিংক', 'ডুপ্লিকেট প্রিন্ট',
    ],
    severity: 'severe',
  },
  {
    id: 'exam-leaks',
    label: { en: 'Question-paper leaks', bn: 'প্রশ্নফাঁস' },
    phrases: [
      'question leak', 'questions leak', 'paper leak', 'leaked question', 'leaked questions',
      'suggestion leak', 'admission question out', 'question out', 'common pabo', 'proshno fash',
      'proshnofash', 'proshno fans', 'question fash', 'exam question sell', 'leak suggestion',
      'প্রশ্নফাঁস', 'প্রশ্ন ফাঁস', 'ফাঁস হওয়া প্রশ্ন', 'প্রশ্ন আউট', 'কমন পাবেন', 'লিক সাজেশন',
      'ভর্তি পরীক্ষার প্রশ্ন আউট', 'প্রশ্ন বিক্রি',
    ],
    severity: 'severe',
  },
  {
    id: 'fake-documents',
    label: { en: 'Fake certificates or documents', bn: 'জাল সনদ বা কাগজপত্র' },
    phrases: [
      'fake certificate', 'fake certificates', 'fake document', 'fake documents', 'fake degree',
      'fake passport', 'fake nid', 'fake id card', 'forged certificate', 'forged document',
      'fake marksheet', 'fake transcript', 'jal certificate', 'jal sonod', 'jal nid', 'jal passport',
      'certificate banano', 'certificate bikri',
      'জাল সনদ', 'জাল সার্টিফিকেট', 'নকল সার্টিফিকেট', 'নকল সনদ', 'জাল পাসপোর্ট', 'জাল এনআইডি',
      'জাল কাগজ', 'ভুয়া সনদ', 'ভুয়া সার্টিফিকেট', 'ভুয়া ডিগ্রি', 'সার্টিফিকেট বিক্রি',
    ],
    severity: 'severe',
  },
  {
    id: 'counterfeit-currency',
    label: { en: 'Counterfeit currency', bn: 'জাল টাকা' },
    phrases: [
      'fake note', 'fake notes', 'fake currency', 'counterfeit currency', 'counterfeit note',
      'counterfeit money', 'fake money', 'jal taka', 'jal note', 'nokol taka', 'duplicate note',
      'জাল টাকা', 'জাল নোট', 'নকল টাকা', 'নকল নোট', 'ভুয়া টাকা', 'জাল মুদ্রা',
    ],
    severity: 'severe',
  },
  {
    id: 'illegal-drugs',
    label: { en: 'Illegal drugs', bn: 'অবৈধ মাদক' },
    phrases: [
      'yaba', 'yaa baa', 'ya ba', 'ganja', 'ganjha', 'weed for sale', 'marijuana', 'cannabis',
      'phensedyl', 'fensidil', 'phensidyl', 'crystal meth', 'hash for sale', 'madok', 'mada dravya',
      'ইয়াবা', 'ইয়া বা', 'গাঁজা', 'গাজা', 'ফেনসিডিল', 'ফেন্সিডিল', 'হেরোইন', 'কোকেন', 'আফিম',
      'চরস', 'মাদক বিক্রি', 'মাদকদ্রব্য', 'ক্রিস্টাল মেথ',
    ],
    severity: 'severe',
  },
  {
    id: 'weapons',
    label: { en: 'Weapons', bn: 'অস্ত্র' },
    phrases: [
      'gun for sale', 'pistol for sale', 'revolver for sale', 'rifle for sale',
      'ammunition', 'bullets for sale', 'bomb making', 'grenade',
      'knife for sale', 'machete for sale', 'dagger for sale', 'sword for sale', 'airgun for sale',
      'bondook bikri', 'pistol bikri', 'goli bikri', 'ostro bikri', 'chura bikri',
      'বন্দুক বিক্রি', 'পিস্তল বিক্রি', 'রিভলবার', 'গুলি বিক্রি', 'অস্ত্র বিক্রি', 'বোমা তৈরি',
      'বিস্ফোরক', 'গ্রেনেড', 'ছুরি বিক্রি', 'রামদা বিক্রি', 'তলোয়ার বিক্রি',
    ],
    severity: 'severe',
  },
  {
    id: 'alcohol-tobacco',
    label: { en: 'Alcohol or tobacco', bn: 'মদ বা তামাকজাত পণ্য' },
    phrases: [
      'alcohol for sale', 'whisky for sale', 'whiskey for sale', 'vodka for sale', 'beer for sale',
      'wine for sale', 'liquor', 'cigarette for sale', 'cigarettes for sale', 'tobacco for sale',
      'cigar for sale', 'vape for sale', 'e-cigarette', 'hookah for sale', 'shisha for sale',
      'gul for sale', 'jorda for sale', 'mod bikri', 'madh bikri', 'cigarette bikri', 'biri bikri',
      'মদ বিক্রি', 'বিয়ার বিক্রি', 'সিগারেট বিক্রি', 'বিড়ি বিক্রি',
      'তামাক বিক্রি', 'জর্দা বিক্রি', 'ভেপ বিক্রি', 'হুক্কা বিক্রি',
    ],
    severity: 'severe',
  },
  {
    id: 'adult-material',
    label: { en: 'Adult or pornographic material', bn: 'প্রাপ্তবয়স্ক বা অশ্লীল সামগ্রী' },
    phrases: [
      'porn', 'porn video', 'porn magazine', 'adult magazine', 'adult video', 'adult content',
      'erotic magazine', 'nude photo', 'nude photos', 'sex toy', 'sex toys', 'sex video', 'xxx',
      'sex story book', 'choti book', 'choti boi', 'nongra chobi', 'adult cd', 'blue film',
      'পর্ন', 'পর্ন ভিডিও', 'অ্যাডাল্ট ম্যাগাজিন', 'অশ্লীল ভিডিও', 'অশ্লীল বই', 'চটি বই', 'নগ্ন ছবি',
      'সেক্স টয়', 'সেক্স ভিডিও', 'ব্লু ফিল্ম',
    ],
    severity: 'severe',
  },
  {
    id: 'gambling-betting',
    label: { en: 'Gambling or betting', bn: 'জুয়া বা বেটিং' },
    phrases: [
      'bet365', 'bet 365', '1xbet', '1x bet', 'melbet', 'betway', 'parimatch', 'online casino',
      'betting', 'betting tips', 'betting id', 'online betting', 'sports betting', 'gambling', 'jackpot',
      'lottery ticket', 'teen patti', 'slot machine', 'satta', 'juya', 'juwa', 'juya khela',
      'betting site', 'betting app',
      'জুয়া', 'জুয়া খেলা', 'অনলাইন জুয়া', 'বেটিং', 'বেটিং আইডি', 'ক্যাসিনো', 'অনলাইন ক্যাসিনো',
      'লটারি টিকিট', 'তিন পাত্তি', 'সাট্টা', 'বেটিং সাইট', 'বেটিং অ্যাপ',
    ],
    severity: 'severe',
  },
  {
    id: 'account-selling',
    label: { en: 'Selling accounts or personal IDs', bn: 'অ্যাকাউন্ট বা পরিচয়পত্র বিক্রি' },
    phrases: [
      'selling facebook id', 'facebook id for sale', 'facebook account for sale', 'selling fb id',
      'fb id sell', 'instagram account for sale', 'gmail account for sale', 'bkash account for sale',
      'nagad account for sale', 'sim card for sale', 'registered sim', 'nid card for sale', 'nid sell',
      'nid copy for sale', 'nid bikri', 'id bikri', 'account bikri', 'facebook id bikri',
      'fb id bikri', 'bkash account bikri', 'sim bikri', 'passport for sale',
      'ফেসবুক আইডি বিক্রি', 'ফেসবুক অ্যাকাউন্ট বিক্রি', 'এফবি আইডি বিক্রি', 'আইডি বিক্রি', 'অ্যাকাউন্ট বিক্রি',
      'এনআইডি বিক্রি', 'এনআইডি কপি বিক্রি', 'জাতীয় পরিচয়পত্র বিক্রি', 'বিকাশ অ্যাকাউন্ট বিক্রি',
      'সিম বিক্রি', 'পাসপোর্ট বিক্রি',
    ],
    severity: 'severe',
  },
  {
    id: 'exam-proxy',
    label: { en: 'Exam proxy or cheating services', bn: 'পরীক্ষায় প্রক্সি বা নকল সেবা' },
    phrases: [
      'exam proxy', 'proxy exam', 'proxy for exam', 'exam cheating', 'cheating service', 'exam hall proxy',
      'write your exam', 'sit your exam', 'take your exam', 'do your assignment for money',
      'assignment writing service', 'thesis writing service', 'ghost writing service',
      'exam e proxy', 'porikkhay proxy', 'proxy dibo', 'nokol sorboraho', 'exam pass guarantee',
      'পরীক্ষায় প্রক্সি', 'প্রক্সি পরীক্ষা', 'প্রক্সি দিব', 'পরীক্ষায় নকল', 'নকল সরবরাহ',
      'আপনার পরীক্ষা দিয়ে দেব', 'পাস গ্যারান্টি', 'অ্যাসাইনমেন্ট লিখে দেওয়া হয়', 'থিসিস লিখে দেওয়া হয়',
    ],
    severity: 'severe',
  },
  {
    id: 'non-book-goods',
    label: { en: 'Goods that are not books', bn: 'বই ছাড়া অন্য পণ্য' },
    phrases: [
      'mobile phone for sale', 'phone for sale', 'smartphone for sale', 'iphone for sale',
      'used laptop for sale', 'laptop for sale', 'second hand laptop', 'used mobile for sale',
      'second hand mobile', 'tablet for sale', 'camera for sale', 'bike for sale', 'motorcycle for sale',
      'car for sale', 'used car', 'furniture for sale', 'sofa for sale', 'fridge for sale',
      'tv for sale', 'television for sale', 'clothes for sale', 'clothing for sale', 'dress for sale',
      'saree for sale', 'panjabi for sale', 'shoes for sale', 'cosmetics for sale', 'makeup for sale',
      'perfume for sale', 'jewellery for sale', 'gold for sale', 'watch for sale', 'flat for sale',
      'land for sale', 'house rent', 'mobile bikri', 'phone bikri', 'laptop bikri', 'jama bikri',
      'kapor bikri', 'cosmetics bikri', 'joota bikri', 'gari bikri',
      'মোবাইল বিক্রি', 'ফোন বিক্রি', 'ল্যাপটপ বিক্রি', 'ব্যবহৃত ল্যাপটপ', 'ব্যবহৃত মোবাইল', 'আইফোন বিক্রি',
      'মোটরসাইকেল বিক্রি', 'গাড়ি বিক্রি', 'আসবাবপত্র বিক্রি', 'ফ্রিজ বিক্রি', 'টিভি বিক্রি',
      'জামা কাপড় বিক্রি', 'শাড়ি বিক্রি', 'পাঞ্জাবি বিক্রি', 'জুতা বিক্রি', 'কসমেটিকস বিক্রি',
      'সুগন্ধি বিক্রি', 'গহনা বিক্রি', 'ফ্ল্যাট বিক্রি', 'জমি বিক্রি', 'বাসা ভাড়া',
    ],
    severity: 'review',
  },
  {
    id: 'live-animals',
    label: { en: 'Live animals', bn: 'জীবন্ত প্রাণী' },
    phrases: [
      'puppy for sale', 'dog for sale', 'cat for sale', 'kitten for sale', 'parrot for sale',
      'bird for sale', 'pigeon for sale', 'cow for sale', 'goat for sale', 'rabbit for sale',
      'fish for sale', 'live animal', 'live animals', 'pet for sale', 'kukur bikri', 'biral bikri',
      'pakhi bikri', 'tiya bikri', 'kobutor bikri', 'goru bikri', 'chagol bikri', 'khorgosh bikri',
      'কুকুর বিক্রি', 'বিড়াল বিক্রি', 'বিড়ালছানা বিক্রি', 'টিয়া পাখি বিক্রি', 'পাখি বিক্রি',
      'কবুতর বিক্রি', 'গরু বিক্রি', 'ছাগল বিক্রি', 'খরগোশ বিক্রি', 'মাছ বিক্রি', 'পোষা প্রাণী বিক্রি',
    ],
    severity: 'review',
  },
  {
    id: 'medicines',
    label: { en: 'Medicines or prescription drugs', bn: 'ওষুধ বা প্রেসক্রিপশনের ওষুধ' },
    phrases: [ 'prescription medicine', 'medicine for sale',
      'medicines for sale', 'tablets for sale', 'pills for sale', 'sleeping pills', 'sleeping tablet',
      'abortion pill', 'abortion pills', 'antibiotic for sale', 'steroid for sale', 'steroids',
      'viagra', 'tramadol', 'diazepam', 'codeine', 'painkiller for sale', 'oushudh bikri',
      'osudh bikri', 'medicine bikri', 'tablet bikri', 'ghumer oshudh',
      'প্রেসক্রিপশনের ওষুধ', 'ওষুধ বিক্রি', 'ঔষধ বিক্রি', 'ট্যাবলেট বিক্রি', 'ঘুমের ওষুধ', 'ঘুমের বড়ি',
      'গর্ভপাতের ওষুধ', 'অ্যান্টিবায়োটিক বিক্রি', 'স্টেরয়েড', 'ভায়াগ্রা', 'ট্রামাডল', 'ব্যথার ওষুধ বিক্রি',
    ],
    severity: 'review',
  },
];

/** Phrases in a review or a listing that push a deal off the site ("whatsapp me", "inbox koren", "বিকাশ করুন"). */
export const OFF_SITE_PHRASES: readonly string[] = [
  // English
  'whatsapp me', 'message me on whatsapp', 'contact me on whatsapp', 'call me directly',
  'call me on', 'text me on', 'dm me', 'inbox me', 'message me on facebook', 'contact me outside',
  'pay me directly', 'send money to my', 'send me money', 'pay outside the site', 'deal outside the site',
  'cash deal', 'direct deal', 'my personal number', 'my number is', 'send payment to my bkash',
  'bkash me', 'nagad me', 'imo me', 'telegram me',
  // Banglish
  'whatsapp e jogajog korun', 'whatsapp koren', 'inbox koren', 'inbox e ashen', 'inbox e jogajog',
  'ful nombor', 'amar number e call', 'amake call din', 'amake call koren', 'sorasori jogajog',
  'sorasori deal', 'sorasori taka pathan', 'bkash korun', 'bkash koren', 'nagad korun', 'nagad koren',
  'site er baire deal', 'facebook e message din', 'imo te ashen', 'telegram e ashen',
  // Bangla
  'হোয়াটসঅ্যাপ করুন', 'হোয়াটসঅ্যাপে যোগাযোগ করুন', 'ইনবক্স করুন', 'ইনবক্সে আসুন', 'ইনবক্সে যোগাযোগ করুন',
  'সরাসরি যোগাযোগ করুন', 'সরাসরি কল করুন', 'আমাকে কল দিন', 'আমার নম্বরে কল করুন', 'আমার নাম্বার',
  'বিকাশ করুন', 'নগদ করুন', 'সরাসরি টাকা পাঠান', 'সরাসরি ডিল', 'সাইটের বাইরে ডিল',
  'ফেসবুকে মেসেজ দিন', 'ইমোতে আসুন', 'টেলিগ্রামে আসুন',
];

/** Phrases typical of spam/promotional reviews ("best price guaranteed", "visit my page", "follow my page"). */
export const PROMOTION_PHRASES: readonly string[] = [
  // English
  'best price guaranteed', 'lowest price guaranteed', 'visit my page', 'visit my shop', 'visit my website',
  'follow my page', 'like my page', 'subscribe to my channel', 'check my profile', 'click the link',
  'click here', 'link in bio', 'buy from me', 'buy from my shop', 'order now', 'limited offer',
  'huge discount', 'free delivery offer', 'cheapest price', 'use my promo code', 'join my group',
  // Banglish
  'amar page e visit korun', 'amar page follow korun', 'amar page like korun', 'amar shop e ashen',
  'amar dokan e ashen', 'amar channel subscribe korun', 'amar profile dekhun', 'link e click korun',
  'shobcheye kom dam', 'sera dam guarantee', 'ekhoni order korun', 'limited offer cholche',
  'boro discount', 'amar group e join korun',
  // Bangla
  'সেরা দামের নিশ্চয়তা', 'সর্বনিম্ন দামের নিশ্চয়তা', 'আমার পেজ ভিজিট করুন', 'আমার পেজ ফলো করুন',
  'আমার পেজ লাইক করুন', 'আমার দোকানে আসুন', 'আমার চ্যানেল সাবস্ক্রাইব করুন', 'আমার প্রোফাইল দেখুন',
  'লিংকে ক্লিক করুন', 'সবচেয়ে কম দাম', 'এখনই অর্ডার করুন', 'সীমিত অফার', 'বিশাল ডিসকাউন্ট',
  'আমার গ্রুপে জয়েন করুন', 'আমার কাছ থেকে কিনুন',
];

/**
 * The numbers the rules work to. Raise one to make its rule quieter, or list
 * the rule's code in MODERATION_DISABLED_RULES to switch it off.
 */
export const MODERATION_THRESHOLDS = {
  /** Mild words in one text before they are worth a look on their own. */
  mildWordsToFlag: 3,
  /** Reviews on one book or seller within the window that make a burst. */
  reviewBurstCount: 5,
  reviewBurstWindowMinutes: 60,
  /** An account younger than this, with an extreme one-line rating, is worth a look. */
  newAccountDays: 2,
  shortReviewChars: 15,
  /** Near-duplicate text: share of three-word runs in common (0-1). */
  nearDuplicateSimilarity: 0.8,
  /** Texts shorter than this are too ordinary to count as copies ("Good book"). */
  duplicateMinChars: 30,
  /** Similar listings needed before a price can be called unusual. */
  priceComparables: 3,
  /** A price below this share of the median, or above this many times it. */
  priceLowShare: 0.2,
  priceHighMultiple: 5,
  /** A price at or below this many taka is a placeholder. */
  placeholderPrice: 5,
  /** Perceptual hashes this close (bits) are the same photograph. */
  photoHashDistance: 6,
  /** Chat: messages from one sender in ten minutes. */
  chatBurstCount: 20,
  /** Chat: the same text sent to this many different people in a day. */
  chatBroadcastRecipients: 5,
  /** Chat: different people one sender writes to in a day. */
  chatManyRecipients: 25,
  /** The model's label counts only at or above this confidence. */
  modelConfidence: 0.7,
} as const;
