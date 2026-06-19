import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { housingService } from '../../services/housingService';

const PropertyDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [property, setProperty] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) fetchProperty();
    }, [id]);

    const fetchProperty = async () => {
        try {
            const res = await housingService.getPropertyById(id!);
            setProperty(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-6">Loading property details...</div>;
    if (!property) return <div className="p-6">Property not found.</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <Link to="/search" className="text-blue-600 hover:underline mb-4 block">&larr; Back to search</Link>

            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-96">
                    <img src={property.images[0] || 'https://via.placeholder.com/600x400'} className="w-full h-full object-cover" alt={property.title} />
                    <div className="grid grid-cols-2 gap-2">
                        {property.images.slice(1, 5).map((img: string, i: number) => (
                            <img key={i} src={img} className="w-full h-full object-cover rounded" alt="Property" />
                        ))}
                    </div>
                </div>

                <div className="p-8">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h1 className="text-3xl font-bold mb-2">{property.title}</h1>
                            <p className="text-gray-600 text-lg">{property.address}, {property.city}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold text-indigo-600">${property.pricePerMonth}</p>
                            <p className="text-gray-500">per month</p>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-xl font-semibold mb-4">Description</h2>
                        <p className="text-gray-700 leading-relaxed">{property.description}</p>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-xl font-semibold mb-4">Amenities</h2>
                        <div className="flex flex-wrap gap-2">
                            {property.amenities.map((a: string, i: number) => (
                                <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                                    {a}
                                </span>
                            ))}
                            {property.utilitiesIncluded && (
                                <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                                    Utilities Included
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="border-t pt-8">
                        <Link
                            to={`/book/${property._id}`}
                            className="w-full block text-center bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-colors shadow-lg"
                        >
                            Book Now
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PropertyDetailPage;
