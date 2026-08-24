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

export interface GearClosetItem {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  weight?: number | string;
  weightUnit?: 'oz' | 'g' | 'lb' | 'kg' | string;
  category?: string;
  lastModified?: number;
}

export interface Item {
  id: string;
  name: string;
  description?: string;
  weight?: number | string;
  weightUnit?: 'oz' | 'g' | 'lb' | 'kg' | string;
  gearClosetItemId?: string;
  personStatuses: Record<string, StatusId>; // personId -> statusId
  isGroupGear?: boolean;
  broughtByPersonId?: string;
  carriedByPersonId?: string;
  forPersonIds?: string[];
  quantity?: number;
  personQuantities?: Record<string, number>; // personId -> quantity
  personCarriedBy?: Record<string, string>; // personId -> carrierPersonId (who physically carries this item for that person)
  personGearItems?: Record<string, {
    name: string;
    description?: string;
    weight?: number | string;
    weightUnit?: 'oz' | 'g' | 'lb' | 'kg' | string;
    gearClosetItemId?: string;
    weightType?: 'base' | 'worn' | 'food';
  }>; // personId -> individual gear details
}


export interface Category {
  id: string;
  name: string;
  items: Item[];
  isPermanent?: boolean;
}

export interface TripActivity {
  id: string;
  type: 'hiking' | 'ski-touring' | 'custom' | string;
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
  debriefStravaEmbeds?: string[];
  userId?: string;
  sharedWith?: string[];
  lastModified: number;
}
