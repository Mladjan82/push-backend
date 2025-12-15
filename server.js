const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

/**
 * HEALTH CHECK – za Render / UptimeRobot
 */
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/**
 * NOTIFIKACIJA ADMINU – NOVA PORUDŽBINA
 * očekuje:
 * {
 *   token: "ExponentPushToken[...]",
 *   orderId: "abc123",
 *   total: 1250
 * }
 */
app.post("/notify-admin", async (req, res) => {
  const { token, orderId, total } = req.body;

  if (!token || !orderId) {
    return res.status(400).json({ error: "Missing token or orderId" });
  }

  const message = {
    to: token,
    sound: "default",
    title: "📦 Nova porudžbina",
    body: `Porudžbina #${orderId.slice(-6)} • ${total || "—"} RSD`,
  };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    const data = await response.json();
    console.log("Admin push response:", data);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Expo push error (admin):", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * NOTIFIKACIJA KORISNIKU – PROMENA STATUSA
 * očekuje:
 * {
 *   token: "ExponentPushToken[...]",
 *   orderId: "abc123",
 *   status: "u pripremi"
 * }
 */
app.post("/notify-user", async (req, res) => {
  const { token, orderId, status } = req.body;

  if (!token || !orderId || !status) {
    return res.status(400).json({ error: "Missing token, orderId or status" });
  }

  const message = {
    to: token,
    sound: "default",
    title: "📣 Status porudžbine",
    body: `Porudžbina #${orderId.slice(-6)} je sada: ${status}`,
  };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    const data = await response.json();
    console.log("User push response:", data);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Expo push error (user):", error);
    res.status(500).json({ error: error.message });
  }
});

// ⬇⬇⬇ DEPLOY READY ⬇⬇⬇
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Push backend running on port ${PORT}`);
});
