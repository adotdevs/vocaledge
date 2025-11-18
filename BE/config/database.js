const mongoose = require("mongoose");

const database = () => {
  mongoose
    .connect(process.env.DATABASE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 5, // Limit connection pool to prevent leaks
      minPoolSize: 1,
      maxIdleTimeMS: 30000, // Close idle connections after 30 seconds
    })
    .then((data) => {
      console.log(`Db connected successfully with ${data.connection.host}`);
    })
    .catch((e) => {
      console.log("db error", e);
    });
};

module.exports = database;
