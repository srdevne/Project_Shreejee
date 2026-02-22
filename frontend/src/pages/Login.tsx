import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { Package, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchConfig } from '../services/googleSheets';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            try {
                setError(null);
                setIsLoading(true);
                const accessToken = tokenResponse.access_token;

                // 1. Fetch user profile from google
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });

                if (!res.ok) throw new Error('Failed to fetch Google profile');
                const userInfo = await res.json();

                // 2. Fetch Config from the Google Sheet to verify access
                // Note: For this to work, the sheet must be accessible by this user.
                // If the owner creates the sheet, they must share it with the 'manager' emails.
                const config = await fetchConfig(accessToken);

                const allowedEmailsStr = config['ALLOWED_EMAILS'] || '';
                const allowedEmails = allowedEmailsStr.split(',').map((e: string) => e.trim().toLowerCase());

                if (!allowedEmails.includes(userInfo.email.toLowerCase())) {
                    setError(`Access Denied: ${userInfo.email} is not authorized for this application.`);
                    setIsLoading(false);
                    return;
                }

                // For MVP, we assign owner role to the first email in the allowed list, and manager to others.
                // Or default everyone to owner if there's only one.
                const isPrimaryOwner = allowedEmails.indexOf(userInfo.email.toLowerCase()) === 0;

                login({
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    role: isPrimaryOwner ? 'owner' : 'manager',
                }, accessToken);

                navigate('/');
            } catch (err: any) {
                console.error('Login error:', err);
                if (err.message === 'UNAUTHORIZED') {
                    setError('Could not access the DB Sheet. Ensure you have Edit permissions.');
                } else {
                    setError(err.message || 'An unexpected error occurred during login.');
                }
            } finally {
                setIsLoading(false);
            }
        },
        onError: errorResponse => {
            console.error(errorResponse);
            setError('Google Sign-In was cancelled or failed.');
        },
        // Request full drive spreadhseet scopes so we can read and write to the DB
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'
    });

    return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: 'var(--radius-lg)',
                        backgroundColor: 'var(--color-primary)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: 'white'
                    }}>
                        <Package size={32} />
                    </div>
                </div>

                <h2 style={{ marginBottom: '0.5rem' }}>Shreejee Trading App</h2>
                <p style={{ marginBottom: '2rem' }}>Secure access to your business portal</p>

                {error && (
                    <div style={{
                        backgroundColor: '#FEE2E2', color: 'var(--color-danger)',
                        padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem',
                        display: 'flex', alignItems: 'flex-start', gap: '0.5rem', textAlign: 'left',
                        fontSize: '0.875rem', border: '1px solid #FECACA'
                    }}>
                        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>{error}</span>
                    </div>
                )}

                <button
                    className="btn btn-secondary"
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '0.75rem', opacity: isLoading ? 0.7 : 1 }}
                    onClick={() => handleGoogleLogin()}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <span>Authenticating...</span>
                    ) : (
                        <>
                            <img
                                src="https://www.svgrepo.com/show/475656/google-color.svg"
                                alt="Google Logo"
                                style={{ width: '20px', height: '20px', marginRight: '8px' }}
                            />
                            Sign in with Google
                        </>
                    )}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                    <Lock size={12} />
                    <span>Authorized personnel only</span>
                </div>
            </div>
        </div>
    );
}
