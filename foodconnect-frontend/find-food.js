
const API_URL = "https://food-connect-qnuq.onrender.com/api";

const token =
    localStorage.getItem("token") ||
    sessionStorage.getItem("token");

const user = JSON.parse(
    localStorage.getItem("user") ||
    sessionStorage.getItem("user") ||
    "null"
);

const FALLBACK_IMAGE =
    "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85";

let donations = [];
let requests = [];

let currentLocation = null;
let selectedDonationId = null;

const grid = document.getElementById("donationGrid");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const distanceFilter = document.getElementById("distanceFilter");
const sortFilter = document.getElementById("sortFilter");
const vegOnlyFilter = document.getElementById("vegOnlyFilter");

const requestList = document.getElementById("requestList");
const requestsIntro = document.getElementById("requestsIntro");

const resultsCount = document.getElementById("resultsCount");
const emptyState = document.getElementById("emptyState");

const modal = document.getElementById("detailsModal");
const toast = document.getElementById("toast");

const locationButton = document.getElementById("useLocationBtn");
const locationMessage = document.getElementById("locationMessage");


// ==========================================
// GENERAL HELPERS
// ==========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}


function normalizeStatus(status) {
    return String(status || "").trim().toLowerCase();
}


function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}


function getExpiryInformation(expiryValue) {
    const expiryDate = new Date(expiryValue);

    if (Number.isNaN(expiryDate.getTime())) {
        return {
            hours: Infinity,
            label: "Expiry information unavailable",
            urgent: false
        };
    }

    const difference = expiryDate.getTime() - Date.now();

    const hours = Math.ceil(
        difference / (1000 * 60 * 60)
    );

    if (hours <= 0) {
        return {
            hours,
            label: "Expired",
            urgent: true
        };
    }

    if (hours < 24) {
        return {
            hours,
            label: `${hours} hours left`,
            urgent: hours <= 3
        };
    }

    const days = Math.ceil(hours / 24);

    return {
        hours,
        label: `${days} days left`,
        urgent: false
    };
}


function formatDistance(distance) {
    if (distance === null || distance === undefined) {
        return "Distance unavailable";
    }

    if (distance < 1) {
        return `${Math.round(distance * 1000)} m away`;
    }

    return `${distance.toFixed(1)} km away`;
}


// ==========================================
// VEGETARIAN FOOD DETECTION
// ==========================================

// This is a keyword-based estimate, not a verified
// ingredient check. Adjust the keywords to suit your
// project's vegetarian classification.

function detectVegetarianFood(name, category, details) {

    const foodText = `
        ${name || ""}
        ${category || ""}
        ${details || ""}
    `.toLowerCase();

    
}


// ==========================================
// DISTANCE CALCULATION
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
// READ DONATION COORDINATES
// ==========================================

function getDonationCoordinates(item) {

    const latitude =
        item.pickup_latitude ??
        item.latitude;

    const longitude =
        item.pickup_longitude ??
        item.longitude;

    if (
        latitude === null ||
        latitude === undefined ||
        longitude === null ||
        longitude === undefined
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
// LOAD AVAILABLE DONATIONS
// ==========================================

async function loadDonations() {

    try {

        const response = await fetch(
            `${API_URL}/donations/available`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load donations."
            );
        }

        donations = (data.donations || []).map(item => {

            const expiry = getExpiryInformation(
                item.expires_at
            );

            const coordinates =
                getDonationCoordinates(item);

            let photos = [];

            if (Array.isArray(item.photos)) {
                photos = item.photos.filter(
                    photo =>
                        typeof photo === "string" &&
                        photo.trim() !== ""
                );
            }

            const donation = {
                id: Number(item.id),

                title: item.food_name || "Food donation",

                donor: item.donor_name || "Food donor",

                category: item.category || "Other",

                quantity: `${item.quantity ?? ""} ${item.unit ?? ""}`.trim(),

                area: item.pickup_location || "Location not provided",

                latitude: coordinates?.latitude ?? null,

                longitude: coordinates?.longitude ?? null,

                distanceKm: null,

                hours: expiry.hours,

                expiry: expiry.label,

                urgent: expiry.urgent,

                image: photos[0] || FALLBACK_IMAGE,

                photos,

                description:
                    item.details ||
                    "No additional details provided.",

                // Vegetarian classification
                isVegetarian: detectVegetarianFood(
                    item.food_name,
                    item.category,
                    item.details
                ),

                createdAt: item.created_at,

                expiresAt: item.expires_at
            };

            if (currentLocation && coordinates) {

                donation.distanceKm = calculateDistance(
                    currentLocation.latitude,
                    currentLocation.longitude,
                    coordinates.latitude,
                    coordinates.longitude
                );

            }

            return donation;
        });

        renderDonations();

    } catch (error) {

        console.error("Load donations error:", error);

        resultsCount.textContent = "Unable to load donations";

        showToast(error.message);
    }
}


// ==========================================
// LOAD NGO REQUESTS
// ==========================================

async function loadRequests() {

    try {

        const response = await fetch(
            `${API_URL}/requests/my`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load requests."
            );
        }

        requests = data.requests || [];

        renderRequests();

    } catch (error) {

        console.error("Load requests error:", error);

        showToast(error.message);
    }
}


