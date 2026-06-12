/**
 * Main app entry — UI orchestration for ctez Oven Tool.
 * Wires up wallet connect/disconnect, oven loading, burn/withdraw operations,
 * and read-only address lookup mode.
 */

import "./style.css";

import { initWallet, checkExistingConnection, connectWallet, disconnectWallet } from "./wallet.js";
import { fetchOvensByOwner, fetchAllOvenOwners } from "./tzkt.js";
import { burnCtez, withdrawTez, formatTez, formatCtez } from "./contract.js";

// --- State ---
let currentAddress = null;
let ovens = [];
let selectedOven = null;
let isReadOnly = false; // true when using lookup mode (no wallet connected)

// --- DOM refs ---
const $ = (id) => document.getElementById(id);

const btnConnect = $("btn-connect");
const btnDisconnect = $("btn-disconnect");
const btnCopyAddress = $("btn-copy-address");
const walletInfo = $("wallet-info");
const walletAddress = $("wallet-address");
const sectionDisconnected = $("section-disconnected");
const sectionConnected = $("section-connected");
const ovenLoading = $("oven-loading");
const ovenEmpty = $("oven-empty");
const ovenList = $("oven-list");
const stepB = $("step-b");
const stepC = $("step-c");
const btnBurn = $("btn-burn");
const btnWithdraw = $("btn-withdraw");
const burnStatus = $("burn-status");
const withdrawStatus = $("withdraw-status");
const lookupInput = $("lookup-input");
const btnLookup = $("btn-lookup");
const lookupLoadingHint = $("lookup-loading-hint");
const readonlyBanner = $("readonly-banner");
const readonlyAddress = $("readonly-address");
const btnClearLookup = $("btn-clear-lookup");
const lookupDropdown = $("lookup-dropdown");
const btnGuide = $("btn-guide");
const modalGuide = $("modal-guide");
const btnCloseModal = $("btn-close-modal");

// Dropdown state
let allOwners = [];   // full list from TzKT
let activeIndex = -1; // keyboard nav index

// --- Init ---
initWallet(handleAccountChange);

// Check for persisted connection and hide loading screen
(async () => {
  try {
    const existingAddress = await checkExistingConnection();
    if (existingAddress) {
      handleAccountChange(existingAddress);
    }
  } catch (err) {
    console.error("Wallet check error:", err);
  } finally {
    const loader = $("app-loading");
    if (loader) {
      loader.classList.add("fade-out");
      setTimeout(() => loader.remove(), 250);
    }
  }
})();

// Pre-fetch all oven owner addresses for dropdown
(async () => {
  lookupLoadingHint.classList.remove("hidden");
  try {
    allOwners = await fetchAllOvenOwners();
  } catch (err) {
    console.warn("Failed to load oven owners for autocomplete:", err);
  }
  lookupLoadingHint.classList.add("hidden");
})();

// --- Event listeners ---
btnConnect.addEventListener("click", async () => {
  btnConnect.disabled = true;
  btnConnect.textContent = "Connecting…";
  try {
    await connectWallet();
    // ACTIVE_ACCOUNT_SET handler will call handleAccountChange
  } catch (err) {
    console.error("Connect error:", err);
    btnConnect.disabled = false;
    btnConnect.textContent = "Connect Wallet";
  }
});

btnDisconnect.addEventListener("click", async () => {
  btnDisconnect.disabled = true;
  btnDisconnect.textContent = "Disconnecting…";
  try {
    await disconnectWallet();
  } catch (err) {
    console.error("Disconnect error:", err);
  }
  // Reset UI
  handleAccountChange(null);
  btnDisconnect.disabled = false;
  btnDisconnect.textContent = "Disconnect";
});

btnCopyAddress.addEventListener("click", () => {
  if (currentAddress) {
    navigator.clipboard.writeText(currentAddress).then(() => {
      const original = btnCopyAddress.innerHTML;
      btnCopyAddress.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        btnCopyAddress.innerHTML = original;
      }, 1500);
    });
  }
});

