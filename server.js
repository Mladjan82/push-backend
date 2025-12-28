const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const admin = require("firebase-admin");

/**
 * ============================
 * FIREBASE ADMIN INIT (JEDNOM!)
 * koristi FIREBASE_SERVICE_ACCOUNT iz Render ENV
 * ============================
 */
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(cors());
app.use(express.json());

/**
 * ============================
 * HEALTH CHECK – Render / UptimeRobot
 * ============================
 */
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/**
 * ============================
 * NOTIFIKACIJA ADMINU – NOVA PORUDŽBINA
 * ============================
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
    const response = await fetch(
      "https://exp.host/--/api/v2/push/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      }
    );

    const data = await response.json();
    console.log("Admin push response:", data);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Expo push error (admin):", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ============================
 * NOTIFIKACIJA KORISNIKU – PROMENA STATUSA
 * ============================
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
    const response = await fetch(
      "https://exp.host/--/api/v2/push/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      }
    );

    const data = await response.json();
    console.log("User push response:", data);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Expo push error (user):", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ============================
 * ADMIN – PROMENA STATUSA PORUDŽBINE
 * PIŠE DIREKTNO U FIRESTORE (ADMIN SDK)
 * ============================
 */
app.post("/admin/update-order-status", async (req, res) => {
  const { orderId, status } = req.body;

  console.log("📩 ADMIN UPDATE HIT:", req.body);

  if (!orderId || !status) {
    return res.status(400).json({ error: "Missing orderId or status" });
  }

  try {
    await admin
      .firestore()
      .collection("orders")
      .doc(orderId)
      .update({
        status,
        statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ success: true });
  } catch (error) {
    console.error("Order status update failed:", error);
    res.status(500).json({ error: "Update failed" });
  }
});

/**
 * ============================
 * KREIRANJE PORUDŽBINE (KLIJENT → BACKEND → FIRESTORE)
 * ============================
 */
app.post("/create-order", async (req, res) => {
  try {
    const orderData = req.body;

    if (!orderData || !orderData.items || !orderData.total) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    // 1️⃣ Upis porudžbine (Firestore server time)
    const docRef = await admin
      .firestore()
      .collection("orders")
      .add({
        ...orderData,
        status: "pending", // ⬅️ ispravljeno (ne "panding")
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // 2️⃣ Uzimanje admin push tokena
    const adminDoc = await admin.firestore().doc("settings/Admin").get();
    const adminToken = adminDoc.data()?.pushToken;

    // 3️⃣ Slanje notifikacije adminu (NE BLOKIRA RESPONSE)
    if (adminToken) {
      fetch("https://notification.bombo.rs/notify-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: adminToken,
          orderId: docRef.id,
          total: orderData.total,
        }),
      }).catch(() => {});
    }

    // 4️⃣ Odgovor klijentu – SAMO ID (kao ranije)
    res.json({
      success: true,
      orderId: docRef.id,
    });
  } catch (error) {
    console.error("❌ CREATE ORDER ERROR:", error);
    res.status(500).json({ error: "Order creation failed" });
  }
});



    /**
 * ============================
 * ADMIN – LISTA PORUDŽBINA
 * ============================
 */
