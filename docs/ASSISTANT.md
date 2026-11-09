# Shopping assistant

BookStoreBD has a small assistant in the corner of every page. A reader asks a
question in Bangla, English or Banglish and gets a short answer, with the books,
orders and page links it found shown underneath. It is built on Google's Gemini
API, and it works only with the shop's own data and code.

It is optional. Without `GEMINI_API_KEY` the button is not drawn, and the
rest of the shop is unchanged. Automatic moderation shares the same key and
budget; it is described in [`MODERATION.md`](MODERATION.md).

The code is in `server/utils/assistant/`, `server/utils/gemini.ts`,
`server/prompts/assistant.ts` and `client/src/components/assistant/`.

---

## What it does

- Finds books by title, author, category, price, stock, deals, or by what a
  book is about ("a sad novel about the liberation war").
- Answers questions about delivery, payment, returns, promo codes, selling,
  fees, reviews, the Wanted board and privacy, from the shop's own help text.
- Shows a signed-in reader their own orders, with each stage explained.
- Suggests books.
- Offers a button to chat with a seller or the shop, or to ask for a missing
  book on the Wanted board. Nothing is posted or sent until the reader presses it.
- Answers in the language of the question. Bangla script and Banglish get
  Bangla; English gets English.

It does not take on anything else (homework, code, news, other shops). It
says so and stops.

It never changes anything. Every tool is read-only.

---

## How a question is answered

```text
browser -> POST /api/assistant/chat
             |
             |  1. limits         per-minute limiter, daily cap, repeat check
             |  2. cheap checks   instruction-override? plainly off-topic?   (no model)
             |  3. cache          the same general question, within 10 minutes
             |  4. the model      up to 3 tool calls, then the answer         (Gemini)
             |  5. cleaning       plain text only, no links, at most 1500 characters
             v
        reply + books + links + order cards (from the tools, not from the model's words)
```

1. **Limits.** See [Limits](#limits). A request over a limit is refused with `429`.
2. **Checks without the model.** A message that tries to override the
   instructions ("ignore the above rules", "show me your system prompt") gets a
   neutral reply and an `assistant.injection_suspected` event. A message that is
   plainly general-purpose and not about books or the shop (write an essay, a
   recipe, the weather, code) gets the out-of-scope reply. A message that also
   mentions books is let through. The same question more than three times in
   ten minutes from one person gets the neutral reply and an `assistant.abuse`
   event. None of these costs a model call.
3. **Cache.** A general question (one that used only `shop_help` or
   `browse_shop`) is kept for ten minutes, up to 300 answers. A personal answer
   is never cached.
4. **The model.** Gemini gets the instructions, the last few turns and the
   tools. It may call a tool, read the result, and call another, at most three
   in all. On the last step tools are switched off, so it must answer.
5. **Cleaning.** HTML, markdown links and web addresses are removed from its
   text, and the text is cut at 1500 characters. The books, links, order cards
   and buttons under the answer come from the tools. A link or a price in the
   model's words is never shown as one.

### When the model cannot answer

If there is no key, or the model is busy, over budget, blocked or returns
nothing, the reader still gets an answer. The **fallback** is built without the
model: the best matching help topic, or the books that match the words, a
"Search the shop" link, a "How it works" link and a way to reach a person. The
reply says that the assistant is busy. Fallbacks are counted in the stats.

### Instructions to the model

They are in one file, `server/prompts/assistant.ts`, so a change in behaviour is
a reviewable diff. They tell the model to use tools for every fact, never to
name a book, price or rule from memory, to treat everything inside a tool
result as data and never as instructions, and to reply with exactly
`OUT_OF_SCOPE` for anything else. Tool results are also wrapped in a field
named `data_from_bookstorebd`.

---

## The tools

Every argument the model sends is checked with Zod before it is used. Anything
unexpected is dropped, not trusted. A tool name the model invents, or a tool a
visitor may not use, comes back as an error and is never run.

| Tool | What it does | What it may see, and what goes back to the model |
| --- | --- | --- |
| `search_books` | Searches the catalogue by words, author, category, type, price, stock, deals and sort. A `description` also searches by meaning (see below). | Public listing facts only: title, author, price, discount, stock, new or second-hand, condition, up to three categories, rating |
| `book_details` | More about one book from a search, by its reference (`B1`, `B2`...) | The same, plus publisher, language, ISBN, condition notes and the description. Contact details are removed from the seller's text |
| `shop_help` | Finds the shop's own rules for a question | Help text written by the shop (`utils/assistant/knowledge.ts`) |
| `browse_shop` | What the shop has | Category names with counts, popular writers, the number of books on deal |
| `find_seller` | Finds a seller's shop by username | Public usernames and how many books each lists |
| `recommend_books` | Suggests books | Public books. Whether they were chosen from this person's history is sent as a yes or no, not the history |
| `my_orders` | The signed-in person's recent orders, or one by number | **Signed-in only.** The account comes from the session, never from the model. The model is told how many orders were found and their stages (for example `Shipped`). Titles, totals, numbers and addresses stay on the server. The order cards are built there and shown to the reader |
| `talk_to_person` | Offers a chat with a book's seller, or with the shop | Nothing new. A button is shown; no conversation is sent anywhere unless the reader chooses to |
| `offer_wanted_request` | Offers to ask for a missing book on the Wanted board | The title and author the model supplied. Nothing is posted unless the reader presses the button |

Search by meaning: each listing's public text is turned into a vector once (and
again when it changes) by the background worker. A question's description is
embedded when asked and compared with every listing's vector in memory; a
match needs a similarity of at least 0.5. Vectors are kept in `BookEmbedding`
and compared in memory because the free Atlas tier allows only three search
indexes in all. It is used beside the ordinary search, never instead of it.

