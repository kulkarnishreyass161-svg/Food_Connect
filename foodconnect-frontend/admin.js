const API_BASE = "http://localhost:5000/api/admin";

const token =
    localStorage.getItem("token") ||
    sessionStorage.getItem("token");

const currentUser = JSON.parse(
    localStorage.getItem("user") ||
    sessionStorage.getItem("user") ||
    "null"
);

let users = [];
let donations = [];
let activityUsers = [];
let reportData = null;
let selectedUserId = null;

const $ = (id) => document.getElementById(id);

function authHeaders(json = false) {
    const headers = { Authorization: `Bearer ${token}` };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
}

async function api(path, options = {}) {
    if (!token) throw new Error("Please log in with an administrator account.");
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...authHeaders(Boolean(options.body)), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
    return data;
}

function showAlert(message, type = "success") {
    const box = $("alertBox");
    box.textContent = message;
    box.className = `alert ${type}`;
    box.hidden = false;
    window.clearTimeout(showAlert.timer);
    showAlert.timer = window.setTimeout(() => box.hidden = true, 4500);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

function dateText(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function statusClass(value) {
    const s = String(value || "").toLowerCase();
    if (["active", "verified", "completed", "delivered"].includes(s)) return "active";
    if (["inactive", "cancelled", "rejected", "expired"].includes(s)) return "inactive";
    if (["pending", "available", "pickup scheduled"].includes(s)) return "pending";
    return "";
}

function setCount(id, value) {
    $(id).textContent = Number(value || 0).toLocaleString("en-IN");
}

function activateSection(name) {
    document.querySelectorAll(".section").forEach(section => section.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.section === name));
    $(`${name}Section`).classList.add("active");
    const labels = { overview: "Overview", users: "Manage users", donations: "Monitor donations", activity: "Verify activities", reports: "Reports & analysis" };
    $("pageTitle").textContent = labels[name] || "Admin";
    if (name === "users") loadUsers();
    if (name === "donations") loadDonations();
    if (name === "activity") loadActivity();
    if (name === "reports") loadReports();
}

async function loadOverview() {
    try {
        const data = await api("/overview");
        const s = data.stats || {};
        setCount("statUsers", s.totalUsers);
        setCount("statDonations", s.totalDonations);
        setCount("statDeliveries", s.totalDeliveries);
        setCount("statCompleted", s.completedDeliveries);
        renderRecentUsers(data.recentUsers || []);
        renderRecentDonations(data.recentDonations || []);
    } catch (error) { showAlert(error.message, "error"); }
}

function renderRecentUsers(rows) {
    $("recentUsers").innerHTML = rows.length ? rows.map(user => `
      <div class="compact-item"><div><strong>${escapeHTML(user.name)}</strong><small>${escapeHTML(user.role)} · ${escapeHTML(user.email)}</small></div><span class="compact-meta">${dateText(user.created_at)}</span></div>
    `).join("") : '<div class="empty">No users found.</div>';
}

function renderRecentDonations(rows) {
    $("recentDonations").innerHTML = rows.length ? rows.map(item => `
      <div class="compact-item"><div><strong>${escapeHTML(item.food_name || "Food donation")}</strong><small>${escapeHTML(item.donor_name || "Unknown donor")} · ${escapeHTML(item.status || "—")}</small></div><span class="compact-meta">${dateText(item.created_at)}</span></div>
    `).join("") : '<div class="empty">No donations found.</div>';
}

async function loadUsers() {
    $("usersTable").innerHTML = '<tr><td colspan="6" class="loading">Loading users…</td></tr>';
    try {
        const data = await api("/users");
        users = data.users || [];
        renderUsers();
    } catch (error) {
        $("usersTable").innerHTML = `<tr><td colspan="6" class="empty">${escapeHTML(error.message)}</td></tr>`;
        showAlert(error.message, "error");
    }
}

function renderUsers() {
    const q = $("userSearch").value.trim().toLowerCase();
    const role = $("roleFilter").value;
    const active = $("userStatusFilter").value;
    const rows = users.filter(user => {
        const matchesQuery = [user.name, user.email, user.city].some(v => String(v || "").toLowerCase().includes(q));
        const matchesRole = !role || user.role === role;
        const matchesActive = active === "" || String(user.is_active !== false) === active;
        return matchesQuery && matchesRole && matchesActive;
    });
    $("usersTable").innerHTML = rows.length ? rows.map(user => `
      <tr>
        <td class="user-cell"><strong>${escapeHTML(user.name)}</strong><small>#${escapeHTML(user.id)}</small></td>
        <td>${escapeHTML(user.email)}<br><span class="compact-meta">${escapeHTML(user.phone || "No phone")}</span></td>
        <td><span class="status">${escapeHTML(user.role)}</span></td>
        <td>${dateText(user.created_at)}</td>
        <td><span class="status ${user.is_active === false ? "inactive" : "active"}">${user.is_active === false ? "Inactive" : "Active"}</span></td>
        <td><div class="action-group">
          <button class="small-btn" data-role="${user.id}" data-name="${escapeHTML(user.name)}" data-current="${escapeHTML(user.role)}">Role</button>
          <button class="small-btn ${user.is_active === false ? "" : "danger"}" data-toggle="${user.id}" data-active="${user.is_active !== false}">${user.is_active === false ? "Activate" : "Deactivate"}</button>
        </div></td>
      </tr>
    `).join("") : '<tr><td colspan="6" class="empty">No matching users.</td></tr>';
}

async function loadDonations() {
    $("donationsTable").innerHTML = '<tr><td colspan="6" class="loading">Loading donations…</td></tr>';
    try {
        const data = await api("/donations");
        donations = data.donations || [];
        renderDonations();
    } catch (error) {
        $("donationsTable").innerHTML = `<tr><td colspan="6" class="empty">${escapeHTML(error.message)}</td></tr>`;
        showAlert(error.message, "error");
    }
}

function renderDonations() {
    const q = $("donationSearch").value.trim().toLowerCase();
    const status = $("donationStatusFilter").value.toLowerCase();
    const rows = donations.filter(item => {
        const searchable = [item.food_name, item.donor_name, item.pickup_location, item.location, item.city].join(" ").toLowerCase();
        return searchable.includes(q) && (!status || String(item.status || "").toLowerCase() === status);
    });
    $("donationsTable").innerHTML = rows.length ? rows.map(item => `
      <tr>
        <td><strong>${escapeHTML(item.food_name || "Food donation")}</strong><br><span class="compact-meta">#${escapeHTML(item.id)}</span></td>
        <td>${escapeHTML(item.donor_name || "—")}</td>
        <td>${escapeHTML(item.quantity ?? "—")} ${escapeHTML(item.unit || "")}</td>
        <td>${escapeHTML(item.pickup_location || item.location || item.city || "—")}</td>
        <td><span class="status ${statusClass(item.status)}">${escapeHTML(item.status || "—")}</span></td>
        <td>${dateText(item.created_at)}</td>
      </tr>
    `).join("") : '<tr><td colspan="6" class="empty">No matching donations.</td></tr>';
}

async function loadActivity() {
    $("activityTable").innerHTML = '<tr><td colspan="6" class="loading">Loading accounts…</td></tr>';
    $("deliveryActivity").innerHTML = '<div class="loading">Loading delivery activity…</div>';
    try {
        const data = await api("/activity");
        activityUsers = data.users || [];
        $("activityTable").innerHTML = activityUsers.length ? activityUsers.map(user => `
          <tr>
            <td><strong>${escapeHTML(user.name)}</strong><br><span class="compact-meta">#${escapeHTML(user.id)}</span></td>
            <td>${escapeHTML(user.role)}</td>
            <td>${escapeHTML(user.email)}</td>
            <td>${dateText(user.created_at)}</td>
            <td><span class="status ${user.admin_verified ? "verified" : "pending"}">${user.admin_verified ? "Verified" : "Not verified"}</span></td>
            <td>${user.role === "ADMIN" ? "—" : `<button class="small-btn" data-verify="${user.id}" data-verified="${Boolean(user.admin_verified)}">${user.admin_verified ? "Revoke" : "Verify"}</button>`}</td>
          </tr>
        `).join("") : '<tr><td colspan="6" class="empty">No accounts found.</td></tr>';
        const deliveries = data.recentDeliveries || [];
        $("deliveryActivity").innerHTML = deliveries.length ? deliveries.map(item => `
          <div class="compact-item"><div><strong>${escapeHTML(item.food_name || "Delivery")}</strong><small>${escapeHTML(item.volunteer_name || "Volunteer not assigned")} · ${escapeHTML(item.delivery_status || "—")}</small></div><span class="compact-meta">${dateText(item.created_at)}</span></div>
        `).join("") : '<div class="empty">No delivery activity found.</div>';
    } catch (error) {
        $("activityTable").innerHTML = `<tr><td colspan="6" class="empty">${escapeHTML(error.message)}</td></tr>`;
        $("deliveryActivity").innerHTML = '<div class="empty">Unable to load delivery activity.</div>';
        showAlert(error.message, "error");
    }
}

async function loadReports() {
    try {
        const data = await api("/reports");
        reportData = data;
        const s = data.summary || {};
        setCount("reportDonors", s.donors);
        setCount("reportNgos", s.ngos);
        setCount("reportVolunteers", s.volunteers);
        setCount("reportAvailable", s.availableDonations);
        renderBreakdown("donationBreakdown", data.donationStatuses || []);
        renderBreakdown("deliveryBreakdown", data.deliveryStatuses || []);
    } catch (error) { showAlert(error.message, "error"); }
}

function renderBreakdown(elementId, rows) {
    const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    $(elementId).innerHTML = rows.length ? rows.map(row => {
        const count = Number(row.count || 0);
        const percent = total ? Math.round(count / total * 100) : 0;
        return `<div class="break-row"><span>${escapeHTML(row.status || "Unknown")}</span><div class="bar"><span style="width:${percent}%"></span></div><strong>${count}</strong></div>`;
    }).join("") : '<div class="empty">No report data available.</div>';
}

function exportCSV() {
    if (!reportData) return showAlert("Load the report before exporting.", "error");
    const lines = [["FoodConnect System Report", new Date().toISOString()], [], ["Metric", "Value"]];
    Object.entries(reportData.summary || {}).forEach(([key, value]) => lines.push([key, value]));
    lines.push([], ["Donation status", "Count"]);
    (reportData.donationStatuses || []).forEach(row => lines.push([row.status, row.count]));
    lines.push([], ["Delivery status", "Count"]);
    (reportData.deliveryStatuses || []).forEach(row => lines.push([row.status, row.count]));
    const csv = lines.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url; link.download = `foodconnect-report-${new Date().toISOString().slice(0,10)}.csv`;
    link.click(); URL.revokeObjectURL(url);
}

function openRoleModal(id, name, role) {
    selectedUserId = Number(id);
    $("roleUserLabel").textContent = `Choose a new role for ${name}.`;
    $("newRole").value = role;
    $("roleModal").hidden = false;
}

function closeRoleModal() { $("roleModal").hidden = true; selectedUserId = null; }

async function saveRole() {
    if (!selectedUserId) return;
    try {
        await api(`/users/${selectedUserId}/role`, {
            method: "PATCH",
            body: JSON.stringify({ role: $("newRole").value })
        });
        closeRoleModal();
        showAlert("User role updated.");
        await loadUsers();
    } catch (error) { showAlert(error.message, "error"); }
}

async function toggleUser(id, active) {
    if (!confirm(`Are you sure you want to ${active ? "deactivate" : "activate"} this account?`)) return;
    try {
        await api(`/users/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ isActive: !active })
        });
        showAlert(`Account ${active ? "deactivated" : "activated"} successfully.`);
        await loadUsers();
    } catch (error) { showAlert(error.message, "error"); }
}

async function verifyUser(id, verified) {
    if (!confirm(`Are you sure you want to ${verified ? "revoke verification" : "verify"} this account?`)) return;
    try {
        await api(`/users/${id}/verify`, {
            method: "PATCH",
            body: JSON.stringify({ verified: !verified })
        });
        showAlert(`Account ${verified ? "verification revoked" : "verified"} successfully.`);
        await loadActivity();
    } catch (error) { showAlert(error.message, "error"); }
}

function initialise() {
    if (!token || !currentUser) {
        window.location.href = "login.html";
        return;
    }
    if (String(currentUser.role || "").toUpperCase() !== "ADMIN") {
        document.body.innerHTML = '<main style="font-family:DM Sans,sans-serif;padding:50px;text-align:center"><h2>Administrator access required</h2><p>Your account does not have permission to open this page.</p><a href="profile.html">Return to profile</a></main>';
        return;
    }

    $("adminName").textContent = currentUser.name || "Administrator";
    $("adminInitials").textContent = (currentUser.name || "AD").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();

    document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => activateSection(button.dataset.section)));
    document.querySelectorAll("[data-goto]").forEach(button => button.addEventListener("click", () => activateSection(button.dataset.goto)));

    $("refreshOverview").addEventListener("click", loadOverview);
    $("refreshUsers").addEventListener("click", loadUsers);
    $("refreshDonations").addEventListener("click", loadDonations);
    $("refreshActivity").addEventListener("click", loadActivity);
    $("userSearch").addEventListener("input", renderUsers);
    $("roleFilter").addEventListener("change", renderUsers);
    $("userStatusFilter").addEventListener("change", renderUsers);
    $("donationSearch").addEventListener("input", renderDonations);
    $("donationStatusFilter").addEventListener("change", renderDonations);
    $("exportReport").addEventListener("click", exportCSV);

    $("usersTable").addEventListener("click", event => {
        const roleButton = event.target.closest("[data-role]");
        const toggleButton = event.target.closest("[data-toggle]");
        if (roleButton) openRoleModal(roleButton.dataset.role, roleButton.dataset.name, roleButton.dataset.current);
        if (toggleButton) toggleUser(Number(toggleButton.dataset.toggle), toggleButton.dataset.active === "true");
    });
    $("activityTable").addEventListener("click", event => {
        const button = event.target.closest("[data-verify]");
        if (button) verifyUser(Number(button.dataset.verify), button.dataset.verified === "true");
    });

    $("saveRole").addEventListener("click", saveRole);
    $("closeRoleModal").addEventListener("click", closeRoleModal);
    $("cancelRole").addEventListener("click", closeRoleModal);
    $("roleModal").addEventListener("click", event => { if (event.target === $("roleModal")) closeRoleModal(); });

    $("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("token"); localStorage.removeItem("user");
        sessionStorage.removeItem("token"); sessionStorage.removeItem("user");
        window.location.href = "login.html";
    });

    loadOverview();
}
document.addEventListener("DOMContentLoaded", initialise);
