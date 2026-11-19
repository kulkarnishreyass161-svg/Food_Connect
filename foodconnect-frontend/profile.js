
document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // API CONFIGURATION
    // ==========================================

    const API_URL = "http://localhost:5000/api/profile";


    // ==========================================
    // HTML ELEMENT HELPER
    // ==========================================

    const $ = id => document.getElementById(id);

    const form = $("profileForm");
    const saveBtn = $("saveBtn");
    const formMessage = $("formMessage");
    const logoutBtn = $("logoutBtn");

    const ngoLocationSection = $("ngoLocationSection");
    const getLocationBtn = $("getLocationBtn");
    const locationMessage = $("locationMessage");

    const latitudeInput = $("latitude");
    const longitudeInput = $("longitude");


    // ==========================================
    // AUTHENTICATION
    // ==========================================

    const token =
        localStorage.getItem("token") ||
        sessionStorage.getItem("token");

    const loggedInUser = JSON.parse(
        localStorage.getItem("user") ||
        sessionStorage.getItem("user") ||
        "null"
    );

    if (!token || !loggedInUser) {
        window.location.href = "login.html";
        return;
    }


    // ==========================================
    // ROLE-BASED NAVIGATION
    // ==========================================

    const donateLink = $("donateLink");
    const searchFoodLink = $("searchFoodLink");
    const pickupDeliveryLink = $("pickupDeliveryLink");
    const mapLocationsLink = $("mapLocationsLink");

    const userRole = String(loggedInUser.role || "")
        .trim()
        .toUpperCase();

    if (donateLink) {
        donateLink.hidden = userRole !== "DONOR";
    }

    if (searchFoodLink) {
        searchFoodLink.hidden = userRole !== "NGO";
    }

    if (pickupDeliveryLink) {
        pickupDeliveryLink.hidden = userRole !== "VOLUNTEER";
    }

    if (mapLocationsLink) {
        mapLocationsLink.hidden =
            !["DONOR", "NGO", "VOLUNTEER"].includes(userRole);
    }


    // ==========================================
    // NGO COORDINATES
    // ==========================================

    let ngoLatitude = null;
    let ngoLongitude = null;


    // ==========================================
    // DISPLAY MESSAGE
    // ==========================================

    function showMessage(message, isError = false) {

        if (!formMessage) {
            console.error(message);
            return;
        }

        formMessage.textContent = message;

        formMessage.style.color =
            isError ? "#C0392B" : "#079765";
    }


    // ==========================================
    // DISPLAY LOCATION MESSAGE
    // ==========================================

    function showLocationMessage(message, isError = false) {

        if (!locationMessage) {
            console.log(message);
            return;
        }

        locationMessage.textContent = message;

        locationMessage.style.color =
            isError ? "#C0392B" : "#079765";
    }


    // ==========================================
    // SET INPUT VALUE SAFELY
    // ==========================================

    function setValue(id, value) {

        const element = $(id);

        if (element) {
            element.value = value ?? "";
        }

    }


    // ==========================================
    // SET PROFILE INFORMATION
    // ==========================================

    function setProfile(profile) {

        if (!profile) {
            showMessage("Profile information is unavailable.", true);
            return;
        }

        // Personal information

        setValue("name", profile.name);
        setValue("email", profile.email);
        setValue("phone", profile.phone);
        setValue("role", profile.role);

        // Address information

        setValue("address", profile.address);
        setValue("city", profile.city);
        setValue("state", profile.state);
        setValue("pincode", profile.pincode);

        // Bio

        setValue("bio", profile.bio);


        // Notification preferences (profile settings only)

        const emailNotifications = $("emailNotifications");
        const smsNotifications = $("smsNotifications");

        if (emailNotifications) {
            emailNotifications.checked =
                profile.email_notifications ?? true;
        }

        if (smsNotifications) {
            smsNotifications.checked =
                profile.sms_notifications ?? false;
        }


        // ======================================
        // PROFILE BANNER
        // ======================================

        const displayName = $("displayName");
        const displayEmail = $("displayEmail");
        const displayRole = $("displayRole");
        const avatar = $("avatar");

        if (displayName) {
            displayName.textContent =
                profile.name || "FoodConnect Member";
        }

        if (displayEmail) {
            displayEmail.textContent =
                profile.email || "";
        }

        if (displayRole) {
            displayRole.textContent =
                profile.role || "MEMBER";
        }

        if (avatar) {
            avatar.textContent = profile.name
                ? profile.name.trim().charAt(0).toUpperCase()
                : "U";
        }


        // ======================================
        // NGO LOCATION
        // ======================================

        const role = String(profile.role || "")
            .trim()
            .toUpperCase();

        if (ngoLocationSection) {
            ngoLocationSection.hidden = role !== "NGO";
        }

        if (role === "NGO") {

            ngoLatitude = profile.latitude ?? null;
            ngoLongitude = profile.longitude ?? null;

            setValue("latitude", ngoLatitude);
            setValue("longitude", ngoLongitude);

            if (
                ngoLatitude !== null &&
                ngoLongitude !== null
            ) {
                showLocationMessage(
                    "Your NGO location is already saved."
                );
            } else {
                showLocationMessage(
                    "Your NGO location has not been saved yet."
                );
            }

        } else {

            ngoLatitude = null;
            ngoLongitude = null;

            setValue("latitude", "");
            setValue("longitude", "");

        }

    }


    // ==========================================
    // LOAD PROFILE FROM DATABASE
    // ==========================================

    async function loadProfile() {

        console.log("Loading FoodConnect profile...");

        try {

            const response = await fetch(API_URL, {

                method: "GET",

                headers: {
                    Authorization: `Bearer ${token}`
                }

            });

            console.log("Profile API status:", response.status);

            const data = await response.json();

            console.log("Profile API response:", data);

            if (!response.ok) {
                throw new Error(
                    data.message || "Unable to load profile."
                );
            }

            if (!data.user) {
                throw new Error(
                    "Profile information was not returned by the server."
                );
            }

            setProfile(data.user);

            console.log("Profile loaded successfully.");

        } catch (error) {

            console.error("Profile loading error:", error);

            showMessage(error.message, true);

        }

    }


    // ==========================================
    // GET NGO CURRENT LOCATION
    // ==========================================

    if (getLocationBtn) {

        getLocationBtn.addEventListener("click", () => {

            if (!navigator.geolocation) {

                showLocationMessage(
                    "Geolocation is not supported by your browser.",
                    true
                );

                return;

            }

            const role = String($("role")?.value || "")
                .trim()
                .toUpperCase();

            if (role !== "NGO") {

                showLocationMessage(
                    "This feature is available only for NGO accounts.",
                    true
                );

                return;

            }

            getLocationBtn.disabled = true;
            getLocationBtn.textContent = "Getting Location...";

            showLocationMessage(
                "Please wait. Fetching your current location..."
            );

            navigator.geolocation.getCurrentPosition(

                position => {

                    ngoLatitude = position.coords.latitude;
                    ngoLongitude = position.coords.longitude;

                    setValue(
                        "latitude",
                        ngoLatitude.toFixed(7)
                    );

                    setValue(
                        "longitude",
                        ngoLongitude.toFixed(7)
                    );

                    showLocationMessage(
                        "Location captured successfully. Click Save Changes to store it."
                    );

                    getLocationBtn.disabled = false;

                    getLocationBtn.innerHTML =
                        "<span>◎</span> Use My Current Location";

                },

                error => {

                    let message =
                        "Unable to get your current location.";

                    if (error.code === 1) {
                        message =
                            "Location permission denied. Please allow location access.";
                    } else if (error.code === 2) {
                        message =
                            "Your current location is unavailable. Please try again.";
                    } else if (error.code === 3) {
                        message =
                            "Location request timed out. Please try again.";
                    }

                    showLocationMessage(message, true);

                    getLocationBtn.disabled = false;

                    getLocationBtn.innerHTML =
                        "<span>◎</span> Use My Current Location";

                },

                {
                    enableHighAccuracy: true,
                    timeout: 20000,
                    maximumAge: 0
                }

            );

        });

    }


    // ==========================================
    // SAVE PROFILE
    // ==========================================

    if (form) {

        form.addEventListener("submit", async event => {

            event.preventDefault();

            if (!form.reportValidity()) {
                return;
            }

            const role = String($("role")?.value || "")
                .trim()
                .toUpperCase();

            if (
                role === "NGO" &&
                (
                    (ngoLatitude === null) !==
                    (ngoLongitude === null)
                )
            ) {

                showMessage(
                    "Both latitude and longitude are required.",
                    true
                );

                return;

            }

            const profileData = {

                name: $("name")?.value.trim() || "",
                phone: $("phone")?.value.trim() || "",

                address: $("address")?.value.trim() || "",
                city: $("city")?.value.trim() || "",
                state: $("state")?.value.trim() || "",
                pincode: $("pincode")?.value.trim() || "",

                bio: $("bio")?.value.trim() || "",

                emailNotifications:
                    $("emailNotifications")?.checked ?? true,

                smsNotifications:
                    $("smsNotifications")?.checked ?? false,

                latitude: role === "NGO" ? ngoLatitude : null,
                longitude: role === "NGO" ? ngoLongitude : null

            };

            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = "Saving...";
            }

            try {

                const response = await fetch(API_URL, {

                    method: "PUT",

                    headers: {

                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`

                    },

                    body: JSON.stringify(profileData)

                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.message || "Unable to save profile."
                    );
                }

                if (!data.user) {
                    throw new Error(
                        "Updated profile information was not returned."
                    );
                }

                setProfile(data.user);

                showMessage(
                    "Your profile has been updated successfully!"
                );


                // Update stored user information

                const storageType =
                    localStorage.getItem("user")
                        ? localStorage
                        : sessionStorage;

                const storedUser = JSON.parse(
                    storageType.getItem("user") || "null"
                );

                if (storedUser) {

                    storedUser.name = data.user.name;
                    storedUser.role = data.user.role;

                    storageType.setItem(
                        "user",
                        JSON.stringify(storedUser)
                    );

                }

            } catch (error) {

                console.error("Profile update error:", error);

                showMessage(error.message, true);

            } finally {

                if (saveBtn) {

                    saveBtn.disabled = false;

                    saveBtn.innerHTML =
                        'Save Changes <span>→</span>';

                }

            }

        });


        // ======================================
        // RESET FORM
        // ======================================

        form.addEventListener("reset", () => {

            setTimeout(() => {
                loadProfile();
            }, 0);

        });

    } else {

        console.error(
            "Profile form not found. Check the ID: profileForm"
        );

    }


    // ==========================================
    // LOGOUT
    // ==========================================

    if (logoutBtn) {

        logoutBtn.addEventListener("click", () => {

            localStorage.removeItem("token");
            localStorage.removeItem("user");

            sessionStorage.removeItem("token");
            sessionStorage.removeItem("user");

            window.location.href = "login.html";

        });

    }


    // ==========================================
    // LOAD PROFILE WHEN PAGE OPENS
    // ==========================================

    loadProfile();

});
