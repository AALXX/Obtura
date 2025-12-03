import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import axios from 'axios'

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    prompt: 'consent',
                    access_type: 'offline',
                    response_type: 'code'
                }
            }
        })
    ],
    session: {
        strategy: 'jwt'
    },
    callbacks: {
        async signIn({ user, account, profile }) {
            if (account?.provider === 'google') {
                try {
                    const response = await axios.post<any>(`${process.env.BACKEND_URL}/account-manager/register-account-google`, {
                        idToken: account.id_token,
                        accessToken: account.access_token,
                        user: {
                            email: user.email,
                            name: user.name,
                            image: user.image,
                            googleId: profile?.sub
                        }
                    })

                    if (response.status !== 200) {
                        console.error('Backend authentication failed:', response.data)
                        return false
                    }

                    const data = response.data

                    user.backendToken = data.token
                    user.backendUserId = data.user.id
                    user.expiresAt = data.expiresAt

                    return true
                } catch (error) {
                    console.error('Backend auth error:', error)
                    return false
                }
            }
            return true
        },

        async jwt({ token, user }) {
            if (user) {
                token.backendToken = user.backendToken
                token.backendUserId = user.backendUserId
                token.expiresAt = user.expiresAt
                token.email = user.email
                token.name = user.name
                token.picture = user.image
            }

            if (token.expiresAt && Date.now() > new Date(token.expiresAt as string).getTime()) {
                console.log('Backend token expired, user needs to re-login')
            }

            return token
        },

        async session({ session, token }) {
            if (token.backendToken) {
                session.backendToken = token.backendToken as string
                session.userId = token.backendUserId as string
            }

            return session
        }
    },
    pages: {
        signIn: '/auth/signin',
        error: '/auth/error'
    }
})
