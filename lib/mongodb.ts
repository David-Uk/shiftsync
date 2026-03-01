import mongoose from "mongoose";

const MONGO_URL = process.env.MONGODB_URL!;

if (!MONGO_URL) {
  throw new Error(
    "Please define the MONGO_URL environment variable inside .env",
  );
}

declare global {
  var mongoose: any;
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGO_URL, opts).then((mongoose) => {
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  
  return cached.conn;
}

// Initialize database connection
let isInitialized = false;

export function initializeDatabase() {
  if (!isInitialized) {
    connectToDatabase().catch(console.error);
    isInitialized = true;
  }
}

export default connectToDatabase;