btnBurn.addEventListener("click", async () => {
  if (!selectedOven || isReadOnly) return;
  const ctez = parseInt(selectedOven.ctezOutstanding, 10);
  if (ctez <= 0) {
    showStatus(burnStatus, "info", "No ctez outstanding to burn.");
    return;
  }

  btnBurn.disabled = true;
  try {
    await burnCtez(selectedOven.ovenId, selectedOven.ctezOutstanding, (status) => {
      showStatus(burnStatus, status.type, status.message, status.opHash);
    });
    // Refresh oven data after successful burn
    await loadOvens(currentAddress);
  } catch (err) {
    showStatus(burnStatus, "error", `Failed: ${err?.message || String(err)}`);
  } finally {
    btnBurn.disabled = false;
  }
});

btnWithdraw.addEventListener("click", async () => {
  if (!selectedOven || !currentAddress || isReadOnly) return;
  const tez = parseInt(selectedOven.tezBalance, 10);
  if (tez <= 0) {
    showStatus(withdrawStatus, "info", "No tez balance to withdraw.");
    return;
  }

  btnWithdraw.disabled = true;
  try {
    await withdrawTez(selectedOven.ovenId, selectedOven.tezBalance, currentAddress, (status) => {
      showStatus(withdrawStatus, status.type, status.message, status.opHash);
    });
    // Refresh oven data after successful withdraw
    await loadOvens(currentAddress);
  } catch (err) {
    showStatus(withdrawStatus, "error", `Failed: ${err?.message || String(err)}`);
  } finally {
    btnWithdraw.disabled = false;
  }
});

// --- Lookup event listeners ---
btnLookup.addEventListener("click", () => {
  hideDropdown();
  performLookup();
});

lookupInput.addEventListener("input", () => {
  const query = lookupInput.value.trim().toLowerCase();
  if (query.length < 2) {
    hideDropdown();
    return;
  }
  const filtered = allOwners.filter(o => o.address.toLowerCase().includes(query));
  renderDropdown(filtered);
});

lookupInput.addEventListener("focus", () => {
  const query = lookupInput.value.trim().toLowerCase();
  if (query.length >= 2) {
    const filtered = allOwners.filter(o => o.address.toLowerCase().includes(query));
    renderDropdown(filtered);
  }
});

lookupInput.addEventListener("keydown", (e) => {
  const items = lookupDropdown.querySelectorAll(".dropdown-item");

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
    updateActiveItem(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    updateActiveItem(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (activeIndex >= 0 && items[activeIndex]) {
      lookupInput.value = items[activeIndex].dataset.address;
      hideDropdown();
    }
    performLookup();
  } else if (e.key === "Escape") {
    hideDropdown();
  }
});

// Close dropdown on outside click
document.addEventListener("click", (e) => {
  if (!e.target.closest(".lookup-input-wrap")) {
    hideDropdown();
  }
});

// Dropdown item selection via event delegation
lookupDropdown.addEventListener("mousedown", (e) => {
  const item = e.target.closest(".dropdown-item");
  if (item) {
    e.preventDefault(); // prevent input blur
    lookupInput.value = item.dataset.address;
    hideDropdown();
    performLookup();
  }
});

btnClearLookup.addEventListener("click", () => {
  clearLookup();
});

// --- Modal Guide Event Listeners ---
btnGuide.addEventListener("click", () => {
  modalGuide.classList.remove("hidden");
  document.body.style.overflow = "hidden"; // Prevent background scroll
});

const closeModal = () => {
  modalGuide.classList.add("hidden");
  document.body.style.overflow = "";
};

btnCloseModal.addEventListener("click", closeModal);

// Close modal on click outside modal-container
modalGuide.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    closeModal();
  }
});

// Close modal on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalGuide.classList.contains("hidden")) {
    closeModal();
  }
});

function formatLookupAmount(mutezAmount) {
  if (!mutezAmount || mutezAmount === 0) return "0.00";
  const val = mutezAmount / 1_000_000;
  if (val < 0.01) {
    return val.toFixed(6).replace(/\.?0+$/, "");
  }
  return val.toFixed(2);
}

function renderDropdown(items) {
  activeIndex = -1;
  if (items.length === 0) {
    lookupDropdown.innerHTML = '<div class="dropdown-empty">No matching addresses</div>';
    lookupDropdown.classList.remove("hidden");
    return;
  }

  lookupDropdown.innerHTML = items
    .map(({ address, totalCtez, totalTez }) => {
      const ctezStr = totalCtez > 0 ? `${formatLookupAmount(totalCtez)} ctez` : "0 ctez";
      const tezStr = `${formatLookupAmount(totalTez)} ꜩ to withdraw`;
      const label = `${ctezStr} · ${tezStr}`;
      return `<div class="dropdown-item" data-address="${address}">
        <div class="dropdown-item-addr">${address}</div>
        <div class="dropdown-item-label">${label}</div>
      </div>`;
    })
    .join("");

  lookupDropdown.classList.remove("hidden");
}

