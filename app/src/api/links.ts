/** The first web link in shared text, which often wraps it: "Look at this! https://shop.example/x". */
export function firstLink(text: string | undefined): string | null {
  return text?.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? null;
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
