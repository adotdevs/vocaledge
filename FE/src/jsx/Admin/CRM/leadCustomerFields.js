export const BANKS_BY_COUNTRY = {
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

export const banksForCountry = (country) => {
  const key = COUNTRY_ALIASES[String(country || "").trim().toLowerCase()];
  return key ? BANKS_BY_COUNTRY[key] : ["Other"];
};

export const emptyCustomerFields = () => ({
  customerAge: "",
  amountLost: "",
  amountLostWhen: "",
  registeredToPlatform: "",
  activeTradingPlatform: "",
  customerBanks: [],
  additionalPhone: "",
  screenSharing: "",
  screenSharingId: "",
  customerPotential: "",
});

export const customerFieldsFromLead = (lead = {}) => ({
  customerAge: lead.customerAge ?? "",
  amountLost: lead.amountLost ?? "",
  amountLostWhen: lead.amountLostWhen || "",
  registeredToPlatform: lead.registeredToPlatform || "",
  activeTradingPlatform: lead.activeTradingPlatform || "",
  customerBanks: Array.isArray(lead.customerBanks) ? lead.customerBanks : [],
  additionalPhone: lead.additionalPhone || "",
  screenSharing: lead.screenSharing || "",
  screenSharingId: lead.screenSharingId || "",
  customerPotential: lead.customerPotential ?? "",
});

export const applyCustomerFieldChange = (current, field, value) => {
  const next = { ...current, [field]: value };
  if (field === "country") {
    const allowed = new Set(banksForCountry(value));
    next.customerBanks = (current.customerBanks || []).filter((bank) => allowed.has(bank));
  }
  if (field === "screenSharing" && value !== "yes") next.screenSharingId = "";
  return next;
};

export const yesNoLabel = (value) => (value === "yes" ? "Yes" : value === "no" ? "No" : "Not set");