function hideDropdown() {
  lookupDropdown.classList.add("hidden");
  activeIndex = -1;
}

function updateActiveItem(items) {
  items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
  if (items[activeIndex]) {
    items[activeIndex].scrollIntoView({ block: "nearest" });
  }
}

function performLookup() {
  const addr = lookupInput.value.trim();
  if (!addr || !addr.startsWith("tz")) return;

  isReadOnly = true;
  currentAddress = addr;
  selectedOven = null;
  ovens = [];

  // Show read-only UI
  sectionDisconnected.classList.add("hidden");
  sectionConnected.classList.remove("hidden");
  readonlyBanner.classList.remove("hidden");
  readonlyAddress.textContent = truncateAddress(addr);
  readonlyAddress.title = addr;

  loadOvens(addr);
}

function clearLookup() {
  isReadOnly = false;
  currentAddress = null;
  selectedOven = null;
  ovens = [];

  readonlyBanner.classList.add("hidden");
  sectionConnected.classList.add("hidden");
  sectionDisconnected.classList.remove("hidden");
  stepB.classList.add("hidden");
  stepC.classList.add("hidden");
  ovenList.innerHTML = "";
  lookupInput.value = "";
}

// --- Functions ---

function handleAccountChange(address) {
  // If we were in read-only lookup mode, clear it
  if (isReadOnly) {
    clearLookup();
  }

  currentAddress = address;
  selectedOven = null;
  ovens = [];
  isReadOnly = false;

  if (address) {
    // Connected
    sectionDisconnected.classList.add("hidden");
    sectionConnected.classList.remove("hidden");
    readonlyBanner.classList.add("hidden");
    walletInfo.classList.remove("hidden");
    btnConnect.classList.add("hidden");
    btnDisconnect.classList.remove("hidden");
    walletAddress.textContent = truncateAddress(address);
    walletAddress.title = address;

    // Load ovens
    loadOvens(address);
  } else {
    // Disconnected
    sectionDisconnected.classList.remove("hidden");
    sectionConnected.classList.add("hidden");
    readonlyBanner.classList.add("hidden");
    walletInfo.classList.add("hidden");
    btnConnect.classList.remove("hidden");
    btnConnect.disabled = false;
    btnConnect.textContent = "Connect Wallet";
    btnDisconnect.classList.add("hidden");
    walletAddress.textContent = "";
    stepB.classList.add("hidden");
    stepC.classList.add("hidden");
    ovenList.innerHTML = "";
  }
}

async function loadOvens(address) {
  ovenLoading.classList.remove("hidden");
  ovenEmpty.classList.add("hidden");
  ovenList.innerHTML = "";
  stepB.classList.add("hidden");
  stepC.classList.add("hidden");
  selectedOven = null;

  try {
    ovens = await fetchOvensByOwner(address);
    ovenLoading.classList.add("hidden");

    if (ovens.length === 0) {
      ovenEmpty.classList.remove("hidden");
      return;
    }

    renderOvenList(ovens);

    // Auto-select if only one oven
    if (ovens.length === 1) {
      selectOven(ovens[0]);
    }
  } catch (err) {
    ovenLoading.classList.add("hidden");
    ovenList.innerHTML = `<div class="status-strip status-error" style="margin: 16px;">Failed to load ovens: ${escapeHtml(err?.message || String(err))}</div>`;
  }
}

