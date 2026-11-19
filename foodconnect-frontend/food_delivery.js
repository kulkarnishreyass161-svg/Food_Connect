
const API_URL = "https://food-connect-qnuq.onrender.com/api/deliveries";
const REPORTS_API_URL = "https://food-connect-qnuq.onrender.com/api/reports";

// ==========================================
// AUTHENTICATION
// ==========================================

const token =
    localStorage.getItem("token") ||
    sessionStorage.getItem("token");

const user = JSON.parse(
    localStorage.getItem("user") ||
    sessionStorage.getItem("user") ||
    "null"
);

let tasks = [];
let activeTab = "available";
let selectedId = null;
let toastTimer;
let currentLocation = null;

// ==========================================
// MAP VARIABLES
// ==========================================

let deliveryMap = null;
let mapMarkers = [];
let mapRouteLayers = [];

const roadRouteCache = new Map();

// ==========================================
// QR SCANNER VARIABLES
// ==========================================

let qrScanner = null;
let qrScannerRunning = false;
let qrScanInProgress = false;

// ==========================================
// HTML ELEMENTS
// ==========================================

const taskList = document.getElementById("taskList");
const detailContent = document.getElementById("detailContent");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const emptyState = document.getElementById("emptyState");

const locationButton =
    document.getElementById("useLocationBtn");

const locationMessage =
    document.getElementById("locationMessage");

// ==========================================
// CHECK AUTHENTICATION
// ==========================================

if (!token || !user) {
    window.location.href = "login.html";
}

// ==========================================
// CHECK VOLUNTEER ROLE
// ==========================================

if (
    user &&
    String(user.role).toUpperCase() !== "VOLUNTEER"
) {
    alert("Only volunteers can access delivery tasks.");
    window.location.href = "index.html";
}

// ==========================================
// API HELPER
// ==========================================

async function apiRequest(endpoint, options = {}) {

    const response = await fetch(
        `${API_URL}${endpoint}`,
        {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                ...(options.headers || {})
            }
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.message || "Something went wrong."
        );
    }

    return data;
}

// ==========================================
// REPORTS API HELPER
// ==========================================

async function reportsRequest(endpoint) {

    const response = await fetch(
        `${REPORTS_API_URL}${endpoint}`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.message || "Unable to load reports."
        );
    }

    return data;
}

// ==========================================
// STRAIGHT-LINE DISTANCE
// ==========================================

function calculateDistance(lat1, lon1, lat2, lon2) {

    const earthRadius = 6371;

    const toRadians = degrees =>
        degrees * Math.PI / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c =
        2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadius * c;
}

// ==========================================
// VALIDATE COORDINATES
// ==========================================

function makeCoordinates(latitude, longitude) {

    if (
        latitude === null ||
        latitude === undefined ||
        longitude === null ||
        longitude === undefined ||
        latitude === "" ||
        longitude === ""
    ) {
        return null;
    }

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
    ) {
        return null;
    }

    return {
        latitude: lat,
        longitude: lon
    };
}

// ==========================================
// GET DONOR PICKUP COORDINATES
// ==========================================

function getPickupCoordinates(task) {

    return makeCoordinates(
        task.pickup_latitude ?? task.latitude,
        task.pickup_longitude ?? task.longitude
    );
}

// ==========================================
// GET NGO / DROP-OFF COORDINATES
// ==========================================

function getDropCoordinates(task) {

    const latitude =
        task.drop_latitude ??
        task.dropoff_latitude ??
        task.ngo_latitude ??
        task.receiver_latitude ??
        task.destination_latitude ??
        task.drop_location_latitude ??
        task.ngo_location_latitude;

    const longitude =
        task.drop_longitude ??
        task.dropoff_longitude ??
        task.ngo_longitude ??
        task.receiver_longitude ??
        task.destination_longitude ??
        task.drop_location_longitude ??
        task.ngo_location_longitude;

    return makeCoordinates(latitude, longitude);
}

// ==========================================
// GET ACTUAL ROAD ROUTE USING OSRM
// ==========================================

async function getOSRMRoute(start, end) {

    if (!start || !end) {
        throw new Error("Route coordinates are missing.");
    }

    const cacheKey = [
        start.latitude,
        start.longitude,
        end.latitude,
        end.longitude
    ].join(",");

    if (roadRouteCache.has(cacheKey)) {
        return roadRouteCache.get(cacheKey);
    }

    const routeURL =
        "https://router.project-osrm.org/route/v1/driving/" +
        `${start.longitude},${start.latitude};` +
        `${end.longitude},${end.latitude}` +
        "?overview=full&geometries=geojson";

    const response = await fetch(routeURL);

    if (!response.ok) {
        throw new Error(
            "OSRM road routing service is unavailable."
        );
    }

    const data = await response.json();

    if (
        data.code !== "Ok" ||
        !data.routes ||
        !data.routes.length
    ) {
        throw new Error(
            "No driving route could be found."
        );
    }

    const route = data.routes[0];

    const result = {
        distanceKm: route.distance / 1000,

        durationMinutes: Math.round(
            route.duration / 60
        ),

        coordinates: route.geometry.coordinates.map(
            point => [
                point[1],
                point[0]
            ]
        )
    };

    roadRouteCache.set(cacheKey, result);

    return result;
}

