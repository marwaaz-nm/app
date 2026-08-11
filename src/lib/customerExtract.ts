import 'server-only';

// Best-effort extraction of a person's details (name, mother's name, birth year, ID
// number, phone) from the free-text of a notary Word document, anchored around wherever
// the search query (a phone number, ID number, or name) appears. These documents are
// hand-typed Somali text with inconsistent spacing and phrasing, so this is heuristic,
// not a guaranteed parser — it covers the formats observed across real Marwaaz documents.

export type CustomerRecord = {
  name: string | null;
  motherName: string | null;
  birthYear: string | null;
  idNumber: string | null;
  phones: string[];
};

const WINDOW_BEFORE = 480;
const WINDOW_AFTER = 120;

type TextMatch = { index: number; length: number };

function findLiteralOccurrences(text: string, needle: string): TextMatch[] {
  const results: TextMatch[] = [];
  if (!needle) return results;
  const lower = text.toLowerCase();
  const needleLower = needle.toLowerCase();
  let start = 0;
  while (true) {
    const i = lower.indexOf(needleLower, start);
    if (i === -1) break;
    results.push({ index: i, length: needle.length });
    start = i + needle.length;
  }
  return results;
}

// Phone/ID queries are often typed with different spacing in the source document
// ("0615 404 230" vs "0615404230"); this matches the digits in order allowing optional
// whitespace/dashes between each one.
function findFlexibleNumberOccurrences(text: string, query: string): TextMatch[] {
  const digits = query.replace(/\D/g, '');
  if (digits.length < 6) return [];
  const pattern = new RegExp(digits.split('').join('[\\s-]*'), 'g');
  const results: TextMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) results.push({ index: m.index, length: m[0].length });
  return results;
}

function dedupeClose(matches: TextMatch[]): TextMatch[] {
  const sorted = [...matches].sort((a, b) => a.index - b.index);
  const out: TextMatch[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && m.index - (last.index + last.length) < 15) continue;
    out.push(m);
  }
  return out;
}

// An ID like "P00905006" has a numeric tail ("00905006") that also happens to look like a
// phone number, so it would otherwise get listed a second time as a separate phone.
// idNumberDigits (the ID with any letter prefix stripped) excludes an exact-digit-match
// duplicate of it from the phone list.
function extractPhones(text: string, idNumberDigits: string | null): string[] {
  const re = /(\+?\d[\d\s-]{6,14}\d)/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 13 && digits !== idNumberDigits) found.add(m[1].trim());
  }
  return Array.from(found);
}

// Tolerates a single stray space inside the 4-digit year (a common typing artifact in
// these documents, e.g. "19 87") and the year running directly into "kii" with no space
// ("1989kii") — a trailing \b would fail there since a digit followed by a letter isn't a
// word boundary; (?!\d) only guards against matching into a longer digit run instead.
function extractYear(text: string): string | null {
  const re = /\b(19|20)\s?([0-9])\s?([0-9])(?!\d)/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) last = m[1] + m[2] + m[3];
  return last;
}

function extractIdNumber(text: string): string | null {
  // "Somali"/"Somalia" before "passport" is common but not required — some documents
  // just write "passport" on its own.
  const re = /((?:somalia?\s*)?passport|kaar\s*ka?\s*aqoonsi|aqoonsi)\D{0,20}?([A-Z]{0,4}[:\-]?\s?\d{4,12})/i;
  const m = text.match(re);
  return m ? m[2].replace(/\s+/g, '') : null;
}