function renderOvenList(ovens) {
  ovenList.innerHTML = ovens
    .map((oven, idx) => {
      const tezVal = parseInt(oven.tezBalance, 10);
      const ctezVal = parseInt(oven.ctezOutstanding, 10);

      return `
      <div class="oven-card" data-oven-idx="${idx}" id="oven-card-${idx}">
        <div class="oven-card-header">
          <span class="oven-id">Oven #${oven.ovenId}</span>
          <span class="oven-select-hint">${ovens.length > 1 ? "click to select" : "selected"}</span>
        </div>
        <div class="oven-fields">
          <div class="oven-field">
            <span class="oven-field-label">ctez outstanding</span>
            <span class="oven-field-value ${ctezVal === 0 ? "zero" : ""}">${formatCtez(oven.ctezOutstanding)} ctez</span>
          </div>
          <div class="oven-field">
            <span class="oven-field-label">tez balance</span>
            <span class="oven-field-value ${tezVal === 0 ? "zero" : ""}">${formatTez(oven.tezBalance)} ꜩ</span>
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  // Add click handlers
  ovenList.querySelectorAll(".oven-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = parseInt(card.dataset.ovenIdx, 10);
      selectOven(ovens[idx]);
    });
  });

  // Auto-select first if only one
  if (ovens.length === 1) {
    ovenList.querySelector(".oven-card")?.classList.add("selected");
  }
}

function selectOven(oven) {
  selectedOven = oven;

  // Visual selection
  ovenList.querySelectorAll(".oven-card").forEach((card) => card.classList.remove("selected"));
  const idx = ovens.indexOf(oven);
  const card = ovenList.querySelector(`[data-oven-idx="${idx}"]`);
  if (card) card.classList.add("selected");

  const ctezVal = parseInt(oven.ctezOutstanding, 10);
  const tezVal = parseInt(oven.tezBalance, 10);

  // Step B — Burn
  $("burn-oven-id").textContent = oven.ovenId;
  $("burn-amount").textContent = `${formatCtez(oven.ctezOutstanding)} ctez`;
  $("burn-raw").textContent = `-${oven.ctezOutstanding}`;
  burnStatus.classList.add("hidden");

  if (isReadOnly) {
    // Read-only: show data but disable actions
    stepB.classList.remove("hidden");
    btnBurn.classList.add("hidden");
    if (ctezVal <= 0) {
      showStatus(burnStatus, "success", "No ctez outstanding — already burned or never minted.");
    }
  } else {
    btnBurn.classList.remove("hidden");
    if (ctezVal > 0) {
      stepB.classList.remove("hidden");
      btnBurn.disabled = false;
    } else {
      stepB.classList.remove("hidden");
      btnBurn.disabled = true;
      showStatus(burnStatus, "success", "No ctez outstanding — already burned or never minted.");
    }
  }

  // Step C — Withdraw
  $("withdraw-oven-id").textContent = oven.ovenId;
  $("withdraw-amount").textContent = `${formatTez(oven.tezBalance)} ꜩ`;
  $("withdraw-raw").textContent = oven.tezBalance;

  const displayAddr = isReadOnly ? currentAddress : currentAddress;
  $("withdraw-to").textContent = truncateAddress(displayAddr);
  $("withdraw-to").title = displayAddr;
  withdrawStatus.classList.add("hidden");

  if (isReadOnly) {
    // Read-only: show data but disable actions
    stepC.classList.remove("hidden");
    btnWithdraw.classList.add("hidden");
    if (tezVal <= 0) {
      showStatus(withdrawStatus, "success", "No tez balance — already withdrawn or empty.");
    }
  } else {
    btnWithdraw.classList.remove("hidden");
    if (tezVal > 0) {
      stepC.classList.remove("hidden");
      btnWithdraw.disabled = false;
    } else {
      stepC.classList.remove("hidden");
      btnWithdraw.disabled = true;
      showStatus(withdrawStatus, "success", "No tez balance — already withdrawn or empty.");
    }
  }
}

function showStatus(el, type, message, opHash) {
  el.classList.remove("hidden", "status-pending", "status-success", "status-error", "status-info", "status-warning");
  el.classList.add(`status-${type}`);

  let html = "";
  if (type === "pending") {
    html = `<span class="spinner"></span> ${escapeHtml(message)}`;
  } else if (type === "success") {
    html = `✅ ${escapeHtml(message)}`;
    if (opHash) {
      html += ` <a href="https://tzkt.io/${opHash}" target="_blank" rel="noopener">${opHash.slice(0, 12)}…</a>`;
    }
  } else if (type === "error") {
    html = `❌ ${escapeHtml(message)}`;
  } else if (type === "warning") {
    html = `⚠️ ${escapeHtml(message)}`;
  } else {
    html = escapeHtml(message);
  }

  el.innerHTML = html;
}

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
