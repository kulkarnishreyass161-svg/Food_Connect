
// ==========================================
// FOODCONNECT - DONATION MODULE
// ==========================================

import { upload } from "https://esm.sh/@imagekit/javascript@5.0.0";
import QRCode from "https://esm.sh/qrcode@1.5.4";

const API_URL = "http://localhost:5000/api";

// ==========================================
// FORM ELEMENTS
// ==========================================

const form = document.getElementById("foodDonationForm");

const foodName = document.getElementById("foodName");
const category = document.getElementById("category");
const quantity = document.getElementById("quantity");
const unit = document.getElementById("unit");

const pickupLocation = document.getElementById("pickupLocation");

const preparedAt = document.getElementById("preparedAt");
const expiresAt = document.getElementById("expiresAt");

const details = document.getElementById("details");

const foodPhotos = document.getElementById("foodPhotos");
const photoPreview = document.getElementById("photoPreview");

const formError = document.getElementById("formError");
const toast = document.getElementById("toast");

const previewImage = document.getElementById("previewImage");
const previewImageWrap = document.getElementById("previewImageWrap");
const qrCard = document.getElementById("qrCard");
const donationQRCode = document.getElementById("donationQRCode");
const qrDonationId = document.getElementById("qrDonationId");
const downloadQR = document.getElementById("downloadQR");

// LOCATION ELEMENTS

const shareLocationBtn = document.getElementById("shareLocationBtn");
const locationMessage = document.getElementById("locationMessage");

// ==========================================
// AUTHENTICATION
// ==========================================

function getToken() {
    return (
        localStorage.getItem("token") ||
        sessionStorage.getItem("token")
    );
}

// ==========================================
// VARIABLES
// ==========================================

let currentPreviewUrl = null;

let selectedPhotos = [];

let thumbnailUrls = [];

let toastTimer;

let pickupLatitude = null;
let pickupLongitude = null;

// ==========================================
// TOAST MESSAGE
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

    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString([], {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });

}

// ==========================================
// UPDATE DONATION PREVIEW
// ==========================================

function updatePreview() {

    document.getElementById("previewName").textContent =
        foodName.value.trim() || "Your food donation";

    const qty = quantity.value.trim();

    document.getElementById("previewQuantity").textContent =
        qty ? `${qty} ${unit.value}` : "Quantity to be added";

    document.getElementById("previewLocation").textContent =
        pickupLocation.value.trim() || "Pickup location to be added";

    document.getElementById("previewPrepared").textContent =
        preparedAt.value
            ? `Prepared: ${formatDate(preparedAt.value)}`
            : "Preparation time to be added";

    document.getElementById("previewExpiry").textContent =
        expiresAt.value
            ? `Expires: ${formatDate(expiresAt.value)}`
            : "Expiry time to be added";

}

// Update preview whenever fields change

[
    foodName,
    quantity,
    unit,
    pickupLocation,
    preparedAt,
    expiresAt
].forEach(field => {

    field.addEventListener("input", updatePreview);

    field.addEventListener("change", updatePreview);

});

// ==========================================
// DONOR LOCATION
// ==========================================

function resetPickupCoordinates() {

    pickupLatitude = null;
    pickupLongitude = null;

    if (shareLocationBtn) {

        shareLocationBtn.disabled = false;

        shareLocationBtn.textContent =
            "Use My Current Location";

    }

    if (locationMessage) {

        locationMessage.textContent =
            "Share your location to help volunteers find the food.";

        locationMessage.className = "location-message";

    }

}

// Reset coordinates if pickup address changes

pickupLocation.addEventListener("input", () => {

    if (
        pickupLatitude !== null ||
        pickupLongitude !== null
    ) {

        resetPickupCoordinates();

        if (locationMessage) {

            locationMessage.textContent =
                "Pickup address changed. Please share your location again if needed.";

        }

    }

});

// ==========================================
// SHARE CURRENT LOCATION
// ==========================================

