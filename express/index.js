require('dotenv').config()
require('./src/models/User');
const express = require('express');
const https = require('https');
const fs = require('fs');
const mongoose = require('mongoose');
const bodyParse = require('body-parser');
const authRoutes = require('./src/routes/authRoutes');

const app = express();

app.use(bodyParse.json());
app.use(authRoutes)

const mongoUri = `mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_URL}:${process.env.MONGODB_PORT}`;
mongoose.connect(mongoUri);

mongoose.connection.on("connected", () => {
    console.log("Connected to mongo instance");
});
mongoose.connection.on("error", (error) => {
    console.error("Error connecting to mongo", error);
});

https.createServer({
    key: fs.readFileSync(process.env.SSL_KEY_LOCATION),
    cert: fs.readFileSync(process.env.SSL_CERT_LOCATION)
}, app).listen(3000, () => {
    console.log('Listening on port 3000');
});