// ==========================================
// CALCULATE VOLUNTEER TO PICKUP DISTANCE
// ==========================================

function updateTaskDistances() {

    tasks.forEach(task => {

        const coordinates =
            getPickupCoordinates(task);

        if (!currentLocation || !coordinates) {
            task.volunteerDistanceKm = null;
            return;
        }

        task.volunteerDistanceKm =
            calculateDistance(
                currentLocation.latitude,
                currentLocation.longitude,
                coordinates.latitude,
                coordinates.longitude
            );
    });
}

// ==========================================
// LOAD DELIVERY TASKS
// ==========================================

async function loadTasks() {

    try {

        const [available, mine, completed] =
            await Promise.all([
                apiRequest("/available"),
                apiRequest("/my"),
                apiRequest("/completed")
            ]);

        tasks = [
            ...(available.deliveries || []),
            ...(mine.deliveries || []),
            ...(completed.deliveries || [])
        ];

        // Remove duplicate delivery records.

        tasks = [
            ...new Map(
                tasks.map(task => [
                    task.delivery_id,
                    task
                ])
            ).values()
        ];

        if (
            !tasks.some(
                task =>
                    Number(task.delivery_id) ===
                    Number(selectedId)
            )
        ) {

            selectedId =
                tasks.find(
                    task =>
                        task.delivery_status === "Available"
                )?.delivery_id ||
                tasks[0]?.delivery_id ||
                null;
        }

        updateTaskDistances();

        renderList();
        renderDetail();

        await loadStatistics();

    } catch (error) {

        console.error(
            "Loading delivery tasks:",
            error
        );

        showToast(error.message);
    }
}

// ==========================================
// LOAD DELIVERY DASHBOARD STATISTICS
// ==========================================

async function loadStatistics() {

    try {

        const data = await apiRequest("/stats");
        const stats = data.stats || {};

        document.getElementById("waitingCount")
            .textContent = stats.tasks_waiting || 0;

        document.getElementById("progressCount")
            .textContent = stats.in_progress || 0;

        document.getElementById("deliveredCount")
            .textContent = stats.meals_delivered || 0;

        document.getElementById("distanceCount")
            .innerHTML =
            `${Number(
                stats.distance_covered || 0
            ).toFixed(1)} <small>km</small>`;

        document.getElementById("availableTabCount")
            .textContent = stats.tasks_waiting || 0;

        document.getElementById("mineTabCount")
            .textContent = stats.in_progress || 0;

        document.getElementById("completedTabCount")
            .textContent = stats.completed || 0;

    } catch (error) {

        console.error("Statistics error:", error);
    }
}

// ==========================================
// MY REPORTS
// ==========================================

async function loadVolunteerReports() {

    const assignedElement =
        document.getElementById("reportAssigned");

    if (!assignedElement) return;

    if (!token || !user) return;

    try {

        const data = await reportsRequest("/summary");

        const report =
            data.summary ||
            data.stats ||
            data.report ||
            data;

        const assigned =
            Number(
                report.total_assigned_deliveries ??
                report.total_assigned ??
                0
            );

        const completed =
            Number(
                report.completed_deliveries ??
                report.completed ??
                0
            );

        const inProgress =
            Number(
                report.in_progress_deliveries ??
                report.in_progress ??
                0
            );

        const distance =
            Number(report.distance_covered ?? 0);

        document.getElementById("reportAssigned")
            .textContent = assigned;

        document.getElementById("reportCompleted")
            .textContent = completed;

        document.getElementById("reportProgress")
            .textContent = inProgress;

        document.getElementById("reportDistance")
            .innerHTML =
            `${distance.toFixed(1)} <small>km</small>`;

    } catch (error) {

        console.error(
            "Volunteer reports error:",
            error
        );

        assignedElement.textContent = "—";

        const completedElement =
            document.getElementById("reportCompleted");

        const progressElement =
            document.getElementById("reportProgress");

        const distanceElement =
            document.getElementById("reportDistance");

        if (completedElement) {
            completedElement.textContent = "—";
        }

        if (progressElement) {
            progressElement.textContent = "—";
        }

        if (distanceElement) {
            distanceElement.textContent = "—";
        }
    }
}

// ==========================================
// FILTER AND SORT TASKS
// ==========================================

