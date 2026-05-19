import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const login = useAuthStore(state => state.login);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        login(data.user, data.token);
        navigate('/app/dashboard');
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setError('Cannot connect to server. Is backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'radial-gradient(circle at top right, rgba(0,255,136,0.05), transparent 400px)'
    }}>
      <div className="glass-panel animate-fade-in" style={{ padding: '50px', borderRadius: 'var(--radius-xl)', width: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ color: 'var(--c-accent)', textShadow: 'var(--shadow-neon)', margin: 0 }}>DSM-QMS</h1>
          <p style={{ color: 'var(--c-text-muted)' }}>Secure Authentication Portal</p>
        </div>
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{ padding: '12px', background: 'var(--c-danger-muted)', color: 'var(--c-danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', textAlign: 'center' }}>
              {error}
            </div>
          )}
          
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--c-text-secondary)' }}>Username (ID)</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="glass"
              style={{ 
                width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', 
                color: 'var(--c-text-primary)', outline: 'none', border: '1px solid var(--c-border)'
              }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--c-text-secondary)' }}>PIN / Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="glass"
              style={{ 
                width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', 
                color: 'var(--c-text-primary)', outline: 'none', border: '1px solid var(--c-border)'
              }}
            />
          </div>
          
          <button 
            type="submit"
            disabled={loading}
            style={{ 
              width: '100%', padding: '14px', background: 'var(--c-accent)', 
              color: '#000', border: 'none', borderRadius: 'var(--radius-md)', 
              fontWeight: 600, marginTop: '10px', boxShadow: 'var(--shadow-neon)',
              opacity: loading ? 0.7 : 1
            }}>
            {loading ? 'Authenticating...' : 'Access Terminal'}
          </button>
        </form>
      </div>
    </div>
  );
};
