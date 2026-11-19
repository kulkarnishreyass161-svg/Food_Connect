
const API_URL = "https://food-connect-qnuq.onrender.com/api/reports";

// ==========================================
// AUTHENTICATION
// ==========================================
// ==========================================
// ROLE-BASED DASHBOARD NAVIGATION
// ==========================================


const token =
    localStorage.getItem("token") ||
    sessionStorage.getItem("token");

let user = null;

try {
    user = JSON.parse(
        localStorage.getItem("user") ||
        sessionStorage.getItem("user") ||
        "null"
    );
} catch (error) {
    console.error("Invalid user data:", error);
}

if (!token || !user) {
    window.location.replace("login.html");
    throw new Error("Authentication required.");
}

const role = String(user.role || "").toUpperCase();

if (!["DONOR", "NGO", "VOLUNTEER"].includes(role)) {
    alert("You are not authorized to access this page.");
    window.location.replace("profile.html");
    throw new Error("Unauthorized role.");
}

const dashboardLink = document.getElementById("dashboardLink");

function getDashboardPage(role) {
    switch (String(role || "").toUpperCase()) {
        case "DONOR":
            return "donor-dashboard.html";

        case "NGO":
            return "my-requests.html";

        case "VOLUNTEER":
            return "food_delivery.html";

        default:
            return "profile.html";
    }
}

if (dashboardLink && user) {
    dashboardLink.href = getDashboardPage(user.role);
}

// ==========================================
// ELEMENTS
// ==========================================

const statsGrid = document.getElementById("statsGrid");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const recordCount = document.getElementById("recordCount");
const roleLabel = document.getElementById("roleLabel");
const overviewDescription = document.getElementById("overviewDescription");

const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");

const applyBtn = document.getElementById("applyBtn");
const resetBtn = document.getElementById("resetBtn");
const csvBtn = document.getElementById("csvBtn");
const pdfBtn = document.getElementById("pdfBtn");
const logoutBtn = document.getElementById("logoutBtn");
const toast = document.getElementById("toast");

let currentSummary = {};
let currentRecords = [];
let toastTimer;

// ==========================================
// ROLE CONFIGURATION
// ==========================================

const reportConfig = {
    DONOR: {
        title: "Donor Reports",

        description: "Track your food donations and contributions.",

        stats: [
            ["Total Donations", "total_donations"],
            ["Available Donations", "available_donations"],
            ["Pickup Scheduled", "scheduled_donations"],
            ["Completed Donations", "completed_donations"],
            ["Cancelled Donations", "cancelled_donations"],
            ["Meals Shared", "meals_shared"]
        ],

        columns: [
            ["Food Name", "food_name"],
            ["Category", "category"],
            ["Quantity", "quantity"],
            ["Unit", "unit"],
            ["Status", "status"],
            ["Pickup Location", "pickup_location"],
            ["Date Created", "activity_date"]
        ]
    },

    NGO: {
        title: "NGO Reports",

        description: "Track your food requests and received donations.",

        stats: [
            ["Total Requests", "total_requests"],
            ["Pending Requests", "pending_requests"],
            ["Approved Requests", "approved_requests"],
            ["Rejected Requests", "rejected_requests"],
            ["Cancelled Requests", "cancelled_requests"],
            ["Completed Deliveries", "completed_deliveries"],
            ["Meals Received", "meals_received"]
        ],

        columns: [
            ["Food Name", "food_name"],
            ["Category", "category"],
            ["Quantity", "quantity"],
            ["Unit", "unit"],
            ["Request Status", "request_status"],
            ["Donation Status", "donation_status"],
            ["Donor", "donor_name"],
            ["Date Requested", "activity_date"]
        ]
    },

    VOLUNTEER: {
        title: "Volunteer Reports",

        description: "Track your delivery tasks and volunteering activity.",

        stats: [
            ["Assigned Deliveries", "total_assigned_deliveries"],
            ["In Progress", "in_progress_deliveries"],
            ["Completed Deliveries", "completed_deliveries"],
            ["Distance Covered", "distance_covered", "km"]
        ],

        columns: [
            ["Food Name", "food_name"],
            ["Category", "category"],
            ["Quantity", "quantity"],
            ["Delivery Status", "delivery_status"],
            ["Donor", "donor_name"],
            ["NGO", "ngo_name"],
            ["Distance", "distance_km"],
            ["Activity Date", "activity_date"]
        ]
    }
};

const config = reportConfig[role];

roleLabel.textContent = role;
overviewDescription.textContent = config.description;
document.title = `${config.title} | FoodConnect`;

// ==========================================
// HELPERS
// ==========================================

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatNumber(value) {
    const number = Number(value ?? 0);

    return Number.isFinite(number)
        ? number.toLocaleString("en-IN", {
            maximumFractionDigits: 2
        })
        : "0";
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function getFilters() {
    const params = new URLSearchParams();

    if (startDateInput.value) {
        params.set("startDate", startDateInput.value);
    }

    if (endDateInput.value) {
        params.set("endDate", endDateInput.value);
    }

    return params.toString();
}

// ==========================================
// API REQUEST
// ==========================================


async function fetchReport(endpoint) {
    const query = getFilters();

    const url = `${API_URL}/${endpoint}${query ? `?${query}` : ""}`;

    console.log("Requesting:", url);

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json"
        }
    });

    console.log("HTTP Status:", response.status);
    console.log("Content Type:", response.headers.get("content-type"));

    const responseText = await response.text();

    console.log("API Response:", responseText);

    let data;

    try {
        data = JSON.parse(responseText);
    } catch (error) {
        throw new Error(
            `API returned HTML instead of JSON. URL: ${url}. Check the Console for the response.`
        );
    }

    if (!response.ok) {
        throw new Error(data.message || "Unable to load report.");
    }

    return data;
}


