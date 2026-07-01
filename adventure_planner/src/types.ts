export type StatusId = 'fully-packed' | 'set-aside' | 'not-packed' | 'not-bringing' | 'in-car' | 'needs-charging' | 'need-to-buy' | string;

export interface Status {
  id: StatusId;
  label: string;
  color: string;
}

export interface Person {
  id: string;
  name: string;
}

export interface Item {
  id: string;
  name: string;
  personStatuses: Record<string, StatusId>; // personId -> statusId
}

export interface Category {
  id: string;
  name: string;
  items: Item[];
}

export interface TripActivity {
  id: string;
  type: 'hiking' | 'ski-touring' | 'custom';
  description: string;
  importance: 'mandatory' | 'optional';
  miles: string;
  elevationGain: string;
  elevationLost: string;
}

export interface TripDay {
  id: string;
  location: string;
  description?: string;
  notes?: string;
  weatherLinks?: string;
  activities?: TripActivity[];
}

import type { WeatherRow } from './weatherUtils';

export interface Trip {
  id: string;
  name: string;
  people: Person[];
  categories: Category[];
  startDate?: string;
  days?: TripDay[];
  caltopoUrl?: string;
  photosUrl?: string;
  weatherStatus?: 'Good' | 'Mild' | 'Bad' | 'Pending' | 'Too Far in the Future';
  weatherData?: Record<number, WeatherRow>; // dayIndex -> WeatherRow
  lastWeatherUpdate?: number; // timestamp
  debriefDiscussions?: string[];
  userId?: string;
  sharedWith?: string[];
  lastModified: number;
}