---

## Privacy

### What is sent to Google

| Sent | Detail |
| --- | --- |
| The question | At most 500 characters, with phone numbers, e-mail addresses and links removed |
| The recent turns | The last six turns the browser kept, each at most 600 characters, with the same removals. The browser keeps them only for the tab (`sessionStorage`) |
| The instructions | Today's date, the language, whether the person is signed in, and the signed-in person's display name, so it can greet them once |
| Tool results | The public facts in the table above, and order stages for `my_orders` |
| Listing text for search by meaning | Title, author, categories, new or second-hand, and the first 600 characters of the description, with contact details removed |

### What is never sent

- Order details: titles, totals, numbers, addresses, phone numbers, payment
  numbers. Only the stage word of each order goes to the model.
- Chat messages. Buyer and seller chat never reaches the assistant or moderation.
- Contact details in anything the person typed or a seller wrote.
- E-mail addresses, passwords, tokens and any other account data.
- The book ids of recently viewed books. See the next point.

### History needs consent

The browser sends the list of recently viewed books (`seen`, at most 20 ids)
only when the visitor has allowed the **personalisation** cookie category.
Without that choice the list is not sent at all. On the server it only decides
which books `recommend_books` returns. It is never part of a prompt.

### What is stored

| Kept | For how long |
| --- | --- |
| Counts per day: questions, fallbacks, hand-overs, out-of-scope, helpful, not helpful (`AssistantStat`) | About 400 days |
| A thumbs up or down with an optional reason, tied to the request id in the log (`AssistantFeedback`) | 180 days |
| Daily question counts per account or address, keyed by a hash so no address is stored in plain text (`UsageCounter`) | Two days |

The question and the answer are **not** stored and **not** logged. The log has
the request id, the tools used, the number of books and the language. The
Gemini calls log the feature, model, time taken, token counts, tools and
outcome, never the text.

### The free tier

On Google's unpaid tier, what is sent may be used to improve Google's products
and read by human reviewers. The paid tier does not. The privacy policy has to
say that readers' questions go to Google. This is why the rules above keep the
request to public text.

---

## Limits