function getVisibleTasks() {

    const search = searchInput.value
        .trim()
        .toLowerCase();

    let filtered = tasks.filter(task => {

        const status = task.delivery_status;

        if (activeTab === "available") {
            return status === "Available";
        }

        if (activeTab === "mine") {
            return [
                "Accepted",
                "Pickup in progress",
                "In transit"
            ].includes(status);
        }

        if (activeTab === "completed") {
            return status === "Completed";
        }

        return false;
    });

    filtered = filtered.filter(task => {

        const searchable = [
            task.food_name,
            task.donor_name,
            task.ngo_name,
            task.pickup_location,
            task.drop_location
        ].join(" ").toLowerCase();

        return searchable.includes(search);
    });

    const sort = sortSelect.value;

    if (sort === "distance") {

        filtered.sort((a, b) => {

            const distanceA = a.volunteerDistanceKm;
            const distanceB = b.volunteerDistanceKm;

            if (
                distanceA === null ||
                distanceA === undefined
            ) return 1;

            if (
                distanceB === null ||
                distanceB === undefined
            ) return -1;

            return distanceA - distanceB;
        });

    } else if (sort === "meals") {

        filtered.sort(
            (a, b) =>
                Number(b.quantity || 0) -
                Number(a.quantity || 0)
        );

    } else {

        filtered.sort(
            (a, b) =>
                new Date(a.expires_at) -
                new Date(b.expires_at)
        );
    }

    return filtered;
}

// ==========================================
// DISPLAY DELIVERY TASKS
// ==========================================

function renderList() {

    const visible = getVisibleTasks();

    taskList.replaceChildren();

    visible.forEach(task => {

        const card = document.createElement("article");

        card.className = "task-card";

        if (
            Number(task.delivery_id) ===
            Number(selectedId)
        ) {
            card.classList.add("selected");
        }

        card.tabIndex = 0;
        card.setAttribute("role", "button");

        const urgency =
            task.expires_at &&
            new Date(task.expires_at).getTime() -
            Date.now() < 24 * 60 * 60 * 1000;

        const badge = urgency
            ? "PRIORITY TASK"
            : "OPEN TASK";

        const distanceText =
            task.volunteerDistanceKm !== null &&
            task.volunteerDistanceKm !== undefined
                ? `${task.volunteerDistanceKm.toFixed(1)} km approximate distance`
                : "Distance unavailable";

        card.innerHTML = `
            <div class="task-card-head">

                <h3>${escapeHTML(task.food_name)}</h3>

                <span class="urgency ${
                    urgency ? "" : "normal"
                }">
                    ${badge}
                </span>

            </div>

            <div class="task-place">

                <span class="place-type">PICKUP</span>

                <span>
                    <span class="place-name">
                        ${escapeHTML(task.donor_name)}
                    </span>

                    <span class="place-area">
                        · ${escapeHTML(task.pickup_location)}
                    </span>
                </span>

            </div>

            <div class="task-place">

                <span class="place-type">DROP-OFF</span>

                <span>
                    <span class="place-name">
                        ${escapeHTML(task.ngo_name)}
                    </span>

                    <span class="place-area">
                        · ${escapeHTML(task.drop_location)}
                    </span>
                </span>

            </div>

            <div class="task-meta">

                <span>
                    <strong>
                        ${escapeHTML(task.quantity)}
                        ${escapeHTML(task.unit)}
                    </strong>
                </span>

                <span>
                    <strong>${distanceText}</strong>
                </span>

                <span>
                    ${formatDate(task.expires_at)}
                </span>

            </div>
        `;

        card.addEventListener("click", () => {

            selectedId = task.delivery_id;

            renderList();
            renderDetail();
        });

        card.addEventListener("keydown", event => {

            if (
                event.key === "Enter" ||
                event.key === " "
            ) {
                event.preventDefault();

                selectedId = task.delivery_id;

                renderList();
                renderDetail();
            }
        });

        taskList.appendChild(card);
    });

    const noTasks = visible.length === 0;

    emptyState.classList.toggle(
        "hidden",
        !noTasks
    );

    taskList.classList.toggle(
        "hidden",
        noTasks
    );
}

// ==========================================
// DELIVERY PROGRESS
// ==========================================

const steps = [
    {
        key: "Accepted",
        title: "Accepted",
        description: "You accepted this delivery task."
    },
    {
        key: "Pickup in progress",
        title: "Pickup in progress",
        description: "Food collection from donor."
    },
    {
        key: "In transit",
        title: "In transit",
        description: "Food is on its way to the receiver."
    },
    {
        key: "Completed",
        title: "Delivered",
        description: "Food handed over to receiver."
    }
];

const statusRank = {
    "Available": -1,
    "Accepted": 0,
    "Pickup in progress": 1,
    "In transit": 2,
    "Completed": 3
};

// ==========================================
// DISPLAY SELECTED DELIVERY
// ==========================================

