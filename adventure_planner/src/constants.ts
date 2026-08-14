import type { Status } from './types';

export const DEFAULT_STATUSES: Status[] = [
  { id: 'not-packed', label: 'Not Packed', color: '#ff4d4d' },
  { id: 'set-aside', label: 'Set Aside', color: '#ffa500' },
  { id: 'fully-packed', label: 'Fully Packed', color: '#4caf50' },
  { id: 'in-car', label: 'In Car', color: '#2196f3' },
  { id: 'not-bringing', label: 'Not Bringing', color: '#9e9e9e' },
  { id: 'needs-charging', label: 'Needs charging', color: '#8e44ad' },
  { id: 'need-to-buy', label: 'Need to buy', color: '#f39c12' },
];

export const GROUP_GEAR_CATEGORY_NAME = 'Group Gear';

export const INITIAL_CATEGORIES = [
  'Basic Gear',
  'Clothes',
  'Camping/Personal',
  'Food',
  'Car',
  'Technical',
];

export const GEAR_CLOSET_CATEGORIES = [
  'Shelter',
  'Sleep System',
  'Pack & Bags',
  'Cooking & Kitchen',
  'Hydration & Water',
  'Clothing',
  'Footwear',
  'Navigation & Electronics',
  'Tools & Repair',
  'First Aid & Hygiene',
  'Personal & Misc',
];

export const SAMPLE_GEAR_CLOSET_ITEMS = [
  { name: 'Ultralight 2P Tent', category: 'Shelter', weight: 38, weightUnit: 'oz', description: 'Freestanding 2-person tent with rainfly & stakes' },
  { name: '20°F Down Sleeping Bag', category: 'Sleep System', weight: 26, weightUnit: 'oz', description: '850 fill power down with compression sack' },
  { name: 'Insulated Sleeping Pad', category: 'Sleep System', weight: 16, weightUnit: 'oz', description: 'R-value 4.2 inflatable pad' },
  { name: '50L Ultralight Backpack', category: 'Pack & Bags', weight: 32, weightUnit: 'oz', description: 'Framed pack with hipbelt pockets' },
  { name: 'Canister Stove System', category: 'Cooking & Kitchen', weight: 7.5, weightUnit: 'oz', description: 'Compact backpacking stove + 750ml titanium pot' },
  { name: 'Squeeze Water Filter', category: 'Hydration & Water', weight: 3, weightUnit: 'oz', description: 'Hollow fiber membrane filter with pouch' },
  { name: 'Rechargeable Headlamp', category: 'Navigation & Electronics', weight: 2.8, weightUnit: 'oz', description: '400 lumens USB-C rechargeable with red light' },
  { name: 'Carbon Trekking Poles (Pair)', category: 'Tools & Repair', weight: 14, weightUnit: 'oz', description: 'Adjustable flip-lock carbon fiber poles' },
  { name: 'Ultralight Rain Jacket', category: 'Clothing', weight: 6.5, weightUnit: 'oz', description: '3-layer waterproof breathable shell' },
];