// Tolerates a single stray space inside a capitalized word (a common typing artifact,
// e.g. "Ina H awo Abukar" for "Ina Hawo Abukar") by letting the word's tail optionally
// continue after one space. Kept to a single split here (used for mother/witness-list
// names too) because a more permissive version risks swallowing a genuine following word
// ("Adan ku dhashay Muqdisho" instead of stopping at "Adan") when there's no second stray
// space to justify it — see NAME_TOKEN_LOOSE below for the rarer double-split case.
//
// The letter run before the optional space-fragment is a single greedy `*`, not a
// `{0,N}` immediately followed by another `*` over the same character class — two
// adjacent quantifiers over the same class both matching the same run of letters is a
// classic ReDoS shape (there are N ways to split a run of N letters between them). Long
// unrelated capitalized runs are common in these documents (signature blocks, witness
// numbering) and a failed match against one used to make the engine explore every split
// before giving up, occasionally hanging the whole request for minutes.
const NAME_TOKEN = `(?:[A-Z][A-Za-z'’.\\/]*(?:\\s[A-Za-z'’.\\/]+)?|\\([A-Z][A-Za-z'’.\\/]*\\))`;
// Same shape, but the leading letter can be any case — used as a fallback for the rarer
// documents that type the party's own name entirely in lowercase.
const NAME_TOKEN_ANY_CASE = `(?:[A-Za-z][A-Za-z'’.\\/]*(?:\\s[A-Za-z'’.\\/]+)?|\\([A-Za-z][A-Za-z'’.\\/]*\\))`;
// A word split into three fragments by two separate stray spaces ("Ba r re" for "Barre")
// has been observed in real documents. Only used as an extractName fallback — never for
// mother/witness names — and only when the safer NAME_TOKEN match looks truncated, since
// it's loose enough to swallow a genuine following word if used unconditionally. Same
// ReDoS fix as NAME_TOKEN: one greedy run per fragment, and the space before each extra
// fragment is mandatory (not `\s?`) so two adjacent letter-only fragments can't parse as
// either "one run" or "two runs with a zero-width gap" — another source of the same
// ambiguity.
const NAME_TOKEN_LOOSE = `(?:[A-Z][A-Za-z'’.\\/]*(?:\\s[A-Za-z'’.\\/]+){0,2}|\\([A-Z][A-Za-z'’.\\/]*\\))`;

// Builds a regex that matches `word` even if stray spaces have been typed between its
// letters (e.g. source text "MARKHAATIYAA sh A" for "MARKHAATIYAASHA") — the same typing
// artifact seen elsewhere in these documents, here breaking up section-header keywords.
function fuzzyKeyword(word: string): string {
  return word.split('').join('\\s*');
}

function boundaryRegex(): RegExp {
  // "damiinul maal" (guarantor) is sometimes typed with a stray space in the middle of
  // the word (including right after the initial "D", e.g. "D amiinulmaal"), same as other
  // artifacts handled elsewhere. The connector before it is usually "oo" ("... oo uu
  // damiinulmaal ka yahay ...") but "in" ("... in uu damiinulmaal ka yahay ...") has also
  // been seen, so both are accepted.
  // "in <noun> kaan/kaas uu/ay leeyahay/leedahay" ("which this <plot/house/...> belongs
  // to") is another connector phrase introducing the owner's name, seen right before it
  // with no other punctuation separating the two.
  return /(?:\biyo\b|Dhinaca\s+(?:koowaad|labaad)\s*\([^)]{0,30}\)|\(\s*\d+\s*\)|\b\d+\.\s|kana\s+wakiil\s+ah|oo\s+uu\s+wakiil\s+ka\s*y\s*ahay|wuxuu\s+wakiil\s+u\s+yahay|(?:oo|in)\s+u{1,2}\s+d\s*amiinul\s?maal\s+ka\s*y\s*ah\s*ay?|(?:oo|in)\s+ay\s+d\s*amiinul\s?maal\s+ka\s*y\s*ih\s*iin|\bin\s+\S+\s+ka[ai]n\s+(?:u{1,2}|ay)\s+lee[yd]ahay)/gi;
}

// Chained sentences ("... iyo Person B ina Mother B dhashay ...") describe multiple
// people in one clause; these mark where the previous person's mention ends and the
// next begins, so a match anchored near Person B doesn't pick up Person A's details.
function cutAtLastBoundary(text: string): string {
  let cut = 0;
  let m: RegExpExecArray | null;
  const re = boundaryRegex();
  while ((m = re.exec(text))) cut = m.index + m[0].length;
  return text.slice(cut);
}

function cutAtFirstBoundary(text: string): string {
  const m = boundaryRegex().exec(text);
  return m ? text.slice(0, m.index) : text;
}