if (shareLocationBtn) {

    shareLocationBtn.addEventListener("click", () => {

        if (!navigator.geolocation) {

            locationMessage.textContent =
                "Geolocation is not supported by your browser.";

            locationMessage.className =
                "location-message error";

            return;

        }

        shareLocationBtn.disabled = true;

        shareLocationBtn.textContent = "Getting location...";

        locationMessage.textContent =
            "Please allow location access in your browser.";

        locationMessage.className = "location-message";

        navigator.geolocation.getCurrentPosition(

            position => {

                pickupLatitude = position.coords.latitude;

                pickupLongitude = position.coords.longitude;

                locationMessage.textContent =
                    "Your pickup coordinates have been captured successfully.";

                locationMessage.className =
                    "location-message success";

                shareLocationBtn.textContent =
                    "Location Captured";

                shareLocationBtn.disabled = false;

                console.log("Pickup Latitude:", pickupLatitude);

                console.log("Pickup Longitude:", pickupLongitude);

            },

            error => {

                let message =
                    "Unable to retrieve your location.";

                if (error.code === 1) {

                    message =
                        "Location permission denied. Please allow location access.";

                } else if (error.code === 2) {

                    message =
                        "Your current location is unavailable.";

                } else if (error.code === 3) {

                    message =
                        "Location request timed out. Please try again.";

                }

                locationMessage.textContent = message;

                locationMessage.className =
                    "location-message error";

                shareLocationBtn.textContent =
                    "Use My Current Location";

                shareLocationBtn.disabled = false;

            },

            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }

        );

    });

}

// ==========================================
// FOOD PHOTO PREVIEW
// ==========================================

function clearPreviewUrls() {

    if (currentPreviewUrl) {

        URL.revokeObjectURL(currentPreviewUrl);

        currentPreviewUrl = null;

    }

    thumbnailUrls.forEach(url => {
        URL.revokeObjectURL(url);
    });

    thumbnailUrls = [];

}


function renderPhotoPreviews() {

    photoPreview.replaceChildren();

    clearPreviewUrls();

    // Display first selected photo in main preview

    if (selectedPhotos.length > 0) {

        currentPreviewUrl =
            URL.createObjectURL(selectedPhotos[0]);

        previewImage.src = currentPreviewUrl;

        previewImageWrap.hidden = false;

    } else {

        previewImage.removeAttribute("src");

        previewImageWrap.hidden = true;

    }

    // Display photo thumbnails

    selectedPhotos.forEach((file, index) => {

        const wrapper = document.createElement("div");

        wrapper.className = "photo-thumb";

        const image = document.createElement("img");

        const thumbnailUrl = URL.createObjectURL(file);

        thumbnailUrls.push(thumbnailUrl);

        image.src = thumbnailUrl;

        image.alt = `Food photo ${index + 1}`;

        const removeButton = document.createElement("button");

        removeButton.type = "button";

        removeButton.textContent = "×";

        removeButton.setAttribute(
            "aria-label",
            `Remove photo ${index + 1}`
        );

        removeButton.addEventListener("click", () => {

            selectedPhotos.splice(index, 1);

            syncFileInput();

            renderPhotoPreviews();

        });

        wrapper.append(image, removeButton);

        photoPreview.append(wrapper);

    });

}

// ==========================================
// SYNCHRONIZE FILE INPUT
// ==========================================

function syncFileInput() {

    const transfer = new DataTransfer();

    selectedPhotos.forEach(file => {
        transfer.items.add(file);
    });

    foodPhotos.files = transfer.files;

}

// ==========================================
// HANDLE FOOD PHOTO SELECTION
// ==========================================

foodPhotos.addEventListener("change", () => {

    const incoming = Array.from(foodPhotos.files);

    const combined = [
        ...selectedPhotos,
        ...incoming
    ];

    // Avoid duplicate files

    const uniquePhotos = combined.filter((file, index, array) => {

        return array.findIndex(item =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified
        ) === index;

    });

    // Maximum four photos

    if (uniquePhotos.length > 4) {

        formError.textContent =
            "You can upload a maximum of 4 photos.";

        syncFileInput();

        return;

    }

    // Maximum file size: 5 MB

    const tooLarge = uniquePhotos.find(
        file => file.size > 5 * 1024 * 1024
    );

    if (tooLarge) {

        formError.textContent =
            `"${tooLarge.name}" is larger than 5 MB.`;

        syncFileInput();

        return;

    }

    // Allowed image formats

    const invalidType = uniquePhotos.find(file =>
        ![
            "image/jpeg",
            "image/png",
            "image/webp"
        ].includes(file.type)
    );

    if (invalidType) {

        formError.textContent =
            "Please select JPG, PNG or WebP images only.";

        syncFileInput();

        return;

    }

    selectedPhotos = uniquePhotos;

    formError.textContent = "";

    syncFileInput();

    renderPhotoPreviews();

});

