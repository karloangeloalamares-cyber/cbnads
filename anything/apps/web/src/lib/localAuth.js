import { clearSession, ensureDb, getSessionUserId, readDb, setSessionUserId, updateDb } from '@/lib/localDb';

export const DEFAULT_ADMIN_CREDENTIALS = {
  email: 'admin@cbnads.local',
  password: 'admin123',
};

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }
  const { password, ...safeUser } = user;
  return safeUser;
};

export const getSignedInUser = () => {
  ensureDb();
  const userId = getSessionUserId();
  if (!userId) {
    return null;
  }
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  return sanitizeUser(user);
};

export const signIn = ({ email, password }) => {
  ensureDb();
  const db = readDb();
  const normalizedEmail = (email || '').trim().toLowerCase();
  const user = db.users.find(
    (item) => item.email.toLowerCase() === normalizedEmail && item.password === password
  );

  if (!user) {
    return {
      ok: false,
      error: 'Incorrect email or password.',
    };
  }

  setSessionUserId(user.id);
  return {
    ok: true,
    user: sanitizeUser(user),
  };
};

export const signOut = () => {
  clearSession();
};

export const updateCurrentUser = (updates) => {
  const current = getSignedInUser();
  if (!current) {
    return null;
  }

  let updated = null;
  updateDb((db) => {
    db.users = db.users.map((user) => {
      if (user.id !== current.id) {
        return user;
      }

      const next = {
        ...user,
        ...updates,
        updated_at: new Date().toISOString(),
      };
      updated = sanitizeUser(next);
      return next;
    });
    return db;
  });

  return updated;
};
