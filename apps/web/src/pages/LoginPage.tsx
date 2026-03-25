import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthForm } from '../components/AuthForm';
import { authApi } from '../lib/api';
import { useAuthStore } from '../store/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (values: Record<string, string>) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authApi.login({
        email: values.email,
        password: values.password,
      });

      setAuth(response.data.accessToken, response.data.user);
      navigate('/library', { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthForm
      title="Sign in to Reader"
      fields={[
        {
          name: 'email',
          label: 'Email address',
          type: 'email',
          placeholder: 'you@example.com',
          required: true,
        },
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          placeholder: '••••••••',
          required: true,
        },
      ]}
      submitLabel="Sign in"
      onSubmit={handleSubmit}
      isLoading={isLoading}
      error={error}
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-blue-600 hover:underline font-medium">
            Create one
          </Link>
        </>
      }
    />
  );
}
