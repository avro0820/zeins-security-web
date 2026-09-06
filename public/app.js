// ── Helper: Determine initial API base URL ───────────────────
function getInitialApiBase() {
  const saved = localStorage.getItem("zeins_api_base");
  if (saved) return saved.replace(/\/+$/, "");
  // If running on Firebase Hosting or external static host, point to Render backend
  if (window.location.hostname.endsWith(".web.app") || window.location.hostname.endsWith(".firebaseapp.com")) {
    return "https://zeins-help-center-backend.onrender.com";
  }
  return window.location.origin;
}

// ── App State ─────────────────────────────────────────────
const state = {
  token: localStorage.getItem("zeins_token") || null,
  user: JSON.parse(localStorage.getItem("zeins_user") || "null"),
  sectors: [],
  currentSector: null,
  boxes: [],
  users: [],
  apiBase: getInitialApiBase(),
};

// ── Toast System ───────────────────────────────────────────
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const icon = type === "success" ? "fa-circle-check"
             : type === "error" ? "fa-circle-xmark"
             : "fa-circle-info";
             
  toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ── API Helper ─────────────────────────────────────────────
async function apiRequest(endpoint, options = {}) {
  const headers = { ...options.headers };
  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(`${state.apiBase}${endpoint}`, {
      ...options,
      headers,
    });
    
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error(
        `Backend API returned an invalid response (HTML). Current API URL is "${state.apiBase}". Click the Gear icon (⚙️) in the top bar to set your live Render Backend URL.`
      );
    }

    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (err) {
    console.error(`API Error (${endpoint}):`, err);
    throw err;
  }
}

// ── Health / API Status Check ──────────────────────────────
async function checkApiHealth() {
  const pill = document.getElementById("api-status");
  if (!pill) return;
  const dot = pill.querySelector(".status-dot");
  const label = pill.querySelector(".status-label");

  label.textContent = "Connecting...";
  try {
    const res = await fetch(`${state.apiBase}/api/health`);
    if (res.ok) {
      dot.className = "status-dot online";
      label.textContent = "API Online";
    } else {
      throw new Error();
    }
  } catch {
    dot.className = "status-dot offline";
    label.textContent = "API Offline (Click ⚙️)";
  }
}

// ── Auth Handling ──────────────────────────────────────────
function updateAuthUI() {
  const guestNav = document.getElementById("auth-nav-guest");
  const userNav = document.getElementById("auth-nav-user");
  const adminLinks = document.querySelectorAll(".admin-only");

  if (state.user && state.token) {
    guestNav?.classList.add("hidden");
    userNav?.classList.remove("hidden");

    const nameEl = document.getElementById("nav-user-name");
    if (nameEl) nameEl.textContent = state.user.name || state.user.email.split("@")[0];
    
    const roleBadge = document.getElementById("nav-user-role");
    if (roleBadge) {
      roleBadge.textContent = state.user.role;
      roleBadge.className = `role-badge ${state.user.role}`;
    }

    const avatarEl = document.getElementById("nav-user-avatar");
    if (avatarEl) avatarEl.textContent = (state.user.name || state.user.email)[0].toUpperCase();

    const isAdmin = state.user.role === "admin" || state.user.role === "owner";
    adminLinks.forEach((el) => {
      if (isAdmin) el.classList.remove("hidden");
      else el.classList.add("hidden");
    });
  } else {
    guestNav?.classList.remove("hidden");
    userNav?.classList.add("hidden");
    adminLinks.forEach((el) => el.classList.add("hidden"));
  }
}

function handleLogin(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("zeins_token", token);
  localStorage.setItem("zeins_user", JSON.stringify(user));
  updateAuthUI();
  document.getElementById("auth-modal")?.classList.add("hidden");
  showToast(`Welcome, ${user.name || user.email}! (${user.role.toUpperCase()})`, "success");
  loadDashboardData();
}

