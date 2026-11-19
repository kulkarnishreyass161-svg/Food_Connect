
const path = require("path");

// Explicitly load the backend .env file
require("dotenv").config({
    path: path.resolve(__dirname, "../.env")
});

const ImageKit = require("@imagekit/nodejs").default;

const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

if (!privateKey) {
    throw new Error(
        "IMAGEKIT_PRIVATE_KEY missing from backend/.env"
    );
}

const imagekit = new ImageKit({
    privateKey: privateKey
});

console.log("ImageKit private key loaded:", Boolean(privateKey));

module.exports = imagekit;
