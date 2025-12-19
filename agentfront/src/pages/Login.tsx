import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const Login: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Use /api prefix if VITE_BACKEND_URL is not set, to trigger proxy
    const baseUrl = import.meta.env.VITE_BACKEND_URL || '/api';

    try {
      if (isLogin) {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const res = await fetch(`${baseUrl}/token`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Login failed: ${res.status} ${errText}`);
        }
        const data = await res.json();
        login(data.access_token);
      } else {
        const res = await fetch(`${baseUrl}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Registration failed: ${res.status} ${errText}`);
        }
        // Auto login after register
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);
        const loginRes = await fetch(`${baseUrl}/token`, {
            method: 'POST',
            body: formData,
        });
        const data = await loginRes.json();
        login(data.access_token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>{isLogin ? 'Login' : 'Register'}</h2>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>
          <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
        </form>
        <p onClick={() => setIsLogin(!isLogin)} className="toggle-auth">
          {isLogin ? 'Need an account? Register' : 'Have an account? Login'}
        </p>
      </div>
    </div>
  );
};

export default Login;
