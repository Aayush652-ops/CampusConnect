const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initDb, query } = require('./db');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'campusconnect_super_secret_token_key_2026';

app.use(cors());
app.use(express.json());

// Initialize Database tables and seeding
initDb().then(() => {
  console.log("Database initialized successfully.");
}).catch(err => {
  console.error("Database initialization failed:", err);
});

// Middleware for parsing User Auth Token
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = await query.get("SELECT id, username, email, xp, avatar FROM users WHERE id = ?", [verified.id]);
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

// Strictly require authentication
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Access denied. Authentication required." });
  }
  next();
}

// ================= AUTH ENDPOINTS =================

// Register User
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, and password are required." });
  }

  try {
    const existingUser = await query.get("SELECT id FROM users WHERE username = ? OR email = ?", [username, email]);
    if (existingUser) {
      return res.status(409).json({ error: "Username or Email already registered." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const avatar = username.charAt(0).toUpperCase() + username.slice(1, 4);

    const result = await query.run(
      "INSERT INTO users (username, email, password_hash, xp, avatar) VALUES (?, ?, ?, 120, ?)",
      [username.trim(), email.trim(), passwordHash, avatar]
    );

    const token = jwt.sign({ id: result.id, username }, JWT_SECRET, { expiresIn: '7d' });
    
    return res.status(201).json({
      message: "Registration successful!",
      token,
      user: { id: result.id, username, email, xp: 120, avatar }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error during registration." });
  }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;

  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: "Username or Email and password are required." });
  }

  try {
    const user = await query.get(
      "SELECT * FROM users WHERE username = ? OR email = ?",
      [usernameOrEmail.trim(), usernameOrEmail.trim()]
    );

    if (!user) {
      return res.status(401).json({ error: "Invalid username/email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username/email or password." });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      message: "Login successful!",
      token,
      user: { id: user.id, username: user.username, email: user.email, xp: user.xp, avatar: user.avatar }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error during login." });
  }
});

app.get('/api/auth/me', authenticateToken, requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

// ================= OPPORTUNITIES ENDPOINTS =================

// Get all opportunities (with application_url)
app.get('/api/opportunities', authenticateToken, async (req, res) => {
  try {
    const opps = await query.all("SELECT * FROM opportunities");
    
    if (!req.user) {
      const parsedOpps = opps.map(o => ({
        ...o,
        tags: o.tags.split(','),
        registered: false,
        bookmarked: false
      }));
      return res.json(parsedOpps);
    }

    const userId = req.user.id;
    const registrations = await query.all("SELECT opportunity_id FROM registrations WHERE user_id = ?", [userId]);
    const bookmarks = await query.all("SELECT opportunity_id FROM bookmarks WHERE user_id = ?", [userId]);

    const regSet = new Set(registrations.map(r => r.opportunity_id));
    const bookSet = new Set(bookmarks.map(b => b.opportunity_id));

    const parsedOpps = opps.map(o => ({
      ...o,
      tags: o.tags.split(','),
      registered: regSet.has(o.id),
      bookmarked: bookSet.has(o.id)
    }));

    return res.json(parsedOpps);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not fetch opportunities." });
  }
});

// Create new opportunity with custom application_url
app.post('/api/opportunities', authenticateToken, requireAuth, async (req, res) => {
  const { title, type, organizer, date, location, tags, desc, application_url } = req.body;

  if (!title || !type || !organizer || !date || !desc) {
    return res.status(400).json({ error: "Missing required opportunity fields." });
  }

  const id = 'opp-' + Date.now();
  const tagsStr = Array.isArray(tags) ? tags.join(',') : tags || 'Campus';
  const url = application_url || 'https://forms.gle/mockFormDefaultPublish2026';

  try {
    await query.run(
      "INSERT INTO opportunities (id, title, type, organizer, date, location, tags, desc, registered_count, is_hot, application_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)",
      [id, title, type, organizer, date, location || 'Campus', tagsStr, desc, url]
    );

    const inserted = await query.get("SELECT * FROM opportunities WHERE id = ?", [id]);
    return res.status(201).json({
      ...inserted,
      tags: inserted.tags.split(','),
      registered: false,
      bookmarked: false
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not create opportunity." });
  }
});

// Register for opportunity (Commit submission verifying)
app.post('/api/opportunities/:id/register', authenticateToken, requireAuth, async (req, res) => {
  const oppId = req.params.id;
  const userId = req.user.id;

  try {
    const opp = await query.get("SELECT * FROM opportunities WHERE id = ?", [oppId]);
    if (!opp) {
      return res.status(404).json({ error: "Opportunity not found." });
    }

    const registered = await query.get("SELECT * FROM registrations WHERE user_id = ? AND opportunity_id = ?", [userId, oppId]);
    if (registered) {
      return res.status(409).json({ error: "Already registered for this opportunity." });
    }

    await query.run("INSERT INTO registrations (user_id, opportunity_id) VALUES (?, ?)", [userId, oppId]);
    await query.run("UPDATE opportunities SET registered_count = registered_count + 1 WHERE id = ?", [oppId]);
    await query.run("UPDATE users SET xp = xp + 50 WHERE id = ?", [userId]);

    const updatedUser = await query.get("SELECT xp FROM users WHERE id = ?", [userId]);

    return res.json({
      message: "Registration successful!",
      newXP: updatedUser.xp
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not complete registration." });
  }
});

app.post('/api/opportunities/:id/bookmark', authenticateToken, requireAuth, async (req, res) => {
  const oppId = req.params.id;
  const userId = req.user.id;

  try {
    const opp = await query.get("SELECT id FROM opportunities WHERE id = ?", [oppId]);
    if (!opp) {
      return res.status(404).json({ error: "Opportunity not found." });
    }

    const bookmarked = await query.get("SELECT * FROM bookmarks WHERE user_id = ? AND opportunity_id = ?", [userId, oppId]);
    
    let isBookmarkedNow;
    if (bookmarked) {
      await query.run("DELETE FROM bookmarks WHERE user_id = ? AND opportunity_id = ?", [userId, oppId]);
      isBookmarkedNow = false;
    } else {
      await query.run("INSERT INTO bookmarks (user_id, opportunity_id) VALUES (?, ?)", [userId, oppId]);
      isBookmarkedNow = true;
    }

    return res.json({
      message: isBookmarkedNow ? "Bookmark added" : "Bookmark removed",
      bookmarked: isBookmarkedNow
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not toggle bookmark." });
  }
});

// ================= CLUBS & CHAT ENDPOINTS =================

app.get('/api/communities', authenticateToken, async (req, res) => {
  try {
    const clubs = await query.all("SELECT * FROM communities");
    if (!req.user) {
      return res.json(clubs.map(c => ({ ...c, joined: false })));
    }
    const userId = req.user.id;
    const joined = await query.all("SELECT community_id FROM joined_communities WHERE user_id = ?", [userId]);
    const joinedSet = new Set(joined.map(jc => jc.community_id));
    const result = clubs.map(c => ({
      ...c,
      joined: joinedSet.has(c.id)
    }));
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not fetch clubs." });
  }
});

app.post('/api/communities/:id/join', authenticateToken, requireAuth, async (req, res) => {
  const clubId = req.params.id;
  const userId = req.user.id;

  try {
    const club = await query.get("SELECT id FROM communities WHERE id = ?", [clubId]);
    if (!club) {
      return res.status(404).json({ error: "Community club not found." });
    }
    const joined = await query.get("SELECT * FROM joined_communities WHERE user_id = ? AND community_id = ?", [userId, clubId]);
    if (joined) {
      return res.status(409).json({ error: "Already a member of this community." });
    }
    await query.run("INSERT INTO joined_communities (user_id, community_id) VALUES (?, ?)", [userId, clubId]);
    await query.run("UPDATE communities SET members_count = members_count + 1 WHERE id = ?", [clubId]);
    await query.run("UPDATE users SET xp = xp + 50 WHERE id = ?", [userId]);
    const updatedUser = await query.get("SELECT xp FROM users WHERE id = ?", [userId]);
    return res.json({
      message: "Successfully joined community!",
      newXP: updatedUser.xp
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not join community." });
  }
});

app.get('/api/communities/:id/chat', authenticateToken, async (req, res) => {
  const clubId = req.params.id;
  try {
    const messages = await query.all(
      "SELECT id, community_id, sender_id, sender_name, text, time FROM chats WHERE community_id = ? ORDER BY id ASC",
      [clubId]
    );
    const result = messages.map(m => ({
      sender: m.sender_name,
      text: m.text,
      time: m.time,
      isOutgoing: req.user ? m.sender_id === req.user.id : false
    }));
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not load messages." });
  }
});

app.post('/api/communities/:id/chat', authenticateToken, requireAuth, async (req, res) => {
  const clubId = req.params.id;
  const userId = req.user.id;
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Message text is required." });
  }
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  try {
    const joined = await query.get("SELECT * FROM joined_communities WHERE user_id = ? AND community_id = ?", [userId, clubId]);
    if (!joined) {
      return res.status(403).json({ error: "Must be a joined member to message this community." });
    }
    await query.run(
      "INSERT INTO chats (community_id, sender_id, sender_name, text, time) VALUES (?, ?, ?, ?, ?)",
      [clubId, userId, req.user.username, text, timeStr]
    );
    return res.status(201).json({
      sender: req.user.username,
      text: text,
      time: timeStr,
      isOutgoing: true
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not send message." });
  }
});

// ================= LEADERBOARD ENDPOINT =================

app.get('/api/leaderboard', async (req, res) => {
  try {
    const list = await query.all(`
      SELECT 
        u.id, 
        u.username, 
        u.xp, 
        u.avatar,
        (SELECT COUNT(*) FROM registrations r WHERE r.user_id = u.id) as regCount,
        (SELECT COUNT(*) FROM joined_communities j WHERE j.user_id = u.id) as clubCount
      FROM users u 
      ORDER BY u.xp DESC
    `);
    return res.json(list);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Could not fetch competition leaderboard." });
  }
});

// ================= ADMIN SIMULATOR INJECTS =================

app.post('/api/admin/simulate', async (req, res) => {
  const { action } = req.body;

  try {
    if (action === 'register') {
      const studentNames = ['Rohit Kumar', 'Sarah Jenkins', 'Aarav Mehta', 'Ananya Sen', 'Vikram Rathore', 'Priya Das'];
      const randomName = studentNames[Math.floor(Math.random() * studentNames.length)];
      const randomOpp = await query.get("SELECT * FROM opportunities ORDER BY RANDOM() LIMIT 1");
      if (randomOpp) {
        await query.run("UPDATE opportunities SET registered_count = registered_count + 1 WHERE id = ?", [randomOpp.id]);
        return res.json({
          text: `<strong>${randomName}</strong> submitted the application form for <em>${randomOpp.title}</em>`,
          type: 'join'
        });
      }
    } else if (action === 'post') {
      const studentNames = ['Kabir S.', 'Rohan Roy', 'Tanya Deshmukh', 'Arjun Shah', 'Meera Deshmukh'];
      const randomName = studentNames[Math.floor(Math.random() * studentNames.length)];
      const randomClub = await query.get("SELECT * FROM communities ORDER BY RANDOM() LIMIT 1");
      const posts = ["Are we having a discussion session today?", "Can someone share the link to Figma file?", "Is there a registration fee?", "What is the venue for the workshop?"];
      const randomText = posts[Math.floor(Math.random() * posts.length)];

      if (randomClub) {
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        await query.run(
          "INSERT INTO chats (community_id, sender_name, text, time) VALUES (?, ?, ?, ?)",
          [randomClub.id, randomName, randomText, timeStr]
        );
        return res.json({
          text: `<strong>${randomName}</strong> posted in <em>${randomClub.name} Forum</em>`,
          type: 'msg',
          clubId: randomClub.id
        });
      }
    } else if (action === 'alert') {
      const alerts = [
        "Urgent: GDG TechSprint registration closes in 1 hour!",
        "Important: Fine Arts Workshop relocated to Art Center Hall B.",
        "Alert: Power maintenance scheduled for Engineering Lab block.",
        "Urgent: ML Competition data set release delayed by 30 mins."
      ];
      const randomAlert = alerts[Math.floor(Math.random() * alerts.length)];
      return res.json({
        text: `🚨 <strong>Urgent Banner Alert</strong>: <em>${randomAlert}</em>`,
        type: 'alert',
        rawText: randomAlert
      });
    }
    return res.status(400).json({ error: "Invalid simulator action." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Simulator injection failed." });
  }
});

// Start listening
app.listen(PORT, '127.0.0.1', () => {
  console.log(`CampusConnect Server is running on http://127.0.0.1:${PORT}`);
});
