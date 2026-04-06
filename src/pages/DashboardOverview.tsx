import { useState, useMemo, useRef, useEffect } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichEinkaufseintrag } from '@/lib/enrich';
import type { EnrichedEinkaufseintrag } from '@/types/enriched';
import type { Einkaufsliste } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EinkaufslisteDialog } from '@/components/dialogs/EinkaufslisteDialog';
import { EinkaufseintragDialog } from '@/components/dialogs/EinkaufseintragDialog';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatCard } from '@/components/StatCard';
import {
  IconAlertCircle,
  IconPlus,
  IconPencil,
  IconTrash,
  IconShoppingCart,
  IconCheck,
  IconListCheck,
  IconShoppingBag,
  IconHandStop,
  IconX,
  IconUserPlus,
  IconPackage,
} from '@tabler/icons-react';

// Personen direkt aus dem Lookup-Feld des Einkaufseintrags
const PERSONS = (LOOKUP_OPTIONS.einkaufseintrag?.zugeordneter_benutzer ?? [])
  .slice()
  .sort((a, b) => a.label.localeCompare(b.label, 'de'));

export default function DashboardOverview() {
  const {
    einkaufsliste,
    einkaufseintrag,
    einkaufslisteMap,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  const enrichedEinkaufseintrag = enrichEinkaufseintrag(einkaufseintrag, { einkaufslisteMap });

  // ALL hooks before early returns
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listDialog, setListDialog] = useState<{ open: boolean; record?: Einkaufsliste }>({ open: false });
  const [itemDialog, setItemDialog] = useState<{ open: boolean; record?: EnrichedEinkaufseintrag }>({ open: false });
  const [deleteList, setDeleteList] = useState<Einkaufsliste | null>(null);
  const [deleteItem, setDeleteItem] = useState<EnrichedEinkaufseintrag | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [assignPopover, setAssignPopover] = useState<string | null>(null);

  const STORAGE_KEY = 'custom_persons_v1';
  const [customPersons, setCustomPersons] = useState<{ key: string; label: string }[]>(() => {
    try {
      const saved: { key: string; label: string }[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      // Sync persisted custom persons into LOOKUP_OPTIONS so dialogs show the same list
      const opts = LOOKUP_OPTIONS.einkaufseintrag?.zugeordneter_benutzer;
      if (opts) {
        for (const p of saved) {
          if (!opts.find(o => o.key === p.key)) opts.push(p);
        }
      }
      return saved;
    } catch { return []; }
  });
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const addPersonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingPerson) addPersonInputRef.current?.focus();
  }, [addingPerson]);

  const allPersons = useMemo(
    () => [...PERSONS, ...customPersons].sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [customPersons]
  );

  // Sort lists newest first (by createdat descending)
  const sortedLists = useMemo(
    () => [...einkaufsliste].sort((a, b) => b.createdat.localeCompare(a.createdat)),
    [einkaufsliste]
  );

  const activeList = useMemo(() => {
    if (selectedListId) return sortedLists.find(l => l.record_id === selectedListId) ?? sortedLists[0] ?? null;
    return sortedLists[0] ?? null;
  }, [sortedLists, selectedListId]);

  const activeListId = activeList?.record_id ?? null;

  const listItems = useMemo(
    () => enrichedEinkaufseintrag.filter(e => extractRecordId(e.fields.einkaufsliste_ref) === activeListId),
    [enrichedEinkaufseintrag, activeListId]
  );

  // Sorted alphabetically, done items at end, filtered by person
  const sortedFilteredItems = useMemo(() => {
    const filtered = personFilter
      ? listItems.filter(i => i.fields.zugeordneter_benutzer?.key === personFilter)
      : listItems;
    const cmp = (a: EnrichedEinkaufseintrag, b: EnrichedEinkaufseintrag) =>
      (a.fields.artikelname ?? '').localeCompare(b.fields.artikelname ?? '', 'de');
    const open = filtered.filter(i => !i.fields.erledigt).sort(cmp);
    const done = filtered.filter(i => i.fields.erledigt).sort(cmp);
    return [...open, ...done];
  }, [listItems, personFilter]);

  // Progress (open/total) per list for yellow pill
  const listProgress = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const item of enrichedEinkaufseintrag) {
      const id = extractRecordId(item.fields.einkaufsliste_ref);
      if (!id) continue;
      const cur = map.get(id) ?? { done: 0, total: 0 };
      cur.total += 1;
      if (item.fields.erledigt) cur.done += 1;
      map.set(id, cur);
    }
    return map;
  }, [enrichedEinkaufseintrag]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const handleAddPerson = () => {
    const name = newPersonName.trim();
    if (!name) { setAddingPerson(false); return; }
    const key = `custom_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const newEntry = { key, label: name };
    const updated = [...customPersons, newEntry];
    setCustomPersons(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // Also inject into LOOKUP_OPTIONS so the form dialog shows the same list
    const opts = LOOKUP_OPTIONS.einkaufseintrag?.zugeordneter_benutzer;
    if (opts && !opts.find(o => o.key === key)) opts.push(newEntry);
    setNewPersonName('');
    setAddingPerson(false);
  };

  const handleToggleDone = async (item: EnrichedEinkaufseintrag) => {
    await LivingAppsService.updateEinkaufseintragEntry(item.record_id, { erledigt: !item.fields.erledigt });
    fetchAll();
  };

  const handleDeleteList = async () => {
    if (!deleteList) return;
    await LivingAppsService.deleteEinkaufslisteEntry(deleteList.record_id);
    if (activeListId === deleteList.record_id) setSelectedListId(null);
    setDeleteList(null);
    fetchAll();
  };

  const handleDeleteItem = async () => {
    if (!deleteItem) return;
    await LivingAppsService.deleteEinkaufseintragEntry(deleteItem.record_id);
    setDeleteItem(null);
    fetchAll();
  };

  const handleAssignPerson = async (itemId: string, personKey: string) => {
    await LivingAppsService.updateEinkaufseintragEntry(itemId, { zugeordneter_benutzer: personKey });
    setAssignPopover(null);
    fetchAll();
  };

  const handleClearPerson = async (item: EnrichedEinkaufseintrag) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await LivingAppsService.updateEinkaufseintragEntry(item.record_id, { zugeordneter_benutzer: null as any });
    fetchAll();
  };

  const totalItems = listItems.length;
  const openItems = listItems.filter(i => !i.fields.erledigt).length;
  const doneItems = listItems.filter(i => i.fields.erledigt).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      {activeList && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Anzahl Artikel"
            value={String(totalItems)}
            description="in dieser Liste"
            icon={<IconPackage size={18} className="text-muted-foreground" />}
          />
          <StatCard
            title="Offen"
            value={String(openItems)}
            description="noch zu kaufen"
            icon={<IconShoppingCart size={18} className="text-muted-foreground" />}
          />
          <StatCard
            title="Erledigt"
            value={String(doneItems)}
            description="bereits gekauft"
            icon={<IconCheck size={18} className="text-muted-foreground" />}
          />
        </div>
      )}

      {/* Master-Detail + Persons */}
      <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: '520px' }}>

        {/* Lists Panel */}
        <div className="lg:w-72 shrink-0 bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Meine Listen</h2>
            <Button size="sm" onClick={() => setListDialog({ open: true })}>
              <IconPlus size={14} className="shrink-0" />
              <span className="ml-1 hidden sm:inline">Neue Liste</span>
            </Button>
          </div>

          {sortedLists.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <IconShoppingBag size={48} className="text-muted-foreground" stroke={1.5} />
              <p className="text-sm text-muted-foreground">Noch keine Listen vorhanden.</p>
              <Button size="sm" variant="outline" onClick={() => setListDialog({ open: true })}>
                Erste Liste anlegen
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {sortedLists.map(list => {
                const prog = listProgress.get(list.record_id);
                const isActive = list.record_id === activeListId;
                const openCount = prog ? prog.total - prog.done : 0;
                return (
                  <button
                    key={list.record_id}
                    onClick={() => setSelectedListId(list.record_id)}
                    className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 transition-colors hover:bg-accent flex items-start gap-2 ${isActive ? 'bg-primary/8' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm truncate ${isActive ? 'text-primary' : ''}`}>
                        {list.fields.listenname ?? '(Ohne Titel)'}
                      </p>
                      {list.fields.beschreibung && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {list.fields.beschreibung}
                        </p>
                      )}
                      {prog ? (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[40px]">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(prog.done / prog.total) * 100}%` }}
                            />
                          </div>
                          {openCount > 0 ? (
                            <span className="shrink-0 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 px-1.5 py-0.5 rounded-full font-medium">
                              {openCount} offen
                            </span>
                          ) : (
                            <span className="shrink-0 text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-1.5 py-0.5 rounded-full font-medium">
                              Fertig
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">Leer</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                      <button
                        onClick={e => { e.stopPropagation(); setListDialog({ open: true, record: list }); }}
                        className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                        title="Bearbeiten"
                      >
                        <IconPencil size={13} className="text-muted-foreground" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteList(list); }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                        title="Löschen"
                      >
                        <IconTrash size={13} className="text-muted-foreground" />
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Items Panel */}
        <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden flex flex-col min-w-0">
          {!activeList ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <IconShoppingCart size={48} className="text-muted-foreground" stroke={1.5} />
              <p className="text-sm text-muted-foreground">Wähle links eine Liste aus, um ihre Artikel zu sehen.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">
                    {activeList.fields.listenname ?? '(Ohne Titel)'}
                  </h2>
                  {activeList.fields.beschreibung && (
                    <p className="text-xs text-muted-foreground truncate">{activeList.fields.beschreibung}</p>
                  )}
                </div>
                <Button size="sm" onClick={() => setItemDialog({ open: true })}>
                  <IconPlus size={14} className="shrink-0" />
                  <span className="ml-1 hidden sm:inline">Artikel</span>
                </Button>
              </div>

              {/* Filter Bar */}
              <div className="px-4 py-2 border-b border-border flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setPersonFilter(null)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    personFilter === null
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Alle
                </button>
                {allPersons.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPersonFilter(personFilter === p.key ? null : p.key)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      personFilter === p.key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {addingPerson ? (
                  <form
                    onSubmit={e => { e.preventDefault(); handleAddPerson(); }}
                    className="flex items-center gap-1"
                  >
                    <input
                      ref={addPersonInputRef}
                      value={newPersonName}
                      onChange={e => setNewPersonName(e.target.value)}
                      onBlur={handleAddPerson}
                      onKeyDown={e => e.key === 'Escape' && (setAddingPerson(false), setNewPersonName(''))}
                      placeholder="Name…"
                      className="h-6 px-2 rounded-full text-xs border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary w-24"
                    />
                  </form>
                ) : (
                  <button
                    onClick={() => setAddingPerson(true)}
                    className="w-6 h-6 rounded-full bg-muted text-muted-foreground hover:bg-accent flex items-center justify-center transition-colors"
                    title="Person hinzufügen"
                  >
                    <IconUserPlus size={12} />
                  </button>
                )}
              </div>

              {listItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <IconListCheck size={48} className="text-muted-foreground" stroke={1.5} />
                  <p className="text-sm text-muted-foreground">Noch keine Artikel in dieser Liste.</p>
                  <Button size="sm" variant="outline" onClick={() => setItemDialog({ open: true })}>
                    Ersten Artikel hinzufügen
                  </Button>
                </div>
              ) : sortedFilteredItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <IconListCheck size={48} className="text-muted-foreground" stroke={1.5} />
                  <p className="text-sm text-muted-foreground">Keine Artikel für diesen Filter.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-border">
                  {sortedFilteredItems.map(item => (
                    <div
                      key={item.record_id}
                      className={`flex items-center gap-2 px-4 py-3 hover:bg-accent transition-colors ${item.fields.erledigt ? 'opacity-60' : ''}`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => handleToggleDone(item)}
                        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          item.fields.erledigt
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground hover:border-primary'
                        }`}
                        title={item.fields.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'}
                      >
                        {item.fields.erledigt && <IconCheck size={11} className="text-primary-foreground" />}
                      </button>

                      {/* Name + person label */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${item.fields.erledigt ? 'line-through text-muted-foreground' : 'font-medium'}`}>
                          {item.fields.artikelname ?? '(Ohne Name)'}
                        </p>
                        {item.fields.zugeordneter_benutzer && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {item.fields.zugeordneter_benutzer.label}
                          </p>
                        )}
                      </div>

                      {/* Hand (assign) */}
                      {!item.fields.zugeordneter_benutzer && (
                        <Popover
                          open={assignPopover === item.record_id}
                          onOpenChange={open => setAssignPopover(open ? item.record_id : null)}
                        >
                          <PopoverTrigger asChild>
                            <button
                              className="shrink-0 p-1.5 rounded-lg bg-muted/60 text-muted-foreground hover:bg-accent transition-colors"
                              title="Person zuweisen"
                            >
                              <IconHandStop size={14} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2" align="end">
                            <p className="text-xs text-muted-foreground mb-1.5 px-1 font-medium">Person zuweisen:</p>
                            {allPersons.length === 0 ? (
                              <p className="text-xs text-muted-foreground px-2 py-1">Keine Personen verfügbar.</p>
                            ) : (
                              allPersons.map(p => (
                                <button
                                  key={p.key}
                                  onClick={() => handleAssignPerson(item.record_id, p.key)}
                                  className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors flex items-center gap-2"
                                >
                                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold shrink-0">
                                    {p.label.charAt(0).toUpperCase()}
                                  </span>
                                  {p.label}
                                </button>
                              ))
                            )}
                          </PopoverContent>
                        </Popover>
                      )}

                      {/* Edit + Delete */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setItemDialog({ open: true, record: item })}
                          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                          title="Bearbeiten"
                        >
                          <IconPencil size={13} className="text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => setDeleteItem(item)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                          title="Löschen"
                        >
                          <IconTrash size={13} className="text-muted-foreground" />
                        </button>
                      </div>

                      {/* X to clear person — only shown when person is assigned */}
                      {item.fields.zugeordneter_benutzer && (
                        <button
                          onClick={() => handleClearPerson(item)}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Zuweisung aufheben"
                        >
                          <IconX size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

      </div>

      {/* Dialogs */}
      <EinkaufslisteDialog
        open={listDialog.open}
        onClose={() => setListDialog({ open: false })}
        onSubmit={async (fields) => {
          if (listDialog.record) {
            await LivingAppsService.updateEinkaufslisteEntry(listDialog.record.record_id, fields);
          } else {
            await LivingAppsService.createEinkaufslisteEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={listDialog.record?.fields}
        enablePhotoScan={AI_PHOTO_SCAN['Einkaufsliste']}
      />

      <EinkaufseintragDialog
        open={itemDialog.open}
        onClose={() => setItemDialog({ open: false })}
        onSubmit={async (fields) => {
          if (itemDialog.record) {
            await LivingAppsService.updateEinkaufseintragEntry(itemDialog.record.record_id, fields);
          } else {
            await LivingAppsService.createEinkaufseintragEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={
          itemDialog.record
            ? itemDialog.record.fields
            : activeListId
            ? { einkaufsliste_ref: createRecordUrl(APP_IDS.EINKAUFSLISTE, activeListId) }
            : undefined
        }
        einkaufslisteList={einkaufsliste}
        enablePhotoScan={AI_PHOTO_SCAN['Einkaufseintrag']}
      />

      <ConfirmDialog
        open={!!deleteList}
        title="Liste löschen"
        description={`Möchtest du die Liste "${deleteList?.fields.listenname ?? ''}" wirklich löschen? Alle zugehörigen Artikel bleiben erhalten.`}
        onConfirm={handleDeleteList}
        onClose={() => setDeleteList(null)}
      />

      <ConfirmDialog
        open={!!deleteItem}
        title="Artikel löschen"
        description={`Möchtest du "${deleteItem?.fields.artikelname ?? ''}" wirklich löschen?`}
        onConfirm={handleDeleteItem}
        onClose={() => setDeleteItem(null)}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4">
        <Skeleton className="lg:w-72 h-96 rounded-2xl" />
        <Skeleton className="flex-1 h-96 rounded-2xl" />
      </div>
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">{error.message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>Erneut versuchen</Button>
    </div>
  );
}
