// index.js (Firebase Functions + Express)
// Requerimentos:
// npm install express cors firebase-admin firebase-functions bcrypt google-auth-library

const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");
const serviceAccount = require("./config/serviceAccountKey.json"); // ajuste o caminho se necessário

// ----------------------
// Configs / Constantes
// ----------------------
const CLIENT_ID = "46833138450-ps3eevvdcmlfg5l563lqtjgan1cal1d5.apps.googleusercontent.com";
const DOMINIO_CORPORATIVO = "sebratel.com.br"; 
const client = new OAuth2Client(CLIENT_ID);

// ----------------------
// Inicializa Firebase Admin
// ----------------------
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sebratel-tecnologia.firebaseio.com",
});
const db = admin.firestore();

// ----------------------
// App Express
// ----------------------
const app = express();

// CORS - permitimos todas origens durante desenvolvimento; em produção restrinja
app.use(cors({ origin: true }));
app.use(express.json());

// ----------------------
// Rotas
// ----------------------

// Rota de teste
app.get("/", (req, res) => {
  res.send("API funcionando! 🚀");
});


// ---------- Auth: login tradicional ----------
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: "E-mail e senha são obrigatórios." });

  try {
    const snapshot = await db.collection("DHO_users").where("email", "==", email).get();
    if (snapshot.empty) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    const isPasswordValid = await bcrypt.compare(password, user.password || "");
    if (!isPasswordValid) return res.status(401).json({ success: false, message: "Senha incorreta." });

    delete user.password;
    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    return res.status(500).json({ success: false, message: "Erro interno no servidor." });
  }
});


// ---------- Usuários CRUD ----------
app.get("/users", async (req, res) => {
  try {
    const snapshot = await db.collection("DHO_users").get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(users);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});

app.post("/users", async (req, res) => {
  const { name, email, accessLevel, team } = req.body;
  try {
    const ref = await db.collection("DHO_users").add({ name, email, accessLevel, team });
    return res.status(201).json({ success: true, message: "Usuário salvo com sucesso!", id: ref.id });
  } catch (error) {
    console.error("Erro ao salvar usuário:", error);
    return res.status(500).json({ success: false, message: "Erro interno no servidor." });
  }
});

app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email, accessLevel, team } = req.body;
  try {
    const userRef = db.collection("DHO_users").doc(id);
    const doc = await userRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

    await userRef.update({ name, email, accessLevel, team });
    return res.status(200).json({ success: true, message: "Usuário atualizado com sucesso!" });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    return res.status(500).json({ success: false, message: "Erro interno no servidor." });
  }
});

app.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection("DHO_users").doc(id).delete();
    return res.status(200).json({ message: "Usuário excluído com sucesso!" });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);
    return res.status(500).json({ message: "Erro interno no servidor." });
  }
});


// ---------- Verifica email / altera senha ----------
app.post("/check-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "O campo e-mail é obrigatório." });

  try {
    const snapshot = await db.collection("DHO_users").where("email", "==", email).get();
    if (snapshot.empty) return res.status(200).json({ success: true, exists: false, message: "E-mail não encontrado." });

    const user = snapshot.docs[0].data();
    const hasPassword = !!user.password;
    return res.status(200).json({ success: true, exists: hasPassword, message: hasPassword ? "E-mail já possui uma senha registrada." : "E-mail existe, mas sem senha." });
  } catch (error) {
    console.error("Erro ao verificar e-mail:", error);
    return res.status(500).json({ success: false, message: "Erro interno no servidor." });
  }
});

app.post("/change-password", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: "E-mail e senha são obrigatórios." });

  try {
    const snapshot = await db.collection("DHO_users").where("email", "==", email).get();
    if (snapshot.empty) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

    const hashedPassword = await bcrypt.hash(password, 10);
    await snapshot.docs[0].ref.update({ password: hashedPassword });
    return res.status(200).json({ success: true, message: "Senha alterada com sucesso!" });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return res.status(500).json({ success: false, message: "Erro interno no servidor." });
  }
});


// ---------- Dashboards ----------
app.post("/dashboard", async (req, res) => {
  try {
    const { title, description, url, thumbnail } = req.body;
    const docRef = await db.collection("DHO_dashboards").add({
      title,
      description,
      url,
      thumbnail: thumbnail || '',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ id: docRef.id });
  } catch (error) {
    console.error("Error creating dashboard:", error);
    return res.status(500).send("Error creating dashboard");
  }
});

