'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import VehicleInsights from '@/components/VehicleInsights';
import { Button } from '@/components/ui/button';
import SpecBand from '@/components/SpecBand';
import { Working } from '@/components/Working';
import ResearchButton from '@/components/ResearchButton';
import { adviceDisclosure } from '@tappet/core/advice-disclosure';
import { getClientSupabase } from '@/lib/supabase';
import { logger } from '@tappet/core/logger';
import TCOCard from '@/components/TCOCard';
import TCOInputsModal from '@/components/TCOInputsModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVehicleImage } from '@/hooks/useSignedUrl';

const ENABLE_TCO = false;

function cleanPowertrain(value: string | null | undefined): string {
  if (!value) return '\u2014';
  if (value.toLowerCase().includes(' or ')) {
    const firstOption = value.split(' or ')[0].trim();
    return `${firstOption} (multiple options available)`;
  }
  return value;
}

/**
 * One row of the spec table: label left, value right, hairline under.
 *
 * ⚠ **Powertrain and fluids are the same kind of data and now wear the same
 * form.** They were two bands with two treatments — three floating equal-thirds
 * columns for the powertrain, a ruled right-aligned table for the fluids — and
 * a critique of the rendered page put the cost plainly: the same label-to-text
 * pairs set two ways, with the first band four-fifths empty. One form, one
 * head, one fewer heading to read past.
 *
 * ⚠ Stacked below `sm`, side by side above it. The row was label-left /
 * value-right at every width once, and a long value ("0W-30 or 0W-40 Full
 * Synthetic (BMW LL-01 spec)") wrapped to three lines of **right-aligned** body
 * copy in a narrow column — ragged-left, the hardest alignment to read, four
 * rows running.
 *
 * ── ⚠ Two columns, not `justify-between` ───────────────────────────────────
 *
 * The row used to push its label and value to opposite margins, so the value's
 * **left** edge landed wherever its own text happened to start: measured at
 * 1440, ENGINE's value began at x=1077 and COOLANT's at x=1043, with roughly
 * 950px of nothing between each label and its value. Seven rows of that read as
 * a stretched definition list rather than a table — the pairing was carried
 * entirely by the hairline.
 *
 * A half-and-half grid gives every value one left edge at x=720, which is
 * within 3px of where the header stat strip's first column starts (x=723,
 * measured), so the strip and the table below it share a vertical axis.
 *
 * ⚠ The values stay **right-aligned inside that column**, so the numerals still
 * meet at a common right edge — B7 asks for right-aligned numerals and this
 * does not walk that back, it just stops the column from being the full page.
 */
function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 first:pt-0 sm:grid sm:grid-cols-2 sm:items-baseline">
      <span className="mono label-uppercase block sm:mb-0">{label}</span>
      <span className="mono mt-1 block text-sm text-white sm:mt-0 sm:text-right">{value}</span>
    </div>
  );
}

/*
  ── An absence, not a wait ──────────────────────────────────────────────────

  This held a static spinner glyph in a rounded tile — the loading icon, not
  spinning, over a sentence about research that is not running on this
  page. A loader that does not move reads as one that is stuck. The empty
  band takes the system's empty treatment instead: the mono line, nothing
  that suggests motion, and the sentence saying what fills it.
*/
function EmptySpec({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
      <p className="mono text-xs uppercase tracking-[0.14em] text-white/55">Not researched yet</p>
      <p className="text-sm text-white/50 leading-relaxed max-w-xs">
        {label} will be available after vehicle research is complete.
      </p>
    </div>
  );
}

