import LoginForm from '@/features/account/auth/LoginForm'
import RegisterForm from '@/features/account/auth/RegisterForm'

type Props = {
    searchParams: { mode?: 'login' | 'register' }
}

const AuthPage = async ({ searchParams }: Props) => {
    const { mode } = await searchParams
    const isLogin = mode !== 'register'

    return (
        <div className="flex justify-center px-4 sm:px-0 g">
            <div className="mt-16  w-full max-w-sm sm:max-w-md md:block h-full">
                <div className="mb-6 text-center ">
                    <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">Obtura</h1>
                    <p className="text-xs text-gray-400 sm:text-sm">{isLogin ? 'Sign in to your account' : 'Create your company account'}</p>
                </div>

                <div className="rounded-lg bg-[#1b1b1b] p-6 sm:p-8 ">{isLogin ? <LoginForm /> : <RegisterForm />}</div>
            </div>
        </div>
    )
}

export default AuthPage
