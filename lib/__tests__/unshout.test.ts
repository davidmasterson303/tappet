/**
 * NHTSA's capitals become sentences; prose is left alone.
 * @jest-environment node
 *
 * QE 2.12 (20 Sep): half the Accord's campaigns shout. Read off the live
 * row (08E050000) rather than invented.
 */
import { isShouting, unshout } from '@tappet/core/unshout';

const SHOUTED =
  'K2 MOTOR IS RECALLING 1,921 AFTERMARKET HEADLAMPS OF VARIOUS MODELS SOLD FOR USE ON THE ABOVE LISTED VEHICLES.  THESE HEADLAMPS ARE MISSING THE AMBER SIDE REFLEX REFLECTOR WHICH FAILS TO CONFORM WITH THE REQUIREMENTS OF FEDERAL MOTOR VEHICLE SAFETY STANDARD NO. 108, "LAMPS, REFLECTIVE DEVICES, AND ASSOCIATED EQUIPMENT."';

describe('unshout', () => {
  it('lowers a shouted paragraph to sentences, keeping numbers and the sentence starts', () => {
    expect(unshout(SHOUTED)).toBe(
      'K2 motor is recalling 1,921 aftermarket headlamps of various models sold for use on the above listed vehicles.  These headlamps are missing the amber side reflex reflector which fails to conform with the requirements of federal motor vehicle safety standard no. 108, "lamps, reflective devices, and associated equipment."'
    );
    // "no. 108" is an abbreviation, and the quoted title after the comma is
    // not a sentence: a lowered title is the honest reading of a source that
    // threw its casing away.
  });

  it('keeps the names the caller knows, and the initialisms it knows', () => {
    const text = 'HONDA IS RECALLING CERTAIN MODEL YEAR 2003 ACCORD VEHICLES. THE SRS AND ABS MODULES WERE BUILT BY TAKATA CORP. OWNERS MAY CONTACT NHTSA.';
    expect(unshout(text, ['Honda', '2003 Honda Accord'])).toBe(
      'Honda is recalling certain model year 2003 Accord vehicles. The SRS and ABS modules were built by takata Corp. Owners may contact NHTSA.'
    );
  });

  it('gives a name it was handed in capitals one capital, and leaves a short one as it is', () => {
    // Seen live: `Manufacturer` is "TRADESONIC" on the same rows that shout.
    expect(unshout('CERTAIN TRADESONIC COMBINATION LAMPS SOLD AS REPLACEMENT LAMPS FOR USE ON THE ABOVE LISTED VEHICLES.', ['TRADESONIC'])).toBe(
      'Certain Tradesonic combination lamps sold as replacement lamps for use on the above listed vehicles.'
    );
    expect(unshout('BMW OF NORTH AMERICA IS RECALLING CERTAIN MODEL YEAR 2015 M235I VEHICLES EQUIPPED WITH THE N55.', ['BMW', 'K2 MOTOR'])).toBe(
      'BMW of north america is recalling certain model year 2015 M235I vehicles equipped with the N55.'
    );
  });

  it('starts a new sentence after a line break, and keeps a phone number and a date whole', () => {
    expect(unshout('K2 MOTOR WILL NOTIFY OWNERS AND OFFER A FULL REFUND.  THE RECALL BEGAN ON DECEMBER 17, 2008.\nOWNERS MAY CONTACT K2 MOTOR AT 1-909-839-2992.')).toBe(
      'K2 motor will notify owners and offer a full refund.  The recall began on december 17, 2008.\nOwners may contact K2 motor at 1-909-839-2992.'
    );
  });

  it('leaves prose alone — a modern campaign is never rewritten', () => {
    const prose = 'Honda (American Honda Motor Co.) is recalling certain 2003-2007 Accord vehicles. The driver frontal air bag inflator may explode due to propellant degradation.';
    expect(unshout(prose)).toBe(prose);
    expect(isShouting(prose)).toBe(false);
    // A short capitalised fragment is a component name, not shouting.
    expect(unshout('AIR BAGS:FRONTAL')).toBe('AIR BAGS:FRONTAL');
    expect(unshout(null)).toBeNull();
    expect(unshout(undefined)).toBeNull();
  });

  it('can still detect the row that shipped, so this is not vacuous', () => {
    expect(isShouting(SHOUTED)).toBe(true);
    expect(unshout(SHOUTED)).not.toBe(SHOUTED);
  });
});
