'use client';

import {
  TIRE_COPY,
  formatDateMono,
  formatMiles,
  pastCaption,
  rotationRows,
  sinceLabel,
  staggeredConsequences,
  tireAxis,
  tireReading,
  tireStats,
  tireSubline,
  type TireAxis,
  type TireProvenance,
  type TireReading,
  type TireRotation,
  type TireSet,
} from '@tappet/core/tires';
import { Button } from '@/components/ui/button';

/**
 * The tire set on the web — the phone's leaf, in the browser's grammar.
 *
 * Same derivations, same copy, same rules, drawn once here: `TIRE_COPY` for
 * every string, `tireReading` for every figure, `tireAxis` for every tick and
 * the one sodium run. The geometry is the graded reference's (design-loop/
 * tires/v11-set.html), which was HTML to begin with: a strip, a title block,
 * the instrument, the record. Where the phone measures its width in
 * `onLayout`, this positions in percentages of one container — the same
 * fraction core hands both — so no width is ever measured or written.
 *
 * ── ⚠ Not a progress bar, and one sodium mark ───────────────────────────────
 *
 * The run grows *from* the missed due point toward today and has no maximum;
 * its length is the overrun at the axis's own scale. No track, no fill, no
 * percentage. Sodium is the 2px line and nothing else on this page — the
 * caption under it is ink, the state words are ink, and there is no
 * `--attention` on any word. Cyan appears only where the layout already puts
 * it (the active tab, focus rings).
 *
 * ── Provenance ──────────────────────────────────────────────────────────────
 *
 * Three shapes, no colour, no icon (`service-provenance.ts` already draws the
 * distinction in words): a filled square with the house cut for a record read
 * off an invoice, a hairline square for one the owner typed, a 6px hairline on
 * the baseline for today's derived reading. The row's `aria-label` says the
 * same thing in words.
 */

export interface TireRecordProps {
  vehicleName: string;
  odometer: number | null;
  set: TireSet | null;
  rotations: TireRotation[];
  onAddSet: () => void;
  onEditSet: (set: TireSet) => void;
  onEnterInterval: (set: TireSet) => void;
  onAddRotation: (set: TireSet, rotations: TireRotation[]) => void;
  onRemoveRotation: (rotation: TireRotation) => void;
}

const SPOKEN: Record<TireProvenance | 'derived', string> = {
  invoice: 'read off a scanned invoice',
  typed: 'typed by you',
  derived: 'from the odometer',
};

/** The 6 × 6 mark. `derived` lies on the baseline; the two squares centre on the cap height. */
function Mark({ provenance, className = '' }: { provenance: TireProvenance | 'derived'; className?: string }) {
  if (provenance === 'derived') {
    return <span aria-hidden="true" className={`block h-px w-1.5 bg-white/40 ${className}`} />;
  }
  if (provenance === 'invoice') {
    return (
      <span
        aria-hidden="true"
        className={`block h-1.5 w-1.5 bg-[color:hsl(var(--foreground))] ${className}`}
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 2px 100%, 0 calc(100% - 2px))' }}
      />
    );
  }
  return <span aria-hidden="true" className={`block h-1.5 w-1.5 border border-white/40 ${className}`} />;
}

