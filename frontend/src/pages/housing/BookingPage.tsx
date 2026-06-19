import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { housingService } from '../../services/housingService';

const BookingPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [property, setProperty] = useState<any>(null);
    const [bookingData, setBookingData] = useState({
        startDate: '',
        endDate: '',
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (id) fetchProperty();
    }, [id]);

    const fetchProperty = async () => {
        try {
            const res = await housingService.getPropertyById(id!);
            setProperty(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleBooking = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const userId = localStorage.getItem('userId') || 'mock-user-id'; // Fallback for dev
            await housingService.createBooking({
                propertyId: id,
                tenantId: userId,
                startDate: bookingData.startDate,
                endDate: bookingData.endDate,
                totalAmount: property.pricePerMonth, // Simple logic for now
            });
            alert('Booking request sent! Redirecting to dashboard...');
            navigate('/student-dashboard');
        } catch (err) {
            console.error(err);
            alert('Failed to create booking.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!property) return <div className="p-6">Loading booking options...</div>;

    return (
        <div className="p-6 max-w-xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Complete Your Booking</h1>
            <div className="bg-white p-6 rounded-xl shadow-md">
                <div className="flex items-center gap-4 mb-6 border-b pb-6">
                    <img src={property.images[0] || 'https://via.placeholder.com/100'} className="w-20 h-20 object-cover rounded" alt="" />
                    <div>
                        <h2 className="text-lg font-semibold">{property.title}</h2>
                        <p className="text-gray-500">{property.city}</p>
                    </div>
                </div>

                <form onSubmit={handleBooking} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Move-in Date</label>
                        <input
                            type="date"
                            required
                            className="w-full border p-3 rounded-lg"
                            value={bookingData.startDate}
                            onChange={(e) => setBookingData({ ...bookingData, startDate: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Move-out Date</label>
                        <input
                            type="date"
                            required
                            className="w-full border p-3 rounded-lg"
                            value={bookingData.endDate}
                            onChange={(e) => setBookingData({ ...bookingData, endDate: e.target.value })}
                        />
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg my-6">
                        <div className="flex justify-between mb-2">
                            <span>Monthly Rent</span>
                            <span>${property.pricePerMonth}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg border-t pt-2">
                            <span>Total to Pay (Escrow)</span>
                            <span>${property.pricePerMonth}</span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className={`w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg transition-colors ${submitting ? 'opacity-50' : 'hover:bg-indigo-700'}`}
                    >
                        {submitting ? 'Processing...' : 'Proceed to Payment & Escrow'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default BookingPage;