// ==========================================
// RENDER STATISTICS
// ==========================================

function renderStatistics(summary) {
    statsGrid.innerHTML = "";

    config.stats.forEach(([label, key, suffix = ""]) => {
        const value = summary[key] ?? 0;

        const card = document.createElement("div");
        card.className = "stat-card";

        card.innerHTML = `
            <div class="stat-label">${escapeHTML(label)}</div>

            <div class="stat-value">
                ${escapeHTML(formatNumber(value))}
                ${escapeHTML(suffix)}
            </div>
        `;

        statsGrid.appendChild(card);
    });
}

// ==========================================
// RENDER TABLE HEADINGS
// ==========================================

function renderTableHead() {
    tableHead.innerHTML = `
        <tr>
            <th>Record ID</th>
            ${config.columns.map(([label]) =>
                `<th>${escapeHTML(label)}</th>`
            ).join("")}
        </tr>
    `;
}

// ==========================================
// STATUS STYLING
// ==========================================

function getStatusClass(status) {
    return String(status || "")
        .toLowerCase()
        .replace(/\s+/g, "-");
}

// ==========================================
// RENDER REPORT RECORDS
// ==========================================

function renderRecords(records) {
    currentRecords = records || [];

    recordCount.textContent =
        `${currentRecords.length} record(s) found`;

    renderTableHead();

    if (currentRecords.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="${config.columns.length + 1}"
                    class="empty-cell">
                    No activity records found for this period.
                </td>
            </tr>
        `;

        return;
    }

    tableBody.innerHTML = currentRecords.map(record => {
        const cells = config.columns.map(([label, key]) => {
            let value = record[key];

            if (key === "activity_date") {
                value = formatDate(value);
            } else if (key === "quantity") {
                value = formatNumber(value);
            } else if (key === "distance_km") {
                value = value === null || value === undefined
                    ? "—"
                    : `${formatNumber(value)} km`;
            } else if (key === "request_status" ||
                       key === "donation_status" ||
                       key === "delivery_status" ||
                       key === "status") {

                if (!value) value = "—";

                return `
                    <td>
                        <span class="status ${escapeHTML(getStatusClass(value))}">
                            ${escapeHTML(value)}
                        </span>
                    </td>
                `;
            }

            return `<td>${escapeHTML(value ?? "—")}</td>`;
        }).join("");

        return `
            <tr>
                <td>${escapeHTML(record.record_id ?? "—")}</td>
                ${cells}
            </tr>
        `;
    }).join("");
}

// ==========================================
// LOAD ALL REPORT DATA
// ==========================================

async function loadReports() {
    statsGrid.innerHTML = `
        <div class="loading-card">
            Loading report statistics...
        </div>
    `;

    tableBody.innerHTML = `
        <tr>
            <td colspan="${config.columns.length + 1}"
                class="empty-cell">
                Loading records...
            </td>
        </tr>
    `;

    try {
        const [summaryData, detailData] = await Promise.all([
            fetchReport("summary"),
            fetchReport("details")
        ]);

        currentSummary = summaryData.summary || {};

        renderStatistics(currentSummary);
        renderRecords(detailData.records || []);

    } catch (error) {
        console.error("Reports loading error:", error);

        statsGrid.innerHTML = `
            <div class="loading-card">
                ${escapeHTML(error.message)}
            </div>
        `;

        tableBody.innerHTML = `
            <tr>
                <td colspan="${config.columns.length + 1}"
                    class="empty-cell">
                    Unable to load report records.
                </td>
            </tr>
        `;

        showToast(error.message);
    }
}

// ==========================================
// DATE FILTER VALIDATION
// ==========================================

function validateDates() {
    const start = startDateInput.value;
    const end = endDateInput.value;

    if (start && end && start > end) {
        showToast("Start date cannot be later than end date.");
        return false;
    }

    return true;
}

applyBtn.addEventListener("click", () => {
    if (!validateDates()) return;

    loadReports();
});

resetBtn.addEventListener("click", () => {
    startDateInput.value = "";
    endDateInput.value = "";

    loadReports();
});

// ==========================================
// CSV EXPORT
// ==========================================

function csvValue(value) {
    const text = String(value ?? "");

    // Prevent spreadsheet formula injection.
    const safeText = /^[\s]*[=+\-@]/.test(text)
        ? `'${text}`
        : text;

    return `"${safeText.replace(/"/g, '""')}"`;
}

function exportCSV() {
    if (currentRecords.length === 0) {
        showToast("There are no records to export.");
        return;
    }

    const headers = [
        "Record ID",
        ...config.columns.map(([label]) => label)
    ];

    const rows = currentRecords.map(record => [
        record.record_id,
        ...config.columns.map(([label, key]) => {
            const value = record[key];

            if (key === "activity_date") {
                return formatDate(value);
            }

            return value ?? "";
        })
    ]);

    const csv = [
        headers.map(csvValue).join(","),
        ...rows.map(row => row.map(csvValue).join(","))
    ].join("\r\n");

    const blob = new Blob(
        ["\uFEFF" + csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
        `FoodConnect_${role}_Report_${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showToast("CSV report exported successfully.");
}

csvBtn.addEventListener("click", exportCSV);

// ==========================================
// PDF EXPORT
// ==========================================

pdfBtn.addEventListener("click", () => {
    if (currentRecords.length === 0) {
        showToast("There are no records to export.");
        return;
    }

    window.print();
});

// ==========================================
// LOGOUT
// ==========================================

logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    window.location.href = "login.html";
});

// ==========================================
// INITIALIZE
// ==========================================

loadReports();