| Limit | Default | Where it is set | What happens |
| --- | --- | --- | --- |
| Questions a minute from one address | 12 | `ASSISTANT_PER_MINUTE` | `429`, and a `ratelimit.exceeded` event with `limiter: assistant` |
| Questions a day, signed-in person | 60 | `ASSISTANT_USER_DAILY` | `429` `assistant-daily-limit`, and an `assistant.abuse` event |
| Questions a day, visitor, per address | 30 | `ASSISTANT_IP_DAILY` | The same |
| Shop-wide calls a minute | 10 | `GEMINI_RPM` | Fallback answer |
| Shop-wide calls a day | 500 | `GEMINI_RPD` | Fallback answer |
| Moderation's share of both | 20% | `GEMINI_MODERATION_SHARE` | See below |
| One question's length | 500 characters | | Refused as invalid |
| Tool calls in one answer | 3 | | The last step has tools off |
| Model calls at once | 4 | `GEMINI_MAX_CONCURRENT` | The rest wait |
| A model call's time | 20 seconds | `GEMINI_TIMEOUT_MS` | Fallback answer |

A day starts at midnight in Dhaka. Daily counts live in the database, so a
restart on the free host does not reset them. The per-minute count is in
memory.

### The shop-wide budget and the 80/20 split

The two ceilings (`GEMINI_RPM`, `GEMINI_RPD`) are the shop's own, kept under
what the key allows. Every call, from either feature, takes one from them.

- The assistant may use all of the budget.
- Moderation may use only its share: by default `floor(10 x 0.2)` = 2 a
  minute and `floor(500 x 0.2)` = 100 a day. It also stops while the combined
  use in the last minute is at the ceiling, so a background job never keeps a
  shopper waiting.

So at the defaults moderation can take at most 100 of the 500 daily calls, and
the assistant has the other 400 as a guarantee and more when moderation is
quiet. A job that is held back is tried again later (see
[`MODERATION.md`](MODERATION.md)). Embedding listings also uses moderation's
share, except the one short query embedded for a reader's search, which is the
assistant's.

A call that was retried after a Google error still counts once against the
shop's budget, but Google may count each attempt. Keep the ceilings under the
key's limits with some room.

Today's use is shown to administrators: `GET /api/assistant/stats` returns
`geminiToday` with each feature's count and the limit.

---

## Configuration

All are server variables, in `server/.env` or the host's environment. None is
required. They are read when used, so a key can be added without a code change.
`server/.env.example` has the same list.

| Variable | Default | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | none | From Google AI Studio. Without it the assistant is hidden and moderation runs its rules only. Secret |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | The assistant's model |
| `GEMINI_MODERATION_MODEL` | `GEMINI_MODEL` | Moderation's model, if different |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | For search by meaning. Vectors are 256 numbers long |
| `GEMINI_THINKING_LEVEL` | `minimal` | `minimal`, `low`, `medium` or `high`. Leave empty for the model's default; older models refuse the setting |
| `GEMINI_RPM` | `10` | The shop's calls a minute across both features |
| `GEMINI_RPD` | `500` | The shop's calls a day across both features |
| `GEMINI_MODERATION_SHARE` | `0.2` | Moderation's share of both, 0 to 1 |
| `GEMINI_TIMEOUT_MS` | `20000` | Time allowed for one call |
| `GEMINI_MAX_CONCURRENT` | `4` | Calls in flight at once |
| `ASSISTANT_ENABLED` | on | `false` hides the assistant with the key still set |
| `ASSISTANT_USER_DAILY` | `60` | Questions a day, signed-in |
| `ASSISTANT_IP_DAILY` | `30` | Questions a day, visitor, per address |
| `ASSISTANT_PER_MINUTE` | `12` | Questions a minute per address |

`MODERATION_MODE` and `MODERATION_DISABLED_RULES` are in
[`MODERATION.md`](MODERATION.md). `render.yaml` lists `GEMINI_API_KEY` (set by
hand in the dashboard) and starts moderation in `shadow`.

### The API

| Method | Endpoint | Who | Description |
| --- | --- | --- | --- |
| `GET` | `/api/assistant/config` | anyone | `{ enabled }`. The button asks once the page is idle |
| `POST` | `/api/assistant/chat` | anyone (signed-in adds orders and picks) | `{ message, history?, seen? }`. `503` `assistant-off` when it is off |
| `POST` | `/api/assistant/feedback` | anyone | `{ requestId, helpful, reason? }`. One per answer |
| `GET` | `/api/assistant/stats` | admin | The last 30 days in counts, and today's Gemini use |