function renderDetail() {

    // Stop an old scanner before replacing its HTML.
    stopPickupQRScanner();

    qrScanInProgress = false;

    const task = tasks.find(
        item =>
            Number(item.delivery_id) ===
            Number(selectedId)
    );

    if (!task) {

        destroyDeliveryMap();

        detailContent.innerHTML = `
            <div class="detail-empty">
                <div>
                    <span class="empty-mark">FC</span>

                    <h3>Select a delivery task</h3>

                    <p>
                        Select a task to view its pickup,
                        receiver and delivery progress.
                    </p>
                </div>
            </div>
        `;

        return;
    }

    const rank = statusRank[task.delivery_status];

    const progress = steps.map((step, index) => {

        const done = index <= rank;
        const current = index === rank;

        return `
            <div class="progress-step
                ${done ? "done" : ""}
                ${current ? "current" : ""}">

                <span class="step-marker">
                    ${String(index + 1).padStart(2, "0")}
                </span>

                <div class="step-copy">
                    <strong>${step.title}</strong>
                    <span>${step.description}</span>
                </div>

            </div>
        `;

    }).join("");

    let action = "";

    if (task.delivery_status === "Available") {

        action = `
            <button class="action-button"
                data-action="accept">
                ACCEPT DELIVERY TASK
            </button>
        `;

    } else if (task.delivery_status === "Accepted") {

        action = `
            <button
                type="button"
                class="action-button"
                id="openPickupScanner">
                SCAN QR TO VERIFY PICKUP
            </button>
        `;

    } else if (
        task.delivery_status === "Pickup in progress"
    ) {

        action = `
            <button class="action-button"
                data-action="transit">
                START DELIVERY
            </button>
        `;

    } else if (task.delivery_status === "In transit") {

        action = `
            <button class="action-button"
                data-action="complete">
                MARK AS DELIVERED
            </button>
        `;

    } else {

        action = `
            <button class="action-button secondary" disabled>
                DELIVERY COMPLETED
            </button>
        `;
    }

    // QR scanner is shown only for accepted deliveries.

    const qrSection =
        task.delivery_status === "Accepted"
        ? `
            <section class="qr-section">

                <div class="qr-section-heading">
                    <div>
                        <strong>Verify food pickup</strong>

                        <p>
                            Scan the donation QR code provided by the donor
                            to confirm that you are collecting the correct food.
                        </p>
                    </div>
                </div>

                <div
                    id="qrReader"
                    class="qr-reader">
                </div>

                <div class="qr-actions">

                    <button
                        type="button"
                        id="startQRScanner"
                        class="qr-action-button">
                        START CAMERA SCANNER
                    </button>

                    <button
                        type="button"
                        id="stopQRScanner"
                        class="qr-action-button secondary"
                        disabled>
                        STOP SCANNER
                    </button>

                </div>

                <p
                    id="qrMessage"
                    class="qr-message"
                    role="status"
                    aria-live="polite">
                    Start the scanner and point your camera at the donation QR code.
                </p>

            </section>
        `
        : "";

    detailContent.innerHTML = `

        <div class="detail-topline">

            <span class="detail-status open">
                ${escapeHTML(task.delivery_status)}
            </span>

            <span class="live-indicator">
                TASK #${escapeHTML(task.delivery_id)}
            </span>

        </div>

        <h2 class="detail-title">
            ${escapeHTML(task.food_name)}
        </h2>

        <p class="detail-subtitle">
            ${escapeHTML(task.quantity)}
            ${escapeHTML(task.unit)}
            · Expires ${formatDate(task.expires_at)}
        </p>

        <div class="location-grid">

            <div class="location-box">

                <small>COLLECT FROM</small>

                <strong>
                    ${escapeHTML(task.donor_name)}
                </strong>

                <span>
                    ${escapeHTML(task.pickup_location)}
                </span>

            </div>

            <div class="location-box">

                <small>DELIVER TO</small>

                <strong>
                    ${escapeHTML(task.ngo_name)}
                </strong>

                <span>
                    ${escapeHTML(task.drop_location)}
                </span>

            </div>

        </div>

        <section class="road-distance-section">

            <div class="road-distance-heading">
                <strong>Road distance details</strong>
                <span>ACTUAL DRIVING ROUTES</span>
            </div>

            <div class="road-distance-grid">

                <div class="road-distance-card">

                    <small>YOUR LOCATION TO DONOR</small>

                    <strong id="volunteerPickupDistance">
                        Calculating...
                    </strong>

                    <span id="volunteerPickupTime">
                        Finding driving time...
                    </span>

                </div>

                <div class="road-distance-card">

                    <small>YOUR LOCATION TO NGO</small>

                    <strong id="volunteerDropDistance">
                        Calculating...
                    </strong>

                    <span id="volunteerDropTime">
                        Finding driving time...
                    </span>

                </div>

                <div class="road-distance-card">

                    <small>DONOR TO NGO</small>

                    <strong id="pickupDropDistance">
                        Calculating...
                    </strong>

                    <span id="pickupDropTime">
                        Finding driving time...
                    </span>

                </div>

            </div>

        </section>

        <section class="delivery-map-section">

            <div class="map-heading">
                <strong>Delivery route</strong>
                <span>OPENSTREETMAP</span>
            </div>

            <div id="deliveryMap" class="delivery-map"></div>

            <div class="map-legend">

                <span class="map-legend-item">
                    <span class="map-dot pickup"></span>
                    Donor pickup
                </span>

                <span class="map-legend-item">
                    <span class="map-dot dropoff"></span>
                    NGO drop-off
                </span>

                <span class="map-legend-item">
                    <span class="map-dot volunteer"></span>
                    Your location
                </span>

            </div>

            <p class="map-route-note" id="mapRouteNote">
                Calculating road routes...
            </p>

        </section>

        ${qrSection}

        <div class="progress-section">

            <div class="progress-heading">

                <strong>Delivery progress</strong>

                <span>
                    ${
                        rank < 0
                            ? "NOT STARTED"
                            : `${rank + 1} OF 4 STEPS`
                    }
                </span>

            </div>

            <div class="progress-track">
                ${progress}
            </div>

        </div>

        <div class="detail-actions">

            ${action}

            <p class="action-hint">
                ${
                    task.delivery_status === "Accepted"
                    ? "Verify the donation QR code before starting pickup."
                    : "Update each stage after completing the activity."
                }
            </p>

        </div>
    `;

    // Regular delivery action buttons.

    detailContent
        .querySelector("[data-action]")
        ?.addEventListener("click", event => {

            updateDelivery(
                task.delivery_id,
                event.currentTarget.dataset.action
            );
        });

    // QR scanner controls.

    if (task.delivery_status === "Accepted") {
        setupPickupQRScanner(task);
    }

    initializeDeliveryMap(task);
}

