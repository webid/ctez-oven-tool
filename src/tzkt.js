/**
 * TzKT API module — fetches oven data from the ctez contract bigmap.
 * Bigmap pointer: 20919 (ovens bigmap of KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2)
 */

const TZKT_BASE = "https://api.tzkt.io/v1";
const OVENS_BIGMAP_ID = 20919;
const CTEZ_CONTRACT = "KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2";
const CTEZ_TOKEN_CONTRACT = "KT1SjXiUX63QvdNMcM2m492f7kuf8JxXRLp4";

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
 * Fetch all oven owners with aggregated totals and global stats.
 * Paginates through the bigmap, sums ctez_outstanding and tez_balance per owner,
 * filters out fully-empty owners, sorts ctez > 0 first (desc), then tez-only (desc).
 * Also computes global stats (total ovens, wallets, ctez, tez) in the same pass.
 * @returns {Promise<{owners: Array<{address: string, totalCtez: bigint, totalTez: bigint}>, stats: {totalWallets: number, totalOvens: number, totalCtez: bigint, totalTez: bigint}}>}
 */
export async function fetchAllOvenOwners() {
  /** @type {Map<string, {ctez: bigint, tez: bigint}>} */
  const ownerMap = new Map();
  let totalOvens = 0;
  let activeOvens = 0;
  let totalCtez = 0n;
  let totalTez = 0n;
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
      const ctez = BigInt(entry.value?.ctez_outstanding ?? "0");
      const tez = BigInt(entry.value?.tez_balance ?? "0");

      totalOvens++;
      totalCtez += ctez;
      totalTez += tez;

      if (ctez > 0n || tez > 0n) {
        activeOvens++;
      }

      if (owner) {
        const prev = ownerMap.get(owner) || { ctez: 0n, tez: 0n };
        ownerMap.set(owner, { ctez: prev.ctez + ctez, tez: prev.tez + tez });
      }
    }

    offset += entries.length;
    if (entries.length < limit) break;
  }

  const owners = [...ownerMap.entries()]
    // Keep only owners with something actionable
    .filter(([, { ctez, tez }]) => ctez > 0n || tez > 0n)
    // Sort: ctez > 0 first (by ctez desc), then tez-only (by tez desc)
    .sort((a, b) => {
      const aHasCtez = a[1].ctez > 0n ? 1 : 0;
      const bHasCtez = b[1].ctez > 0n ? 1 : 0;
      if (aHasCtez !== bHasCtez) return bHasCtez - aHasCtez;
      if (aHasCtez) return compareBigIntDesc(a[1].ctez, b[1].ctez);
      return compareBigIntDesc(a[1].tez, b[1].tez);
    })
    .map(([address, { ctez, tez }]) => ({ address, totalCtez: ctez, totalTez: tez }));

  return {
    owners,
    stats: {
      totalWallets: owners.length,
      totalOwners: ownerMap.size,
      activeOvens,
      totalOvens,
      totalCtez,
      totalTez,
    },
  };
}

function compareBigIntDesc(a, b) {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

/**
 * Fetch current ctez contract storage to get the target price parameter.
 * @returns {Promise<{target: string, drift: string, last_drift_update: string}>}
 */
export async function fetchCtezStorage() {
  const url = `${TZKT_BASE}/contracts/${CTEZ_CONTRACT}/storage`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ctez storage: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch ctez token balance of a given user address.
 * @param {string} userAddress - tz1/tz2/tz3 address
 * @returns {Promise<string>} Balance in micro-ctez as decimal string
 */
export async function fetchUserCtezBalance(userAddress) {
  const url = `${TZKT_BASE}/tokens/balances?account=${userAddress}&token.contract=${CTEZ_TOKEN_CONTRACT}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch user ctez balance: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (data.length === 0) return "0";
  return data[0].balance ?? "0";
}
