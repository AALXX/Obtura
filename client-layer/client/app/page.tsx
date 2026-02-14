import { auth } from '@/features/account/auth/auth'
import Landing from '@/features/landing/LandingPage'
import React from 'react'

const Page = async () => {
    const session = await auth()

    return (
        <>
            <Landing session={session} />
        </>
    )
}

export default Page