// ==========================================
// SET UP PICKUP QR SCANNER
// ==========================================

function setupPickupQRScanner(task) {

    const startButton =
        document.getElementById("startQRScanner");

    const stopButton =
        document.getElementById("stopQRScanner");

    if (!startButton || !stopButton) return;

    startButton.addEventListener("click", () => {
        startPickupQRScanner(task);
    });

    stopButton.addEventListener("click", () => {
        stopPickupQRScanner();
    });
}

// ==========================================
// START QR CAMERA SCANNER
// ==========================================

async function startPickupQRScanner(task) {

    const message =
        document.getElementById("qrMessage");

    const startButton =
        document.getElementById("startQRScanner");

    const stopButton =
        document.getElementById("stopQRScanner");

    if (qrScannerRunning || qrScanInProgress) {
        return;
    }

    if (typeof Html5Qrcode === "undefined") {

        if (message) {
            message.textContent =
                "QR scanner library could not be loaded. Check your internet connection.";
            message.className = "qr-message error";
        }

        showToast("QR scanner library is unavailable.");

        return;
    }

    const reader =
        document.getElementById("qrReader");

    if (!reader) return;

    try {

        if (startButton) {
            startButton.disabled = true;
        }

        if (message) {
            message.textContent =
                "Starting camera. Please allow camera permission.";
            message.className = "qr-message";
        }

        qrScanner = new Html5Qrcode("qrReader");

        await qrScanner.start(
            { facingMode: "environment" },

            {
                fps: 10,

                qrbox: function (viewfinderWidth, viewfinderHeight) {

                    const size = Math.min(
                        240,
                        viewfinderWidth * 0.75,
                        viewfinderHeight * 0.75
                    );

                    return {
                        width: Math.floor(size),
                        height: Math.floor(size)
                    };
                },

                aspectRatio: 1
            },

            async decodedText => {

                if (qrScanInProgress) return;

                qrScanInProgress = true;

                if (message) {
                    message.textContent =
                        "QR code detected. Verifying donation...";
                    message.className = "qr-message";
                }

                await stopPickupQRScanner();

                await verifyPickupQR(
                    task,
                    decodedText
                );
            },

            () => {
                // Ignore individual frame decode failures.
            }
        );

        qrScannerRunning = true;

        if (startButton) {
            startButton.disabled = true;
        }

        if (stopButton) {
            stopButton.disabled = false;
        }

        if (message) {
            message.textContent =
                "Camera active. Position the donation QR code inside the scanning frame.";
            message.className = "qr-message success";
        }

    } catch (error) {

        console.error("QR scanner start error:", error);

        qrScanner = null;
        qrScannerRunning = false;

        if (startButton) {
            startButton.disabled = false;
        }

        if (stopButton) {
            stopButton.disabled = true;
        }

        if (message) {
            message.textContent =
                "Unable to start camera. Allow camera permission and use HTTPS or localhost.";
            message.className = "qr-message error";
        }

        showToast(
            "Camera could not be started. Check camera permission."
        );
    }
}

// ==========================================
// STOP QR CAMERA SCANNER
// ==========================================

