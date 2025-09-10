// npm init -y
// npm install express cors dotenv firebase-admin
// Se usar o firebase é diferente, não precisa desses inits,
// simplesmente iniciar o firebase
// npm init - y
//  - firebase init - firebase login - firebase functions
// antes de fazer deploy precisamos corrigir os
// problemas de linting: npx eslint . --fix
// modificar o json: scripts = node index.js
// ativar o servidor pela pasta functions
// firebase emulators:start --only functions
// firebase deploy --only functions


const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const serviceAccount = require("./config/serviceAccountKey.json");
const functions = require("firebase-functions");
const bcrypt = require("bcrypt");

// Inicializa o Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sebratel-tecnologia.firebaseio.com",
});
const db = admin.firestore();
const app = express();


app.use(cors());
app.use(express.json());


// Rota de teste
app.get("/", (req, res) => {
  res.send("API funcionando! 🚀");
});

// Endpoint para login
app.post("/login", async (req, res) => {
  const {email, password} = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "E-mail e senha são obrigatórios.",
    });
  }

  try {
    // Busca o usuário pelo e-mail no banco de dados
    const usersRef = db.collection("DHO_users");
    const snapshot = await usersRef.where("email", "==", email).get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado.",
      });
    }

    const user = snapshot.docs[0].data();

    // Compara a senha fornecida com o hash armazenado
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Senha incorreta.",
      });
    }

    // Remove a senha do objeto do usuário antes de enviar a resposta
    delete user.password;

    res.status(200).json({
      success: true,
      user, // Retorna os dados do usuário (sem a senha)
    });
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno no servidor.",
    });
  }
});

// PUT /users/:id
app.put("/users/:id", async (req, res) => {
  const {id} = req.params;
  const {name, email, accessLevel, team} = req.body;

  try {
    const userRef = db.collection("DHO_users").doc(id);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado.",
      });
    }

    await userRef.update({
      name,
      email,
      accessLevel,
      team,
    });

    res.status(200).json({
      success: true,
      message: "Usuário atualizado com sucesso!",
    });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno no servidor.",
    });
  }
});

// Rota para listar todos os usuários
app.get("/users", async (req, res) => {
  try {
    const usersRef = db.collection("DHO_users");
    const snapshot = await usersRef.get();
    const users = [];
    snapshot.forEach((doc) => {
      users.push({id: doc.id, ...doc.data()});
    });

    res.status(200).json(users);
  } catch (err) {
    console.error("Erro ao buscar usuários:", err);
    res.status(500).json({message: "Erro interno no servidor."});
  }
});


// Endpoint para deletar um usuário pelo ID
app.delete("/users/:id", async (req, res) => {
  const {id} = req.params;

  try {
    await db.collection("DHO_users").doc(id).delete();
    res.status(200).json({message: "Usuário excluído com sucesso!"});
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);
    res.status(500).json({message: "Erro interno no servidor."});
  }
});

// Endpoint para criar um novo usuário
app.post("/users", async (req, res) => {
  const {name, email, accessLevel, team} = req.body;

  try {
    const docRef = await db.collection("DHO_users").add({
      name,
      email,
      accessLevel,
      team,
    });

    res.status(201).json({
      success: true,
      message: "Usuário salvo com sucesso!",
      id: docRef.id,
    });
  } catch (error) {
    console.error("Erro ao salvar usuário:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno no servidor.",
    });
  }
});


// Rota para verificar se o e-mail já tem senha
app.post("/check-email", async (req, res) => {
  const {email} = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "O campo e-mail é obrigatório.",
    });
  }

  try {
    const usersRef = db.collection("DHO_users");
    const snapshot = await usersRef.where("email", "==", email).get();

    if (snapshot.empty) {
      // E-mail não existe no banco
      return res.status(200).json({
        success: true,
        exists: false,
        message: "E-mail não encontrado.",
      });
    }

    const user = snapshot.docs[0].data();
    // Verifica se o campo password existe e não é vazio
    const hasPassword = !!user.password;

    res.status(200).json({
      success: true,
      exists: hasPassword,
      message: hasPassword ?
      "E-mail já possui uma senha registrada." :
      "E-mail existe, mas sem senha.",
    });
  } catch (error) {
    console.error("Erro ao verificar e-mail:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno no servidor.",
    });
  }
});

