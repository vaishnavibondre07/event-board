const express = require("express");
const path = require("path");
const fs = require("fs");
const { validateEvent } = require("./validator");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "..", "data", "events.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

let events = [];

function loadEvents() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf-8");
      events = JSON.parse(data);
    } else {
      events = [];
    }
  } catch (err) {
    console.error("Failed to load events:", err);
    events = [];
  }
}

// Save events to the JSON file
function saveEvents(updatedEvents) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(updatedEvents, null, 2),
    "utf-8"
  );
}
loadEvents();

// GET all events
app.get("/events", (req, res) => {
  const sortedEvents = [...events].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  res.json(sortedEvents);
});

function checkAdmin(req, res, next) {
  const token = req.headers.authorization && req.headers.authorization.split(" ")[1];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// POST create a new event
app.post("/events", (req, res) => {
  const validation = validateEvent(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const nextId = events.length > 0 ? Math.max(...events.map(e => e.id || 0)) + 1 : 1;
  const newEvent = {
    id: nextId,
    title: req.body.title,
    date: req.body.date,
    location: req.body.location,
    description: req.body.description || "",
    tags: Array.isArray(req.body.tags) ? req.body.tags : []
  };

  const updatedEvents = [...events, newEvent];

  try {
    // Save the updated list directly to disk
    saveEvents(updatedEvents);
    // Update memory only after saving succeeds
    events = updatedEvents;
    return res.status(201).json(newEvent);
  } catch (err) {
    console.error("Failed to save event:", err);
    return res.status(500).json({
      error: "Failed to save event"
    });
  }
});

// PUT edit an event by ID
app.put("/events/:id", checkAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const eventIndex = events.findIndex(e => e.id === id);
  if (eventIndex === -1) {
    return res.status(404).json({ error: "Not found" });
  }

  const validation = validateEvent(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const updatedEvent = {
    id: id,
    title: req.body.title,
    date: req.body.date,
    location: req.body.location,
    description: req.body.description || "",
    tags: Array.isArray(req.body.tags) ? req.body.tags : []
  };

  // Prepare the updated list without modifying the original array
  const updatedEvents = [...events];
  updatedEvents[eventIndex] = updatedEvent;

  try {
    // Save to disk first
    saveEvents(updatedEvents);
    // Update memory only after saving succeeds
    events = updatedEvents;
    return res.status(200).json(updatedEvent);
  } catch (err) {
    console.error("Failed to save event update:", err);
    return res.status(500).json({
      error: "Failed to save event update"
    });
  }
});

// DELETE an event by ID
app.delete("/events/:id", checkAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const eventExists = events.some(e => e.id === id);
  if (!eventExists) {
    return res.status(404).json({ error: "Not found" });
  }
  // Prepare the list without the event, but preserve the original array
  const updatedEvents = events.filter(e => e.id !== id);
  try {
    // Save to disk first
    saveEvents(updatedEvents);
    // Update memory only after saving succeeds
    events = updatedEvents;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to save event deletion:", err.message);
    return res.status(500).json({
      error: "Could not save changes to disk"
    });
  }
});

// POST verify admin token
app.post("/verify", (req, res) => {
  const token = req.body.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ valid: false });
  }
  res.status(200).json({ valid: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Event Board server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