function findMother(clausePrefix: string, token: string, maxExtra: number): { text: string; index: number } | null {
  // Find the LAST "Ina X" in the window, not the first — a wide window can contain an
  // unrelated earlier person's "Ina mother" mention (e.g. a witness list preceded by a
  // completely different party's ownership clause), and the one closest to the actual
  // match is the relevant one.
  //
  // The "a" in "Ina" is required (not "na?"/optional) — making it optional meant this
  // also matched the ordinary Somali conjunction "in" ("that/which"), which appears
  // constantly in legal prose ("... in uu damiinulmaal ka yahay ...", "waxaan rabaa in
  // ...") and was winning as the "last match" over the real "Ina <mother>" earlier in the
  // same clause, corrupting the captured mother name with unrelated sentence fragments.
  const re = new RegExp(`\\b[Ii]\\s*na\\b\\s+(${token}(?:\\s+${token}){0,${maxExtra}})`, 'g');
  let m: RegExpExecArray | null = null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(clausePrefix))) last = m;
  if (!last) return null;
  m = last;
  let words = m[1].trim().split(/\s+/);
  const endIndex = m.index + m[0].length;
  const tail = clausePrefix.slice(endIndex, endIndex + 12);
  // Drop a trailing "Dha"/"Dh" fragment that's actually the start of "dhashay"/"dhalatay"
  // split off by a stray space (e.g. "Ina Faaduma Sheekh Mahamud Dha shay").
  if (/^\s*(shay|latay|lay|hay)/i.test(tail) && /^dha?$/i.test(words[words.length - 1])) {
    words = words.slice(0, -1);
  }
  // "ku" (a preposition, "at/in") is never part of a name and reliably starts the
  // following birth clause ("... Ahmed ku dhashay Muqdisho ..."). The capture above is
  // deliberately generous (allows several extra words, needed to bridge names broken
  // across multiple stray spaces), so on a lowercase-typed mother name it can otherwise
  // keep matching straight through "ku dhashay ..." since those words fit the same
  // any-case token shape as a name would.
  const kuIndex = words.findIndex((w) => /^ku$/i.test(w));
  if (kuIndex > 0) words = words.slice(0, kuIndex);
  return { text: words.join(' '), index: m.index };
}

function extractMother(clausePrefix: string): { text: string; index: number } | null {
  // Some documents type the mother's name entirely in lowercase (same inconsistency seen
  // in the party's own name elsewhere) — without this fallback, a failed match here means
  // extractName has no boundary to stop at before "Ina" and ends up swallowing the whole
  // mother clause into the name.
  return findMother(clausePrefix, NAME_TOKEN, 4) ?? findMother(clausePrefix, NAME_TOKEN_ANY_CASE, 4);
}

