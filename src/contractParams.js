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

export function createBurnParams(ovenId, ctezOutstanding) {
  const id = assertDecimalString(ovenId, "oven id");
  const outstanding = assertDecimalString(ctezOutstanding, "ctez outstanding");
  const quantity = outstanding === "0" ? "0" : `-${outstanding}`;

  return { id, quantity };
}

export function createWithdrawParams(ovenId, tezBalance, userAddress) {
  const id = assertDecimalString(ovenId, "oven id");
  const amount = assertDecimalString(tezBalance, "tez balance");
  const destination = String(userAddress ?? "").trim();

  if (!TZ_ADDRESS_RE.test(destination)) {
    throw new Error("destination must be an implicit tz address");
  }

  const to = `${destination}%default`;

  return { id, amount, to };
}

export function createCloseOvenBatchPlan({ ovenId, ctezOutstanding, tezBalance, destination }) {
  const id = assertDecimalString(ovenId, "oven id");
  const outstanding = assertDecimalString(ctezOutstanding, "ctez outstanding");
  const balance = assertDecimalString(tezBalance, "tez balance");
  const plan = [];

  if (isPositiveDecimal(outstanding)) {
    plan.push({
      entrypoint: "mint_or_burn",
      params: createBurnParams(id, outstanding),
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