// ==========================================
// VALIDATE PREPARATION AND EXPIRY DATES
// ==========================================

function validateDates() {

    if (!preparedAt.value || !expiresAt.value) {

        expiresAt.setCustomValidity("");

        return true;

    }

    const preparation = new Date(preparedAt.value);

    const expiry = new Date(expiresAt.value);

    if (
        Number.isNaN(preparation.getTime()) ||
        Number.isNaN(expiry.getTime()) ||
        expiry <= preparation
    ) {

        formError.textContent =
            "Expiry date and time must be later than preparation date and time.";

        expiresAt.setCustomValidity(
            "Expiry must be after preparation."
        );

        return false;

    }

    expiresAt.setCustomValidity("");

    formError.textContent = "";

    return true;

}

preparedAt.addEventListener("change", validateDates);

expiresAt.addEventListener("change", validateDates);

// ==========================================
// IMAGEKIT AUTHENTICATION
// ==========================================

async function getImageKitAuth(token) {

    console.log("Requesting ImageKit authentication...");

    const response = await fetch(
        `${API_URL}/image-upload/auth`,
        {
            method: "GET",

            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    const auth = await response.json();

    if (!response.ok) {

        throw new Error(
            auth.message || "ImageKit authentication failed."
        );

    }

    if (
        !auth.token ||
        !auth.expire ||
        !auth.signature ||
        !auth.publicKey
    ) {

        console.error("Invalid ImageKit authentication:", auth);

        throw new Error(
            "ImageKit authentication response is incomplete."
        );

    }

    console.log("ImageKit authentication successful.");

    return auth;

}

// ==========================================
// UPLOAD ONE FOOD PHOTO TO IMAGEKIT
// ==========================================

async function uploadFoodPhoto(file, auth) {

    console.log("Uploading photo:", file.name);

    const result = await upload({

        file: file,

        fileName: `${Date.now()}-${file.name}`,

        token: auth.token,

        expire: auth.expire,

        signature: auth.signature,

        publicKey: auth.publicKey,

        folder: "/foodconnect/donations",

        useUniqueFileName: true

    });

    console.log("ImageKit upload response:", result);

    if (
        !result ||
        typeof result.url !== "string" ||
        !result.url.startsWith("https://")
    ) {

        throw new Error(
            `ImageKit did not return a valid HTTPS URL for ${file.name}.`
        );

    }

    console.log("Uploaded image URL:", result.url);

    return result.url;

}

// ==========================================
// UPLOAD ALL SELECTED PHOTOS
// ==========================================

async function uploadSelectedPhotos(token, submitButton) {

    if (selectedPhotos.length === 0) {

        return [];

    }

    submitButton.textContent =
        "Authenticating image upload...";

    // Authenticate once

    const auth = await getImageKitAuth(token);

    // Upload all selected photos

    const uploadedPhotos = [];

    for (let i = 0; i < selectedPhotos.length; i++) {

        const file = selectedPhotos[i];

        submitButton.textContent =
            `Uploading photo ${i + 1} of ${selectedPhotos.length}...`;

        const imageUrl = await uploadFoodPhoto(file, auth);

        uploadedPhotos.push(imageUrl);

        console.log(
            `Photo ${i + 1} uploaded successfully:`,
            imageUrl
        );

    }

    return uploadedPhotos;

}
async function generateDonationQR(donationId) {

    if (!donationId) {
        throw new Error("Donation ID was not returned by the server.");
    }

    const qrData = JSON.stringify({
        type: "FOODCONNECT_DONATION",
        donationId: donationId
    });

    donationQRCode.replaceChildren();

    const canvas = document.createElement("canvas");

    await QRCode.toCanvas(canvas, qrData, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: "H"
    });

    donationQRCode.appendChild(canvas);

    qrDonationId.textContent = donationId;

    qrCard.hidden = false;
}
// ==========================================
// DOWNLOAD DONATION QR CODE
// ==========================================

if (downloadQR) {

    downloadQR.addEventListener("click", () => {

        const canvas = donationQRCode.querySelector("canvas");

        if (!canvas) {
            showToast("QR code is not available.");
            return;
        }

        const link = document.createElement("a");

        link.download = `FoodConnect-Donation-QR.png`;

        link.href = canvas.toDataURL("image/png");

        link.click();

    });

}

// ==========================================
// SUBMIT FOOD DONATION
// ==========================================

form.addEventListener("submit", async event => {

    event.preventDefault();

    formError.textContent = "";

    // Validate dates

    if (!validateDates()) {

        expiresAt.reportValidity();

        return;

    }

    // Validate form fields

    if (!form.checkValidity()) {

        form.reportValidity();

        return;

    }

    // Get authentication token

    const token = getToken();

    if (!token) {

        showToast(
            "Please log in before posting a donation."
        );

        window.location.href = "login.html";

        return;

    }

    // Submit button

    const submitButton = form.querySelector(
        'button[type="submit"]'
    );

    if (!submitButton) {

        console.error("Donation submit button not found.");

        return;

    }

    const originalText = submitButton.textContent;

    submitButton.disabled = true;

    try {

        // ==========================================
        // UPLOAD SELECTED PHOTOS
        // ==========================================

        const uploadedPhotos = await uploadSelectedPhotos(
            token,
            submitButton
        );

        console.log(
            "FINAL PHOTO URLS BEING SENT:",
            uploadedPhotos
        );

        // Verify photo URLs

        if (
            !Array.isArray(uploadedPhotos) ||
            uploadedPhotos.length > 4 ||
            uploadedPhotos.some(url =>
                typeof url !== "string" ||
                !url.startsWith("https://")
            )
        ) {

            throw new Error(
                "One or more food photos could not be uploaded."
            );

        }

        // ==========================================
        // CREATE DONATION OBJECT
        // ==========================================

        const donation = {

            foodName: foodName.value.trim(),

            category: category.value,

            quantity: Number(quantity.value),

            unit: unit.value,

            details: details.value.trim(),

            preparedAt: preparedAt.value,

            expiresAt: expiresAt.value,

            pickupLocation: pickupLocation.value.trim(),

            // Actual ImageKit URLs

            photos: uploadedPhotos

        };

        // Include GPS coordinates only when captured

        if (
            Number.isFinite(pickupLatitude) &&
            Number.isFinite(pickupLongitude)
        ) {

            donation.pickupLatitude = pickupLatitude;

            donation.pickupLongitude = pickupLongitude;

        }

        console.log(
            "Complete donation being submitted:",
            donation
        );

        // ==========================================
        // SEND DONATION TO BACKEND
        // ==========================================

        submitButton.textContent = "Publishing donation...";

        const response = await fetch(
            `${API_URL}/donations`,
            {

                method: "POST",

                headers: {

                    "Content-Type": "application/json",

                    Authorization: `Bearer ${token}`

                },

                body: JSON.stringify(donation)

            }
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.message || "Unable to post donation."
            );

        }

        console.log(
            "Donation successfully saved:",
            data
        );
const donationId =
data.donation?.id ??
data.id;
await generateDonationQR(donationId);

        console.log(
            "Photos saved by backend:",
            data.donation?.photos
        );

        // ==========================================
        // SUCCESS
        // ==========================================

        showToast("Donation posted successfully!");

        // Reset form

       

        selectedPhotos = [];

        syncFileInput();

        renderPhotoPreviews();

        resetPickupCoordinates();

        updatePreview();

        // Redirect to donor dashboard

        

    } catch (error) {

        console.error(
            "Donation submission error:",
            error
        );

        formError.textContent =
            error.message || "Something went wrong while posting your donation.";

        showToast(error.message);

    } finally {

        submitButton.disabled = false;

        submitButton.textContent = originalText;

    }

});

// ==========================================
// RESET DONATION FORM
// ==========================================

form.addEventListener("reset", () => {

    setTimeout(() => {

        selectedPhotos = [];

        syncFileInput();

        renderPhotoPreviews();

        formError.textContent = "";

        expiresAt.setCustomValidity("");

        resetPickupCoordinates();

        updatePreview();

    }, 0);

});

// ==========================================
// MOBILE NAVIGATION
// ==========================================

const menuToggle = document.getElementById("menuToggle");

const mainNav = document.getElementById("mainNav");

if (menuToggle && mainNav) {

    menuToggle.addEventListener("click", () => {

        const isOpen = mainNav.classList.toggle("open");

        menuToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

    });

}

// ==========================================
// INITIALIZE DONATION PREVIEW
// ==========================================

updatePreview();
