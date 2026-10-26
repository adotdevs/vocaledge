const BANKS_BY_COUNTRY = {
  Belgium: ["BNP Paribas Fortis", "KBC", "Belfius", "ING Belgium", "Argenta", "Other"],
  Germany: ["Deutsche Bank", "Commerzbank", "DZ Bank", "Sparkasse", "Volksbank", "Other"],
  Netherlands: ["ING", "Rabobank", "ABN AMRO", "de Volksbank", "Triodos Bank", "Other"],
  Switzerland: ["UBS", "Zürcher Kantonalbank", "Raiffeisen", "PostFinance", "Banque Cantonale Vaudoise", "Other"],
  Austria: ["Erste Bank", "Raiffeisen Bank International", "Bank Austria", "BAWAG", "Oberbank", "Other"],
  Portugal: ["Caixa Geral de Depósitos", "Millennium BCP", "Novo Banco", "Santander Totta", "BPI", "Other"],
  Sweden: ["Swedbank", "SEB", "Handelsbanken", "Nordea", "Länsförsäkringar Bank", "Other"],
  Denmark: ["Danske Bank", "Nordea", "Jyske Bank", "Nykredit", "Sydbank", "Other"],
};

const COUNTRY_ALIASES = {
  belgium: "Belgium",
  germany: "Germany",
  netherlands: "Netherlands",
  holland: "Netherlands",
  switzerland: "Switzerland",
  austria: "Austria",
  portugal: "Portugal",
  sweden: "Sweden",
  denmark: "Denmark",
};

const CUSTOMER_FIELD_KEYS = [
  "customerAge",
  "amountLost",
  "amountLostWhen",
  "registeredToPlatform",
  "activeTradingPlatform",
  "customerBanks",
  "additionalPhone",
  "screenSharing",
  "screenSharingId",
  "customerPotential",
];

const yesNo = (value) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "yes" || text === "no") return text;
  return "";
};

const optionalNumber = (value, label) => {
  if (value === "" || value === null || value === undefined) return { value: null };
  const number = Number(value);
  if (!Number.isFinite(number)) return { error: `${label} must be a number` };
  return { value: number };
};

const banksForCountry = (country) => {
  const key = COUNTRY_ALIASES[String(country || "").trim().toLowerCase()];
  return key ? BANKS_BY_COUNTRY[key] : ["Other"];
};

const normalizeCustomerFields = (body, current = {}) => {
  const age = optionalNumber(body.customerAge, "Customer age");
  const lost = optionalNumber(body.amountLost, "Amount lost");
  const potential = optionalNumber(body.customerPotential, "Customer potential");
  const error = age.error || lost.error || potential.error;
  if (error) return { error };

  const country = body.country !== undefined ? body.country : current.country;
  const allowed = new Set(banksForCountry(country));
  const banks = (Array.isArray(body.customerBanks) ? body.customerBanks : String(body.customerBanks || "").split(","))
    .map((item) => String(item || "").trim())
    .filter((item) => item && allowed.has(item));

  const screenSharing = yesNo(body.screenSharing);
  const values = {
    customerAge: age.value,
    amountLost: lost.value,
    amountLostWhen: String(body.amountLostWhen || "").trim(),
    registeredToPlatform: yesNo(body.registeredToPlatform),
    activeTradingPlatform: yesNo(body.activeTradingPlatform),
    customerBanks: [...new Set(banks)],
    additionalPhone: String(body.additionalPhone || "").trim(),
    screenSharing,
    screenSharingId: screenSharing === "yes" ? String(body.screenSharingId || "").trim() : "",
    customerPotential: potential.value,
  };

  const changes = [];
  const previousBanks = Array.isArray(current.customerBanks) ? current.customerBanks.join(", ") : "";
  const nextBanks = values.customerBanks.join(", ");
  const pairs = [
    ["customer age", current.customerAge, values.customerAge],
    ["amount lost", current.amountLost, values.amountLost],
    ["when amount lost", current.amountLostWhen, values.amountLostWhen],
    ["registered to platform", current.registeredToPlatform, values.registeredToPlatform],
    ["active trading platform", current.activeTradingPlatform, values.activeTradingPlatform],
    ["banks", previousBanks, nextBanks],
    ["additional phone", current.additionalPhone, values.additionalPhone],
    ["screen sharing", current.screenSharing, values.screenSharing],
    ["screen sharing id", current.screenSharingId, values.screenSharingId],
    ["customer potential", current.customerPotential, values.customerPotential],
  ];
  pairs.forEach(([label, before, after]) => {
    if (String(before ?? "") !== String(after ?? "")) {
      changes.push(`${label}: from '${before || "N/A"}' to '${after || "N/A"}'`);
    }
  });

  return { values, changes };
};

const bodyHasCustomerFields = (body) => CUSTOMER_FIELD_KEYS.some((key) => body?.[key] !== undefined);

const addCustomerSearch = (orList, searchTrimmed) => {
  const regex = { $regex: searchTrimmed, $options: "i" };
  orList.push(
    { amountLostWhen: regex },
    { additionalPhone: regex },
    { customerBanks: regex },
    { screenSharingId: regex },
  );
  if (searchTrimmed !== "" && Number.isFinite(Number(searchTrimmed))) {
    const number = Number(searchTrimmed);
    orList.push(
      { customerAge: number },
      { amountLost: number },
      { customerPotential: number },
    );
  }
};

const applyCustomerFilters = (query, params = {}) => {
  const setNumber = (key) => {
    if (params[key] === undefined || params[key] === "") return;
    const number = Number(params[key]);
    if (Number.isFinite(number)) query[key] = number;
  };
  const setYesNo = (key) => {
    const value = yesNo(params[key]);
    if (value) query[key] = value;
  };
  const setText = (key) => {
    const value = String(params[key] || "").trim();
    if (value) query[key] = { $regex: value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  };

  setNumber("customerAge");
  setNumber("amountLost");
  setNumber("customerPotential");
  setText("amountLostWhen");
  setText("additionalPhone");
  setText("screenSharingId");
  setYesNo("registeredToPlatform");
  setYesNo("activeTradingPlatform");
  setYesNo("screenSharing");
  const bank = String(params.customerBank || "").trim();
  if (bank) query.customerBanks = bank;
};

module.exports = {
  BANKS_BY_COUNTRY,
  CUSTOMER_FIELD_KEYS,
  banksForCountry,
  normalizeCustomerFields,
  bodyHasCustomerFields,
  addCustomerSearch,
  applyCustomerFilters,
};
