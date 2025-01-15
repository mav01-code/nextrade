const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");
const http = require("http");
const stripe = require("stripe")("sk_test_51QRWuiJeQjGXosToKHi1RSxMq8YSvw8fdAMmAE5IVmHXr3iyvfVvvjz5heK53CxNYSglIkdSvNTma6aVH3sa34O700HuQ8V7a7");

const { Server } = require("socket.io");

const app = express();

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// Create MySQL database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "nextrade",
  connectionLimit: 200, // Maximum connections
});

// Connect to the database
db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
  } else {
    console.log("Connected to the database.");
  }
});

// ------------------------ Customer Signup ------------------------ //
app.post("/customer-signup", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const query = "INSERT INTO customersignup (name, email, password) VALUES (?, ?, ?)";
  db.query(query, [name, email, password], (err, result) => {
    if (err) {
      console.error("Database Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ message: "Signup successful", userId: result.insertId });
  });
});

// ------------------------ Customer Login ------------------------ //
app.post("/customer-login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Missing email or password" });
  }

  const query = "SELECT name, password FROM customersignup WHERE email = ?";
  db.query(query, [email], (err, results) => {
    if (err) {
      console.error("Database Error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.length === 0 || results[0].password !== password) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    res.json({ success: true, message: "Login successful", name: results[0].name });
  });
});

// ------------------------ Business Signup ------------------------ //
app.post("/business-signup", (req, res) => {
  const { name, email, password, number, address } = req.body;

  if (!name || !email || !password || !number || !address) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const query = "INSERT INTO businesssignup (name, email, password, number, address) VALUES (?, ?, ?, ?, ?)";
  db.query(query, [name, email, password, number, address], (err, result) => {
    if (err) {
      console.error("Database Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ message: "Signup successful", userId: result.insertId });
  });
});

// ------------------------ Business Login ------------------------ //
app.post("/business-login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Missing email or password" });
  }

  const query = "SELECT name, password FROM businesssignup WHERE email = ?";
  db.query(query, [email], (err, results) => {
    if (err) {
      console.error("Database Error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.length === 0 || results[0].password !== password) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    res.json({ success: true, message: "Login successful", name: results[0].name });
  });
});

// ------------------------ Add Products into the Store------------------------ //
app.post("/add-product", async (req, res) => {
  const { name, category, businessname, price, image, description } = req.body;

  if (!name || !category || !businessname || !price || !image || !description) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const query = "INSERT INTO products (name, category, businessname, price, image, description) VALUES (?, ?, ?, ?, ?, ?)";
  
  try {
    db.query(query, [name, category, businessname, price, image, description], (err, result) => {
      if (err) {
        console.error("Database Error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.status(201).json({ message: "Product added successfully", productId: result.insertId });
    });
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Unexpected error" });
  }
});

// ------------------------ Fetch All Products ------------------------ //
app.get("/products", async (req, res) => {
  const { businessname } = req.query;

  // Base SQL query
  let query = "SELECT * FROM products";
  const params = [];

  // If businessname is provided, filter by it
  if (businessname) {
    query += " WHERE businessname = ?";
    params.push(businessname);
  }

  try {
    db.query(query, params, (err, results) => {
      if (err) {
        console.error("Database Error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "No products found for the specified business name" });
      }

      res.json(results);
    });
  } catch (err) {
    console.error("Unexpected Error:", err);
    res.status(500).json({ error: "Unexpected error" });
  }
});

// ------------------------ Chat ------------------------ //

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Listening for chat messages
  socket.on("sendMessage", (data) => {
    console.log("Message received:", data);
    io.emit("receiveMessage", data); // Broadcast to all connected clients
  });

  // Handle signaling data for video call
  socket.on("offer", (data) => {
    io.to(data.to).emit("offer", {
      from: socket.id,
      offer: data.offer,
    });
  });

  socket.on("answer", (data) => {
    io.to(data.to).emit("answer", {
      from: socket.id,
      answer: data.answer,
    });
  });

  socket.on("ice-candidate", (data) => {
    io.to(data.to).emit("ice-candidate", {
      from: socket.id,
      candidate: data.candidate,
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// ------------------------ Payment Gateway ------------------------ //
app.post("/create-checkout-session", async (req, res) => {
  const { product } = req.body;

  try {
    // Create a Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "inr",
            product_data: {
              name: product.name,
            },
            unit_amount: product.price * 100, // Convert INR to paise
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: "http://localhost:3000/success",
      cancel_url: "http://localhost:3000/cancel",
    });

    console.log("Stripe Checkout Session URL:", session.url); // Log the URL
    res.json({ url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ------------------------ Start Server ------------------------ //
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});

server.listen(3001, () => {
  console.log("Socket.IO server is running on http://localhost:3001");
});
