const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../database");
const { Resend } = require("resend");
const jwt = require("jsonwebtoken");

const resend = new Resend(process.env.RESEND_API_KEY);
const router = express.Router();

// Escape user-provided text before inserting it into HTML
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// Send verification email using Resend
async function sendVerificationEmail(name, email, token) {
    const verificationLink =
        `${process.env.FRONTEND_URL}/verify-email.html?token=${token}`;

    const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM,
        to: [email],
        subject: "Verify your FoodConnect email",
        html: `
            <div style="font-family:Arial,sans-serif;padding:25px;">
                <h2>Welcome to FoodConnect, ${escapeHtml(name)}!</h2>
                <p>Thank you for registering.</p>
                <p>Please click below to verify your email address:</p>
                <a href="${verificationLink}"
                   style="background:#245c43;color:white;padding:12px 20px;text-decoration:none;border-radius:5px;">
                   Verify Email
                </a>
                <p>This link expires in 24 hours.</p>
            </div>
        `
    });

    if (error) {
        console.error("Resend error:", error);
        throw new Error(error.message || "Unable to send verification email.");
    }

    return data;
}

// REGISTER
router.post("/register", async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            role,
            location,
            password,
            termsAccepted
        } = req.body;

        if (
            !name || !email || !phone ||
            !role || !location || !password
        ) {
            return res.status(400).json({
                message: "Please fill in all required fields."
            });
        }

        if (termsAccepted !== true) {
            return res.status(400).json({
                message: "Please accept the Terms and Conditions."
            });
        }

        const allowedRoles = [
            "DONOR",
            "NGO",
            "VOLUNTEER",
            "BENEFICIARY"
        ];

        const normalizedRole = String(role).toUpperCase();
        const normalizedEmail = String(email).trim().toLowerCase();

        if (!allowedRoles.includes(normalizedRole)) {
            return res.status(400).json({
                message: "Invalid user role."
            });
        }

        if (!/^[0-9]{10}$/.test(phone)) {
            return res.status(400).json({
                message: "Enter a valid 10-digit phone number."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters."
            });
        }

        const existingUser = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [normalizedEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        // Generate a secure verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");

        // Store only the token hash in the database
        const tokenHash = crypto
            .createHash("sha256")
            .update(verificationToken)
            .digest("hex");

        const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Create an unverified account
        const result = await pool.query(
            `INSERT INTO users
            (
                name, email, phone, role, location,
                password_hash, terms_accepted,
                email_verified,
                email_verification_token_hash,
                email_verification_expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9)
            RETURNING id, name, email, role`,
            [
                name.trim(),
                normalizedEmail,
                phone,
                normalizedRole,
                location.trim(),
                passwordHash,
                true,
                tokenHash,
                tokenExpiry
            ]
        );

        // Send verification email
        try {
            await sendVerificationEmail(
                name.trim(),
                normalizedEmail,
                verificationToken
            );
        } catch (emailError) {
            console.error("Verification email failed:", emailError);

            return res.status(502).json({
                message: "Account created, but verification email could not be sent. Please contact support."
            });
        }

        return res.status(201).json({
            message: "Account created! Please check your email and verify your account.",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Registration error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        return res.status(500).json({
            message: "Registration failed. Please try again."
        });
    }
});

// VERIFY EMAIL
router.post("/verify-email", async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                message: "Verification token is missing."
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const result = await pool.query(
            `UPDATE users
             SET email_verified = TRUE,
                 email_verification_token_hash = NULL,
                 email_verification_expires_at = NULL
             WHERE email_verification_token_hash = $1
               AND email_verification_expires_at > NOW()
               AND email_verified = FALSE
             RETURNING id`,
            [tokenHash]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                message: "Invalid, expired, or already-used verification link."
            });
        }

        return res.status(200).json({
            message: "Email verified successfully! You can now log in."
        });

    } catch (error) {
        console.error("Email verification error:", error);

        return res.status(500).json({
            message: "Email verification failed. Please try again."
        });
    }
});
// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        // Find user in PostgreSQL
        const result = await pool.query(
            `SELECT id, name, email, role, password_hash, email_verified
             FROM users
             WHERE email = $1`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const user = result.rows[0];

        // Compare entered password with stored bcrypt hash
        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        // Check email verification
        
        // Generate JWT
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1h",
                issuer: "FoodConnect"
            }
        );

        return res.status(200).json({
            message: "Login successful!",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Login failed. Please try again."
        });
    }
});

module.exports = router;