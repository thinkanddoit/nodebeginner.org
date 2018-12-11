import bodyParser from "body-parser";
import bcrypt from "bcryptjs";
import uuidv4 from "uuid";
import jwt from "jsonwebtoken";
import colors from "colors";

const setCookieAndEnd = (userId, res) => {
    jwt.sign({ userId: userId }, "secret", (err, jwt) => {
        if (err) {
            console.error(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Could not create session token." }));
        } else {
            res.cookie("sessionToken", JSON.stringify(jwt), { httpOnly: true });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ authSuccess: true }));
        }
    });
};

const activateAuth = (httpServer, mongoDb) => {

    return new Promise((resolve) => {

        const accounts = mongoDb.collection("accounts");

        httpServer.use(bodyParser.json());

        httpServer.post(/^\/api\/session-tokens\/$/, (req, res) => {
            console.info(`Received auth request: ${req.method} ${req.originalUrl}`);

            if (    (req.body == null)

                || !(req.body.hasOwnProperty("username"))
                ||  (req.body.username == null)
                || !(typeof req.body.username === "string")
                ||  (req.body.username.length === 0)

                || !(req.body.hasOwnProperty("password"))
                ||  (req.body.password == null)
                || !(typeof req.body.password === "string")
                ||  (req.body.password.length === 0)
            ) {
                console.info(`Auth request body ${JSON.stringify(req.body, null, 4).blue} is ${"invalid".red}.`);
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ authSuccess: false, error: "Invalid authentication body." }));
                return;
            }

            const username = req.body.username;
            const password = req.body.password;
            accounts.findOne({ username: username }, {}, (err, doc) => {
                if (err) {
                    console.error(err);
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ authSuccess: false, error: "Unable to look up your account." }));
                } else {
                    if (doc != null && doc.hasOwnProperty("passwordHash") && doc.passwordHash != null) {

                        console.info(`Account with username ${username.blue} exists, verifying password...`);
                        bcrypt.compare(password, doc.passwordHash, (err, matched) => {
                            if (matched === true) {
                                console.info(`Password for account with username ${username.blue} is valid, sending session token...`);
                                setCookieAndEnd(doc.userId, res);
                            } else {
                                console.info(`Password for account with username ${username.blue} is ${"invalid".yellow}.`);
                                res.writeHead(200, { "Content-Type": "application/json" });
                                res.end(JSON.stringify({ authSuccess: false, error: "Access denied." }));
                            }
                        });

                    } else {

                        console.info(`Account with username ${username.blue} does not yet exist, creating...`);

                        bcrypt.genSalt(12, (err, salt) => {
                            bcrypt.hash(password, salt, (err, passwordHash) => {
                                if (err) {
                                    console.error(err);
                                    res.writeHead(500, { "Content-Type": "application/json" });
                                    res.end(JSON.stringify({ authSuccess: false, error: "Could not create new account." }));

                                } else {

                                    const userId = uuidv4();
                                    accounts.insertOne(
                                        { userId: userId, username: username, passwordHash: passwordHash },
                                        null
                                    ).then(() => {
                                        console.info(`Account with username ${username.blue} has been created with user id ${userId.cyan}, sending session token...`);
                                        setCookieAndEnd(doc.userId, res);
                                    }).catch((err) => {
                                        console.error(err);
                                        res.writeHead(500, { "Content-Type": "application/json" });
                                        res.end(JSON.stringify({ authSuccess: false, error: "Could not create new account." }));
                                    });
                                }
                            });
                        });
                    }
                }
            });

        });

        console.info(`Will serve ${"session tokens API".blue} at ${"/api/session-tokens/".green}.`);
        resolve();

    });

};

export default activateAuth;
