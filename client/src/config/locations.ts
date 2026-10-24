import { currentLanguage } from '../utils/language.js';

/**
 * Where the shop delivers: the eight divisions and their districts, in the
 * order checkout lists them.
 *
 * The API holds the same lists (server/config/reference.ts) for the Android
 * app, and a server test fails if the two differ.
 */
export const DIVISIONS: readonly string[] = ['Dhaka', 'Chattogram', 'Khulna', 'Rajshahi', 'Barisal', 'Sylhet', 'Rangpur', 'Mymensingh'];

export const DIVISION_DISTRICTS: Readonly<Record<string, readonly string[]>> = {
  Dhaka: ['Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj', 'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail'],
  Chattogram: ['Chattogram', "Cox's Bazar", 'Cumilla', 'Brahmanbaria', 'Chandpur', 'Feni', 'Lakshmipur', 'Noakhali', 'Khagrachari', 'Rangamati', 'Bandarban'],
  Khulna: ['Khulna', 'Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira'],
  Rajshahi: ['Rajshahi', 'Bogra', 'Joypurhat', 'Naogaon', 'Natore', 'Chapai Nawabganj', 'Pabna', 'Sirajganj'],
  Barisal: ['Barisal', 'Barguna', 'Bhola', 'Jhalokathi', 'Patuakhali', 'Pirojpur'],
  Sylhet: ['Sylhet', 'Habiganj', 'Moulvibazar', 'Sunamganj'],
  Rangpur: ['Rangpur', 'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Thakurgaon'],
  Mymensingh: ['Mymensingh', 'Jamalpur', 'Netrokona', 'Sherpur'],
};

/** The divisions and districts by their Bangla names. The English is what is stored and sent. */
const BANGLA: Readonly<Record<string, string>> = {
  Dhaka: 'ঢাকা',
  Chattogram: 'চট্টগ্রাম',
  Khulna: 'খুলনা',
  Rajshahi: 'রাজশাহী',
  Barisal: 'বরিশাল',
  Sylhet: 'সিলেট',
  Rangpur: 'রংপুর',
  Mymensingh: 'ময়মনসিংহ',
  Faridpur: 'ফরিদপুর',
  Gazipur: 'গাজীপুর',
  Gopalganj: 'গোপালগঞ্জ',
  Kishoreganj: 'কিশোরগঞ্জ',
  Madaripur: 'মাদারীপুর',
  Manikganj: 'মানিকগঞ্জ',
  Munshiganj: 'মুন্সীগঞ্জ',
  Narayanganj: 'নারায়ণগঞ্জ',
  Narsingdi: 'নরসিংদী',
  Rajbari: 'রাজবাড়ী',
  Shariatpur: 'শরীয়তপুর',
  Tangail: 'টাঙ্গাইল',
  "Cox's Bazar": 'কক্সবাজার',
  Cumilla: 'কুমিল্লা',
  Brahmanbaria: 'ব্রাহ্মণবাড়িয়া',
  Chandpur: 'চাঁদপুর',
  Feni: 'ফেনী',
  Lakshmipur: 'লক্ষ্মীপুর',
  Noakhali: 'নোয়াখালী',
  Khagrachari: 'খাগড়াছড়ি',
  Rangamati: 'রাঙ্গামাটি',
  Bandarban: 'বান্দরবান',
  Bagerhat: 'বাগেরহাট',
  Chuadanga: 'চুয়াডাঙ্গা',
  Jashore: 'যশোর',
  Jhenaidah: 'ঝিনাইদহ',
  Kushtia: 'কুষ্টিয়া',
  Magura: 'মাগুরা',
  Meherpur: 'মেহেরপুর',
  Narail: 'নড়াইল',
  Satkhira: 'সাতক্ষীরা',
  Bogra: 'বগুড়া',
  Joypurhat: 'জয়পুরহাট',
  Naogaon: 'নওগাঁ',
  Natore: 'নাটোর',
  'Chapai Nawabganj': 'চাঁপাইনবাবগঞ্জ',
  Pabna: 'পাবনা',
  Sirajganj: 'সিরাজগঞ্জ',
  Barguna: 'বরগুনা',
  Bhola: 'ভোলা',
  Jhalokathi: 'ঝালকাঠি',
  Patuakhali: 'পটুয়াখালী',
  Pirojpur: 'পিরোজপুর',
  Habiganj: 'হবিগঞ্জ',
  Moulvibazar: 'মৌলভীবাজার',
  Sunamganj: 'সুনামগঞ্জ',
  Dinajpur: 'দিনাজপুর',
  Gaibandha: 'গাইবান্ধা',
  Kurigram: 'কুড়িগ্রাম',
  Lalmonirhat: 'লালমনিরহাট',
  Nilphamari: 'নীলফামারী',
  Panchagarh: 'পঞ্চগড়',
  Thakurgaon: 'ঠাকুরগাঁও',
  Jamalpur: 'জামালপুর',
  Netrokona: 'নেত্রকোনা',
  Sherpur: 'শেরপুর',
};

/** A division or district as it is shown: its Bangla name in Bangla, the value itself in English. */
export const placeLabel = (place: string): string => (currentLanguage() === 'bn' ? BANGLA[place] ?? place : place);
