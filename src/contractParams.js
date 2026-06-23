const DECIMAL_RE = /^(0|[1-9]\d*)$/;
const TZ_ADDRESS_RE = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;

function assertDecimalString(value, label) {
  const str = String(value ?? "").trim();
  if (!DECIMAL_RE.test(str)) {
    throw new Error(`${label} must be a non-negative decimal string`);
  }
  return str;
}

function isPositiveDecimal(value) {
  return DECIMAL_RE.test(value) && BigInt(value) > 0n;
}

export function createBurnParams(ovenId, burnAmount) {
  const id = assertDecimalString(ovenId, "oven id");
  const amount = assertDecimalString(burnAmount, "burn amount");
  const quantity = amount === "0" ? "0" : `-${amount}`;

  return { id, quantity };
}

export function createWithdrawParams(ovenId, withdrawAmount, userAddress) {
  const id = assertDecimalString(ovenId, "oven id");
  const amount = assertDecimalString(withdrawAmount, "withdraw amount");
  const to = String(userAddress ?? "").trim();

  if (!TZ_ADDRESS_RE.test(to)) {
    throw new Error("destination must be an implicit tz address");
  }

  return { id, amount, to };
}

export function createCloseOvenBatchPlan({ ovenId, burnAmount, withdrawAmount, destination }) {
  const id = assertDecimalString(ovenId, "oven id");
  const burn = assertDecimalString(burnAmount, "burn amount");
  const balance = assertDecimalString(withdrawAmount, "withdraw amount");
  const plan = [];

  if (isPositiveDecimal(burn)) {
    plan.push({
      entrypoint: "mint_or_burn",
      params: createBurnParams(id, burn),
    });
  }

  if (isPositiveDecimal(balance)) {
    plan.push({
      entrypoint: "withdraw",
      params: createWithdrawParams(id, balance, destination),
    });
  }

  if (plan.length === 0) {
    throw new Error("no ctez or tez to close");
  }

  return plan;
}

export function calculateOvenStrategies({ ctezOutstanding, tezBalance, walletCtezBalance, target }) {
  const ctez = BigInt(ctezOutstanding ?? "0");
  const tez = BigInt(tezBalance ?? "0");
  const wallet = BigInt(walletCtezBalance ?? "0");
  const tgt = BigInt(target ?? "1");

  const getMinCollateral = (outstanding) => {
    if (outstanding === 0n) return 0n;
    const limit = (outstanding * tgt) >> 44n;
    return (limit + 14n) / 15n;
  };

  // Full Close strategy
  const fullPossible = wallet >= ctez && (ctez > 0n || tez > 0n);
  const fullBurn = ctez;
  const fullWithdraw = tez;

  // Withdraw Excess Only strategy
  const minCollateral = getMinCollateral(ctez);
  const excessCollateral = tez > minCollateral ? tez - minCollateral : 0n;
  const excessPossible = excessCollateral > 0n;
  const excessBurn = 0n;
  const excessWithdraw = excessCollateral;

  // Partial Close strategy
  let partialPossible = false;
  let partialBurn = 0n;
  let partialWithdraw = 0n;
  let partialRemaining = ctez;

  if (wallet > 0n && wallet < ctez) {
    partialPossible = true;
    partialBurn = wallet;
    partialRemaining = ctez - wallet;
    const newMinCollateral = getMinCollateral(partialRemaining);
    partialWithdraw = tez > newMinCollateral ? tez - newMinCollateral : 0n;
  }

  return {
    full: {
      possible: fullPossible,
      burn: fullBurn.toString(),
      withdraw: fullWithdraw.toString(),
      remaining: "0",
    },
    partial: {
      possible: partialPossible,
      burn: partialBurn.toString(),
      withdraw: partialWithdraw.toString(),
      remaining: partialRemaining.toString(),
    },
    excess: {
      possible: excessPossible,
      burn: excessBurn.toString(),
      withdraw: excessWithdraw.toString(),
      remaining: ctez.toString(),
    },
  };
}

export function formatMutez(mutez) {
  const str = assertDecimalString(mutez, "amount");
  const whole = str.length > 6 ? str.slice(0, -6) : "0";
  const fraction = str.padStart(7, "0").slice(-6);

  return `${whole}.${fraction}`;
}

export function formatTez(mutez) {
  return formatMutez(mutez);
}

export function formatCtez(amount) {
  return formatMutez(amount);
}
