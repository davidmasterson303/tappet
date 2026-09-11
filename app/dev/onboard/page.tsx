import { Suspense } from 'react';
import OnboardVinForm from '@/app/onboard/OnboardVinForm';

/**
 * `/dev/onboard` — the onboarding form, renderable without a session.
 *
 * `/onboard` is a server page whose only job is the returning-user redirect
 * (`resolveOnboardingEntry`) before rendering `OnboardVinForm`; the form is
 * the whole screen. Rendered here without the guard, behind the `/dev` gate.
 *
 * ⚠ Submitting it calls the real `decodeVIN` action, which needs a session and
 * will fail without one. The design loop captures and never submits; nobody
 * else should be here.
 */
export default function DevOnboardPage() {
  return (
    <Suspense fallback={null}>
      <OnboardVinForm />
    </Suspense>
  );
}
