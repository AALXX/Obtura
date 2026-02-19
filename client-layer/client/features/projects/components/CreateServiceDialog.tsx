'use client'
import React, { useState } from 'react'
import { 
    Database, 
    HardDrive, 
    Layers, 
    MessageSquare, 
    X, 
    ChevronRight, 
    ChevronLeft, 
    CheckCircle2, 
    Settings, 
    Server,
    Shield,
    Clock,
    Cpu,
    MemoryStick,
    Network,
    Lock,
    AlertCircle,
    Loader2,
    Box,
    Cloud,
    Container,
    Boxes,
    Globe,
    Zap,
    FolderOpen
} from 'lucide-react'

interface ServiceOption {
    id: string
    name: string
    description: string
    icon: React.ElementType
    color: string
    bgColor: string
    versions: string[]
    defaultVersion: string
    features: string[]
}

const serviceOptions: ServiceOption[] = [
    {
        id: 'database',
        name: 'Database',
        description: 'Managed database service (PostgreSQL, MySQL, MongoDB)',
        icon: Database,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
        versions: ['PostgreSQL 16', 'PostgreSQL 15', 'MySQL 8.0', 'MongoDB 7.0'],
        defaultVersion: 'PostgreSQL 16',
        features: ['Multiple engines', 'Automated backups', 'High availability', 'Monitoring']
    },
    {
        id: 'linux-vps',
        name: 'Linux VPS',
        description: 'Virtual private server with full root access',
        icon: Server,
        color: 'text-indigo-500',
        bgColor: 'bg-indigo-500/10',
        versions: ['Ubuntu 24.04', 'Ubuntu 22.04', 'Debian 12', 'CentOS 9', 'AlmaLinux 9'],
        defaultVersion: 'Ubuntu 24.04',
        features: ['Full root access', 'Dedicated resources', 'SSH access', 'Custom images']
    },
    {
        id: 'container',
        name: 'Container Instance',
        description: 'Run containerized applications without managing servers',
        icon: Container,
        color: 'text-cyan-500',
        bgColor: 'bg-cyan-500/10',
        versions: ['Docker Runtime', 'containerd', 'gVisor'],
        defaultVersion: 'Docker Runtime',
        features: ['Serverless containers', 'Auto-scaling', 'Pay per use', 'Fast startup']
    },
    {
        id: 'kubernetes',
        name: 'Kubernetes Cluster',
        description: 'Managed Kubernetes for container orchestration',
        icon: Boxes,
        color: 'text-blue-400',
        bgColor: 'bg-blue-400/10',
        versions: ['1.29', '1.28', '1.27'],
        defaultVersion: '1.29',
        features: ['Auto-scaling', 'Load balancing', 'Self-healing', 'Rolling updates']
    },
    {
        id: 'object-storage',
        name: 'Object Storage',
        description: 'Scalable S3-compatible storage for files and assets',
        icon: FolderOpen,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
        versions: ['Standard', 'Infrequent Access', 'Archive'],
        defaultVersion: 'Standard',
        features: ['S3 compatible', '99.999% durability', 'CDN integration', 'Lifecycle policies']
    },
    {
        id: 'load-balancer',
        name: 'Load Balancer',
        description: 'Distribute traffic across multiple instances',
        icon: Network,
        color: 'text-teal-500',
        bgColor: 'bg-teal-500/10',
        versions: ['Layer 4 (TCP/UDP)', 'Layer 7 (HTTP/HTTPS)'],
        defaultVersion: 'Layer 7 (HTTP/HTTPS)',
        features: ['SSL termination', 'Health checks', 'Sticky sessions', 'DDoS protection']
    },
    {
        id: 'serverless',
        name: 'Serverless Functions',
        description: 'Run code without provisioning or managing servers',
        icon: Zap,
        color: 'text-orange-400',
        bgColor: 'bg-orange-400/10',
        versions: ['Node.js 20', 'Node.js 18', 'Python 3.12', 'Python 3.11', 'Go 1.21'],
        defaultVersion: 'Node.js 20',
        features: ['Event-driven', 'Auto-scaling', 'Pay per execution', 'Quick deployment']
    },
    {
        id: 'redis',
        name: 'Redis',
        description: 'In-memory data structure store',
        icon: Database,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10',
        versions: ['7.2', '7.0', '6.2'],
        defaultVersion: '7.2',
        features: ['Key-value store', 'Pub/Sub', 'Caching', 'Persistence']
    },
    {
        id: 'volume',
        name: 'Persistent Volume',
        description: 'Block storage for your applications',
        icon: HardDrive,
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/10',
        versions: ['SSD', 'Standard'],
        defaultVersion: 'SSD',
        features: ['Durable storage', 'Snapshots', 'Encryption', 'High IOPS']
    },
    {
        id: 'rabbitmq',
        name: 'RabbitMQ',
        description: 'Reliable message broker for distributed systems',
        icon: MessageSquare,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        versions: ['3.13', '3.12', '3.11'],
        defaultVersion: '3.13',
        features: ['AMQP protocol', 'Message routing', 'Clustering', 'Management UI']
    }
]