async function stopPickupQRScanner() {

    const scanner = qrScanner;

    qrScanner = null;

    const wasRunning = qrScannerRunning;

    qrScannerRunning = false;

    if (scanner && wasRunning) {

        try {
            await scanner.stop();
        } catch (error) {
            console.warn("QR scanner stop:", error);
        }
    }

    if (scanner) {

        try {
            scanner.clear();
        } catch (error) {
            console.warn("QR scanner clear:", error);
        }
    }

    const startButton =
        document.getElementById("startQRScanner");

    const stopButton =
        document.getElementById("stopQRScanner");

    if (startButton) {
        startButton.disabled = false;
    }

    if (stopButton) {
        stopButton.disabled = true;
    }
}

// ==========================================
// VERIFY DONATION QR CODE
// ==========================================

async function verifyPickupQR(task, decodedText) {

    const message =
        document.getElementById("qrMessage");

    try {

        let qrData;

        try {

            qrData = JSON.parse(decodedText);

        } catch {

            throw new Error(
                "Invalid QR code. Please scan the FoodConnect donation QR code."
            );
        }

        // Check QR code type.

        if (
            !qrData ||
            qrData.type !== "FOODCONNECT_DONATION"
        ) {

            throw new Error(
                "This is not a valid FoodConnect donation QR code."
            );
        }

        const scannedDonationId =
            Number(qrData.donationId);

        const expectedDonationId =
            Number(task.donation_id);

        if (
            !Number.isSafeInteger(scannedDonationId) ||
            scannedDonationId <= 0
        ) {

            throw new Error(
                "The QR code does not contain a valid donation ID."
            );
        }

        // Compare scanned donation against selected task.

        if (
            scannedDonationId !== expectedDonationId
        ) {

            throw new Error(
                "Donation mismatch! This QR code does not belong to the selected delivery task."
            );
        }

        if (message) {
            message.textContent =
                "Donation matched. Confirming pickup with the server...";
            message.className = "qr-message";
        }

        // Backend independently validates:
        // 1. Volunteer authentication and role.
        // 2. Delivery assignment.
        // 3. Donation ID belonging to that delivery.
        // 4. Delivery status being Accepted.

        const data = await apiRequest(
            `/${task.delivery_id}/pickup`,
            {
                method: "PATCH",

                body: JSON.stringify({
                    donationId: scannedDonationId
                })
            }
        );

        if (message) {
            message.textContent =
                data.message || "Pickup verified successfully.";
            message.className = "qr-message success";
        }

        showToast(
            data.message ||
            "QR verified. Pickup started successfully."
        );

        qrScanInProgress = false;

        // Reload delivery records after successful verification.

        await loadTasks();

        await loadVolunteerReports();

        setActiveTab("mine");

        // Keep the same task selected if it is still present.

        selectedId = task.delivery_id;

        renderList();
        renderDetail();

    } catch (error) {

        console.error("QR verification error:", error);

        qrScanInProgress = false;

        if (message) {
            message.textContent = error.message;
            message.className = "qr-message error";
        }

        showToast(error.message);
    }
}

// ==========================================
// REMOVE PREVIOUS MAP
// ==========================================

function destroyDeliveryMap() {

    if (deliveryMap) {
        deliveryMap.remove();
        deliveryMap = null;
    }

    mapMarkers = [];
    mapRouteLayers = [];
}

// ==========================================
// ADD MAP MARKER
// ==========================================

function addMapMarker(coordinates, title, color) {

    if (!deliveryMap || !coordinates) return;

    const marker = L.circleMarker(
        [
            coordinates.latitude,
            coordinates.longitude
        ],
        {
            radius: 9,
            color: "#ffffff",
            weight: 3,
            fillColor: color,
            fillOpacity: 1
        }
    ).addTo(deliveryMap);

    marker.bindPopup(
        `<strong>${escapeHTML(title)}</strong>`
    );

    mapMarkers.push(marker);

    return marker;
}

// ==========================================
// INITIALIZE DELIVERY MAP
// ==========================================