function extractName(clausePrefix: string, motherIndex: number | null): string | null {
  let prefixEnd = motherIndex;
  // Whether a real anchor (an "Ina <mother>" clause, or a "dhashay/dhalatay" birth
  // clause) was found nearby — as opposed to this being an incidental phone number in a
  // signature block or unrelated sentence with no actual person-description clause
  // around it (e.g. an engineer's or witness's number). Only ever attempted the lenient,
  // case-insensitive fallback below when there's a genuine anchor: without one, that
  // fallback has nothing reliable to stop at and ends up capturing arbitrary prose.
  let hasAnchor = prefixEnd != null;
  if (prefixEnd == null) {
    // Same reasoning as extractMother: prefer the LAST "dhashay"/"dhalatay" in the
    // window, closest to the match, over an unrelated earlier person's.
    const dashRe = /dh\s*a\s*(?:shay|latay)/gi;
    let dm: RegExpExecArray | null = null;
    let lastDm: RegExpExecArray | null = null;
    while ((dm = dashRe.exec(clausePrefix))) lastDm = dm;
    if (lastDm) { prefixEnd = lastDm.index; hasAnchor = true; }
    else prefixEnd = clausePrefix.length;
  }
  const rawSlice = clausePrefix.slice(0, prefixEnd);

  // A capitalized run can only be the current name (unrelated prose wouldn't happen to
  // start with a capital letter right before "Ina"), so stripping punctuation first is
  // safe here.
  const cleaned = rawSlice.replace(/Anigoo\s+ah/gi, ' ').replace(/[:.,]/g, ' ').trim();
  const strict = cleaned.match(new RegExp(`(${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,5})\\s*$`));
  // A single stray space inside a word can still leave the engine unable to bridge back
  // to the start of the name (e.g. a word broken into three pieces by two stray spaces),
  // so it settles for matching just the last word alone. Also try the looser token and
  // keep whichever capture is longer — for ordinarily-formatted names both agree, so this
  // never overrides a correct short match with something worse.
  const loose = cleaned.match(new RegExp(`(${NAME_TOKEN_LOOSE}(?:\\s+${NAME_TOKEN_LOOSE}){0,5})\\s*$`));
  const best = [strict, loose].filter((m): m is RegExpMatchArray => m !== null).sort((a, b) => b[1].length - a[1].length)[0];
  const candidate = best ? best[1].trim() : null;
  const candidateWordCount = candidate ? candidate.split(/\s+/).length : 0;

  // Some documents type only PART of the party's own name in lowercase (e.g. "c/salaam
  // xasan Bilow" — capitalized only on the last word), which leaves the uppercase-only
  // strict/loose patterns able to match just that trailing word. A single-word result is
  // never a real name in these documents, so it's worth also trying the fully
  // case-insensitive pattern and preferring it if it's actually longer. This is only
  // attempted when the strict/loose result already looks truncated (<=1 word) — otherwise
  // a normal, correctly-capitalized name is left alone, since the lenient pattern is more
  // prone to swallowing unrelated preceding lowercase prose ("waxaa ii yimid Iidow
  // Sheikh...") that the uppercase anchor would have correctly excluded.
  if (candidateWordCount > 1) return candidate;

  // No "Ina <mother>" or "dhashay" clause anywhere nearby means this almost certainly
  // isn't a person-description clause at all (e.g. an engineer's or witness's phone
  // number in a signature block) — the lenient fallback has no real anchor to work from
  // in that case, so it's better to report no name than to guess at surrounding prose.
  if (!hasAnchor) return candidate;

  // Without a capital letter to anchor on, a lenient case-insensitive match would
  // otherwise run backward into the previous sentence's lowercase prose ("... sawirkiisuna
  // warqadan ku dhegan yahay . mohamed ahmed..."), so it's scoped to text after the last
  // sentence boundary first. "(xafiiska) (ii) (gu) yimid" ("came to (my office)") is
  // another such boundary — the standard phrase introducing a party's name right after
  // it — needed because these office-boilerplate sentences often have no punctuation of
  // their own before the name.
  const yimidMatches = [...rawSlice.matchAll(/y\s*imid\b/gi)];
  const lastYimid = yimidMatches[yimidMatches.length - 1];
  const lastStop = Math.max(
    rawSlice.lastIndexOf('.'),
    rawSlice.lastIndexOf(';'),
    rawSlice.lastIndexOf(':'),
    lastYimid ? lastYimid.index + lastYimid[0].length - 1 : -1,
  );
  const lenientSlice = (lastStop === -1 ? rawSlice : rawSlice.slice(lastStop + 1))
    .replace(/Anigoo\s+ah/gi, ' ').replace(/,/g, ' ').trim();
  const lenient = lenientSlice.match(new RegExp(`(${NAME_TOKEN_ANY_CASE}(?:\\s+${NAME_TOKEN_ANY_CASE}){1,5})\\s*$`));
  if (!lenient) return candidate;
  const lenientText = lenient[1].trim();
  return lenientText.split(/\s+/).length > candidateWordCount ? lenientText : candidate;
}

