import { NextResponse } from 'next/server'
import axios from 'axios'
import { auth } from '@/features/account/auth/auth'

export async function GET() {
    try {
        const session = await auth()
        if (!session) {
            return NextResponse.json({ name: '', authenticated: false }, { status: 200 })
        }

        console.log(session.backendToken)

        const resp = await axios.get<{ email: string; name: string; accountType: string; error?: string }>(`${process.env.BACKEND_URL}/account-manager/get-account-data/${session.backendToken}`)

        if (resp.data.error) {

            // erase token
            session.backendToken = ''

            return NextResponse.json({ name: '', authenticated: false }, { status: 200 })
        }

        let image = `${process.env.NEXT_PUBLIC_FILE_SERVER}/accounts/no_auth?cache=none`
        // if (resp.data.accountType === 'github') {

        // }

        

        switch (resp.data.accountType) {
            case 'platform':
                image = `${process.env.NEXT_PUBLIC_FILE_SERVER}/accounts/${session.backendToken}?cache=none`
                break
            case 'google':
                image = `${session.user?.image}`
                break
            default:
                image = `${process.env.NEXT_PUBLIC_FILE_SERVER}/accounts/no_auth?cache=none`
                break
        }

        return NextResponse.json({
            name: resp.data.name,
            accountType: resp.data.accountType,
            authenticated: true,
            image: image
        })
    } catch (error) {
        console.error('Account API error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
