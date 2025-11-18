// config/crmDatabase.js
const mongoose = require("mongoose");

let crmDB = null;
let connectionPromise = null;
let isConnecting = false;

async function connectCRMDatabase() {
  try {
    // If connection already exists and is ready, return it immediately
    if (crmDB && crmDB.readyState === 1) {
      return crmDB;
    }

    // If connection is in progress, wait for it
    if (connectionPromise && isConnecting) {
      return await connectionPromise;
    }

    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
      // Wait a bit and check again
      await new Promise(resolve => setTimeout(resolve, 100));
      if (crmDB && crmDB.readyState === 1) {
        return crmDB;
      }
    }

    // Start new connection
    isConnecting = true;
    connectionPromise = (async () => {
      try {
        // Close existing connection if it exists but isn't ready
        if (crmDB && crmDB.readyState !== 1) {
          try {
            await crmDB.close();
          } catch (e) {
            // Ignore close errors
          }
          crmDB = null;
        }

        // Get connection string and ensure it has proper SSL parameters
        let connectionString = process.env.CRMDATABASE;
        
        // Ensure connection string has SSL parameters if using mongodb+srv
        if (connectionString.includes('mongodb+srv://')) {
          // Add SSL parameters if not present
          if (!connectionString.includes('tls=') && !connectionString.includes('ssl=')) {
            const separator = connectionString.includes('?') ? '&' : '?';
            connectionString += `${separator}tls=true&retryWrites=true&w=majority`;
          }
        }

        // Create new connection with strict connection limits to prevent leaks
        crmDB = mongoose.createConnection(connectionString, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          serverSelectionTimeoutMS: 30000, // 30 seconds
          socketTimeoutMS: 45000, // 45 seconds
          connectTimeoutMS: 30000, // 30 seconds
          maxPoolSize: 5, // REDUCED from 10 to prevent connection limit issues
          minPoolSize: 1,
          maxIdleTimeMS: 30000, // Close idle connections after 30 seconds
          // Don't set SSL explicitly - let connection string handle it
        });

        // Wait for connection to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout after 30 seconds'));
          }, 30000);

          if (crmDB.readyState === 1) {
            // Already connected
            clearTimeout(timeout);
            console.log("✅ CRM Database connected:", crmDB.host);
            resolve();
          } else {
            // Wait for 'connected' event
            crmDB.once('connected', () => {
              clearTimeout(timeout);
              console.log("✅ CRM Database connected:", crmDB.host);
              resolve();
            });
            
            crmDB.once('error', (err) => {
              clearTimeout(timeout);
              console.error("❌ CRM Database connection error:", err.message);
              isConnecting = false;
              connectionPromise = null;
              reject(err);
            });
          }
        });

        isConnecting = false;
        return crmDB;
      } catch (error) {
        isConnecting = false;
        connectionPromise = null;
        throw error;
      }
    })();

    return await connectionPromise;
  } catch (error) {
    console.error("❌ CRM Database connection error:", error.message);
    isConnecting = false;
    connectionPromise = null;
    throw error;
  }
}

module.exports = connectCRMDatabase;
