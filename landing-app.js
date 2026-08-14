document.addEventListener("DOMContentLoaded", () => {
  initParticleCanvas();
  detectOSAndHighlightDownload();
  initMockupTabs();
  init3DTiltEffect();
  init3DScrollReveal();
});

/* ==========================================================================
   1. 3D Scroll Reveal & Feature Card Mouse Tilt Interactions
   ========================================================================== */
function init3DScrollReveal() {
  const revealElements = document.querySelectorAll(".reveal-3d");

  // Immediately reveal all elements in initial viewport so screen is never black
  revealElements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add("revealed");
    }
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
        }
      });
    },
    { threshold: 0.01 }
  );

  revealElements.forEach((el) => observer.observe(el));

  // Add individual 3D mouse tilt effect to feature cards upon hover
  document.querySelectorAll(".feature-card-3d").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      if (!card.classList.contains("revealed")) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const rotX = (y / (rect.height / 2)) * -8;
      const rotY = (x / (rect.width / 2)) * 8;
      card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(12px) scale(1.02)`;
    });

    card.addEventListener("mouseleave", () => {
      if (!card.classList.contains("revealed")) return;
      card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0) scale(1)`;
    });
  });
}

/* ==========================================================================
   1. HTML5 Canvas 3D Orbital Grid & Floating Particle Background
   ========================================================================== */
function initParticleCanvas() {
  const canvas = document.getElementById("bgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const numParticles = Math.min(Math.floor(width / 22), 70);

  for (let i = 0; i < numParticles; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 2 + 1,
      alpha: Math.random() * 0.5 + 0.2
    });
  }

  function renderCanvas() {
    ctx.clearRect(0, 0, width, height);

    // Draw connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 140) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0, 246, 255, ${0.12 * (1 - dist / 140)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    // Draw particles
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 246, 255, ${p.alpha})`;
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#00f6ff";
      ctx.fill();
    });

    requestAnimationFrame(renderCanvas);
  }

  renderCanvas();
}

/* ==========================================================================
   2. Interactive 3D Perspective Tilt Effect
   ========================================================================== */
function init3DTiltEffect() {
  const card = document.getElementById("mockupCard3D");
  if (!card) return;

  const wrapper = card.parentElement;
  wrapper.addEventListener("mousemove", (e) => {
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotX = (y / (rect.height / 2)) * -12;
    const rotY = (x / (rect.width / 2)) * 12;

    card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.01)`;
  });

  wrapper.addEventListener("mouseleave", () => {
    card.style.transform = `rotateX(8deg) rotateY(-3deg) scale(0.98)`;
  });
}

/* ==========================================================================
   3. OS Auto Detection & Direct File Download
   ========================================================================== */
function detectOSAndHighlightDownload() {
  const platform = navigator.userAgent.toLowerCase();
  const primaryBtn = document.getElementById("primaryDownloadBtn");
  const primaryLabel = document.getElementById("primaryDownloadLabel");
  const secondaryBtn = document.getElementById("secondaryDownloadBtn");
  const secondaryLabel = document.getElementById("secondaryDownloadLabel");
  const osLabel = document.getElementById("detectedOsLabel");

  let isMac = platform.includes("mac");

  if (isMac) {
    if (primaryBtn) {
      primaryBtn.href = "downloads/PlanWell-1.0.0.dmg";
      primaryBtn.setAttribute("download", "PlanWell-1.0.0.dmg");
    }
    if (primaryLabel) primaryLabel.textContent = "Download for macOS (.dmg)";

    if (secondaryBtn) {
      secondaryBtn.href = "downloads/PlanWell-Setup-1.0.0.exe";
      secondaryBtn.setAttribute("download", "PlanWell-Setup-1.0.0.exe");
    }
    if (secondaryLabel) secondaryLabel.textContent = "Download for Windows (.exe)";

    if (osLabel) osLabel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> macOS Auto-detected &bull; Intel &amp; Apple Silicon Installer Ready`;
  } else {
    if (primaryBtn) {
      primaryBtn.href = "downloads/PlanWell-Setup-1.0.0.exe";
      primaryBtn.setAttribute("download", "PlanWell-Setup-1.0.0.exe");
    }
    if (primaryLabel) primaryLabel.textContent = "Download for Windows (.exe)";

    if (secondaryBtn) {
      secondaryBtn.href = "downloads/PlanWell-1.0.0.dmg";
      secondaryBtn.setAttribute("download", "PlanWell-1.0.0.dmg");
    }
    if (secondaryLabel) secondaryLabel.textContent = "Download for macOS (.dmg)";

    if (osLabel) osLabel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Windows 10/11 Auto-detected &bull; 64-bit Direct Installer Ready`;
  }
}

