import { nameFromLink } from '@/api/links';

test.each([
  [
    'https://www.ikea.com/gb/en/p/kallax-shelving-unit-white-stained-oak-effect-00324518/',
    'Kallax shelving unit white stained oak effect',
  ],
  [
    'https://www.lecreuset.co.uk/en_GB/p/cast-iron-pumpkin-casserole/CI1238.html?dwvar_CI1238_color=volcanic&dwvar_CI1238_size=24cm-l3-7',
    'Cast iron pumpkin casserole',
  ],
  [
    'https://www.amazon.co.uk/Le-Creuset-Signature-Round-Casserole/dp/B00A2HD40E?ref=cm_sw_r_cp_ud_dp',
    'Le Creuset Signature Round Casserole',
  ],
  ['https://www.ebay.co.uk/itm/Vintage-Brass-Desk-Lamp/196872268915', 'Vintage Brass Desk Lamp'],
  ['https://shop.example.com/products/wool_scarf+forest%20green', 'Wool scarf forest green'],
  ['https://www.example.com/catalogue/red-wool-scarf.html', 'Red wool scarf'],
])('%s suggests "%s"', (link, name) => {
  expect(nameFromLink(link)).toBe(name);
});

test.each([
  'https://ebay.io/m/wYOGiR', // A short link: only a code.
  'https://amzn.eu/d/0386v2Tm',
  'https://www.ebay.co.uk/itm/196872268915?mkevt=1',
  'https://www.amazon.co.uk/dp/B00A2HD40E',
  'https://shop.example.com/',
  'https://shop.example.com/products/scarf', // One word is too little to go on.
  'https://shop.example.com/en-gb/p/12345',
  'not a link',
])('%s has no usable name', (link) => {
  expect(nameFromLink(link)).toBeNull();
});
