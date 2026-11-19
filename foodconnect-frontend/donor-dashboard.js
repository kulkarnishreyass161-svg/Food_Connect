
document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // API CONFIGURATION
    // ==========================================

    const API_URL = "https://food-connect-qnuq.onrender.com/api/donations";
    const REQUESTS_API_URL = "https://food-connect-qnuq.onrender.com/api/requests";


    // ==========================================
    // AUTHENTICATION
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
        console.error("Unable to read user information:", error);
    }


    // ==========================================
    // HTML ELEMENTS
    // ==========================================

    const donorName = document.getElementById("donorName");
    const profileButton = document.getElementById("profileButton");

    const searchInput = document.getElementById("donationSearch");
    const statusFilter = document.getElementById("statusFilter");

    const donationRows = document.getElementById("donationRows");
    const emptyState = document.getElementById("emptyState");

    const incomingRequestList =
        document.getElementById("incomingRequestList");

    const toast = document.getElementById("toast");

    const statNumbers =
        document.querySelectorAll(".stat-number");


    // ==========================================
    // APPLICATION DATA
    // ==========================================

    let donations = [];


    // ==========================================
    // TOAST NOTIFICATION
    // ==========================================

    function showToast(message) {

        if (!toast) return;

        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(showToast.timeout);

        showToast.timeout = setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }


    // ==========================================
    // AUTHENTICATION CHECK
    // ==========================================

    if (!token) {

        if (donationRows) {
            donationRows.replaceChildren();
        }

        if (emptyState) {
            emptyState.hidden = false;
            emptyState.textContent =
                "Please sign in to view your donations.";
        }

        if (incomingRequestList) {
            incomingRequestList.textContent =
                "Please sign in to view incoming requests.";
        }

        statNumbers.forEach(number => {
            number.textContent = "0";
        });

        showToast("Please sign in to view your donor dashboard.");

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1500);

        return;
    }


    // ==========================================
    // ROLE CHECK
    // ==========================================

    if (
        !user ||
        !user.role ||
        user.role.toUpperCase() !== "DONOR"
    ) {
        window.location.href = "profile.html";
        return;
    }


    // ==========================================
    // DISPLAY DONOR INFORMATION
    // ==========================================

    if (user.name) {

        const firstName = user.name.trim().split(/\s+/)[0];

        if (donorName) {
            donorName.textContent = firstName;
        }

        if (profileButton) {
            profileButton.textContent =
                firstName.charAt(0).toUpperCase();
        }
    }


    // ==========================================
    // API RESPONSE HANDLER
    // ==========================================

    async function readResponse(response) {

        const text = await response.text();

        let data = {};

        try {
            data = text ? JSON.parse(text) : {};
        } catch (error) {
            throw new Error(
                "The server returned an invalid response. Check the API."
            );
        }

        if (!response.ok) {

            if (response.status === 401) {
                throw new Error(
                    "Your session has expired. Please sign in again."
                );
            }

            if (response.status === 403) {
                throw new Error(
                    "You are not authorized to perform this action."
                );
            }

            throw new Error(
                data.message || "Something went wrong."
            );
        }

        return data;
    }


    // ==========================================
    // COMMON API REQUEST
    // ==========================================

    async function apiRequest(url, options = {}) {

        const response = await fetch(url, {

            ...options,

            headers: {
                "Authorization": `Bearer ${token}`,

                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),

                ...options.headers
            }
        });

        return await readResponse(response);
    }


    // ==========================================
    // DATE FORMATTING
    // ==========================================

    function formatDate(dateValue) {

        if (!dateValue) {
            return "Not available";
        }

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return "Not available";
        }

        return date.toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }


    // ==========================================
    // LOAD DONOR STATISTICS
    // ==========================================

    async function loadStatistics() {

        const data = await apiRequest(
            `${API_URL}/dashboard`
        );

        const stats = data.stats || data;

        statNumbers[0].textContent =
            Number(stats.total_donations || 0);

        statNumbers[1].textContent =
            Number(stats.meals_shared || 0);

        statNumbers[2].textContent =
            Number(stats.active_donations || 0);

        statNumbers[3].textContent =
            Number(stats.completed_donations || 0);
    }


    // ==========================================
    // CREATE DONATION TABLE ROW
    // ==========================================

    function createDonationRow(donation) {

        const row = document.createElement("tr");

        row.dataset.status = donation.status || "";


        // FOOD NAME

        const foodCell = document.createElement("td");
        foodCell.className = "food-cell";

        const foodName = document.createElement("strong");

        foodName.textContent =
            donation.food_name || "Unnamed donation";

        const category = document.createElement("small");

        category.textContent =
            donation.category || "";

        foodCell.append(foodName, category);


        // QUANTITY

        const quantityCell = document.createElement("td");

        quantityCell.textContent =
            `${donation.quantity ?? 0} ${donation.unit || ""}`;


        // PICKUP / EXPIRY DATE

        const dateCell = document.createElement("td");

        const expiryText = document.createElement("span");

        expiryText.textContent =
            `Expires: ${formatDate(donation.expires_at)}`;

        dateCell.appendChild(expiryText);


        // STATUS

        const statusCell = document.createElement("td");

        const statusBadge = document.createElement("span");

        statusBadge.className =
            "status-badge status-" +
            String(donation.status || "unknown")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-");

        statusBadge.textContent =
            donation.status || "Unknown";

        statusCell.appendChild(statusBadge);


        // ACTIONS

        const actionCell = document.createElement("td");


        // VIEW BUTTON

        const viewButton = document.createElement("button");

        viewButton.type = "button";
        viewButton.className = "more-btn";
        viewButton.textContent = "View";

        viewButton.addEventListener("click", () => {

            alert(
                `DONATION DETAILS\n\n` +
                `Food: ${donation.food_name || "N/A"}\n` +
                `Category: ${donation.category || "N/A"}\n` +
                `Quantity: ${donation.quantity || 0} ${donation.unit || ""}\n` +
                `Prepared: ${formatDate(donation.prepared_at)}\n` +
                `Expires: ${formatDate(donation.expires_at)}\n` +
                `Pickup Location: ${donation.pickup_location || "N/A"}\n` +
                `Details: ${donation.details || "No additional details"}\n` +
                `Status: ${donation.status || "Unknown"}\n` +
                `Donation ID: ${donation.id}`
            );

        });

        actionCell.appendChild(viewButton);


        // EDIT AND CANCEL BUTTONS

        if (donation.status === "Available") {

            // EDIT BUTTON

            const editButton = document.createElement("button");

            editButton.type = "button";
            editButton.className = "more-btn";
            editButton.textContent = "Edit";

            editButton.addEventListener("click", () => {

                window.location.href =
                    `edit-donation.html?id=${encodeURIComponent(donation.id)}`;

            });

            actionCell.appendChild(editButton);


            // CANCEL BUTTON

            const cancelButton = document.createElement("button");

            cancelButton.type = "button";
            cancelButton.className = "more-btn";
            cancelButton.textContent = "Cancel";

            cancelButton.addEventListener("click", async () => {

                const confirmed = window.confirm(
                    `Are you sure you want to cancel "${donation.food_name}"?`
                );

                if (!confirmed) return;

                try {

                    cancelButton.disabled = true;
                    cancelButton.textContent = "Cancelling...";

                    await apiRequest(
                        `${API_URL}/${encodeURIComponent(donation.id)}/cancel`,
                        {
                            method: "PATCH"
                        }
                    );

                    showToast(
                        "Donation cancelled successfully!"
                    );

                    await refreshDashboard();

                } catch (error) {

                    console.error(
                        "Cancel donation error:",
                        error
                    );

                    showToast(error.message);

                    cancelButton.disabled = false;
                    cancelButton.textContent = "Cancel";
                }

            });

            actionCell.appendChild(cancelButton);
        }


        row.append(
            foodCell,
            quantityCell,
            dateCell,
            statusCell,
            actionCell
        );

        return row;
    }


    // ==========================================
    // DISPLAY DONATIONS
    // ==========================================

    function displayDonations() {

        const searchTerm =
            searchInput.value.trim().toLowerCase();

        const selectedStatus = statusFilter.value;


        const filteredDonations = donations.filter(donation => {

            const matchesSearch =
                (donation.food_name || "")
                    .toLowerCase()
                    .includes(searchTerm) ||

                (donation.category || "")
                    .toLowerCase()
                    .includes(searchTerm);

            const matchesStatus =
                selectedStatus === "all" ||
                donation.status === selectedStatus;

            return matchesSearch && matchesStatus;
        });


        donationRows.replaceChildren();

        filteredDonations.forEach(donation => {

            donationRows.appendChild(
                createDonationRow(donation)
            );

        });


        emptyState.hidden =
            filteredDonations.length !== 0;

        if (filteredDonations.length === 0) {

            emptyState.textContent =
                donations.length === 0
                    ? "You haven't created any donations yet."
                    : "No donations match your search.";
        }
    }


    // ==========================================
    // LOAD DONOR DONATIONS
    // ==========================================

    async function loadDonations() {

        const data = await apiRequest(
            `${API_URL}/my`
        );

        donations = Array.isArray(data.donations)
            ? data.donations
            : Array.isArray(data)
                ? data
                : [];

        displayDonations();
    }


    // ==========================================
    // LOAD INCOMING NGO REQUESTS
    // ==========================================

    async function loadIncomingRequests() {

        try {

            const data = await apiRequest(
                `${REQUESTS_API_URL}/received`
            );

            incomingRequestList.replaceChildren();

            const requests = Array.isArray(data.requests)
                ? data.requests
                : Array.isArray(data)
                    ? data
                    : [];


            if (requests.length === 0) {

                incomingRequestList.textContent =
                    "No incoming requests yet.";

                return;
            }


            requests.forEach(request => {

                const card = document.createElement("div");

                card.className = "request-card";


                // REQUEST DETAILS

                const details = document.createElement("div");

                details.className = "request-details";


                const foodName = document.createElement("h3");

                foodName.textContent =
                    request.food_name || "Food donation";


                const ngoName = document.createElement("p");

                ngoName.textContent =
                    `NGO: ${request.ngo_name || "Not available"}`;


                const quantity = document.createElement("p");

                quantity.textContent =
                    `Quantity: ${request.quantity ?? 0} ${request.unit || ""}`;


                const location = document.createElement("p");

                location.textContent =
                    `Pickup location: ${request.pickup_location || "Not available"}`;


                const status = document.createElement("p");

                status.textContent =
                    `Request status: ${request.request_status || "Unknown"}`;

                status.className = "request-status";


                details.append(
                    foodName,
                    ngoName,
                    quantity,
                    location,
                    status
                );

                card.appendChild(details);


                // ACTION BUTTONS FOR PENDING REQUESTS

                if (request.request_status === "Requested") {

                    const actions = document.createElement("div");

                    actions.className = "request-actions";


                    // APPROVE

                    const acceptBtn = document.createElement("button");

                    acceptBtn.type = "button";
                    acceptBtn.textContent = "Accept";
                    acceptBtn.className = "approve-btn";

                    acceptBtn.addEventListener("click", () => {

                        processRequest(
                            request.request_id,
                            "approve"
                        );

                    });


                    // REJECT

                    const rejectBtn = document.createElement("button");

                    rejectBtn.type = "button";
                    rejectBtn.textContent = "Reject";
                    rejectBtn.className = "reject-btn";

                    rejectBtn.addEventListener("click", () => {

                        processRequest(
                            request.request_id,
                            "reject"
                        );

                    });


                    actions.append(acceptBtn, rejectBtn);

                    card.appendChild(actions);
                }


                incomingRequestList.appendChild(card);

            });

        } catch (error) {

            console.error(
                "Incoming requests error:",
                error
            );

            incomingRequestList.textContent =
                error.message;
        }
    }


    // ==========================================
    // APPROVE OR REJECT NGO REQUEST
    // ==========================================

    async function processRequest(requestId, action) {

        const confirmation = action === "approve"
            ? "Are you sure you want to accept this NGO request?"
            : "Are you sure you want to reject this NGO request?";

        if (!window.confirm(confirmation)) {
            return;
        }


        try {

            const data = await apiRequest(
                `${REQUESTS_API_URL}/${encodeURIComponent(requestId)}/${action}`,
                {
                    method: "PATCH"
                }
            );

            showToast(
                data.message ||
                `Request ${action === "approve" ? "approved" : "rejected"} successfully.`
            );

            await refreshDashboard();

        } catch (error) {

            console.error(
                "Request processing error:",
                error
            );

            showToast(error.message);
        }
    }


    // ==========================================
    // MY REPORTS NAVIGATION
    // ==========================================

    // The HTML anchor already navigates to reports.html.
    // The reports page loads its own summary and detailed data.

    const reportsLink = document.querySelector(
        '.quick-action[href="reports.html"]'
    );

    if (reportsLink) {

        reportsLink.addEventListener("click", () => {

            console.log(
                "Opening donor reports."
            );

        });
    }


    // ==========================================
    // REFRESH DASHBOARD
    // ==========================================

    async function refreshDashboard() {

        await Promise.all([
            loadStatistics(),
            loadDonations(),
            loadIncomingRequests()
        ]);
    }


    // ==========================================
    // SEARCH AND FILTER EVENTS
    // ==========================================

    searchInput.addEventListener(
        "input",
        displayDonations
    );

    statusFilter.addEventListener(
        "change",
        displayDonations
    );


    // ==========================================
    // PROFILE NAVIGATION
    // ==========================================

    profileButton.addEventListener("click", () => {

        window.location.href = "profile.html";

    });


    // ==========================================
    // INITIAL DASHBOARD LOAD
    // ==========================================

    try {

        await refreshDashboard();

        console.log(
            "FoodConnect donor dashboard loaded successfully."
        );

    } catch (error) {

        console.error(
            "Dashboard loading error:",
            error
        );

        showToast(error.message);

        if (
            error.message.toLowerCase().includes("session has expired") ||
            error.message.toLowerCase().includes("unauthorized")
        ) {

            setTimeout(() => {
                window.location.href = "login.html";
            }, 1500);
        }
    }

});