app.get("/admin/orders", async (req, res) => {
  try {
    const snapshot = await admin
      .firestore()
      .collection("orders")
      .orderBy("createdAt", "desc")
      .get();

    const orders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ success: true, orders });
  } catch (err) {
    console.error("ADMIN ORDERS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});




/**
 * ============================
 * STATUS PORUDZBINE - ADMIN
 * ============================
 */
app.get("/order/:id", async (req, res) => {
  try {
    const snap = await admin
      .firestore()
      .collection("orders")
      .doc(req.params.id)
      .get();

    if (!snap.exists) {
      return res.status(404).json({ success: false });
    }

    const data = snap.data();


    res.json({
      success: true,
      order: { id: snap.id, ...data },
    });
  } catch {
    res.status(500).json({ success: false });
  }
});


/**
 * ============================
 * PRACENJE PORUDZBINE - KLIJENT
 * ============================
 */
app.get("/order/:id", async (req, res) => {
  try {
    const snap = await admin
      .firestore()
      .collection("orders")
      .doc(req.params.id)
      .get();

    if (!snap.exists) {
      return res.status(404).json({ success: false });
    }

    const data = snap.data();

    res.json({
      success: true,
      order: { id: snap.id, ...data },
    });
  } catch {
    res.status(500).json({ success: false });
  }
});



// ===============================
// ADMIN LOGIN (SIGURNA VARIJANTA)
// ===============================
app.post("/admin/login", async (req, res) => {
  const { password, pushToken } = req.body;

  if (!password) {
    return res.status(400).json({ error: "Nedostaje lozinka" });
  }

  try {
    const adminDoc = await admin.firestore().doc("settings/Admin").get();

    if (!adminDoc.exists) {
      return res.status(404).json({ error: "Admin ne postoji" });
    }

    const adminData = adminDoc.data();

    // ❌ pogrešna lozinka
    if (password !== adminData.password) {
      return res.status(401).json({ error: "Pogrešna lozinka" });
    }

    // ✅ ako postoji push token – snimi ga
 console.log("📩 PUSH TOKEN RECEIVED:", pushToken);

if (typeof pushToken === "string" && pushToken.length > 10) {
  await admin.firestore().doc("settings/Admin").update({
    pushToken: pushToken,
    lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("✅ PUSH TOKEN SAVED");
} else {
  console.log("⚠️ PUSH TOKEN MISSING OR INVALID");
}


    return res.json({
      success: true,
      message: "Admin login OK",
    });
  } catch (err) {
    console.error("ADMIN LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});




/**
 * ============================
 * SETTINGS – STATUS RESTORANA + DOSTAVA (BACKEND API)
 * ============================
 *
 * Firestore struktura (kao kod tebe):
 *  - settings/appStatus:
 *      { isClosed: boolean, message: string }
 *  - settings/deliveryEnabled:
 *      { deliveryStatus: boolean, message: string }
 */

/**
 * ✅ PUBLIC: Vrati status restorana (za app i web)
 */
app.get("/status/app", async (req, res) => {
  try {
    const snap = await admin.firestore().doc("settings/appStatus").get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: "appStatus not found" });
    }

    return res.json({ success: true, data: snap.data() });
  } catch (err) {
    console.error("GET /status/app error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * ✅ PUBLIC: Vrati status dostave (za app i web)
 */
app.get("/status/delivery", async (req, res) => {
  try {
    const snap = await admin.firestore().doc("settings/deliveryEnabled").get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: "deliveryEnabled not found" });
    }

    return res.json({ success: true, data: snap.data() });
  } catch (err) {
    console.error("GET /status/delivery error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * ✅ PUBLIC: Jedan poziv koji vrati oba (najpraktičnije za klijente)
 */
app.get("/status", async (req, res) => {
  try {
    const [appSnap, deliverySnap] = await Promise.all([
      admin.firestore().doc("settings/appStatus").get(),
      admin.firestore().doc("settings/deliveryEnabled").get(),
    ]);

    return res.json({
      success: true,
      appStatus: appSnap.exists ? appSnap.data() : null,
      delivery: deliverySnap.exists ? deliverySnap.data() : null,
    });
  } catch (err) {
    console.error("GET /status error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * 🔒 ADMIN: Update appStatus (zatvoreno/otvoreno + poruka)
 * Body:
 *  { isClosed: boolean, message: string }
 */
app.post("/admin/update-app-status", async (req, res) => {
  try {
    const { isClosed, message } = req.body;

    if (typeof isClosed !== "boolean") {
      return res.status(400).json({ success: false, error: "isClosed must be boolean" });
    }

    const safeMessage =
      typeof message === "string" && message.trim().length > 0
        ? message.trim()
        : "Restoran trenutno ne radi.";

    await admin.firestore().doc("settings/appStatus").set(
      {
        isClosed,
        message: safeMessage,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /admin/update-app-status error:", err);
    return res.status(500).json({ success: false, error: "Update failed" });
  }
});

/**
 * 🔒 ADMIN: Update deliveryEnabled (dostava on/off + poruka)
 * Body:
 *  { deliveryStatus: boolean, message: string }
 */
app.post("/admin/update-delivery-status", async (req, res) => {
  try {
    const { deliveryStatus, message } = req.body;

    if (typeof deliveryStatus !== "boolean") {
      return res.status(400).json({ success: false, error: "deliveryStatus must be boolean" });
    }

    const safeMessage =
      typeof message === "string" && message.trim().length > 0
        ? message.trim()
        : "Dostava trenutno nije dostupna. Molimo izaberite lično preuzimanje.";

    await admin.firestore().doc("settings/deliveryEnabled").set(
      {
        deliveryStatus,
        message: safeMessage,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /admin/update-delivery-status error:", err);
    return res.status(500).json({ success: false, error: "Update failed" });
  }
});


/**
 * ============================
 * START SERVER
 * ============================
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Push backend running on port ${PORT}`);
});