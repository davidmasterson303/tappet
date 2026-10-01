'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { COULD_NOT_SAVE, NO_ANSWER, answerSentence } from '@/lib/api-error-copy';
import { logger } from '@tappet/core/logger';
import { wishlistItemIdentifier } from '@tappet/core/wishlist-identifier';

interface AddWishlistItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  onSuccess: () => void;
}

export function AddWishlistItemDialog({
  open,
  onOpenChange,
  vehicleId,
  onSuccess,
}: AddWishlistItemDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    itemType: 'maintenance' as 'issue' | 'maintenance' | 'modification',
    itemName: '',
    description: '',
    category: '',
    estimatedCostParts: 0,
    estimatedCostLabor: 0,
    estimatedLaborHours: 0,
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.itemName.trim()) {
      toast.error('Give it a name first.');
      return;
    }

    try {
      setLoading(true);

      // Canonical identifier — the `source` column records that this came in
      // manually. Encoding it in the key is what broke dedupe across surfaces.
      const itemIdentifier = wishlistItemIdentifier(formData.itemType, formData.itemName);

      const response = await fetch('/api/v1/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          itemType: formData.itemType,
          itemName: formData.itemName,
          itemIdentifier,
          description: formData.description || null,
          category: formData.category || null,
          estimatedCostParts: formData.estimatedCostParts,
          estimatedCostLabor: formData.estimatedCostLabor,
          estimatedLaborHours: formData.estimatedLaborHours,
          notes: formData.notes || null,
          source: 'manual',
        }),
      });

      if (response.ok) {
        setFormData({
          itemType: 'maintenance',
          itemName: '',
          description: '',
          category: '',
          estimatedCostParts: 0,
          estimatedCostLabor: 0,
          estimatedLaborHours: 0,
          notes: '',
        });
        onSuccess();
      } else {
        const data = await response.json();
        if (response.status === 409) {
          toast.error('That is already in Needs');
        } else {
          toast.error(answerSentence(data, COULD_NOT_SAVE));
        }
      }
    } catch (error) {
      logger.error('ADD_WISHLIST_DIALOG:SUBMIT', error as Error);
      toast.error(NO_ANSWER);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add to Needs</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="itemType">Item type</Label>
              <Select
                value={formData.itemType}
                onValueChange={(value: 'issue' | 'maintenance' | 'modification') =>
                  setFormData({ ...formData, itemType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="issue">Issue or repair</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="modification">Modification or upgrade</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="itemName">Item name *</Label>
              <Input
                id="itemName"
                value={formData.itemName}
                onChange={(e) =>
                  setFormData({ ...formData, itemName: e.target.value })
                }
                placeholder="e.g., oil change, new tires, cold air intake"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Additional details about this item…"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="e.g., fluids, brakes, engine, suspension"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="estimatedCostParts">Estimated parts cost ($)</Label>
                <Input
                  id="estimatedCostParts"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.estimatedCostParts}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      estimatedCostParts: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="estimatedCostLabor">Estimated labor cost ($)</Label>
                <Input
                  id="estimatedCostLabor"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.estimatedCostLabor}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      estimatedCostLabor: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="estimatedLaborHours">Estimated labor hours</Label>
              <Input
                id="estimatedLaborHours"
                type="number"
                min="0"
                step="0.1"
                value={formData.estimatedLaborHours}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    estimatedLaborHours: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Any additional notes…"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" busy={loading} busyLabel="Adding">
              Add to Needs
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
