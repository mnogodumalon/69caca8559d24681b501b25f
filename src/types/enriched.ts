import type { Einkaufseintrag } from './app';

export type EnrichedEinkaufseintrag = Einkaufseintrag & {
  einkaufsliste_refName: string;
};
