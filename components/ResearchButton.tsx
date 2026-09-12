'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { WorkingMark } from '@/components/Working';
import { generateVehicleDossier } from '@/app/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { logger } from '@tappet/core/logger';

interface ResearchButtonProps {
  vehicleId: string;
  year: number;
  make: string;
  model: string;
  hasData: boolean;
}

export default function ResearchButton({ vehicleId, year, make, model, hasData }: ResearchButtonProps) {
  const [isResearching, setIsResearching] = useState(false);
  const router = useRouter();

  const handleResearch = async () => {
    setIsResearching(true);
    toast.loading('Researching vehicle information...', { id: 'research' });

    try {
      const vehicleData = { id: vehicleId, year, make, model };
      const result = await generateVehicleDossier(vehicleId, vehicleData);

      if (result.success) {
        toast.success('Vehicle research completed! Reloading...', { id: 'research' });
        router.refresh();
      } else {
        const errorMsg = result.error || 'Research failed. Please try again.';
        logger.error('RESEARCH_BUTTON:FAILED', new Error(errorMsg));
        toast.error(errorMsg, { id: 'research' });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
      logger.error('RESEARCH_BUTTON:EXCEPTION', error as Error);
      toast.error(errorMsg, { id: 'research' });
    } finally {
      setIsResearching(false);
    }
  };

  return (
    <Button
      onClick={handleResearch}
      disabled={isResearching}
      variant="ghost"
      size="sm"
      /*
        ⚠ Quiet, and now unframed. This was `border-accent/50 text-accent` — a
        fully saturated cyan outline on a secondary action, which made
        refreshing the research the loudest control on a page whose subject is
        the car's specification. Cyan is the mark now, not the accent for
        ordinary controls; see the note on links in `DiagnosticHero`.

        ⚠ **5 Sep: the box came off too.** Quieting the colour left the only
        framed element on `/vehicle-info` sitting at heading level, and a
        critique of the rendered page read it as outranking the section head
        beside it. Brief B5 removes radii and frames; a secondary action does
        not get to be the one thing on the page still wearing a border.

        Mono, because B1 gives every label and state word on this page one
        voice, and this is a state word — it says what will happen.
      */
      className="mono h-auto px-0 text-xs uppercase tracking-widest text-white/55 hover:bg-transparent hover:text-white"
    >
      {isResearching ? (
        <>
          <WorkingMark className="mr-2 h-4 w-4" />
          Researching...
        </>
      ) : (
        <>
          {hasData ? 'Refresh research' : 'Generate research'}
        </>
      )}
    </Button>
  );
}
