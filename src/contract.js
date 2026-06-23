/**
 * Contract operations module — closes one oven through an atomic wallet batch.
 * Uses Taquito v24: wallet.batch() + withContractCall().
 */

import { getTezos } from "./wallet.js";
import {
  createBurnParams,
  createCloseOvenBatchPlan,
  createWithdrawParams,
  formatCtez,
  formatTez,
  calculateOvenStrategies,
} from "./contractParams.js";

const CTEZ_CONTRACT = "KT1GWnsoFZVHGh7roXEER3qeCcgJgrXT3de2";

/**
 * Close one oven with an atomic wallet batch.
 * Burns all outstanding ctez first when needed, then withdraws the full oven tez balance.
 *
 * @param {{ovenId: string, ctezOutstanding: string, tezBalance: string}} oven
 * @param {string} userAddress - Destination address (user's wallet)
 * @param {(status: {type: string, message: string, opHash?: string}) => void} onStatus
 */
export async function closeOven({ ovenId, burnAmount, withdrawAmount }, userAddress, onStatus) {
  const tezos = getTezos();

  onStatus({ type: "pending", message: "Getting contract handle…" });

  const contract = await tezos.wallet.at(CTEZ_CONTRACT);
  const plan = createCloseOvenBatchPlan({
    ovenId,
    burnAmount,
    withdrawAmount,
    destination: userAddress,
  });

  const burnStep = plan.find((step) => step.entrypoint === "mint_or_burn");
  const withdrawStep = plan.find((step) => step.entrypoint === "withdraw");
  const summary = [
    burnStep ? `burn ${formatCtez(burnAmount)} ctez` : null,
    withdrawStep ? `withdraw ${formatTez(withdrawAmount)} ꜩ` : null,
  ].filter(Boolean).join(", then ");

  onStatus({
    type: "pending",
    message: `Sending atomic oven batch: ${summary}. Approve in your wallet.`,
  });

  let batch = tezos.wallet.batch();
  for (const step of plan) {
    batch = batch.withContractCall(contract.methodsObject[step.entrypoint](step.params));
  }

  const op = await batch.send();

  onStatus({ type: "pending", message: `Batch sent. Waiting for confirmation… (${op.opHash})` });
  await op.confirmation(1);

  onStatus({
    type: "success",
    message: "Oven batch confirmed. All requested burn/withdraw operations succeeded.",
    opHash: op.opHash,
  });
}

export {
  createBurnParams,
  createCloseOvenBatchPlan,
  createWithdrawParams,
  formatCtez,
  formatTez,
  calculateOvenStrategies,
};