// ==========================================
// CHECK WHETHER DONATION IS ALREADY REQUESTED
// ==========================================

function isAlreadyRequested(donationId) {

    return requests.some(request => {

        const sameDonation =
            Number(request.donation_id) === Number(donationId);

        const status = normalizeStatus(
            request.request_status
        );

        return sameDonation &&
            !["cancelled", "rejected"].includes(status);
    });
}


// ==========================================
// FILTER DONATIONS
// ==========================================

function getFilteredDonations() {

    const search = searchInput.value
        .trim()
        .toLowerCase();

    const vegetarianOnly = vegOnlyFilter
        ? vegOnlyFilter.checked
        : false;

    let filtered = donations.filter(donation => {

        const matchesSearch =
            donation.title.toLowerCase().includes(search) ||
            donation.donor.toLowerCase().includes(search) ||
            donation.area.toLowerCase().includes(search) ||
            donation.category.toLowerCase().includes(search);

        const matchesCategory =
            categoryFilter.value === "all" ||
            donation.category === categoryFilter.value;

        let matchesDistance = true;

        if (distanceFilter.value !== "all") {

            const maximumDistance =
                Number(distanceFilter.value);

            matchesDistance =
                donation.distanceKm !== null &&
                donation.distanceKm <= maximumDistance;
        }

        // Vegetarian-only filter
        const matchesVegetarian =
            !vegetarianOnly || donation.isVegetarian;

        return (
            matchesSearch &&
            matchesCategory &&
            matchesDistance &&
            matchesVegetarian
        );
    });


    // SORT BY NEAREST

    if (sortFilter.value === "nearest") {

        filtered.sort((a, b) => {

            if (a.distanceKm === null) return 1;
            if (b.distanceKm === null) return -1;

            return a.distanceKm - b.distanceKm;
        });
    }


    // SORT BY EXPIRY

    if (sortFilter.value === "urgent") {

        filtered.sort(
            (a, b) => a.hours - b.hours
        );
    }


    // SORT BY NEWEST

    if (sortFilter.value === "newest") {

        filtered.sort(
            (a, b) =>
                new Date(b.createdAt || 0) -
                new Date(a.createdAt || 0)
        );
    }

    return filtered;
}


// ==========================================
// RENDER DONATION CARDS
// ==========================================

