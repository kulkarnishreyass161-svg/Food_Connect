
document.addEventListener("DOMContentLoaded", async () => {
    const API_URL = "https://food-connect-qnuq.onrender.com/api/donations";

    const form = document.getElementById("editDonationForm");
    const formError = document.getElementById("formError");
    const toast = document.getElementById("toast");
    const submitButton = form.querySelector('button[type="submit"]');

    const foodName = document.getElementById("foodName");
    const category = document.getElementById("category");
    const quantity = document.getElementById("quantity");
    const unit = document.getElementById("unit");
    const details = document.getElementById("details");
    const preparedAt = document.getElementById("preparedAt");
    const expiresAt = document.getElementById("expiresAt");
    const pickupLocation = document.getElementById("pickupLocation");
    const mainPreviewImage = document.getElementById("mainPreviewImage");


    const token =
        localStorage.getItem("token") ||
        sessionStorage.getItem("token");

    const params = new URLSearchParams(window.location.search);
    const donationId = params.get("id");

    let toastTimer;

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }

    async function readResponse(response) {
        const text = await response.text();

        try {
            return text ? JSON.parse(text) : {};
        } catch {
            throw new Error("The server returned an invalid response.");
        }
    }

    // Convert database date into the format required by datetime-local.
    function toDateTimeLocal(value) {
        if (!value) return "";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        const pad = (number) => String(number).padStart(2, "0");

        return (
            `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
            `T${pad(date.getHours())}:${pad(date.getMinutes())}`
        );
    }

    function formatDate(value) {
        if (!value) return "Not available";

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

    function updatePreview() {
        document.getElementById("previewName").textContent =
            foodName.value.trim() || "Your food donation";

        document.getElementById("previewQuantity").textContent =
            quantity.value
                ? `${quantity.value} ${unit.value}`
                : "Quantity to be added";

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

    [
        foodName,
        quantity,
        unit,
        pickupLocation,
        preparedAt,
        expiresAt
    ].forEach((field) => {
        field.addEventListener("input", updatePreview);
        field.addEventListener("change", updatePreview);
    });

    function validateDates() {
        if (!preparedAt.value || !expiresAt.value) {
            expiresAt.setCustomValidity("");
            return true;
        }

        const preparation = new Date(preparedAt.value);
        const expiry = new Date(expiresAt.value);

        if (expiry <= preparation) {
            expiresAt.setCustomValidity(
                "Expiry must be later than preparation."
            );

            formError.textContent =
                "Expiry date and time must be later than preparation.";

            return false;
        }

        expiresAt.setCustomValidity("");
        return true;
    }

    preparedAt.addEventListener("change", validateDates);
    expiresAt.addEventListener("change", validateDates);
function updateDonationPhoto(donation) {
    // Read the photo URL returned by the backend.
    const photoUrl =
        donation.image_url ||
        donation.photo_url ||
        donation.imageUrl ||
        donation.photoUrl ||
        (Array.isArray(donation.photos)
            ? (
                typeof donation.photos[0] === "string"
                    ? donation.photos[0]
                    : donation.photos[0]?.url
              )
            : "");

    if (photoUrl) {
        mainPreviewImage.src = photoUrl;
    }

    mainPreviewImage.onerror = () => {
        console.error("Unable to load the donation photo.");
    };
}
    // Load the selected donation from the backend.
    async function loadDonation() {
        if (!token) {
            window.location.href = "login.html";
            return;
        }

        if (!donationId || !/^\d+$/.test(donationId)) {
            formError.textContent = "Invalid donation ID.";
            form.hidden = true;
            return;
        }

        try {
            const response = await fetch(
                `${API_URL}/${encodeURIComponent(donationId)}`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(
                    data.message || "Unable to load donation."
                );
            }

            const donation = data.donation;
            updateDonationPhoto(donation);

            if (!donation) {
                throw new Error("Donation details were not found.");
            }

            if (donation.status !== "Available") {
                throw new Error(
                    "Only available donations can be edited."
                );
            }

            foodName.value = donation.food_name || "";
            category.value = donation.category || "";
            quantity.value = donation.quantity ?? "";
            unit.value = donation.unit || "";
            details.value = donation.details || "";
            preparedAt.value = toDateTimeLocal(donation.prepared_at);
            expiresAt.value = toDateTimeLocal(donation.expires_at);
            pickupLocation.value = donation.pickup_location || "";

            updatePreview();

        } catch (error) {
            console.error("Load donation error:", error);

            formError.textContent = error.message;
            form.hidden = true;
        }
    }

    // Save edited donation.
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        formError.textContent = "";

        if (!validateDates()) {
            expiresAt.reportValidity();
            return;
        }

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const donation = {
            foodName: foodName.value.trim(),
            category: category.value,
            quantity: Number(quantity.value),
            unit: unit.value,
            details: details.value.trim(),
            preparedAt: preparedAt.value,
            expiresAt: expiresAt.value,
            pickupLocation: pickupLocation.value.trim()
        };

        try {
            submitButton.disabled = true;
            submitButton.textContent = "Saving changes...";

            const response = await fetch(
                `${API_URL}/${encodeURIComponent(donationId)}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify(donation)
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(
                    data.message || "Unable to update donation."
                );
            }

            showToast("Donation updated successfully!");

            setTimeout(() => {
                window.location.href = "donor-dashboard.html";
            }, 1200);

        } catch (error) {
            console.error("Update donation error:", error);
            formError.textContent = error.message;

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Save changes →";
        }
    });

    // Return to donor dashboard without saving.
    document.getElementById("cancelEdit").addEventListener("click", () => {
        window.location.href = "donor-dashboard.html";
    });

    // Mobile navigation.
    const menuToggle = document.getElementById("menuToggle");
    const mainNav = document.getElementById("mainNav");

    menuToggle.addEventListener("click", () => {
        const isOpen = mainNav.classList.toggle("open");

        menuToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );
    });

    await loadDonation();
});
