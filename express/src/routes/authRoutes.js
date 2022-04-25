const express = require('express');
const mongoose = require('mongoose');
const User = mongoose.model('User');
const fs = require('fs');
const ldap = require('ldapjs');
const ldapEscape = require('ldap-escape');
const { SignJWT, jwtVerify, importSPKI, importPKCS8 } = require('jose');

/**
 * 
 * @param {String} username 
 * @param {String} password 
 * @returns {Object} {authorized: Boolean, errMessage: String, displayName: String, email: String}
 */
const authenticateADUser = async (username, password) => {
    var options = {
        ca: [fs.readFileSync(process.env.LDAP_CA_CERT_LOCATION)]
    }

    return new Promise((resolve, reject) => {
        const client = ldap.createClient({
            url: [process.env.LDAP_URL],
            tlsOptions: options
        });

        client.on('error', (err) => {
            console.log("Error", err);
            reject({ authenticated: false, errMessage: "LDAP ERR Unable to reach LDAP server" });
        });

        client.bind(process.env.LDAP_SEARCH_USER, process.env.LDAP_SEARCH_PASSWORD, (err) => {
            if (err) {
                console.log("Error", err);
                reject({ authenticated: false, errMessage: "LDAP ERR Unable to bind to LDAP with search user" });
            }
        });

        var opts = {
            filter: ldapEscape.filter`(sAMAccountName=${username})`,
            scope: 'sub'
        }

        client.search(process.env.LDAP_BASE_DN, opts, async (err, res) => {
            if (err) {
                console.log("Error", err);
                reject({ authenticated: false, errMessage: "Bad username or password" });
            }
            res.on('searchEntry', async function (entry) {
                client.bind(entry.dn, password, err => {
                    if (err) {
                        console.log("Failed", err);
                        client.unbind();
                        reject({ authenticated: false, errMessage: "Bad username or password" });
                    }
                    client.unbind();
                    resolve({ authenticated: true, errMessage: null, displayName: entry.object.cn, email: entry.object.mail });
                });
            });
        });
    });


}

const router = express.Router();

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send({ error: "Must provide username and password" });
    }

    let adResult = await authenticateADUser(username, password);

    if (!adResult) {
        return res.status(500).send({ error: "Internal server error" });
    }

    if (adResult.errMessage) {
        if (adResult.errMessage.includes("LDAP ERR")) {
            console.log(adResult.errMessage);
            return res.status(500).send({ error: "Login service unavailable. Try again in a few minutes. If issue persists please contact the System Administrator" });
        }
        return res.status(403).send({ error: "Bad username or password" });
    }

    //This situation shouldn't be possible but gonna check anyways
    if (!adResult.authenticated) {
        return res.status(500).send({ error: "Internal server error" });
    }

    const user = await User.findOne({ username });
    let uuid = '';
    if (user) {
        uuid = user.uuid;
    }
    else {
        try {
            const newUser = new User({ email: adResult.email, username, displayName: adResult.displayName });
            await newUser.save();
            uuid = newUser.uuid;
        }
        catch (err) {
            console.log("Error", err);
            return res.status(500).send({ error: "Login service unavailable. Try again in a few minutes. If issue persists please contact the System Administrator" });
        }
    }

    const data = {
        sub: username,
        exp: Math.floor(Date.now() / 1000) + (60 * 60),
        nbf: Math.floor(Date.now() / 1000),
        data: { uuid }
    }

    const private = fs.readFileSync(process.env.JWT_PRIVATE_KEY_LOCATION, 'utf-8');

    const privKey = await importPKCS8(private, 'EdDSA');
    const jwt = await new SignJWT(data).setProtectedHeader({ alg: "EdDSA" }).sign(privKey);

    res.send(jwt);
});

module.exports = router;