export default function VehicleInfoPage({ params }: { params: { vehicleId: string } }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [perfOverrides, setPerfOverrides] = useState<Record<string, any>>({});
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfChecked, setPerfChecked] = useState(false);
  const [tcoModalOpen, setTcoModalOpen] = useState(false);

  const cachedData = queryClient.getQueryData<any>(['dashboard', params.vehicleId]);
  const cachedVehicle = cachedData?.vehicle ?? (cachedData?.id ? cachedData : undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicle-info', params.vehicleId],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!params.vehicleId,
    queryFn: async () => {
      const supabase = getClientSupabase();
      const [vehicleResult, knowledgeResult] = await Promise.all([
        supabase.from('vehicles').select('*').eq('id', params.vehicleId).maybeSingle(),
        supabase.from('vehicle_knowledge_base').select('*').eq('vehicle_id', params.vehicleId).maybeSingle()
      ]);

      if (vehicleResult.error) throw vehicleResult.error;
      if (!vehicleResult.data) throw new Error('Vehicle not found');

      return {
        vehicle: vehicleResult.data,
        knowledge: knowledgeResult.data,
      };
    },
  });

  const fetchPerformanceStats = useCallback(async (forceRefresh = false) => {
    if (!data?.vehicle) return;
    setPerfLoading(true);
    try {
      const response = await fetch('/api/v1/performance-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: params.vehicleId, forceRefresh }),
      });
      const json = await response.json();
      if (json.success && json.stats) {
        setPerfOverrides((prev) => ({
          ...prev,
          stock_hp: json.stats.stock_hp ?? prev.stock_hp,
          stock_torque: json.stats.stock_torque ?? prev.stock_torque,
          stock_zero_to_sixty: json.stats.stock_zero_to_sixty ?? prev.stock_zero_to_sixty,
          modified_hp: json.stats.modified_hp !== undefined ? json.stats.modified_hp : prev.modified_hp,
          modified_torque: json.stats.modified_torque !== undefined ? json.stats.modified_torque : prev.modified_torque,
          modified_zero_to_sixty: json.stats.modified_zero_to_sixty !== undefined ? json.stats.modified_zero_to_sixty : prev.modified_zero_to_sixty,
        }));
      }
    } catch (err) {
      logger.error('VEHICLE_INFO:PERF_STATS', err as Error);
    } finally {
      setPerfLoading(false);
    }
  }, [data?.vehicle?.id, params.vehicleId]);

  useEffect(() => {
    if (data?.vehicle && !perfChecked) {
      setPerfChecked(true);
      fetchPerformanceStats();
    }
  }, [data?.vehicle?.id, perfChecked]);

  // Above the loading and error branches: the cached vehicle and the fetched
  // one are the same car, and a hook cannot be called inside a branch.
  const vehicleImage = useVehicleImage(data?.vehicle ?? cachedVehicle);

  if (isLoading) {
    if (cachedVehicle) {
      return (
        <DashboardLayout vehicle={cachedVehicle} currentPage="vehicle-info" vehicleImage={vehicleImage}>
          <div className="flex items-center justify-center py-32">
            <Working delay line="Opening the specifications" />
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <Working delay line="Opening the specifications" />
      </div>
    );
  }

  if (error) {
    if (error.message === 'Vehicle not found') {
      router.replace('/garage');
      return null;
    }
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4 sm:px-6">
          <div className="bg-red-500/10 border border-red-400/25 rounded-2xl p-4 sm:p-6">
            <h2 className="text-red-300 font-semibold mb-2">Error Loading Vehicle Info</h2>
            <p className="text-red-200/60 mb-5 text-sm">{error.message}</p>
            <Button onClick={() => router.push('/garage')} variant="outline" className="border-white/15 text-white/70 hover:bg-white/8">
              Back to Garage
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data?.vehicle) return null;

  const { knowledge } = data;
  // Merge cached vehicle with any live perf overrides
  const vehicle = { ...data.vehicle, ...perfOverrides };

  const fluidSpecs = knowledge?.fluid_specs || {};
  const interestingFacts = knowledge?.interesting_facts || [];

  const displayHP = vehicle.modified_hp || vehicle.stock_hp;
  const displayTorque = vehicle.modified_torque || vehicle.stock_torque;
  const displayZeroToSixty = vehicle.modified_zero_to_sixty || vehicle.stock_zero_to_sixty;

  const hasModifications = vehicle.modified_hp || vehicle.modified_torque || vehicle.modified_zero_to_sixty;
  const hasPerformanceData = vehicle.stock_hp || vehicle.stock_torque || vehicle.stock_zero_to_sixty;
  const hasInterestingFacts = interestingFacts.length > 0;
  const hasPowertrainData = knowledge?.engine_type || knowledge?.transmission_type || knowledge?.drivetrain;

  return (
    <DashboardLayout
      vehicle={vehicle}
      knowledge={knowledge}
      currentPage="vehicle-info"
      vehicleImage={vehicleImage}
      /*
        Every child here is a bordered card already, so the layout's panel was
        a third rounded rectangle around them — the nesting two critiques
        counted on this page.
      */
      contentSurface="bare"
    >
      <div className="space-y-5">
        {/*
          ── ⚠ The research action belongs to a section, not to a dead band ───

          It sat in a `flex justify-end` of its own: a lone pill right-aligned
          in an otherwise empty row — about 90px of a phone's screen, and on a
          desktop a button with 1000px of nothing to its left. A design critique
          named it precisely: "a section-level action with no section header to
          belong to… as-is it reads as an unfinished layout region."

          It belongs to this card, which is where the research lands. Giving the
          card a header gives the button somewhere to be and gives the first
          block on the page a name.
        */}
        {/*
          ── ⚠ One band for one kind of data ─────────────────────────────────

          This was two: SPECIFICATION as three equal-thirds columns with the
          values at the same size as their labels, and FLUIDS as a ruled
          right-aligned table below it. Same data shape, two forms, and the
          first band left four-fifths of its row empty to hold three short
          words.

          The powertrain rows are the table's first three; FLUIDS survives as a
          mono group label inside it rather than as a second heading. Fewer
          heads, one form, and the eye reads one column of labels down the page
          instead of re-learning the layout halfway.
        */}
        <SpecBand title="Specification">
          {/*
            ⚠ **No FLUIDS sub-label.** Folding the two bands left it sitting a
            gap above COOLANT with no rule of its own and the *same* 12px mono
            weight as every row label beside it — so it read as a row whose
            value had failed to load, which is the worst thing a spec table can
            imply. A critique of the rendered page called it exactly that.

            It is cut rather than promoted because it was never carrying
            information: COOLANT, ENGINE OIL, BRAKE FLUID and TRANSMISSION FLUID
            each say "fluid" in their own first or last word. Seven rows, one
            table, one left edge for the eye to run down.
          */}
          <div className="divide-y divide-white/8">
            <SpecRow label="Engine" value={cleanPowertrain(knowledge?.engine_type)} />
            <SpecRow label="Transmission" value={cleanPowertrain(knowledge?.transmission_type)} />
            <SpecRow label="Drivetrain" value={cleanPowertrain(knowledge?.drivetrain)} />
            {Object.entries(fluidSpecs).map(([key, value]: [string, any]) => (
              <SpecRow key={key} label={key.replace(/_/g, ' ')} value={String(value)} />
            ))}
          </div>

          {Object.keys(fluidSpecs).length === 0 && (
            <div className="mt-7">
              <EmptySpec label="Fluid specifications" />
            </div>
          )}
        </SpecBand>

        {/*
          ── ⚠ The floating refresh icon is gone — the brief cut it ───────────

          It sat at this heading's right edge as a bare glyph while
          `ResearchButton` sat at Specification's as a bordered, labelled
          button: one page, two treatments, for two actions a reader had no way
          to tell apart. The locked brief lists "the floating refresh icon"
          among the cuts it accepts, and a critique of the rendered page called
          this one an orphan.

          ⚠ **No capability goes with it.** `fetchPerformanceStats()` already
          runs on mount — this control only re-ran a fetch that happens anyway,
          which is why it can be deleted outright while `ResearchButton`, which
          triggers work nothing else triggers, moves to the foot instead.
        */}
        <SpecBand title="Performance">
            {perfLoading && !hasPerformanceData ? (
              /*
                `/api/v1/performance-stats` asks the model once for the
                factory figures and the same figures with the installed mods.
                Naming the three is what the answer contains; it is not a
                claim about how far along the call is.
              */
              <div className="py-4">
                <Working
                  panel={false}
                  line="Looking up performance figures"
                  detail="Stock horsepower, torque and 0–60, and the same figures with the installed mods."
                />
              </div>
            ) : (
              <>
                {/*
                  ── ⚠ Three columns on a phone, not three stacked tiles ──────

                  Each figure was a full-width centred card with its own border,
                  radius, icon and padding — about 500px of screen for one
                  number, so three numbers cost roughly four screens of thumb
                  travel. A design critique called it the single largest failure
                  on the page, and it is a mobile-first product.

                  They are three readings of one thing and they belong on one
                  line. An instrument panel is dense; that density *is* the
                  luxury register this page is reaching for.

                  ⚠ The glyphs are gone with the tiles. `Zap` was doing duty for
                  Torque here, for Drivetrain above and for Performance Stats in
                  the header — an icon that means three things means none, and
                  these were chosen to fill circles rather than to say anything.
                */}
                {/*
                  ── ⚠ The frame around these three came off — brief B6 ───────

                  It was a bordered, filled, rounded panel *inside* a card: two
                  containers to show three numbers. The critique named the pair
                  as this page's clearest generated tell — "three-up centred
                  stat cells inside a nested bordered panel" — and B6 is
                  explicit that a nested card becomes a hairline-ruled band.

                  The dividers were already doing the work. Removing the frame
                  leaves them doing it alone, and the figures land on the same
                  graphite as the rest of the page.

                  ⚠ Left-aligned, not centred. These are readings, and the
                  header strip above sets the pattern the page should keep: the
                  numeral starts where the label starts, so the eye reads down a
                  column rather than hunting three centres.
                */}
                <div className="grid grid-cols-3">
                  {[
                    {
                      /*
                        ⚠ "Power", not "Horsepower". At 12px with the house
                        label tracking the longer word measures 97px into an
                        80px cell — measured, not estimated — and overflowed.
                        "Power" is what the figure is called next to torque,
                        and `hp` is printed beside the number anyway.
                      */
                      label: 'Power',
                      value: displayHP,
                      unit: 'hp',
                      delta: hasModifications && vehicle.stock_hp ? `+${(displayHP || 0) - vehicle.stock_hp} from stock` : null,
                    },
                    {
                      label: 'Torque',
                      value: displayTorque,
                      unit: 'lb-ft',
                      delta: hasModifications && vehicle.stock_torque ? `+${(displayTorque || 0) - vehicle.stock_torque} from stock` : null,
                    },
                    {
                      label: '0-60 mph',
                      value: displayZeroToSixty,
                      unit: 's',
                      delta: hasModifications && vehicle.stock_zero_to_sixty && displayZeroToSixty
                        ? `-${(vehicle.stock_zero_to_sixty - displayZeroToSixty).toFixed(2)}s faster`
                        : null,
                    },
                  ].map(({ label, value, unit, delta }) => (
                    <div key={label} className="pr-4 first:pl-0">
                      <div className="mono num text-4xl sm:text-[56px] font-bold leading-none text-white">
                        {value || '\u2014'}
                        {value && <span className="mono text-xs font-normal text-white/70 ml-1">{unit}</span>}
                      </div>
                      <p className="mono label-uppercase mt-2.5">{label}</p>
                      {/*
                        ⚠ Not green. "+52 from stock" is a fact about a
                        modification, not a good or a bad one, and the health
                        ramp's green is this product's word for "fine" — a
                        figure borrowing it claims a judgement nothing made.
                      */}
                      {delta && <p className="mt-1 text-xs text-white/55">{delta}</p>}
                    </div>
                  ))}
                </div>

                {/*
                  ⚠ The second loading indicator is gone.

                  A "Checking for updates…" line sat under the figures while the
                  refresh control in this card's own header spun at the same
                  time — two indicators for one fetch, and a critique read the
                  line as permanent furniture: "a perpetual loading affordance
                  under the hero stats is the opposite of well kept".

                  The spinning glyph is the indicator, and it is attached to the
                  control that started the work. Nothing is lost but the
                  duplicate.
                */}
              </>
            )}
        </SpecBand>

        {ENABLE_TCO && (
          <>
            <TCOCard
              vehicle={vehicle}
              vehicleId={params.vehicleId}
              onEditInputs={() => setTcoModalOpen(true)}
            />
            <TCOInputsModal
              open={tcoModalOpen}
              onOpenChange={setTcoModalOpen}
              vehicleId={params.vehicleId}
              vehicle={vehicle}
              onSaved={(updated) => setPerfOverrides((prev) => ({ ...prev, ...updated }))}
            />
          </>
        )}

        {/*
          ── ⚠ 8 Sep · known issues came here, and this is why here ───────────

          They were a tab inside a card called "The Dossier", inside a
          collapsible, at the foot of the dashboard. An IA review of the
          rendered page found the product's most expensive capability —
          research into what goes wrong on *this* year, make and model —
          wearing a disguise: the dashboard mentioned "Four tracked known
          issues" in one line of prose and offered no way to read them.

          This page already carries everything else the research produced —
          the specification, the fluids, "Worth knowing" — from the same
          `vehicle_knowledge_base` row. Known issues were the one output of
          that research filed somewhere else, so a reader who wanted to know
          what this model does wrong had to leave the page about this model.

          ⚠ Above "Worth knowing" deliberately. Trivia should not outrank a
          list of failures the owner can act on, and each issue here carries
          its own path into the needs list on the Plan tab.
        */}
        {knowledge ? (
          <SpecBand title="Known issues">
            <VehicleInsights vehicle={data.vehicle} knowledge={knowledge} section="issues" />
          </SpecBand>
        ) : null}

        <SpecBand title="Worth knowing">
          <>
              {/*
                ── ⚠ It said "Five" and rendered three ─────────────────────

                The prompt asks the model for five facts; the model returned
                three for this car, and the heading counted anyway. For a
                product whose stated position is that it makes no claim the
                data cannot support, a title that miscounts the list beneath it
                is a credibility wound rather than a nitpick — and it is the
                same defect class as a score computed from no evidence, in
                copy.

                So the heading stops counting. "Worth knowing" is true at three
                facts and at five, which is the only wording that can be.
              */}

            {/*
              ⚠ A hairline-divided list, not one bordered tile per fact inside a
              bordered card inside a bordered page panel. Three levels of
              rounded rectangle for a sentence apiece is the nesting two
              critiques named as this page's most generated-looking habit — and
              the numerals in circles implied a ranking that nothing computes.
            */}
            {interestingFacts.length > 0 ? (
              <div className="divide-y divide-white/8">
                {/*
                  ⚠ 01/02/03, and the index is not a ranking. B7 sets this
                  page's lists as a mono spec table with 01-style indices, and
                  the earlier objection — that numerals in circles "implied a
                  ranking that nothing computes" — was about the circles and the
                  emphasis, not the counting. A flat mono index in the margin
                  reads as an enumeration, which is what a list of three facts
                  is.
                */}
                {interestingFacts.map((fact: string, index: number) => (
                  <div key={`fact-${index}`} className="flex py-3 first:pt-0 last:pb-0">
                    <span className="mono num w-8 shrink-0 text-xs leading-normal text-white/70">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <p className="text-sm leading-normal text-white/70">{fact}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptySpec label="Interesting facts" />
            )}
          </>
        </SpecBand>

        {/*
          ── ⚠ The page says a model wrote it — UX-16, on a surface nobody
             counted ──────────────────────────────────────────────────────────

          Every figure above this line came out of the research model: the
          engine, the gearbox, the fluid specifications, all three facts. The
          page carried a control labelled "Refresh research" and no disclosure
          at all, which is the exact state UX-16 and LEG-05 were raised to end
          — and `advice-says-it-is-generated.test.ts` says in its own note why
          a surface missing from its table has to read as a defect rather than
          as one nobody got to.

          ⚠ It is `'research'`, not `'plan'`. The claim that matters here is
          the *matching level*: this was researched for a 2018 Honda Accord
          Sport, not for **this** one. See the note in `advice-disclosure.ts`.

          The action sits with it because this is where the sentence about
          generated content already is, and because a critique read it framed
          at heading level as outranking the section head beside it.
        */}
        <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
          <p className="mono max-w-2xl text-xs leading-relaxed text-white/50">
            {adviceDisclosure('research')}
          </p>
          <ResearchButton
            vehicleId={vehicle.id}
            year={vehicle.year}
            make={vehicle.make}
            model={vehicle.model}
            hasData={hasPerformanceData || hasInterestingFacts || hasPowertrainData}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
