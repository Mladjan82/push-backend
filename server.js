const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const admin = require("firebase-admin");
const multer = require("multer");
const sharp = require("sharp");

/**
 * ============================
 * FIREBASE ADMIN INIT
 * ============================
 */
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "restoranbombo-d3366.firebasestorage.app",
});


const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * ============================
 * EXPRESS SETUP
 * ============================
 */
const app = express();
app.use(cors());
app.use(express.json());

/**
 * ============================
 * MULTER (UPLOAD HANDLER)
 * ============================
 */
const upload = multer({
  storage: multer.memoryStorage(),
});


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
        status: "pending", 
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
 * APP STATUS – ČITANJE
 * Admin panel dobija da li je restoran otvoren ili zatvoren
 * ============================
 */
app.get("/admin/app-status", async (req, res) => {
  try {
    const snap = await admin.firestore().doc("settings/appStatus").get();
    res.json(snap.data());
  } catch (error) {
    res.status(500).json({ error: "Failed to load app status" });
  }
});


/**
 * ============================
 * APP STATUS – AŽURIRANJE
 * Admin menja status restorana (otvoreno/zatvoreno)
 * ============================
 */
app.post("/admin/app-status", async (req, res) => {
  const { isClosed, message } = req.body;

  try {
    await admin.firestore().doc("settings/appStatus").set({
      isClosed,
      message,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update app status" });
  }
});


/**
 * ============================
 * DELIVERY STATUS – ČITANJE
 * Da li je dostava omogućena
 * ============================
 */
app.get("/admin/delivery-status", async (req, res) => {
  try {
    const snap = await admin.firestore().doc("settings/deliveryEnabled").get();
    res.json(snap.data());
  } catch (error) {
    res.status(500).json({ error: "Failed to load delivery status" });
  }
});


/**
 * ============================
 * DELIVERY STATUS – AŽURIRANJE
 * Admin uključuje / isključuje dostavu
 * ============================
 */
app.post("/admin/delivery-status", async (req, res) => {
  const { deliveryStatus, message } = req.body;

  try {
    await admin.firestore().doc("settings/deliveryEnabled").set({
      deliveryStatus,
      message,
      price: 200,
      deliveryLimit: 2000,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update delivery status" });
  }
});



/**
 * ============================
 * ADMIN – LISTA KATEGORIJA + PROIZVODA
 * ============================
 */
app.get("/admin/products", async (req, res) => {
  try {
    const categoriesSnap = await admin.firestore().collection("categories").get();

    const result = [];

    for (const cat of categoriesSnap.docs) {
      const productsSnap = await admin
        .firestore()
        .collection("categories")
        .doc(cat.id)
        .collection("products")
        .get();

      result.push({
        id: cat.id,
        name: cat.data().name || cat.id,
        products: productsSnap.docs.map(p => ({
          id: p.id,
          ...p.data(),
        })),
      });
    }

    res.json({ success: true, categories: result });
  } catch (err) {
    console.error("ADMIN PRODUCTS ERROR:", err);
    res.status(500).json({ error: "Failed to load products" });
  }
});



/**
 * ============================
 * ADMIN – DOHVAT JEDNOG PROIZVODA
 * ============================
 */

app.get("/admin/product/:categoryId/:productId", async (req, res) => {
  try {
    const { categoryId, productId } = req.params;

    const snap = await db
      .collection("categories")
      .doc(categoryId)
      .collection("products")
      .doc(productId)
      .get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.json(snap.data());
  } catch (err) {
    console.error("GET product error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * ============================
 * ADMIN – UPDATE PROIZVOD
 * ============================
 */
app.post("/admin/update-product", async (req, res) => {
  try {
    const { categoryId, productId, data } = req.body;

    if (!categoryId || !productId || !data) {
      return res.status(400).json({ error: "Nedostaju podaci" });
    }

    await db
      .collection("categories")
      .doc(categoryId)
      .collection("products")
      .doc(productId)
      .update(data);

    return res.json({ success: true });
  } catch (err) {
    console.error("UPDATE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Greška pri ažuriranju proizvoda" });
  }
});


/**
 * ============================
 * ADMIN – DELETE PRODUCT
 * ============================
 */
app.post("/admin/delete-product", async (req, res) => {
  try {
    const { categoryId, productId } = req.body;

    if (!categoryId || !productId) {
      return res.status(400).json({ error: "Nedostaje categoryId ili productId" });
    }

    // referenca na dokument
    const productRef = db
      .collection("categories")
      .doc(categoryId)
      .collection("products")
      .doc(productId);

    // uzmi podatke (da znamo da li postoji slika)
    const snap = await productRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Proizvod ne postoji" });
    }

    const data = snap.data();

    // ako postoji slika – brišemo je iz storage-a
    if (data.imageURL) {
      try {
        const filePath = data.imageURL.split(
          `https://storage.googleapis.com/${bucket.name}/`
        )[1];

        if (filePath) {
          await bucket.file(filePath).delete();
        }
      } catch (err) {
        console.warn("Ne mogu obrisati sliku:", err.message);
      }
    }

    // brišemo proizvod iz Firestore-a
    await productRef.delete();

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Greška pri brisanju proizvoda" });
  }
});



/**
 * ============================
 * UPLOAD SLIKA
 * ============================
 */

app.post("/admin/upload-product-image", upload.single("image"), async (req, res) => {
  console.log("🔥 UPLOAD HIT");
  console.log("BODY:", req.body);
  console.log("FILE:", req.file);

  try {
    const { categoryId, productId } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Nedostaje slika" });
    }

    if (!categoryId || !productId) {
      return res.status(400).json({ error: "Nedostaje categoryId ili productId" });
    }

    const processedImage = await sharp(req.file.buffer)
      .resize(1000)
      .webp({ quality: 80 })
      .toBuffer();

    const filePath = `products/${categoryId}/${productId}.webp`;
    const file = bucket.file(filePath);

    await file.save(processedImage, { contentType: "image/webp" });
    await file.makePublic();

    const imageURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return res.json({ imageURL });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});


/**
 * ============================
 * ADMIN – CREATE PRODUCT
 * ============================
 */
app.post("/admin/create-product", async (req, res) => {
  try {
    const { categoryId, data } = req.body;

    if (!categoryId || !data?.name) {
      return res.status(400).json({ error: "Nedostaju podaci" });
    }

    const ref = await db
      .collection("categories")
      .doc(categoryId)
      .collection("products")
      .add({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return res.json({
      success: true,
      productId: ref.id,
    });
  } catch (err) {
    console.error("CREATE PRODUCT ERROR:", err);
    return res.status(500).json({ error: "Create product failed" });
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