app.get("/dashboard", async (req, res) => {
  try {
    const snapshot = await db.collection("DHO_dashboards").where("isActive", "==", true).get();
    const dashboards = await Promise.all(snapshot.docs.map(async doc => {
      const dashboardData = doc.data();
      const accessSnapshot = await db.collection("DHO_dashboard_access").where("dashboardID", "==", doc.id).where("isActive", "==", true).get();
      const teamsWithAccess = accessSnapshot.docs.map(d => d.data().team);
      return { id: doc.id, ...dashboardData, teamsWithAccess };
    }));
    return res.status(200).json(dashboards);
  } catch (error) {
    console.error("Error fetching all dashboards:", error);
    return res.status(500).send('Error fetching dashboards');
  }
});

app.get("/dashboard/team/:team", async (req, res) => {
  try {
    const { team } = req.params;
    const accessSnapshot = await db.collection("DHO_dashboard_access").where("team", "==", team).where("isActive", "==", true).get();
    if (accessSnapshot.empty) return res.status(200).json([]);

    const dashboardIDs = accessSnapshot.docs.map(d => d.data().dashboardID);
    const dashboards = [];
    const batchSize = 10;
    for (let i = 0; i < dashboardIDs.length; i += batchSize) {
      const batch = dashboardIDs.slice(i, i + batchSize);
      const snap = await db.collection("DHO_dashboards").where(admin.firestore.FieldPath.documentId(), "in", batch).where("isActive", "==", true).get();
      snap.docs.forEach(doc => dashboards.push({ id: doc.id, ...doc.data() }));
    }
    return res.status(200).json(dashboards);
  } catch (error) {
    console.error("Erro ao buscar dashboards:", error);
    return res.status(500).send('Erro interno ao buscar dashboards');
  }
});

app.delete("/dashboards/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('DHO_dashboards').doc(id).delete();
    return res.status(200).json({ message: "Dashboard deletado com sucesso." });
  } catch (error) {
    console.error("Erro detalhado ao deletar dashboard:", error);
    return res.status(500).json({ error: "Erro ao deletar dashboard." });
  }
});

app.put("/dashboards/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description, url } = req.body;
  if (!title && !description && !url) return res.status(400).json({ error: "É necessário fornecer título ou descrição." });

  try {
    const dashboardRef = db.collection("DHO_dashboards").doc(id);
    const doc = await dashboardRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Dashboard não encontrada." });

    const update = {};
    if (title) update.title = title;
    if (description) update.description = description;
    if (url) update.url = url;
    update.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await dashboardRef.update(update);
    const updatedDoc = await dashboardRef.get();
    return res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    console.error("Erro ao atualizar dashboard:", error);
    return res.status(500).json({ error: "Erro ao atualizar dashboard." });
  }
});


// ---------- Dashboard Access (create/update/delete/get) ----------
app.get("/dashboard/access", async (req, res) => {
  try {
    const { dashboardId } = req.query;
    if (!dashboardId) return res.status(400).json({ success: false, message: 'ID do dashboard é obrigatório' });

    const snapshot = await db.collection('DHO_dashboard_access').where('dashboardID', '==', dashboardId).where('isActive', '==', true).get();
    const accessRules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ success: true, data: accessRules });
  } catch (error) {
    console.error('Erro ao buscar regras de acesso:', error);
    return res.status(500).json({ success: false, message: 'Erro ao buscar regras de acesso' });
  }
});

