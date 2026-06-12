import type { Status } from './types';

export const DEFAULT_STATUSES: Status[] = [
  { id: 'not-packed', label: 'Not Packed', color: '#ff4d4d' },
  { id: 'set-aside', label: 'Set Aside', color: '#ffa500' },
  { id: 'fully-packed', label: 'Fully Packed', color: '#4caf50' },
  { id: 'in-car', label: 'In Car', color: '#2196f3' },
  { id: 'not-bringing', label: 'Not Bringing', color: '#9e9e9e' },
];

export const INITIAL_CATEGORIES = [
  'Basic Gear',
  'Clothes',
  'Camping/Personal',
  'Food',
  'Car',
  'Technical',
];
