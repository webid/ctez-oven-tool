/**
 * Contract operations module — mint_or_burn (burn ctez) and withdraw (withdraw tez).
 * Uses Taquito v24: wallet.at() + .methodsObject with named parameters.
 */

import { getTezos } from "./wallet.js";

const CTEZ_CONTRACT = "KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2";

/**
 * Burn all ctez for a given oven.
 * Calls mint_or_burn with a negative quantity.
 *
 * @param {string} ovenId - The oven's numeric ID
 * @param {string} ctezOutstanding - The ctez_outstanding value (positive, in mutez)
 * @param {(status: {type: string, message: string, opHash?: string}) => void} onStatus
 */
export async function burnCtez(ovenId, ctezOutstanding, onStatus) {
  const tezos = getTezos();

  onStatus({ type: "pending", message: "Getting contract handle…" });

  const contract = await tezos.wallet.at(CTEZ_CONTRACT);

  const quantity = -Math.abs(parseInt(ctezOutstanding, 10));

  onStatus({ type: "pending", message: `Sending mint_or_burn(id: ${ovenId}, quantity: ${quantity})… Approve in your wallet.` });

  const op = await contract.methodsObject.mint_or_burn({
    id: parseInt(ovenId, 10),
    quantity: quantity,
  }).send();

  onStatus({ type: "pending", message: `Transaction sent. Waiting for confirmation… (${op.opHash})` });

  await op.confirmation(1);

  onStatus({
    type: "success",
    message: `Burn confirmed!`,
    opHash: op.opHash,
  });
}

/**
 * Withdraw all tez from a given oven.
 * If full amount fails, retries with a reduced amount.
 *
 * @param {string} ovenId - The oven's numeric ID
 * @param {string} tezBalance - The tez_balance value in mutez
 * @param {string} userAddress - Destination address (user's wallet)
 * @param {(status: {type: string, message: string, opHash?: string}) => void} onStatus
 */
export async function withdrawTez(ovenId, tezBalance, userAddress, onStatus) {
  const tezos = getTezos();

  onStatus({ type: "pending", message: "Getting contract handle…" });

  const contract = await tezos.wallet.at(CTEZ_CONTRACT);

  const fullAmount = parseInt(tezBalance, 10);

  // First try: full amount
  try {
    onStatus({
      type: "pending",
      message: `Sending withdraw(id: ${ovenId}, amount: ${fullAmount} mutez = ${formatTez(fullAmount)} ꜩ)… Approve in your wallet.`,
    });

    const op = await contract.methodsObject.withdraw({
      id: parseInt(ovenId, 10),
      amount: fullAmount,
      to: userAddress,
    }).send();

    onStatus({ type: "pending", message: `Transaction sent. Waiting for confirmation… (${op.opHash})` });
    await op.confirmation(1);

    onStatus({
      type: "success",
      message: `Withdrawal confirmed! ${formatTez(fullAmount)} ꜩ sent to your wallet.`,
      opHash: op.opHash,
    });
    return;
  } catch (err) {
    const errMsg = err?.message || String(err);

    // If it looks like a balance/amount error, retry with reduced amount
    const reducedAmount = fullAmount - 10000; // subtract 0.01 tez
    if (reducedAmount <= 0) {
      onStatus({
        type: "error",
        message: `Withdrawal failed: ${errMsg}`,
      });
      return;
    }

    onStatus({
      type: "warning",
      message: `Full withdrawal of ${formatTez(fullAmount)} ꜩ failed: "${errMsg}". Retrying with ${formatTez(reducedAmount)} ꜩ (reduced by 0.01 ꜩ to cover fees)…`,
    });

    // Second try: reduced amount
    try {
      const op = await contract.methodsObject.withdraw({
        id: parseInt(ovenId, 10),
        amount: reducedAmount,
        to: userAddress,
      }).send();

      onStatus({ type: "pending", message: `Retry transaction sent. Waiting for confirmation… (${op.opHash})` });
      await op.confirmation(1);

      onStatus({
        type: "success",
        message: `Withdrawal confirmed! ${formatTez(reducedAmount)} ꜩ sent to your wallet (reduced from ${formatTez(fullAmount)} ꜩ).`,
        opHash: op.opHash,
      });
    } catch (retryErr) {
      onStatus({
        type: "error",
        message: `Retry also failed: ${retryErr?.message || String(retryErr)}. You may need to manually enter a smaller amount.`,
      });
    }
  }
}

/**
 * Format mutez to tez with 6 decimal places.
 * @param {number|string} mutez
 * @returns {string}
 */
export function formatTez(mutez) {
  const n = typeof mutez === "string" ? parseInt(mutez, 10) : mutez;
  return (n / 1_000_000).toFixed(6);
}

/**
 * Format ctez outstanding (same 6-decimal format).
 * @param {number|string} amount
 * @returns {string}
 */
export function formatCtez(amount) {
  const n = typeof amount === "string" ? parseInt(amount, 10) : amount;
  return (n / 1_000_000).toFixed(6);
}
