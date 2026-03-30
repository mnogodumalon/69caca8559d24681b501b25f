import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichEinkaufseintrag } from '@/lib/enrich';
import type { EnrichedEinkaufseintrag } from '@/types/enriched';
import type { Einkaufsliste } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EinkaufslisteDialog } from '@/components/dialogs/EinkaufslisteDialog';
import { EinkaufseintragDialog } from '@/components/dialogs/EinkaufseintragDialog';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
} from '@tabler/icons-react';

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

  const activeList = useMemo(() => {
    if (selectedListId) return einkaufsliste.find(l => l.record_id === selectedListId) ?? einkaufsliste[0] ?? null;
    return einkaufsliste[0] ?? null;
  }, [einkaufsliste, selectedListId]);

  const activeListId = activeList?.record_id ?? null;

  const listItems = useMemo(
    () => enrichedEinkaufseintrag.filter(e => extractRecordId(e.fields.einkaufsliste_ref) === activeListId),
    [enrichedEinkaufseintrag, activeListId]
  );

  const doneCount = useMemo(() => einkaufseintrag.filter(e => e.fields.erledigt).length, [einkaufseintrag]);

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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Listen"
          value={String(einkaufsliste.length)}
          description="Einkaufslisten"
          icon={<IconShoppingBag size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Artikel"
          value={String(einkaufseintrag.length)}
          description="Gesamt"
          icon={<IconShoppingCart size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Erledigt"
          value={String(doneCount)}
          description="Abgehakt"
          icon={<IconCheck size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Offen"
          value={String(einkaufseintrag.length - doneCount)}
          description="Ausstehend"
          icon={<IconListCheck size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Master-Detail */}
      <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: '520px' }}>
        {/* Lists Panel */}
        <div className="lg:w-80 shrink-0 bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Meine Listen</h2>
            <Button size="sm" onClick={() => setListDialog({ open: true })}>
              <IconPlus size={14} className="shrink-0" />
              <span className="ml-1 hidden sm:inline">Neue Liste</span>
            </Button>
          </div>

          {einkaufsliste.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <IconShoppingBag size={48} className="text-muted-foreground" stroke={1.5} />
              <p className="text-sm text-muted-foreground">Noch keine Listen vorhanden.</p>
              <Button size="sm" variant="outline" onClick={() => setListDialog({ open: true })}>
                Erste Liste anlegen
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {einkaufsliste.map(list => {
                const prog = listProgress.get(list.record_id);
                const isActive = list.record_id === activeListId;
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
                      {prog && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${(prog.done / prog.total) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {prog.done}/{prog.total}
                          </span>
                        </div>
                      )}
                      {!prog && (
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

              {listItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <IconListCheck size={48} className="text-muted-foreground" stroke={1.5} />
                  <p className="text-sm text-muted-foreground">Noch keine Artikel in dieser Liste.</p>
                  <Button size="sm" variant="outline" onClick={() => setItemDialog({ open: true })}>
                    Ersten Artikel hinzufügen
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-border">
                  {listItems.map(item => (
                    <div
                      key={item.record_id}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors ${item.fields.erledigt ? 'opacity-60' : ''}`}
                    >
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

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${item.fields.erledigt ? 'line-through text-muted-foreground' : 'font-medium'}`}>
                          {item.fields.artikelname ?? '(Ohne Name)'}
                        </p>
                        {item.fields.zugeordneter_benutzer && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.fields.zugeordneter_benutzer.label}
                          </p>
                        )}
                      </div>

                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.fields.erledigt
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary/10 text-primary'
                      }`}>
                        {item.fields.erledigt ? 'Erledigt' : 'Offen'}
                      </span>

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <Skeleton className="lg:w-80 h-96 rounded-2xl" />
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
