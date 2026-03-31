import { useState, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import {
  IconAlertCircle,
  IconPlus,
  IconPencil,
  IconTrash,
  IconShoppingCart,
  IconCheck,
  IconListCheck,
  IconShoppingBag,
  IconRocket,
  IconChevronRight,
  IconClipboardList,
  IconPlayerPlay,
  IconHandStop,
  IconX,
  IconUsers,
  IconUserPlus,
} from '@tabler/icons-react';

type Person = { key: string; label: string; custom?: boolean };

const BASE_PERSONS: Person[] = (LOOKUP_OPTIONS.einkaufseintrag?.zugeordneter_benutzer ?? []).map(p => ({ ...p }));
const STORAGE_KEY = 'einkauf_persons_v1';

function loadPersons(): Person[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored: Person[] = JSON.parse(raw);
      const storedMap = new Map(stored.map(p => [p.key, p]));
      const merged: Person[] = BASE_PERSONS.map(bp => storedMap.get(bp.key) ?? bp);
      const customs = stored.filter(p => p.custom && !BASE_PERSONS.find(b => b.key === p.key));
      return [...merged, ...customs];
    }
  } catch { /* ignore */ }
  return [...BASE_PERSONS];
}

function savePersons(persons: Person[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persons)); } catch { /* ignore */ }
}

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
  const [persons, setPersons] = useState<Person[]>(() => loadPersons());
  const [newPersonName, setNewPersonName] = useState('');
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [addPersonPanelOpen, setAddPersonPanelOpen] = useState(false);
  const [editPersonKey, setEditPersonKey] = useState<string>('');
  const [editPersonOpen, setEditPersonOpen] = useState(false);
  const [editPersonName, setEditPersonName] = useState('');

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

  // Persons sorted alphabetically
  const sortedPersons = useMemo(
    () => [...persons].sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [persons]
  );

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

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
    await LivingAppsService.updateEinkaufseintragEntry(item.record_id, { zugeordneter_benutzer: '' });
    fetchAll();
  };

  const handleAddPerson = () => {
    const name = newPersonName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const key = `custom_${slug}_${Date.now()}`;
    const updated = [...persons, { key, label: name, custom: true }];
    setPersons(updated);
    savePersons(updated);
    setNewPersonName('');
    setAddPersonOpen(false);
  };

  const handleEditPersonSave = () => {
    const name = editPersonName.trim();
    if (!name) return;
    const updated = persons.map(p => p.key === editPersonKey ? { ...p, label: name } : p);
    setPersons(updated);
    savePersons(updated);
    setEditPersonOpen(false);
    setEditPersonKey('');
  };

  const handleDeletePerson = (key: string) => {
    const updated = persons.filter(p => p.key !== key);
    setPersons(updated);
    savePersons(updated);
    setEditPersonOpen(false);
    setEditPersonKey('');
  };

  return (
    <div className="space-y-6">
      {/* Workflows */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <IconRocket size={18} className="text-primary" />
          <h2 className="font-semibold text-sm">Workflows</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="#/intents/liste-befuellen"
            className="bg-card border border-border border-l-4 border-l-primary rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3 no-underline"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <IconClipboardList size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">Liste befüllen</p>
              <p className="text-xs text-muted-foreground truncate">Liste auswählen &amp; Artikel schnell hinzufügen</p>
            </div>
            <IconChevronRight size={16} className="text-muted-foreground shrink-0" />
          </a>
          <a
            href="#/intents/einkauf-durchfuehren"
            className="bg-card border border-border border-l-4 border-l-primary rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3 no-underline"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <IconPlayerPlay size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">Einkauf durchführen</p>
              <p className="text-xs text-muted-foreground truncate">Liste wählen &amp; Artikel Schritt für Schritt abhaken</p>
            </div>
            <IconChevronRight size={16} className="text-muted-foreground shrink-0" />
          </a>
        </div>
      </div>

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
                {sortedPersons.map(p => (
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
                <Popover open={addPersonOpen} onOpenChange={setAddPersonOpen}>
                  <PopoverTrigger asChild>
                    <button className="w-7 h-7 rounded-full bg-muted text-muted-foreground hover:bg-accent flex items-center justify-center transition-colors text-base font-bold leading-none">
                      +
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <p className="text-sm font-semibold mb-2">Neue Person anlegen</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Name eingeben..."
                        value={newPersonName}
                        onChange={e => setNewPersonName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddPerson(); }}
                        className="text-sm h-8"
                        autoFocus
                      />
                      <Button size="sm" className="h-8 shrink-0" onClick={handleAddPerson}>
                        <IconUserPlus size={14} />
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
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

                      {/* Hand (assign) or X (clear) */}
                      {!item.fields.zugeordneter_benutzer ? (
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
                            {sortedPersons.length === 0 ? (
                              <p className="text-xs text-muted-foreground px-2 py-1">Noch keine Personen angelegt.</p>
                            ) : (
                              sortedPersons.map(p => (
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
                      ) : (
                        <button
                          onClick={() => handleClearPerson(item)}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Zuweisung aufheben"
                        >
                          <IconX size={14} />
                        </button>
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
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Persons Panel */}
        <div className="lg:w-56 shrink-0 bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <IconUsers size={16} className="text-muted-foreground shrink-0" />
              <h2 className="font-semibold text-sm">Personen</h2>
            </div>
            <Popover open={addPersonPanelOpen} onOpenChange={setAddPersonPanelOpen}>
              <PopoverTrigger asChild>
                <button className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-base font-bold leading-none hover:bg-primary/90 transition-colors shrink-0">
                  +
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <p className="text-sm font-semibold mb-2">Neue Person anlegen</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Name eingeben..."
                    value={newPersonName}
                    onChange={e => setNewPersonName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        handleAddPerson();
                        setAddPersonPanelOpen(false);
                      }
                    }}
                    className="text-sm h-8"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => { handleAddPerson(); setAddPersonPanelOpen(false); }}
                  >
                    <IconUserPlus size={14} />
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sortedPersons.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-xs text-muted-foreground">Noch keine Personen vorhanden.</p>
              </div>
            ) : (
              sortedPersons.map(person => (
                <Popover
                  key={person.key}
                  open={editPersonKey === person.key && editPersonOpen}
                  onOpenChange={open => {
                    if (open) {
                      setEditPersonKey(person.key);
                      setEditPersonName(person.label);
                      setEditPersonOpen(true);
                    } else {
                      setEditPersonOpen(false);
                      setEditPersonKey('');
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <button className="w-full flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent transition-colors text-left">
                      <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">
                        {person.label.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium truncate">{person.label}</span>
                      <IconPencil size={13} className="text-muted-foreground shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-3" align="end">
                    <p className="text-sm font-semibold mb-2">Person bearbeiten</p>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={editPersonName}
                        onChange={e => setEditPersonName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleEditPersonSave(); }}
                        className="text-sm h-8"
                        autoFocus
                        placeholder="Name..."
                      />
                      <Button size="sm" className="h-8 shrink-0" onClick={handleEditPersonSave}>
                        <IconCheck size={14} />
                      </Button>
                    </div>
                    {person.custom && (
                      <button
                        onClick={() => handleDeletePerson(person.key)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      >
                        <IconTrash size={13} />
                        Person löschen
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              ))
            )}
          </div>
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
      <Skeleton className="h-24 rounded-2xl" />
      <div className="flex flex-col lg:flex-row gap-4">
        <Skeleton className="lg:w-72 h-96 rounded-2xl" />
        <Skeleton className="flex-1 h-96 rounded-2xl" />
        <Skeleton className="lg:w-56 h-96 rounded-2xl" />
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