function renderDonations() {

    const filtered = getFilteredDonations();

    resultsCount.textContent =
        `${filtered.length} donation${filtered.length === 1 ? "" : "s"} found`;

    emptyState.hidden = filtered.length !== 0;

    grid.innerHTML = filtered.map(donation => {

        const alreadyRequested =
            isAlreadyRequested(donation.id);

        const title = escapeHTML(donation.title);
        const donor = escapeHTML(donation.donor);
        const category = escapeHTML(donation.category);
        const quantity = escapeHTML(donation.quantity);
        const area = escapeHTML(donation.area);
        const image = escapeHTML(donation.image);

        const expiryClass =
            donation.urgent ? "card-tag urgent" : "card-tag";

        const distanceText =
            donation.distanceKm !== null
                ? formatDistance(donation.distanceKm)
                : "Enable location for distance";

        return `
            <article class="donation-card">

                <div class="card-image-wrap">

                    <img
                        class="card-image"
                        src="${image}"
                        alt="${title}"
                        loading="lazy"
                    >

                    <span class="${expiryClass}">
                        ${donation.urgent ? "Expiring soon" : "Available"}
                    </span>

                </div>

                <div class="card-content">

                    <span class="card-category">
                        ${category}
                    </span>

                    <h3>${title}</h3>

                    <p class="donor-name">
                        Donated by ${donor}
                    </p>

                    <div class="card-meta">

                        <div class="meta-row">
                            <span class="meta-dot"></span>
                            <span>${quantity}</span>
                        </div>

                        <div class="meta-row">
                            <span class="meta-dot"></span>
                            <span>${area}</span>
                        </div>

                    </div>

                    <p class="card-expiry">
                        ${escapeHTML(donation.expiry)}
                    </p>

                    <p class="card-distance">
                        ${escapeHTML(distanceText)}
                    </p>

                    <div class="card-actions">

                        <button
                            type="button"
                            class="secondary-btn"
                            onclick="viewDetails(${donation.id})"
                        >
                            View details
                        </button>

                        <button
                            type="button"
                            class="request-btn"
                            onclick="requestFood(${donation.id})"
                            ${alreadyRequested ? "disabled" : ""}
                        >
                            ${alreadyRequested ? "Requested" : "Request food"}
                        </button>

                    </div>

                </div>

            </article>
        `;

    }).join("");


    // Replace unavailable uploaded images with fallback image.

    grid.querySelectorAll(".card-image").forEach(img => {

        img.addEventListener("error", function () {

            this.onerror = null;
            this.src = FALLBACK_IMAGE;

        });

    });
}


// ==========================================
// RENDER MY REQUESTS
// ==========================================

function renderRequests() {

    requestsIntro.hidden = requests.length > 0;

    requestList.innerHTML = requests.map(request => {

        const foodName =
            escapeHTML(request.food_name || "Food donation");

        const donorName =
            escapeHTML(request.donor_name || "Food donor");

        const status =
            request.request_status || "Requested";

        const statusText = escapeHTML(status);

        const normalizedStatus =
            normalizeStatus(status);

        const requestId =
            Number(request.request_id ?? request.id);

        const canCancel =
            normalizedStatus === "requested" &&
            Number.isFinite(requestId);

        return `
            <div class="request-item">

                <strong>${foodName}</strong>

                <span>
                    Donor: ${donorName}
                </span>

                <span class="request-status">
                    ${statusText}
                </span>

                ${
                    canCancel
                    ? `
                        <button
                            type="button"
                            class="cancel-request"
                            onclick="removeRequest(${requestId})"
                        >
                            Cancel request
                        </button>
                    `
                    : ""
                }

            </div>
        `;

    }).join("");

    renderDonations();
}


// ==========================================
// SUBMIT NGO FOOD REQUEST
// ==========================================

