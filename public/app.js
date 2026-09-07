// ── Helper: Determine initial API base URL ───────────────────
function getInitialApiBase() {
  const saved = localStorage.getItem("zeins_api_base");
  if (saved) return saved.replace(/\/+$/, "");

  const host = window.location.hostname;
  // If running on Firebase Hosting, point to Render backend
  if (host.endsWith(".web.app") || host.endsWith(".firebaseapp.com")) {
    return "https://zeins-help-center-backend.onrender.com";
  }

  // If running on local dev server on different port than backend (e.g. Vite 5173, live-server 5500, etc.)
  if ((host === "localhost" || host === "127.0.0.1") && window.location.port !== "4000") {
    if (window.location.protocol === "file:" || ["5500", "5173", "3000"].includes(window.location.port)) {
      return "http://localhost:4000";
    }
  }

  // For Netlify (*.netlify.app via proxy), Render (*.onrender.com), and Express server:
  return window.location.origin;
}

// Safe user parsing from localStorage (prevents 'Unexpected token u' error)
function getInitialUser() {
  try {
    const raw = localStorage.getItem("zeins_user");
    if (!raw || raw === "undefined" || raw === "null") return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Cleared invalid zeins_user in localStorage:", e);
    localStorage.removeItem("zeins_user");
    return null;
  }
}

// ── App State ─────────────────────────────────────────────
const state = {
  token: localStorage.getItem("zeins_token") || null,
  user: getInitialUser(),
  sectors: [],
  currentSector: null,
  boxes: [],
  users: [],
  tickets: [],
  currentTicketId: null,
  supportFilter: "all",
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

// ── API Helper (with automatic retry for Render free-tier cold starts) ──
async function apiRequest(endpoint, options = {}, retries = 0) {
  const headers = { ...options.headers };
  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const url = `${state.apiBase}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });
    
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      const isHtml = text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html");
      // If Render backend is waking up, retry automatically
      if (isHtml && retries < 2) {
        showToast("Backend service is waking up (Render free tier). Retrying in 4s...", "info");
        await new Promise((r) => setTimeout(r, 4000));
        return apiRequest(endpoint, options, retries + 1);
      }

      throw new Error(
        `Backend API returned an HTML response instead of JSON. Current API base is "${state.apiBase}". Click the Gear icon (⚙️) to configure your live backend URL.`
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${state.apiBase}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

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
  if (viewId === "support-view") loadSupportTickets();
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
      const emptyMsg = (state.user?.role === 'owner' || state.user?.role === 'admin')
        ? 'No sectors available yet. Click "+ New Sector" to create one!'
        : state.user
          ? `Welcome, ${escapeHtml(state.user.name || state.user.email)}! You have access to open resources. Contact av6r01@gmail.com for restricted sector access.`
          : 'Welcome to ZEINS Help Center! Log in or create an account to view and access resources.';

      grid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-folder-open"></i>
          <p>${emptyMsg}</p>
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

  // Check support tickets unread badge
  if (state.token) {
    loadSupportUnreadCount();
  }
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

    const isAdmin = state.user?.role === 'owner' || state.user?.role === 'admin';

    container.innerHTML = state.boxes.map((b) => {
      const hasTemplate = !!b.templateText;
      const hasWeb = b.hasWebLink || (b.webLink && b.webLink !== "HIDDEN") || (b.resourceUrl && b.resourceUrl !== "HIDDEN");
      const hasPlp = b.hasPlpFile || (b.plpFileUrl && b.plpFileUrl !== "HIDDEN");
      const hasVideo = b.hasTutorialUrl || (b.tutorialUrl && b.tutorialUrl !== "HIDDEN");
      const hasApp = b.hasAppLink || (b.appLink && b.appLink !== "HIDDEN");

      return `
      <div class="box-card" id="box-card-${b.id}">
        <div class="box-header">
          <div>
            <h3 class="box-title">${escapeHtml(b.title)}</h3>
          </div>
          ${isAdmin ? `
            <div class="box-card-actions-header">
              <button type="button" class="btn btn-outline btn-sm" onclick="openEditBoxModal('${b.id}')" title="Edit Box">
                <i class="fa-solid fa-pen-to-square"></i> Edit
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="deleteBox('${b.id}')" title="Delete Box">
                <i class="fa-solid fa-trash text-danger"></i>
              </button>
            </div>
          ` : ''}
        </div>

        ${b.tags && b.tags.length ? `
          <div class="box-tags">
            ${b.tags.map(t => `<span class="box-tag">${escapeHtml(t)}</span>`).join("")}
          </div>
        ` : ''}

        <!-- 3rd Option: Instructions & Fixed Guide Text -->
        ${b.instruction ? `
          <div class="box-instruction">
            <strong><i class="fa-solid fa-circle-info"></i> Guide &amp; Instructions:</strong><br/>
            ${escapeHtml(b.instruction)}
          </div>
        ` : ''}

        <!-- 1st Option: 1s Copy Area Text -->
        ${hasTemplate ? `
          <div class="box-template-wrap">
            <button type="button" class="btn btn-copy-1s btn-sm copy-btn" onclick="copyTemplate(this, \`${escapeJs(b.templateText)}\`)">
              <i class="fa-solid fa-copy"></i> 📋 1s Copy Area Text
            </button>
            <pre class="template-code">${escapeHtml(b.templateText)}</pre>
          </div>
        ` : ''}

        <!-- Sector Action Buttons -->
        <div class="box-actions-row">
          <!-- 2nd Option: Main Web Link (Direct Login) -->
          ${hasWeb ? `
            <button type="button" class="btn btn-direct-web btn-sm" onclick="unlockWebLink('${b.id}')">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> 🌐 Direct Login / Web Link
            </button>
          ` : ''}

          <!-- 4th Option: PLP Files & Folders (100MB - 150MB max) -->
          ${hasPlp ? `
            <button type="button" class="btn btn-plp btn-sm" onclick="unlockPlpFile('${b.id}')">
              <i class="fa-solid fa-folder-arrow-down"></i> 📥 Download PLP / File Pack (Max 150MB)
            </button>
          ` : ''}

          <!-- 5th Option: Video Link (Hidden Video Link) -->
          ${hasVideo ? `
            <button type="button" class="btn btn-video btn-sm" onclick="unlockTutorial('${b.id}')">
              <i class="fa-solid fa-video"></i> ▶ Watch Tutorial Video
            </button>
          ` : ''}

          <!-- 6th Option: Others Workable App Add System -->
          ${hasApp ? `
            <button type="button" class="btn btn-app btn-sm" onclick="unlockApp('${b.id}')">
              <i class="fa-solid fa-mobile-screen-button"></i> 📱 Open / Get Workable App
            </button>
          ` : ''}
        </div>
      </div>
    `;
    }).join("");

  } catch (err) {
    const isPermissionErr = (err.message || "").toLowerCase().includes("access") || (err.message || "").toLowerCase().includes("forbidden");
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-lock" style="font-size:2.5rem; color:var(--accent); margin-bottom:12px;"></i>
        <h3 style="color:#fff; margin-bottom:8px;">Restricted Sector</h3>
        <p class="text-danger" style="margin-bottom:16px;">${escapeHtml(err.message)}</p>
        ${isPermissionErr ? `
          <button type="button" class="btn btn-primary" onclick="openCreateSupportModal('${sectorId}')">
            <i class="fa-solid fa-key"></i> Request Access from Admin / Owner
          </button>
        ` : ''}
      </div>
    `;
  }
}

