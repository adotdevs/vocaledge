const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const getStaffMessageModel = require('../crmDB/models/staffMessageModel');
const getStaffMessageDismissalModel = require('../crmDB/models/staffMessageDismissalModel');

const MAX_LENGTH = 2000;

const senderName = (user) =>
  `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Super admin';

const serializeMessage = (doc) => ({
  _id: doc._id,
  message: doc.message,
  version: doc.version,
  sendCount: doc.sendCount,
  lastSentAt: doc.lastSentAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  createdByName: doc.createdByName,
});

const emitStaffMessage = (event, message) => {
  if (global.io) {
    global.io.emit(event, { message: serializeMessage(message) });
  }
};

const readMessageText = (value, next) => {
  const message = String(value || '').trim();
  if (!message) {
    next(new ErrorHandler('Message is required', 400));
    return null;
  }
  if (message.length > MAX_LENGTH) {
    next(new ErrorHandler(`Message must be ${MAX_LENGTH} characters or fewer`, 400));
    return null;
  }
  return message;
};

exports.createStaffMessage = catchAsyncErrors(async (req, res, next) => {
  const message = readMessageText(req.body?.message, next);
  if (!message) return;

  const StaffMessage = await getStaffMessageModel();
  const created = await StaffMessage.create({
    message,
    createdBy: req.user._id,
    createdByName: senderName(req.user),
    version: 1,
    sendCount: 1,
    lastSentAt: new Date(),
  });

  emitStaffMessage('staffMessagePopup', created);

  res.status(201).json({
    success: true,
    msg: 'Message sent to all agents',
    message: serializeMessage(created),
  });
});

exports.listStaffMessages = catchAsyncErrors(async (req, res) => {
  const StaffMessage = await getStaffMessageModel();
  const messages = await StaffMessage.find().sort({ lastSentAt: -1, createdAt: -1 }).lean();

  res.status(200).json({
    success: true,
    messages: messages.map(serializeMessage),
  });
});

exports.updateStaffMessage = catchAsyncErrors(async (req, res, next) => {
  const message = readMessageText(req.body?.message, next);
  if (!message) return;

  const StaffMessage = await getStaffMessageModel();
  const existing = await StaffMessage.findById(req.params.id);
  if (!existing) {
    return next(new ErrorHandler('Message not found', 404));
  }

  existing.message = message;
  await existing.save();

  emitStaffMessage('staffMessageUpdated', existing);

  res.status(200).json({
    success: true,
    msg: 'Message updated',
    message: serializeMessage(existing),
  });
});

exports.resendStaffMessage = catchAsyncErrors(async (req, res, next) => {
  const StaffMessage = await getStaffMessageModel();
  const existing = await StaffMessage.findById(req.params.id);
  if (!existing) {
    return next(new ErrorHandler('Message not found', 404));
  }

  existing.version += 1;
  existing.sendCount += 1;
  existing.lastSentAt = new Date();
  await existing.save();

  emitStaffMessage('staffMessagePopup', existing);

  res.status(200).json({
    success: true,
    msg: 'Popup sent again to all agents',
    message: serializeMessage(existing),
  });
});

exports.getPendingStaffMessages = catchAsyncErrors(async (req, res) => {
  const StaffMessage = await getStaffMessageModel();
  const StaffMessageDismissal = await getStaffMessageDismissalModel();
  const messages = await StaffMessage.find().sort({ lastSentAt: -1 }).lean();

  if (!messages.length) {
    return res.status(200).json({ success: true, messages: [] });
  }

  const dismissals = await StaffMessageDismissal.find({
    userId: req.user._id,
    messageId: { $in: messages.map((item) => item._id) },
  }).lean();

  const dismissedVersionById = new Map(
    dismissals.map((item) => [String(item.messageId), item.version])
  );

  const pending = messages.filter(
    (item) => dismissedVersionById.get(String(item._id)) !== item.version
  );

  res.status(200).json({
    success: true,
    messages: pending.map(serializeMessage),
  });
});

exports.deleteStaffMessage = catchAsyncErrors(async (req, res, next) => {
  const StaffMessage = await getStaffMessageModel();
  const existing = await StaffMessage.findById(req.params.id);
  if (!existing) {
    return next(new ErrorHandler('Message not found', 404));
  }

  const StaffMessageDismissal = await getStaffMessageDismissalModel();
  await StaffMessageDismissal.deleteMany({ messageId: existing._id });
  await existing.deleteOne();

  if (global.io) {
    global.io.emit('staffMessageDeleted', { messageId: String(existing._id) });
  }

  res.status(200).json({
    success: true,
    msg: 'Message deleted',
  });
});

exports.dismissStaffMessage = catchAsyncErrors(async (req, res, next) => {
  const StaffMessage = await getStaffMessageModel();
  const existing = await StaffMessage.findById(req.params.id).lean();
  if (!existing) {
    return next(new ErrorHandler('Message not found', 404));
  }

  const StaffMessageDismissal = await getStaffMessageDismissalModel();
  await StaffMessageDismissal.findOneAndUpdate(
    { messageId: existing._id, userId: req.user._id },
    { version: existing.version, dismissedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, msg: 'Message closed' });
});
