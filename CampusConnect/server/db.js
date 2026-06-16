const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'campusconnect.db');
const db = new sqlite3.Database(dbPath);

// Helper function to wrap db methods in Promises
const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

// Initialize schema and seed data
async function initDb() {
  // 1. Create Tables
  await query.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      xp INTEGER DEFAULT 120,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      organizer TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT NOT NULL,
      tags TEXT NOT NULL,
      desc TEXT NOT NULL,
      registered_count INTEGER DEFAULT 0,
      is_hot INTEGER DEFAULT 0,
      application_url TEXT NOT NULL
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS registrations (
      user_id INTEGER,
      opportunity_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, opportunity_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      user_id INTEGER,
      opportunity_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, opportunity_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS joined_communities (
      user_id INTEGER,
      community_id TEXT,
      PRIMARY KEY (user_id, community_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      community_id TEXT NOT NULL,
      sender_id INTEGER,
      sender_name TEXT NOT NULL,
      text TEXT NOT NULL,
      time TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query.run(`
    CREATE TABLE IF NOT EXISTS communities (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      members_count INTEGER DEFAULT 0,
      avatar_text TEXT NOT NULL,
      avatar_class TEXT
    )
  `);

  // 2. Seed Default Users / Leaderboard contestants
  const userCount = await query.get("SELECT COUNT(*) as count FROM users");
  if (userCount.count === 0) {
    const saltRounds = 10;
    const defaultPassword = 'student123';
    const hash = await bcrypt.hash(defaultPassword, saltRounds);

    const contestants = [
      { username: 'snehanair', email: 'sneha.nair@campus.edu', xp: 350, avatar: 'Sneha' },
      { username: 'rohanj', email: 'rohan.j@campus.edu', xp: 280, avatar: 'Rohan' },
      { username: 'adityaraj', email: 'aditya.r@campus.edu', xp: 190, avatar: 'Aditya' },
      { username: 'kabirs', email: 'kabir.s@campus.edu', xp: 150, avatar: 'Kabir' },
      { username: 'nehasen', email: 'neha.s@campus.edu', xp: 95, avatar: 'Neha' }
    ];

    for (let u of contestants) {
      await query.run(
        "INSERT INTO users (username, email, password_hash, xp, avatar) VALUES (?, ?, ?, ?, ?)",
        [u.username, u.email, hash, u.xp, u.avatar]
      );
    }
    console.log("Seeded database with leaderboard contestants.");
  }

  // 3. Seed Default Opportunities with form application links
  const oppCount = await query.get("SELECT COUNT(*) as count FROM opportunities");
  if (oppCount.count === 0) {
    const defaultOpps = [
      {
        id: 'opp-1',
        title: 'Google Developer Groups: TechSprint 2026',
        type: 'event',
        organizer: 'GDG Campus Chapter',
        date: '2026-06-25',
        location: 'Main Auditorium & Online Discord',
        tags: 'Tech,Coding,Hackathon',
        desc: 'Join the biggest campus hackathon of 2026. Pitch ideas, build prototypes with latest technologies, and win mentorship sessions plus merchandise. Food and drinks will be provided throughout the 24-hour sprint!',
        registered_count: 142,
        is_hot: 1,
        application_url: 'https://devpost.com'
      },
      {
        id: 'opp-2',
        title: 'Summer UI/UX Design Guild Internship',
        type: 'internship',
        organizer: 'NextGen Innovations',
        date: '2026-07-05',
        location: 'Remote Workspace',
        tags: 'Design,Figma,Paid',
        desc: 'Looking for a passionate junior UI/UX designer to join our design squad. You will assist in wireframing, crafting user flows, and conducting user interviews for real client products. 3 months duration, paid stipend.',
        registered_count: 89,
        is_hot: 0,
        application_url: 'https://docs.google.com/forms/d/e/1FAIpQLSfD5mockFormLinkDesignGuild2026/viewform'
      },
      {
        id: 'opp-3',
        title: 'National AI & ML Competition 2026',
        type: 'competition',
        organizer: 'AI & Robotics Club',
        date: '2026-07-20',
        location: 'Computer Lab 3A',
        tags: 'Tech,Coding,AI',
        desc: 'Showcase your machine learning modeling skills! Competitors will be given a proprietary datasets to build predictions and classify variables. High cash awards for top 3 teams.',
        registered_count: 56,
        is_hot: 1,
        application_url: 'https://kaggle.com'
      },
      {
        id: 'opp-4',
        title: 'Creative Content Writer & Blogger',
        type: 'internship',
        organizer: 'Campus Literary Society',
        date: '2026-06-30',
        location: 'Hybrid / On-Campus office',
        tags: 'Marketing,Writing,Paid',
        desc: 'Help manage our student newsletters, write campus blogs, and optimize social media content. Candidates must possess great writing skills and experience in Figma/Canva.',
        registered_count: 34,
        is_hot: 0,
        application_url: 'https://docs.google.com/forms/d/e/1FAIpQLSfD5mockFormLinkLiteraryApply2026/viewform'
      },
      {
        id: 'opp-5',
        title: 'Intro to Robotics Hands-on Workshop',
        type: 'event',
        organizer: 'AI & Robotics Club',
        date: '2026-06-22',
        location: 'Engineering Lab 12',
        tags: 'Tech,Design,Robot',
        desc: 'A physical training session on Arduino programming and robotic sensory modules. No prior experience is required. Kits will be provided for runtime usage.',
        registered_count: 65,
        is_hot: 0,
        application_url: 'https://docs.google.com/forms/d/e/1FAIpQLSfD5mockFormLinkRoboticsWorkshop2026/viewform'
      },
      {
        id: 'opp-6',
        title: 'Annual Fine Arts & Poster Design Challenge',
        type: 'competition',
        organizer: 'Fine Arts Association',
        date: '2026-07-15',
        location: 'Art Center Hall A',
        tags: 'Design,Fine Arts',
        desc: 'An annual competition promoting physical and digital painting skills. Theme will be announced on-the-spot. Winners get exhibition slots at the central campus library.',
        registered_count: 41,
        is_hot: 0,
        application_url: 'https://docs.google.com/forms/d/e/1FAIpQLSfD5mockFormLinkFineArts2026/viewform'
      }
    ];

    for (let opp of defaultOpps) {
      await query.run(
        "INSERT INTO opportunities (id, title, type, organizer, date, location, tags, desc, registered_count, is_hot, application_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [opp.id, opp.title, opp.type, opp.organizer, opp.date, opp.location, opp.tags, opp.desc, opp.registered_count, opp.is_hot, opp.application_url]
      );
    }
    console.log("Seeded database with opportunities.");
  }

  // 4. Seed Default Communities
  const clubCount = await query.get("SELECT COUNT(*) as count FROM communities");
  if (clubCount.count === 0) {
    const defaultClubs = [
      { id: 'club-1', name: 'Google Developer Groups (GDG)', members_count: 342, avatar_text: 'G', avatar_class: 'avatar-dsc' },
      { id: 'club-2', name: 'AI & Robotics Club', members_count: 215, avatar_text: 'R', avatar_class: 'avatar-robot' },
      { id: 'club-3', name: 'Campus Literary Society', members_count: 156, avatar_text: 'L', avatar_class: 'avatar-lit' },
      { id: 'club-4', name: 'Fine Arts Association', members_count: 98, avatar_text: 'A', avatar_class: '' }
    ];

    for (let c of defaultClubs) {
      await query.run(
        "INSERT INTO communities (id, name, members_count, avatar_text, avatar_class) VALUES (?, ?, ?, ?, ?)",
        [c.id, c.name, c.members_count, c.avatar_text, c.avatar_class]
      );
    }

    // Seed initial chats
    const defaultChats = [
      { community_id: 'club-1', sender_name: 'Harshita (Lead)', text: 'Hey guys! GDG TechSprint registration is now open. Make sure to sign up before seats fill!', time: '10:42 AM' },
      { community_id: 'club-1', sender_name: 'Rohit K.', text: 'Is it open for first-year students too?', time: '10:45 AM' },
      { community_id: 'club-1', sender_name: 'Harshita (Lead)', text: 'Yes! Absolutely. We have custom tracks for beginners too.', time: '10:46 AM' },
      { community_id: 'club-2', sender_name: 'Vikram Singh', text: 'Robot-kits are now available in Lab 12 for checking out.', time: 'Yesterday' },
      { community_id: 'club-2', sender_name: 'Aditya Raj', text: 'Sweet! I will grab one today after classes.', time: 'Yesterday' },
      { community_id: 'club-3', sender_name: 'Anjali Shah', text: 'The weekly blog prompt is: Fragmented Communications in Tech. Submit drafts by Friday.', time: '2 Days Ago' },
      { community_id: 'club-4', sender_name: 'Meera Deshmukh', text: 'Anyone wants to collaborate on the library wall mural project next week?', time: '3 Days Ago' }
    ];

    for (let chat of defaultChats) {
      await query.run(
        "INSERT INTO chats (community_id, sender_name, text, time) VALUES (?, ?, ?, ?)",
        [chat.community_id, chat.sender_name, chat.text, chat.time]
      );
    }
    console.log("Seeded database with community groups and chats.");
  }
}

module.exports = {
  db,
  query,
  initDb
};
