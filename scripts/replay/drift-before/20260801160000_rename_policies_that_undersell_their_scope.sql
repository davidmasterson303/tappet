/*
  DRIFT — two SELECT policies that exist in production under these names and
  that no migration creates:

    nhtsa_data             "Users can view nhtsa data"
    vehicle_knowledge_base "Users can view vehicle knowledge"

  `20260801160000` renames them and RAISES, on purpose, if it finds neither the
  old nor the new name. Its header records the live predicate — "EXISTS (…
  WHERE user_id = auth.uid() OR is_demo)" — and that is what is written here.
*/
DROP POLICY IF EXISTS "Users can view nhtsa data" ON public.nhtsa_data;
CREATE POLICY "Users can view nhtsa data" ON public.nhtsa_data
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = nhtsa_data.vehicle_id
      AND (v.user_id = auth.uid() OR v.is_demo)
  ));

DROP POLICY IF EXISTS "Users can view vehicle knowledge" ON public.vehicle_knowledge_base;
CREATE POLICY "Users can view vehicle knowledge" ON public.vehicle_knowledge_base
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_knowledge_base.vehicle_id
      AND (v.user_id = auth.uid() OR v.is_demo)
  ));
