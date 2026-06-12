export function createLookupOptions(items) {
  return items.map(({ address, totalCtez, totalTez }) => ({
    address,
    ctezLabel: totalCtez > 0n ? `${formatLookupAmount(totalCtez)} ctez` : "0 ctez",
    tezLabel: `${formatLookupAmount(totalTez)} ꜩ to withdraw`,
  }));
}

export function formatLookupAmount(mutezAmount) {
  const amount = BigInt(mutezAmount ?? 0);
  if (amount === 0n) return "0.00";

  const whole = amount / 1_000_000n;
  const fraction = String(amount % 1_000_000n).padStart(6, "0");
  if (amount < 10_000n) {
    return `${whole}.${fraction}`.replace(/\.?0+$/, "");
  }
  return `${whole}.${fraction.slice(0, 2)}`;
}