// Witnesses and guarantors are laid out as two separate numbered lists — all the names
// first, then all the phone numbers below them in the same order — rather than each
// name being followed directly by its own phone. Pairing them by list position handles
// this layout, scoped to the "markhaatiyaasha"/"damiinulmaalada" section containing the
// match so an unrelated numbered list elsewhere in the document isn't mixed in.
const SECTION_START_RE = new RegExp(
  `(${fuzzyKeyword('markhaatiyaasha')}|${fuzzyKeyword('markhaatida')}|${fuzzyKeyword('damiinulmaalada')})`,
  'i',
);
const SECTION_STOP_RE = new RegExp(
  `(${fuzzyKeyword('sugitaanka')}\\s+${fuzzyKeyword('nootaayaha')}|${fuzzyKeyword('saxiixa')}\\s+${fuzzyKeyword('nootaayaha')})`,
  'i',
);
const SECTION_MAX_LENGTH = 2000;

function findNameFromNumberedList(fullText: string, matchIndex: number): string | null {
  let sectionStart = -1;
  const startRe = new RegExp(SECTION_START_RE.source, 'gi');
  let sm: RegExpExecArray | null;
  while ((sm = startRe.exec(fullText))) {
    if (sm.index >= matchIndex) break;
    const candidateStart = sm.index + sm[0].length;
    // "markhaatida"/"damiinulmaalada" also show up in ordinary prose that isn't
    // introducing a list at all (e.g. "...booska iyo markhaatida la socda...", "and the
    // witnesses accompanying him") — only treat it as a real list header when a numbered
    // entry actually follows shortly after.
    if (/\d+\s*\.\s*[A-Z]/.test(fullText.slice(candidateStart, candidateStart + 80))) sectionStart = candidateStart;
  }
  if (sectionStart === -1) return null;

  let sectionEnd = Math.min(fullText.length, sectionStart + SECTION_MAX_LENGTH);
  const stopMatch = SECTION_STOP_RE.exec(fullText.slice(sectionStart, sectionEnd));
  if (stopMatch) sectionEnd = sectionStart + stopMatch.index;
  if (matchIndex < sectionStart || matchIndex > sectionEnd) return null;

  const window = fullText.slice(sectionStart, sectionEnd);
  const localMatchIndex = matchIndex - sectionStart;

  // Tolerates a stray space before the period too ("3 ." for "3."), another instance of
  // the same typing artifact — without it, that entry is skipped entirely and every
  // later name in the list shifts out of alignment with its phone.
  const nameRe = new RegExp(`(\\d+)\\s*\\.\\s*(${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,4})`, 'g');
  const names: { index: number; number: number; text: string }[] = [];
  let nm: RegExpExecArray | null;
  while ((nm = nameRe.exec(window))) names.push({ index: nm.index, number: parseInt(nm[1], 10), text: nm[2].trim() });
  if (names.length === 0) return null;

  const phoneRe = /(\+?\d[\d\s-]{6,14}\d)/g;
  const phones: { index: number }[] = [];
  let pm: RegExpExecArray | null;
  while ((pm = phoneRe.exec(window))) {
    const digits = pm[1].replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 13) phones.push({ index: pm.index });
  }
  if (phones.length === 0) return null;

  // Word's native auto-numbering for the first list item is sometimes lost entirely when
  // the XML is stripped to plain text — no "1." at all, so the first visible label is
  // "2.". Recover that missing entry (only when exactly one is missing) by looking at the
  // name-like text between the section header and the first numbered entry.
  if (names[0].number === 2) {
    const gapMatch = window.slice(0, names[0].index).match(new RegExp(`(${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,4})\\s*$`));
    if (gapMatch) names.unshift({ index: 0, number: 1, text: gapMatch[1].trim() });
  }

  const ourPhoneIdx = phones.findIndex((p) => Math.abs(p.index - localMatchIndex) < 3);
  if (ourPhoneIdx === -1) return null;

  // Offsetting by how far the first captured number is from 1 keeps phone-list position
  // aligned with name-list position despite any still-missing leading entries.
  const offset = names[0].number - 1;
  const nameIdx = ourPhoneIdx - offset;
  if (nameIdx < 0 || nameIdx >= names.length) return null;

  return names[nameIdx].text;
}

function isEmptyRecord(r: CustomerRecord): boolean {
  return !r.name && !r.motherName && !r.birthYear && !r.idNumber && r.phones.length === 0;
}