// Endpoint para atualizar senha do usuário
app.post("/change-password", async (req, res) => {
  const {email, password} = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "E-mail e senha são obrigatórios.",
    });
  }

  try {
    const usersRef = db.collection("DHO_users");
    const snapshot = await usersRef.where("email", "==", email).get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Usuário não encontrado.",
      });
    }

    // gera a hash na senha
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // atualização da senha no banco de dados com hash
    const doc = snapshot.docs[0];
    await doc.ref.update({password: hashedPassword});

    res.status(200).json({
      success: true,
      message: "Senha alterada com sucesso!",
    });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno no servidor.",
    });
  }
});


//Cria novo dashboard
app.post ('/dashboard', async (req, res) => {
  try{
    const {title, description, url, thumbnail} = req.body;

    const docRef = await db.collection('DHO_dashboards').add({
      title,
      description,
      url,
      thumbnail: thumbnail || '',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updateAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ id: docRef.id});
  } catch (error) {
    console.error("Error creating dashboard:", error);
    res.status(500).send("Error creating dashboard");
  }
});

// Pega as informações de dashboards
app.get('/dashboard', async (req, res) => {
  try {
    const snapshot = await db.collection('DHO_dashboards')
      .where('isActive', '==', true)
      .get();
    
    const dashboards = await Promise.all(
      snapshot.docs.map(async doc => {
        const dashboardData = doc.data();
        
        // Busca os times com acesso a este dashboard
        const accessSnapshot = await db.collection('DHO_dashboard_access')
          .where('dashboardID', '==', doc.id)
          .where('isActive', '==', true)
          .get();
        
        const teamsWithAccess = accessSnapshot.docs.map(accessDoc => 
          accessDoc.data().team
        );

        return {
          id: doc.id,
          ...dashboardData,
          teamsWithAccess // Adiciona a lista de times com acesso
        };
      })
    );
    
    res.status(200).json(dashboards);
  } catch (error) {
    console.error("Error fetching all dashboards:", error);
    res.status(500).send('Error fetching dashboards');
  }
});

//Definir acesso ao dashboard
app.post('/dashboard/access', async (req, res) => {
  try {
    const { dashboardID, team, accessLevel = 'view' } = req.body;
  
    if (!dashboardID || !team) {
      return res.status(400).json({
        success: false,
        message: 'ID do dashboard e time são obrigatórios'
      });
    }

    // Verifica se o dashboard existe
    const dashboardRef = await db.collection('DHO_dashboards').doc(dashboardID).get();
    if (!dashboardRef.exists) {
      return res.status(404).json({
        success: false,
        message: 'Dashboard não encontrado'
      });
    }

    await db.collection('DHO_dashboard_access').add({
      dashboardID,
      team,
      accessLevel, // Corrigido o typo (era "accesLevel")
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Regra de acesso criada com sucesso'
    });
  } catch (error) {
    console.error("Error creating access rule:", error);
    res.status(500).json({
      success: false,
      message: "Error creating access rule"
    });
  }
});

// Busca dashboard por time do usuário
app.get('/dashboard/team/:team', async (req, res) => {
  try {
    const { team } = req.params;
    console.log(`Buscando dashboards para o time: ${team}`);

    // 1. Buscar regras de acesso
    const accessSnapshot = await db.collection('DHO_dashboard_access')
      .where('team', '==', team)
      .where('isActive', '==', true)
      .get();

    if (accessSnapshot.empty) {
      console.log('Nenhuma regra de acesso encontrada para o time:', team);
      return res.status(200).json([]);
    }

    // Corrigido: usando o nome do campo correto (dashboardID)
    const dashboardIDs = accessSnapshot.docs.map(doc => doc.data().dashboardID);
    console.log('IDs de dashboards com acesso:', dashboardIDs);

    // 2. Buscar dashboards em lotes (para contornar limite de 10 elementos)
    const dashboards = [];
    const batchSize = 10; // Limite do Firestore para operador 'in'
    
    for (let i = 0; i < dashboardIDs.length; i += batchSize) {
      const batch = dashboardIDs.slice(i, i + batchSize);
      const snapshot = await db.collection('DHO_dashboards')
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .where('isActive', '==', true)
        .get();

      snapshot.docs.forEach(doc => {
        dashboards.push({
          id: doc.id,
          ...doc.data()
        });
      });
    }

    console.log(`Total de dashboards encontrados: ${dashboards.length}`);
    res.status(200).json(dashboards); // Corrigido o typo "statut" para "status"
    
  } catch (error) {
    console.error("Erro ao buscar dashboards:", error);
    res.status(500).send('Erro interno ao buscar dashboards');
  }
});

