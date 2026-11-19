
const express = require("express");
const cors = require("cors");
const path = require("path");

// ==========================================
// ENVIRONMENT VARIABLES
// ==========================================

require("dotenv").config({
    path: path.resolve(__dirname, "../.env")
});

const app = express();
app.get("/",(req,res)=> 
{
    res.status(220).json(
        {
            success:true,
            message: "FoodConnect Backend is running"
        }
    );
})

// ==========================================
// MIDDLEWARE
// ==========================================

const allowedOrigins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests without an Origin header (e.g. server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
    }
}));

app.use(express.json());

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

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/requests", donationRequestRoutes);
app.use("/api/locations", locationsRoutes);
app.use("/api/deliveries", deliveryRoutes);
app.use("/api/image-upload", imageUploadRoutes);
app.use("/api/reports", reportsRoutes);

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`FoodConnect server running on port ${PORT}`);
});
