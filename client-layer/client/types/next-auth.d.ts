import NextAuth, { DefaultSession } from 'next-auth'

declare module 'next-auth' {
    interface Session {
        backendToken?: string
        userId?: string
        user: {
            id?: string
        } & DefaultSession['user']
    }

    interface User {
        backendToken?: string
        backendUserId?: string
        expiresAt?: string
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        backendToken?: string
        backendUserId?: string
        expiresAt?: string
    }
}
