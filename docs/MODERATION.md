# Automatic moderation

BookStoreBD checks new reviews, seller ratings, book listings and chat patterns
for spam, abuse, copied photos, odd prices and items the shop does not allow.
What it finds goes to a queue for administrators, at **Flagged by system**
(`/admin/flags`), before anyone has to report it.

The code is in `server/utils/moderation/`, `server/config/moderationPolicy.ts`,
`server/controllers/moderation.controller.ts` and
`client/src/pages/admin/SystemFlags.tsx`. The model layer uses the same Gemini
key and budget as the shopping assistant; see [`ASSISTANT.md`](ASSISTANT.md).

---

## The principle: flag, never remove

A flag is a suggestion to a person. It is not a verdict.

- Nothing is hidden, held back, edited or deleted because of a flag. A review,
  a listing or a message is published exactly as before, and stays as it was
  until an administrator decides.
- A write never waits for moderation. It adds a job to a queue and returns. If
  moderation is broken, content is still published.
- Every flag says why, in plain words, with a score from 0 to 1.
- A flag the administrator decided stays decided, unless the content itself
  changes. Then it is opened again, because what they judged is gone.

---

## The layers

```text
new content --> queue --> 1. rules (free, local) --> 2. model (public text only) --> flag
```

1. **Rules.** Deterministic checks: word lists, contact details, copied text,
   bursts, prices, photo fingerprints. Free and fast, and each reason can be
   explained.
2. **Model.** One Gemini call that labels the text, for judgements rules cannot
   make: a targeted insult, a review about something else, a listing for
   something that is not a book. It runs only when the Gemini key is set, the
   budget allows, the text is at least 15 characters, and no rule has already
   scored 0.8 or more.

The model only labels. It never decides. A label becomes a reason on a flag, and
nothing more. A label counts only at 0.7 confidence or above. The model's score
is its label's weight times its confidence.

### What each layer sees

| Content | Rules | Model |
| --- | --- | --- |
| Review of a book | Title and body, rating, the author's account age, other reviews | Title and body, and the book's title |
| Rating of a seller | The same | Title and body, and the seller's username |
| Book listing | Title, author, description, condition notes, price, categories, photos | Title, author and description, and the categories |
| Chat | One sender's messages over the last day | **Never.** Chat is private and is checked by rules only |

Only public text goes to the model, with phone numbers, e-mail addresses and
links removed first. Chat never does. The model's own safety filters are turned
off for this call, because it has to read abusive text to label it.

---

## The rules

Each reason has a code. Scores of 0.75 or more are high severity, 0.5 or more
medium, and lower are low. A flag takes the score of its strongest reason.

The numbers come from `MODERATION_THRESHOLDS` in
`server/config/moderationPolicy.ts`.

### Words and contact details (reviews and listings)

| Code | Fires when | Score |
| --- | --- | --- |
| `threat` | A severe term of kind threat is in the text | 0.95 |
| `abuse` | A severe abusive term (profanity, slur, personal attack, sexual) is in the text | 0.85 |
| `abuse-mild` | No severe term, at least 3 mild words (`mildWordsToFlag`), and a word that points at a person (`PERSON_REFERENCES`: seller, you, আপনি, tumi...). "Stupid packaging" is a complaint, "stupid seller" is aimed at someone | 0.45 |
| `contact-details` | A phone or bKash number (also in Bangla digits, or spelled out in words in English, Bangla or Banglish), an e-mail address or a link | 0.6 |
| `off-site` | A phrase that pushes a deal off the site ("whatsapp me", "inbox koren") | 0.6 |
| `promotion` | A phrase typical of an advertisement ("visit my page") | 0.5 |

The reasons name the kinds of word found, never the words themselves.

### Reviews and seller ratings

| Code | Fires when | Score |
| --- | --- | --- |
| `duplicate-text` | The same or nearly the same text (80% of three-word runs in common, `nearDuplicateSimilarity`) is in another review of a book or a seller. Texts under 30 characters are too ordinary to count (`duplicateMinChars`). Compares with the latest 300 of each kind. Flags when 2 or more other accounts wrote a copy (`duplicateAccounts`), when the same account pasted it 2 or more times, or when one copy also advertises or carries contact details: two buyers can honestly write the same short praise | 0.7 if another account wrote a copy, 0.5 if only the same account |
| `review-burst` | 5 or more reviews on one book or seller within 60 minutes (`reviewBurstCount`, `reviewBurstWindowMinutes`) | 0.4 |
| `new-account-extreme` | A 1 or 5 star rating, under 15 characters of text (`shortReviewChars`), from an account under 2 days old (`newAccountDays`) | 0.35 |

### Listings

