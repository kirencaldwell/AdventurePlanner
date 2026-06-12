export type StatusId = 'fully-packed' | 'set-aside' | 'not-packed' | 'not-bringing' | 'in-car' | string;

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

export interface Trip {
  id: string;
  name: string;
  people: Person[];
  categories: Category[];
  lastModified: number;
}
