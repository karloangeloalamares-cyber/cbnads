import * as React from 'react';
import { getSignedInUser } from '@/lib/localAuth';
import { ensureDb, subscribeDb } from '@/lib/localDb';

const useUser = () => {
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState(null);

  const refetch = React.useCallback(() => {
    ensureDb();
    setUser(getSignedInUser());
    setLoading(false);
  }, []);

  React.useEffect(() => {
    refetch();
    const unsubscribe = subscribeDb(() => {
      setUser(getSignedInUser());
    });
    return unsubscribe;
  }, [refetch]);

  return {
    user,
    data: user,
    loading,
    refetch,
  };
};

export { useUser };
export default useUser;