| Code | Fires when | Score |
| --- | --- | --- |
| `banned:<id>` | Words from the banned-items list (see below) are in the title, author, description or condition notes | 0.8 for a severe item, 0.45 for a review item |
| `placeholder-price` | The price is 5 Tk or less (`placeholderPrice`) | 0.55 |
| `price-outlier` | The price is under 20% of the usual price (`priceLowShare`), or over 5 times it (`priceHighMultiple`). "Usual" is the median of the same book (by ISBN, or title and author), or if fewer than 3 are found (`priceComparables`), of similar listings in the same category, type and condition | 0.5 low, 0.45 high |
| `discount-claim` | The text claims a percentage off, and the listing's discount differs from it by 5 points or more | 0.4 |
| `duplicate-photo` | A photo matches one on another seller's listing: a Cloudinary perceptual hash within 6 bits (`photoHashDistance`), or an exact SHA-256 for an inline image. Up to 5 photos are checked | 0.6 |
| `duplicate-photo-same-seller` | The match is only with the same seller's other listings | 0.25 |
| `missing-details` | No description and no photo | 0.2 |

Abuse, contact and off-site rules also run on listings.

### Chat (one sender's last day, rules only)

| Code | Fires when | Score |
| --- | --- | --- |
| `chat-burst` | 20 or more messages in ten minutes (`chatBurstCount`) to at least 3 people (`chatBurstRecipients`); a quick conversation with one person does not count | 0.45 |
| `chat-broadcast` | The same text (10 or more characters) went to 5 or more different people (`chatBroadcastRecipients`) | 0.75 |
| `chat-contact-spam` | Phone numbers, e-mail addresses or links went to 3 or more people | 0.55 |
| `chat-many-recipients` | The sender wrote first to 25 or more different people today (`chatManyRecipients`); replies to people who wrote first do not count, so a busy seller is not flagged | 0.4 |

The flag points at the messages that fired a rule (up to 20) and never keeps a
copy of their text.

### Model labels

| Code | Meaning | Weight |
| --- | --- | --- |
| `model:spam` | Advertising, link or contact farming, gibberish | 0.6 |
| `model:abuse` | Profanity, slurs, hate, sexual content, threats | 0.75 |
| `model:personal_attack` | Insults aimed at a person, not at a book or a service | 0.6 |
| `model:misleading` | A listing that misdescribes what is sold, or a review not about the item | 0.5 |
| `model:prohibited` | Something that is not a book, or is not allowed | 0.7 |
| `model:off_topic` | A review that says nothing about the book, the seller or the order | 0.3 |

An honest complaint, even a harsh one, is `ok` unless it is abusive. Text
between `<content>` tags is treated as data, and an attempt to instruct the
model counts as spam. The instructions are in `server/prompts/moderation.ts`.

---

## The word lists and the banned-items policy

`server/config/moderationPolicy.ts` is the owner's file. Nothing in it removes
anything; a match only raises a flag.

| List | What it holds |
| --- | --- |
| `ABUSIVE_TERMS` | Words in Bangla script, English and Banglish, each with a kind and a severity: `severe` flags on its own, `mild` only in numbers |
| `BANNED_ITEMS` | Things the shop does not allow, each with an id, a label and its phrases. Severe: `pirated-copies`, `exam-leaks`, `fake-documents`, `counterfeit-currency`, `illegal-drugs`, `weapons`, `alcohol-tobacco`, `adult-material`, `gambling-betting`, `account-selling`, `exam-proxy`. Review: `non-book-goods`, `live-animals`, `medicines` |
| `OFF_SITE_PHRASES` | Phrases that move a sale off the site |
| `PROMOTION_PHRASES` | Phrases typical of promotional spam |
| `MODERATION_THRESHOLDS` | The numbers above |

Keep every entry lowercase. Matching is whole word or whole phrase, after
lower-casing and turning Bangla digits into ordinary ones. The site is
child-friendly, so the abusive list is broad. Ordinary words, and words common
in book titles, stay out. A word such as "firearms" or "prescription drugs" on
its own caught honest books about those subjects and was taken out.

After editing the file, deploy it, then run `npm --prefix server run moderation:scan`
so existing content is looked at again. Scans are safe to repeat.

---

## Modes

Set `MODERATION_MODE`.

| Mode | What happens |
| --- | --- |
| `off` (the default) | Nothing is queued and nothing is flagged. The shop is as before |
| `shadow` | Content is checked and flags are recorded, but they are kept out of the admin queue. For a trial. `render.yaml` starts here |
| `on` | Flags are recorded and shown in the queue |

`MODERATION_DISABLED_RULES` is a comma-separated list of codes to switch off,
for example `review-burst,missing-details`. A code with a colon can be given
whole (`banned:medicines`) or by its first part: `banned` switches off every
banned-item rule and `model` every model label. A switched-off rule raises no
new flags. Flags already recorded are not deleted.

### Rollout

1. **Start in `shadow`.** Set `MODERATION_MODE=shadow` (already so in
   `render.yaml`) and deploy.
2. **Check the existing content.** `npm --prefix server run moderation:scan:dry`
   counts what would be queued. `npm --prefix server run moderation:scan` queues
   it. The server's worker does the checking in the background, within the
   budget.
3. **Review the trial flags.** On `/admin/flags`, tick **Trial** to see them.
   Read what was flagged and why. The **Rule precision** table (below) shows,
   rule by rule, how often your decisions agreed with it.
4. **Tune.** A rule that fires on honest content: raise its number in
   `MODERATION_THRESHOLDS`, take the phrase out of the list, or switch the rule
   off with `MODERATION_DISABLED_RULES`. Run the scan again.