async function requestFood(id) {

    if (!token || normalizeStatus(user?.role) !== "ngo") {

        showToast("Please log in using an NGO account.");

        return false;
    }

    const donation = donations.find(
        item => item.id === Number(id)
    );

    if (!donation) return false;

    if (isAlreadyRequested(id)) {

        showToast("You have already requested this donation.");

        return false;
    }

    try {

        const response = await fetch(
            `${API_URL}/requests/${id}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.message || "Unable to submit request."
            );
        }

        showToast("Food request submitted successfully!");

        await loadRequests();

        return true;

    } catch (error) {

        console.error("Request food error:", error);

        showToast(error.message);

        return false;
    }
}


// ==========================================
// CANCEL REQUEST
// ==========================================

async function removeRequest(id) {

    if (!Number.isFinite(Number(id))) {
        showToast("Invalid request.");
        return;
    }

    try {

        const response = await fetch(
            `${API_URL}/requests/${id}/cancel`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.message || "Unable to cancel request."
            );
        }

        showToast("Request cancelled successfully!");

        await loadRequests();

    } catch (error) {

        console.error("Cancel request error:", error);

        showToast(error.message);
    }
}


// ==========================================
// VIEW DONATION DETAILS
// ==========================================

function viewDetails(id) {

    const donation = donations.find(
        item => item.id === Number(id)
    );

    if (!donation) return;

    selectedDonationId = donation.id;

    const modalImage =
        document.getElementById("modalImage");

    modalImage.src = donation.image;

    modalImage.onerror = function () {
        this.onerror = null;
        this.src = FALLBACK_IMAGE;
    };

    document.getElementById("modalTitle").textContent =
        donation.title;

    document.getElementById("modalDonor").textContent =
        `Donated by ${donation.donor}`;

    document.getElementById("modalDescription").textContent =
        donation.description;

    const facts = [
        donation.quantity,
        donation.category,
        donation.area,
        donation.expiry,
        donation.isVegetarian
            ? "Vegetarian (estimated)"
            : "Non-vegetarian keyword detected"
    ];

    if (donation.distanceKm !== null) {
        facts.push(formatDistance(donation.distanceKm));
    }

    document.getElementById("modalFacts").innerHTML =
        facts.map(fact => `
            <span>${escapeHTML(fact)}</span>
        `).join("");

    const modalButton =
        document.getElementById("modalRequestButton");

    const alreadyRequested =
        isAlreadyRequested(donation.id);

    modalButton.disabled = alreadyRequested;

    modalButton.textContent = alreadyRequested
        ? "Already requested"
        : "Request this food";

    modal.classList.add("show");

    document.body.style.overflow = "hidden";
}


// ==========================================
// CLOSE MODAL
// ==========================================

function closeModal() {

    modal.classList.remove("show");

    document.body.style.overflow = "";

    selectedDonationId = null;
}


document.getElementById("closeModal")
    .addEventListener("click", closeModal);


modal.addEventListener("click", event => {

    if (event.target === modal) {
        closeModal();
    }

});


document.addEventListener("keydown", event => {

    if (event.key === "Escape" && modal.classList.contains("show")) {
        closeModal();
    }

});


// ==========================================
// MODAL REQUEST BUTTON
// ==========================================

document.getElementById("modalRequestButton")
    .addEventListener("click", async () => {

        if (selectedDonationId === null) return;

        const success = await requestFood(selectedDonationId);

        if (success) {
            closeModal();
        }

    });


// ==========================================
// SEARCH AND FILTER EVENTS
// ==========================================

searchInput.addEventListener("input", renderDonations);

categoryFilter.addEventListener("change", renderDonations);

distanceFilter.addEventListener("change", () => {

    if (
        distanceFilter.value !== "all" &&
        !currentLocation
    ) {
        showToast("Use My Current Location before applying a distance filter.");
        distanceFilter.value = "all";
        return;
    }

    renderDonations();
});

sortFilter.addEventListener("change", renderDonations);


// Vegetarian-only filter event
if (vegOnlyFilter) {
    vegOnlyFilter.addEventListener("change", renderDonations);
}


// ==========================================
// CLEAR FILTERS
// ==========================================

function clearFilters() {

    searchInput.value = "";
    categoryFilter.value = "all";
    distanceFilter.value = "all";
    sortFilter.value = "nearest";

    if (vegOnlyFilter) {
        vegOnlyFilter.checked = false;
    }

    renderDonations();
}

document.getElementById("clearFiltersBtn")
    .addEventListener("click", clearFilters);

document.getElementById("emptyClearBtn")
    .addEventListener("click", clearFilters);


// ==========================================
// USE MY CURRENT LOCATION
// ==========================================

async function loadNGOLocation() {
    try {
        const response = await fetch(`${API_URL}/profile`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to load NGO location.");
        }

        const latitude = Number(data.user.latitude);
        const longitude = Number(data.user.longitude);

        if (
            data.user.latitude == null ||
            data.user.longitude == null ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            currentLocation = null;
            return false;
        }

        currentLocation = {
            latitude,
            longitude
        };

        return true;

    } catch (error) {
        console.error("NGO location error:", error);
        currentLocation = null;
        return false;
    }
}


locationButton.addEventListener(
    "click",
    useCurrentLocation
);


// ==========================================
// INITIALIZE SEARCH FOOD
// ==========================================

async function initializeFoodSearch() {

    if (!token || !user) {

        window.location.href = "login.html";

        return;
    }

    if (normalizeStatus(user.role) !== "ngo") {

        showToast("Please log in using an NGO account.");

        return;
    }

    await Promise.all([
        loadDonations(),
        loadRequests()
    ]);
}


initializeFoodSearch();