async function initializeDeliveryMap(task) {

    destroyDeliveryMap();

    const mapElement =
        document.getElementById("deliveryMap");

    const note =
        document.getElementById("mapRouteNote");

    if (!mapElement || typeof L === "undefined") {

        if (note) {
            note.textContent =
                "Map library could not be loaded. Check your internet connection.";
        }

        return;
    }

    const pickup = getPickupCoordinates(task);
    const dropoff = getDropCoordinates(task);

    const availablePoints = [
        pickup,
        dropoff,
        currentLocation
    ].filter(Boolean);

    if (availablePoints.length === 0) {

        mapElement.outerHTML = `
            <div class="map-unavailable" id="deliveryMap">
                <div>
                    <strong>Map locations unavailable</strong>

                    The delivery API has not returned valid GPS coordinates
                    for this task. Please check the pickup and NGO coordinates
                    in the delivery API response.
                </div>
            </div>
        `;

        if (note) {
            note.textContent =
                "No valid location coordinates were received.";
        }

        return;
    }

    deliveryMap = L.map("deliveryMap", {
        scrollWheelZoom: false
    });

    const activeMap = deliveryMap;

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
    ).addTo(deliveryMap);

    if (pickup) {
        addMapMarker(
            pickup,
            "Donor pickup location",
            "#159b68"
        );
    }

    if (dropoff) {
        addMapMarker(
            dropoff,
            "NGO delivery location",
            "#dc8a35"
        );
    }

    if (currentLocation) {
        addMapMarker(
            currentLocation,
            "Your current location",
            "#3277d5"
        );
    }

    const bounds = L.latLngBounds(
        availablePoints.map(point => [
            point.latitude,
            point.longitude
        ])
    );

    deliveryMap.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: 15
    });

    requestAnimationFrame(() => {

        if (deliveryMap === activeMap) {
            deliveryMap.invalidateSize();
        }
    });

    await drawAllDeliveryRoutes(
        currentLocation,
        pickup,
        dropoff,
        activeMap
    );
}

// ==========================================
// DRAW ALL THREE ROAD ROUTES USING OSRM
// ==========================================

async function drawAllDeliveryRoutes(
    volunteer,
    pickup,
    dropoff,
    activeMap
) {

    const note =
        document.getElementById("mapRouteNote");

    const distanceElements = {

        volunteerPickup: {
            distance: document.getElementById(
                "volunteerPickupDistance"
            ),

            time: document.getElementById(
                "volunteerPickupTime"
            )
        },

        volunteerDrop: {
            distance: document.getElementById(
                "volunteerDropDistance"
            ),

            time: document.getElementById(
                "volunteerDropTime"
            )
        },

        pickupDrop: {
            distance: document.getElementById(
                "pickupDropDistance"
            ),

            time: document.getElementById(
                "pickupDropTime"
            )
        }
    };

    function updateDistance(key, result) {

        const elements = distanceElements[key];

        if (!elements.distance || !elements.time) {
            return;
        }

        elements.distance.textContent =
            `${result.distanceKm.toFixed(1)} km`;

        elements.time.textContent =
            `Approx. ${result.durationMinutes} min driving`;
    }

    function updateUnavailable(key, message) {

        const elements = distanceElements[key];

        if (!elements.distance || !elements.time) {
            return;
        }

        elements.distance.textContent = "Unavailable";
        elements.time.textContent = message;
    }

    if (note) {
        note.textContent =
            "Calculating actual driving distances...";
    }

    const routeDefinitions = [

        {
            key: "volunteerPickup",
            start: volunteer,
            end: pickup,
            color: "#3277d5",
            label: "Volunteer to donor"
        },

        {
            key: "volunteerDrop",
            start: volunteer,
            end: dropoff,
            color: "#dc8a35",
            label: "Volunteer to NGO"
        },

        {
            key: "pickupDrop",
            start: pickup,
            end: dropoff,
            color: "#087b55",
            label: "Donor to NGO"
        }

    ];

    const results = await Promise.allSettled(

        routeDefinitions.map(async definition => {

            if (!definition.start || !definition.end) {
                throw new Error(
                    "Required GPS coordinates are missing."
                );
            }

            const route = await getOSRMRoute(
                definition.start,
                definition.end
            );

            return {
                ...definition,
                route
            };
        })
    );

    if (
        !deliveryMap ||
        deliveryMap !== activeMap
    ) {
        return;
    }

    const allRoutePoints = [];

    results.forEach((result, index) => {

        const definition = routeDefinitions[index];

        if (result.status === "rejected") {

            console.error(
                `${definition.label} route error:`,
                result.reason
            );

            updateUnavailable(
                definition.key,

                !definition.start || !definition.end
                    ? "GPS coordinates unavailable"
                    : "Road route unavailable"
            );

            return;
        }

        const route = result.value.route;

        updateDistance(
            definition.key,
            route
        );

        const routeLayer = L.polyline(
            route.coordinates,
            {
                color: definition.color,
                weight: 5,
                opacity: 0.85
            }
        ).addTo(deliveryMap);

        routeLayer.bindPopup(
            `<strong>${escapeHTML(definition.label)}</strong><br>` +
            `${route.distanceKm.toFixed(1)} km<br>` +
            `Approx. ${route.durationMinutes} min`
        );

        mapRouteLayers.push(routeLayer);

        allRoutePoints.push(
            ...route.coordinates
        );
    });

    if (
        allRoutePoints.length > 0 &&
        deliveryMap === activeMap
    ) {

        const routeBounds =
            L.latLngBounds(allRoutePoints);

        deliveryMap.fitBounds(
            routeBounds,
            { padding: [40, 40] }
        );
    }

    if (note) {

        const successfulRoutes =
            results.filter(
                result => result.status === "fulfilled"
            ).length;

        note.textContent =
            `${successfulRoutes} of 3 road routes calculated. ` +
            "Distances are based on OSRM driving routes.";
    }
}