/* ==========================================================================
   4. Mockup Interactive Preview Tabs
   ========================================================================== */
function initMockupTabs() {
  const tabs = document.querySelectorAll(".mockup-tab");
  const viewport = document.getElementById("mockupViewport");

  const views = {
    dashboard: `
      <div class="mockup-sidebar">
        <div class="mockup-menu-item active">Dashboard</div>
        <div class="mockup-menu-item">My Goals (1)</div>
        <div class="mockup-menu-item">Daily Habits (3)</div>
        <div class="mockup-menu-item">Friends Leaderboard</div>
      </div>
      <div class="mockup-content">
        <h3 style="font-size:1.15rem; color:#fff; margin-bottom:4px;">Dashboard: Today's Focus</h3>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">3 micro-steps remaining &bull; Streak: 6 Days &bull; Level 4 Achiever</p>
        <div style="background:rgba(255,255,255,0.05); border-radius:10px; height:10px; overflow:hidden; border:1px solid rgba(0,246,255,0.2); margin-bottom:14px;">
          <div style="width:75%; height:100%; background:linear-gradient(90deg, #00f6ff, #00ffd0); box-shadow:0 0 15px #00ffd0;"></div>
        </div>
        <div style="display:flex; gap:10px;">
          <div style="flex:1; background:rgba(0,246,255,0.06); padding:10px; border-radius:8px; border:1px solid rgba(0,246,255,0.2); font-size:0.82rem; color:#fff;">
            <strong>Step 1:</strong> Read 15 mins Tech Docs <span style="color:#00ffd0;">(Done)</span>
          </div>
          <div style="flex:1; background:rgba(0,246,255,0.06); padding:10px; border-radius:8px; border:1px solid rgba(0,246,255,0.2); font-size:0.82rem; color:#fff;">
            <strong>Step 2:</strong> 10 min Code Refactor <span style="color:#00f6ff;">(In Progress)</span>
          </div>
        </div>
      </div>
    `,
    goals: `
      <div class="mockup-sidebar">
        <div class="mockup-menu-item">Dashboard</div>
        <div class="mockup-menu-item active">My Goals (1)</div>
        <div class="mockup-menu-item">Daily Habits (3)</div>
        <div class="mockup-menu-item">Friends Leaderboard</div>
      </div>
      <div class="mockup-content">
        <h3 style="font-size:1.15rem; color:var(--cyan); margin-bottom:4px;">Goal: Master Fullstack Engineering</h3>
        <p style="font-size:0.8rem; color:#00ffd0; margin-bottom:10px;">Category: Coding &bull; Deadline: Dec 31, 2026</p>
        <div style="font-size:0.85rem; color:#e9fdff; background:rgba(0,246,255,0.08); padding:10px 14px; border-radius:10px; border:1px solid var(--panel-border); margin-bottom:8px;">
          <strong style="color:#00ffd0;">WHY:</strong> Build my dream startup &amp; create financial independence
        </div>
        <div style="font-size:0.85rem; color:#e9fdff; background:rgba(0,246,255,0.08); padding:10px 14px; border-radius:10px; border:1px solid var(--panel-border);">
          <strong style="color:#00f6ff;">SUCCESS METRIC:</strong> Ship 3 fullstack web apps &amp; get 100 users
        </div>
      </div>
    `,
    habits: `
      <div class="mockup-sidebar">
        <div class="mockup-menu-item">Dashboard</div>
        <div class="mockup-menu-item">My Goals (1)</div>
        <div class="mockup-menu-item active">Daily Habits (3)</div>
        <div class="mockup-menu-item">Friends Leaderboard</div>
      </div>
      <div class="mockup-content">
        <h3 style="font-size:1.15rem; color:var(--mint); margin-bottom:8px;">Today's Linked Micro-Step Habits</h3>
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(6,24,38,0.8); padding:10px 14px; border-radius:10px; border:1px solid var(--panel-border); margin-bottom:8px;">
          <div>
            <div style="font-size:0.88rem; color:#fff; font-weight:600;">Daily 30 Mins Coding Practice</div>
            <div style="font-size:0.75rem; color:#00ffd0;">Linked to Goal #1 Step 2</div>
          </div>
          <span style="color:var(--mint); font-weight:bold; font-size:0.82rem;">Completed</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(6,24,38,0.8); padding:10px 14px; border-radius:10px; border:1px solid var(--panel-border);">
          <div>
            <div style="font-size:0.88rem; color:#fff; font-weight:600;">Morning 10m Mindful Focus</div>
            <div style="font-size:0.75rem; color:#7caab4;">Linked to General Wellness</div>
          </div>
          <span style="color:#00f6ff; font-size:0.82rem;">Mark Done</span>
        </div>
      </div>
    `,
    rewards: `
      <div class="mockup-sidebar">
        <div class="mockup-menu-item">Dashboard</div>
        <div class="mockup-menu-item">My Goals (1)</div>
        <div class="mockup-menu-item">Daily Habits (3)</div>
        <div class="mockup-menu-item active">Rewards & Level</div>
      </div>
      <div class="mockup-content">
        <h3 style="font-size:1.15rem; color:var(--mint); margin-bottom:8px;">Gamified Rewards &amp; XP Level</h3>
        <div style="display:flex; justify-content:space-between; background:rgba(0,255,208,0.1); padding:10px 14px; border-radius:10px; border:1px solid var(--mint); margin-bottom:8px; font-size:0.85rem;">
          <span>Current Rank: <strong>Level 3 Achieved</strong> &bull; 6 Day Streak</span>
          <span style="color:#00ffd0; font-weight:bold;">1,240 XP</span>
        </div>
        <div style="display:flex; justify-content:space-between; background:rgba(6,24,38,0.8); padding:10px 14px; border-radius:10px; border:1px solid var(--panel-border); font-size:0.85rem;">
          <span>Unlocked Reward: <strong>Weekend Gaming Session</strong></span>
          <span style="color:#00f6ff;">Claimed ✓</span>
        </div>
      </div>
    `
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      if (views[target] && viewport) {
        viewport.innerHTML = views[target];
      }
    });
  });
}