interface CreateServiceDialogProps {
    projectId: string
    accessToken: string
    onClose: () => void
    onServiceCreated?: (service: any) => void
}

type WizardStep = 'select' | 'configure' | 'db-type' | 'review' | 'creating'

type DatabaseType = 'postgres' | 'mysql' | 'mongodb'

interface DBTypeOption {
    id: DatabaseType
    name: string
    description: string
    versions: string[]
}

const dbTypeOptions: DBTypeOption[] = [
    {
        id: 'postgres',
        name: 'PostgreSQL',
        description: 'Powerful open-source relational database with JSON support',
        versions: ['16', '15', '14', '13']
    },
    {
        id: 'mysql',
        name: 'MySQL',
        description: 'Popular relational database management system',
        versions: ['8.0', '5.7']
    },
    {
        id: 'mongodb',
        name: 'MongoDB',
        description: 'Document-oriented NoSQL database for flexible schemas',
        versions: ['7.0', '6.0', '5.0']
    }
]

const CreateServiceDialog: React.FC<CreateServiceDialogProps> = ({ 
    projectId, 
    accessToken, 
    onClose, 
    onServiceCreated 
}) => {
    const [currentStep, setCurrentStep] = useState<WizardStep>('select')
    const [selectedService, setSelectedService] = useState<ServiceOption | null>(null)
    const [selectedDBType, setSelectedDBType] = useState<DBTypeOption | null>(null)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)

    // Configuration state
    const [config, setConfig] = useState({
        name: '',
        version: '',
        size: 'small', // small, medium, large
        storage: 10, // GB
        replicas: 1,
        backupEnabled: true,
        encryptionEnabled: true,
        publicAccess: false,
        customConfig: ''
    })

    const handleServiceSelect = (service: ServiceOption) => {
        setSelectedService(service)
        setConfig(prev => ({
            ...prev,
            name: `${service.id}-${Math.random().toString(36).substring(2, 8)}`,
            version: service.defaultVersion,
            size: 'small',
            storage: service.id === 'volume' || service.id === 'object-storage' ? 100 : 
                     service.id === 'linux-vps' || service.id === 'container' ? 25 : 10
        }))
        
        // If database service selected, go to DB type selection first
        if (service.id === 'database') {
            setCurrentStep('db-type')
        } else {
            setCurrentStep('configure')
        }
    }

    const handleDBTypeSelect = (dbType: DBTypeOption) => {
        setSelectedDBType(dbType)
        setConfig(prev => ({
            ...prev,
            version: dbType.versions[0]
        }))
        setCurrentStep('configure')
    }

    const handleNext = () => {
        if (currentStep === 'configure') {
            setCurrentStep('review')
        } else if (currentStep === 'review') {
            handleCreate()
        }
    }

    const handleBack = () => {
        if (currentStep === 'configure') {
            // If coming from DB type selection, go back there
            if (selectedService?.id === 'database') {
                setCurrentStep('db-type')
            } else {
                setCurrentStep('select')
                setSelectedService(null)
            }
        } else if (currentStep === 'db-type') {
            setCurrentStep('select')
            setSelectedService(null)
        } else if (currentStep === 'review') {
            setCurrentStep('configure')
        }
    }

    const handleCreate = async () => {
        setIsCreating(true)
        setCreateError(null)
        setCurrentStep('creating')

        try {
            // Simulate API call - replace with actual API endpoint
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            const serviceData = {
                id: `${selectedService!.id}-${Date.now()}`,
                type: selectedService!.id,
                name: config.name,
                version: config.version,
                projectId,
                dbType: selectedService!.id === 'database' ? selectedDBType?.id : undefined,
                config: {
                    size: config.size,
                    storage: config.storage,
                    replicas: config.replicas,
                    backupEnabled: config.backupEnabled,
                    encryptionEnabled: config.encryptionEnabled,
                    publicAccess: config.publicAccess,
                    customConfig: config.customConfig
                },
                status: 'provisioning',
                createdAt: new Date().toISOString()
            }

            onServiceCreated?.(serviceData)
            
            // Close after success
            setTimeout(() => {
                onClose()
            }, 1500)
        } catch (error) {
            setCreateError('Failed to create service. Please try again.')
            setCurrentStep('review')
        } finally {
            setIsCreating(false)
        }
    }

    const getSizeSpecs = (size: string, serviceType: string) => {
        // Storage-based services (volumes, object storage)
        if (serviceType === 'volume' || serviceType === 'object-storage') {
            const sizes: Record<string, { cpu: string; memory: string; extra: string; label: string }> = {
                small: { cpu: '-', memory: '-', extra: '3,000 IOPS', label: '100 GB' },
                medium: { cpu: '-', memory: '-', extra: '6,000 IOPS', label: '500 GB' },
                large: { cpu: '-', memory: '-', extra: '16,000 IOPS', label: '2 TB' }
            }
            return sizes[size] || sizes.small
        }
        
        // Linux VPS
        if (serviceType === 'linux-vps') {
            const sizes: Record<string, { cpu: string; memory: string; extra: string; label: string }> = {
                small: { cpu: '1 vCPU', memory: '1 GB', extra: '25 GB SSD', label: 'Basic' },
                medium: { cpu: '2 vCPU', memory: '4 GB', extra: '80 GB SSD', label: 'Standard' },
                large: { cpu: '4 vCPU', memory: '8 GB', extra: '160 GB SSD', label: 'Professional' }
            }
            return sizes[size] || sizes.small
        }
        
        // Container instances
        if (serviceType === 'container') {
            const sizes: Record<string, { cpu: string; memory: string; extra: string; label: string }> = {
                small: { cpu: '0.25 vCPU', memory: '512 MB', extra: '1-10 instances', label: 'Micro' },
                medium: { cpu: '1 vCPU', memory: '2 GB', extra: '1-100 instances', label: 'Standard' },
                large: { cpu: '4 vCPU', memory: '8 GB', extra: '1-500 instances', label: 'Performance' }
            }
            return sizes[size] || sizes.small
        }
        
        // Kubernetes
        if (serviceType === 'kubernetes') {
            const sizes: Record<string, { cpu: string; memory: string; extra: string; label: string }> = {
                small: { cpu: '2 vCPU', memory: '4 GB', extra: '1-3 nodes', label: 'Starter' },
                medium: { cpu: '4 vCPU', memory: '16 GB', extra: '3-10 nodes', label: 'Business' },
                large: { cpu: '8 vCPU', memory: '32 GB', extra: '10-100 nodes', label: 'Enterprise' }
            }
            return sizes[size] || sizes.small
        }
        
        // Load balancer
        if (serviceType === 'load-balancer') {
            const sizes: Record<string, { cpu: string; memory: string; extra: string; label: string }> = {
                small: { cpu: '-', memory: '-', extra: '1,000 RPS', label: 'Small' },
                medium: { cpu: '-', memory: '-', extra: '10,000 RPS', label: 'Medium' },
                large: { cpu: '-', memory: '-', extra: '100,000 RPS', label: 'Large' }
            }
            return sizes[size] || sizes.small
        }
        
        // Serverless functions
        if (serviceType === 'serverless') {
            const sizes: Record<string, { cpu: string; memory: string; extra: string; label: string }> = {
                small: { cpu: '0.1 vCPU', memory: '128 MB', extra: '1M executions', label: 'Nano' },
                medium: { cpu: '0.5 vCPU', memory: '512 MB', extra: '10M executions', label: 'Standard' },
                large: { cpu: '1 vCPU', memory: '2 GB', extra: '100M executions', label: 'Performance' }
            }
            return sizes[size] || sizes.small
        }
        
        // Default for databases and other services
        const sizes: Record<string, { cpu: string; memory: string; extra: string; label: string }> = {
            small: { cpu: '0.5 vCPU', memory: '512 MB', extra: '100 connections', label: 'Small' },
            medium: { cpu: '1 vCPU', memory: '1 GB', extra: '500 connections', label: 'Medium' },
            large: { cpu: '2 vCPU', memory: '2 GB', extra: '1000 connections', label: 'Large' }
        }
        return sizes[size] || sizes.small
    }

    const renderStepIndicator = () => {
        const baseSteps = [
            { id: 'select', label: 'Select Service' },
            { id: 'configure', label: 'Configure' },
            { id: 'review', label: 'Review' }
        ]
        
        // Insert db-type step if database service is selected
        const steps = selectedService?.id === 'database' 
            ? [
                { id: 'select', label: 'Select Service' },
                { id: 'db-type', label: 'Database Type' },
                { id: 'configure', label: 'Configure' },
                { id: 'review', label: 'Review' }
              ]
            : baseSteps

        return (
            <div className="mb-8 flex items-center justify-center">
                {steps.map((step, idx) => {
                    const isActive = currentStep === step.id
                    const stepIndex = steps.findIndex(s => s.id === step.id)
                    const currentIndex = steps.findIndex(s => s.id === currentStep)
                    const isCompleted = currentIndex > stepIndex || currentStep === 'creating'
                    
                    return (
                        <React.Fragment key={step.id}>
                            <div className={`flex items-center gap-2 ${isActive ? 'text-white' : isCompleted ? 'text-green-500' : 'text-zinc-500'}`}>
                                <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium ${
                                    isActive ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 
                                    isCompleted ? 'border-green-500 bg-green-500/10' : 
                                    'border-zinc-700 bg-zinc-900 text-zinc-500'
                                }`}>
                                    {isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                                </div>
                                <span className="text-sm font-medium hidden sm:block">{step.label}</span>
                            </div>
                            {idx < steps.length - 1 && (
                                <div className={`mx-4 h-0.5 w-16 ${isCompleted ? 'bg-green-500' : 'bg-zinc-800'}`} />
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
        )
    }

    const renderServiceSelection = () => (
        <div className="space-y-6">
            <div>
                <h3 className="mb-2 text-lg font-semibold">Select a Service Type</h3>
                <p className="text-sm text-zinc-400">Choose the service you want to add to your project</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {serviceOptions.map((service) => {
                    const Icon = service.icon
                    return (
                        <button
                            key={service.id}
                            onClick={() => handleServiceSelect(service)}
                            className="group relative flex flex-col items-start gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-left transition-all hover:border-zinc-700 hover:bg-zinc-900"
                        >
                            <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${service.bgColor}`}>
                                <Icon className={service.color} size={24} />
                            </div>
                            <div className="flex-1">
                                <h4 className="font-semibold text-white group-hover:text-zinc-200">{service.name}</h4>
                                <p className="mt-1 text-sm text-zinc-400">{service.description}</p>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {service.features.slice(0, 2).map((feature, idx) => (
                                        <span key={idx} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                            {feature}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" size={20} />
                        </button>
                    )
                })}
            </div>
        </div>
    )

    const renderDBTypeSelection = () => (
        <div className="space-y-6">
            <div>
                <h3 className="mb-2 text-lg font-semibold">Select Database Type</h3>
                <p className="text-sm text-zinc-400">Choose the database engine for your service</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {dbTypeOptions.map((dbType) => (
                    <button
                        key={dbType.id}
                        onClick={() => handleDBTypeSelect(dbType)}
                        className="group relative flex flex-col items-start gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-left transition-all hover:border-zinc-700 hover:bg-zinc-900"
                    >
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                            <Database className="text-blue-500" size={24} />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-white group-hover:text-zinc-200">{dbType.name}</h4>
                            <p className="mt-1 text-sm text-zinc-400">{dbType.description}</p>
                            <div className="mt-3 text-xs text-zinc-500">
                                Versions: {dbType.versions.join(', ')}
                            </div>
                        </div>
                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" size={20} />
                    </button>
                ))}
            </div>
        </div>
    )

    const renderConfiguration = () => {
        if (!selectedService) return null

        // Determine available versions based on service type and DB type
        let availableVersions = selectedService.versions
        if (selectedService.id === 'database' && selectedDBType) {
            availableVersions = selectedDBType.versions.map(v => `${selectedDBType.name} ${v}`)
        }

        return (
            <div className="space-y-6">
                <div>
                    <h3 className="mb-2 text-lg font-semibold">
                        Configure {selectedService.id === 'database' && selectedDBType ? selectedDBType.name : selectedService.name}
                    </h3>
                    <p className="text-sm text-zinc-400">Customize your service settings</p>
                </div>

                {/* Database Type Badge */}
                {selectedService.id === 'database' && selectedDBType && (
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                        <div className="flex items-center gap-2">
                            <Database className="text-blue-400" size={20} />
                            <span className="text-sm font-medium text-blue-400">{selectedDBType.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-blue-300/80">{selectedDBType.description}</p>
                    </div>
                )}

                {/* Service Name */}
                <div>
                    <label className="mb-2 block text-sm font-medium">Service Name</label>
                    <input
                        type="text"
                        value={config.name}
                        onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                        placeholder="Enter service name"
                    />
                </div>

                {/* Version */}
                <div>
                    <label className="mb-2 block text-sm font-medium">Version</label>
                    <select
                        value={config.version}
                        onChange={(e) => setConfig(prev => ({ ...prev, version: e.target.value }))}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                        {availableVersions.map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                </div>

                {/* Size Selection */}
                <div>
                    <label className="mb-3 block text-sm font-medium">Plan</label>
                    <div className="grid grid-cols-3 gap-3">
                        {['small', 'medium', 'large'].map((size) => {
                            const sizeSpecs = getSizeSpecs(size, selectedService.id)
                            return (
                                <button
                                    key={size}
                                    onClick={() => setConfig(prev => ({ ...prev, size }))}
                                    className={`rounded-lg border p-4 text-left transition-all ${
                                        config.size === size 
                                            ? 'border-blue-500 bg-blue-500/10' 
                                            : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                                    }`}
                                >
                                    <div className="text-sm font-medium capitalize">{sizeSpecs.label}</div>
                                    {selectedService.id !== 'volume' ? (
                                        <>
                                            <div className="mt-1 text-xs text-zinc-400">{sizeSpecs.cpu}</div>
                                            <div className="text-xs text-zinc-400">{sizeSpecs.memory}</div>
                                        </>
                                    ) : (
                                        <div className="mt-1 text-xs text-zinc-400">{sizeSpecs.extra}</div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Storage for services that support it */}
                {selectedService.id !== 'redis' && selectedService.id !== 'load-balancer' && selectedService.id !== 'serverless' && (
                    <div>
                        <label className="mb-2 block text-sm font-medium">
                            Storage (GB)
                        </label>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min={selectedService.id === 'volume' || selectedService.id === 'object-storage' ? 100 : 
                                     selectedService.id === 'linux-vps' || selectedService.id === 'container' ? 25 : 10}
                                max={selectedService.id === 'volume' || selectedService.id === 'object-storage' ? 2048 : 
                                     selectedService.id === 'linux-vps' ? 500 : 
                                     selectedService.id === 'container' ? 100 : 500}
                                step={selectedService.id === 'volume' || selectedService.id === 'object-storage' ? 100 : 
                                      selectedService.id === 'linux-vps' || selectedService.id === 'container' ? 25 : 10}
                                value={config.storage}
                                onChange={(e) => setConfig(prev => ({ ...prev, storage: parseInt(e.target.value) }))}
                                className="flex-1 accent-blue-500"
                            />
                            <span className="w-20 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-center text-sm">
                                {config.storage} GB
                            </span>
                        </div>
                    </div>
                )}

                {/* Advanced Options */}
                <div className="border-t border-zinc-800 pt-6">
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex w-full items-center justify-between text-sm font-medium text-zinc-300 hover:text-white"
                    >
                        <div className="flex items-center gap-2">
                            <Settings size={16} />
                            Advanced Options
                        </div>
                        <div className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</div>
                    </button>

                    {showAdvanced && (
                        <div className="mt-4 space-y-4">
                            {/* Replicas - only for services that support it */}
                            {selectedService.id !== 'volume' && selectedService.id !== 'object-storage' && 
                             selectedService.id !== 'linux-vps' && selectedService.id !== 'load-balancer' && 
                             selectedService.id !== 'serverless' && (
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Replicas</label>
                                    <div className="flex items-center gap-2">
                                        {[1, 2, 3].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => setConfig(prev => ({ ...prev, replicas: num }))}
                                                className={`h-10 w-10 rounded-lg border text-sm font-medium transition-colors ${
                                                    config.replicas === num
                                                        ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                                                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
                                                }`}
                                            >
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mt-1 text-xs text-zinc-500">
                                        {config.replicas === 1 ? 'Single instance - no high availability' : 
                                         config.replicas === 2 ? 'Dual instances - basic failover' : 
                                         'Triple instances - full high availability'}
                                    </p>
                                </div>
                            )}

                            {/* Toggles */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Shield size={16} className="text-zinc-400" />
                                        <div>
                                            <div className="text-sm font-medium">Automated Backups</div>
                                            <div className="text-xs text-zinc-500">Daily backups with 7-day retention</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setConfig(prev => ({ ...prev, backupEnabled: !prev.backupEnabled }))}
                                        className={`relative h-6 w-11 rounded-full transition-colors ${config.backupEnabled ? 'bg-blue-500' : 'bg-zinc-700'}`}
                                    >
                                        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${config.backupEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Lock size={16} className="text-zinc-400" />
                                        <div>
                                            <div className="text-sm font-medium">Encryption at Rest</div>
                                            <div className="text-xs text-zinc-500">AES-256 encryption for data</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setConfig(prev => ({ ...prev, encryptionEnabled: !prev.encryptionEnabled }))}
                                        className={`relative h-6 w-11 rounded-full transition-colors ${config.encryptionEnabled ? 'bg-blue-500' : 'bg-zinc-700'}`}
                                    >
                                        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${config.encryptionEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                {selectedService.id !== 'volume' && selectedService.id !== 'object-storage' && (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Network size={16} className="text-zinc-400" />
                                            <div>
                                                <div className="text-sm font-medium">Public Access</div>
                                                <div className="text-xs text-zinc-500">Allow connections from internet</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setConfig(prev => ({ ...prev, publicAccess: !prev.publicAccess }))}
                                            className={`relative h-6 w-11 rounded-full transition-colors ${config.publicAccess ? 'bg-orange-500' : 'bg-zinc-700'}`}
                                        >
                                            <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${config.publicAccess ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Custom Configuration */}
                            <div>
                                <label className="mb-2 block text-sm font-medium">Custom Configuration (JSON)</label>
                                <textarea
                                    value={config.customConfig}
                                    onChange={(e) => setConfig(prev => ({ ...prev, customConfig: e.target.value }))}
                                    placeholder='{"max_connections": 200}'
                                    rows={4}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 font-mono text-xs text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                                />
                                <p className="mt-1 text-xs text-zinc-500">Advanced: Override default configuration parameters</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    const renderReview = () => {
        if (!selectedService) return null
        const specs = getSizeSpecs(config.size, selectedService.id)
        
        // Determine display name and icon for database type
        const displayName = selectedService.id === 'database' && selectedDBType 
            ? selectedDBType.name 
            : selectedService.name
        const displayVersion = selectedService.id === 'database' && selectedDBType
            ? config.version
            : config.version

        // Determine which specs to show
        const showComputeSpecs = selectedService.id !== 'volume' && selectedService.id !== 'object-storage' && selectedService.id !== 'load-balancer'
        const showReplicas = selectedService.id !== 'volume' && selectedService.id !== 'object-storage' && 
                             selectedService.id !== 'linux-vps' && selectedService.id !== 'load-balancer' && 
                             selectedService.id !== 'serverless'

        return (
            <div className="space-y-6">
                <div>
                    <h3 className="mb-2 text-lg font-semibold">Review Configuration</h3>
                    <p className="text-sm text-zinc-400">Verify your service configuration before creating</p>
                </div>

                {/* Service Summary Card */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
                    <div className="mb-4 flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${selectedService.bgColor}`}>
                            <selectedService.icon className={selectedService.color} size={24} />
                        </div>
                        <div>
                            <h4 className="text-lg font-semibold">{config.name}</h4>
                            <p className="text-sm text-zinc-400">{displayName} {displayVersion}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="rounded-lg bg-zinc-900 p-3">
                            <div className="text-zinc-500">Plan</div>
                            <div className="font-medium">{specs.label}</div>
                        </div>
                        <div className="rounded-lg bg-zinc-900 p-3">
                            <div className="text-zinc-500">Storage</div>
                            <div className="font-medium">{config.storage} GB</div>
                        </div>
                        {showComputeSpecs && (
                            <>
                                <div className="rounded-lg bg-zinc-900 p-3">
                                    <div className="text-zinc-500">CPU</div>
                                    <div className="font-medium">{specs.cpu}</div>
                                </div>
                                <div className="rounded-lg bg-zinc-900 p-3">
                                    <div className="text-zinc-500">Memory</div>
                                    <div className="font-medium">{specs.memory}</div>
                                </div>
                            </>
                        )}
                        {showReplicas && (
                            <div className="rounded-lg bg-zinc-900 p-3">
                                <div className="text-zinc-500">Replicas</div>
                                <div className="font-medium">{config.replicas}</div>
                            </div>
                        )}
                        {(selectedService.id === 'volume' || selectedService.id === 'object-storage') && (
                            <div className="rounded-lg bg-zinc-900 p-3">
                                <div className="text-zinc-500">IOPS</div>
                                <div className="font-medium">{specs.extra}</div>
                            </div>
                        )}
                        {selectedService.id === 'load-balancer' && (
                            <div className="rounded-lg bg-zinc-900 p-3">
                                <div className="text-zinc-500">Capacity</div>
                                <div className="font-medium">{specs.extra}</div>
                            </div>
                        )}
                    </div>

                    {(showAdvanced || config.backupEnabled || config.encryptionEnabled || config.publicAccess) && (
                        <div className="mt-4 border-t border-zinc-800 pt-4">
                            <div className="text-sm font-medium mb-2">Advanced Settings</div>
                            <div className="flex flex-wrap gap-2">
                                {config.backupEnabled && (
                                    <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400">
                                        <Shield size={12} className="inline mr-1" />
                                        Backups enabled
                                    </span>
                                )}
                                {config.encryptionEnabled && (
                                    <span className="rounded-full bg-green-500/10 px-2.5 py-1 text-xs text-green-400">
                                        <Lock size={12} className="inline mr-1" />
                                        Encrypted
                                    </span>
                                )}
                                {config.publicAccess && (
                                    <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-xs text-orange-400">
                                        <Network size={12} className="inline mr-1" />
                                        Public access
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Info Box */}
                <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                    <AlertCircle className="mt-0.5 flex-shrink-0 text-blue-400" size={20} />
                    <div>
                        <div className="text-sm font-medium text-blue-400">Provisioning Time</div>
                        <p className="mt-1 text-xs text-blue-300/80">
                            Your service will be provisioned in approximately 2-3 minutes. 
                            You can monitor the progress in the Services tab.
                        </p>
                    </div>
                </div>

                {createError && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                        <AlertCircle className="mt-0.5 flex-shrink-0 text-red-500" size={20} />
                        <div>
                            <div className="text-sm font-medium text-red-400">Error</div>
                            <p className="mt-1 text-xs text-red-300/80">{createError}</p>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    const renderCreating = () => {
        const creatingName = selectedService?.id === 'database' && selectedDBType 
            ? selectedDBType.name 
            : selectedService?.name
            
        return (
            <div className="flex h-64 flex-col items-center justify-center text-center">
                <div className="mb-6">
                    <div className="relative">
                        <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-500/20 border-t-blue-500" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Box className="text-blue-500" size={24} />
                        </div>
                    </div>
                </div>
                <h3 className="mb-2 text-xl font-semibold">Creating Service...</h3>
                <p className="max-w-sm text-sm text-zinc-400">
                    Setting up your {creatingName} with the specified configuration. 
                    This may take a few moments.
                </p>
            </div>
        )
    }

    return (
        <div className="flex h-full w-full flex-col text-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                        <Layers className="text-blue-500" size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold">Create Service</h2>
                        <p className="text-sm text-zinc-400">Add a new service to your project</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {currentStep !== 'creating' && renderStepIndicator()}
                
                {currentStep === 'select' && renderServiceSelection()}
                {currentStep === 'db-type' && renderDBTypeSelection()}
                {currentStep === 'configure' && renderConfiguration()}
                {currentStep === 'review' && renderReview()}
                {currentStep === 'creating' && renderCreating()}
            </div>

            {/* Footer */}
            {currentStep !== 'creating' && (
                <div className="flex items-center justify-between border-t border-zinc-800 p-6">
                    <button
                        onClick={currentStep === 'select' ? onClose : handleBack}
                        className="flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-900"
                    >
                        {currentStep !== 'select' && <ChevronLeft size={18} />}
                        {currentStep === 'select' ? 'Cancel' : 'Back'}
                    </button>

                    {currentStep !== 'select' && (
                        <button
                            onClick={handleNext}
                            disabled={!config.name.trim() || isCreating}
                            className="flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isCreating ? (
                                <>
                                    <Loader2 className="animate-spin" size={18} />
                                    Creating...
                                </>
                            ) : currentStep === 'review' ? (
                                <>
                                    <CheckCircle2 size={18} />
                                    Create Service
                                </>
                            ) : (
                                <>
                                    Next
                                    <ChevronRight size={18} />
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

export default CreateServiceDialog
