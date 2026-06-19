import API from './api';

export const housingService = {
    // Properties
    getProperties: (params?: any) => API.get('/properties', { params }),
    getPropertyById: (id: string) => API.get(`/properties/${id}`),
    createProperty: (data: any) => API.post('/properties', data),

    // Bookings
    createBooking: (data: any) => API.post('/bookings', data),
    getTenantBookings: (tenantId: string) => API.get(`/bookings/tenant/${tenantId}`),
    updateBookingStatus: (id: string, status: string) => API.patch(`/bookings/${id}/status`, { status }),

    // Marketplace
    getMarketplaceItems: () => API.get('/marketplace'),
    createMarketplaceItem: (data: any) => API.post('/marketplace', data),
};
