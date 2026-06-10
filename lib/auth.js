const crypto = require("node:crypto");
const store = require("./store");

const COOKIE = "cc_session";
const MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30日

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    out[key] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return out;
}

function sign(userId) {
  const sig = crypto.createHmac("sha256", store.getSecret()).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

function unsign(value) {
  if (!value) return null;
  const index = value.lastIndexOf(".");
  if (index < 0) return null;
  const userId = value.slice(0, index);
  const sig = value.slice(index + 1);
  const expected = crypto.createHmac("sha256", store.getSecret()).update(userId).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}

// Cookieから署名を検証し、現在ログイン中のユーザーを返す（無ければ null）。
function currentUser(req) {
  const userId = unsign(parseCookies(req)[COOKIE]);
  if (!userId) return null;
  return store.getUser(userId);
}

function login(res, userId) {
  res.cookie(COOKIE, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE
  });
}

function logout(res) {
  res.clearCookie(COOKIE);
}

module.exports = { currentUser, login, logout, COOKIE };