---

## Evaluations

The labelled questions are in `server/eval/assistantCases.ts` (105 cases:
finding books, shop rules, orders, recommendations, out-of-scope requests,
injection attempts and hand-overs, in Bangla, English, Banglish and mixed).
They run against a fixture shop in `server/eval/fixtures.ts`.

**Offline, in CI.** `npm --prefix server run eval:assistant` runs the cases with
the model's replies played back from `server/eval/recorded.ts`. These
recordings are written by hand; they are not from Gemini. They measure the
engine, the tools, the search, the help retrieval, the order lookup, the
filters and the fallback. They do not measure how well Gemini behaves. The test
also checks that no request reaches `googleapis.com`. It runs with the rest of
`npm test`.

**Live, by hand.** This calls the real model and spends the free quota.

```bash
npm --prefix server run eval:assistant:live -- --yes
npm --prefix server run eval:assistant:live -- --yes --pace=8000 --only=pol --write
```

| Flag | Meaning |
| --- | --- |
| `--yes` | Required. Without it nothing runs |
| `--pace=ms` | Milliseconds between requests. Default 6500, under ten a minute |
| `--only=id` | Only cases whose id starts with this: `find`, `pol`, `ord`, `rec`, `oos`, `inj`, `han`, or several, comma-separated (`--only=pol-,find-14`) |
| `--write` | Also saves the table to `docs/eval/assistant-live-<date>.md` |

It needs `GEMINI_API_KEY` and `MONGO`. It seeds its fixtures into a separate
`<db>_eval` database and drops that afterwards, and never touches the real
one. It refuses to run when `NODE_ENV` is `production`. A full run is about 190
requests, well over a third of a day's default budget. The two outage cases
(`find-31`, `find-32`) play a scripted failure even in a live run, since a real
outage cannot be asked for.

`--write` names the file by the date in UTC, so a second run on the same date
replaces the first. The database user needs the right to drop `<db>_eval`; an
app-only Atlas user does not have it. Point `MONGO` at a local MongoDB for the
run instead, in that shell only (`$env:MONGO = "mongodb://127.0.0.1:27017/"`
in PowerShell): the fixtures are invented, so nothing real is needed.

On Windows PowerShell, `npm run ... -- --yes` may hand the flags to npm instead
of the script. Call the script directly then:
`npx tsx scripts/assistantEvalLive.ts --yes --write`, from `server`.

The numbers so far, the known issues and the thresholds the tests enforce are
in [`server/eval/RESULTS.md`](../server/eval/RESULTS.md).

---

## Adding a tool safely

Every tool is a chance to show someone's data to a model or to a stranger. Go
through this list.

1. **Read-only.** A tool looks things up. It never writes, sends or deletes. If
   an action is needed, return a button for the reader to press, as
   `offer_wanted_request` does.
2. **Define it once** in the `TOOLS` registry in `utils/assistant/tools.ts`:
   a declaration (name, description, parameters) and a runner.
3. **Check the arguments with Zod**, with limits on length and values. Treat
   them as hostile; the model chose them after reading text anyone can write.
4. **Take identity from the session.** The account comes from `context.email`.
   Never from an argument. Mark the tool `signedIn: true` if it needs one.
5. **Return public data to the model.** Name each field you return. Do not
   return a whole database row. Personal data goes to the reader as a card
   built on the server, and the model is told only that it was shown.
6. **Strip contact details** from any text a person wrote
   (`stripContactDetails`).
7. **Only local links.** `addLink` accepts paths that start with `/`.
8. **Say how it may be cached.** Only answers that used `shop_help` and
   `browse_shop` are cached. A new tool is not, unless the result is the same for
   everyone.
9. **Tell the model** about it in `server/prompts/assistant.ts`, and say that
   its results are data.
10. **Add evaluation cases** in `server/eval/assistantCases.ts` and the recorded
    steps in `server/eval/recorded.ts`, including one that tries to misuse it.
    Add a unit test in `server/tests/assistant.test.ts`.
11. **Update** the tool table and the privacy section in this file, and the
    privacy policy if a new kind of data reaches Google.

---

