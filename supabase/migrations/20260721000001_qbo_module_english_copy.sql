-- Keep the integration module catalog English-only for QBO/R365 organizations.
UPDATE public.module_catalog
SET
  name = 'QuickBooks® Online Integration',
  description = 'Automated invoice synchronization from QuickBooks® Online to Restaurant365.',
  addon_name = 'QuickBooks® Online → R365 Integration',
  addon_description = 'Automated invoice delivery from QuickBooks® Online to Restaurant365.'
WHERE code = 'qbo_r365';