// Finds the last real sentence-ending "."/";" in text, ignoring periods that are part of
// a short abbreviation like "lr.", "tel.", or "Dr." — the word right before the period is
// 3 letters or fewer, or the period is immediately followed by a digit (a labeled number
// like "tel. 0615...") — rather than an actual sentence break.
function findSentenceBoundary(text: string): number {
  let best = -1;
  const re = /[.;]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const wordBefore = text.slice(0, m.index).match(/([A-Za-z]+)\s*$/);
    const isShortWord = !wordBefore || wordBefore[1].length <= 3;
    const followedByDigit = /^\s*\d/.test(text.slice(m.index + 1, m.index + 3));
    if (isShortWord || followedByDigit) continue;

    // A period can also just be a normal full stop within describing the SAME person
    // (e.g. "...Degmada Baydhabo. wata passport lr...." continuing with more of their own
    // details) rather than the end of their whole description. Only trust it as a real
    // "next person starts here" boundary when it's preceded by the closing phrase these
    // documents actually use to end a full person block.
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    if (/dhegan\s*(?:yahay|tahay)/i.test(before)) best = m.index;
  }
  return best;
}

export function extractCustomerRecords(fullText: string, query: string): CustomerRecord[] {
  const literal = findLiteralOccurrences(fullText, query);
  const flexible = findFlexibleNumberOccurrences(fullText, query);
  const matches = dedupeClose([...literal, ...flexible]);

  const records = matches.map((match): CustomerRecord => {
    const winStart = Math.max(0, match.index - WINDOW_BEFORE);
    const winEnd = Math.min(fullText.length, match.index + match.length + WINDOW_AFTER);
    const rawPrefix = fullText.slice(winStart, match.index);
    const matchedText = fullText.slice(match.index, match.index + match.length);
    const rawAfter = fullText.slice(match.index + match.length, winEnd);

    const clausePrefix = cutAtLastBoundary(rawPrefix);
    const clauseAfter = cutAtFirstBoundary(rawAfter);

    // Witnesses/guarantors are checked FIRST, before ever attempting party-clause
    // extraction: a wide window can contain a completely unrelated earlier party's
    // "Ina mother ... dhashay year" clause (e.g. a witness list preceded by someone
    // else's ownership clause a few sentences earlier), which extractMother/extractName
    // would otherwise latch onto since witnesses have no "Ina"/"dhashay" grammar of
    // their own to anchor on.
    const listName = findNameFromNumberedList(fullText, match.index);

    let name: string | null;
    let motherName: string | null;
    let birthYear: string | null;
    let idNumber: string | null;
    let phones: string[];

    if (listName) {
      name = listName;
      motherName = null;
      birthYear = null;
      idNumber = null;
      // No per-person clause to scope a phone search to for a numbered list — only the
      // number that was actually searched for is attributed to this name.
      phones = [matchedText.trim()];
    } else {
      const mother = extractMother(clausePrefix);
      name = extractName(clausePrefix, mother ? mother.index : null);
      motherName = mother ? mother.text : null;

      // Some documents list several people back-to-back as separate sentences with no
      // boundary marker between them ("...leh tel. 061... . mohamed ahmed ibrahim Ina...
      // leh tel. 062..."), so extractPhones(clause) can pick up the *previous* person's
      // number too. Scoping the phone/year/ID search to start after the last sentence
      // break keeps it to this person's own sentence; falls back to the full clause
      // when there's no such break nearby (already scoped by cutAtLastBoundary).
      const sentenceStart = findSentenceBoundary(clausePrefix);
      const personClause = (sentenceStart === -1 ? clausePrefix : clausePrefix.slice(sentenceStart + 1)) + matchedText + clauseAfter;
      idNumber = extractIdNumber(personClause);
      const idNumberDigits = idNumber ? idNumber.replace(/\D/g, '') : null;
      phones = extractPhones(personClause, idNumberDigits);
      birthYear = extractYear(personClause);
    }

    return { name, motherName, birthYear, idNumber, phones };
  }).filter((r) => !isEmptyRecord(r));

  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.name}|${r.motherName}|${r.birthYear}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}
