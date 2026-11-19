
import QRCode from "https://esm.sh/qrcode@1.5.4";

// Handle different module export formats
const QR = QRCode?.default ?? QRCode;

console.log("FoodConnect QR module:", QR);
console.log("QR toCanvas:", typeof QR?.toCanvas);

document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // API CONFIGURATION
    // ==========================================

    const API_URL = "http://localhost:5000/api/requests";


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

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    if (
        user &&
        user.role &&
        user.role.toUpperCase() !== "NGO"
    ) {
        window.location.href = "profile.html";
        return;
    }


    // ==========================================
    // HTML ELEMENTS
    // ==========================================

    const requestGrid =
        document.getElementById("requestGrid");

    const loadingMessage =
        document.getElementById("loadingMessage");

    const emptyState =
        document.getElementById("emptyState");

    const statusFilter =
        document.getElementById("statusFilter");

    const toast =
        document.getElementById("toast");

    const totalRequests =
        document.getElementById("totalRequests");

    const pendingRequests =
        document.getElementById("pendingRequests");

    const approvedRequests =
        document.getElementById("approvedRequests");

    const cancelledRequests =
        document.getElementById("cancelledRequests");


    // ==========================================
    // APPLICATION DATA
    // ==========================================

    let requests = [];

    let toastTimer = null;

    let isLoading = false;


    // ==========================================
    // TOAST NOTIFICATION
    // ==========================================

    function showToast(message) {

        if (!toast) return;

        toast.textContent = message;

        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3200);
    }


    // ==========================================
    // DATE FORMATTING
    // ==========================================

    function formatDate(value) {

        if (!value) {
            return "Not available";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Not available";
        }

        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }


    // ==========================================
    // CREATE HTML ELEMENT
    // ==========================================

    function createElement(tag, className, text) {

        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = text;
        }

        return element;
    }


    // ==========================================
    // READ API RESPONSE
    // ==========================================

    async function readResponse(response) {

        const responseText = await response.text();

        let data = {};

        try {

            data = responseText
                ? JSON.parse(responseText)
                : {};

        } catch (error) {

            throw new Error(
                "The server returned an invalid response."
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
    // LOAD MY REQUESTS
    // ==========================================

    async function loadMyRequests(silent = false) {

        if (isLoading) {
            return;
        }

        isLoading = true;

        if (!silent) {

            loadingMessage.hidden = false;

            loadingMessage.textContent =
                "Loading your requests...";

            requestGrid.replaceChildren();

            emptyState.hidden = true;
        }

        try {

            const data = await apiRequest(
                `${API_URL}/my`
            );

            requests = Array.isArray(data.requests)
                ? data.requests
                : Array.isArray(data)
                    ? data
                    : [];

            updateStatistics();

            await displayRequests();

            if (!silent) {
                loadingMessage.textContent = "";
            }

        } catch (error) {

            console.error(
                "Load requests error:",
                error
            );

            if (
                error.message.includes("session has expired") ||
                error.message.includes("authorized")
            ) {

                showToast(error.message);

                if (
                    error.message.includes("session has expired")
                ) {

                    setTimeout(() => {
                        window.location.href = "login.html";
                    }, 1500);
                }

            } else if (!silent) {

                showToast(error.message);

                loadingMessage.textContent =
                    error.message;
            }

        } finally {

            if (!silent) {
                loadingMessage.hidden = true;
            }

            isLoading = false;
        }
    }


    // ==========================================
    // UPDATE SUMMARY STATISTICS
    // ==========================================

    function updateStatistics() {

        const total = requests.length;

        const pending = requests.filter(
            request =>
                request.request_status === "Requested"
        ).length;

        const approved = requests.filter(
            request =>
                request.request_status === "Approved"
        ).length;

        const cancelled = requests.filter(
            request =>
                request.request_status === "Cancelled"
        ).length;

        totalRequests.textContent = total;

        pendingRequests.textContent = pending;

        approvedRequests.textContent = approved;

        cancelledRequests.textContent = cancelled;
    }


    // ==========================================
    // GENERATE QR CODE INSIDE REQUEST CARD
    // ==========================================

    async function addRequestQR(card, request) {

        // QR codes are only displayed for approved requests
        if (request.request_status !== "Approved") {
            return;
        }

        // Check QR library
        if (
            !QR ||
            typeof QR.toCanvas !== "function"
        ) {

            console.error(
                "QR Code generation function is unavailable."
            );

            card.appendChild(
                createElement(
                    "p",
                    "qr-error",
                    "QR code library could not be loaded."
                )
            );

            return;
        }


        // Extract donation ID
        const donationId =
            request.donation_id ??
            request.donationId ??
            request.donation?.id;

        if (
            donationId === null ||
            donationId === undefined ||
            !Number.isSafeInteger(Number(donationId)) ||
            Number(donationId) <= 0
        ) {

            console.warn(
                "Approved request has an invalid donation ID:",
                request
            );

            card.appendChild(
                createElement(
                    "p",
                    "qr-error",
                    "Donation QR code is unavailable because the donation ID is missing."
                )
            );

            return;
        }

        const numericDonationId = Number(donationId);


        // ======================================
        // QR SECTION
        // ======================================

        const qrSection = createElement(
            "div",
            "request-qr-section"
        );

        const qrHeading = createElement(
            "h4",
            "",
            "Donation QR Code"
        );

        const qrDescription = createElement(
            "p",
            "qr-description",
            "Show this QR code for volunteer pickup verification."
        );

        const qrContainer = createElement(
            "div",
            "request-qr-image"
        );

        const idText = createElement(
            "p",
            "qr-donation-id",
            `Donation ID: ${numericDonationId}`
        );

        const downloadButton = createElement(
            "button",
            "action-btn qr-download-btn",
            "Download QR Code"
        );

        downloadButton.type = "button";

        downloadButton.disabled = true;

        const canvas = document.createElement("canvas");


        // Add section to request card
        qrSection.append(
            qrHeading,
            qrDescription,
            qrContainer,
            idText,
            downloadButton
        );

        card.appendChild(qrSection);


        // ======================================
        // QR DATA
        // Must match donation.js and volunteer scanner
        // ======================================

        const qrData = JSON.stringify({

            type: "FOODCONNECT_DONATION",

            donationId: numericDonationId

        });


        // ======================================
        // GENERATE QR CODE
        // ======================================

        try {

            await QR.toCanvas(canvas, qrData, {

                width: 200,

                margin: 2,

                errorCorrectionLevel: "H"

            });

            qrContainer.appendChild(canvas);

            downloadButton.disabled = false;


            // ==================================
            // DOWNLOAD QR CODE
            // ==================================

            downloadButton.addEventListener(
                "click",
                () => {

                    const link =
                        document.createElement("a");

                    link.href =
                        canvas.toDataURL("image/png");

                    link.download =
                        `FoodConnect-Donation-${numericDonationId}.png`;

                    document.body.appendChild(link);

                    link.click();

                    link.remove();

                }
            );

        } catch (error) {

            console.error(
                "QR generation failed:",
                error
            );

            qrContainer.appendChild(
                createElement(
                    "p",
                    "qr-error",
                    "Unable to generate QR code."
                )
            );

            downloadButton.remove();
        }
    }


    // ==========================================
    // DISPLAY REQUESTS
    // ==========================================

    async function displayRequests() {

        requestGrid.replaceChildren();

        const selectedStatus = statusFilter.value;

        const filteredRequests = requests.filter(request => {

            return selectedStatus === "all" ||
                request.request_status === selectedStatus;

        });


        if (filteredRequests.length === 0) {

            emptyState.hidden = false;

            const heading =
                emptyState.querySelector("h2");

            const paragraph =
                emptyState.querySelector("p");

            if (selectedStatus === "all") {

                heading.textContent = "No requests found";

                paragraph.textContent =
                    "You haven't requested any donations yet.";

            } else {

                heading.textContent =
                    "No matching requests";

                paragraph.textContent =
                    `You don't have any ${selectedStatus.toLowerCase()} requests.`;
            }

            return;
        }


        emptyState.hidden = true;


        // Generate each request card
        for (const request of filteredRequests) {

            const card = await createRequestCard(request);

            requestGrid.appendChild(card);
        }
    }


    // ==========================================
    // CREATE REQUEST CARD
    // ==========================================

    async function createRequestCard(request) {

        const card = createElement(
            "article",
            "request-card"
        );


        // ======================================
        // REQUEST HEADING
        // ======================================

        const top = createElement(
            "div",
            "request-top"
        );

        const heading = createElement(
            "h3",
            "",
            request.food_name || "Food donation"
        );


        // ======================================
        // STATUS BADGE
        // ======================================

        const statusClasses = {

            Requested: "status-requested",

            Approved: "status-approved",

            Rejected: "status-rejected",

            Cancelled: "status-cancelled"
        };

        const statusClass =
            statusClasses[request.request_status] ||
            "status-cancelled";

        const status = createElement(
            "span",
            `status ${statusClass}`,
            request.request_status || "Unknown"
        );

        top.append(heading, status);

        card.appendChild(top);


        // ======================================
        // REQUEST DETAILS
        // ======================================

        const details = [

            `Category: ${request.category || "Not specified"}`,

            `Quantity: ${request.quantity ?? 0} ${request.unit || ""}`,

            `Donor: ${request.donor_name || "Not available"}`,

            `Pickup location: ${request.pickup_location || "Not available"}`,

            `Requested on: ${formatDate(request.requested_at)}`,

            `Expiry: ${formatDate(request.expires_at)}`

        ];

        details.forEach(detail => {

            card.appendChild(
                createElement("p", "", detail)
            );

        });


        // ======================================
        // QR CODE FOR APPROVED REQUESTS
        // ======================================

        await addRequestQR(card, request);


        // ======================================
        // REQUEST ACTIONS
        // ======================================

        const actions = createElement(
            "div",
            "request-actions"
        );


        // ======================================
        // CANCEL PENDING REQUEST
        // ======================================

        if (request.request_status === "Requested") {

            const cancelButton = createElement(
                "button",
                "action-btn cancel-btn",
                "Cancel Request"
            );

            cancelButton.type = "button";

            cancelButton.dataset.action = "cancel";

            cancelButton.dataset.requestId =
                request.request_id;

            actions.appendChild(cancelButton);
        }


        // ======================================
        // REQUEST AGAIN
        // ======================================

        const canRequestAgain =

            request.request_status === "Cancelled" &&

            request.donation_status === "Available" &&

            request.expires_at &&

            new Date(request.expires_at) > new Date();


        if (canRequestAgain) {

            const againButton = createElement(
                "button",
                "action-btn again-btn",
                "Request Again"
            );

            againButton.type = "button";

            againButton.dataset.action = "again";

            againButton.dataset.donationId =
                request.donation_id;

            actions.appendChild(againButton);
        }


        if (actions.children.length > 0) {
            card.appendChild(actions);
        }

        return card;
    }


    // ==========================================
    // CANCEL REQUEST
    // ==========================================

    async function cancelRequest(requestId, button) {

        const confirmed = window.confirm(
            "Are you sure you want to cancel this food request?"
        );

        if (!confirmed) {
            return;
        }

        try {

            button.disabled = true;

            button.textContent = "Cancelling...";

            const data = await apiRequest(

                `${API_URL}/${encodeURIComponent(requestId)}/cancel`,

                {
                    method: "PATCH"
                }
            );

            showToast(
                data.message ||
                "Request cancelled successfully."
            );

            await loadMyRequests();

        } catch (error) {

            console.error(
                "Cancel request error:",
                error
            );

            showToast(error.message);

            button.disabled = false;

            button.textContent = "Cancel Request";
        }
    }


    // ==========================================
    // REQUEST DONATION AGAIN
    // ==========================================

    async function requestAgain(donationId, button) {

        const confirmed = window.confirm(
            "Do you want to request this donation again?"
        );

        if (!confirmed) {
            return;
        }

        try {

            button.disabled = true;

            button.textContent = "Requesting...";

            const data = await apiRequest(

                `${API_URL}/${encodeURIComponent(donationId)}`,

                {
                    method: "POST"
                }
            );

            showToast(
                data.message ||
                "Donation requested successfully."
            );

            await loadMyRequests();

        } catch (error) {

            console.error(
                "Re-request error:",
                error
            );

            showToast(error.message);

            button.disabled = false;

            button.textContent = "Request Again";
        }
    }


    // ==========================================
    // HANDLE REQUEST BUTTONS
    // ==========================================

    requestGrid.addEventListener("click", event => {

        const button = event.target.closest(
            "button[data-action]"
        );

        if (!button || button.disabled) {
            return;
        }

        const action = button.dataset.action;


        if (action === "cancel") {

            cancelRequest(
                button.dataset.requestId,
                button
            );
        }


        if (action === "again") {

            requestAgain(
                button.dataset.donationId,
                button
            );
        }
    });


    // ==========================================
    // FILTER REQUESTS
    // ==========================================

    statusFilter.addEventListener(
        "change",
        () => {
            displayRequests().catch(error => {
                console.error("Request filtering failed:", error);
            });
        }
    );


    // ==========================================
    // INITIAL LOAD
    // ==========================================

    await loadMyRequests();


    // ==========================================
    // AUTOMATIC REQUEST REFRESH
    // ==========================================

    setInterval(() => {

        if (!document.hidden) {
            loadMyRequests(true);
        }

    }, 5000);


    console.log(
        "FoodConnect NGO request dashboard loaded successfully."
    );

});