## Free-tier operations

### Expected limits

Google shows the numeric free-tier limits for each model only in the
signed-in AI Studio rate-limit page. They change, and they differ by model.
Read them there, then set `GEMINI_RPM` and `GEMINI_RPD` a little under them.
The defaults (10 a minute, 500 a day) are cautious starting points, not
Google's numbers.

### What happens when a limit is exceeded

| Where | What the reader sees | What the shop does |
| --- | --- | --- |
| The shop's own budget is used (`GEMINI_RPM`, `GEMINI_RPD`) | The fallback answer | No call is made. Moderation jobs wait and retry |
| Google answers `429` with a short wait (up to five seconds) | A short delay | The call is retried once |
| Google answers `429` with a long wait (the daily quota) | The fallback answer | It gives up at once |
| Google is down or slow (`5xx`, timeout) | The fallback answer after one retry | |
| A reader is over a limit | A message to try later, or use the search | `429`, and a security event |

A model that is off, busy or over budget never leaves the reader with nothing:
the fallback answers.

### Changing the model

Set `GEMINI_MODEL`, `GEMINI_MODERATION_MODEL` or `GEMINI_EMBEDDING_MODEL` and
restart. No code changes. Check the current names in AI Studio first, as they
change.

- If a model refuses the thinking setting, set `GEMINI_THINKING_LEVEL` to empty.
- If you change `GEMINI_EMBEDDING_MODEL`, vectors from the old model are
  ignored. Run `npm --prefix server run assistant:embed` to queue every listing
  again. Add `-- --now` to embed them from your own machine, paced to the
  moderation share; if the day's budget runs out it stops and can be run
  again tomorrow.
- Re-run the live evaluation after a change, with `--only` to save quota.

### Moving to a paid key

Create the key in AI Studio, put it in `GEMINI_API_KEY`, and raise `GEMINI_RPM`
and `GEMINI_RPD` to match the paid limits. Nothing else changes. The request
code is the same. The privacy rules above stay as they are: they are about what
the shop chooses to send, not only about the tier. The paid tier's different
terms for content are a reason to review the privacy policy wording, not to
send more.

### Rotating the key

1. Create a new key in AI Studio.
2. Put it in `GEMINI_API_KEY` on the host and deploy.
3. Ask the assistant a question, and check the admin stats and the log for
   `Gemini call` lines with `outcome: ok`.
4. Delete the old key in AI Studio.

The key goes in the `x-goog-api-key` header, never in the address, so it does
not appear in a proxy or error log. It is not logged.

### If the key leaks

1. Delete it in AI Studio now. Calls with it stop at once.
2. Create a new key and set it as above.
3. Look at AI Studio's usage for the hours before. Someone using your key
   spends your quota.
4. Find where it leaked (a pasted log, a screenshot, a committed `.env`) and
   remove it there. If it was committed, rewriting history does not undo the
   leak; the delete in step 1 does.

Until a new key is set the assistant is hidden and moderation runs on rules
alone. The shop works as before.

---

## Facts checked on 2026-11-08

About Gemini, as found that day. They change, so check before relying on them.

- Google's recommended SDK is `@google/genai`. This code does not use it. It
  calls the REST `generateContent` endpoint directly with `fetch`, as the Gmail
  and bot-check code does, so a test replaces one function
  (`setGeminiTransportForTesting`) rather than a library.
- `generateContent` is still fully supported. Google now recommends the
  Interactions API for new work. Moving to it would be a change inside
  `utils/gemini.ts` alone.
- Free-tier models then included `gemini-3.8-flash`, `gemini-3.6-flash`,
  `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` and `gemini-2.5-flash-lite`,
  and the embedding models `gemini-embedding-001` and `gemini-embedding-2`. The
  default here is `gemini-3.5-flash-lite` with `gemini-embedding-001`.
- The numeric free-tier rate limits are shown only in the signed-in AI Studio
  rate-limit page.
- On the unpaid tier, content may be used to improve Google's products and read
  by human reviewers. On the paid tier it is not.
- Bangladesh is an available region.
- The free Atlas tier allows three search or vector indexes in all, so vectors
  are compared in memory.
