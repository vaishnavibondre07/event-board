const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const app = require("../src/server");

let server;
let baseUrl;
let dbBackup;
const dbPath = path.join(__dirname, "..", "data", "events.json");

before(() => {
  if (fs.existsSync(dbPath)) {
    dbBackup = fs.readFileSync(dbPath, 'utf-8');
  }
  process.env.ADMIN_TOKEN = "test-token";
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(() => {
  if (dbBackup !== undefined) {
    fs.writeFileSync(dbPath, dbBackup, 'utf-8');
  } else {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  }
  server.close();
});

// GET all events
test("GET /events returns events array", async () => {
  const res = await fetch(`${baseUrl}/events`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});

// POST creates an event
test("POST /events creates a new event", async () => {
  const payload = {
    title: "Test Event",
    date: "2026-10-31",
    location: "Online",
    tags: ["test"]
  };
  const res = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.strictEqual(data.title, "Test Event");
});

// PUT without an admin token
test("PUT /events/:id without token returns 401", async () => {
  const res = await fetch(`${baseUrl}/events/1`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Update",
      date: "2026-11-01",
      location: "Here"
    })
  });
  assert.strictEqual(res.status, 401);
});

// PUT with a valid admin token
test("PUT /events/:id with valid token updates event", async () => {
  const postRes = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Old",
      date: "2026-11-01",
      location: "Here"
    })
  });
  const ev = await postRes.json();

  const res = await fetch(`${baseUrl}/events/${ev.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer test-token"
    },
    body: JSON.stringify({
      title: "New Title",
      date: "2026-11-01",
      location: "Here"
    })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.title, "New Title");
});

// DELETE without an admin token
test("DELETE /events/:id without token returns 401", async () => {
  const res = await fetch(`${baseUrl}/events/1`, {
    method: "DELETE"
  });
  assert.strictEqual(res.status, 401);
});

// DELETE with a valid admin token
test("DELETE /events/:id with valid token deletes event", async () => {
  const postRes = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "ToDelete",
      date: "2026-11-01",
      location: "Here"
    })
  });
  const ev = await postRes.json();
  const res = await fetch(`${baseUrl}/events/${ev.id}`, {
    method: "DELETE",
    headers: {
      "Authorization": "Bearer test-token"
    }
  });
  assert.strictEqual(res.status, 200);
});

// POST when saving to disk fails
test("POST /events returns 500 and does not add event when saving fails", async () => {
  const beforeRes = await fetch(`${baseUrl}/events`);
  const beforeEvents = await beforeRes.json();
  const originalWriteFileSync = fs.writeFileSync;
  const originalConsoleError = console.error;

  // Simulate a failure when writing to events.json
  fs.writeFileSync = function (filePath, ...args) {
    if (path.resolve(String(filePath)) === path.resolve(dbPath)) {
      throw new Error("Simulated disk write failure");
    }

    return originalWriteFileSync.call(fs, filePath, ...args);
  };

  let res;

  try {
    // Suppress the expected error during this test
    console.error = () => {};

    res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Disk Failure Test",
        date: "2026-12-01",
        location: "Test Location",
        tags: ["test"]
      })
    });
  } finally {
    // Restore the original functions
    fs.writeFileSync = originalWriteFileSync;
    console.error = originalConsoleError;
  }

  assert.strictEqual(res.status, 500);

  const afterRes = await fetch(`${baseUrl}/events`);
  const afterEvents = await afterRes.json();

  assert.deepStrictEqual(afterEvents, beforeEvents);
});

test('PUT /events/:id returns 500 when saving fails', async () => {
  const post = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Original Event",
      date: "2026-11-01",
      location: "Mumbai"
    })
  });

  const event = await post.json();
  const before = await (await fetch(`${baseUrl}/events`)).json();
  const originalWrite = fs.writeFileSync;
  const originalError = console.error;

  fs.writeFileSync = (file, ...args) => {
    if (path.resolve(String(file)) === path.resolve(dbPath)) {
      throw new Error("Simulated disk failure");
    }
    return originalWrite.call(fs, file, ...args);
  };

  let res;

  try {
    console.error = () => {};

    res = await fetch(`${baseUrl}/events/${event.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-token"
      },
      body: JSON.stringify({
        title: "Updated Event",
        date: event.date,
        location: "Pune"
      })
    });
  } finally {
    fs.writeFileSync = originalWrite;
    console.error = originalError;
  }

  assert.strictEqual(res.status, 500);

  const after = await (await fetch(`${baseUrl}/events`)).json();
  assert.deepStrictEqual(after, before);
});

test('DELETE /events/:id returns 500 when saving fails', async () => {
  const post = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Event To Delete",
      date: "2026-11-02",
      location: "Mumbai"
    })
  });

  const event = await post.json();
  const before = await (await fetch(`${baseUrl}/events`)).json();
  const originalWrite = fs.writeFileSync;
  const originalError = console.error;

  fs.writeFileSync = (file, ...args) => {
    if (path.resolve(String(file)) === path.resolve(dbPath)) {
      throw new Error("Simulated disk failure");
    }
    return originalWrite.call(fs, file, ...args);
  };

  let res;

  try {
    console.error = () => {};

    res = await fetch(`${baseUrl}/events/${event.id}`, {
      method: "DELETE",
      headers: {
        "Authorization": "Bearer test-token"
      }
    });
  } finally {
    fs.writeFileSync = originalWrite;
    console.error = originalError;
  }

  assert.strictEqual(res.status, 500);

  const after = await (await fetch(`${baseUrl}/events`)).json();
  assert.deepStrictEqual(after, before);
});