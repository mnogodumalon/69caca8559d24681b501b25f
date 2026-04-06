import type { Einkaufseintrag, Einkaufsliste } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { IconPencil } from '@tabler/icons-react';

interface EinkaufseintragViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Einkaufseintrag | null;
  onEdit: (record: Einkaufseintrag) => void;
  einkaufslisteList: Einkaufsliste[];
}

export function EinkaufseintragViewDialog({ open, onClose, record, onEdit, einkaufslisteList }: EinkaufseintragViewDialogProps) {
  function getEinkaufslisteDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return einkaufslisteList.find(r => r.record_id === id)?.fields.listenname ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Einkaufseintrag anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Einkaufsliste</Label>
            <p className="text-sm">{getEinkaufslisteDisplayName(record.fields.einkaufsliste_ref)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Artikelname</Label>
            <p className="text-sm">{record.fields.artikelname ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Zugeordneter Benutzer</Label>
            <Badge variant="secondary">{record.fields.zugeordneter_benutzer?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Erledigt</Label>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
              record.fields.erledigt ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {record.fields.erledigt ? 'Ja' : 'Nein'}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}