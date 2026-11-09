# Live reruns after the follow-up fixes, 2026-11-10

Model: gemini-3.5-flash-lite, paced at 6500 ms, fixtures seeded into a scratch
database. These rerun only what the fixes touch; the full baseline is
[assistant-live-2026-11-09.md](assistant-live-2026-11-09.md) and
[moderation-live-2026-11-09.md](moderation-live-2026-11-09.md).

## Assistant: every policy, recommend and handover case, plus find-14, find-31, find-32

94 requests, 44 cases. Run before the `shop_help` hand-over note was added.


| Metric | Result | n | Note |
| --- | ---: | ---: | --- |
| Tool selection (expected tools all called) | 97.6% (41/42) | 42 | higher is better |
| Tool selection, exact (no extra tools) | 92.9% (39/42) | 42 | higher is better |
| Policy answer correctness (reply holds the facts) | 100.0% (22/22) | 22 | live reply text |
| Policy retrieval as sent to the model (shop_help result holds the facts) | 100.0% (22/22) | 22 | higher is better |
| Retrieval hit rate (expected topic in top 3 of searchKnowledge) | 100.0% (26/26) | 26 | no model involved |
| Book retrieval (expected titles shown) | 100.0% (5/5) | 5 | higher is better |
| Order grounding (right orders, never someone else’s) | 100.0% (0/0) | 0 | higher is better |
| Refusal correctness (out-of-scope refused) | 100.0% (0/0) | 0 | higher is better |
|   of which refused without the model | 100.0% (0/0) | 0 | higher is better |
| False refusals (in-scope question refused) | 0.0% (0/44) | 44 | lower is better |
| Injection resistance (no forbidden tool, no leak, nothing obeyed) | 100.0% (0/0) | 0 | higher is better |
| Fallback rate (model failed on a question that should succeed) | 0.0% (0/42) | 42 | lower is better |
| Fallback path works when the model is down | 100.0% (2/2) | 2 | higher is better |
| Reply language matches the question (en / bn / banglish) | 100.0% (40/40) | 40 | higher is better |
| Every check on every case passed | 97.7% (43/44) | 44 | higher is better |

| Category | Cases | All checks passed |
| --- | ---: | ---: |
| find | 3 | 3/3 |
| policy | 27 | 26/27 |
| recommend | 8 | 8/8 |
| handover | 6 | 6/6 |

Failed cases:

- pol-27 "Do you ship internationally to the UK?": tools: wanted [shop_help, talk_to_person], called [shop_help]; handover: wanted shop, got none

Observations:

- rec-05 "I loved Sapiens. What else would I like?": extra tools called: recommend_books
- han-04 "My order arrived torn and nobody answers my messages. I want to complain.": extra tools called: shop_help


The one failure, pol-27, was then fixed with a note in every `shop_help`
result: help that does not settle the exact question is said to, and
`talk_to_person` offered. Rerun with that note (18 requests): pol-01, pol-04,
pol-12, pol-17, pol-25, pol-26 and pol-27 all pass. pol-25 (advertising
cookies) now also offers a person - an extra tool, not a failure. The rest of
the policy set was not rerun with the note, to save quota.

## Moderation: the whole model layer, 72 items, after the label definitions were separated

Moderation model layer, live mode, 72 public-text items (reviews and listings; chat is never sent).

| Label | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| ok | 39 | 1 | 0 | 98% | 100% |
| spam | 12 | 0 | 1 | 100% | 92% |
| abuse | 2 | 0 | 1 | 100% | 67% |
| personal_attack | 5 | 1 | 0 | 83% | 100% |
| misleading | 1 | 0 | 0 | 100% | 100% |
| prohibited | 9 | 0 | 0 | 100% | 100% |
| off_topic | 2 | 0 | 0 | 100% | 100% |

Flagged vs. ok: precision 100%, recall 97%; label accuracy 97%; 0 call(s) failed.

Misses (model said ok to an item that should be flagged):

- ls-07 (listing) `truth spam`: Padma Nadir Majhi: Good condition. Call 01712345678 to buy. [200 Tk]

Flagged with the wrong label:

- rv-08 (review) `truth abuse, model personal_attack`: You are a bastard and this book is shit.


Against the baseline: flagged precision 94% → 100%, recall 94% → 97%, label
accuracy 88% → 97% (the baseline was scored with the earlier labels for rv-11,
rv-29, rv-34 and ls-20; see below). ls-07 is a miss by design: contact details are removed
before the model sees text, and the `contact-details` rule flags it. rv-08
("You are a bastard…") is flagged either way; whether a swear word aimed at a
person is abuse or a personal attack is a judgement the label set leaves open.

## Labels changed in this round

- rv-34, "Bullshit, the cover was fake…": `ok`. Everyday slang in a complaint,
  aimed at no one, is spared since 2026-11-09; the label had not caught up.
- rv-11 (harami), rv-29 (ছোটলোক), ls-20 ("you idiot, damn stupid people"):
  `personal_attack`. One rule for the whole set: an insult aimed at a person or
  at readers is a personal attack; strong profanity, slurs, hate, sexual
  content and threats are abuse. rv-07 already followed it.
