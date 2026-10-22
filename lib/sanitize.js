// What employees are allowed to see. Partners get records unchanged.
export function projectFor(p, isPartner) {
  if (isPartner) return p;
  const { budget, ...rest } = p;
  return rest;
}
export function personFor(p, isPartner) {
  if (isPartner) return p;
  const { rate, rateUnit, ...rest } = p;
  return rest;
}
