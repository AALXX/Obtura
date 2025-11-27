'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAccountStore } from '@/lib/store/accountStore'

const NavBar = () => {
    const { user, authenticated, status, fetchAccount } = useAccountStore()

    useEffect(() => {
        if (status === 'idle') {
            fetchAccount()
        }
    }, [status, fetchAccount])

    return (
        <nav className="bg-navbar-grey flex h-24 w-full grow-0 items-center justify-between border-b-2 px-4">
            <div className="z-20 text-white">
                <h1 className="text-lg font-bold">Obtura</h1>
            </div>

            <div className="flex">
                {authenticated ? <>{user?.name ? <h1 className="text-xl font-bold self-center mr-4">{user.name}</h1> : <h1 className="text-xl font-bold">Loading...</h1>}</> : null}

                <Link href="/account">{authenticated ? <Image className="z-10 h-14 w-14 rounded-full" src={user?.image || `/no_account_icon.svg`} alt="User Avatar" width={48} height={48} /> : <Image className="z-10 h-14 w-14 rounded-full" src={`/no_account_icon.svg`} alt="User Avatar" width={48} height={48} />}</Link>
            </div>
        </nav>
    )
}

export default NavBar