app.post("/dashboard/access", async (req, res) => {
  try {
    const { dashboardID, team, accessLevel = 'view' } = req.body;
    if (!dashboardID || !team) return res.status(400).json({ success: false, message: 'ID do dashboard e time são obrigatórios' });

    const existingRule = await db.collection('DHO_dashboard_access').where('dashboardID', '==', dashboardID).where('team', '==', team).where('isActive', '==', true).get();
    let result;
    if (!existingRule.empty) {
      const docId = existingRule.docs[0].id;
      await db.collection('DHO_dashboard_access').doc(docId).update({ accessLevel, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      result = { id: docId, action: 'updated' };
    } else {
      const docRef = await db.collection('DHO_dashboard_access').add({ dashboardID, team, accessLevel, isActive: true, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      result = { id: docRef.id, action: 'created' };
    }
    return res.status(200).json({ success: true, message: 'Regra de acesso atualizada com sucesso', data: result });
  } catch (error) {
    console.error('Erro ao atualizar regra de acesso:', error);
    return res.status(500).json({ success: false, message: 'Erro ao atualizar regra de acesso' });
  }
});

app.delete("/dashboard/access", async (req, res) => {
  try {
    const { dashboardID, team } = req.body;
    if (!dashboardID || !team) return res.status(400).json({ success: false, message: 'ID do dashboard e time são obrigatórios' });

    const snapshot = await db.collection('DHO_dashboard_access').where('dashboardID', '==', dashboardID).where('team', '==', team).where('isActive', '==', true).get();
    if (snapshot.empty) return res.status(404).json({ success: false, message: 'Regra de acesso não encontrada' });

    const docId = snapshot.docs[0].id;
    await db.collection('DHO_dashboard_access').doc(docId).update({ isActive: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.status(200).json({ success: true, message: 'Acesso removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover acesso:', error);
    return res.status(500).json({ success: false, message: 'Erro ao remover acesso' });
  }
});


// ---------- Teams CRUD ----------
app.post("/teams", async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') return res.status(400).json({ success: false, message: 'Nome do time é obrigatório.' });

    const normalizedName = name.trim().toLowerCase();
    const existingTeam = await db.collection('DHO_teams').where('nameNormalized', '==', normalizedName).get();
    if (!existingTeam.empty) return res.status(409).json({ success: false, message: 'Já existe um time com este nome.' });

    const teamRef = await db.collection('DHO_teams').add({
      name: name.trim(),
      nameNormalized: normalizedName,
      description: (description || '').trim(),
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({ success: true, message: 'Time criado com sucesso!', id: teamRef.id, name: name.trim() });
  } catch (error) {
    console.error('Erro ao criar time:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
  }
});

app.get("/teams", async (req, res) => {
  try {
    const snapshot = await db.collection('DHO_teams').get();
    const teams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ success: true, data: teams });
  } catch (error) {
    console.error('ERRO NO BACKEND:', error);
    return res.status(500).json({ success: false, message: 'Falha ao buscar times' });
  }
});

app.put("/teams/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const teamRef = db.collection('DHO_teams').doc(id);
    const doc = await teamRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Time não encontrado.' });

    await teamRef.update({ name, description, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.status(200).json({ success: true, message: 'Time atualizado com sucesso!' });
  } catch (error) {
    console.error('Erro ao atualizar time:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
  }
});

app.delete("/teams/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const teamRef = db.collection('DHO_teams').doc(id);
    const doc = await teamRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Time não encontrado.' });

    await teamRef.delete();
    return res.status(200).json({ success: true, message: 'Time deletado com sucesso!' });
  } catch (error) {
    console.error('Erro ao deletar time:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor.' });
  }
});


// ---------- Firebase SSO endpoint ----------
app.post("/auth/sso-firebase", async (req, res) => {
  const { firebaseIdToken } = req.body;
  if (!firebaseIdToken) return res.status(400).json({ success: false, message: "Token não fornecido." });

  try {
    const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
    const userEmail = decodedToken.email;
    if (!userEmail || !userEmail.endsWith(`@${DOMINIO_CORPORATIVO}`)) {
      return res.status(401).json({ success: false, message: `Acesso restrito a contas corporativas do domínio ${DOMINIO_CORPORATIVO}` });
    }

    const snapshot = await db.collection("DHO_users").where("email", "==", userEmail).get();
    if (snapshot.empty) return res.status(404).json({ success: false, message: "Usuário corporativo não cadastrado no sistema de dashboards. Contate o administrador." });

    const user = snapshot.docs[0].data();
    return res.status(200).json({ success: true, user: { email: user.email, accessLevel: user.accessLevel, team: user.team } });

  } catch (error) {
    console.error("Erro no processo de Firebase SSO:", error);
    return res.status(500).json({ success: false, message: "Falha na autenticação. Verifique o token ou as configurações do Firebase." });
  }
});


// ----------------------
// Export para Firebase Functions
// ----------------------
exports.api = functions.https.onRequest(app);
