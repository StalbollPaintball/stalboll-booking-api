const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./bookings.db");

db.run(`
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  date TEXT,
  time TEXT,
  players TEXT,
  package TEXT
)
`);

const ADMIN_PASSWORD = "hemligt123";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "info.stalboll@gmail.com",
    pass: "ydkmaptjapthundu"
  }
});

const allowedTimes = ["10","11","12","13","14","15","16","17","18"];
const blockedDays = [1];

function isAvailable(date, time, callback) {
  const day = new Date(date).getDay();

  if (blockedDays.includes(day)) return callback(false);
  if (!allowedTimes.includes(time)) return callback(false);

  db.all("SELECT * FROM bookings WHERE date = ?", [date], (err, rows) => {

    if (err) {
      console.log("DB ERROR:", err);
      return callback(false);
    }

    if (!rows) return callback(false);

    if (rows.length >= 2) return callback(false);

    for (let b of rows) {
      let existing = parseInt(b.time);
      let requested = parseInt(time);

      if (Math.abs(existing - requested) < 2) {
        return callback(false);
      }
    }

    callback(true);
  });
}

app.get("/availability/:date", (req, res) => {
  db.all("SELECT time FROM bookings WHERE date = ?", [req.params.date], (err, rows) => {
    res.json(rows.map(r => r.time));
  });
});

app.post("/book", (req, res) => {
  let { name, email, date, time, players, package: pkg } = req.body;

  // 🛡 fallback så inget kraschar
  if (!time) time = "";
  time = time.replace(":00", "");

  const playerCount = parseInt(players);

  // ✅ validering
  if (!name || !email || !date || !time || !players || !pkg) {
    return res.status(400).json({ message: "Fyll i alla fält!" });
  }

  if (isNaN(playerCount)) {
    return res.status(400).json({ message: "Ogiltigt antal deltagare" });
  }

  if (playerCount < 6) {
    return res.status(400).json({ message: "Minst 6 deltagare!" });
  }

  if (playerCount > 24) {
    return res.status(400).json({ message: "Max 24 deltagare!" });
  }

  isAvailable(date, time, (ok) => {
    if (!ok) return res.status(400).json({ message: "Fullbokat / ej tillgängligt" });

    db.run(
      "INSERT INTO bookings (name, email, date, time, players, package) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, date, time, playerCount, pkg],
      (err) => {

        if (err) {
          console.log("INSERT ERROR:", err);
          return res.status(500).json({ message: "DB fel" });
        }

        console.log("✅ Sparad:", name, playerCount, pkg);

        // 📧 MAIL KUND
        transporter.sendMail({
          from: "info.stalboll@gmail.com",
          to: email,
          subject: "Bokning bekräftad",
          text: `Din bokning är klar!
Datum: ${date}
Tid: ${time}:00
Deltagare: ${playerCount}
Paket: ${pkg}`
        }, (err, info) => {
          console.log("KUND MAIL:", err || info.response);
        });

        // 📧 MAIL ADMIN
        transporter.sendMail({
          from: "info.stalboll@gmail.com",
          to: "info.stalboll@gmail.com",
          subject: "Ny bokning",
          text: `${name} bokade:
Datum: ${date}
Tid: ${time}:00
Deltagare: ${playerCount}
Paket: ${pkg}`
        }, (err, info) => {
          console.log("ADMIN MAIL:", err || info.response);
        });

        res.json({ message: "Bokning klar!" });
      }
    );
  });
});

// 🔐 admin
app.get("/admin/bookings", (req, res) => {
  const pass = req.headers["x-admin-password"];

  if (pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  db.all("SELECT * FROM bookings ORDER BY date, time", (err, rows) => {
    res.json(rows);
  });
});

app.listen(3000, () => console.log("Kör på http://localhost:3000"));