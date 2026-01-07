// index.js — Backend Staging Firebase
// IMPORTS — sempre primeiro
const express = require("express");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const cors = require("cors");
const { OAuth2Client } = require("google-auth-library");

// INICIALIZAÇÃO DO FIREBASE — sempre logo após os imports
admin.initializeApp();

// FIRESTORE
const db = admin.firestore();

// CONFIG
const sseConnections = {};
const CLIENT_ID = "46833138450-ps3eevvdcmlfg5l563lqtjgan1cal1d5.apps.googleusercontent.com";
const DOMINIO_CORPORATIVO = "sebratel.com.br";
const client = new OAuth2Client(CLIENT_ID);

// EXPRESS
const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});


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


app.put("/dashboards/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, url, description } = req.body;

    if (!title || !url)
      return res.status(400).json({ success: false, message: "Título e URL são obrigatórios" });

    const dashRef = db.collection("DHO_dashboards").doc(id);
    const snap = await dashRef.get();

    if (!snap.exists)
      return res.status(404).json({ success: false, message: "Dashboard não encontrado" });

    await dashRef.update({
      title,
      url,
      description: description || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updated = await dashRef.get();
    return res.status(200).json({ success: true, data: { id: updated.id, ...updated.data() } });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Erro ao atualizar dashboard" });
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
   AUTH SSO FIREBASE
========================================================= */

app.post("/auth/sso-firebase", async (req, res) => {
  const { firebaseIdToken } = req.body;
  if (!firebaseIdToken) return res.status(400).json({ success: false, message: "Token não fornecido." });

  try {
    // 1. Decodificar o token e extrair dados do Google/Firebase
    const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
    const userEmail = decodedToken.email;
    // NOVO: Extrair o nome e a URL da foto do token decodificado
    const userName = decodedToken.name;
    const userPhotoUrl = decodedToken.picture; // 'picture' é a propriedade da URL da foto no JWT

    if (!userEmail || !userEmail.endsWith(`@${DOMINIO_CORPORATIVO}`)) {
      return res.status(401).json({ success: false, message: `Acesso restrito a contas corporativas do domínio ${DOMINIO_CORPORATIVO}` });
    }

    // 2. Buscar dados de permissão no Firestore/DB
    const snapshot = await db.collection("DHO_users").where("email", "==", userEmail).get();
    if (snapshot.empty) return res.status(404).json({ success: false, message: "Usuário corporativo não cadastrado no sistema de dashboards. Contate o administrador." });

    const userPerms = snapshot.docs[0].data();

    // 3. Montar e retornar a resposta COMPLETA
    return res.status(200).json({ 
      success: true, 
      user: { 
        email: userPerms.email, 
        accessLevel: userPerms.accessLevel, 
        team: userPerms.team,
        name: userName, 
        photoUrl: userPhotoUrl
      } 
    });

  } catch (error) {
    console.error("Erro no processo de Firebase SSO:", error);
    return res.status(500).json({ success: false, message: "Falha na autenticação. Verifique o token ou as configurações do Firebase." });
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

const messageQueue = {};

app.post("/chat/response", (req, res) => {
  const { email, message } = req.body;
  if (!email || !message) return res.status(400).json({ success: false });

  if (!sseConnections[email]) {
    // guarda temporariamente
    if (!messageQueue[email]) messageQueue[email] = [];
    messageQueue[email].push(message);
    return res.status(200).json({ success: true, message: "Mensagem aguardando SSE" });
  }

  const connection = sseConnections[email];
  connection.write(`event: message\n`);
  connection.write(`data: ${JSON.stringify({ message })}\n\n`);

  // envia mensagens da fila se houver
  if (messageQueue[email]?.length) {
    messageQueue[email].forEach((msg) => {
      connection.write(`event: message\n`);
      connection.write(`data: ${JSON.stringify({ message: msg })}\n\n`);
    });
    messageQueue[email] = [];
  }

  return res.json({ success: true });
});


/* =========================================================
   EXPORT BACKEND
========================================================= */

// const PORT = 3001;
// app.listen(PORT, () => console.log(`API online na porta ${PORT}`));

exports.backend_staging = onRequest(
  {
    region: "us-central1",
    cors: false, 
  },
  app
);
//exports.api = functions.https.onRequest(app); //dev