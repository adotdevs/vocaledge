const mongoose = require('mongoose');
const connectCRMDatabase = require('../../config/crmDatabase');

const staffMessageDismissalSchema = new mongoose.Schema(
  {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StaffMessage',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    version: {
      type: Number,
      required: true,
    },
    dismissedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

staffMessageDismissalSchema.index({ messageId: 1, userId: 1 }, { unique: true });

const getStaffMessageDismissalModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.StaffMessageDismissal
    || crmDB.model('StaffMessageDismissal', staffMessageDismissalSchema);
};

module.exports = getStaffMessageDismissalModel;
module.exports.getStaffMessageDismissalModel = getStaffMessageDismissalModel;
