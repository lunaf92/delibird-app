/**
 * The first web link in shared text, which often wraps it: "Look at this! https://shop.example/x". Some apps
 * leave out the https:// ("amzn.eu/d/abc"); those get it added.
 */
export function firstLink(text: string | undefined): string | null {
  if (!text) return null;
  const full = text.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (full) return full;
  const bare = text.match(/(?:^|[\s(])((?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"']*)/i)?.[1];
  return bare ? `https://${bare}` : null;
}

// Path parts that are about the shop's site, not the product: languages, countries and route words.
const ROUTE_WORDS = new Set([
  'p',
  'd',
  'm',
  'dp',
  'gp',
  'itm',
  'item',
  'items',
  'product',
  'products',
  'prod',
  'shop',
  'store',
  'catalog',
  'catalogue',
  'collections',
  'category',
  'categories',
  'c',
  'en',
  'gb',
  'uk',
  'us',
  'eu',
  'it',
  'es',
  'de',
  'fr',
  'en_gb',
  'en-gb',
  'en_us',
  'en-us',
  'it_it',
  'it-it',
  'es_es',
  'es-es',
  'www',
  'html',
  'index',
]);

/** A word that's a product code or number rather than part of the name, such as 00324518 or CI1238. */
function isCode(word: string): boolean {
  return /^\d+$/.test(word) || (/\d/.test(word) && /^[a-z0-9]+$/i.test(word) && word.length >= 4);
}

/**
 * Guesses an item name from a shop link's own path, for when the page itself can't be read. IKEA's
 * /p/kallax-shelving-unit-white-stained-oak-effect-00324518/ becomes "Kallax shelving unit white stained oak
 * effect". Returns null when no part of the path reads like a name (two words or more).
 */
export function nameFromLink(link: string): string | null {
  let path: string;
  try {
    path = new URL(link).pathname;
  } catch {
    return null;
  }
  let best: string[] = [];
  for (const part of path.split('/')) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      decoded = part;
    }
    if (ROUTE_WORDS.has(decoded.toLowerCase())) continue;
    const words = decoded
      .replace(/\.(html?|aspx?|php|jsp)$/i, '')
      .split(/[-_+\s]+/)
      .filter((word) => word && !isCode(word));
    if (words.filter((word) => /\p{L}/u.test(word)).length >= 2 && words.length > best.length) best = words;
  }
  if (best.length === 0) return null;
  let name = best.join(' ');
  // Slugs are often all lower case; then only the first letter is made a capital.
  if (name === name.toLowerCase()) name = name.charAt(0).toUpperCase() + name.slice(1);
  return name.slice(0, 200);
}

// Words apps put before the product in shared text: "Check this out at Amazon", "Guarda questo su eBay",
// "Mira esto en Etsy". The shop's name, if given, is taken as the single word after at/on/su/en.
const LEAD_IN = new RegExp(
  '^(?:' +
    [
      'check (?:this|it) out',
      'check out this (?:item|product|deal|listing)',
      'check out',
      'look (?:at )?(?:this|what i found)',
      'have a look(?: at this)?',
      'i found this',
      'i (?:want|would like) this',
      'guarda(?: questo| cosa ho trovato)?(?: prodotto| articolo)?',
      "dai un'occhiata(?: a questo)?(?: prodotto| articolo)?",
      'mira(?: esto| lo que encontré)?(?: producto| artículo)?',
      'echa un vistazo(?: a esto)?(?: producto| artículo)?',
    ].join('|') +
    ')(?:\\s+(?:at|on|from|in|su|da|in|en|de)\\s+\\S+)?\\s*[:!.,\\-–—]*\\s*',
  'iu',
);

/**
 * Guesses an item name from the text a shop's app shares along with the link, such as Amazon's "Check this out
 * at Amazon DIVCHI 10L Potting Soil… https://amzn.eu/d/…". Works for any shop: it drops the link, a lead-in
 * like "Check this out at …", a short "Shop:" in front and a short "| Shop" behind, and keeps the longest line
 * left. Returns null when nothing that reads like a name is left.
 */
export function nameFromSharedText(text: string | null | undefined): string | null {
  if (!text) return null;
  const withoutLinks = text
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/(?:^|[\s(])(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"']*/gi, ' ');
  let best = '';
  for (const raw of withoutLinks.split(/\r?\n/)) {
    let line = raw.replace(/\s+/g, ' ').trim().replace(LEAD_IN, '');
    // "Amazon.co.uk: Wool scarf": a short shop name and a colon in front.
    line = line.replace(/^[^:]{1,30}:\s+(?=\S.{3,})/u, (lead) =>
      lead.trim().split(' ').length <= 3 ? '' : lead,
    );
    // "Wool scarf | John Lewis" or "Wool scarf - Etsy UK": a short shop name behind.
    line = line.replace(/\s+[|•·–—-]\s+[^|•·–—-]{1,30}$/u, (tail) =>
      tail.trim().split(' ').length <= 4 ? '' : tail,
    );
    line = line.replace(/^["'“”‘’«»\s]+|["'“”‘’«»\s:,;.!\-–—|]+$/gu, '').trim();
    if (line.length > best.length) best = line;
  }
  // A name has letters, and more than a stray word or two of them.
  if ((best.match(/\p{L}/gu) ?? []).length < 3) return null;
  return best.slice(0, 200);
}