//Rotas para criação de novos times
app.post('/teams', async (req, res) => {
  try {
    const { name, description } = req.body;

    // Validação robusta do nome
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Nome do time é obrigatório e deve ser um texto válido.'
      });
    }

    // Normaliza o nome para evitar duplicatas com variações de case/espaços
    const normalizedName = name.trim().toLowerCase();

    // Verifica se o time já existe (case insensitive)
    const existingTeam = await db.collection('DHO_teams')
      .where('nameNormalized', '==', normalizedName)
      .get();

    if (!existingTeam.empty) {
      return res.status(409).json({ // 409 Conflict é mais semântico para recursos duplicados
        success: false,
        message: 'Já existe um time com este nome.'
      });
    }

    // Cria o documento no Firestore
    const teamRef = await db.collection('DHO_teams').add({
      name: name.trim(),
      nameNormalized: normalizedName, // Campo adicional para buscas case-insensitive
      description: (description || '').trim(), // Garante que description seja string
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Resposta de sucesso
    res.status(201).json({
      success: true,
      message: 'Time criado com sucesso!',
      id: teamRef.id,
      name: name.trim() // Retorna o nome formatado
    });

  } catch (error) {
    console.error('Erro ao criar time:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno no servidor.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined // Mostra detalhes apenas em desenvolvimento
    });
  }
});

// Rota para listar times ativos
app.get('/teams', async (req, res) => {
  try {
    console.log('Acessando Firestore para buscar times...');
    
    // Query mais simples para teste inicial
    const snapshot = await db.collection('DHO_teams').get();
    
    console.log(`Encontrados ${snapshot.size} documentos`);

    const teams = [];
    snapshot.forEach(doc => {
      console.log(`Processando documento ${doc.id}`);
      teams.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log('Times processados:', teams);
    
    return res.status(200).json({
      success: true,
      data: teams
    });

  } catch (error) {
    console.error('ERRO NO BACKEND:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      firestoreError: error
    });
    
    return res.status(500).json({
      success: false,
      message: 'Falha ao buscar times',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

 // Atualiza um time existente
 app.put('/teams/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  try {
    const teamRef = db.collection('DHO_teams').doc(id);
    const doc = await teamRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Time não encontrado.'
      });
    }

    await teamRef.update({
      name,
      description,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Time atualizado com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao atualizar time:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno no servidor.'
    });
  }
});

// Desativar time (delete lógico)
app.delete('/teams/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const teamRef = db.collection('DHO_teams').doc(id);
    const doc = await teamRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Time não encontrado.'
      });
    }

    await teamRef.delete(); // <- Aqui você deleta o documento de verdade

    res.status(200).json({
      success: true,
      message: 'Time deletado com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao deletar time:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno no servidor.'
    });
  }
});


// 1. Rota para buscar acessos de um dashboard específico
app.get('/dashboard/access', async (req, res) => {
  try {
    const { dashboardId } = req.query;
    
    if (!dashboardId) {
      return res.status(400).json({
        success: false,
        message: 'ID do dashboard é obrigatório'
      });
    }

    const snapshot = await db.collection('DHO_dashboard_access')
      .where('dashboardID', '==', dashboardId)
      .where('isActive', '==', true)
      .get();

    const accessRules = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({
      success: true,
      data: accessRules
    });

  } catch (error) {
    console.error('Erro ao buscar regras de acesso:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar regras de acesso'
    });
  }
});

