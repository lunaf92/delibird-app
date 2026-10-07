export const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF'] as const;

/** "€39.90" in English, "39,90 €" in Italian; falls back to "39.90 EUR" for codes the device doesn't know. */
export function formatPrice(price: string | null, currency: string, language: string): string | null {
  if (price === null || price === '') return null;
  const amount = Number(price);
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency }).format(amount);
  } catch {
    return `${price} ${currency}`;
  }
}

/** Accepts "39.9", "39,90" or "1 299,00" and returns "39.90"-style text for the API, or null if not a price. */
export function parsePrice(text: string): string | null {
  const cleaned = text.replace(/[\s']/g, '').replace(',', '.');
  if (!/^\d{1,8}(\.\d{0,2})?$/.test(cleaned)) return null;
  return Number(cleaned).toFixed(2);
}
