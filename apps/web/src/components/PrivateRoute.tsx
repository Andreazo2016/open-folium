import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { authApi } from '../lib/api';

function decodeJwtPayload(token: string): { sub: string; name: string; email: string } | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function PrivateRoute() {
  const { isAuthenticated, setAuth } = useAuthStore();
  // Only check on first render when not authenticated
  const [checking, setChecking] = useState(!isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      setChecking(false);
      return;
    }

    // Try to restore session using the httpOnly refresh cookie
    authApi
      .refresh()
      .then((r) => {
        const { accessToken } = r.data;
        const payload = decodeJwtPayload(accessToken);
        if (payload) {
          setAuth(accessToken, {
            id: payload.sub,
            name: payload.name,
            email: payload.email,
          });
        }
      })
      .catch(() => {
        // No valid refresh token — will redirect to login
      })
      .finally(() => {
        setChecking(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