function Strip({ stats }: { stats: Array<{ label: string; value: string }> }) {
  if (stats.length === 0) return null;
  return (
    <dl className="flex border-y border-white/8 py-2">
      {stats.map((stat, i) => (
        <div key={stat.label} className={`flex-1 px-3 ${i > 0 ? 'border-l border-white/8' : ''}`}>
          <dt className="mono text-[12px] uppercase tracking-[0.8px] text-white/55">{stat.label}</dt>
          <dd className="mono mt-0.5 truncate text-[13px] text-white">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The strip odometer — see `apps/mobile/src/components/StripOdometer.tsx` for the argument in full. */
function Instrument({ reading, axis }: { reading: TireReading; axis: TireAxis | null }) {
  if (reading.since === null) return null;
  const label = sinceLabel(reading.sinceBasis);
  const pct = (x: number) => `${(x * 100).toFixed(4)}%`;

  return (
    <div data-testid="tire-instrument">
      <div className="flex items-start justify-between gap-3">
        <div className="display-instrument text-[44px] leading-[48px] text-white tabular-nums" data-testid="tire-since">
          {reading.since.toLocaleString('en-US')}
        </div>
        <div className="mono space-y-2 pt-1 text-right text-[12px] uppercase tracking-[0.8px] text-white/55">
          {label ? <div>{label}</div> : null}
          {reading.interval ? (
            <div>
              {TIRE_COPY.yourInterval} <span className="text-white">{formatMiles(reading.interval.miles)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {axis ? (
        <div className="relative mt-2 h-[52px]" data-testid="tire-axis">
          {/* The line — a drawn instrument line, one hairline token. */}
          <div className="absolute left-0 right-0 top-[26px] h-px bg-white/40" />
          {/* The one sodium mark: 2px, from the missed due point to today, over the line. */}
          {axis.run ? (
            <div
              data-testid="tire-run"
              className="absolute top-[25.5px] h-[2px]"
              style={{ left: pct(axis.run.from), width: pct(axis.run.to - axis.run.from), background: 'var(--attention)' }}
            />
          ) : null}
          {axis.events.map((event, i) => (
            <div key={`${event.kind}-${i}`} data-testid="tire-event">
              <div
                className="absolute top-[18px] h-4 w-[1.5px] bg-white"
                style={{ left: `calc(${pct(event.x)} - 0.75px)` }}
              />
              {/* The float line: the squares stand on it, the derived hairline lies on it (5px drop inside a 6px slot). */}
              <div className="absolute top-[8px] w-1.5" style={{ left: `calc(${pct(event.x)} - 3px)` }}>
                <Mark provenance={event.provenance} className={event.provenance === 'derived' ? 'mt-[5px]' : ''} />
              </div>
            </div>
          ))}
          {axis.run ? (
            <div className="mono absolute right-0 top-[42px] text-[13px] text-white tabular-nums" data-testid="tire-past">
              {pastCaption(axis.run.miles)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({
  index,
  label,
  mono = false,
  sub,
  value,
  provenance,
  action,
}: {
  index?: string;
  label: string;
  mono?: boolean;
  sub?: string;
  value: string;
  provenance?: TireProvenance | 'derived';
  action?: React.ReactNode;
}) {
  const spoken = [index ? `${Number(index)}.` : null, label, sub, value, provenance ? SPOKEN[provenance] : null]
    .filter(Boolean)
    .join(', ');
  return (
    <li className="flex min-h-[56px] items-start gap-3 border-t border-white/8 py-3" aria-label={spoken}>
      {index ? <span className="mono w-[22px] shrink-0 text-[13px] text-white/55 tabular-nums">{index}</span> : null}
      <div className="min-w-0 flex-1">
        <div className={`${mono ? 'mono text-[13px] tabular-nums' : 'mono text-[12px] uppercase tracking-[0.8px]'} truncate text-white`}>
          {label}
        </div>
        {sub ? <div className="mono mt-0.5 text-[12px] uppercase tracking-[0.8px] text-white/55">{sub}</div> : null}
      </div>
      <div className="flex items-start gap-3">
        {provenance ? <Mark provenance={provenance} className={provenance === 'derived' ? 'mt-[13px]' : 'mt-1.5'} /> : null}
        <span className="mono text-[13px] text-white tabular-nums">{value}</span>
        {action}
      </div>
    </li>
  );
}

export default function TireRecord({
  vehicleName,
  odometer,
  set,
  rotations,
  onAddSet,
  onEditSet,
  onEnterInterval,
  onAddRotation,
  onRemoveRotation,
}: TireRecordProps) {
  if (!set) {
    return (
      <div className="space-y-4">
        <div className="display-instrument display-instrument-narrow text-[12px] uppercase tracking-[0.6px] text-white">{vehicleName}</div>
        <h2 className="display-instrument display-instrument-narrow text-[34px] uppercase leading-[38px] text-white">{TIRE_COPY.tires}</h2>
        <p className="mono text-[13px] text-white/55">NO SET ON RECORD</p>
        <Button onClick={onAddSet}>Add a tire set</Button>
      </div>
    );
  }

  const reading = tireReading(set, rotations, odometer);
  const axis = tireAxis(set, reading, odometer);
  const stats = tireStats(set, reading);
  const consequences = staggeredConsequences(set);
  const rows = rotationRows(rotations);
  const hasInterval = Boolean(reading.interval);

  return (
    <div>
      <Strip stats={stats} />

      <div className="mt-3">
        <div className="display-instrument display-instrument-narrow text-[12px] uppercase tracking-[0.6px] text-white">{vehicleName}</div>
        <h2 className="display-instrument display-instrument-narrow mt-0.5 text-[34px] uppercase leading-[38px] text-white">{set.line}</h2>
        <p className="mono mt-1 text-[13px] text-white/55 tabular-nums">{tireSubline(set)}</p>
      </div>

      {reading.staggered ? (
        <div className="mt-1" aria-label={`Front ${set.sizeFront}, rear ${set.sizeRear}`}>
          {[
            [set.sizeFront, TIRE_COPY.front],
            [set.sizeRear, TIRE_COPY.rear],
          ].map(([size, caption]) => (
            <div key={caption} className="flex h-12 items-baseline gap-3">
              <span className="display-instrument text-[44px] leading-[48px] text-white tabular-nums">{size}</span>
              <span className="mono text-[12px] uppercase tracking-[0.8px] text-white/55">{caption}</span>
            </div>
          ))}
        </div>
      ) : null}

      {reading.since !== null ? (
        <div className="mt-1">
          <Instrument reading={reading} axis={axis} />
        </div>
      ) : null}

      {consequences.length > 0 ? (
        <ul className="mt-6 border-b border-white/8">
          {consequences.map((row) => (
            <Row key={row.index} index={row.index} label={row.label} sub={row.sub} value={row.value} />
          ))}
        </ul>
      ) : null}

      <h3 className="display-instrument display-instrument-narrow mt-6 text-[20px] uppercase leading-6 text-white">{TIRE_COPY.rotations}</h3>
      <ul className="mt-1 border-b border-white/8">
        {!hasInterval ? (
          <Row label={TIRE_COPY.rotationInterval} sub={TIRE_COPY.willNotGuess} value={TIRE_COPY.notEntered} />
        ) : null}
        {rows.map((row) => (
          <Row
            key={row.rotation.id}
            index={row.index}
            label={formatDateMono(row.rotation.rotatedOn)}
            mono
            value={formatMiles(row.rotation.odometer)}
            provenance={row.rotation.provenance}
            action={
              <button
                type="button"
                onClick={() => onRemoveRotation(row.rotation)}
                className="mono tap-target-44 -my-2 ml-1 px-2 text-[12px] uppercase tracking-[0.8px] text-white/55 hover:text-white"
                aria-label={`Remove the rotation of ${formatDateMono(row.rotation.rotatedOn)}`}
              >
                Remove
              </button>
            }
          />
        ))}
      </ul>

      <div className="mt-[5px] flex flex-wrap gap-2">
        {hasInterval ? (
          <Button onClick={() => onAddRotation(set, rotations)}>{TIRE_COPY.addRotation}</Button>
        ) : (
          <>
            <Button onClick={() => onEnterInterval(set)}>{TIRE_COPY.enterInterval}</Button>
            <Button variant="outline" onClick={() => onAddRotation(set, rotations)}>
              {TIRE_COPY.addRotation}
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={() => onEditSet(set)}>
          What you entered
        </Button>
      </div>
    </div>
  );
}
