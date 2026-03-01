// This file ensures database connection is initialized once at application startup
import { initializeDatabase } from "@/lib/mongodb";

// Initialize database connection on application start
if (typeof window === "undefined") {
  // Only initialize on server side
  initializeDatabase();
}
