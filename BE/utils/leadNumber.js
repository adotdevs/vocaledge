const connectCRMDatabase = require("../config/crmDatabase");

const COUNTER_ID = "leadNumber";

const readSeq = (result) => {
  if (!result) return 0;
  const doc = result.value && Object.prototype.hasOwnProperty.call(result.value, "seq") ? result.value : result;
  const seq = Number(doc && doc.seq);
  return Number.isFinite(seq) ? seq : 0;
};

// Reserves the next `count` numbers in one atomic step. The returned value is the first number.
// Numbers only move forward, so a deleted lead never gives its number to a later lead.
async function reserveLeadNumbers(count) {
  const amount = Math.floor(Number(count));
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("Cannot reserve lead numbers");
  }
  const crm = await connectCRMDatabase();
  const result = await crm.collection("counters").findOneAndUpdate(
    { _id: COUNTER_ID },
    { $inc: { seq: amount } },
    { upsert: true, returnDocument: "after" }
  );
  const end = readSeq(result);
  if (!end) throw new Error("Lead number counter did not advance");
  return end - amount + 1;
}

async function stampLeadNumbers(docs) {
  const pending = (docs || []).filter((doc) => !(Number.isInteger(doc.leadNumber) && doc.leadNumber > 0));
  if (!pending.length) return docs;
  const start = await reserveLeadNumbers(pending.length);
  pending.forEach((doc, index) => {
    doc.leadNumber = start + index;
  });
  return docs;
}

module.exports = { reserveLeadNumbers, stampLeadNumbers, COUNTER_ID };
