import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { EinkaufslisteDialog } from '@/components/dialogs/EinkaufslisteDialog';
import { EinkaufseintragDialog } from '@/components/dialogs/EinkaufseintragDialog';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Einkaufsliste, Einkaufseintrag } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import { Button } from '@/components/ui/button';
import {
  IconShoppingCart,
  IconCircleCheck,
  IconPlus,
  IconList,
  IconUsers,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Liste auswählen' },
  { label: 'Einkauf durchführen' },
  { label: 'Abschluss' },
];

export default function EinkaufDurchfuehrenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { einkaufsliste, einkaufseintrag, loading, error, fetchAll } = useDashboardData();

  const initialStep = (() => {
    const urlStep = parseInt(searchParams.get('step') ?? '', 10);
    const urlListId = searchParams.get('listId');
    if (urlListId && urlStep >= 2) return urlStep;
    if (urlListId) return 2;
    return 1;
  })();

  const [currentStep, setCurrentStep] = useState(initialStep);
  const [selectedListId, setSelectedListId] = useState<string | null>(
    searchParams.get('listId')
  );
  const [listeDialogOpen, setListeDialogOpen] = useState(false);
  const [eintragDialogOpen, setEintragDialogOpen] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  // Sync listId to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (selectedListId) {
      params.set('listId', selectedListId);
    } else {
      params.delete('listId');
    }
    setSearchParams(params, { replace: true });
  }, [selectedListId, searchParams, setSearchParams]);

  const itemsForList = useMemo((): Einkaufseintrag[] => {
    if (!selectedListId) return [];
    return einkaufseintrag.filter(
      (e) => extractRecordId(e.fields.einkaufsliste_ref) === selectedListId
    );
  }, [einkaufseintrag, selectedListId]);

  const pendingItems = useMemo(
    () => itemsForList.filter((e) => !e.fields.erledigt),
    [itemsForList]
  );
  const completedItems = useMemo(
    () => itemsForList.filter((e) => e.fields.erledigt),
    [itemsForList]
  );

  const allDone = itemsForList.length > 0 && pendingItems.length === 0;

  const selectedList = useMemo(
    () => einkaufsliste.find((l) => l.record_id === selectedListId) ?? null,
    [einkaufsliste, selectedListId]
  );

  // Per-list stats for step 1
  const listStats = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    einkaufseintrag.forEach((e) => {
      const lid = extractRecordId(e.fields.einkaufsliste_ref);
      if (!lid) return;
      const cur = map.get(lid) ?? { total: 0, done: 0 };
      cur.total += 1;
      if (e.fields.erledigt) cur.done += 1;
      map.set(lid, cur);
    });
    return map;
  }, [einkaufseintrag]);

  const handleSelectList = useCallback(
    (id: string) => {
      setSelectedListId(id);
      setCurrentStep(2);
    },
    []
  );

  const handleToggleItem = useCallback(
    async (item: Einkaufseintrag) => {
      if (toggling.has(item.record_id)) return;
      setToggling((prev) => new Set(prev).add(item.record_id));
      try {
        await LivingAppsService.updateEinkaufseintragEntry(item.record_id, {
          erledigt: !item.fields.erledigt,
        });
        await fetchAll();
      } finally {
        setToggling((prev) => {
          const next = new Set(prev);
          next.delete(item.record_id);
          return next;
        });
      }
    },
    [toggling, fetchAll]
  );

  const handleResetToStep1 = useCallback(() => {
    setSelectedListId(null);
    setCurrentStep(1);
  }, []);

  // User contribution stats for step 3
  const userStats = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    itemsForList.forEach((e) => {
      const u = e.fields.zugeordneter_benutzer;
      if (!u) return;
      const cur = map.get(u.key) ?? { label: u.label, count: 0 };
      cur.count += 1;
      map.set(u.key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [itemsForList]);

  const progressPercent =
    itemsForList.length > 0
      ? Math.round((completedItems.length / itemsForList.length) * 100)
      : 0;

  return (
    <IntentWizardShell
      title="Einkauf durchführen"
      subtitle="Wähle eine Liste aus, hake Artikel ab und schließe den Einkauf ab."
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Liste auswählen ── */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wähle eine Einkaufsliste aus, um mit dem Einkauf zu starten.
          </p>

          <EntitySelectStep
            items={einkaufsliste.map((list) => {
              const stats = listStats.get(list.record_id) ?? { total: 0, done: 0 };
              const pending = stats.total - stats.done;
              const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
              return {
                id: list.record_id,
                title: list.fields.listenname ?? '(Ohne Name)',
                subtitle: list.fields.beschreibung ?? 'Keine Beschreibung',
                icon: <IconShoppingCart size={18} className="text-primary" />,
                status:
                  stats.total > 0 && pending === 0
                    ? { key: 'bestaetigt', label: 'Alles erledigt' }
                    : pending > 0
                    ? { key: 'offen', label: `${pending} offen` }
                    : undefined,
                stats: [
                  { label: 'Offen', value: pending },
                  { label: 'Gesamt', value: stats.total },
                  { label: 'Fortschritt', value: `${pct}%` },
                ],
              };
            })}
            onSelect={handleSelectList}
            searchPlaceholder="Liste suchen..."
            emptyIcon={<IconList size={32} />}
            emptyText="Keine Einkaufslisten gefunden."
            createLabel="Neue Liste erstellen"
            onCreateNew={() => setListeDialogOpen(true)}
            createDialog={
              <EinkaufslisteDialog
                open={listeDialogOpen}
                onClose={() => setListeDialogOpen(false)}
                onSubmit={async (fields) => {
                  const res = await LivingAppsService.createEinkaufslisteEntry(fields);
                  await fetchAll();
                  // auto-select newly created list
                  const entries = Object.entries(res as Record<string, unknown>);
                  if (entries.length > 0) {
                    const newId = entries[0][0];
                    setSelectedListId(newId);
                    setCurrentStep(2);
                  }
                }}
                enablePhotoScan={AI_PHOTO_SCAN['Einkaufsliste']}
                enablePhotoLocation={AI_PHOTO_SCAN['Einkaufsliste']}
              />
            }
          />
        </div>
      )}

      {/* ── Step 2: Einkauf durchführen ── */}
      {currentStep === 2 && selectedList && (
        <div className="space-y-5">
          {/* Hero: List name + progress */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconShoppingCart size={20} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold truncate">
                  {selectedList.fields.listenname ?? '(Ohne Name)'}
                </h2>
                {selectedList.fields.beschreibung && (
                  <p className="text-sm text-muted-foreground truncate">
                    {selectedList.fields.beschreibung}
                  </p>
                )}
              </div>
            </div>

            {/* Live progress */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-medium">Fortschritt</span>
                <span className="font-semibold">
                  {completedItems.length} von {itemsForList.length} erledigt
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground text-right">{progressPercent}%</div>
            </div>

            {/* Celebration banner */}
            {allDone && (
              <div className="flex items-center gap-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
                <IconCircleCheck size={24} className="text-green-600 dark:text-green-400 shrink-0" />
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">
                    Alle Artikel erledigt! 🎉
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500">
                    Du kannst den Einkauf jetzt abschließen.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Article list */}
          <div className="space-y-3">
            {/* Pending items */}
            {pendingItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  Noch offen ({pendingItems.length})
                </p>
                {pendingItems.map((item) => (
                  <ArticleToggleRow
                    key={item.record_id}
                    item={item}
                    onToggle={() => handleToggleItem(item)}
                    isToggling={toggling.has(item.record_id)}
                  />
                ))}
              </div>
            )}

            {/* Completed items */}
            {completedItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  Erledigt ({completedItems.length})
                </p>
                {completedItems.map((item) => (
                  <ArticleToggleRow
                    key={item.record_id}
                    item={item}
                    onToggle={() => handleToggleItem(item)}
                    isToggling={toggling.has(item.record_id)}
                    dimmed
                  />
                ))}
              </div>
            )}

            {itemsForList.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <IconList size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Diese Liste hat noch keine Artikel.</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setEintragDialogOpen(true)}
              className="gap-2"
            >
              <IconPlus size={16} />
              Artikel hinzufügen
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={handleResetToStep1}
            >
              Zurück zur Liste
            </Button>
            <Button
              onClick={() => setCurrentStep(3)}
              disabled={false}
              className="gap-2"
            >
              <IconCircleCheck size={16} />
              Einkauf abschließen
            </Button>
          </div>

          <EinkaufseintragDialog
            open={eintragDialogOpen}
            onClose={() => setEintragDialogOpen(false)}
            onSubmit={async (fields) => {
              await LivingAppsService.createEinkaufseintragEntry(fields);
              await fetchAll();
            }}
            defaultValues={{
              einkaufsliste_ref: createRecordUrl(APP_IDS.EINKAUFSLISTE, selectedListId!),
            }}
            einkaufslisteList={einkaufsliste}
            enablePhotoScan={AI_PHOTO_SCAN['Einkaufseintrag']}
            enablePhotoLocation={AI_PHOTO_SCAN['Einkaufseintrag']}
          />
        </div>
      )}

      {/* ── Step 3: Abschluss ── */}
      {currentStep === 3 && (
        <div className="space-y-6">
          {/* Success indicator */}
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
              <IconCircleCheck size={48} stroke={1.5} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold">Einkauf abgeschlossen!</h2>
              {selectedList && (
                <p className="text-sm text-muted-foreground mt-1">
                  Liste:{' '}
                  <span className="font-medium text-foreground">
                    {selectedList.fields.listenname ?? '(Ohne Name)'}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<IconShoppingCart size={20} className="text-primary" />}
              label="Artikel gesamt"
              value={String(itemsForList.length)}
            />
            <StatCard
              icon={<IconCircleCheck size={20} className="text-green-600" />}
              label="Erledigt"
              value={String(completedItems.length)}
              valueClass="text-green-600"
            />
            <StatCard
              icon={<IconList size={20} className="text-amber-500" />}
              label="Noch offen"
              value={String(pendingItems.length)}
              valueClass={pendingItems.length > 0 ? 'text-amber-500' : undefined}
            />
          </div>

          {/* User contributions */}
          {userStats.length > 0 && (
            <div className="rounded-xl border bg-card p-5 space-y-3 overflow-hidden">
              <div className="flex items-center gap-2">
                <IconUsers size={18} className="text-muted-foreground" />
                <h3 className="font-semibold text-sm">Beteiligte Personen</h3>
              </div>
              <div className="space-y-2">
                {userStats.map((u) => (
                  <div key={u.label} className="flex items-center justify-between text-sm">
                    <span className="text-foreground font-medium">{u.label}</span>
                    <span className="text-muted-foreground">
                      {u.count} Artikel
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => { window.location.hash = '#/'; }}
              className="flex-1"
            >
              Zurück zur Übersicht
            </Button>
            <Button
              onClick={handleResetToStep1}
              className="flex-1 gap-2"
            >
              <IconShoppingCart size={16} />
              Weitere Liste bearbeiten
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}

// ── Sub-components ──

interface ArticleToggleRowProps {
  item: Einkaufseintrag;
  onToggle: () => void;
  isToggling: boolean;
  dimmed?: boolean;
}

function ArticleToggleRow({ item, onToggle, isToggling, dimmed }: ArticleToggleRowProps) {
  return (
    <button
      onClick={onToggle}
      disabled={isToggling}
      className={`w-full text-left flex items-center gap-3 p-4 rounded-xl border transition-colors overflow-hidden
        ${dimmed
          ? 'bg-muted/40 border-muted opacity-60'
          : 'bg-card border-border hover:bg-accent hover:border-primary/30'
        }
        ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
      `}
    >
      {/* Checkbox indicator */}
      <div
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
          ${item.fields.erledigt
            ? 'bg-green-500 border-green-500'
            : 'border-muted-foreground/40'
          }
        `}
      >
        {item.fields.erledigt && (
          <IconCircleCheck size={14} stroke={2.5} className="text-white" />
        )}
      </div>

      {/* Article info */}
      <div className="flex-1 min-w-0">
        <span
          className={`font-medium text-sm ${
            dimmed ? 'line-through text-muted-foreground' : 'text-foreground'
          }`}
        >
          {item.fields.artikelname ?? '(Kein Name)'}
        </span>
        {item.fields.zugeordneter_benutzer && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.fields.zugeordneter_benutzer.label}
          </p>
        )}
      </div>

      {isToggling && (
        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
      )}
    </button>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}

function StatCard({ icon, label, value, valueClass }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3 overflow-hidden">
      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${valueClass ?? 'text-foreground'}`}>{value}</p>
      </div>
    </div>
  );
}
