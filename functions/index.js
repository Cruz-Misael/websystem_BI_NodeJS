// index.js — Backend Staging Firebase
const express = require("express");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const serviceAccount = require("./config/serviceAccountKey.json");
const cors = require("cors");

const sseConnections = {};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());

/* =========================================================
   USERS
========================================================= */
app.post("/users", async (req, res) => {
  try {
    const { name, email, accessLevel } = req.body;
    if (!name || !email)
      return res.status(400).json({ success: false, message: "Nome e email são obrigatórios" });

    const userRef = await db.collection("DHO_users").add({
      name,
      email,
      accessLevel: accessLevel || "user",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const doc = await userRef.get();
    return res.status(201).json({ success: true, data: { id: doc.id, ...doc.data() } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro interno" });
  }
});

app.get("/users", async (_req, res) => {
  try {
    const snap = await db.collection("DHO_users").get();
    return res.status(200).json({
      success: true,
      data: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao listar usuários" });
  }
});

app.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, accessLevel } = req.body;

    const userRef = db.collection("DHO_users").doc(id);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
      return res.status(404).json({ success: false, message: "Usuário não encontrado" });

    await userRef.update({
      name,
      email,
      accessLevel,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedUser = await userRef.get();
    return res.status(200).json({ success: true, data: { id: updatedUser.id, ...updatedUser.data() } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao atualizar usuário" });
  }
});

app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection("DHO_users").doc(id).delete();
    return res.status(200).json({ success: true, message: "Usuário removido" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao deletar usuário" });
  }
});

/* =========================================================
   DASHBOARDS
========================================================= */
app.post("/dashboard", async (req, res) => {
  try {
    const { title, url, description } = req.body;
    if (!title || !url)
      return res.status(400).json({ success: false, message: "Título e URL são obrigatórios" });

    const dashRef = await db.collection("DHO_dashboards").add({
      title,
      url,
      description: description || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const doc = await dashRef.get();
    return res.status(201).json({ success: true, data: { id: doc.id, ...doc.data() } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao criar dashboard" });
  }
});

app.get("/dashboard", async (_req, res) => {
  try {
    const snap = await db.collection("DHO_dashboards").get();
    const dashboards = await Promise.all(
      snap.docs.map(async (doc) => {
        const accessSnap = await db
          .collection("DHO_dashboard_access_email")
          .where("dashboardID", "==", doc.id)
          .where("isActive", "==", true)
          .get();
        const emailsWithAccess = accessSnap.docs.map((d) => d.data().email);
        return { id: doc.id, ...doc.data(), emailsWithAccess };
      })
    );
    return res.status(200).json({ success: true, data: dashboards });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao listar dashboards" });
  }
});

app.delete("/dashboards/:id", async (req, res) => {
  try {
    await db.collection("DHO_dashboards").doc(req.params.id).delete();
    return res.status(200).json({ success: true, message: "Dashboard removida" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao remover dashboard" });
  }
});

/* =========================================================
   ACESSO POR EMAIL
========================================================= */
app.post("/dashboard/access-email", async (req, res) => {
  try {
    const { dashboardID, email } = req.body;
    if (!dashboardID || !email)
      return res.status(400).json({ success: false, message: "dashboardID e email são obrigatórios" });

    const existing = await db
      .collection("DHO_dashboard_access_email")
      .where("dashboardID", "==", dashboardID)
      .where("email", "==", email)
      .get();

    if (!existing.empty) {
      await existing.docs[0].ref.update({ isActive: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return res.status(200).json({ success: true, message: "Acesso reativado para este e-mail" });
    }

    await db.collection("DHO_dashboard_access_email").add({
      dashboardID,
      email,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true, message: "Acesso concedido" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao criar acesso" });
  }
});

app.get("/dashboard/access-email", async (req, res) => {
  try {
    const { dashboardID } = req.query;
    if (!dashboardID) return res.status(400).json({ success: false, message: "dashboardID é obrigatório" });

    const snap = await db
      .collection("DHO_dashboard_access_email")
      .where("dashboardID", "==", dashboardID)
      .where("isActive", "==", true)
      .get();

    return res.status(200).json({ success: true, data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao listar acessos" });
  }
});

app.delete("/dashboard/access-email", async (req, res) => {
  try {
    const { dashboardID, email } = req.body;
    const snap = await db
      .collection("DHO_dashboard_access_email")
      .where("dashboardID", "==", dashboardID)
      .where("email", "==", email)
      .where("isActive", "==", true)
      .get();

    if (snap.empty) return res.status(404).json({ success: false, message: "Acesso não encontrado" });

    await snap.docs[0].ref.update({ isActive: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ success: true, message: "Acesso removido" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao remover acesso" });
  }
});

/* =========================================================
   CONSULTA: DASHBOARDS POR EMAIL
========================================================= */
app.get("/dashboard/email/:email", async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const snap = await db
      .collection("DHO_dashboard_access_email")
      .where("email", "==", email)
      .where("isActive", "==", true)
      .get();

    const permissions = [];
    const dashIDs = new Set();
    snap.forEach((doc) => {
      const data = doc.data();
      dashIDs.add(data.dashboardID);
      permissions.push({ id: doc.id, ...data });
    });

    const dashboards = [];
    for (const dashboardID of dashIDs) {
      const dashSnap = await db.collection("DHO_dashboards").doc(dashboardID).get();
      if (dashSnap.exists) dashboards.push({ id: dashboardID, ...dashSnap.data() });
    }

    return res.status(200).json({ success: true, dashboards, accessDetails: permissions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao buscar permissões de dashboards" });
  }
});

/* =========================================================
   TRACKING DE CLIQUES
========================================================= */
app.post("/dashboard/click", async (req, res) => {
  try {
    const { dashboardID, userEmail } = req.body;
    await db.collection("DHO_dashboard_clicks").add({
      dashboardID,
      userEmail,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(201).json({ success: true, message: "Clique registrado" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao registrar clique" });
  }
});

app.get("/dashboard/clicks", async (_req, res) => {
  try {
    const snap = await db.collection("DHO_dashboard_clicks").get();
    return res.json({ success: true, data: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao listar cliques" });
  }
});

/* =========================================================
   AUTH SSO FIREBASE
========================================================= */
app.post("/auth/sso-firebase", async (req, res) => {
  try {
    const { email } = req.body;
    const snap = await db.collection("DHO_users").where("email", "==", email).get();

    if (snap.empty) {
      return res.status(200).json({
        success: true,
        user: { name: email, email, accessLevel: "user", team: "Geral" },
      });
    }

    const userData = snap.docs[0].data();
    return res.status(200).json({
      success: true,
      user: {
        name: userData.name,
        email: userData.email,
        accessLevel: userData.accessLevel,
        team: userData.team || "Geral",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Erro na autenticação" });
  }
});

/* =========================================================
   CHAT SSE
========================================================= */
app.get("/chat/stream/:email", (req, res) => {
  const email = req.params.email;
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  sseConnections[email] = res;
  console.log("🔌 Nova conexão SSE:", email);

  const interval = setInterval(() => {
    res.write("event: ping\n");
    res.write("data: {}\n\n");
  }, 30000);

  req.on("close", () => {
    console.log("❌ Conexão SSE fechada:", email);
    clearInterval(interval);
    delete sseConnections[email];
  });
});

app.post("/chat/response", (req, res) => {
  const { email, message } = req.body;
  if (!email || !message) return res.status(400).json({ success: false, message: "Dados inválidos" });

  const connection = sseConnections[email];
  if (!connection) {
    console.log("⚠ Nenhuma conexão SSE ativa para:", email);
    return res.status(200).json({ success: true, message: "Nenhum cliente online" });
  }

  connection.write("event: message\n");
  connection.write(`data: ${JSON.stringify({ message })}\n\n`);
  console.log("💬 Mensagem SSE enviada para:", email);

  return res.json({ success: true });
});

/* =========================================================
   EXPORT BACKEND
========================================================= */

// const PORT = 3001;
// app.listen(PORT, () => console.log(`API online na porta ${PORT}`));

exports.backend_staging = functions.https.onRequest(app); //staging
//exports.api = functions.https.onRequest(app); //dev