/* ==========================================================================
   5. Pricing Toggle & Traditional SaaS Checkout Modal
   ========================================================================== */
let isYearly = false;
function toggleBilling() {
  isYearly = !isYearly;
  const toggle = document.getElementById("billingToggle");
  const priceDisplay = document.getElementById("proPriceDisplay");
  const monthlyLabel = document.getElementById("monthlyLabel");
  const yearlyLabel = document.getElementById("yearlyLabel");
  const summaryPlanLabel = document.getElementById("summaryPlanLabel");
  const summaryTotalLabel = document.getElementById("summaryTotalLabel");

  if (toggle) toggle.classList.toggle("active", isYearly);

  if (isYearly) {
    if (priceDisplay) priceDisplay.innerHTML = `&#8377;1,999 <span>/ year</span>`;
    if (monthlyLabel) monthlyLabel.style.color = "var(--text-muted)";
    if (yearlyLabel) yearlyLabel.style.color = "#fff";
    if (summaryPlanLabel) summaryPlanLabel.textContent = "Pro Yearly Plan";
    if (summaryTotalLabel) summaryTotalLabel.innerHTML = "&#8377;1,999";
  } else {
    if (priceDisplay) priceDisplay.innerHTML = `&#8377;199 <span>/ month</span>`;
    if (monthlyLabel) monthlyLabel.style.color = "#fff";
    if (yearlyLabel) yearlyLabel.style.color = "var(--text-muted)";
    if (summaryPlanLabel) summaryPlanLabel.textContent = "Pro Monthly Plan";
    if (summaryTotalLabel) summaryTotalLabel.innerHTML = "&#8377;199";
  }
}

function openCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  if (modal) modal.classList.add("active");
}

function closeCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  if (modal) modal.classList.remove("active");
}

function switchPayTab(type) {
  document.querySelectorAll(".pay-tab").forEach((tab) => tab.classList.remove("active"));
  const cardForm = document.getElementById("cardPayForm");
  const upiForm = document.getElementById("upiPayForm");

  if (type === "card") {
    document.querySelectorAll(".pay-tab")[0]?.classList.add("active");
    if (cardForm) cardForm.style.display = "block";
    if (upiForm) upiForm.style.display = "none";
  } else {
    document.querySelectorAll(".pay-tab")[1]?.classList.add("active");
    if (cardForm) cardForm.style.display = "none";
    if (upiForm) upiForm.style.display = "block";
  }
}

function processPaymentSubmit() {
  localStorage.setItem("planwell_pro_unlocked", "true");
  alert("Payment Successful! Plan Well Pro features have been unlocked on your account.");
  closeCheckoutModal();
}
