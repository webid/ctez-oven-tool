/**
 * Main app entry — UI orchestration for ctez Oven Tool.
 * Wires up wallet connect/disconnect, oven loading, burn/withdraw operations,
 * and read-only address lookup mode.
 */

import "./style.css";

import { initWallet, checkExistingConnection, connectWallet, disconnectWallet } from "./wallet.js";
import { fetchOvensByOwner, fetchAllOvenOwners } from "./tzkt.js";
import { closeOven, formatTez, formatCtez } from "./contract.js";
import { createLookupOptions } from "./lookupDisplay.js";
import { isTestLookupWallet, lookupIsReadOnly } from "./testWalletMode.js";
import { iconSvg } from "./uiIcons.js";

// --- State ---
let currentAddress = null;
let connectedWalletAddress = null;
let ovens = [];
let selectedOven = null;
let isReadOnly = false; // true for lookup previews without the special test wallet

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
const btnCloseOven = $("btn-close-oven");
const closeStatus = $("close-status");
const lookupInput = $("lookup-input");
const btnLookup = $("btn-lookup");
const lookupLoadingHint = $("lookup-loading-hint");
const readonlyBanner = $("readonly-banner");
const readonlyAddress = $("readonly-address");
const lookupModeLabel = $("lookup-mode-label");
const lookupHeroText = $("lookup-hero-text");
const btnClearLookup = $("btn-clear-lookup");
const lookupDropdown = $("lookup-dropdown");
const btnGuide = $("btn-guide");
const modalGuide = $("modal-guide");
const btnCloseModal = $("btn-close-modal");

// Dropdown state
let allOwners = [];   // full list from TzKT
let activeIndex = -1; // keyboard nav index
let lastFocusedBeforeModal = null;

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
  if (connectedWalletAddress) {
    navigator.clipboard.writeText(connectedWalletAddress).then(() => {
      const original = btnCopyAddress.innerHTML;
      btnCopyAddress.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        btnCopyAddress.innerHTML = original;
      }, 1500);
    });
  }
});

btnCloseOven.addEventListener("click", async () => {
  if (!selectedOven || !currentAddress || !connectedWalletAddress || isReadOnly) return;
  if (!isPositiveAmount(selectedOven.ctezOutstanding) && !isPositiveAmount(selectedOven.tezBalance)) {
    showStatus(closeStatus, "info", "No ctez or tez to close for this oven.");
    return;
  }

  btnCloseOven.disabled = true;
  try {
    await closeOven(selectedOven, currentAddress, (status) => {
      showStatus(closeStatus, status.type, status.message, status.opHash);
    });
    await loadOvens(currentAddress);
  } catch (err) {
    showStatus(closeStatus, "error", `Batch failed: ${err?.message || String(err)}`);
  } finally {
    btnCloseOven.disabled = false;
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
  lastFocusedBeforeModal = document.activeElement;
  modalGuide.classList.remove("hidden");
  document.body.style.overflow = "hidden"; // Prevent background scroll
  btnCloseModal.focus();
});

const closeModal = () => {
  modalGuide.classList.add("hidden");
  document.body.style.overflow = "";
  if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
    lastFocusedBeforeModal.focus();
  }
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

modalGuide.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;

  const focusable = modalGuide.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (!first || !last) return;

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function renderDropdown(items) {
  activeIndex = -1;
  lookupDropdown.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dropdown-empty";
    empty.textContent = "No matching addresses";
    lookupDropdown.append(empty);
    lookupDropdown.classList.remove("hidden");
    lookupInput.setAttribute("aria-expanded", "true");
    lookupInput.removeAttribute("aria-activedescendant");
    return;
  }

  const fragment = document.createDocumentFragment();
  createLookupOptions(items).forEach(({ address, ctezLabel, tezLabel }, idx) => {
    const item = document.createElement("button");
    const itemAddress = document.createElement("span");
    const itemLabel = document.createElement("span");

    item.type = "button";
    item.id = `lookup-option-${idx}`;
    item.className = "dropdown-item";
    item.dataset.address = address;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");

    itemAddress.className = "dropdown-item-addr";
    itemAddress.textContent = address;
    itemLabel.className = "dropdown-item-label";
    itemLabel.textContent = `${ctezLabel} · ${tezLabel}`;

    item.append(itemAddress, itemLabel);
    fragment.append(item);
  });

  lookupDropdown.append(fragment);

  lookupDropdown.classList.remove("hidden");
  lookupInput.setAttribute("aria-expanded", "true");
  lookupInput.removeAttribute("aria-activedescendant");
}

