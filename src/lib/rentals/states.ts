/**
 * US states (and DC) with the time zone most of each state uses. A home's state sets the clock its
 * showing times, due dates and receipts are shown in. States split across zones use the zone most
 * of their people live in.
 */
export const US_STATES: Record<string, { name: string; timeZone: string }> = {
  AL: { name: 'Alabama', timeZone: 'America/Chicago' },
  AK: { name: 'Alaska', timeZone: 'America/Anchorage' },
  AZ: { name: 'Arizona', timeZone: 'America/Phoenix' },
  AR: { name: 'Arkansas', timeZone: 'America/Chicago' },
  CA: { name: 'California', timeZone: 'America/Los_Angeles' },
  CO: { name: 'Colorado', timeZone: 'America/Denver' },
  CT: { name: 'Connecticut', timeZone: 'America/New_York' },
  DE: { name: 'Delaware', timeZone: 'America/New_York' },
  DC: { name: 'District of Columbia', timeZone: 'America/New_York' },
  FL: { name: 'Florida', timeZone: 'America/New_York' },
  GA: { name: 'Georgia', timeZone: 'America/New_York' },
  HI: { name: 'Hawaii', timeZone: 'Pacific/Honolulu' },
  ID: { name: 'Idaho', timeZone: 'America/Boise' },
  IL: { name: 'Illinois', timeZone: 'America/Chicago' },
  IN: { name: 'Indiana', timeZone: 'America/Indiana/Indianapolis' },
  IA: { name: 'Iowa', timeZone: 'America/Chicago' },
  KS: { name: 'Kansas', timeZone: 'America/Chicago' },
  KY: { name: 'Kentucky', timeZone: 'America/New_York' },
  LA: { name: 'Louisiana', timeZone: 'America/Chicago' },
  ME: { name: 'Maine', timeZone: 'America/New_York' },
  MD: { name: 'Maryland', timeZone: 'America/New_York' },
  MA: { name: 'Massachusetts', timeZone: 'America/New_York' },
  MI: { name: 'Michigan', timeZone: 'America/Detroit' },
  MN: { name: 'Minnesota', timeZone: 'America/Chicago' },
  MS: { name: 'Mississippi', timeZone: 'America/Chicago' },
  MO: { name: 'Missouri', timeZone: 'America/Chicago' },
  MT: { name: 'Montana', timeZone: 'America/Denver' },
  NE: { name: 'Nebraska', timeZone: 'America/Chicago' },
  NV: { name: 'Nevada', timeZone: 'America/Los_Angeles' },
  NH: { name: 'New Hampshire', timeZone: 'America/New_York' },
  NJ: { name: 'New Jersey', timeZone: 'America/New_York' },
  NM: { name: 'New Mexico', timeZone: 'America/Denver' },
  NY: { name: 'New York', timeZone: 'America/New_York' },
  NC: { name: 'North Carolina', timeZone: 'America/New_York' },
  ND: { name: 'North Dakota', timeZone: 'America/Chicago' },
  OH: { name: 'Ohio', timeZone: 'America/New_York' },
  OK: { name: 'Oklahoma', timeZone: 'America/Chicago' },
  OR: { name: 'Oregon', timeZone: 'America/Los_Angeles' },
  PA: { name: 'Pennsylvania', timeZone: 'America/New_York' },
  RI: { name: 'Rhode Island', timeZone: 'America/New_York' },
  SC: { name: 'South Carolina', timeZone: 'America/New_York' },
  SD: { name: 'South Dakota', timeZone: 'America/Chicago' },
  TN: { name: 'Tennessee', timeZone: 'America/Chicago' },
  TX: { name: 'Texas', timeZone: 'America/Chicago' },
  UT: { name: 'Utah', timeZone: 'America/Denver' },
  VT: { name: 'Vermont', timeZone: 'America/New_York' },
  VA: { name: 'Virginia', timeZone: 'America/New_York' },
  WA: { name: 'Washington', timeZone: 'America/Los_Angeles' },
  WV: { name: 'West Virginia', timeZone: 'America/New_York' },
  WI: { name: 'Wisconsin', timeZone: 'America/Chicago' },
  WY: { name: 'Wyoming', timeZone: 'America/Denver' },
};

export const stateName = (code: string) => US_STATES[code]?.name ?? code;
export const stateTimeZone = (code: string) => US_STATES[code]?.timeZone ?? 'America/New_York';
export const STATE_OPTIONS = Object.entries(US_STATES)
  .map(([value, s]) => ({ value, label: s.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** Form hints for a home's state. Connecticut's rules are spelled out; elsewhere, a pointer to check. */
export function stateHints(code: string) {
  if (code === 'CT')
    return {
      graceDays: 9,
      grace: "Connecticut doesn't allow a late fee until 9 days after the due date.",
      deposit: "Connecticut caps this at 2 months' rent (1 month if the tenant is 62 or older).",
    };
  const name = stateName(code);
  return {
    graceDays: 5,
    grace: `Check ${name}'s rules on grace periods and late fee limits.`,
    deposit: `${name} may limit how much you can ask for. Check before setting it.`,
  };
}
