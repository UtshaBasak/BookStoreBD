import { site, siteLocation, sitePoliciesUpdated } from '../../config/site.js';
import { openConsentSettings } from '../../utils/consent.js';
import { formatNumber, pick, t } from '../../utils/language.js';
import LegalPage from './LegalPage.js';

/**
 * Describes what the application actually does with personal data - the fields
 * the models store, the cookie and browser storage used, and the third parties
 * involved.
 * Written from the code rather than from a template, so it can be checked.
 */
export default function Privacy() {
  const location = siteLocation();
  return (
    <LegalPage
      title={t('Privacy policy', 'গোপনীয়তা নীতি')}
      intro={t(
        `How ${site.name} handles your personal information.`,
        `${site.name} আপনার ব্যক্তিগত তথ্য কীভাবে ব্যবহার ও সুরক্ষা করে।`
      )}
      updated={sitePoliciesUpdated()}
    >
      <p>
        {pick(
          <>
            This policy describes what we collect, why, and what you can ask us to do
            about it. It reflects how the service actually works rather than a
            generic template.
          </>,
          <>
            এই নীতিতে বলা আছে আমরা কী তথ্য সংগ্রহ করি, কেন করি, এবং সে বিষয়ে আপনি আমাদের কী করতে বলতে
            পারেন। এটি কোনো সাধারণ ছাঁচে লেখা নয়; সেবাটি আসলে যেভাবে কাজ করে, সেভাবেই লেখা।
          </>
        )}
      </p>
      <p>
        {pick(
          <>{site.name} is run by {site.owner}, {location}, who is
            responsible for the personal information described here.</>,
          <>{site.name} পরিচালনা করেন {site.owner}, {location}। এখানে বর্ণিত ব্যক্তিগত তথ্যের দায়িত্ব
            তাঁর।</>
        )}
      </p>

      <h2>{t('What we collect', 'আমরা কী সংগ্রহ করি')}</h2>
      <p>
        {pick(
          <>When you create an account we store your username, e-mail address and a
            hashed version of your password. We never store the password itself — it
            is put through bcrypt and cannot be read back, by us or by anyone who
            obtained a copy of the database.</>,
          <>আপনি অ্যাকাউন্ট খুললে আমরা আপনার ইউজারনেম, ই-মেইল ঠিকানা এবং পাসওয়ার্ডের একটি হ্যাশ করা
            রূপ সংরক্ষণ করি। পাসওয়ার্ডটি নিজে আমরা কখনো সংরক্ষণ করি না — এটি bcrypt দিয়ে রূপান্তর করা হয়,
            এবং তা আর পড়া যায় না: আমরাও পারি না, ডেটাবেসের কপি হাতে পাওয়া কেউও পারে না।</>
        )}
      </p>
      <ul>
        <li>
          {pick(
            <>Optional profile details you choose to add: phone number, delivery
              address, date of birth, gender and a profile picture.</>,
            <>প্রোফাইলের যেসব ঐচ্ছিক তথ্য আপনি নিজে যোগ করেন: ফোন নম্বর, ডেলিভারির ঠিকানা, জন্মতারিখ,
              লিঙ্গ এবং প্রোফাইল ছবি।</>
          )}
        </li>
        <li>
          {pick(
            <>Orders you place, including the delivery address, contact name,
              phone number and the e-mail address for that order, where its
              e-mails go.</>,
            <>আপনার দেওয়া অর্ডার, তার ডেলিভারির ঠিকানা, যোগাযোগের নাম, ফোন নম্বর এবং ওই অর্ডারের
              ই-মেইল ঠিকানা, যেখানে অর্ডারের ই-মেইল যায়।</>
          )}
        </li>
        <li>
          {pick(
            <>Return requests: what was wrong, the photographs you add, and the
              bKash number you give for the refund.</>,
            <>রিটার্নের অনুরোধ: কী সমস্যা ছিল, আপনার যোগ করা ছবি, এবং টাকা ফেরতের জন্য আপনার দেওয়া
              বিকাশ নম্বর।</>
          )}
        </li>
        <li>
          {pick(
            <>Listings you create as a seller, including the photographs you
              upload, and the bKash merchant number your sales are paid to. Only you
              and we can see that number.</>,
            <>বিক্রেতা হিসেবে আপনার তৈরি লিস্টিং, আপনার আপলোড করা ছবিসহ, এবং যে বিকাশ মার্চেন্ট নম্বরে
              আপনার বিক্রির টাকা পাঠানো হয়। ওই নম্বর শুধু আপনি আর আমরা দেখতে পাই।</>
          )}
        </li>
        <li>
          {pick(
            <>Messages and images you exchange with other users through the chat.</>,
            <>চ্যাটে অন্য ব্যবহারকারীদের সঙ্গে আপনার আদান-প্রদান করা মেসেজ ও ছবি।</>
          )}
        </li>
        <li>
          {pick(
            <>Reviews you write, which are public and carry the name on your
              account beside them.</>,
            <>আপনার লেখা রিভিউ, যা সবাই দেখতে পায় এবং যার পাশে আপনার অ্যাকাউন্টের নাম থাকে।</>
          )}
        </li>
        <li>
          {pick(
            <>One-time codes sent for sign-up and password resets. They are stored
              only in a hashed form and are deleted once they expire.</>,
            <>অ্যাকাউন্ট খোলা ও পাসওয়ার্ড রিসেটের জন্য পাঠানো এককালীন কোড। এগুলো শুধু হ্যাশ করা রূপে
              রাখা হয় এবং মেয়াদ শেষ হলেই মুছে ফেলা হয়।</>
          )}
        </li>
        <li>
          {pick(
            <>Standard technical data in our server logs: the request path, status,
              timestamp and IP address. Authorisation headers, cookies, passwords and
              one-time codes are removed before anything is written to a log, and so
              are e-mail addresses and anything after a "?" in a page address.</>,
            <>আমাদের সার্ভার লগে সাধারণ কারিগরি তথ্য: অনুরোধের পাথ, স্ট্যাটাস, সময় এবং IP ঠিকানা। লগে
              কিছু লেখার আগে অথরাইজেশন হেডার, কুকি, পাসওয়ার্ড ও এককালীন কোড সরিয়ে ফেলা হয়; ই-মেইল ঠিকানা
              এবং পাতার ঠিকানায় "?" চিহ্নের পরের অংশও সরিয়ে ফেলা হয়।</>
          )}
        </li>
        <li>
          {pick(
            <>A security record of sign-ins and other protective checks: whether
              they passed or failed, when, the IP address and the browser's
              description of itself. It names your account only by its internal id
              or a scrambled code made from your e-mail address, never the address
              itself, and never holds a password, a code, a phone number, a postal
              address or a bKash number. We use it to spot and stop attacks on
              accounts.</>,
            <>সাইন ইন ও অন্যান্য সুরক্ষা যাচাইয়ের একটি নিরাপত্তা রেকর্ড: যাচাই সফল হয়েছে না ব্যর্থ, কখন,
              IP ঠিকানা এবং ব্রাউজার নিজের সম্পর্কে যে বর্ণনা দেয়। এতে আপনার অ্যাকাউন্ট চিহ্নিত হয় শুধু তার
              অভ্যন্তরীণ আইডি বা আপনার ই-মেইল ঠিকানা থেকে তৈরি একটি এলোমেলো কোড দিয়ে, ঠিকানাটি দিয়ে
              কখনো নয়; আর এতে কখনো পাসওয়ার্ড, কোড, ফোন নম্বর, ডাক ঠিকানা বা বিকাশ নম্বর থাকে না।
              অ্যাকাউন্টের ওপর আক্রমণ ধরতে ও থামাতে আমরা এটি ব্যবহার করি।</>
          )}
        </li>
        <li>
          {pick(
            <>If a page breaks in your browser, and you allow error reports, a short
              report: what failed, the page address and your browser's name. It does
              not include what you typed or anything you were shown.</>,
            <>আপনার ব্রাউজারে কোনো পাতা ঠিকমতো না চললে, এবং আপনি এরর রিপোর্টের অনুমতি দিলে, একটি ছোট
              রিপোর্ট: কী ব্যর্থ হয়েছে, পাতার ঠিকানা এবং আপনার ব্রাউজারের নাম। আপনি যা লিখেছেন বা আপনাকে যা
              দেখানো হয়েছে, তার কিছুই এতে থাকে না।</>
          )}
        </li>
        <li>
          {pick(
            <>Books you ask for on the Wanted board. Others see the book and how
              many people want it, never who.</>,
            <>চাহিদার বোর্ডে আপনি যেসব বই চান। অন্যরা বইটি এবং কতজন সেটি চান তা দেখতে পান, কিন্তু কে
              চেয়েছেন তা কখনো নয়।</>
          )}
        </li>
        <li>
          {pick(
            <>The e-mail addresses of friends you invite, so we can tell you when
              they join and do not invite the same person over and over.</>,
            <>আপনি যে বন্ধুদের আমন্ত্রণ জানান তাঁদের ই-মেইল ঠিকানা, যাতে তাঁরা যোগ দিলে আপনাকে জানাতে পারি
              এবং একই মানুষকে বারবার আমন্ত্রণ না পাঠাই।</>
          )}
        </li>
        <li>
          {pick(
            <>Which notifications and e-mails you have chosen to receive.</>,
            <>কোন কোন নোটিফিকেশন ও ই-মেইল পেতে আপনি বেছে নিয়েছেন।</>
          )}
        </li>
        <li>
          {pick(
            <>What is searched for in the catalogue and how many books each search
              found, without who searched, for 90 days - to show popular searches
              and learn which books people cannot find.</>,
            <>বইয়ের তালিকায় কী খোঁজা হয়েছে এবং প্রতিটি খোঁজে কয়টি বই পাওয়া গেছে, কে খুঁজেছেন তা ছাড়া,
              {' '}{formatNumber(90)} দিনের জন্য — জনপ্রিয় খোঁজগুলো দেখাতে এবং মানুষ কোন বই খুঁজে পাচ্ছেন না তা
              জানতে।</>
          )}
        </li>
        <li>
          {pick(
            <>That a book was viewed, as a code that cannot be traced back to you,
              for a day, so each person counts once in the book's view count.</>,
            <>একটি বই দেখা হয়েছে — এই তথ্য, এমন একটি কোড হিসেবে যা থেকে আপনাকে শনাক্ত করা যায় না, এক দিনের
              জন্য, যাতে বইটি কতবার দেখা হয়েছে সেই হিসাবে প্রত্যেক মানুষ একবারই গোনা হন।</>
          )}
        </li>
      </ul>
      <p>
        {pick(
          <>Scanning a book's barcode in our Android app uses the camera only while
            the scanner is open. The picture is read on your phone to find the ISBN
            and is never stored or sent anywhere; only the ISBN is used, as a search
            or in the listing you are writing.</>,
          <>আমাদের Android অ্যাপে বইয়ের বারকোড স্ক্যান করার সময় ক্যামেরা চালু থাকে শুধু যতক্ষণ স্ক্যানার খোলা
            থাকে। ISBN খুঁজে বের করতে ছবিটি আপনার ফোনেই পড়া হয়, এবং ছবিটি কখনো সংরক্ষণ করা বা কোথাও পাঠানো হয়
            না; শুধু ISBN-টি ব্যবহার হয়, খোঁজার জন্য বা আপনি যে লিস্টিং লিখছেন তাতে।</>
        )}
      </p>

      <h2 id="cookies">{t('Cookies and storage', 'কুকি ও স্টোরেজ')}</h2>
      <p>
        {pick(
          <>We use no advertising or analytics cookies, and we do not track you
            across other sites. What we keep in your browser is in four groups, and
            only the first is kept without your say-so:</>,
          <>আমরা কোনো বিজ্ঞাপন বা অ্যানালিটিক্স কুকি ব্যবহার করি না, এবং অন্য সাইটে আপনাকে অনুসরণ করি না।
            আপনার ব্রাউজারে আমরা যা রাখি তা চারটি ভাগে বিভক্ত, এবং শুধু প্রথম ভাগটি আপনার অনুমতি ছাড়া রাখা
            হয়:</>
        )}
      </p>
      <ul>
        <li>
          {pick(
            <><strong>Necessary</strong> (always on): one cookie holding your
              session, so you stay signed in - marked <code>httpOnly</code> so page
              scripts cannot read it, limited to the sign-in routes, and expiring
              after 30 days; your e-mail address and account type in local storage,
              so a reload knows you are signed in; a random
              code that lets us recognise this browser, so we can e-mail you when
              your account is signed in to from one we have not seen; the security
              check on sign-in and sign-up; and your choice about the rest. The
              language you choose for the site is kept here too, without asking,
              because it is how you asked to read the site; when you are signed in,
              it is also stored on your account, so e-mails and notifications use
              it.</>,
            <><strong>প্রয়োজনীয়</strong> (সবসময় চালু): আপনার সেশন ধরে রাখা একটি কুকি, যাতে আপনি সাইন ইন
              থাকেন — এটি <code>httpOnly</code> চিহ্নিত, ফলে পাতার স্ক্রিপ্ট এটি পড়তে পারে না; এটি শুধু
              সাইন ইনের রুটে পাঠানো হয় এবং {formatNumber(30)} দিন পর মেয়াদ শেষ হয়; লোকাল স্টোরেজে আপনার
              ই-মেইল ঠিকানা ও অ্যাকাউন্টের ধরন, যাতে পাতা আবার লোড হলেও বোঝা যায় আপনি সাইন ইন করা আছেন; একটি
              এলোমেলো কোড, যা দিয়ে আমরা এই ব্রাউজারটি চিনতে পারি, যাতে আমাদের অচেনা কোনো ব্রাউজার থেকে আপনার
              অ্যাকাউন্টে সাইন ইন হলে আপনাকে ই-মেইল করতে পারি; সাইন ইন ও অ্যাকাউন্ট খোলার সময়ের নিরাপত্তা
              যাচাই; এবং বাকি ভাগগুলো নিয়ে আপনার সিদ্ধান্ত। সাইটের জন্য আপনার বেছে নেওয়া ভাষাও জিজ্ঞেস না
              করেই এখানে রাখা হয়, কারণ আপনি সাইটটি এভাবেই পড়তে চেয়েছেন; সাইন ইন করা থাকলে এটি আপনার
              অ্যাকাউন্টেও সংরক্ষণ করা হয়, যাতে ই-মেইল ও নোটিফিকেশন সেই ভাষায় আসে।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Preferences</strong>: light or dark mode, your voice search
              language, how lists are sorted and sized, and your recent searches.</>,
            <><strong>পছন্দ</strong>: হালকা বা গাঢ় মোড, ভয়েস সার্চের ভাষা, তালিকা কীভাবে সাজানো ও কতটা বড়
              দেখানো হবে, এবং আপনার সাম্প্রতিক খোঁজ।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Personalisation</strong>: the books you viewed lately, for
              "Recently viewed" and "Top picks for you".</>,
            <><strong>আপনার মতো করে সাজানো</strong>: সম্প্রতি আপনার দেখা বই, "সম্প্রতি দেখা" এবং "আপনার জন্য
              বাছাই" অংশের জন্য।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Error reports</strong>: a report sent to us when a page
              breaks, as described above.</>,
            <><strong>এরর রিপোর্ট</strong>: কোনো পাতা ঠিকমতো না চললে আমাদের কাছে পাঠানো একটি রিপোর্ট, যেমনটা
              ওপরে বলা হয়েছে।</>
          )}
        </li>
      </ul>
      <p>
        {pick(
          <>When you first visit, you choose: accept all, necessary only, or each
            group on its own. Turning a group off deletes what it kept. You can
            change your mind at any time.</>,
          <>প্রথমবার এলে আপনি বেছে নেন: সব গ্রহণ, শুধু প্রয়োজনীয়, অথবা প্রতিটি ভাগ আলাদা করে। কোনো ভাগ বন্ধ
            করলে সেটি যা রেখেছিল তা মুছে যায়। যেকোনো সময় আপনি সিদ্ধান্ত বদলাতে পারেন।</>
        )}
      </p>
      <p>
        <button type="button" className="btn btn-ghost" onClick={openConsentSettings}>
          {t('Change cookie settings', 'কুকি সেটিংস বদলান')}
        </button>
      </p>

      <h2>{t('Who else sees it', 'আর কে এটি দেখে')}</h2>
      <ul>
        <li>
          {pick(
            <><strong>Other users.</strong> A seller sees the delivery name,
              address and phone number for an order you place with them, because
              they have to get the book to you. Your handle and profile picture are
              visible on listings you create. Your address, phone number and date of
              birth are never shown to other buyers.</>,
            <><strong>অন্য ব্যবহারকারীরা।</strong> আপনি কোনো বিক্রেতার কাছে অর্ডার দিলে তিনি সেই অর্ডারের
              ডেলিভারির নাম, ঠিকানা ও ফোন নম্বর দেখেন, কারণ বইটি তাঁকেই আপনার কাছে পৌঁছাতে হয়। আপনার তৈরি
              লিস্টিংয়ে আপনার ইউজারনেম ও প্রোফাইল ছবি দেখা যায়। আপনার ঠিকানা, ফোন নম্বর ও জন্মতারিখ অন্য
              ক্রেতাদের কখনো দেখানো হয় না।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Our courier</strong> receives the delivery name, address and
              phone number for an order, and nothing else, so they can deliver it
              and collect the payment.</>,
            <><strong>আমাদের কুরিয়ার</strong> একটি অর্ডারের ডেলিভারির নাম, ঠিকানা ও ফোন নম্বর পায়, আর কিছু
              নয়, যাতে তারা অর্ডারটি পৌঁছে দিয়ে টাকা নিতে পারে।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>bKash</strong> receives the number a refund or a seller's
              payment is sent to, when we send it.</>,
            <><strong>বিকাশ</strong> সেই নম্বরটি পায়, যেখানে আমরা ফেরতের টাকা বা বিক্রেতার পাওনা পাঠাই,
              পাঠানোর সময়।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Cloudinary</strong> hosts the photographs of listings and of
              return requests, when image hosting is enabled.</>,
            <><strong>Cloudinary</strong> লিস্টিং ও রিটার্নের অনুরোধের ছবি রাখে, যখন ছবি রাখার এই ব্যবস্থা
              চালু থাকে।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Google (Gmail)</strong> delivers our e-mail, including the
              one-time codes used for sign-up verification and password resets.</>,
            <><strong>Google (Gmail)</strong> আমাদের ই-মেইল পৌঁছে দেয়, অ্যাকাউন্ট খোলার যাচাই ও পাসওয়ার্ড
              রিসেটের এককালীন কোডসহ।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Google sign-in</strong>, if you choose Continue with Google:
              Google tells us your name, e-mail address and profile picture, and that
              the address is verified. We never see your Google password.</>,
            <><strong>Google সাইন ইন</strong>, যদি আপনি "Google দিয়ে চালিয়ে যান" বেছে নেন: Google আমাদের
              আপনার নাম, ই-মেইল ঠিকানা ও প্রোফাইল ছবি জানায়, এবং জানায় যে ঠিকানাটি যাচাই করা। আপনার Google
              পাসওয়ার্ড আমরা কখনো দেখি না।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Cloudflare Turnstile</strong> runs the security check on
              sign-in and sign-up, to tell people from bots. It looks at your
              browser, not at who you are, and we receive only a pass or a fail.</>,
            <><strong>Cloudflare Turnstile</strong> সাইন ইন ও অ্যাকাউন্ট খোলার সময় নিরাপত্তা যাচাই চালায়,
              মানুষ আর বট আলাদা করতে। এটি আপনার ব্রাউজার দেখে, আপনি কে তা নয়, এবং আমরা শুধু পাস বা ফেল
              ফলাফলটি পাই।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Sentry</strong>, if error reporting is enabled, receives
              technical details of errors, with credentials stripped out.</>,
            <><strong>Sentry</strong>, এরর রিপোর্টিং চালু থাকলে, এররের কারিগরি বিবরণ পায়, লগইনের তথ্য
              সরিয়ে।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Firebase Cloud Messaging</strong> (Google), if you use our
              Android app and allow notifications, delivers a signal to your phone
              that something new is waiting. The signal carries only a reference
              number, never the text of a notification or a message: the app then
              fetches the details from us directly. Signing out of the app stops
              it.</>,
            <><strong>Firebase Cloud Messaging</strong> (Google), যদি আপনি আমাদের Android অ্যাপ ব্যবহার করেন
              এবং নোটিফিকেশনের অনুমতি দেন, আপনার ফোনে একটি সংকেত পাঠায় যে নতুন কিছু অপেক্ষা করছে। সংকেতটিতে
              শুধু একটি রেফারেন্স নম্বর থাকে, নোটিফিকেশন বা মেসেজের লেখা কখনো নয়: এরপর অ্যাপ সরাসরি আমাদের
              কাছ থেকে বিস্তারিত নিয়ে আসে। অ্যাপ থেকে সাইন আউট করলে এটি বন্ধ হয়ে যায়।</>
          )}
        </li>
      </ul>
      <p>
        {t(
          'We do not sell personal data, and we do not share it for advertising.',
          'আমরা ব্যক্তিগত তথ্য বিক্রি করি না, এবং বিজ্ঞাপনের জন্য কারও সঙ্গে শেয়ারও করি না।'
        )}
      </p>

      <h2>{t('How long we keep it', 'কতদিন রাখি')}</h2>
      <p>
        {pick(
          <>Account and profile data is kept until you delete your account or ask
            us to. Orders and return requests are kept as business records. Chat
            messages are kept until both participants have deleted the
            conversation: deleting it removes it from your side, and the other
            person keeps their copy.</>,
          <>অ্যাকাউন্ট ও প্রোফাইলের তথ্য রাখা হয় যতদিন না আপনি অ্যাকাউন্ট মুছে ফেলেন বা আমাদের মুছতে বলেন।
            অর্ডার ও রিটার্নের অনুরোধ ব্যবসার রেকর্ড হিসেবে রাখা হয়। চ্যাটের মেসেজ রাখা হয় যতক্ষণ না দুজনেই
            কথোপকথনটি মুছে ফেলেন: আপনি মুছলে তা আপনার দিক থেকে সরে যায়, আর অন্যজনের কপি তাঁর কাছে থেকে
            যায়।</>
        )}
      </p>

      <h2>{t('Your rights', 'আপনার অধিকার')}</h2>
      <p>
        {pick(
          <>You do not have to ask us for any of this. On your profile page,
            under <strong>Your data</strong>, you can download everything this
            account holds as a single file, and you can delete the account outright.
            You can also edit your profile there. To change your e-mail address, we
            send a code to the new address, and tell the old one once it has
            changed.</>,
          <>এর কোনোটির জন্যই আমাদের কাছে চাইতে হবে না। আপনার প্রোফাইল পাতায় <strong>আপনার তথ্য</strong>{' '}
            অংশে আপনি এই অ্যাকাউন্টে থাকা সবকিছু একটি ফাইল হিসেবে ডাউনলোড করতে পারেন, এবং অ্যাকাউন্টটি
            পুরোপুরি মুছে ফেলতে পারেন। সেখানে আপনার প্রোফাইলও বদলাতে পারেন। ই-মেইল ঠিকানা বদলাতে আমরা নতুন
            ঠিকানায় একটি কোড পাঠাই, এবং বদল হয়ে গেলে পুরোনো ঠিকানায় তা জানিয়ে দিই।</>
        )}
      </p>
      <p>
        {pick(
          <>If you would rather we did it, or you cannot sign in, e-mail us at{' '}
            <a href={`mailto:${site.email}`}>{site.email}</a>.</>,
          <>আপনি চাইলে কাজটি আমরা করে দিতে পারি, বা আপনি সাইন ইন করতে না পারলে, আমাদের ই-মেইল করুন:{' '}
            <a href={`mailto:${site.email}`}>{site.email}</a>।</>
        )}
      </p>
      <p>
        {pick(
          <>Deleting an account removes your profile, your cart, your wishlist,
            your notifications and any listings you posted, and signs out every
            session. Orders not yet started are cancelled for you. While an order is
            on its way, a return is being decided, or a sale is still to be paid out
            to you, the account stays open until that is finished; the page tells
            you what is still open. An account made with Google confirms the
            deletion with a code we e-mail to it.</>,
          <>অ্যাকাউন্ট মুছলে আপনার প্রোফাইল, কার্ট, উইশলিস্ট, নোটিফিকেশন এবং আপনার দেওয়া সব লিস্টিং মুছে
            যায়, এবং সব সেশন থেকে সাইন আউট হয়ে যায়। যে অর্ডারের কাজ এখনো শুরু হয়নি, সেগুলো আপনার হয়ে বাতিল
            করা হয়। কোনো অর্ডার পথে থাকলে, কোনো রিটার্নের সিদ্ধান্ত বাকি থাকলে, বা কোনো বিক্রির টাকা এখনো আপনাকে
            দেওয়া বাকি থাকলে, সেটি শেষ না হওয়া পর্যন্ত অ্যাকাউন্ট খোলা থাকে; কী বাকি আছে, পাতাটি আপনাকে জানিয়ে
            দেয়। Google দিয়ে খোলা অ্যাকাউন্টে মুছে ফেলা নিশ্চিত করতে হয় সেই অ্যাকাউন্টে আমাদের ই-মেইল করা একটি
            কোড দিয়ে।</>
        )}
      </p>
      <p>
        {pick(
          <>Some things are kept rather than deleted, because they are not only
            yours. Orders and return requests stay as accounting records, with your
            name, phone number, address, e-mail and bKash number removed from them.
            Messages stay in the other person's conversation and reviews stay on the
            books they are about, both shown as coming from a deleted user - what
            was agreed is often the reason the other person still has the thread,
            and the next buyer's decision rests on the reviews.</>,
          <>কিছু জিনিস মুছে না ফেলে রেখে দেওয়া হয়, কারণ সেগুলো শুধু আপনার নয়। অর্ডার ও রিটার্নের অনুরোধ হিসাবের
            রেকর্ড হিসেবে থেকে যায়, তবে সেগুলো থেকে আপনার নাম, ফোন নম্বর, ঠিকানা, ই-মেইল ও বিকাশ নম্বর সরিয়ে
            ফেলা হয়। মেসেজ অন্যজনের কথোপকথনে থেকে যায় এবং রিভিউ সংশ্লিষ্ট বইয়ের পাতায় থেকে যায়, দুটোই একজন
            মুছে ফেলা ব্যবহারকারীর লেখা হিসেবে দেখানো হয় — কী ঠিক হয়েছিল, প্রায়ই সেটিই অন্যজনের কাছে
            কথোপকথনটি রাখার কারণ, আর পরের ক্রেতার সিদ্ধান্ত রিভিউর ওপর নির্ভর করে।</>
        )}
      </p>

      <h2>{t('Security', 'নিরাপত্তা')}</h2>
      <p>
        {pick(
          <>Passwords are hashed with bcrypt. Sessions use short-lived tokens that
            are rotated on every use, and a reused token ends the session everywhere.
            Traffic is encrypted in transit, and your phone number, address and bKash
            numbers are encrypted in the database as well, so a stolen copy of it
            would not reveal them.</>,
          <>পাসওয়ার্ড bcrypt দিয়ে হ্যাশ করা হয়। সেশনে স্বল্পমেয়াদি টোকেন ব্যবহার হয়, যা প্রতিবার ব্যবহারের সময়
            বদলে যায়, আর কোনো টোকেন দ্বিতীয়বার ব্যবহার হলে সব জায়গায় সেশনটি শেষ হয়ে যায়। আদান-প্রদানের সময়
            ডেটা এনক্রিপ্ট করা থাকে, এবং আপনার ফোন নম্বর, ঠিকানা ও বিকাশ নম্বর ডেটাবেসেও এনক্রিপ্ট করা থাকে,
            ফলে ডেটাবেসের কোনো চুরি হওয়া কপি থেকেও সেগুলো জানা যাবে না।</>
        )}
      </p>
      <ul>
        <li>
          {pick(
            <>After five wrong passwords in a row, signing in to that address is
              paused for 15 minutes.</>,
            <>পরপর পাঁচবার ভুল পাসওয়ার্ড দিলে ওই ঠিকানায় সাইন ইন {formatNumber(15)} মিনিটের জন্য বন্ধ
              থাকে।</>
          )}
        </li>
        <li>
          {pick(
            <>Changing your password or bKash number needs your current password,
              and we e-mail you when either changes. A new password signs out every
              other device.</>,
            <>পাসওয়ার্ড বা বিকাশ নম্বর বদলাতে আপনার বর্তমান পাসওয়ার্ড লাগে, এবং যেকোনোটি বদলালে আমরা আপনাকে
              ই-মেইল করি। নতুন পাসওয়ার্ড দিলে অন্য সব ডিভাইস থেকে সাইন আউট হয়ে যায়।</>
          )}
        </li>
        <li>
          {pick(
            <>We e-mail you when your account is signed in to from a new browser,
              and you can sign out everywhere else from your profile.</>,
            <>নতুন কোনো ব্রাউজার থেকে আপনার অ্যাকাউন্টে সাইন ইন হলে আমরা আপনাকে ই-মেইল করি, এবং প্রোফাইল থেকে
              আপনি অন্য সব জায়গা থেকে সাইন আউট করতে পারেন।</>
          )}
        </li>
        <li>
          {pick(
            <>You can turn on two-step sign-in, which also asks for a code sent to
              your e-mail.</>,
            <>আপনি দুই ধাপের সাইন-ইন চালু করতে পারেন, তখন আপনার ই-মেইলে পাঠানো একটি কোডও চাওয়া হয়।</>
          )}
        </li>
      </ul>
      <p>
        {pick(
          <>No system is perfectly secure, but if a breach ever affects your data
            we will tell you. To report a security problem, see our{' '}
            <a href="/.well-known/security.txt">security contact</a>.</>,
          <>কোনো ব্যবস্থাই পুরোপুরি নিরাপদ নয়, তবে কখনো নিরাপত্তা ভঙ্গে আপনার তথ্য ক্ষতিগ্রস্ত হলে আমরা আপনাকে
            জানাব। নিরাপত্তা-সংক্রান্ত কোনো সমস্যা জানাতে আমাদের{' '}
            <a href="/.well-known/security.txt">নিরাপত্তা যোগাযোগ</a> দেখুন।</>
        )}
      </p>

      <h2>{t('Age', 'বয়স')}</h2>
      <p>
        {pick(
          <>You must be {site.minimumAge} or older to use {site.name}, and we do not
            knowingly collect information about anyone younger.</>,
          <>{site.name} ব্যবহার করতে আপনার বয়স {formatNumber(site.minimumAge)} বছর বা তার বেশি হতে হবে, এবং
            এর চেয়ে কম বয়সী কারও তথ্য আমরা জেনেশুনে সংগ্রহ করি না।</>
        )}
      </p>

      <h2>{t('Changes', 'পরিবর্তন')}</h2>
      <p>
        {t(
          'If this policy changes materially we will say so on this page and update the date above.',
          'এই নীতিতে উল্লেখযোগ্য কোনো পরিবর্তন হলে আমরা এই পাতায় তা জানাব এবং ওপরের তারিখটি হালনাগাদ করব।'
        )}
      </p>

      <h2>{t('Contact', 'যোগাযোগ')}</h2>
      <p>
        {pick(
          <>Questions about this policy: <a href={`mailto:${site.email}`}>{site.email}</a>.</>,
          <>এই নীতি নিয়ে প্রশ্ন থাকলে: <a href={`mailto:${site.email}`}>{site.email}</a>।</>
        )}
      </p>
    </LegalPage>
  );
}
