import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Einkaufsliste, Einkaufseintrag } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [einkaufsliste, setEinkaufsliste] = useState<Einkaufsliste[]>([]);
  const [einkaufseintrag, setEinkaufseintrag] = useState<Einkaufseintrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [einkaufslisteData, einkaufseintragData] = await Promise.all([
        LivingAppsService.getEinkaufsliste(),
        LivingAppsService.getEinkaufseintrag(),
      ]);
      setEinkaufsliste(einkaufslisteData);
      setEinkaufseintrag(einkaufseintragData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [einkaufslisteData, einkaufseintragData] = await Promise.all([
          LivingAppsService.getEinkaufsliste(),
          LivingAppsService.getEinkaufseintrag(),
        ]);
        setEinkaufsliste(einkaufslisteData);
        setEinkaufseintrag(einkaufseintragData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const einkaufslisteMap = useMemo(() => {
    const m = new Map<string, Einkaufsliste>();
    einkaufsliste.forEach(r => m.set(r.record_id, r));
    return m;
  }, [einkaufsliste]);

  return { einkaufsliste, setEinkaufsliste, einkaufseintrag, setEinkaufseintrag, loading, error, fetchAll, einkaufslisteMap };
}