import type { EnrichedEinkaufseintrag } from '@/types/enriched';
import type { Einkaufseintrag, Einkaufsliste } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface EinkaufseintragMaps {
  einkaufslisteMap: Map<string, Einkaufsliste>;
}

export function enrichEinkaufseintrag(
  einkaufseintrag: Einkaufseintrag[],
  maps: EinkaufseintragMaps
): EnrichedEinkaufseintrag[] {
  return einkaufseintrag.map(r => ({
    ...r,
    einkaufsliste_refName: resolveDisplay(r.fields.einkaufsliste_ref, maps.einkaufslisteMap, 'listenname'),
  }));
}
