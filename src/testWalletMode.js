export const TEST_LOOKUP_WALLET = "tz2K1rDmszPuzVQYUcyDFxeSm7ZEJdDvhXx4";

export function isTestLookupWallet(address) {
  return address === TEST_LOOKUP_WALLET;
}

export function lookupIsReadOnly({ connectedWalletAddress, lookupAddress }) {
  return connectedWalletAddress !== lookupAddress;
}
