import { createContext, useContext, useState, ReactNode } from 'react';

export interface User {
    email: string;
    name: string;
    picture: string;
    role: 'owner' | 'manager' | null;
}

interface AuthContextType {
    user: User | null;
    accessToken: string | null;
    login: (userData: User, token: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(() => {
        const saved = localStorage.getItem('shreejee_auth_user');
        return saved ? JSON.parse(saved) : null;
    });

    const [accessToken, setAccessToken] = useState<string | null>(() => {
        return localStorage.getItem('shreejee_auth_token');
    });

    const login = (userData: User, token: string) => {
        setUser(userData);
        setAccessToken(token);
        localStorage.setItem('shreejee_auth_user', JSON.stringify(userData));
        localStorage.setItem('shreejee_auth_token', token);
    };

    const logout = () => {
        setUser(null);
        setAccessToken(null);
        localStorage.removeItem('shreejee_auth_user');
        localStorage.removeItem('shreejee_auth_token');
    };

    return (
        <AuthContext.Provider value={{ user, accessToken, login, logout, isAuthenticated: !!user && !!accessToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
