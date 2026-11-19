
document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // API CONFIGURATION
    // ==========================================

    const API = "http://localhost:5000/api";

    const token =
        localStorage.getItem("token") ||
        sessionStorage.getItem("token");

    const user = JSON.parse(
        localStorage.getItem("user") ||
        sessionStorage.getItem("user") ||
        "null"
    );

    const role = String(user?.role || "")
        .trim()
        .toUpperCase();

    const $ = id => document.getElementById(id);


    // ==========================================
    // AUTHENTICATION
    // ==========================================

    if (!token || !user) {

        alert("Please log in to view FoodConnect locations.");

        window.location.href = "login.html";

        return;

    }


    // ==========================================
    // DISPLAY USER
    // ==========================================

    const name = user.name || "User";

    $("profileName").textContent = name;

    $("profileAvatar").textContent =
        name.charAt(0).toUpperCase();


    // ==========================================
    // ROLE-BASED NAVIGATION
    // ==========================================

    if (role === "VOLUNTEER") {

        $("pickupDeliveryLink").hidden = false;

        

    }


    // ==========================================
    // MAP INITIALIZATION
    // ==========================================

    if (typeof L === "undefined") {

        alert("Unable to load the map. Please check your internet connection.");

        return;

    }

    const map = L.map("map").setView(
        [12.9716, 77.5946],
        11
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
    ).addTo(map);


    // ==========================================
    // MAP VARIABLES
    // ==========================================

    const colors = {
        donor: "#3986d8",
        ngo: "#9162c5",
        volunteer: "#ed9c37"
    };

    const emojis = {
        donor: "Donor",
        ngo: "NGO",
        volunteer: "Volunteer"
    };

    const markerLayer = L.layerGroup().addTo(map);

    let allLocations = [];

    let activeFilter = "all";

    let activeDeliveries = [];


    let userLocationMarker = null;


    // ==========================================
    // ESCAPE HTML
    // ==========================================

    function escapeHTML(value) {

        return String(value ?? "").replace(/[&<>"']/g, character => ({

            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"

        })[character]);

    }


    // ==========================================
    // API REQUEST
    // ==========================================

    async function api(path, options = {}) {

        const response = await fetch(`${API}${path}`, {

            ...options,

            headers: {

                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),

                Authorization: `Bearer ${token}`,

                ...(options.headers || {})

            }

        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {

            throw new Error(
                data.message || `Request failed (${response.status})`
            );

        }

        return data;

    }


    // ==========================================
    // NORMALIZE LOCATION DATA
    // ==========================================

    function normalize(data) {

        const donors = (data.donors || []).map(item => ({

            ...item,

            type: "donor",

            title: item.title || "Food donation",

            displayName: item.title || "Food donation",

            address: item.address || "Pickup address not provided",

            latitude: Number(item.latitude),

            longitude: Number(item.longitude)

        }));

        const ngos = (data.ngos || []).map(item => ({

            ...item,

            type: "ngo",

            displayName: item.name,

            address: item.address || "NGO location",

            latitude: Number(item.latitude),

            longitude: Number(item.longitude)

        }));

        const volunteers = (data.volunteers || []).map(item => ({

            ...item,

            type: "volunteer",

            displayName: item.name,

            address: item.address || "Shared volunteer location",

            latitude: Number(item.latitude),

            longitude: Number(item.longitude)

        }));

        return [...donors, ...ngos, ...volunteers].filter(item =>

            Number.isFinite(item.latitude) &&

            Number.isFinite(item.longitude) &&

            Math.abs(item.latitude) <= 90 &&

            Math.abs(item.longitude) <= 180

        );

    }


    // ==========================================
    // CREATE MAP MARKER
    // ==========================================

    function markerFor(item) {

        const icon = L.divIcon({

            className: "",

            html: `
                <div class="custom-marker"
                     style="background:${colors[item.type]}">
                    <span>${emojis[item.type]}</span>
                </div>
            `,

            iconSize: [34, 34],

            iconAnchor: [17, 34],

            popupAnchor: [0, -32]

        });

        const marker = L.marker(
            [item.latitude, item.longitude],
            { icon }
        );

        const extra = item.type === "donor"

            ? `${item.quantity ?? ""} ${item.unit ?? ""} · ${item.donor_name ?? ""}`

            : item.type === "ngo"

                ? "NGO"

                : "Volunteer sharing location";

        marker.bindPopup(`

            <strong>${escapeHTML(item.displayName)}</strong>

            <p>${escapeHTML(extra)}</p>

            <small>${escapeHTML(item.address)}</small>

        `);

        return marker;

    }


    // ==========================================
    // UPDATE STATISTICS
    // ==========================================

    function updateStats() {

        const donors = allLocations.filter(item =>
            item.type === "donor"
        );

        $("donorCount").textContent =
            new Set(donors.map(item => item.user_id)).size;

        $("ngoCount").textContent =
            allLocations.filter(item =>
                item.type === "ngo"
            ).length;

        $("volunteerCount").textContent =
            allLocations.filter(item =>
                item.type === "volunteer"
            ).length;

        $("foodCount").textContent = donors.length;

    }


    // ==========================================
    // RENDER LOCATIONS
    // ==========================================

    function render() {

        const term = $("searchInput").value
            .trim()
            .toLowerCase();

        const visible = allLocations.filter(item => {

            const matchesType =
                activeFilter === "all" ||
                item.type === activeFilter;

            const searchable = [

                item.displayName,
                item.donor_name,
                item.address,
                item.category,
                item.title

            ].join(" ").toLowerCase();

            return matchesType && searchable.includes(term);

        });


        markerLayer.clearLayers();

        $("locationList").replaceChildren();


        visible.forEach(item => {

            const marker = markerFor(item).addTo(markerLayer);

            const card = document.createElement("article");

            card.className = "location-item";

            const name = document.createElement("h4");

            name.textContent = item.displayName;

            const address = document.createElement("p");

            address.textContent = item.address;

            const tag = document.createElement("span");

            tag.className = `tag ${item.type}`;

            tag.textContent =
                item.type === "donor"
                    ? "FOOD PICKUP"
                    : item.type.toUpperCase();

            card.append(name, address, tag);

            card.addEventListener("click", () => {

                map.setView(
                    [item.latitude, item.longitude],
                    16
                );

                marker.openPopup();

            });

            $("locationList").append(card);

        });


        if (visible.length === 0) {

            const empty = document.createElement("p");

            empty.className = "empty";

            empty.textContent =
                "No shared locations with coordinates found. Donors can add pickup coordinates when posting a donation; NGOs and volunteers can share their location using the button above.";

            $("locationList").append(empty);

        }

        fillRouteOptions();

    }


    // ==========================================
    // LOAD ROUTE OPTIONS
    // ==========================================

    function fillRouteOptions() {

        if (role === "VOLUNTEER") {

            loadActiveDeliveries();

            return;

        }

        const donors = allLocations.filter(item =>
            item.type === "donor"
        );

        const ngos = allLocations.filter(item =>
            item.type === "ngo"
        );

        const pickup = $("pickupSelect");

        const delivery = $("deliverySelect");

        if (!pickup || !delivery) return;

        pickup.innerHTML =
            '<option value="">Select food pickup</option>';

        delivery.innerHTML =
            '<option value="">Select NGO</option>';

        delivery.disabled = false;

        donors.forEach(item => {

            const option = document.createElement("option");

            option.value = `donor:${item.id}`;

            option.textContent =
                `${item.displayName} — ${item.address}`;

            pickup.append(option);

        });

        ngos.forEach(item => {

            const option = document.createElement("option");

            option.value = `ngo:${item.user_id}`;

            option.textContent =
                `${item.displayName} — ${item.address}`;

            delivery.append(option);

        });

    }


    // ==========================================
    // LOAD LOCATIONS
    // ==========================================

    async function loadLocations() {

        $("locationList").innerHTML =

            '<p class="empty">Loading locations from PostgreSQL...</p>';

        try {

            const data = await api("/locations/map");

            allLocations = normalize(data);

            updateStats();

            render();

        } catch (error) {

            console.error("Map locations error:", error);

            $("locationList").innerHTML = `

                <p class="empty">
                    ${escapeHTML(error.message)}
                </p>

            `;

            if (
                /expired|authentication|unauthorized/i.test(error.message)
            ) {

                window.location.href = "login.html";

            }

        }

    }


    // ==========================================
    // LOAD VOLUNTEER ACTIVE DELIVERIES
    // ==========================================

    async function loadActiveDeliveries() {

        if (role !== "VOLUNTEER") return;

        const pickup = $("pickupSelect");

        const delivery = $("deliverySelect");

        if (!pickup || !delivery) return;

        try {

            const data = await api("/deliveries/my");

            activeDeliveries = data.deliveries || [];

            pickup.innerHTML = `

                <option value="">
                    Select your accepted delivery
                </option>

            `;

            delivery.innerHTML = `

                <option value="">
                    Route destination is selected automatically
                </option>

            `;

            delivery.disabled = true;

            activeDeliveries.forEach(task => {

                const option = document.createElement("option");

                option.value = task.delivery_id;

                option.textContent =

                    `${task.food_name} — ${task.donor_name} to ${task.ngo_name}`;

                pickup.append(option);

            });

            $("routeMessage").textContent =

                activeDeliveries.length === 0

                    ? "You do not have any active delivery tasks. Accept a task from Pickup & Delivery first."

                    : "Select one of your active delivery tasks to view its route.";

        } catch (error) {

            console.error("Active deliveries error:", error);

            $("routeMessage").textContent =
                "Unable to load your active delivery tasks.";

        }

    }


    // ==========================================
    // MAP FILTERS
    // ==========================================

    document.querySelectorAll(".filter").forEach(button => {

        button.addEventListener("click", () => {

            document.querySelectorAll(".filter").forEach(item => {

                item.classList.remove("active");

            });

            button.classList.add("active");

            activeFilter = button.dataset.filter;

            render();

        });

    });


    // ==========================================
    // SEARCH
    // ==========================================

    $("searchInput").addEventListener("input", render);


    // ==========================================
    // REFRESH MAP
    // ==========================================

    $("refreshMapBtn").addEventListener(
        "click",
        loadLocations
    );


    // ==========================================
    // SHARE CURRENT LOCATION
    // ==========================================

    $("myLocationBtn").addEventListener("click", () => {

        if (!navigator.geolocation) {

            alert("Geolocation is not supported by this browser.");

            return;

        }

        const button = $("myLocationBtn");

        button.disabled = true;

        button.textContent = "Getting location...";

        navigator.geolocation.getCurrentPosition(

            async position => {

                const latitude = position.coords.latitude;

                const longitude = position.coords.longitude;

                try {

                    const result = await api("/locations/me", {

                        method: "POST",

                        body: JSON.stringify({

                            latitude,
                            longitude,
                            shareLocation: true

                        })

                    });

                    if (userLocationMarker) {

                        map.removeLayer(userLocationMarker);

                    }

                    userLocationMarker = L.marker([
                        latitude,
                        longitude
                    ]).addTo(map);

                    userLocationMarker
                        .bindPopup("Your shared current location")
                        .openPopup();

                    map.setView(
                        [latitude, longitude],
                        15
                    );

                    alert(result.message);

                    await loadLocations();

                } catch (error) {

                    alert(error.message);

                } finally {

                    button.disabled = false;

                    button.textContent = "📍 Share my location";

                }

            },

            error => {

                const message = error.code === 1

                    ? "Location permission denied."

                    : "Unable to get your location.";

                alert(message);

                button.disabled = false;

                button.textContent = "📍 Share my location";

            },

            {
                enableHighAccuracy: true,
                timeout: 12000
            }

        );

    });


    // ==========================================
    // ROUTE CALCULATION
    // ==========================================

    $("routeBtn")?.addEventListener("click", async () => {

        const pickupKey = $("pickupSelect").value;

        const message = $("routeMessage");

        const resultBox = $("routeResult");

        message.textContent = "";

        resultBox.hidden = true;


        let pickupLatitude;
        let pickupLongitude;

        let dropLatitude;
        let dropLongitude;

        let pickupName;
        let dropName;


        // VOLUNTEER: ACCEPTED DELIVERY TASK

        if (role === "VOLUNTEER") {

            const task = activeDeliveries.find(item =>

                String(item.delivery_id) === pickupKey

            );

            if (!task) {

                message.textContent =
                    "Select an active delivery task first.";

                return;

            }

            pickupLatitude = Number(task.pickup_latitude);

            pickupLongitude = Number(task.pickup_longitude);

            dropLatitude = Number(task.drop_latitude);

            dropLongitude = Number(task.drop_longitude);

            pickupName = task.pickup_location;

            dropName = task.drop_location;

        } else {

            // OTHER ROLES: MANUAL ROUTE SELECTION

            const ngoKey = $("deliverySelect").value;

            const pickup = allLocations.find(item =>

                item.type === "donor" &&

                `donor:${item.id}` === pickupKey

            );

            const ngo = allLocations.find(item =>

                item.type === "ngo" &&

                `ngo:${item.user_id}` === ngoKey

            );

            if (!pickup || !ngo) {

                message.textContent =
                    "Select a food pickup point and an NGO.";

                return;

            }

            pickupLatitude = pickup.latitude;

            pickupLongitude = pickup.longitude;

            dropLatitude = ngo.latitude;

            dropLongitude = ngo.longitude;

            pickupName = pickup.address;

            dropName = ngo.address;

        }


        // VALIDATE COORDINATES

        const coordinates = [

            pickupLatitude,
            pickupLongitude,
            dropLatitude,
            dropLongitude

        ];

        if (!coordinates.every(Number.isFinite)) {

            message.textContent =
                "Pickup or NGO coordinates are missing. Please update the location information.";

            return;

        }

        if (

            Math.abs(pickupLatitude) > 90 ||

            Math.abs(dropLatitude) > 90 ||

            Math.abs(pickupLongitude) > 180 ||

            Math.abs(dropLongitude) > 180

        ) {

            message.textContent =
                "Invalid pickup or drop-off coordinates.";

            return;

        }


        // CALCULATE ROUTE

        const button = $("routeBtn");

        button.disabled = true;

        button.textContent = "Calculating...";

        try {

            const url =

                `https://router.project-osrm.org/route/v1/driving/` +

                `${pickupLongitude},${pickupLatitude};` +

                `${dropLongitude},${dropLatitude}` +

                `?overview=full&geometries=geojson`;

            const response = await fetch(url);

            if (!response.ok) {

                throw new Error(
                    "Routing service is unavailable."
                );

            }

            const data = await response.json();

            if (
                data.code !== "Ok" ||
                !data.routes?.length
            ) {

                throw new Error("No driving route found.");

            }


            // REMOVE OLD ROUTE

            if (routeLayer) {

                map.removeLayer(routeLayer);

            }

            routeMarkers.forEach(marker => {

                map.removeLayer(marker);

            });

            routeMarkers = [];


            // DRAW ROUTE

            routeLayer = L.geoJSON(
                data.routes[0].geometry,
                {

                    style: {

                        color: "#21834b",
                        weight: 5,
                        opacity: 0.85

                    }

                }
            ).addTo(map);


            // PICKUP MARKER

            const pickupMarker = L.marker([

                pickupLatitude,
                pickupLongitude

            ]).addTo(map);

            pickupMarker.bindPopup(
                `<strong>Pickup:</strong> ${escapeHTML(pickupName)}`
            );

            routeMarkers.push(pickupMarker);


            // DROP-OFF MARKER

            const dropMarker = L.marker([

                dropLatitude,
                dropLongitude

            ]).addTo(map);

            dropMarker.bindPopup(
                `<strong>Drop-off:</strong> ${escapeHTML(dropName)}`
            );

            routeMarkers.push(dropMarker);


            map.fitBounds(
                routeLayer.getBounds(),
                {
                    padding: [35, 35]
                }
            );


            // DISPLAY DISTANCE

            const route = data.routes[0];

            $("routeDistance").textContent =

                `${(route.distance / 1000).toFixed(2)} km`;


            // DISPLAY DURATION

            const mins = Math.round(
                route.duration / 60
            );

            $("routeDuration").textContent =

                mins >= 60

                    ? `${Math.floor(mins / 60)} hr ${mins % 60} min`

                    : `${mins} min`;


            resultBox.hidden = false;

            message.textContent =
                "Route calculated successfully. Distance and travel time are estimates.";

        } catch (error) {

            console.error("Route error:", error);

            message.textContent =
                error.message || "Unable to calculate route.";

        } finally {

            button.disabled = false;

            button.textContent = "Find route";

        }

    });


    // ==========================================
    // INITIALIZE MAP DATA
    // ==========================================

    loadLocations();

});
