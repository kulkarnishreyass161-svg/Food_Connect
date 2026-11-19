
const express = require("express");
const cors = require("cors");
const path = require("path");

// ==========================================
// ENVIRONMENT VARIABLES
// ==========================================

// Loads E:\Food_Connect\.env
require("dotenv").config({
    path: path.resolve(__dirname, "../.env")
});

// ==========================================
// INITIALIZE EXPRESS
// ==========================================

const app = express();

// ==========================================
// CORS CONFIGURATION
// ==========================================

const allowedOrigins = [
    "http://https://food-connect-qnuq.onrender.com:5500",
    "http://localhost:5500",
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {

        // Allow requests without an Origin header
        if (!origin) {
            return callback(null, true);
        }

        // Allow registered frontend origins
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
    }
}));

// ==========================================
// BODY PARSER
// ==========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// ROOT ROUTE / HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "FoodConnect Backend is running"
    });
});

// ==========================================
// API ROUTES
// ==========================================

const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const donationRoutes = require("./routes/donations");
const donationRequestRoutes = require("./routes/donationRequest");
const locationsRoutes = require("./routes/locations");
const deliveryRoutes = require("./routes/deliveries");
const imageUploadRoutes = require("./routes/imageupload");
const reportsRoutes = require("./routes/reports");

// Authentication
app.use("/api/auth", authRoutes);

// User Profile
app.use("/api/profile", profileRoutes);

// Food Donations
app.use("/api/donations", donationRoutes);

// NGO Donation Requests
app.use("/api/requests", donationRequestRoutes);

// Location and Maps
app.use("/api/locations", locationsRoutes);

// Volunteer Deliveries
app.use("/api/deliveries", deliveryRoutes);

// Image Upload
app.use("/api/image-upload", imageUploadRoutes);

// Reports and Analytics
app.use("/api/reports", reportsRoutes);

// ==========================================
// 404 HANDLER
// ==========================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found"
    });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {
    console.error("Server Error:", err.message);

    res.status(500).json({
        success: false,
        message: "Internal server error"
    });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`FoodConnect server running on port ${PORT}`);
});