function hideDropdown() {
  lookupDropdown.classList.add("hidden");
  lookupInput.setAttribute("aria-expanded", "false");
  lookupInput.removeAttribute("aria-activedescendant");
  activeIndex = -1;
}

function updateActiveItem(items) {
  items.forEach((el, i) => {
    const active = i === activeIndex;
    el.classList.toggle("active", active);
    el.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (items[activeIndex]) {
    lookupInput.setAttribute("aria-activedescendant", items[activeIndex].id);
    items[activeIndex].scrollIntoView({ block: "nearest" });
  }
}

function performLookup() {
  const addr = lookupInput.value.trim();
  if (!addr || !addr.startsWith("tz")) return;

  isReadOnly = lookupIsReadOnly({ connectedWalletAddress, lookupAddress: addr });
  currentAddress = addr;
  selectedOven = null;
  ovens = [];

  sectionDisconnected.classList.toggle("hidden", !isTestLookupWallet(connectedWalletAddress));
  sectionConnected.classList.remove("hidden");
  readonlyBanner.classList.remove("hidden");
  lookupModeLabel.innerHTML = isReadOnly
    ? `${iconSvg("view")} <span>Viewing ovens for</span>`
    : `${iconSvg("view")} <span>Test mode: acting as</span>`;
  readonlyAddress.textContent = truncateAddress(addr);
  readonlyAddress.title = addr;

  loadOvens(addr);
}

function clearLookup() {
  isReadOnly = false;
  currentAddress = connectedWalletAddress;
  selectedOven = null;
  ovens = [];

  readonlyBanner.classList.add("hidden");
  sectionConnected.classList.toggle("hidden", !connectedWalletAddress);
  sectionDisconnected.classList.toggle("hidden", !!connectedWalletAddress && !isTestLookupWallet(connectedWalletAddress));
  stepB.classList.add("hidden");
  ovenList.innerHTML = "";
  lookupInput.value = "";

  if (connectedWalletAddress) {
    loadOvens(connectedWalletAddress);
  }
}

// --- Functions ---

function handleAccountChange(address) {
  // If we were in read-only lookup mode, clear it
  if (isReadOnly) {
    clearLookup();
  }

  connectedWalletAddress = address;
  currentAddress = address;
  selectedOven = null;
  ovens = [];
  isReadOnly = false;

  if (address) {
    // Connected
    sectionDisconnected.classList.toggle("hidden", !isTestLookupWallet(address));
    sectionDisconnected.classList.toggle("lookup-panel", isTestLookupWallet(address));
    sectionConnected.classList.remove("hidden");
    readonlyBanner.classList.add("hidden");
    walletInfo.classList.remove("hidden");
    btnConnect.classList.add("hidden");
    btnDisconnect.classList.remove("hidden");
    walletAddress.textContent = truncateAddress(address);
    walletAddress.title = address;
    lookupHeroText.textContent = isTestLookupWallet(address)
      ? "Test mode: look up an oven owner and use the connected UI with that owner's ovens"
      : "Connect your wallet to view and close your ctez ovens";

    // Load ovens
    loadOvens(address);
  } else {
    // Disconnected
    connectedWalletAddress = null;
    sectionDisconnected.classList.remove("hidden");
    sectionDisconnected.classList.remove("lookup-panel");
    sectionConnected.classList.add("hidden");
    readonlyBanner.classList.add("hidden");
    walletInfo.classList.add("hidden");
    btnConnect.classList.remove("hidden");
    btnConnect.disabled = false;
    btnConnect.textContent = "Connect Wallet";
    btnDisconnect.classList.add("hidden");
    walletAddress.textContent = "";
    lookupHeroText.textContent = "Connect your wallet to view and close your ctez ovens";
    stepB.classList.add("hidden");
    ovenList.innerHTML = "";
  }
}

async function loadOvens(address) {
  ovenLoading.classList.remove("hidden");
  ovenEmpty.classList.add("hidden");
  ovenList.innerHTML = "";
  stepB.classList.add("hidden");
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
      const hasTez = isPositiveAmount(oven.tezBalance);
      const hasCtez = isPositiveAmount(oven.ctezOutstanding);

      return `
      <button type="button" class="oven-card" data-oven-idx="${idx}" id="oven-card-${idx}" aria-pressed="false">
        <div class="oven-card-header">
          <span class="oven-id">Oven #${oven.ovenId}</span>
          <span class="oven-select-hint">${ovens.length > 1 ? "click to select" : "selected"}</span>
        </div>
        <div class="oven-fields">
          <div class="oven-field">
            <span class="oven-field-label">ctez outstanding</span>
            <span class="oven-field-value ${hasCtez ? "" : "zero"}">${formatCtez(oven.ctezOutstanding)} ctez</span>
          </div>
          <div class="oven-field">
            <span class="oven-field-label">tez balance</span>
            <span class="oven-field-value ${hasTez ? "" : "zero"}">${formatTez(oven.tezBalance)} ꜩ</span>
          </div>
        </div>
      </button>
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
  ovenList.querySelectorAll(".oven-card").forEach((card) => {
    card.classList.remove("selected");
    card.setAttribute("aria-pressed", "false");
  });
  const idx = ovens.indexOf(oven);
  const card = ovenList.querySelector(`[data-oven-idx="${idx}"]`);
  if (card) {
    card.classList.add("selected");
    card.setAttribute("aria-pressed", "true");
  }

  const hasCtez = isPositiveAmount(oven.ctezOutstanding);
  const hasTez = isPositiveAmount(oven.tezBalance);

  $("close-oven-id").textContent = oven.ovenId;
  $("close-burn-amount").textContent = hasCtez ? `${formatCtez(oven.ctezOutstanding)} ctez` : "Skipped";
  $("close-burn-raw").textContent = hasCtez ? `-${oven.ctezOutstanding}` : "0";
  $("close-withdraw-amount").textContent = hasTez ? `${formatTez(oven.tezBalance)} ꜩ` : "Skipped";
  $("close-withdraw-raw").textContent = oven.tezBalance;

  $("close-withdraw-to").textContent = truncateAddress(currentAddress);
  $("close-withdraw-to").title = currentAddress;
  closeStatus.classList.add("hidden");
  stepB.classList.remove("hidden");

  if (isReadOnly) {
    btnCloseOven.classList.add("hidden");
    showClosePreviewStatus(hasCtez, hasTez);
  } else {
    btnCloseOven.classList.remove("hidden");
    btnCloseOven.disabled = !hasCtez && !hasTez;
    if (hasCtez && hasTez) {
      showStatus(closeStatus, "info", "This will burn ctez first, then withdraw the full oven tez balance in one atomic batch.");
    } else if (hasCtez) {
      showStatus(closeStatus, "info", "This will burn the full ctez outstanding amount in one batch.");
    } else if (hasTez) {
      showStatus(closeStatus, "info", "No ctez burn is needed. This will withdraw the full oven tez balance.");
    } else {
      showStatus(closeStatus, "success", "No ctez or tez to close for this oven.");
    }
  }
}

function showClosePreviewStatus(hasCtez, hasTez) {
  if (hasCtez && hasTez) {
    showStatus(closeStatus, "info", "Read-only preview: burn ctez first, then withdraw the full oven tez balance in one atomic batch.");
  } else if (hasCtez) {
    showStatus(closeStatus, "info", "Read-only preview: burn the full ctez outstanding amount.");
  } else if (hasTez) {
    showStatus(closeStatus, "info", "Read-only preview: no burn needed; withdraw the full oven tez balance.");
  } else {
    showStatus(closeStatus, "success", "No ctez or tez to close for this oven.");
  }
}

function showStatus(el, type, message, opHash) {
  el.classList.remove("hidden", "status-pending", "status-success", "status-error", "status-info", "status-warning");
  el.classList.add(`status-${type}`);
  el.setAttribute("role", type === "error" ? "alert" : "status");

  let html = "";
  if (type === "pending") {
    html = `<span class="spinner"></span> ${escapeHtml(message)}`;
  } else if (type === "success") {
    html = `${iconSvg("success")} <span>${escapeHtml(message)}</span>`;
    if (opHash) {
      html += ` <a href="https://tzkt.io/${opHash}" target="_blank" rel="noopener">${opHash.slice(0, 12)}…</a>`;
    }
  } else if (type === "error") {
    html = `${iconSvg("error")} <span>${escapeHtml(message)}</span>`;
  } else if (type === "warning") {
    html = `${iconSvg("warning")} <span>${escapeHtml(message)}</span>`;
  } else {
    html = escapeHtml(message);
  }

  el.innerHTML = html;
}

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isPositiveAmount(amount) {
  return /^\d+$/.test(String(amount)) && BigInt(amount) > 0n;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
