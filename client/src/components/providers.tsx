'use client';

import { ApolloProvider } from '@apollo/client/react';
import { apolloClient, getToken, getTokenKey } from '@/lib/apollo';
import { useEffect } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const interval = setInterval(() => {
      const token = getToken();
      if (!token) return;
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 <= Date.now()) {
          localStorage.removeItem(getTokenKey());
          localStorage.removeItem('db_mobile_userId');
          window.location.reload();
        }
      } catch (e) {}
    }, 60000); // Check every minute
    
    // Also run an immediate check on mount
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 <= Date.now()) {
          localStorage.removeItem(getTokenKey());
          localStorage.removeItem('db_mobile_userId');
          window.location.reload();
        }
      } catch (e) {}
    }

    return () => clearInterval(interval);
  }, []);

  return <ApolloProvider client={apolloClient}>{children}</ApolloProvider>;
}
