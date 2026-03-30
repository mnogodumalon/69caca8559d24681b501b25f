import { useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { EinkaufslisteDialog } from '@/components/dialogs/EinkaufslisteDialog';
import { EinkaufseintragDialog } from '@/components/dialogs/EinkaufseintragDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Einkaufsliste, Einkaufseintrag } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import {
  IconShoppingCart,
  IconPlus,
  IconTrash,
  IconCheck,
  IconArrowRight,
  IconArrowLeft,
  IconUser,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Liste auswählen' },
  { label: 'Artikel hinzufügen' },
  { label: 'Zusammenfassung' },
];

const USER_LABELS: Record<string, string> = {
  akm: 'AKM',
  benutzer_2: 'Benutzer 2',
  benutzer_3: 'Benutzer 3',
};

export default function ListeBefuellenPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Determine initial step from URL
  const urlStep = parseInt(searchParams.get('step') ?? '', 10);
  const urlListId = searchParams.get('listId') ?? '';
  const initialStep = urlListId && urlStep >= 2 ? urlStep : urlListId ? 2 : 1;

  const [currentStep, setCurrentStep] = useState<number>(
    initialStep >= 1 && initialStep <= 3 ? initialStep : 1
  );
  const [selectedListId, setSelectedListId] = useState<string>(urlListId);
  const [sessionAddedIds, setSessionAddedIds] = useState<string[]>([]);

  // Dialog state
  const [listeDialogOpen, setListeDialogOpen] = useState(false);
  const [eintragDialogOpen, setEintragDialogOpen] = useState(false);

  // Quick-add form state
  const [quickArtikelname, setQuickArtikelname] = useState('');
  const [quickBenutzer, setQuickBenutzer] = useState<string>('none');
  const [quickAdding, setQuickAdding] = useState(false);
  const artikelnameInputRef = useRef<HTMLInputElement>(null);

  const { einkaufsliste, einkaufseintrag, loading, error, fetchAll } = useDashboardData();

  // Derived data
  const selectedList: Einkaufsliste | undefined = einkaufsliste.find(
    (l) => l.record_id === selectedListId
  );

  const allListEntries: Einkaufseintrag[] = einkaufseintrag.filter((e) => {
    const refId = extractRecordId(e.fields.einkaufsliste_ref);
    return refId === selectedListId;
  });

  const sessionEntries: Einkaufseintrag[] = allListEntries.filter((e) =>
    sessionAddedIds.includes(e.record_id)
  );

  // URL sync helpers
  const goToStep = useCallback(
    (step: number, listId?: string) => {
      setCurrentStep(step);
      const params = new URLSearchParams(searchParams);
      if (step > 1) {
        params.set('step', String(step));
      } else {
        params.delete('step');
      }
      const effectiveListId = listId ?? selectedListId;
      if (effectiveListId) {
        params.set('listId', effectiveListId);
      } else {
        params.delete('listId');
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, selectedListId]
  );

  // Step 1: select list
  function handleSelectList(id: string) {
    setSelectedListId(id);
    setSessionAddedIds([]);
    goToStep(2, id);
  }

  async function handleCreateListe(fields: Einkaufsliste['fields']) {
    const result = await LivingAppsService.createEinkaufslisteEntry(fields);
    await fetchAll();
    // Auto-select newly created list
    const newId = result?.record_id ?? '';
    if (newId) {
      setSelectedListId(newId);
      setSessionAddedIds([]);
      goToStep(2, newId);
    }
  }

  // Step 2: quick-add article
  async function handleQuickAdd() {
    if (!quickArtikelname.trim() || !selectedListId) return;
    setQuickAdding(true);
    try {
      const result = await LivingAppsService.createEinkaufseintragEntry({
        artikelname: quickArtikelname.trim(),
        zugeordneter_benutzer: quickBenutzer !== 'none' ? quickBenutzer : undefined,
        einkaufsliste_ref: createRecordUrl(APP_IDS.EINKAUFSLISTE, selectedListId),
      });
      await fetchAll();
      if (result?.record_id) {
        setSessionAddedIds((prev) => [...prev, result.record_id]);
      }
      setQuickArtikelname('');
      setQuickBenutzer('none');
      artikelnameInputRef.current?.focus();
    } finally {
      setQuickAdding(false);
    }
  }

  async function handleCreateEintrag(fields: Einkaufseintrag['fields']) {
    const result = await LivingAppsService.createEinkaufseintragEntry({
      ...fields,
      einkaufsliste_ref: createRecordUrl(APP_IDS.EINKAUFSLISTE, selectedListId),
    });
    await fetchAll();
    if (result?.record_id) {
      setSessionAddedIds((prev) => [...prev, result.record_id]);
    }
  }

  async function handleDeleteEintrag(id: string) {
    await LivingAppsService.deleteEinkaufseintragEntry(id);
    setSessionAddedIds((prev) => prev.filter((sid) => sid !== id));
    await fetchAll();
  }

  // Group entries by user for summary
  function groupByUser(entries: Einkaufseintrag[]) {
    const groups: Record<string, Einkaufseintrag[]> = {
      akm: [],
      benutzer_2: [],
      benutzer_3: [],
      unassigned: [],
    };
    for (const e of entries) {
      const key =
        typeof e.fields.zugeordneter_benutzer === 'object' && e.fields.zugeordneter_benutzer
          ? e.fields.zugeordneter_benutzer.key
          : typeof e.fields.zugeordneter_benutzer === 'string'
          ? e.fields.zugeordneter_benutzer
          : null;
      if (key && key in groups) {
        groups[key].push(e);
      } else {
        groups.unassigned.push(e);
      }
    }
    return groups;
  }

  return (
    <IntentWizardShell
      title="Liste befüllen"
      subtitle="Wähle eine Einkaufsliste und füge Artikel hinzu"
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
          <EntitySelectStep
            items={einkaufsliste.map((l) => {
              const count = einkaufseintrag.filter(
                (e) => extractRecordId(e.fields.einkaufsliste_ref) === l.record_id
              ).length;
              return {
                id: l.record_id,
                title: l.fields.listenname ?? '(Ohne Name)',
                subtitle: l.fields.beschreibung ?? undefined,
                icon: <IconShoppingCart size={18} className="text-primary" />,
                stats: [{ label: 'Artikel', value: count }],
              };
            })}
            onSelect={handleSelectList}
            searchPlaceholder="Liste suchen..."
            emptyIcon={<IconShoppingCart size={32} />}
            emptyText="Noch keine Einkaufsliste vorhanden."
            createLabel="Neue Liste erstellen"
            onCreateNew={() => setListeDialogOpen(true)}
            createDialog={
              <EinkaufslisteDialog
                open={listeDialogOpen}
                onClose={() => setListeDialogOpen(false)}
                onSubmit={handleCreateListe}
                enablePhotoScan={AI_PHOTO_SCAN['Einkaufsliste']}
              />
            }
          />
        </div>
      )}

      {/* ── Step 2: Artikel hinzufügen ── */}
      {currentStep === 2 && selectedList && (
        <div className="space-y-5">
          {/* Hero header */}
          <div className="rounded-2xl bg-primary/5 border border-primary/15 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconShoppingCart size={20} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-lg truncate">
                  {selectedList.fields.listenname ?? '(Ohne Name)'}
                </h2>
                {selectedList.fields.beschreibung && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {selectedList.fields.beschreibung}
                  </p>
                )}
              </div>
              <span className="ml-auto shrink-0 text-sm font-medium bg-primary text-primary-foreground px-3 py-1 rounded-full whitespace-nowrap">
                {sessionAddedIds.length} hinzugefügt
              </span>
            </div>
          </div>

          {/* Quick-add form */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Artikel schnell hinzufügen</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0">
                <Label htmlFor="quick-artikelname" className="sr-only">
                  Artikelname
                </Label>
                <Input
                  id="quick-artikelname"
                  ref={artikelnameInputRef}
                  placeholder="Artikelname eingeben..."
                  value={quickArtikelname}
                  onChange={(e) => setQuickArtikelname(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleQuickAdd();
                    }
                  }}
                  disabled={quickAdding}
                />
              </div>
              <div className="sm:w-40">
                <Label htmlFor="quick-benutzer" className="sr-only">
                  Benutzer
                </Label>
                <Select value={quickBenutzer} onValueChange={setQuickBenutzer}>
                  <SelectTrigger id="quick-benutzer">
                    <SelectValue placeholder="Benutzer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Benutzer</SelectItem>
                    <SelectItem value="akm">AKM</SelectItem>
                    <SelectItem value="benutzer_2">Benutzer 2</SelectItem>
                    <SelectItem value="benutzer_3">Benutzer 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => void handleQuickAdd()}
                disabled={quickAdding || !quickArtikelname.trim()}
                className="shrink-0"
              >
                <IconPlus size={16} stroke={2} className="mr-1.5" />
                Hinzufügen
              </Button>
            </div>
          </div>

          {/* Full dialog button */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setEintragDialogOpen(true)}
              className="gap-1.5"
            >
              <IconPlus size={15} stroke={2} />
              Detaillierter Eintrag erstellen
            </Button>
            <EinkaufseintragDialog
              open={eintragDialogOpen}
              onClose={() => setEintragDialogOpen(false)}
              onSubmit={handleCreateEintrag}
              einkaufslisteList={einkaufsliste}
              enablePhotoScan={AI_PHOTO_SCAN['Einkaufseintrag']}
              defaultValues={{
                einkaufsliste_ref: createRecordUrl(APP_IDS.EINKAUFSLISTE, selectedListId),
              }}
            />
          </div>

          {/* Article list */}
          {allListEntries.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                Alle Artikel ({allListEntries.length})
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {allListEntries.map((entry) => {
                  const userKey =
                    typeof entry.fields.zugeordneter_benutzer === 'object' &&
                    entry.fields.zugeordneter_benutzer
                      ? entry.fields.zugeordneter_benutzer.key
                      : typeof entry.fields.zugeordneter_benutzer === 'string'
                      ? entry.fields.zugeordneter_benutzer
                      : null;
                  const userLabel = userKey ? (USER_LABELS[userKey] ?? userKey) : null;
                  const isNew = sessionAddedIds.includes(entry.record_id);
                  return (
                    <div
                      key={entry.record_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                        isNew ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'
                      }`}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {entry.fields.artikelname ?? '(Kein Name)'}
                        </span>
                        {isNew && (
                          <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                            Neu
                          </span>
                        )}
                      </div>
                      {userLabel && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <IconUser size={12} stroke={2} />
                          {userLabel}
                        </span>
                      )}
                      <button
                        onClick={() => void handleDeleteEintrag(entry.record_id)}
                        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label="Artikel entfernen"
                      >
                        <IconTrash size={14} stroke={2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <IconShoppingCart
                size={32}
                className="mx-auto mb-2 opacity-30"
                stroke={1.5}
              />
              <p className="text-sm">Noch keine Artikel in dieser Liste.</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="outline" onClick={() => goToStep(1)} className="gap-1.5">
              <IconArrowLeft size={15} stroke={2} />
              Andere Liste wählen
            </Button>
            <Button onClick={() => goToStep(3)} className="gap-1.5">
              Weiter zur Übersicht
              <IconArrowRight size={15} stroke={2} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Zusammenfassung ── */}
      {currentStep === 3 && selectedList && (
        <div className="space-y-5">
          {/* List header */}
          <div className="rounded-2xl bg-primary/5 border border-primary/15 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconShoppingCart size={20} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-lg truncate">
                  {selectedList.fields.listenname ?? '(Ohne Name)'}
                </h2>
                {selectedList.fields.beschreibung && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {selectedList.fields.beschreibung}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-2xl font-bold text-primary">{allListEntries.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Artikel gesamt</p>
            </div>
            {(['akm', 'benutzer_2', 'benutzer_3'] as const).map((key) => {
              const count = allListEntries.filter((e) => {
                const k =
                  typeof e.fields.zugeordneter_benutzer === 'object' &&
                  e.fields.zugeordneter_benutzer
                    ? e.fields.zugeordneter_benutzer.key
                    : typeof e.fields.zugeordneter_benutzer === 'string'
                    ? e.fields.zugeordneter_benutzer
                    : null;
                return k === key;
              }).length;
              return (
                <div key={key} className="rounded-xl border bg-card p-3 text-center">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{USER_LABELS[key]}</p>
                </div>
              );
            })}
          </div>

          {/* Grouped article list */}
          {(() => {
            const groups = groupByUser(allListEntries);
            const groupEntries: Array<{ key: string; label: string; items: Einkaufseintrag[] }> = [
              { key: 'akm', label: 'AKM', items: groups.akm },
              { key: 'benutzer_2', label: 'Benutzer 2', items: groups.benutzer_2 },
              { key: 'benutzer_3', label: 'Benutzer 3', items: groups.benutzer_3 },
              { key: 'unassigned', label: 'Nicht zugewiesen', items: groups.unassigned },
            ].filter((g) => g.items.length > 0);

            if (groupEntries.length === 0) {
              return (
                <div className="text-center py-8 text-muted-foreground">
                  <IconShoppingCart size={32} className="mx-auto mb-2 opacity-30" stroke={1.5} />
                  <p className="text-sm">Noch keine Artikel in dieser Liste.</p>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {groupEntries.map((group) => (
                  <div key={group.key} className="rounded-xl border bg-card overflow-hidden">
                    <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
                      <IconUser size={14} stroke={2} className="text-muted-foreground" />
                      <span className="text-sm font-medium">{group.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {group.items.length} Artikel
                      </span>
                    </div>
                    <ul className="divide-y">
                      {group.items.map((entry) => (
                        <li
                          key={entry.record_id}
                          className="px-4 py-2.5 flex items-center gap-2 text-sm"
                        >
                          <IconCheck
                            size={14}
                            stroke={2.5}
                            className={
                              entry.fields.erledigt
                                ? 'text-green-500 shrink-0'
                                : 'text-muted-foreground/30 shrink-0'
                            }
                          />
                          <span
                            className={`truncate ${
                              entry.fields.erledigt ? 'line-through text-muted-foreground' : ''
                            }`}
                          >
                            {entry.fields.artikelname ?? '(Kein Name)'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => goToStep(2)}
              className="gap-1.5 sm:mr-auto"
            >
              <IconArrowLeft size={15} stroke={2} />
              Weitere Artikel hinzufügen
            </Button>
            <Button
              onClick={() => {
                window.location.hash = '#/';
              }}
              className="gap-1.5"
            >
              <IconCheck size={15} stroke={2.5} />
              Liste fertigstellen
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
