// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export interface Einkaufsliste {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    listenname?: string;
    beschreibung?: string;
  };
}

export interface Einkaufseintrag {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    einkaufsliste_ref?: string; // applookup -> URL zu 'Einkaufsliste' Record
    artikelname?: string;
    zugeordneter_benutzer?: LookupValue;
    erledigt?: boolean;
  };
}

export const APP_IDS = {
  EINKAUFSLISTE: '69caca76b0f958e053b192af',
  EINKAUFSEINTRAG: '69caca7a52f3cb44f17d2e82',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'einkaufseintrag': {
    zugeordneter_benutzer: [{ key: "akm", label: "AKM" }, { key: "benutzer_2", label: "Benutzer 2" }, { key: "benutzer_3", label: "Benutzer 3" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'einkaufsliste': {
    'listenname': 'string/text',
    'beschreibung': 'string/textarea',
  },
  'einkaufseintrag': {
    'einkaufsliste_ref': 'applookup/select',
    'artikelname': 'string/text',
    'zugeordneter_benutzer': 'lookup/select',
    'erledigt': 'bool',
  },
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateEinkaufsliste = StripLookup<Einkaufsliste['fields']>;
export type CreateEinkaufseintrag = StripLookup<Einkaufseintrag['fields']>;