'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Zap, ChartBar as BarChart3, DollarSign, Wrench, CircleAlert as AlertCircle, Plus } from 'lucide-react';
import { Working, WorkingMark } from '@/components/Working';
import { generateModificationDetails, addModificationToWishlist } from '@/app/actions';
import { toast } from 'sonner';

interface ModificationDetailsCardProps {
  vehicleId: string;
  modName: string;
  vehicle: any;
  details?: any;
}

export default function ModificationDetailsCard({ vehicleId, modName, vehicle, details: initialDetails }: ModificationDetailsCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [isManualLoading, setIsManualLoading] = useState(false);
  const [isAddingToWishlist, setIsAddingToWishlist] = useState(false);
  const [details, setDetails] = useState(initialDetails);
  const [addedToWishlist, setAddedToWishlist] = useState(false);

  useEffect(() => {
    if (initialDetails) {
      setDetails(initialDetails);
    }
  }, [initialDetails]);

  const handleGenerateDetails = async (isAuto: boolean = false) => {
    if (isAuto) {
      setIsAutoLoading(true);
    } else {
      setIsManualLoading(true);
    }

    const result = await generateModificationDetails(vehicleId, modName, vehicle, vehicle.performance_mindedness);

    if (result.success) {
      setDetails(result.data);
      if (!isAuto) {
        setIsExpanded(true);
        toast.success('Modification analysis generated');
      }
    } else if (!isAuto) {
      toast.error('Failed to generate analysis');
    }

    if (isAuto) {
      setIsAutoLoading(false);
    } else {
      setIsManualLoading(false);
    }
  };

  const handleAddToWishlist = async () => {
    setIsAddingToWishlist(true);
    const result = await addModificationToWishlist(vehicleId, modName);

    if (result.success) {
      setAddedToWishlist(true);
      toast.success('Added to wishlist');
    } else {
      toast.error(result.error || 'Failed to add to wishlist');
    }
    setIsAddingToWishlist(false);
  };

  if (!details) {
    const analyzing = isAutoLoading || isManualLoading;

    /*
      ── An absence is not a wait — 11 Sep ──────────────────────────────────

      This branch drew two grey skeleton bars under the mod's name and, beneath
      them, "No analysis yet". Nothing was loading. The bars pulsed for as long
      as the card was on screen, which for a mod nobody had asked about was
      forever — an empty state wearing loading's clothes, and the screenshot
      David sent when he asked for waits that buy patience.

      So the two states stop sharing a drawing. Not analysed: the system's
      empty treatment — one mono line, the action beside it, nothing that
      moves. Analysing: the wait instrument, with the facts this card was
      handed. The button carries its own mark while it is the thing pressed,
      and the card body says what the call is doing.
    */
    return (
      <div className="cut-panel border border-white/8 bg-[hsl(var(--card))]/95 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-white text-sm">{modName}</h4>
            {analyzing ? (
              <Working
                variant="compact"
                className="mt-3"
                line="Analyzing this mod"
                /*
                  Every word here is a fact the card holds: the mod, the car,
                  and the five sections the answer always has. No stages — one
                  call — and no duration, because nobody has measured one.
                */
                detail={`${modName} on a ${vehicle.year} ${vehicle.make} ${vehicle.model}. Performance, reliability, cost and fitment come back together.`}
              />
            ) : (
              <p className="mono mt-1.5 text-xs uppercase tracking-[0.14em] text-white/55">
                Not analyzed yet
              </p>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => handleGenerateDetails(false)}
            disabled={analyzing}
            className="whitespace-nowrap transition-colors flex-shrink-0"
          >
            {analyzing ? (
              <>
                <WorkingMark className="h-3 w-3 mr-1" />
                Analyzing
              </>
            ) : (
              'Analyze Mod'
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-white text-base">{modName}</CardTitle>
            {details.alignment_with_goals && (
              <p className="text-white/60 text-xs mt-2">{details.alignment_with_goals}</p>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="font-semibold px-4 shadow-lg transition-all hover:shadow-xl hover:scale-105"
          >
            {isExpanded ? (
              <>
                <span className="mr-2 text-xs">Show Less</span>
                <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                <span className="mr-2 text-xs">See Details</span>
                <ChevronDown className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {details.performance_impact && (
            <div className="flex gap-3">
              <Zap className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h5 className="text-white/80 text-xs font-semibold mb-1">Performance Impact</h5>
                <p className="text-white/60 text-xs leading-relaxed">{details.performance_impact}</p>
              </div>
            </div>
          )}

          {details.reliability_impact && (
            <div className="flex gap-3">
              <AlertCircle className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h5 className="text-white/80 text-xs font-semibold mb-1">Reliability Impact</h5>
                <p className="text-white/60 text-xs leading-relaxed">{details.reliability_impact}</p>
              </div>
            </div>
          )}

          {details.cost_benefit_analysis && (
            <div className="flex gap-3">
              <DollarSign className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h5 className="text-white/80 text-xs font-semibold mb-1">Cost & Value</h5>
                <p className="text-white/60 text-xs leading-relaxed">{details.cost_benefit_analysis}</p>
              </div>
            </div>
          )}

          {details.installation_notes && (
            <div className="flex gap-3">
              <Wrench className="h-4 w-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h5 className="text-white/80 text-xs font-semibold mb-1">Installation Notes</h5>
                <p className="text-white/60 text-xs leading-relaxed">{details.installation_notes}</p>
              </div>
            </div>
          )}

          {details.compatibility_notes && (
            <div className="flex gap-3">
              <BarChart3 className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h5 className="text-white/80 text-xs font-semibold mb-1">Compatibility</h5>
                <p className="text-white/60 text-xs leading-relaxed">{details.compatibility_notes}</p>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-white/10">
            {addedToWishlist ? (
              <Badge className="bg-green-500/20 text-green-300 border-green-500/30 w-full justify-center py-2">
                <Plus className="h-3 w-3 mr-1" />
                Added to Wishlist
              </Badge>
            ) : (
              <Button
                size="sm"
                onClick={handleAddToWishlist}
                disabled={isAddingToWishlist}
                className="w-full h-8 transition-colors"
              >
                {isAddingToWishlist ? (
                  <>
                    <WorkingMark className="h-3 w-3 mr-1" />
                    Adding
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3 mr-1" />
                    Add to Needs
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
