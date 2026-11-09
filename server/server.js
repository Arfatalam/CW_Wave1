
"use strict";

require("dotenv").config();

const express = require("express");
const passport = require("passport");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");

const configureOAuth = require("./oauth");

const app = express();
const PORT = process.env.PORT || 3000;

// Required environment variables
const requiredEnvVariables = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OAUTH_STATE_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALLBACK_URL"
];

const missingVariables = requiredEnvVariables.filter(
    (variable) => !process.env[variable]
);

if (missingVariables.length > 0) {
    throw new Error(
        "Missing required environment variables: " +
        missingVariables.join(", ")
    );
}

// Express configuration
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

app.locals.supabase = supabase;

// Security
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    })
);

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

// Body parser
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Global API rate limiter
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please try again later."
    }
});

app.use("/api", globalLimiter);

// Passport initialization — no Express session required
app.use(passport.initialize());
configureOAuth(passport);

// Health check
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "CLEAN WAVE backend is running.",
        time: new Date().toISOString()
    });
});

// Backup
app.use("/api/backup", require("./routes/backup"));

// Reports
app.use("/api/reports", require("./routes/reports"));

// Authentication
app.use("/api/auth", require("./routes/auth"));

// Password reset
app.use("/api/password-reset", require("./routes/password-reset"));

// Google OAuth
const oauthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many login attempts. Please try again later."
    }
});

app.use(
    "/api/oauth",
    oauthLimiter,
    require("./routes/oauth")
);

// Dashboard
app.use("/api/dashboard", require("./routes/dashboard"));

// Products
app.use("/api/products", require("./routes/products"));

// Orders
app.use("/api/orders", require("./routes/orders"));

// Expenses
app.use("/api/expenses", require("./routes/expenses"));

// Customers
app.use("/api/customers", require("./routes/customers"));

// Inventory
app.use("/api/inventory", require("./routes/inventory"));

// Frontend static files
const publicDirectory = path.join(__dirname, "..", "public");

app.use(
    express.static(publicDirectory, {
        dotfiles: "ignore",
        index: "index.html",
        extensions: ["html"],
        maxAge: process.env.NODE_ENV === "production" ? "1d" : 0
    })
);

// API 404
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found.",
        path: req.originalUrl
    });
});

// Frontend fallback
app.use((req, res, next) => {
    if (req.method !== "GET") {
        return next();
    }

    if (req.path.startsWith("/api/")) {
        return next();
    }

    res.sendFile(
        path.join(publicDirectory, "index.html"),
        (error) => {
            if (error) next(error);
        }
    );
});

// Error handler
app.use((error, req, res, next) => {
    console.error("CLEAN WAVE server error:", error);

    if (res.headersSent) {
        return next(error);
    }

    const statusCode =
        Number(error.statusCode || error.status) || 500;

    res.status(statusCode).json({
        success: false,
        message: statusCode >= 500
            ? "Internal server error."
            : error.message
    });
});

// Local development
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(
            `CLEAN WAVE server running at http://localhost:${PORT}`
        );
    });
}

// Vercel export
module.exports = app;
