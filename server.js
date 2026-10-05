const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const path = require("path");
const config = require("./config");
const db = require("./services/jsondb");
const transactionMonitor = require("./services/transaction-monitor");

const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const pageRoutes = require("./routes/pages");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, "public")));

app.use("/auth", authRoutes);
app.use("/api", apiRoutes);
app.use("/", pageRoutes);

wss.on("connection", (ws, req) => {
  ws.on("message", async msg => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "subscribe" && data.userId) {
        ws.userId = data.userId;
      }

      if (data.type === "check" && data.transactionId && ws.userId) {
        const result = await transactionMonitor.syncTransactionStatus(
          ws.userId,
          data.transactionId
        );

        if (result.success) {
          ws.send(JSON.stringify({
            type: result.transaction.status === "success" ? "payment" : "status",
            transactionId: result.transaction.id,
            status: result.transaction.status,
            saldo: result.saldo
          }));
        }
      }
    } catch (e) {}
  });
});

async function init() {
  try {
    await db.ensureFile("users.json", []);
  } catch (err) {
    console.warn("Database initialization warning:", err.message);
  }
  const port = config.port;
  server.listen(port, "0.0.0.0", () => {
    console.log(`XDigitalKita berjalan di port ${port}`);
    try {
      transactionMonitor.startTransactionMonitor();
    } catch (err) {
      console.warn("Transaction monitor start warning:", err.message);
    }
  });
}

init().catch(err => {
  console.error("Initialization error:", err);
  const port = config.port;
  server.listen(port, "0.0.0.0", () => {
    console.log(`XDigitalKita fallback berjalan di port ${port}`);
  });
});
