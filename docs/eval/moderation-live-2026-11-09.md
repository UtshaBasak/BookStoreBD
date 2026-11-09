# Automatic moderation, live evaluation, 2026-11-09

Model: gemini-3.5-flash-lite. Real Gemini responses for 72 invented public-text items, paced at 6500 ms. Chat is rules only and never sent.

## Rule layer

Moderation rule layer, 83 labelled items (40 reviews, 32 listings, 11 chat patterns).

| Rule | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| abuse | 1 | 0 | 0 | 100% | 100% |
| abuse-mild | 2 | 0 | 0 | 100% | 100% |
| banned:account-selling | 1 | 0 | 0 | 100% | 100% |
| banned:alcohol-tobacco | 1 | 0 | 0 | 100% | 100% |
| banned:exam-leaks | 1 | 0 | 0 | 100% | 100% |
| banned:fake-documents | 1 | 0 | 0 | 100% | 100% |
| banned:non-book-goods | 1 | 0 | 0 | 100% | 100% |
| banned:pirated-copies | 3 | 0 | 0 | 100% | 100% |
| banned:weapons | 1 | 0 | 0 | 100% | 100% |
| chat-broadcast | 3 | 0 | 0 | 100% | 100% |
| chat-burst | 1 | 0 | 0 | 100% | 100% |
| chat-contact-spam | 3 | 0 | 0 | 100% | 100% |
| chat-many-recipients | 1 | 0 | 0 | 100% | 100% |
| contact-details | 7 | 0 | 0 | 100% | 100% |
| discount-claim | 1 | 0 | 0 | 100% | 100% |
| duplicate-photo | 1 | 0 | 0 | 100% | 100% |
| duplicate-text | 1 | 0 | 0 | 100% | 100% |
| missing-details | 1 | 0 | 0 | 100% | 100% |
| new-account-extreme | 1 | 0 | 0 | 100% | 100% |
| off-site | 4 | 0 | 0 | 100% | 100% |
| placeholder-price | 1 | 0 | 0 | 100% | 100% |
| price-outlier | 2 | 0 | 0 | 100% | 100% |
| promotion | 4 | 0 | 0 | 100% | 100% |
| review-burst | 1 | 0 | 0 | 100% | 100% |
| threat | 2 | 0 | 0 | 100% | 100% |

Item level (flagged by any rule vs. should be flagged): precision 100%, recall 100% (TP 40, FP 0, FN 0, TN 43).

## Model layer

Moderation model layer, live mode, 72 public-text items (reviews and listings; chat is never sent).

| Label | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| ok | 36 | 2 | 2 | 95% | 95% |
| spam | 11 | 0 | 2 | 100% | 85% |
| abuse | 4 | 0 | 3 | 100% | 57% |
| personal_attack | 2 | 2 | 0 | 50% | 100% |
| misleading | 1 | 3 | 0 | 25% | 100% |
| prohibited | 8 | 2 | 1 | 80% | 89% |
| off_topic | 1 | 0 | 1 | 100% | 50% |

Flagged vs. ok: precision 94%, recall 94%; label accuracy 88%; 1 call(s) failed.

False positives (model flagged an ok item):

- ls-21 (listing) `model prohibited`: Learning PDF: A hardcover guide to the PDF file format and how readers parse it. [600 Tk]
- ls-22 (listing) `model prohibited`: Photocopier Repair Manual: Service manual, good condition. [300 Tk]

Misses (model said ok to an item that should be flagged):

- rv-34 (review) `truth abuse`: Bullshit, the cover was fake and the pages were loose.
- ls-07 (listing) `truth spam`: Padma Nadir Majhi: Good condition. Call 01712345678 to buy. [200 Tk]

Flagged with the wrong label:

- rv-11 (review) `truth abuse, model personal_attack`: seller ta ekta harami, boi pathay ni
- rv-21 (review) `truth off_topic, model misleading`: The phone case I bought was cracked and the colour was wrong.
- rv-29 (review) `truth abuse, model personal_attack`: এই ছোটলোক বিক্রেতার কাছ থেকে কিনবেন না
- ls-23 (listing) `truth spam, model misleading`: Novel: Visit my page for huge discount, order now! [300 Tk]
- ls-29 (listing) `truth prohibited, model misleading`: Electronics: Used laptop for sale, good condition. [25000 Tk]
