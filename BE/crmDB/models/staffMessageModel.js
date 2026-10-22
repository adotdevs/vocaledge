const mongoose = require('mongoose');
const connectCRMDatabase = require('../../config/crmDatabase');

const staffMessageSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    createdByName: {
      type: String,
      default: 'Super admin',
      trim: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    sendCount: {
      type: Number,
      default: 1,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

staffMessageSchema.index({ lastSentAt: -1 });

const getStaffMessageModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.StaffMessage || crmDB.model('StaffMessage', staffMessageSchema);
};

module.exports = getStaffMessageModel;
module.exports.getStaffMessageModel = getStaffMessageModel;
