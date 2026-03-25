import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthForm } from '../components/AuthForm';
import { authApi } from '../lib/api';
import { useAuthStore } from '../store/auth';

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (values: Record<string, string>) => {
    setIsLoading(true);
    setError(null);

    if (values.password !== values.confirmPassword) {
      setError('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    if (values.password.length < 8) {
      setError('Password must be at least 8 characters.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.register({
        name: values.name,
        email: values.email,
        password: values.password,
      });

      setAuth(response.data.accessToken, response.data.user);
      navigate('/library', { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthForm
      title="Create your account"
      fields={[
        {
          name: 'name',
          label: 'Full name',
          type: 'text',
          placeholder: 'Jane Doe',
          required: true,
        },
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
          minLength: 8,
        },
        {
          name: 'confirmPassword',
          label: 'Confirm password',
          type: 'password',
          placeholder: '••••••••',
          required: true,
        },
      ]}
      submitLabel="Create account"
      onSubmit={handleSubmit}
      isLoading={isLoading}
      error={error}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">
            Sign in
          </Link>
        </>
      }
    />
  );
}