// ==========================================
// UPDATE DELIVERY STATUS
// ==========================================

async function updateDelivery(id, action) {

    const endpoints = {

        accept: {
            url: `/${id}/accept`,
            method: "POST"
        },

        transit: {
            url: `/${id}/transit`,
            method: "PATCH"
        },

        complete: {
            url: `/${id}/complete`,
            method: "PATCH"
        }
    };

    const endpoint = endpoints[action];

    if (!endpoint) return;

    try {

        const data = await apiRequest(
            endpoint.url,
            {
                method: endpoint.method
            }
        );

        showToast(
            data.message ||
            "Delivery updated successfully."
        );

        await loadTasks();

        await loadVolunteerReports();

        if (action === "accept") {
            setActiveTab("mine");
        }

        if (action === "complete") {
            setActiveTab("completed");
        }

        renderList();
        renderDetail();

    } catch (error) {

        console.error(
            "Delivery update error:",
            error
        );

        showToast(error.message);
    }
}

// ==========================================
// TAB MANAGEMENT
// ==========================================

function setActiveTab(tabName) {

    activeTab = tabName;

    document.querySelectorAll(".tab").forEach(tab => {

        const active =
            tab.dataset.tab === tabName;

        tab.classList.toggle("active", active);

        tab.setAttribute(
            "aria-selected",
            String(active)
        );
    });
}

document.querySelectorAll(".tab").forEach(tab => {

    tab.addEventListener("click", () => {

        setActiveTab(tab.dataset.tab);

        const visible = getVisibleTasks();

        if (
            !visible.some(
                task =>
                    Number(task.delivery_id) ===
                    Number(selectedId)
            )
        ) {
            selectedId =
                visible[0]?.delivery_id || null;
        }

        renderList();
        renderDetail();
    });
});

// ==========================================
// SEARCH AND SORT
// ==========================================

searchInput.addEventListener("input", () => {
    renderList();
});

sortSelect.addEventListener("change", () => {
    renderList();
});

// ==========================================
// DATE FORMAT
// ==========================================

function formatDate(value) {

    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// ==========================================
// HTML ESCAPING
// ==========================================

function escapeHTML(value) {

    return String(value ?? "").replace(
        /[&<>"']/g,
        char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]
    );
}

// ==========================================
// TOAST NOTIFICATION
// ==========================================

function showToast(message) {

    const toast =
        document.getElementById("toast");

    if (!toast) return;

    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// ==========================================
// MOBILE NAVIGATION
// ==========================================

const mobileMenu =
    document.getElementById("mobileMenu");

if (mobileMenu) {

    mobileMenu.addEventListener("click", () => {

        document
            .querySelector(".main-nav")
            ?.classList.toggle("open");
    });
}

// ==========================================
// USE MY CURRENT LOCATION
// ==========================================

function useCurrentLocation() {

    if (!navigator.geolocation) {

        locationMessage.textContent =
            "Your browser does not support location services.";

        locationMessage.className =
            "location-message error";

        showToast(
            "Geolocation is not supported."
        );

        return;
    }

    locationButton.disabled = true;

    locationMessage.textContent =
        "Getting your current location...";

    locationMessage.className =
        "location-message";

    navigator.geolocation.getCurrentPosition(

        position => {

            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            locationMessage.textContent =
                "Location enabled. Actual road distances will be calculated for the selected task.";

            locationMessage.className =
                "location-message success";

            locationButton.disabled = false;

            updateTaskDistances();

            const availableTasks = tasks

                .filter(task =>
                    task.delivery_status === "Available" &&
                    task.volunteerDistanceKm !== null
                )

                .sort((a, b) =>
                    a.volunteerDistanceKm -
                    b.volunteerDistanceKm
                );

            if (availableTasks.length > 0) {

                selectedId =
                    availableTasks[0].delivery_id;
            }

            renderList();
            renderDetail();

            showToast(
                "Your location has been enabled."
            );
        },

        error => {

            locationButton.disabled = false;

            let message =
                "Unable to get your location.";

            if (error.code === 1) {
                message =
                    "Location permission denied. Allow location access in your browser.";
            }

            if (error.code === 2) {
                message =
                    "Your current location is unavailable.";
            }

            if (error.code === 3) {
                message =
                    "Location request timed out. Please try again.";
            }

            locationMessage.textContent = message;

            locationMessage.className =
                "location-message error";

            showToast(message);
        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 60000
        }
    );
}

// ==========================================
// LOCATION BUTTON EVENT
// ==========================================

if (locationButton) {

    locationButton.addEventListener(
        "click",
        useCurrentLocation
    );
}

// ==========================================
// INITIAL LOAD
// ==========================================

if (
    token &&
    user &&
    String(user.role).toUpperCase() === "VOLUNTEER"
) {

    loadTasks();

    loadVolunteerReports();
}
