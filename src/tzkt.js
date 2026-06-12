/**
 * TzKT API module — fetches oven data from the ctez contract bigmap.
 * Bigmap pointer: 20919 (ovens bigmap of KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2)
 */

const TZKT_BASE = "https://api.tzkt.io/v1";
const OVENS_BIGMAP_ID = 20919;

/**
 * Fetch all ovens owned by a given address.
 * @param {string} ownerAddress - tz1/tz2/tz3 address
 * @returns {Promise<Array<{ovenId: string, ovenAddress: string, tezBalance: string, ctezOutstanding: string}>>}
 */
export async function fetchOvensByOwner(ownerAddress) {
  const url = `${TZKT_BASE}/bigmaps/${OVENS_BIGMAP_ID}/keys?key.owner=${ownerAddress}&active=true&limit=50`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TzKT API error: ${res.status} ${res.statusText}`);
  }

  const entries = await res.json();

  return entries.map((entry) => ({
    ovenId: entry.key.id,
    ovenAddress: entry.value.address,
    tezBalance: entry.value.tez_balance,
    ctezOutstanding: entry.value.ctez_outstanding,
  }));
}

/**
 * Fetch all oven owners with aggregated totals.
 * Paginates through the bigmap, sums ctez_outstanding and tez_balance per owner,
 * filters out fully-empty owners, sorts ctez > 0 first (desc), then tez-only (desc).
 * @returns {Promise<Array<{address: string, totalCtez: number, totalTez: number}>>}
 */
export async function fetchAllOvenOwners() {
  /** @type {Map<string, {ctez: number, tez: number}>} */
  const ownerMap = new Map();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url = `${TZKT_BASE}/bigmaps/${OVENS_BIGMAP_ID}/keys?active=true&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) break;

    const entries = await res.json();
    if (entries.length === 0) break;

    for (const entry of entries) {
      const owner = entry.key?.owner;
      const ctez = parseInt(entry.value?.ctez_outstanding ?? "0", 10);
      const tez = parseInt(entry.value?.tez_balance ?? "0", 10);
      if (owner) {
        const prev = ownerMap.get(owner) || { ctez: 0, tez: 0 };
        ownerMap.set(owner, { ctez: prev.ctez + ctez, tez: prev.tez + tez });
      }
    }

    offset += entries.length;
    if (entries.length < limit) break;
  }

  return [...ownerMap.entries()]
    // Keep only owners with something actionable
    .filter(([, { ctez, tez }]) => ctez > 0 || tez > 0)
    // Sort: ctez > 0 first (by ctez desc), then tez-only (by tez desc)
    .sort((a, b) => {
      const aHasCtez = a[1].ctez > 0 ? 1 : 0;
      const bHasCtez = b[1].ctez > 0 ? 1 : 0;
      if (aHasCtez !== bHasCtez) return bHasCtez - aHasCtez;
      if (aHasCtez) return b[1].ctez - a[1].ctez;
      return b[1].tez - a[1].tez;
    })
    .map(([address, { ctez, tez }]) => ({ address, totalCtez: ctez, totalTez: tez }));
}
