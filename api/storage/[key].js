import mongoose from "mongoose";

const storageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const Storage = mongoose.models.Storage || mongoose.model("Storage", storageSchema);

// Reused across warm serverless invocations so we don't open a new
// connection pool on every request.
let connPromise = null;
function dbConnect() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connPromise) connPromise = mongoose.connect(process.env.MONGO_URI);
  return connPromise;
}

export default async function handler(req, res) {
  try {
    await dbConnect();
  } catch (err) {
    console.error("MongoDB connection error:", err);
    return res.status(500).json({ error: "Database connection failed" });
  }

  const { key } = req.query;

  if (req.method === "GET") {
    try {
      const doc = await Storage.findOne({ key });
      if (!doc) return res.status(404).json({ error: "Key not found" });
      return res.status(200).json({ value: doc.value });
    } catch (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method === "POST") {
    try {
      const { value } = req.body;
      const doc = await Storage.findOneAndUpdate(
        { key },
        { value },
        { upsert: true, returnDocument: "after" }
      );
      return res.status(200).json({ success: true, value: doc.value });
    } catch (err) {
      console.error("Error saving data:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
