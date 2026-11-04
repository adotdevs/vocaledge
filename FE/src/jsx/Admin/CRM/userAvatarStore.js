export const clearStoredAvatars = () => {
  if (typeof window === "undefined") return;
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key === "user_avatar" || (key && key.startsWith("user_avatar:"))) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
};

export const readStoredAvatar = (userId) => {
  if (!userId || typeof window === "undefined") return "";
  return localStorage.getItem(`user_avatar:${userId}`) || "";
};

export const writeStoredAvatar = (userId, url) => {
  if (!userId || typeof window === "undefined") return;
  localStorage.removeItem("user_avatar");
  const key = `user_avatar:${userId}`;
  if (url) localStorage.setItem(key, url);
  else localStorage.removeItem(key);
};
