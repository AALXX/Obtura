import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Meta from '@/meta/Meta'
import NavBar from '@/features/navbar/Navbar'
import { SessionProvider } from 'next-auth/react'

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin']
})

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin']
})

export default function RootLayout({
    children
}: Readonly<{
    children: React.ReactNode
}>) {
    const title = 'Obtura'
    const description = 'Obtura empowers European SMEs to ship software 3x faster through an all-in-one platform combining browser-based code editing, Git workflows, one-click deployment, and affordable hosting with EU data residency.'
    const keywords = 'Obtura, cloud development, project management, task management, team collaboration, code management, deployment, SMEs, GDPR-compliant, web apps'

    return (
        <html lang="en">
            <Meta title={title} description={description} keywords={keywords} />
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <SessionProvider>
                    <NavBar />
                </SessionProvider>
                {children}
            </body>
        </html>
    )
}
