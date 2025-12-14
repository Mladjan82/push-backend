const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const data = await response.json();
    console.log("Expo response:", data);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Expo push error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ⬇⬇⬇ JEDINA OBAVEZNA IZMENA ZA DEPLOY ⬇⬇⬇
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Push backend running on port ${PORT}`);
});
