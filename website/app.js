// Plan Well Marketing Website Interactive Logic

document.addEventListener("DOMContentLoaded", () => {
  detectOSAndHighlightDownload();
  initMockupTabs();
});

// OS Auto Detection
function detectOSAndHighlightDownload() {
  const platform = navigator.userAgent.toLowerCase();
  const primaryBtn = document.getElementById("primaryDownloadBtn");
  const primaryLabel = document.getElementById("primaryDownloadLabel");
  const secondaryLabel = document.getElementById("secondaryDownloadLabel");
  const osLabel = document.getElementById("detectedOsLabel");

  let isMac = platform.includes("mac");
  let isWin = platform.includes("win");

  if (isMac) {
    if (primaryLabel) primaryLabel.textContent = "Download for macOS (.dmg)";
    if (secondaryLabel) secondaryLabel.textContent = "Download for Windows (.exe)";
    if (osLabel) osLabel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> macOS Auto-detected &bull; Intel &amp; Apple Silicon Ready`;
  } else {
    if (primaryLabel) primaryLabel.textContent = "Download for Windows (.exe)";
    if (secondaryLabel) secondaryLabel.textContent = "Download for macOS (.dmg)";
    if (osLabel) osLabel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Windows 10/11 Auto-detected &bull; 64-bit Installer Ready`;
  }
}

// Mockup Interactive Tabs
function initMockupTabs() {
  const tabs = document.querySelectorAll(".mockup-tab");
  const viewport = document.getElementById("mockupViewport");

  const views = {
    dashboard: `
      <div class="mockup-sidebar">
        <div class="mockup-menu-item active">Dashboard</div>
        <div class="mockup-menu-item">My Goals (3)</div>
        <div class="mockup-menu-item">Daily Habits</div>
        <div class="mockup-menu-item">XP Rewards</div>
      </div>
      <div class="mockup-content">
        <h3 style="font-size:1.1rem; color:#fff;">Dashboard: Today's Focus</h3>
        <p style="font-size:0.85rem; color:var(--text-muted);">2 micro-steps remaining &bull; Streak: 6 Days</p>
        <div style="background:rgba(255,255,255,0.05); border-radius:8px; height:8px; overflow:hidden;">
          <div style="width:85%; height:100%; background:linear-gradient(90deg, #00f6ff, #00ffd0);"></div>
        </div>
      </div>
    `,
    goals: `
      <div class="mockup-sidebar">
        <div class="mockup-menu-item">Dashboard</div>
        <div class="mockup-menu-item active">My Goals (3)</div>
        <div class="mockup-menu-item">Daily Habits</div>
        <div class="mockup-menu-item">XP Rewards</div>
      </div>
      <div class="mockup-content">
        <h3 style="font-size:1.1rem; color:var(--cyan);">Goal: Learn Fullstack Development</h3>
        <div style="font-size:0.85rem; color:var(--text-muted); background:rgba(0,246,255,0.08); padding:10px; border-radius:8px; border:1px solid var(--border-cyan);">
          <strong>Micro-Step 1:</strong> Practice 30 mins JavaScript functions &bull; Routine: Morning 9 AM
        </div>
        <div style="font-size:0.85rem; color:var(--text-muted); background:rgba(0,246,255,0.08); padding:10px; border-radius:8px; border:1px solid var(--border-cyan);">
          <strong>Micro-Step 2:</strong> Build 1 mini-project component &bull; Routine: Evening 5 PM
        </div>
      </div>
    `,
    habits: `
      <div class="mockup-sidebar">
        <div class="mockup-menu-item">Dashboard</div>
        <div class="mockup-menu-item">My Goals (3)</div>
        <div class="mockup-menu-item active">Daily Habits</div>
        <div class="mockup-menu-item">XP Rewards</div>
      </div>
      <div class="mockup-content">
        <h3 style="font-size:1.1rem; color:var(--mint);">Today's Habit Checklist</h3>
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(7,30,46,0.8); padding:10px 14px; border-radius:8px; border:1px solid var(--border-cyan);">
          <span>Read 15 Pages of Book</span>
          <span style="color:var(--mint); font-weight:bold;">Completed (+20 XP)</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(7,30,46,0.8); padding:10px 14px; border-radius:8px; border:1px solid var(--border-cyan);">
          <span>Morning Meditation (10m)</span>
          <span style="color:var(--mint); font-weight:bold;">Completed (+15 XP)</span>
        </div>
      </div>
    `,
    rewards: `
      <div class="mockup-sidebar">
        <div class="mockup-menu-item">Dashboard</div>
        <div class="mockup-menu-item">My Goals (3)</div>
        <div class="mockup-menu-item">Daily Habits</div>
        <div class="mockup-menu-item active">XP Rewards</div>
      </div>
      <div class="mockup-content">
        <h3 style="font-size:1.1rem; color:var(--lime);">XP Rewards Vault (350 XP)</h3>
        <div style="background:rgba(0,255,208,0.1); padding:12px; border-radius:8px; border:1px solid var(--mint);">
          <div style="font-weight:bold; color:#fff;">Reward: Watch 1 Episode of Favorite Show</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">Cost: 200 XP &bull; Status: Ready to Claim</div>
        </div>
      </div>
    `
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      if (views[target] && viewport) {
        viewport.innerHTML = views[target];
      }
    });
  });
}

// Pricing Toggle
let isLifetime = false;
function toggleBilling() {
  isLifetime = !isLifetime;
  const toggle = document.getElementById("billingToggle");
  const priceDisplay = document.getElementById("proPriceDisplay");
  const monthlyLabel = document.getElementById("monthlyLabel");
  const lifetimeLabel = document.getElementById("lifetimeLabel");

  if (toggle) toggle.classList.toggle("active", isLifetime);

  if (isLifetime) {
    if (priceDisplay) priceDisplay.innerHTML = `&#8377;999 <span>/ lifetime access</span>`;
    if (monthlyLabel) monthlyLabel.style.color = "var(--text-muted)";
    if (lifetimeLabel) lifetimeLabel.style.color = "#fff";
  } else {
    if (priceDisplay) priceDisplay.innerHTML = `&#8377;199 <span>/ month</span>`;
    if (monthlyLabel) monthlyLabel.style.color = "#fff";
    if (lifetimeLabel) lifetimeLabel.style.color = "var(--text-muted)";
  }
}

// FamPay Modal Handlers
function openFamPayModal() {
  const modal = document.getElementById("famPayModal");
  if (modal) modal.classList.add("active");
}

function closeFamPayModal() {
  const modal = document.getElementById("famPayModal");
  if (modal) modal.classList.remove("active");
}

function confirmFamPayPayment() {
  const input = document.getElementById("txRefInput");
  const ref = String(input?.value || "").trim();
  if (!ref) {
    alert("Please enter your FamPay Transaction ID or Reference Number.");
    return;
  }
  localStorage.setItem("planwell_pro_unlocked", "true");
  alert("Payment Reference Received! Plan Well Pro has been activated on your device.");
  closeFamPayModal();
}
