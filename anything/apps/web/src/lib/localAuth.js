import { clearSession, ensureDb, getSessionUserId, readDb, setSessionUserId, updateDb } from '@/lib/localDb';

export const LOCAL_ACCOUNT_CREDENTIALS = [
  {
    email: 'zach@cbnads.com',
    password: 'admin123!',
    role: 'admin',
  },
  {
    email: 'ads@cbn.com',
    password: 'ads123!',
    role: 'advertiser',
  },
];

export const DEFAULT_ADMIN_CREDENTIALS = {
  email: LOCAL_ACCOUNT_CREDENTIALS[0].email,
  password: LOCAL_ACCOUNT_CREDENTIALS[0].password,
};

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }
  const { password, ...safeUser } = user;
  return safeUser;
};

export const getSignedInUser = () => {
  void ensureDb();
  const userId = getSessionUserId();
  if (!userId) {
    return null;
  }
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  return sanitizeUser(user);
};

export const signIn = async ({ email, password }) => {
  await ensureDb();
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

export const updateCurrentUser = async (updates) => {
  const current = getSignedInUser();
  if (!current) {
    return null;
  }

  let updated = null;
  await updateDb((db) => {
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
