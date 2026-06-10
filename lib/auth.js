const crypto = require("node:crypto");
const store = require("./store");

const COOKIE = "cc_session";
const MAX_AGE = 1000 * 60 * 60 * 24 * 30;
const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

function parseCookies(req) {
  const out = {}; if (!req.headers.cookie) return out;
  req.headers.cookie.split(";").forEach((part) => { const index = part.indexOf("="); if (index >= 0) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); });
  return out;
}
function sign(userId) { return `${userId}.${crypto.createHmac("sha256", secret).update(userId).digest("hex")}`; }
function unsign(value) { if (!value) return null; const index = value.lastIndexOf("."); if (index < 0) return null; const userId = value.slice(0, index); const a = Buffer.from(value.slice(index + 1)); const b = Buffer.from(crypto.createHmac("sha256", secret).update(userId).digest("hex")); return a.length === b.length && crypto.timingSafeEqual(a, b) ? userId : null; }
async function currentUser(req) { const userId = unsign(parseCookies(req)[COOKIE]); return userId ? store.getUser(userId) : null; }
function login(res, userId) { res.cookie(COOKIE, sign(userId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: MAX_AGE }); }
function logout(res) { res.clearCookie(COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }); }
module.exports = { currentUser, login, logout, COOKIE };
