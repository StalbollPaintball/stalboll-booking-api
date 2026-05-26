const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const { Resend } = require("resend");

const app = express();
app.use(cors());
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY);

const db = new sqlite3.Database("./bookings.db");

db.run(`
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  date TEXT,
  time TEXT,
  players TEXT,
  package TEXT,
  bookingType TEXT,
  ageCheck TEXT
)
`);

const ADMIN_PASSWORD = "hemligt123";

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
  res.json({
    times: rows.map(r => r.time),
    full: rows.length >= 2
  });
});
app.post("/book", async (req, res) => {
  let { name, email, date, time, players, package: pkg, bookingType, ageCheck } = req.body;

  if (!time) time = "";
  time = time.replace(":00", "");

  const playerCount = parseInt(players);

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
      "INSERT INTO bookings (name, email, date, time, players, package, bookingType, ageCheck) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [name, email, date, time, playerCount, pkg, bookingType, ageCheck],
      async (err) => {

        if (err) {
          console.log("INSERT ERROR:", err);
          return res.status(500).json({ message: "DB fel" });
        }

        console.log("✅ Sparad:", name, playerCount, pkg);

        try {
          console.log("📨 Skickar bokning till företag...");

          await resend.emails.send({
  from: "Stålboll <onboarding@resend.dev>",
  to: "info.stalboll@gmail.com",

  // 🔥 VIKTIG FIX
  headers: {
    "Reply-To": email
  },

  subject: "Ny bokning - Stålboll Paintball",

  text: `${name} har gjort en bokning:

Datum: ${date}
Tid: ${time}:00
Deltagare: ${playerCount}
Paket: ${pkg}
Typ av bokning: ${bookingType}
Alla över 18: ${ageCheck}

----------------------------

📧 KUNDENS MAIL:
${email}

👉 Klicka här för att svara:
mailto:${email}`
});

          console.log("✅ MAIL SKICKAT TILL FÖRETAG");

        } catch (error) {
          console.log("❌ MAIL ERROR:");
          console.log(error);
        }

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server kör på port " + PORT);
});
