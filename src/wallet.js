/**
 * Wallet module — handles Taquito + BeaconWallet setup, connect, disconnect, persistence.
 * Uses Taquito v24 patterns: wallet.at(), .methodsObject, ACTIVE_ACCOUNT_SET subscription.
 */

import { TezosToolkit } from "@taquito/taquito";
import { BeaconWallet, BeaconEvent } from "@taquito/beacon-wallet";
import { NetworkType } from "@ecadlabs/beacon-types";

const RPC_URL = "https://mainnet.tezos.marigold.dev";

let tezos = null;
let wallet = null;
let onAccountChange = null;

/**
 * Initialize the TezosToolkit and BeaconWallet singletons.
 * Must be called once on page load.
 * @param {(address: string|null) => void} accountChangeCallback
 */
export function initWallet(accountChangeCallback) {
  onAccountChange = accountChangeCallback;

  tezos = new TezosToolkit(RPC_URL);
  wallet = new BeaconWallet({
    name: "ctez Oven Tool",
    iconUrl: "https://purplematter.com/favicon.png",
    appUrl: "https://purplematter.com/ctez-tool",
    network: { type: NetworkType.MAINNET },
  });

  tezos.setWalletProvider(wallet);

  // MANDATORY: subscribe to ACTIVE_ACCOUNT_SET (octez.connect 4.2.0+)
  wallet.client.subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, (account) => {
    // This fires on connect, disconnect, and account switch.
    // Do NOT call requestPermissions/clearActiveAccount/disconnect inside this handler.
    if (onAccountChange) {
      onAccountChange(account?.address ?? null);
    }
  });
}

/**
 * Check if there's a persisted active account from a previous session.
 * @returns {Promise<string|null>} The address or null
 */
export async function checkExistingConnection() {
  if (!wallet) return null;
  const activeAccount = await wallet.client.getActiveAccount();
  return activeAccount?.address ?? null;
}

/**
 * Request wallet permissions (connect).
 * @returns {Promise<string>} The connected address
 */
export async function connectWallet() {
  if (!wallet) throw new Error("Wallet not initialized");

  // Network is set in the BeaconWallet constructor — requestPermissions
  // no longer accepts a "network" property (octez.connect SDK breaking change).
  const permissions = await wallet.client.requestPermissions();

  return permissions.address;
}

/**
 * Fully disconnect: clear active account + disconnect transport.
 */
export async function disconnectWallet() {
  if (!wallet) return;

  try {
    await wallet.client.clearActiveAccount();
  } catch (_) {
    // may throw if no active account
  }

  try {
    await wallet.client.disconnect();
  } catch (_) {
    // may throw "Not connected" or "No transport"
  }
}

/**
 * Get the TezosToolkit instance (for contract calls).
 * @returns {TezosToolkit}
 */
export function getTezos() {
  if (!tezos) throw new Error("Tezos not initialized");
  return tezos;
}