function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("zeins_token");
  localStorage.removeItem("zeins_user");
  updateAuthUI();
  showToast("You have been logged out.", "info");
  loadDashboardData();
}

// ── Views Navigation ───────────────────────────────────────
function switchView(viewId) {
  document.querySelectorAll(".content-view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));

  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.add("active");

  const matchingLink = document.querySelector(`.nav-link[data-view="${viewId}"]`);
  if (matchingLink) matchingLink.classList.add("active");

  if (viewId === "admin-view") loadAdminUsers();
}

// ── Load Sectors & Dashboard ───────────────────────────────
async function loadDashboardData() {
  const grid = document.getElementById("sectors-grid");
  if (!grid) return;

  try {
    const data = await apiRequest("/api/sectors");
    state.sectors = data.sectors || [];

    const countEl = document.getElementById("stat-sectors-count");
    if (countEl) countEl.textContent = state.sectors.length;

    if (state.sectors.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-folder-open"></i>
          <p>No sectors available yet. ${state.user?.role === 'owner' || state.user?.role === 'admin' ? 'Click "+ New Sector" to create one!' : 'Log in to view restricted sectors.'}</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = state.sectors.map((sec) => `
      <div class="sector-card" onclick="openSector('${sec.id}')">
        <div>
          <div class="sector-top">
            <div class="sector-icon-badge">
              <i class="fa-solid ${sec.icon || 'fa-folder-closed'}"></i>
            </div>
            <span class="box-tag">${sec.isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <h3 class="sector-title">${escapeHtml(sec.name)}</h3>
          <p class="sector-desc">${escapeHtml(sec.description || 'No description provided.')}</p>
        </div>
        <div class="sector-footer">
          <span><i class="fa-solid fa-arrow-right"></i> Open resource boxes</span>
          ${state.user?.role === 'owner' || state.user?.role === 'admin' ? `
            <button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation(); deleteSector('${sec.id}')">
              <i class="fa-solid fa-trash text-danger"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `).join("");

  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-lock"></i>
        <p>${escapeHtml(err.message)}</p>
        <div style="display:flex; justify-content:center; gap:10px; margin-top:14px;">
          <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('auth-modal').classList.remove('hidden')">
            Login / Sign Up
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('api-modal').classList.remove('hidden')">
            Configure Backend URL
          </button>
        </div>
      </div>
    `;
  }

  // Load stats
  try {
    const statsData = await apiRequest("/api/admin/stats");
    if (statsData?.stats) {
      const boxesEl = document.getElementById("stat-boxes-count");
      const usersEl = document.getElementById("stat-users-count");
      if (boxesEl) boxesEl.textContent = statsData.stats.totalBoxes || 0;
      if (usersEl) usersEl.textContent = statsData.stats.totalUsers || 0;
    }
  } catch (_) {}
}

// ── Open Sector & View Boxes ───────────────────────────────
async function openSector(sectorId) {
  const sector = state.sectors.find((s) => s.id === sectorId);
  if (!sector) return;

  state.currentSector = sector;
  document.getElementById("current-sector-title").textContent = sector.name;
  document.getElementById("current-sector-desc").textContent = sector.description || "Resource boxes and guides";

  switchView("boxes-view");
  await loadBoxes(sectorId);
}

async function loadBoxes(sectorId) {
  const container = document.getElementById("boxes-grid");
  if (!container) return;
  container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading boxes...</p></div>`;

  try {
    const data = await apiRequest(`/api/boxes?sectorId=${sectorId}`);
    state.boxes = data.boxes || [];

    if (state.boxes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-box-open"></i>
          <p>No resource boxes found in this sector. Click "+ Add New Box" to add one!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.boxes.map((b) => `
      <div class="box-card">
        <div class="box-header">
          <div>
            <h3 class="box-title">${escapeHtml(b.title)}</h3>
          </div>
          ${state.user?.role === 'owner' || state.user?.role === 'admin' ? `
            <button type="button" class="btn btn-outline btn-sm" onclick="deleteBox('${b.id}')">
              <i class="fa-solid fa-trash text-danger"></i>
            </button>
          ` : ''}
        </div>

        ${b.tags && b.tags.length ? `
          <div class="box-tags">
            ${b.tags.map(t => `<span class="box-tag">${escapeHtml(t)}</span>`).join("")}
          </div>
        ` : ''}

        ${b.instruction ? `
          <div class="box-instruction">
            <strong><i class="fa-solid fa-circle-info"></i> Instructions:</strong><br/>
            ${escapeHtml(b.instruction)}
          </div>
        ` : ''}

        ${b.templateText ? `
          <div class="box-template-wrap">
            <button type="button" class="btn btn-secondary btn-sm copy-btn" onclick="copyTemplate(this, \`${escapeJs(b.templateText)}\`)">
              <i class="fa-solid fa-copy"></i> Copy
            </button>
            <pre class="template-code">${escapeHtml(b.templateText)}</pre>
          </div>
        ` : ''}

        <div class="box-actions-row">
          ${b.resourceUrl && b.resourceUrl !== "HIDDEN" ? `
            <a href="${b.resourceUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Resource
            </a>
          ` : b.hasResourceUrl ? `
            <button type="button" class="btn btn-primary btn-sm" onclick="unlockResource('${b.id}')">
              <i class="fa-solid fa-lock-open"></i> Unlock Resource
            </button>
          ` : ''}

          ${b.tutorialUrl && b.tutorialUrl !== "HIDDEN" ? `
            <a href="${b.tutorialUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
              <i class="fa-solid fa-video"></i> Tutorial
            </a>
          ` : b.hasTutorialUrl ? `
            <button type="button" class="btn btn-secondary btn-sm" onclick="unlockTutorial('${b.id}')">
              <i class="fa-solid fa-video"></i> Unlock Tutorial
            </button>
          ` : ''}
        </div>
      </div>
    `).join("");

  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p class="text-danger">${escapeHtml(err.message)}</p></div>`;
  }
}

async function unlockResource(boxId) {
  try {
    const data = await apiRequest(`/api/boxes/${boxId}/open-resource`, { method: "POST" });
    if (data.url) window.open(data.url, "_blank");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function unlockTutorial(boxId) {
  try {
    const data = await apiRequest(`/api/boxes/${boxId}/open-tutorial`, { method: "POST" });
    if (data.url) window.open(data.url, "_blank");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function copyTemplate(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    const oldHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
    setTimeout(() => btn.innerHTML = oldHtml, 2000);
  });
}

// ── Admin: User Management ─────────────────────────────────
async function loadAdminUsers() {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Loading users...</td></tr>`;

  try {
    const data = await apiRequest("/api/admin/users");
    state.users = data.users || [];

    tbody.innerHTML = state.users.map((u) => `
      <tr>
        <td><strong>${escapeHtml(u.name || "Anonymous")}</strong></td>
        <td>${escapeHtml(u.email)}</td>
        <td>
          <span class="role-badge ${u.role}">${u.role}</span>
        </td>
        <td>
          <span style="font-size:0.8rem; color:var(--accent);">
            ${u.accessList?.includes("*") ? "⭐ Master All (*)" : `${u.accessList?.length || 0} sectors`}
          </span>
        </td>
        <td>
          <span class="box-tag" style="color: ${u.isActive ? 'var(--success)' : 'var(--danger)'};">
            ${u.isActive ? 'Active' : 'Disabled'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-outline btn-sm" onclick="openAccessModal('${u.id}')" title="Permissions">
              <i class="fa-solid fa-key"></i> Access
            </button>
            ${state.user?.role === "owner" && u.email !== state.user.email ? `
              <button type="button" class="btn btn-outline btn-sm" onclick="toggleUserRole('${u.id}', '${u.role === 'admin' ? 'user' : 'admin'}')">
                ${u.role === 'admin' ? 'Demote' : 'Make Admin'}
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join("");

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${escapeHtml(err.message)}</td></tr>`;
  }
}

// ── File Upload with Cloudinary ─────────────────────────────
async function handleFileUpload(file) {
  const progressBox = document.getElementById("upload-progress-box");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");

  progressBox.classList.remove("hidden");
  progressBar.style.width = "40%";
  progressText.textContent = `Uploading ${file.name}...`;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const data = await apiRequest("/api/files/upload", {
      method: "POST",
      body: formData,
    });

    progressBar.style.width = "100%";
    progressText.textContent = "Upload complete!";
    showToast(`File "${data.file.name}" uploaded successfully!`, "success");

    const container = document.getElementById("files-list-container");
    const fileCard = document.createElement("div");
    fileCard.className = "stat-card";
    fileCard.innerHTML = `
      <div class="stat-icon cyan"><i class="fa-solid fa-file"></i></div>
      <div class="stat-info" style="flex:1;">
        <span class="stat-value" style="font-size:1rem;">${escapeHtml(data.file.name)}</span>
        <span class="stat-label">${(data.file.size / 1024 / 1024).toFixed(2)} MB • Cloudinary</span>
      </div>
      <a href="${data.file.url}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">
        <i class="fa-solid fa-download"></i>
      </a>
    `;
    container.prepend(fileCard);

    setTimeout(() => progressBox.classList.add("hidden"), 2000);
  } catch (err) {
    progressBox.classList.add("hidden");
    showToast(err.message || "File upload failed", "error");
  }
}

// ── Event Listeners ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Sync input value with current apiBase
  const apiUrlInput = document.getElementById("api-url-input");
  if (apiUrlInput) apiUrlInput.value = state.apiBase;

  checkApiHealth();
  updateAuthUI();
  loadDashboardData();

  // Navigation clicks
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
  });

  document.getElementById("back-to-sectors-btn")?.addEventListener("click", () => {
    switchView("sectors-view");
  });

  // API Configuration Modal
  const apiModal = document.getElementById("api-modal");
  document.getElementById("api-status")?.addEventListener("click", () => {
    if (apiUrlInput) apiUrlInput.value = state.apiBase;
    apiModal?.classList.remove("hidden");
  });
  document.getElementById("close-api-modal")?.addEventListener("click", () => {
    apiModal?.classList.add("hidden");
  });
  document.getElementById("save-api-url-btn")?.addEventListener("click", () => {
    const val = apiUrlInput.value.trim().replace(/\/+$/, "");
    if (!val) return;
    state.apiBase = val;
    localStorage.setItem("zeins_api_base", val);
    apiModal?.classList.add("hidden");
    showToast(`Connected to backend: ${val}`, "success");
    checkApiHealth();
    loadDashboardData();
  });
  document.getElementById("reset-api-url-btn")?.addEventListener("click", () => {
    localStorage.removeItem("zeins_api_base");
    state.apiBase = getInitialApiBase();
    if (apiUrlInput) apiUrlInput.value = state.apiBase;
    showToast(`Reset backend URL to: ${state.apiBase}`, "info");
    checkApiHealth();
    loadDashboardData();
  });

  // Auth Modals
  const authModal = document.getElementById("auth-modal");
  document.getElementById("open-login-btn")?.addEventListener("click", () => {
    authModal?.classList.remove("hidden");
    document.getElementById("tab-login")?.click();
  });
  document.getElementById("open-register-btn")?.addEventListener("click", () => {
    authModal?.classList.remove("hidden");
    document.getElementById("tab-register")?.click();
  });
  document.getElementById("close-auth-modal")?.addEventListener("click", () => {
    authModal?.classList.add("hidden");
  });
  document.getElementById("logout-btn")?.addEventListener("click", handleLogout);

  // Tab switching
  document.getElementById("tab-login")?.addEventListener("click", () => {
    document.getElementById("tab-login")?.classList.add("active");
    document.getElementById("tab-register")?.classList.remove("active");
    document.getElementById("login-form")?.classList.remove("hidden");
    document.getElementById("register-form")?.classList.add("hidden");
  });

  document.getElementById("tab-register")?.addEventListener("click", () => {
    document.getElementById("tab-register")?.classList.add("active");
    document.getElementById("tab-login")?.classList.remove("active");
    document.getElementById("register-form")?.classList.remove("hidden");
    document.getElementById("login-form")?.classList.add("hidden");
  });

  // Login Submit — calls /api/auth/login
  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("login-submit-btn");

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`;

    try {
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      handleLogin(res.token, res.user);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i> Login Now`;
    }
  });

  // Register Submit — calls /api/auth/register
  document.getElementById("register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const phone = document.getElementById("reg-phone").value.trim();
    const address = document.getElementById("reg-address").value.trim();
    const btn = document.getElementById("register-submit-btn");

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registering...`;

    try {
      const res = await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          phone,
          address,
        }),
      });
      handleLogin(res.token, res.user);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Create Account`;
    }
  });

  // Sector Create Modal
  const sectorModal = document.getElementById("sector-modal");
  document.getElementById("add-sector-btn")?.addEventListener("click", () => {
    sectorModal?.classList.remove("hidden");
  });
  document.getElementById("close-sector-modal")?.addEventListener("click", () => {
    sectorModal?.classList.add("hidden");
  });
  document.getElementById("sector-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("sector-name").value.trim();
    const description = document.getElementById("sector-description").value.trim();

    try {
      await apiRequest("/api/sectors", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      sectorModal?.classList.add("hidden");
      showToast("Sector created successfully!", "success");
      loadDashboardData();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // Box Create Modal
  const boxModal = document.getElementById("box-modal");
  document.getElementById("add-box-btn")?.addEventListener("click", () => {
    boxModal?.classList.remove("hidden");
  });
  document.getElementById("close-box-modal")?.addEventListener("click", () => {
    boxModal?.classList.add("hidden");
  });
  document.getElementById("box-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentSector) return;

    const title = document.getElementById("box-title").value.trim();
    const instruction = document.getElementById("box-instruction").value.trim();
    const templateText = document.getElementById("box-template").value;
    const resourceUrl = document.getElementById("box-resource-url").value.trim();
    const tutorialUrl = document.getElementById("box-tutorial-url").value.trim();
    const tagsInput = document.getElementById("box-tags").value.trim();
    const tags = tagsInput ? tagsInput.split(",").map((t) => t.trim()).filter(Boolean) : [];

    try {
      await apiRequest("/api/boxes", {
        method: "POST",
        body: JSON.stringify({
          sectorId: state.currentSector.id,
          title,
          instruction,
          templateText,
          resourceUrl,
          tutorialUrl,
          tags,
        }),
      });
      boxModal?.classList.add("hidden");
      showToast("Box created successfully!", "success");
      loadBoxes(state.currentSector.id);
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // File Upload Drag & Drop
  const dropzone = document.getElementById("upload-dropzone");
  const fileInput = document.getElementById("file-input");
  document.getElementById("select-file-btn")?.addEventListener("click", () => fileInput.click());

  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
  });
  fileInput?.addEventListener("change", (e) => {
    if (e.target.files.length) handleFileUpload(e.target.files[0]);
  });

  // Global Search Filter
  document.getElementById("global-search")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".sector-card").forEach((card) => {
      const match = card.textContent.toLowerCase().includes(q);
      card.style.display = match ? "flex" : "none";
    });
  });
});

// ── Helpers ────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeJs(str) {
  if (!str) return "";
  return str.replace(/`/g, "\\`").replace(/\$/g, "\\$");
}