5. **Switch to `on`.** Set `MODERATION_MODE=on` and deploy.

Flags made while the mode was `shadow` keep a **Trial** label. Once the mode
is `on`, the ones still open appear in the live queue with the rest, so
nothing found during the trial is lost.

---

## The queue and the worker

A new review, seller rating, listing or edited listing adds a job. A chat
message adds one job per sender, so a burst waits once. A second write before
the check runs finds the job already waiting and adds nothing.

- **Persisted.** Jobs live in the database (`ModerationJob`). The free host
  sleeps and restarts, and a waiting job survives that. Finished jobs delete
  themselves after a week.
- **The worker.** `startModerationWorker()` in `index.ts` takes up to 5 due jobs
  every 20 seconds. It runs while `MODERATION_MODE` is `shadow` or `on`, or
  while the Gemini key is set (the key also lets it embed listings for the
  assistant).
- **Model trouble.** If the model is busy, over budget or unavailable, the rule
  flags are saved at once and the job is tried again later, with a wait that
  doubles: 5, 10, 20, 40, then 80 minutes. After six tries the job is closed
  as done without the model's opinion.
- **An error in a job.** It is tried again after 2 minutes, doubling each time.
  After six attempts it is marked `failed`.
- **Restart recovery.** A job that was started and never finished, because the
  host restarted, is taken again after ten minutes.
- **Idempotent.** Scanning the same content again changes nothing. New
  evidence about the same content (a model label arriving after the rules) is
  added to the open flag.

---

## What administrators do

Open **Flagged by system** in the admin panel (`/admin/flags`). Each flag shows
the content in context, the reasons with their score and source (rule or
model), and a link to the page. Search and filter by type, source, severity and
status, and sort by newest, oldest or score.

| Action | What happens |
| --- | --- |
| **Looks fine** (clear) | The flag is closed as cleared. The content is untouched |
| **Remove** | The page first removes the content through its usual delete (listing, review or seller rating), then records the decision, then the author is told why, with a reason the administrator writes (required). The server refuses the record, with `409`, while the content still exists. For chat, the server deletes the flagged messages from both sides with the decision |
| **Message the author** | Sends the author a notification and e-mail through the usual admin message, then records the decision |
| **Clear many** | Marks up to 100 open flags as fine in one step, for obvious false alarms |

Every decision writes to the audit trail (`moderation.cleared`,
`moderation.removed`, `moderation.messaged`) and a `admin.moderation.decided`
security event; see [`SECURITY-EVENTS.md`](SECURITY-EVENTS.md). An optional note
is kept with the decision.

### Rule precision

The page has a table of every rule code with how many of its flags were
actioned (removed or messaged) and how many were cleared, and the share that
were actioned. A low figure means administrators mostly clear what the rule
flags: raise its threshold or switch it off. A figure is `-` until a rule has
a decision.

### Flagged chat

A chat flag shows the messages that fired a rule, to administrators only.
Opening one is a privileged act and is written to the audit trail as
`moderation.chat.viewed`, with the number of messages shown. The flag itself
keeps only message ids and a count. Chat text is never copied into it, and is
never sent to the model.

### The author is told

When a decision is **Remove**, the author gets a notification and an e-mail
saying an administrator removed their review, rating, listing or messages,
with the shop's reason, and that they can reply through the Contact page if
they think it was a mistake. Only the author is told. A cleared flag tells
nobody.

---

## Scripts

Run from the repository root with `npm --prefix server run ...`, or from
`server/`. They need `MONGO` and `MODERATION_MODE` set to `shadow` or `on`.

| Command | What it does |
| --- | --- |
| `npm --prefix server run moderation:scan:dry` | Counts the reviews, ratings, listings and recent chat senders that would be queued |
| `npm --prefix server run moderation:scan` | Queues them all. The running server's worker checks them. Use it after turning moderation on, or after editing the rules or lists |
| `npm --prefix server run moderation:scan -- --now` | Also checks them here, until the queue is empty. Anything waiting for the model is retried by the server's worker |

Chat senders are those who wrote in the last day, since the rules look at a day.

---

## Evaluations

`server/eval/moderationCases.ts` is a labelled set of 83 invented items (40
reviews, 32 listings, 11 chat patterns) and 72 items of public text for the
model.

- **Offline, in CI:** `npm --prefix server run eval:moderation`. The rule layer
  runs for real. The model's labels are played back from hand-written
  recordings, so that part only tests the plumbing.
- **Live, by hand:** `npm --prefix server run eval:moderation:live -- --yes`,
  with `--pace=ms` (default 6500) and `--write` (saves the tables to
  `docs/eval/moderation-live-<date>.md`). About 70 requests. It needs
  `GEMINI_API_KEY` and `MONGO`, seeds a separate `<db>_eval` database and drops
  it afterwards, and refuses to run in production.

The current numbers, the first run's false positives and how they were fixed,
and the thresholds the tests enforce are in
[`server/eval/RESULTS.md`](../server/eval/RESULTS.md). The set is small: watch
the precision table on `/admin/flags` during the shadow trial for the rules
real content trips.