// 2. Rota para criar/atualizar acesso (já existente)
app.post('/dashboard/access', async (req, res) => {
  try {
    const { dashboardID, team, accessLevel = 'view' } = req.body;

    if (!dashboardID || !team) {
      return res.status(400).json({
        success: false,
        message: 'ID do dashboard e time são obrigatórios'
      });
    }

    // Verifica se já existe uma regra para este dashboard+time
    const existingRule = await db.collection('DHO_dashboard_access')
      .where('dashboardID', '==', dashboardID)
      .where('team', '==', team)
      .where('isActive', '==', true)
      .get();

    let result;
    if (!existingRule.empty) {
      // Atualiza regra existente
      const docId = existingRule.docs[0].id;
      await db.collection('DHO_dashboard_access').doc(docId).update({
        accessLevel,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      result = { id: docId, action: 'updated' };
    } else {
      // Cria nova regra
      const docRef = await db.collection('DHO_dashboard_access').add({
        dashboardID,
        team,
        accessLevel,
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      result = { id: docRef.id, action: 'created' };
    }

    res.status(200).json({
      success: true,
      message: 'Regra de acesso atualizada com sucesso',
      data: result
    });

  } catch (error) {
    console.error('Erro ao atualizar regra de acesso:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar regra de acesso'
    });
  }
});

// 3. Rota para remover acesso (delete lógico)
app.delete('/dashboard/access', async (req, res) => {
  try {
    const { dashboardID, team } = req.body;

    if (!dashboardID || !team) {
      return res.status(400).json({
        success: false,
        message: 'ID do dashboard e time são obrigatórios'
      });
    }

    // Busca a regra para desativar
    const snapshot = await db.collection('DHO_dashboard_access')
      .where('dashboardID', '==', dashboardID)
      .where('team', '==', team)
      .where('isActive', '==', true)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: 'Regra de acesso não encontrada'
      });
    }

    const docId = snapshot.docs[0].id;
    await db.collection('DHO_dashboard_access').doc(docId).update({
      isActive: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).json({
      success: true,
      message: 'Acesso removido com sucesso'
    });

  } catch (error) {
    console.error('Erro ao remover acesso:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover acesso'
    });
  }
});

//API para deletar as dashboards
app.delete("/dashboards/:id", async (req, res) => {
  const { id } = req.params;
  try {

    const docRef = db.collection('DHO_dashboards').doc(id);
    await docRef.delete();

    res.status(200).json({ message: "Dashboard deletado com sucesso." });
  } catch (error) {
    console.error("Erro detalhado ao deletar dashboard:", error); // Isso vai para os logs do Firebase
    res.status(500).json({ error: "Erro ao deletar dashboard." });
  }
});

//API para editar os nomes das dashboards
app.put("/dashboards/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description, url } = req.body;

  if (!title && !description && !url) {
    return res.status(400).json({ error: "É necessário fornecer título ou descrição." });
  }

  try {
    const dashboardRef = db.collection("DHO_dashboards").doc(id);
    const doc = await dashboardRef.get(); // Verifica se o documento existe

    if (!doc.exists) {
      return res.status(404).json({ error: "Dashboard não encontrada." });
    }

    const update = {};
    if (title) update.title = title;
    if (description) update.description = description;
    if (url) update.url = url;

    // Adiciona o campo de atualização de data/hora
    update.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await dashboardRef.update(update);

    // Opcional: Retornar o documento atualizado. No Firestore, você precisa buscá-lo novamente.
    const updatedDoc = await dashboardRef.get();
    const updatedDashboardData = { id: updatedDoc.id, ...updatedDoc.data() };

    res.status(200).json(updatedDashboardData);
  } catch (error) {
    console.error("Erro ao atualizar dashboard:", error); // Log detalhado para depuração
    res.status(500).json({ error: "Erro ao atualizar dashboard." });
  }
});


// //definindo porta padrão para servidor local (firebase functions não utilizará)
// const PORT = 5000
// //inicializando
// app.listen(PORT, () => {
//     console.log(`Servidor rodando na porta ${PORT}`)
// })

// Exporta a API para o Firebase Functions
exports.api = functions.https.onRequest(app);
