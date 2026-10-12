import { nameFromSharedText } from '@/api/links';

test.each([
  [
    'Check this out at Amazon DIVCHI 10L Potting Soil Multi-Purpose Compost https://amzn.eu/d/abc123',
    'DIVCHI 10L Potting Soil Multi-Purpose Compost',
  ],
  ['Amazon.co.uk: Wool scarf amzn.eu/d/abc123', 'Wool scarf'],
  [
    'Check out this item on eBay! Vintage Leica M3 camera body\nhttps://ebay.us/m/xyz',
    'Vintage Leica M3 camera body',
  ],
  ['Guarda questo su Amazon Tazza in ceramica blu https://amzn.eu/d/x', 'Tazza in ceramica blu'],
  [
    'Mira esto en Etsy: Pendientes de plata hechos a mano https://etsy.me/abc',
    'Pendientes de plata hechos a mano',
  ],
  [
    'Le Creuset Signature Casserole 24cm | John Lewis https://www.johnlewis.com/p/123',
    'Le Creuset Signature Casserole 24cm',
  ],
  ['"Kallax shelving unit" https://www.ikea.com/gb/en/p/kallax-00324518/', 'Kallax shelving unit'],
])('reads the name in shared text: %s', (text, name) => {
  expect(nameFromSharedText(text)).toBe(name);
});

test.each([
  ['https://shop.example.com/scarf'],
  ['amzn.eu/d/abc123'],
  ['Check this out at Amazon https://amzn.eu/d/abc123'],
  [''],
  [null],
])('finds no name when only a link or a lead-in was shared: %s', (text) => {
  expect(nameFromSharedText(text)).toBeNull();
});
