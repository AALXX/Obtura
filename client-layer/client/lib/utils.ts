import axios from 'axios'
export const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    })
}

export const apiClient = axios.create({
    validateStatus: status => status < 500
})

export const getInitials = (name: string): string => {
    const nameParts = name.trim().split(' ')
    if (nameParts.length === 1) {
        return nameParts[0].charAt(0).toUpperCase()
    }
    return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
}