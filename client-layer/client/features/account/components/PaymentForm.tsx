import { CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { ArrowRight, Lock, Shield, CreditCard } from 'lucide-react'

interface PaymentFormProps {
    onBack: () => void
    handleFinalSubmit: (paymentMethodId: string) => void
    isLoading: boolean
    setIsLoading: (loading: boolean) => void
    error: string
    setError: (error: string) => void
}

const PaymentForm: React.FC<PaymentFormProps> = ({ onBack, handleFinalSubmit, isLoading, setIsLoading, error, setError }) => {
    const stripe = useStripe()
    const elements = useElements()

    const elementOptions = {
        style: {
            base: {
                fontSize: '16px',
                color: '#ffffff',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                '::placeholder': {
                    color: '#6b7280'
                }
            },
            invalid: {
                color: '#ef4444',
                iconColor: '#ef4444'
            }
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!stripe || !elements) {
            setError('Stripe has not loaded yet. Please try again.')
            return
        }

        setIsLoading(true)
        setError('')

        try {
            const cardElement = elements.getElement(CardNumberElement)

            if (!cardElement) {
                throw new Error('Card element not found')
            }

            // Create payment method from card details
            const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
                type: 'card',
                card: cardElement
            })

            if (pmError) {
                setError(pmError.message || 'Failed to process card details')
                setIsLoading(false)
                return
            }

            if (!paymentMethod) {
                setError('Failed to create payment method')
                setIsLoading(false)
                return
            }

            // Pass the payment method ID to the backend
            await handleFinalSubmit(paymentMethod.id)
        } catch (err: any) {
            console.error('Payment error:', err)
            setError(err.message || 'An unexpected error occurred')
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Card Number */}
            <div>
                <label className="mb-2 block text-sm font-medium text-white">Card Number</label>
                <div className="relative">
                    <div className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">
                        <CreditCard className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-black py-3.5 pr-4 pl-12 transition-colors focus-within:border-neutral-600">
                        <CardNumberElement options={elementOptions} />
                    </div>
                </div>
            </div>

            {/* Expiry and CVC */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="mb-2 block text-sm font-medium text-white">Expiry Date</label>
                    <div className="rounded-lg border border-neutral-800 bg-black px-4 py-3.5 transition-colors focus-within:border-neutral-600">
                        <CardExpiryElement options={elementOptions} />
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-white">CVC</label>
                    <div className="rounded-lg border border-neutral-800 bg-black px-4 py-3.5 transition-colors focus-within:border-neutral-600">
                        <CardCvcElement options={elementOptions} />
                    </div>
                </div>
            </div>

            {/* Security Notice */}
            <div className="rounded-lg border border-blue-900/30 bg-blue-950/20 p-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                        <Shield className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-blue-300">Secure Payment Processing</p>
                        <p className="mt-1 text-xs text-blue-400/80">Your payment information is processed securely through Stripe. We never store your card details.</p>
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="rounded-lg border border-red-800 bg-red-900/20 p-4">
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 pt-2">
                <button type="button" onClick={onBack} disabled={isLoading} className="flex-1 rounded-lg border border-neutral-800 bg-[#1b1b1b] px-6 py-3.5 font-medium text-white transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50">
                    Back
                </button>
                <button type="submit" disabled={isLoading || !stripe} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 font-medium text-black transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
                    <Lock className="h-4 w-4" />
                    {isLoading ? 'Processing...' : 'Complete Payment'}
                    {!isLoading && <ArrowRight className="h-4 w-4" />}
                </button>
            </div>
        </form>
    )
}

export default PaymentForm
