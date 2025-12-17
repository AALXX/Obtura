import {  Zap, TrendingUp, Briefcase, Crown } from 'lucide-react'


export const subscriptionPlans = [
    {
        id: 'starter',
        name: 'Starter',
        price: 79,
        icon: Zap,
        description: 'Perfect for small teams starting with DevOps automation',
        features: ['8 team members', '5 projects', '100 deployments/month', '5 apps', '10 GB storage']
    },
    {
        id: 'team',
        name: 'Team',
        price: 299,
        icon: TrendingUp,
        description: 'For growing teams with multiple projects',
        popular: true,
        features: ['25 team members', '15 projects', '500 deployments/month', '10 apps', '50 GB storage']
    },
    {
        id: 'business',
        name: 'Business',
        price: 799,
        icon: Briefcase,
        description: 'For established SMEs with complex needs',
        features: ['50 team members', '30 projects', '1000 deployments/month', '25 apps', '3 TB storage']
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 2199,
        icon: Crown,
        description: 'Custom limits for large organizations',
        features: ['Unlimited team members', 'Unlimited projects', 'Unlimited deployments', 'Unlimited apps', '5 TB storage']
    }
]