async function unlockWebLink(boxId) {
  try {
    const data = await apiRequest(`/api/boxes/${boxId}/open-web`, { method: "POST" });
    if (data.url) window.open(data.url, "_blank");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function unlockPlpFile(boxId) {
  try {
    const data = await apiRequest(`/api/boxes/${boxId}/open-plp`, { method: "POST" });
    if (data.url) {
      showToast("Downloading PLP / File package...", "info");
      window.open(data.url, "_blank");
    }
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

async function unlockApp(boxId) {
  try {
    const data = await apiRequest(`/api/boxes/${boxId}/open-app`, { method: "POST" });
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

async function deleteSector(sectorId) {
  if (!confirm("Are you sure you want to delete this sector and all its boxes?")) return;
  try {
    await apiRequest(`/api/sectors/${sectorId}`, { method: "DELETE" });
    showToast("Sector deleted successfully", "success");
    loadDashboardData();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteBox(boxId) {
  if (!confirm("Are you sure you want to delete this resource box?")) return;
  try {
    await apiRequest(`/api/boxes/${boxId}`, { method: "DELETE" });
    showToast("Box deleted successfully", "success");
    if (state.currentSector) loadBoxes(state.currentSector.id);
  } catch (err) {
    showToast(err.message, "error");
  }
}

let selectedUserIdForAccess = null;

function openAccessModal(userId) {
  selectedUserIdForAccess = userId;
  const user = state.users.find((u) => u.id === userId);
  if (!user) return;

  const modal = document.getElementById("user-access-modal");
  const label = document.getElementById("access-modal-user-label");
  const container = document.getElementById("sectors-access-checkboxes");

  if (label) label.textContent = `User: ${user.name || user.email} (${user.email})`;

  const userAccess = user.accessList || [];
  const hasWildcard = userAccess.includes("*");

  let html = `
    <label class="checkbox-item" style="font-weight:700; color:var(--accent); margin-bottom:8px;">
      <input type="checkbox" id="access-all-checkbox" ${hasWildcard ? 'checked' : ''} onchange="toggleAllAccess(this.checked)">
      <span>⭐ Full Master Access (All Sectors)</span>
    </label>
    <hr style="border:0; border-top:1px solid var(--border-color); margin:8px 0;" />
  `;

  state.sectors.forEach((sec) => {
    const isChecked = hasWildcard || userAccess.includes(sec.id);
    html += `
      <label class="checkbox-item">
        <input type="checkbox" class="sector-access-check" data-sector-id="${sec.id}" ${isChecked ? 'checked' : ''} ${hasWildcard ? 'disabled' : ''}>
        <span>${escapeHtml(sec.name)}</span>
      </label>
    `;
  });

  if (container) container.innerHTML = html;
  modal?.classList.remove("hidden");
}

function toggleAllAccess(checked) {
  document.querySelectorAll(".sector-access-check").forEach((cb) => {
    cb.checked = checked;
    cb.disabled = checked;
  });
}

async function saveUserAccess() {
  if (!selectedUserIdForAccess) return;

  const isAllChecked = document.getElementById("access-all-checkbox")?.checked;
  let accessList = [];

  if (isAllChecked) {
    accessList = ["*"];
  } else {
    document.querySelectorAll(".sector-access-check:checked").forEach((cb) => {
      accessList.push(cb.getAttribute("data-sector-id"));
    });
  }

  try {
    await apiRequest(`/api/admin/users/${selectedUserIdForAccess}/access`, {
      method: "PUT",
      body: JSON.stringify({ accessList }),
    });
    showToast("Permissions updated successfully", "success");
    document.getElementById("user-access-modal")?.classList.add("hidden");
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function toggleUserRole(userId, newRole) {
  if (!confirm(`Change role of this user to "${newRole}"?`)) return;
  try {
    await apiRequest(`/api/admin/users/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role: newRole }),
    });
    showToast(`User role updated to ${newRole}`, "success");
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, "error");
  }
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

  // User Profile Modal Listeners
  document.getElementById("nav-user-chip")?.addEventListener("click", openProfileModal);
  document.getElementById("close-profile-modal")?.addEventListener("click", () => {
    document.getElementById("profile-modal")?.classList.add("hidden");
  });
  document.getElementById("close-profile-btn")?.addEventListener("click", () => {
    document.getElementById("profile-modal")?.classList.add("hidden");
  });
  document.getElementById("profile-form")?.addEventListener("submit", handleProfileSave);

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

    if (password.length < 6) {
      showToast("Password must be at least 6 characters long", "error");
      return;
    }

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
      showToast("Account created successfully! Welcome to ZEINS.", "success");
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

  // Box Create & Edit Modal Listeners
  const boxModal = document.getElementById("box-modal");
  document.getElementById("add-box-btn")?.addEventListener("click", openCreateBoxModal);
  document.getElementById("close-box-modal")?.addEventListener("click", () => {
    boxModal?.classList.add("hidden");
  });

  // Modal in-form file upload up to 150MB
  const plpFileInput = document.getElementById("box-plp-file-input");
  const plpStatus = document.getElementById("box-plp-status");
  plpFileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 150 * 1024 * 1024) {
      showToast("File exceeds 150MB limit", "error");
      return;
    }

    if (plpStatus) plpStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading ${escapeHtml(file.name)} (${(file.size / (1024 * 1024)).toFixed(1)}MB) to Cloudinary...`;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await apiRequest("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      document.getElementById("box-plp-url").value = res.file.url;
      if (plpStatus) plpStatus.innerHTML = `<span style="color:var(--success);">✅ Uploaded: ${escapeHtml(res.file.name)} (${(res.file.size / (1024 * 1024)).toFixed(1)}MB)</span>`;
      showToast("File uploaded successfully (up to 150MB)!", "success");
    } catch (err) {
      if (plpStatus) plpStatus.textContent = "Upload failed: " + err.message;
      showToast(err.message, "error");
    }
  });

  document.getElementById("box-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentSector) return;

    const editId = document.getElementById("box-edit-id").value;
    const title = document.getElementById("box-title").value.trim();
    const instruction = document.getElementById("box-instruction").value.trim();
    const templateText = document.getElementById("box-template").value;
    const webLink = document.getElementById("box-web-url").value.trim();
    const plpFileUrl = document.getElementById("box-plp-url").value.trim();
    const tutorialUrl = document.getElementById("box-tutorial-url").value.trim();
    const appLink = document.getElementById("box-app-url").value.trim();
    const tagsInput = document.getElementById("box-tags").value.trim();
    const tags = tagsInput ? tagsInput.split(",").map((t) => t.trim()).filter(Boolean) : [];

    const payload = {
      sectorId: state.currentSector.id,
      title,
      instruction,
      templateText,
      webLink,
      resourceUrl: webLink,
      plpFileUrl,
      tutorialUrl,
      appLink,
      tags,
    };

    const submitBtn = document.getElementById("box-submit-btn");
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

    try {
      if (editId) {
        await apiRequest(`/api/boxes/${editId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showToast("Resource Box updated successfully!", "success");
      } else {
        await apiRequest("/api/boxes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Resource Box created successfully!", "success");
      }
      boxModal?.classList.add("hidden");
      loadBoxes(state.currentSector.id);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? "Save Changes" : "Save Resource Box";
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

  // Access Modal Listeners
  document.getElementById("close-access-modal")?.addEventListener("click", () => {
    document.getElementById("user-access-modal")?.classList.add("hidden");
  });
  document.getElementById("save-access-btn")?.addEventListener("click", saveUserAccess);
  document.getElementById("refresh-users-btn")?.addEventListener("click", loadAdminUsers);

  // Global Search Filter
  document.getElementById("global-search")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".sector-card").forEach((card) => {
      const match = card.textContent.toLowerCase().includes(q);
      card.style.display = match ? "flex" : "none";
    });
  });

  // ── Support & Inbox Event Listeners ───────────────────────
  document.getElementById("refresh-support-btn")?.addEventListener("click", () => loadSupportTickets());
  document.getElementById("open-support-modal-btn")?.addEventListener("click", () => openCreateSupportModal());
  document.getElementById("placeholder-new-ticket-btn")?.addEventListener("click", () => openCreateSupportModal());
  document.getElementById("floating-support-btn")?.addEventListener("click", () => switchView("support-view"));

  document.getElementById("close-support-modal")?.addEventListener("click", () => {
    document.getElementById("support-modal")?.classList.add("hidden");
  });
  document.getElementById("cancel-support-modal-btn")?.addEventListener("click", () => {
    document.getElementById("support-modal")?.classList.add("hidden");
  });
  document.getElementById("support-ticket-form")?.addEventListener("submit", handleSupportTicketCreate);
  document.getElementById("thread-reply-form")?.addEventListener("submit", handleReplySubmit);

  // Filter tabs for tickets
  document.querySelectorAll(".support-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".support-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.supportFilter = btn.getAttribute("data-filter") || "all";
      renderSupportTicketList();
    });
  });

  // Ticket search filter
  document.getElementById("support-search-input")?.addEventListener("input", () => {
    renderSupportTicketList();
  });
});

// ── Resource Box Create & Edit Modals ─────────────────────
function openCreateBoxModal() {
  const modal = document.getElementById("box-modal");
  if (!modal) return;
  document.getElementById("box-edit-id").value = "";
  document.getElementById("box-modal-title").textContent = "Create New Resource Box";
  document.getElementById("box-submit-btn").textContent = "Create Resource Box";
  document.getElementById("box-title").value = "";
  document.getElementById("box-template").value = "";
  document.getElementById("box-web-url").value = "";
  document.getElementById("box-instruction").value = "";
  document.getElementById("box-plp-url").value = "";
  document.getElementById("box-tutorial-url").value = "";
  document.getElementById("box-app-url").value = "";
  document.getElementById("box-tags").value = "";
  document.getElementById("box-plp-status").textContent = "Attach .plp, .zip, .apk, .rar or folder archive (up to 150MB). Masked and protected for regular users.";
  modal.classList.remove("hidden");
}

function openEditBoxModal(boxId) {
  const box = state.boxes.find((b) => b.id === boxId);
  if (!box) return;
  const modal = document.getElementById("box-modal");
  if (!modal) return;

  document.getElementById("box-edit-id").value = boxId;
  document.getElementById("box-modal-title").textContent = "Edit Resource Box";
  document.getElementById("box-submit-btn").textContent = "Save Changes";
  document.getElementById("box-title").value = box.title || "";
  document.getElementById("box-template").value = box.templateText || "";
  document.getElementById("box-web-url").value = (box.webLink && box.webLink !== "HIDDEN") ? box.webLink : (box.resourceUrl && box.resourceUrl !== "HIDDEN") ? box.resourceUrl : "";
  document.getElementById("box-instruction").value = box.instruction || "";
  document.getElementById("box-plp-url").value = (box.plpFileUrl && box.plpFileUrl !== "HIDDEN") ? box.plpFileUrl : "";
  document.getElementById("box-tutorial-url").value = (box.tutorialUrl && box.tutorialUrl !== "HIDDEN") ? box.tutorialUrl : "";
  document.getElementById("box-app-url").value = (box.appLink && box.appLink !== "HIDDEN") ? box.appLink : "";
  document.getElementById("box-tags").value = (box.tags || []).join(", ");
  document.getElementById("box-plp-status").textContent = box.plpFileUrl ? "Current PLP file attached." : "Attach .plp, .zip, .apk, .rar or folder archive (up to 150MB).";
  modal.classList.remove("hidden");
}

// ── User Profile Handling ─────────────────────────────────
async function openProfileModal() {
  if (!state.token || !state.user) return;
  const modal = document.getElementById("profile-modal");
  if (!modal) return;

  try {
    const data = await apiRequest("/api/users/profile");
    const user = data.user || state.user;

    const emailInput = document.getElementById("profile-email");
    const nameInput = document.getElementById("profile-name");
    const phoneInput = document.getElementById("profile-phone");
    const addressInput = document.getElementById("profile-address");
    const avatarEl = document.getElementById("profile-modal-avatar");
    const titleEl = document.getElementById("profile-modal-title");
    const roleEl = document.getElementById("profile-modal-role");
    const accessEl = document.getElementById("profile-access-summary");

    if (emailInput) emailInput.value = user.email || "";
    if (nameInput) nameInput.value = user.name || "";
    if (phoneInput) phoneInput.value = user.phone || "";
    if (addressInput) addressInput.value = user.address || "";
    if (avatarEl) avatarEl.textContent = (user.name || user.email)[0].toUpperCase();
    if (titleEl) titleEl.textContent = user.name || "My Profile";
    if (roleEl) {
      roleEl.textContent = (user.role || "user").toUpperCase();
      roleEl.className = `role-badge ${user.role || 'user'}`;
    }

    if (accessEl) {
      const isOwner = user.role === "owner" || user.role === "admin";
      const hasWildcard = user.accessList?.includes("*");
      if (isOwner || hasWildcard) {
        accessEl.innerHTML = `<span style="color:var(--accent); font-weight:700;">⭐ Master Access</span><br>Full unrestricted access to all sectors, tools, and downloads.`;
      } else if (user.accessList && user.accessList.length > 0) {
        accessEl.innerHTML = `<span style="color:var(--text-main); font-weight:600;">Granted ${user.accessList.length} restricted sector(s)</span><br>Plus all open public sectors and community tools.`;
      } else {
        accessEl.innerHTML = `<span style="color:var(--text-dim);">🌐 Public Access</span><br>Access to all public sectors & tools. Contact the owner (<strong style="color:var(--accent);">av6r01@gmail.com</strong>) if you require private sector permissions.`;
      }
    }

    modal.classList.remove("hidden");
  } catch (err) {
    showToast("Failed to load profile: " + err.message, "error");
  }
}

async function handleProfileSave(e) {
  e.preventDefault();
  const name = document.getElementById("profile-name")?.value.trim();
  const phone = document.getElementById("profile-phone")?.value.trim();
  const address = document.getElementById("profile-address")?.value.trim();
  const btn = document.getElementById("save-profile-btn");

  if (!name) {
    showToast("Name cannot be empty", "error");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

  try {
    await apiRequest("/api/users/profile", {
      method: "PUT",
      body: JSON.stringify({ name, phone, address }),
    });

    if (state.user) {
      state.user.name = name;
      state.user.phone = phone;
      state.user.address = address;
      localStorage.setItem("zeins_user", JSON.stringify(state.user));
    }
    updateAuthUI();
    document.getElementById("profile-modal")?.classList.add("hidden");
    showToast("Profile updated successfully!", "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Profile`;
  }
}

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

// ── Support & Inbox Management ────────────────────────────
function updateSupportBadges(count) {
  const navBadge = document.getElementById("support-unread-badge");
  const floatingBadge = document.getElementById("floating-unread-badge");
  const val = Number(count) || 0;

  [navBadge, floatingBadge].forEach((badge) => {
    if (!badge) return;
    if (val > 0) {
      badge.textContent = val > 99 ? "99+" : val;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  });
}

async function loadSupportUnreadCount() {
  if (!state.token) return;
  try {
    const data = await apiRequest("/api/support");
    updateSupportBadges(data.unreadCount || 0);
  } catch (_) {}
}

async function loadSupportTickets(selectTicketId = null) {
  if (!state.token) {
    const listContainer = document.getElementById("support-tickets-list");
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-lock"></i>
          <p>Please log in or create an account to view your support inbox and send messages.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('auth-modal').classList.remove('hidden')">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Login / Sign Up
          </button>
        </div>
      `;
    }
    return;
  }

  const listContainer = document.getElementById("support-tickets-list");
  if (!listContainer) return;

  try {
    const data = await apiRequest("/api/support");
    state.tickets = data.tickets || [];
    updateSupportBadges(data.unreadCount || 0);

    renderSupportTicketList();

    const targetId = selectTicketId || state.currentTicketId;
    if (targetId && state.tickets.some((t) => t.id === targetId)) {
      openTicketThread(targetId);
    } else if (state.tickets.length > 0 && window.innerWidth > 900 && !state.currentTicketId) {
      openTicketThread(state.tickets[0].id);
    } else if (state.tickets.length === 0) {
      document.getElementById("support-empty-placeholder")?.classList.remove("hidden");
      document.getElementById("support-thread-container")?.classList.add("hidden");
    }
  } catch (err) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-exclamation text-danger"></i>
        <p>${escapeHtml(err.message || "Failed to load support tickets")}</p>
      </div>
    `;
  }
}

function renderSupportTicketList() {
  const listContainer = document.getElementById("support-tickets-list");
  if (!listContainer) return;

  const q = (document.getElementById("support-search-input")?.value || "").toLowerCase().trim();
  const filter = state.supportFilter || "all";
  const isAdmin = state.user?.role === "admin" || state.user?.role === "owner";

  let filtered = state.tickets.filter((t) => {
    if (filter !== "all" && t.status !== filter) return false;
    if (q) {
      const matchSubject = (t.subject || "").toLowerCase().includes(q);
      const matchEmail = (t.userEmail || "").toLowerCase().includes(q);
      const matchName = (t.userName || "").toLowerCase().includes(q);
      const matchCategory = (t.category || "").toLowerCase().includes(q);
      if (!matchSubject && !matchEmail && !matchName && !matchCategory) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-inbox"></i>
        <p>No support tickets found in this view.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = filtered
    .map((t) => {
      const isActive = t.id === state.currentTicketId;
      const isUnread = isAdmin ? t.unreadByAdmin : t.unreadByUser;
      const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

      return `
      <div class="ticket-item-card ${isActive ? "active" : ""} ${isUnread ? "has-unread" : ""}" onclick="openTicketThread('${t.id}')">
        <div class="ticket-card-top">
          <span class="ticket-card-subject" title="${escapeHtml(t.subject)}">${escapeHtml(t.subject)}</span>
          <span class="badge-status ${escapeHtml(t.status || 'open')}">${escapeHtml(t.status || 'open')}</span>
        </div>
        <div class="ticket-card-badges">
          <span class="badge-priority ${escapeHtml(t.priority || 'normal')}">${escapeHtml(t.priority || 'normal')}</span>
          <span class="box-tag">${escapeHtml(t.category || 'Support')}</span>
        </div>
        <div class="ticket-card-meta">
          <span><i class="fa-solid fa-user"></i> ${escapeHtml(isAdmin ? (t.userName || t.userEmail) : 'You')}</span>
          <span><i class="fa-solid fa-clock"></i> ${dateStr}</span>
        </div>
      </div>
    `;
    })
    .join("");
}

async function openTicketThread(ticketId) {
  state.currentTicketId = ticketId;
  renderSupportTicketList();

  const placeholder = document.getElementById("support-empty-placeholder");
  const threadContainer = document.getElementById("support-thread-container");
  if (placeholder) placeholder.classList.add("hidden");
  if (threadContainer) threadContainer.classList.remove("hidden");

  try {
    const data = await apiRequest(`/api/support/${ticketId}`);
    const ticket = data.ticket;
    const isAdmin = state.user?.role === "admin" || state.user?.role === "owner";

    // Update local ticket with marked-read status
    const idx = state.tickets.findIndex((t) => t.id === ticketId);
    if (idx !== -1) {
      state.tickets[idx] = ticket;
    }

    // Recalculate unread badge
    const unreadCount = isAdmin
      ? state.tickets.filter((t) => t.unreadByAdmin).length
      : state.tickets.filter((t) => t.unreadByUser).length;
    updateSupportBadges(unreadCount);

    // Subject & Badges
    const subjectEl = document.getElementById("thread-subject");
    const priorityEl = document.getElementById("thread-priority-badge");
    const statusBadgeEl = document.getElementById("thread-status-badge");
    const requesterEl = document.getElementById("thread-requester");
    const categoryEl = document.getElementById("thread-category");
    const dateEl = document.getElementById("thread-date");

    if (subjectEl) subjectEl.textContent = ticket.subject;
    if (priorityEl) {
      priorityEl.textContent = ticket.priority || "normal";
      priorityEl.className = `badge-priority ${ticket.priority || 'normal'}`;
    }
    if (statusBadgeEl) {
      statusBadgeEl.textContent = ticket.status || "open";
      statusBadgeEl.className = `badge-status ${ticket.status || 'open'}`;
    }
    if (requesterEl) requesterEl.innerHTML = `<i class="fa-solid fa-user"></i> ${escapeHtml(ticket.userName || ticket.userEmail)} (${escapeHtml(ticket.userEmail)})`;
    if (categoryEl) categoryEl.innerHTML = `<i class="fa-solid fa-tag"></i> ${escapeHtml(ticket.category || 'General Support')}`;
    if (dateEl) {
      const dt = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : "";
      dateEl.innerHTML = `<i class="fa-solid fa-clock"></i> ${dt}`;
    }

    // Sector request banner & Quick Grant button
    const banner = document.getElementById("thread-sector-banner");
    const sectorNameEl = document.getElementById("thread-sector-name");
    const grantBtn = document.getElementById("thread-grant-sector-btn");

    if (ticket.sectorId) {
      if (banner) banner.classList.remove("hidden");
      if (sectorNameEl) sectorNameEl.textContent = ticket.sectorName || ticket.sectorId;
      if (grantBtn) {
        if (isAdmin && ticket.status !== "resolved") {
          grantBtn.classList.remove("hidden");
          grantBtn.onclick = () => grantTicketSector(ticket.id);
        } else {
          grantBtn.classList.add("hidden");
        }
      }
    } else {
      if (banner) banner.classList.add("hidden");
      if (grantBtn) grantBtn.classList.add("hidden");
    }

    // Admin status select
    const statusSelect = document.getElementById("thread-status-select");
    if (statusSelect) {
      statusSelect.value = ticket.status || "open";
      statusSelect.onchange = (e) => updateTicketStatus(ticket.id, e.target.value);
    }

    // Admin delete button
    const deleteBtn = document.getElementById("thread-delete-btn");
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteSupportTicket(ticket.id);
    }

    // Render Messages
    renderThreadMessages(ticket.messages || []);
  } catch (err) {
    showToast(err.message || "Failed to load conversation thread", "error");
  }
}

function renderThreadMessages(messages) {
  const container = document.getElementById("thread-messages-list");
  if (!container) return;

  if (!messages || messages.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No messages in this conversation yet.</p></div>`;
    return;
  }

  const currentUid = state.user?.uid;

  container.innerHTML = messages
    .map((m) => {
      const isMe = m.senderId === currentUid;
      const isStaff = m.senderRole === "admin" || m.senderRole === "owner";
      const isOwner = m.senderRole === "owner";
      const isSystem = (m.senderName || "").includes("(System Action)");

      let bubbleType = isSystem ? "system" : isMe ? "user" : "staff";
      let staffClass = isOwner ? "owner-staff" : "";

      const timeFormatted = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

      return `
      <div class="msg-bubble-wrap ${bubbleType} ${staffClass}">
        <div class="msg-sender-meta">
          ${isOwner ? '<i class="fa-solid fa-crown text-yellow"></i>' : isStaff ? '<i class="fa-solid fa-shield-halved text-accent"></i>' : '<i class="fa-solid fa-user"></i>'}
          <strong>${escapeHtml(isMe ? "You" : m.senderName || m.senderEmail)}</strong>
          ${isOwner ? '<span class="role-badge owner">Owner</span>' : isStaff ? '<span class="role-badge admin">Admin</span>' : ''}
          <span>• ${timeFormatted}</span>
        </div>
        <div class="msg-bubble">${escapeHtml(m.text)}</div>
      </div>
    `;
    })
    .join("");

  container.scrollTop = container.scrollHeight;
}

async function handleReplySubmit(e) {
  e.preventDefault();
  if (!state.currentTicketId) return;

  const input = document.getElementById("thread-reply-input");
  const sendBtn = document.getElementById("thread-reply-send-btn");
  const text = input?.value.trim();

  if (!text) return;

  sendBtn.disabled = true;
  sendBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;

  try {
    await apiRequest(`/api/support/${state.currentTicketId}/reply`, {
      method: "POST",
      body: JSON.stringify({ message: text }),
    });

    input.value = "";
    showToast("Reply sent successfully", "success");

    // Refresh current ticket
    await openTicketThread(state.currentTicketId);
    // Reload ticket list to refresh timestamps and order
    const listRes = await apiRequest("/api/support");
    state.tickets = listRes.tickets || [];
    renderSupportTicketList();
  } catch (err) {
    showToast(err.message || "Failed to send reply", "error");
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Reply`;
  }
}

async function updateTicketStatus(ticketId, status) {
  try {
    await apiRequest(`/api/support/${ticketId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    showToast(`Ticket status updated to ${status}`, "success");
    await openTicketThread(ticketId);
  } catch (err) {
    showToast(err.message || "Failed to update status", "error");
  }
}

async function grantTicketSector(ticketId) {
  if (!confirm("Are you sure you want to approve this sector access request?")) return;
  try {
    await apiRequest(`/api/support/${ticketId}/grant-sector`, {
      method: "POST",
    });
    showToast("Sector access granted and ticket marked resolved!", "success");
    await openTicketThread(ticketId);
  } catch (err) {
    showToast(err.message || "Failed to grant sector access", "error");
  }
}

async function deleteSupportTicket(ticketId) {
  if (!confirm("Are you sure you want to delete this support ticket permanently?")) return;
  try {
    await apiRequest(`/api/support/${ticketId}`, {
      method: "DELETE",
    });
    showToast("Support ticket deleted", "info");
    state.currentTicketId = null;
    await loadSupportTickets();
  } catch (err) {
    showToast(err.message || "Failed to delete ticket", "error");
  }
}

function openCreateSupportModal(preselectedSectorId = null) {
  if (!state.token) {
    showToast("Please login first to submit a support request", "info");
    document.getElementById("auth-modal")?.classList.remove("hidden");
    return;
  }

  const modal = document.getElementById("support-modal");
  if (!modal) return;

  const sectorSelect = document.getElementById("ticket-sector-select");
  if (sectorSelect) {
    sectorSelect.innerHTML = `<option value="">-- Choose a Sector to Request Access --</option>` +
      state.sectors.map((s) => `<option value="${s.id}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join("");
    if (preselectedSectorId) {
      sectorSelect.value = preselectedSectorId;
      document.getElementById("ticket-category").value = "Sector Access Request";
    }
  }

  document.getElementById("ticket-subject").value = "";
  document.getElementById("ticket-message").value = "";
  modal.classList.remove("hidden");
}

async function handleSupportTicketCreate(e) {
  e.preventDefault();
  const category = document.getElementById("ticket-category").value;
  const sectorSelect = document.getElementById("ticket-sector-select");
  const sectorId = sectorSelect?.value || null;
  const sectorOption = sectorSelect?.options[sectorSelect.selectedIndex];
  const sectorName = sectorOption?.getAttribute("data-name") || null;
  const priority = document.getElementById("ticket-priority").value;
  const subject = document.getElementById("ticket-subject").value.trim();
  const message = document.getElementById("ticket-message").value.trim();
  const submitBtn = document.getElementById("ticket-submit-btn");

  if (!subject || !message) {
    showToast("Please fill in both subject and message", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;

  try {
    const res = await apiRequest("/api/support", {
      method: "POST",
      body: JSON.stringify({
        category,
        sectorId,
        sectorName,
        priority,
        subject,
        message,
      }),
    });

    document.getElementById("support-modal")?.classList.add("hidden");
    showToast("Support request submitted successfully!", "success");

    // Switch to support view and select this new ticket
    switchView("support-view");
    await loadSupportTickets(res.ticket?.id);
  } catch (err) {
    showToast(err.message || "Failed to create support ticket", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Submit Request`;
  }
}


